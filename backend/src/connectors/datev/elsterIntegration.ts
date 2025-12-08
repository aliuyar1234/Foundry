/**
 * DATEV ELSTER Integration
 * Task: T137
 *
 * Handles ELSTER electronic tax filing integration.
 * Generates UStVA (VAT advance return) and other tax declarations.
 */

import { DatevClient, DatevJournalEntry } from './datevClient';
import { DatevTaxCodeHandler, TaxCode, GERMAN_TAX_CODES } from './extractors/taxCodes';

export interface ElsterDeclaration {
  type: 'UStVA' | 'USt' | 'EÜR' | 'GewSt' | 'KSt';
  period: string;
  year: number;
  month?: number;
  quarter?: number;
  taxNumber: string;
  companyName: string;
  submissionDate?: Date;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  data: Record<string, number>;
  elsterTicket?: string;
}

export interface UStVAData {
  // Revenue fields (Umsätze)
  kz81: number;  // Revenue 19%
  kz86: number;  // Revenue 7%
  kz35: number;  // Revenue 16% (COVID)
  kz36: number;  // Revenue 5% (COVID)
  kz43: number;  // Tax-free export revenue
  kz41: number;  // Intra-community deliveries
  kz44: number;  // Reverse charge revenue
  kz48: number;  // Other tax-free revenue
  kz49: number;  // Tax-free small business

  // Intra-community acquisitions
  kz89: number;  // Intra-community acquisitions 19%
  kz93: number;  // Intra-community acquisitions 7%

  // Reverse charge (§13b)
  kz84: number;  // Reverse charge services

  // Tax amounts
  kz66: number;  // Input VAT 19%
  kz67: number;  // Input VAT 7%
  kz61: number;  // Input VAT from intra-community acquisitions
  kz62: number;  // Input VAT from reverse charge
  kz63: number;  // Other input VAT
  kz64: number;  // Input VAT correction

  // Calculated fields
  kz83: number;  // Total output VAT
  kz65: number;  // Total input VAT
  kz39: number;  // Remaining VAT advance payment
}

export interface ElsterSubmissionResult {
  success: boolean;
  elsterTicket?: string;
  transferTicket?: string;
  errorCode?: string;
  errorMessage?: string;
  warnings?: string[];
}

export class DatevElsterIntegration {
  private client: DatevClient;
  private taxHandler: DatevTaxCodeHandler;

  constructor(client: DatevClient) {
    this.client = client;
    this.taxHandler = new DatevTaxCodeHandler(client);
  }

  /**
   * Generate UStVA (VAT advance return) data
   */
  async generateUStVA(options: {
    year: number;
    month?: number;
    quarter?: number;
    taxNumber: string;
    companyName: string;
  }): Promise<ElsterDeclaration> {
    // Calculate period dates
    let dateFrom: Date;
    let dateTo: Date;
    let period: string;

    if (options.month) {
      dateFrom = new Date(options.year, options.month - 1, 1);
      dateTo = new Date(options.year, options.month, 0);
      period = `${options.year}-${String(options.month).padStart(2, '0')}`;
    } else if (options.quarter) {
      const startMonth = (options.quarter - 1) * 3;
      dateFrom = new Date(options.year, startMonth, 1);
      dateTo = new Date(options.year, startMonth + 3, 0);
      period = `${options.year}-Q${options.quarter}`;
    } else {
      throw new Error('Either month or quarter must be specified');
    }

    // Initialize UStVA data
    const ustva: UStVAData = {
      kz81: 0, kz86: 0, kz35: 0, kz36: 0, kz43: 0, kz41: 0, kz44: 0, kz48: 0, kz49: 0,
      kz89: 0, kz93: 0, kz84: 0,
      kz66: 0, kz67: 0, kz61: 0, kz62: 0, kz63: 0, kz64: 0,
      kz83: 0, kz65: 0, kz39: 0,
    };

    try {
      // Get journal entries for the period
      const entries = await this.client.getAllJournalEntries({
        dateFrom,
        dateTo,
      });

      // Process entries
      for (const entry of entries) {
        this.processEntryForUStVA(entry, ustva);
      }

      // Calculate totals
      this.calculateUStVATotals(ustva);
    } catch (error) {
      console.warn('Failed to generate UStVA data:', error);
    }

    return {
      type: 'UStVA',
      period,
      year: options.year,
      month: options.month,
      quarter: options.quarter,
      taxNumber: options.taxNumber,
      companyName: options.companyName,
      status: 'draft',
      data: ustva as unknown as Record<string, number>,
    };
  }

  /**
   * Process journal entry for UStVA
   */
  private processEntryForUStVA(entry: DatevJournalEntry, ustva: UStVAData): void {
    if (!entry.taxCode) return;

    const taxCode = this.taxHandler.getTaxCode(entry.taxCode);
    if (!taxCode) return;

    const amount = Math.abs(entry.amount);
    const taxInfo = this.taxHandler.extractTax(amount, entry.taxCode);

    switch (taxCode.elsterCode) {
      // Output VAT
      case '81':
        ustva.kz81 += taxInfo.netAmount;
        break;
      case '86':
        ustva.kz86 += taxInfo.netAmount;
        break;
      case '35':
        ustva.kz35 += taxInfo.netAmount;
        break;
      case '36':
        ustva.kz36 += taxInfo.netAmount;
        break;
      case '43':
        ustva.kz43 += taxInfo.netAmount;
        break;
      case '41':
        ustva.kz41 += taxInfo.netAmount;
        break;
      case '48':
        ustva.kz48 += taxInfo.netAmount;
        break;

      // Input VAT
      case '66':
        ustva.kz66 += taxInfo.taxAmount;
        break;
      case '67':
        ustva.kz67 += taxInfo.taxAmount;
        break;

      // Intra-community
      case '89':
        ustva.kz89 += taxInfo.netAmount;
        ustva.kz61 += taxInfo.taxAmount;
        break;
      case '93':
        ustva.kz93 += taxInfo.netAmount;
        break;

      // Reverse charge
      case '84':
        ustva.kz84 += taxInfo.netAmount;
        ustva.kz62 += taxInfo.taxAmount;
        break;
    }
  }

  /**
   * Calculate UStVA totals
   */
  private calculateUStVATotals(ustva: UStVAData): void {
    // Calculate output VAT
    const outputTax19 = Math.round(ustva.kz81 * 0.19 * 100) / 100;
    const outputTax7 = Math.round(ustva.kz86 * 0.07 * 100) / 100;
    const outputTax16 = Math.round(ustva.kz35 * 0.16 * 100) / 100;
    const outputTax5 = Math.round(ustva.kz36 * 0.05 * 100) / 100;
    const icaTax = Math.round(ustva.kz89 * 0.19 * 100) / 100;
    const rcTax = Math.round(ustva.kz84 * 0.19 * 100) / 100;

    ustva.kz83 = outputTax19 + outputTax7 + outputTax16 + outputTax5 + icaTax + rcTax;

    // Calculate total input VAT
    ustva.kz65 = ustva.kz66 + ustva.kz67 + ustva.kz61 + ustva.kz62 + ustva.kz63 - ustva.kz64;

    // Calculate remaining payment
    ustva.kz39 = ustva.kz83 - ustva.kz65;
  }

  /**
   * Generate ELSTER XML
   */
  generateElsterXML(declaration: ElsterDeclaration): string {
    // Simplified ELSTER XML structure
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Elster xmlns="http://www.elster.de/elsterxml/schema/v11">
  <TransferHeader>
    <Verfahren>ElsterDatenlieferung</Verfahren>
    <DatenArt>${declaration.type}</DatenArt>
    <Vorgang>send</Vorgang>
  </TransferHeader>
  <DatenTeil>
    <Nutzdatenblock>
      <Nutzdatenheader>
        <NutzdatenTicket>${Date.now()}</NutzdatenTicket>
        <Empfaenger id="F">9999</Empfaenger>
      </Nutzdatenheader>
      <Nutzdaten>
        <Anmeldungssteuern art="${declaration.type}" version="2023.1">
          <DatenLieferant>
            <Name>${this.escapeXml(declaration.companyName)}</Name>
            <Steuernummer>${declaration.taxNumber}</Steuernummer>
          </DatenLieferant>
          <Jahr>${declaration.year}</Jahr>
          ${declaration.month ? `<Monat>${String(declaration.month).padStart(2, '0')}</Monat>` : ''}
          ${declaration.quarter ? `<Quartal>${declaration.quarter}</Quartal>` : ''}
          <Steuerfall>
            ${this.generateElsterKennzahlen(declaration.data)}
          </Steuerfall>
        </Anmeldungssteuern>
      </Nutzdaten>
    </Nutzdatenblock>
  </DatenTeil>
</Elster>`;

    return xml;
  }

  /**
   * Generate ELSTER Kennzahlen (field values)
   */
  private generateElsterKennzahlen(data: Record<string, number>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== 0) {
        const kz = key.replace('kz', '');
        lines.push(`<Kz${kz}>${Math.round(value * 100) / 100}</Kz${kz}>`);
      }
    }

    return lines.join('\n            ');
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Validate UStVA declaration
   */
  validateUStVA(declaration: ElsterDeclaration): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (declaration.type !== 'UStVA') {
      errors.push('Invalid declaration type');
    }

    if (!declaration.taxNumber) {
      errors.push('Tax number is required');
    } else if (!/^\d{10,13}$/.test(declaration.taxNumber.replace(/\D/g, ''))) {
      errors.push('Invalid tax number format');
    }

    if (!declaration.companyName) {
      errors.push('Company name is required');
    }

    if (!declaration.year || declaration.year < 2020 || declaration.year > new Date().getFullYear() + 1) {
      errors.push('Invalid year');
    }

    if (!declaration.month && !declaration.quarter) {
      errors.push('Either month or quarter must be specified');
    }

    const data = declaration.data as unknown as UStVAData;

    // Check for negative values
    for (const [key, value] of Object.entries(data)) {
      if (value < 0 && !['kz64', 'kz39'].includes(key)) {
        warnings.push(`Negative value in ${key}: ${value}`);
      }
    }

    // Plausibility checks
    if (data.kz83 > 0 && data.kz81 === 0 && data.kz86 === 0) {
      warnings.push('Output VAT without revenue reported');
    }

    if (data.kz65 > data.kz83 * 2) {
      warnings.push('Input VAT significantly higher than output VAT');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Get ELSTER submission deadlines
   */
  getSubmissionDeadline(year: number, month?: number, quarter?: number): Date {
    // Monthly: 10th of the following month
    // Quarterly: 10th of the month following the quarter end
    if (month) {
      return new Date(year, month, 10);
    }

    if (quarter) {
      const deadlineMonth = quarter * 3;
      return new Date(year, deadlineMonth, 10);
    }

    throw new Error('Either month or quarter must be specified');
  }

  /**
   * Get ELSTER field descriptions
   */
  getFieldDescriptions(): Record<string, { de: string; en: string }> {
    return {
      kz81: { de: 'Umsätze zum Steuersatz von 19%', en: 'Revenue at 19% tax rate' },
      kz86: { de: 'Umsätze zum Steuersatz von 7%', en: 'Revenue at 7% tax rate' },
      kz35: { de: 'Umsätze zum Steuersatz von 16%', en: 'Revenue at 16% tax rate' },
      kz36: { de: 'Umsätze zum Steuersatz von 5%', en: 'Revenue at 5% tax rate' },
      kz43: { de: 'Steuerfreie Ausfuhrlieferungen', en: 'Tax-free export deliveries' },
      kz41: { de: 'Innergemeinschaftliche Lieferungen', en: 'Intra-community deliveries' },
      kz44: { de: 'Leistungsempfänger als Steuerschuldner', en: 'Reverse charge services received' },
      kz48: { de: 'Steuerfreie Umsätze ohne Vorsteuerabzug', en: 'Tax-free revenue without input VAT deduction' },
      kz49: { de: 'Kleinunternehmer ohne Umsatzsteuer', en: 'Small business without VAT' },
      kz89: { de: 'Innergemeinschaftliche Erwerbe zum Steuersatz von 19%', en: 'Intra-community acquisitions at 19%' },
      kz93: { de: 'Innergemeinschaftliche Erwerbe zum Steuersatz von 7%', en: 'Intra-community acquisitions at 7%' },
      kz84: { de: 'Leistungen nach §13b UStG', en: 'Services under §13b UStG (reverse charge)' },
      kz66: { de: 'Vorsteuerbeträge aus Rechnungen 19%', en: 'Input VAT from invoices at 19%' },
      kz67: { de: 'Vorsteuerbeträge aus Rechnungen 7%', en: 'Input VAT from invoices at 7%' },
      kz61: { de: 'Vorsteuer aus innergemeinschaftlichen Erwerben', en: 'Input VAT from intra-community acquisitions' },
      kz62: { de: 'Vorsteuer aus §13b UStG', en: 'Input VAT from §13b UStG' },
      kz63: { de: 'Sonstige Vorsteuerbeträge', en: 'Other input VAT amounts' },
      kz64: { de: 'Vorsteuerberichtigung', en: 'Input VAT correction' },
      kz83: { de: 'Verbleibende Umsatzsteuer', en: 'Remaining output VAT' },
      kz65: { de: 'Verbleibende Vorsteuer', en: 'Remaining input VAT' },
      kz39: { de: 'Verbleibende Umsatzsteuer-Vorauszahlung', en: 'Remaining VAT advance payment' },
    };
  }
}

/**
 * Create ELSTER integration
 */
export function createElsterIntegration(client: DatevClient): DatevElsterIntegration {
  return new DatevElsterIntegration(client);
}
