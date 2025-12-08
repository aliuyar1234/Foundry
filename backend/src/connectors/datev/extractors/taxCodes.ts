/**
 * DATEV Tax Code Handler
 * Task: T132
 *
 * Handles German tax codes (Steuerschlüssel) and VAT rates.
 * Supports standard German tax rates and special cases.
 */

import { ExtractedEvent } from '../../base/connector';
import { DatevClient } from '../datevClient';

export interface TaxCode {
  code: string;
  name: string;
  nameDe: string;
  rate: number;
  type: 'input' | 'output' | 'reverse_charge' | 'exempt' | 'intra_community';
  category: 'standard' | 'reduced' | 'exempt' | 'special';
  elsterCode?: string;
  validFrom?: Date;
  validTo?: Date;
  isActive: boolean;
}

export interface TaxCodeMapping {
  code: string;
  accountNumber: string;
  contraAccountNumber: string;
  taxAccount: string;
}

export interface TaxSummary {
  period: string;
  totalTaxableRevenue: number;
  totalTaxCollected: number;
  totalInputTax: number;
  netTaxPayable: number;
  byTaxCode: Record<string, {
    taxableAmount: number;
    taxAmount: number;
    transactionCount: number;
  }>;
}

// Standard German tax codes (Steuerschlüssel)
export const GERMAN_TAX_CODES: TaxCode[] = [
  // Output tax (Umsatzsteuer)
  {
    code: 'USt19',
    name: 'Output VAT 19%',
    nameDe: 'Umsatzsteuer 19%',
    rate: 19,
    type: 'output',
    category: 'standard',
    elsterCode: '81',
    isActive: true,
  },
  {
    code: 'USt7',
    name: 'Output VAT 7%',
    nameDe: 'Umsatzsteuer 7%',
    rate: 7,
    type: 'output',
    category: 'reduced',
    elsterCode: '86',
    isActive: true,
  },
  {
    code: 'USt0',
    name: 'Output VAT 0%',
    nameDe: 'Umsatzsteuer 0%',
    rate: 0,
    type: 'output',
    category: 'exempt',
    elsterCode: '48',
    isActive: true,
  },
  // Input tax (Vorsteuer)
  {
    code: 'VSt19',
    name: 'Input VAT 19%',
    nameDe: 'Vorsteuer 19%',
    rate: 19,
    type: 'input',
    category: 'standard',
    elsterCode: '66',
    isActive: true,
  },
  {
    code: 'VSt7',
    name: 'Input VAT 7%',
    nameDe: 'Vorsteuer 7%',
    rate: 7,
    type: 'input',
    category: 'reduced',
    elsterCode: '67',
    isActive: true,
  },
  // Reverse charge
  {
    code: 'RC13b',
    name: 'Reverse Charge §13b',
    nameDe: 'Steuerschuldnerschaft §13b',
    rate: 19,
    type: 'reverse_charge',
    category: 'special',
    elsterCode: '84',
    isActive: true,
  },
  // Intra-community
  {
    code: 'ICE',
    name: 'Intra-Community Export',
    nameDe: 'Innergemeinschaftliche Lieferung',
    rate: 0,
    type: 'intra_community',
    category: 'exempt',
    elsterCode: '41',
    isActive: true,
  },
  {
    code: 'ICA',
    name: 'Intra-Community Acquisition',
    nameDe: 'Innergemeinschaftlicher Erwerb',
    rate: 19,
    type: 'intra_community',
    category: 'special',
    elsterCode: '89',
    isActive: true,
  },
  // COVID-19 temporary rates (historical)
  {
    code: 'USt16',
    name: 'Output VAT 16% (COVID)',
    nameDe: 'Umsatzsteuer 16% (COVID)',
    rate: 16,
    type: 'output',
    category: 'standard',
    elsterCode: '35',
    validFrom: new Date('2020-07-01'),
    validTo: new Date('2020-12-31'),
    isActive: false,
  },
  {
    code: 'USt5',
    name: 'Output VAT 5% (COVID)',
    nameDe: 'Umsatzsteuer 5% (COVID)',
    rate: 5,
    type: 'output',
    category: 'reduced',
    elsterCode: '36',
    validFrom: new Date('2020-07-01'),
    validTo: new Date('2020-12-31'),
    isActive: false,
  },
];

// DATEV tax code number mappings
export const DATEV_TAX_CODE_NUMBERS: Record<string, string> = {
  '1': 'USt19',    // 19% Umsatzsteuer
  '2': 'USt7',     // 7% Umsatzsteuer
  '3': 'USt0',     // 0% steuerbefreit
  '9': 'VSt19',    // 19% Vorsteuer
  '8': 'VSt7',     // 7% Vorsteuer
  '10': 'RC13b',   // Reverse Charge
  '11': 'ICE',     // Innergemeinschaftliche Lieferung
  '12': 'ICA',     // Innergemeinschaftlicher Erwerb
  '94': 'USt16',   // COVID 16%
  '95': 'USt5',    // COVID 5%
};

export class DatevTaxCodeHandler {
  private client: DatevClient;
  private customTaxCodes: Map<string, TaxCode> = new Map();

  constructor(client: DatevClient) {
    this.client = client;
  }

  /**
   * Get all tax codes
   */
  getAllTaxCodes(): TaxCode[] {
    const allCodes = [...GERMAN_TAX_CODES];

    // Add custom codes
    for (const code of this.customTaxCodes.values()) {
      allCodes.push(code);
    }

    return allCodes;
  }

  /**
   * Get active tax codes
   */
  getActiveTaxCodes(): TaxCode[] {
    return this.getAllTaxCodes().filter((code) => code.isActive);
  }

  /**
   * Get tax code by code string
   */
  getTaxCode(code: string): TaxCode | undefined {
    // Check custom codes first
    if (this.customTaxCodes.has(code)) {
      return this.customTaxCodes.get(code);
    }

    // Check DATEV number mapping
    const mappedCode = DATEV_TAX_CODE_NUMBERS[code];
    if (mappedCode) {
      code = mappedCode;
    }

    return GERMAN_TAX_CODES.find((tc) => tc.code === code);
  }

  /**
   * Get tax codes for a date
   */
  getTaxCodesForDate(date: Date): TaxCode[] {
    return this.getAllTaxCodes().filter((code) => {
      if (code.validFrom && date < code.validFrom) return false;
      if (code.validTo && date > code.validTo) return false;
      return true;
    });
  }

  /**
   * Calculate tax amount
   */
  calculateTax(
    netAmount: number,
    taxCode: string,
    date?: Date
  ): { taxAmount: number; grossAmount: number; rate: number } {
    const code = this.getTaxCode(taxCode);

    if (!code) {
      return { taxAmount: 0, grossAmount: netAmount, rate: 0 };
    }

    // Check date validity
    if (date) {
      if (code.validFrom && date < code.validFrom) {
        return { taxAmount: 0, grossAmount: netAmount, rate: 0 };
      }
      if (code.validTo && date > code.validTo) {
        return { taxAmount: 0, grossAmount: netAmount, rate: 0 };
      }
    }

    const taxAmount = Math.round(netAmount * (code.rate / 100) * 100) / 100;
    const grossAmount = netAmount + taxAmount;

    return { taxAmount, grossAmount, rate: code.rate };
  }

  /**
   * Extract tax from gross amount
   */
  extractTax(
    grossAmount: number,
    taxCode: string
  ): { netAmount: number; taxAmount: number; rate: number } {
    const code = this.getTaxCode(taxCode);

    if (!code || code.rate === 0) {
      return { netAmount: grossAmount, taxAmount: 0, rate: 0 };
    }

    const netAmount = Math.round((grossAmount / (1 + code.rate / 100)) * 100) / 100;
    const taxAmount = grossAmount - netAmount;

    return { netAmount, taxAmount, rate: code.rate };
  }

  /**
   * Calculate tax summary for a period
   */
  async calculateTaxSummary(
    options: {
      organizationId: string;
      dateFrom: Date;
      dateTo: Date;
    }
  ): Promise<TaxSummary> {
    const summary: TaxSummary = {
      period: `${options.dateFrom.toISOString().split('T')[0]} - ${options.dateTo.toISOString().split('T')[0]}`,
      totalTaxableRevenue: 0,
      totalTaxCollected: 0,
      totalInputTax: 0,
      netTaxPayable: 0,
      byTaxCode: {},
    };

    try {
      const entries = await this.client.getAllJournalEntries({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      for (const entry of entries) {
        if (!entry.taxCode) continue;

        const taxCode = this.getTaxCode(entry.taxCode);
        if (!taxCode) continue;

        if (!summary.byTaxCode[taxCode.code]) {
          summary.byTaxCode[taxCode.code] = {
            taxableAmount: 0,
            taxAmount: 0,
            transactionCount: 0,
          };
        }

        const taxInfo = this.extractTax(Math.abs(entry.amount), taxCode.code);

        summary.byTaxCode[taxCode.code].taxableAmount += taxInfo.netAmount;
        summary.byTaxCode[taxCode.code].taxAmount += taxInfo.taxAmount;
        summary.byTaxCode[taxCode.code].transactionCount++;

        if (taxCode.type === 'output') {
          summary.totalTaxableRevenue += taxInfo.netAmount;
          summary.totalTaxCollected += taxInfo.taxAmount;
        } else if (taxCode.type === 'input') {
          summary.totalInputTax += taxInfo.taxAmount;
        }
      }

      summary.netTaxPayable = summary.totalTaxCollected - summary.totalInputTax;
    } catch (error) {
      console.warn('Failed to calculate tax summary:', error);
    }

    return summary;
  }

  /**
   * Create tax code events
   */
  createTaxCodeEvents(organizationId: string): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];

    for (const taxCode of this.getAllTaxCodes()) {
      events.push({
        type: 'accounting.tax_code',
        timestamp: new Date(),
        actorId: undefined,
        targetId: `datev:tax:${taxCode.code}`,
        metadata: {
          source: 'datev',
          organizationId,
          code: taxCode.code,
          name: taxCode.name,
          nameDe: taxCode.nameDe,
          rate: taxCode.rate,
          taxType: taxCode.type,
          category: taxCode.category,
          elsterCode: taxCode.elsterCode,
          isActive: taxCode.isActive,
          validFrom: taxCode.validFrom?.toISOString(),
          validTo: taxCode.validTo?.toISOString(),
        },
      });
    }

    return events;
  }

  /**
   * Add custom tax code
   */
  addCustomTaxCode(taxCode: TaxCode): void {
    this.customTaxCodes.set(taxCode.code, taxCode);
  }

  /**
   * Get ELSTER mapping for tax codes
   */
  getElsterMapping(): Record<string, TaxCode[]> {
    const mapping: Record<string, TaxCode[]> = {};

    for (const code of this.getAllTaxCodes()) {
      if (code.elsterCode) {
        if (!mapping[code.elsterCode]) {
          mapping[code.elsterCode] = [];
        }
        mapping[code.elsterCode].push(code);
      }
    }

    return mapping;
  }
}

/**
 * Create tax code handler
 */
export function createTaxCodeHandler(client: DatevClient): DatevTaxCodeHandler {
  return new DatevTaxCodeHandler(client);
}
