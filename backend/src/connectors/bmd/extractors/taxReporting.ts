/**
 * BMD Austrian Tax Reporting Extractor (T152)
 * UVA (Umsatzsteuervoranmeldung) - monthly/quarterly VAT return
 * ZM (Zusammenfassende Meldung) - EU sales list
 * Track submission deadlines and status
 * Austrian VAT rates: 20% (normal), 13% (reduced), 10% (special)
 */

import { ExtractedEvent } from '../../base/connector';
import { BmdClient } from '../bmdClient';

// Austrian VAT rates
export const AUSTRIAN_VAT_RATES = {
  NORMAL: 20,      // Normalsteuersatz
  REDUCED_1: 13,   // Ermäßigter Steuersatz 1
  REDUCED_2: 10,   // Ermäßigter Steuersatz 2
  ZERO: 0,         // Steuerbefreit
} as const;

export interface UvaReturn {
  id: string;
  periodYear: number;
  periodMonth?: number;      // For monthly filing
  periodQuarter?: number;    // For quarterly filing (1-4)
  periodStart: string;
  periodEnd: string;
  filingType: 'monthly' | 'quarterly';
  status: TaxReturnStatus;
  dueDate: string;
  submittedAt?: string;
  submittedBy?: string;
  confirmationNumber?: string;
  confirmationReceivedAt?: string;

  // UVA amounts (Kennzahlen)
  totalRevenue: number;               // Gesamtumsatz (KZ 000)
  taxableRevenue20: number;           // Lieferungen 20% (KZ 022)
  taxableRevenue13: number;           // Lieferungen 13% (KZ 029)
  taxableRevenue10: number;           // Lieferungen 10% (KZ 006)
  taxExemptRevenue: number;           // Steuerfreie Umsätze (KZ 011)

  outputTax20: number;                // Umsatzsteuer 20% (KZ 056)
  outputTax13: number;                // Umsatzsteuer 13% (KZ 057)
  outputTax10: number;                // Umsatzsteuer 10% (KZ 008)

  inputTax: number;                   // Vorsteuer (KZ 060)
  totalOutputTax: number;             // Gesamte Umsatzsteuer (KZ 095)

  netTaxPayable: number;              // Zahllast/Überschuss (KZ 096)

  intraCommunityAcquisitions: number; // Innergemeinschaftliche Erwerbe (KZ 070)
  reverseCharge: number;              // Reverse Charge (KZ 021)

  createdAt: string;
  modifiedAt: string;
}

export type TaxReturnStatus =
  | 'draft'           // Entwurf
  | 'calculated'      // Berechnet
  | 'ready'           // Bereit zur Übermittlung
  | 'submitted'       // Übermittelt
  | 'accepted'        // Angenommen
  | 'rejected'        // Abgelehnt
  | 'corrected';      // Berichtigt

export interface ZmReturn {
  id: string;
  periodYear: number;
  periodMonth?: number;      // For monthly filing
  periodQuarter?: number;    // For quarterly filing (1-4)
  periodStart: string;
  periodEnd: string;
  filingType: 'monthly' | 'quarterly';
  status: TaxReturnStatus;
  dueDate: string;
  submittedAt?: string;
  submittedBy?: string;
  confirmationNumber?: string;
  confirmationReceivedAt?: string;

  // ZM summary
  totalIntraCommunitySupplies: number;
  totalCountries: number;
  totalCustomers: number;

  // Line items (per customer)
  lineItems: ZmLineItem[];

  createdAt: string;
  modifiedAt: string;
}

export interface ZmLineItem {
  id: string;
  zmReturnId: string;
  customerVatId: string;       // VAT ID of EU customer
  customerCountryCode: string; // EU country code
  totalAmount: number;         // Total goods/services amount
  goodsAmount: number;         // Goods only
  servicesAmount: number;      // Services only
  triangularTransaction: boolean; // Dreiecksgeschäft
}

export interface TaxDeadline {
  id: string;
  returnType: 'uva' | 'zm';
  periodYear: number;
  periodMonth?: number;
  periodQuarter?: number;
  dueDate: string;
  reminderSent: boolean;
  reminderSentAt?: string;
  status: 'pending' | 'submitted' | 'overdue';
}

export interface TaxReportingExtractionOptions {
  organizationId: string;
  dateFrom?: Date;
  dateTo?: Date;
  returnType?: 'uva' | 'zm' | 'both';
  status?: TaxReturnStatus[];
  includeDeadlines?: boolean;
}

export interface TaxReportingExtractionResult {
  events: ExtractedEvent[];
  uvaReturns: UvaReturn[];
  zmReturns: ZmReturn[];
  deadlines: TaxDeadline[];
  summary: {
    totalUva: number;
    totalZm: number;
    totalSubmitted: number;
    totalOverdue: number;
    byStatus: Record<TaxReturnStatus, number>;
  };
}

export class BmdTaxReportingExtractor {
  private client: BmdClient;
  private uvaCache: Map<string, UvaReturn> = new Map();
  private zmCache: Map<string, ZmReturn> = new Map();

  constructor(client: BmdClient) {
    this.client = client;
  }

  /**
   * Extract tax reporting data
   */
  async extractTaxReporting(
    options: TaxReportingExtractionOptions
  ): Promise<TaxReportingExtractionResult> {
    const events: ExtractedEvent[] = [];
    const uvaReturns: UvaReturn[] = [];
    const zmReturns: ZmReturn[] = [];
    const deadlines: TaxDeadline[] = [];
    const byStatus: Record<string, number> = {};
    let totalSubmitted = 0;
    let totalOverdue = 0;

    try {
      // Extract UVA returns
      if (!options.returnType || options.returnType === 'uva' || options.returnType === 'both') {
        const uvas = await this.getUvaReturns(options);
        for (const uva of uvas) {
          uvaReturns.push(uva);
          this.uvaCache.set(uva.id, uva);
          events.push(this.createUvaEvent(uva, options.organizationId));

          byStatus[uva.status] = (byStatus[uva.status] || 0) + 1;
          if (uva.status === 'submitted' || uva.status === 'accepted') {
            totalSubmitted++;
          }
        }
      }

      // Extract ZM returns
      if (!options.returnType || options.returnType === 'zm' || options.returnType === 'both') {
        const zms = await this.getZmReturns(options);
        for (const zm of zms) {
          zmReturns.push(zm);
          this.zmCache.set(zm.id, zm);
          events.push(this.createZmEvent(zm, options.organizationId));

          byStatus[zm.status] = (byStatus[zm.status] || 0) + 1;
          if (zm.status === 'submitted' || zm.status === 'accepted') {
            totalSubmitted++;
          }
        }
      }

      // Extract deadlines if requested
      if (options.includeDeadlines) {
        const dls = await this.getDeadlines(options);
        deadlines.push(...dls);

        for (const dl of dls) {
          if (dl.status === 'overdue') {
            totalOverdue++;
          }
          events.push(this.createDeadlineEvent(dl, options.organizationId));
        }
      }
    } catch (error) {
      console.warn('Failed to extract tax reporting data:', error);
    }

    return {
      events,
      uvaReturns,
      zmReturns,
      deadlines,
      summary: {
        totalUva: uvaReturns.length,
        totalZm: zmReturns.length,
        totalSubmitted,
        totalOverdue,
        byStatus: byStatus as Record<TaxReturnStatus, number>,
      },
    };
  }

  /**
   * Get UVA returns from BMD
   */
  private async getUvaReturns(
    options: TaxReportingExtractionOptions
  ): Promise<UvaReturn[]> {
    try {
      const params = new URLSearchParams();

      if (options.dateFrom) {
        params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
      }

      if (options.dateTo) {
        params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
      }

      if (options.status && options.status.length > 0) {
        params.set('status', options.status.join(','));
      }

      const result = await (this.client as any).request<{
        uvaReturns: UvaReturn[];
      }>(`/tax/uva?${params.toString()}`);

      return result.uvaReturns || [];
    } catch (error) {
      console.warn('Failed to get UVA returns:', error);
      return [];
    }
  }

  /**
   * Get ZM returns from BMD
   */
  private async getZmReturns(
    options: TaxReportingExtractionOptions
  ): Promise<ZmReturn[]> {
    try {
      const params = new URLSearchParams();

      if (options.dateFrom) {
        params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
      }

      if (options.dateTo) {
        params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
      }

      if (options.status && options.status.length > 0) {
        params.set('status', options.status.join(','));
      }

      const result = await (this.client as any).request<{
        zmReturns: ZmReturn[];
      }>(`/tax/zm?${params.toString()}`);

      return result.zmReturns || [];
    } catch (error) {
      console.warn('Failed to get ZM returns:', error);
      return [];
    }
  }

  /**
   * Get tax deadlines
   */
  private async getDeadlines(
    options: TaxReportingExtractionOptions
  ): Promise<TaxDeadline[]> {
    try {
      const params = new URLSearchParams();

      if (options.dateFrom) {
        params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
      }

      if (options.dateTo) {
        params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
      }

      const result = await (this.client as any).request<{
        deadlines: TaxDeadline[];
      }>(`/tax/deadlines?${params.toString()}`);

      return result.deadlines || [];
    } catch (error) {
      console.warn('Failed to get tax deadlines:', error);
      return [];
    }
  }

  /**
   * Create UVA event
   */
  private createUvaEvent(
    uva: UvaReturn,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'tax.uva_return',
      timestamp: new Date(uva.modifiedAt),
      actorId: uva.submittedBy,
      targetId: `bmd:uva:${uva.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        uvaId: uva.id,
        periodYear: uva.periodYear,
        periodMonth: uva.periodMonth,
        periodQuarter: uva.periodQuarter,
        periodStart: uva.periodStart,
        periodEnd: uva.periodEnd,
        filingType: uva.filingType,
        status: uva.status,
        dueDate: uva.dueDate,
        submittedAt: uva.submittedAt,
        submittedBy: uva.submittedBy,
        confirmationNumber: uva.confirmationNumber,
        confirmationReceivedAt: uva.confirmationReceivedAt,
        totalRevenue: uva.totalRevenue,
        taxableRevenue20: uva.taxableRevenue20,
        taxableRevenue13: uva.taxableRevenue13,
        taxableRevenue10: uva.taxableRevenue10,
        taxExemptRevenue: uva.taxExemptRevenue,
        outputTax20: uva.outputTax20,
        outputTax13: uva.outputTax13,
        outputTax10: uva.outputTax10,
        inputTax: uva.inputTax,
        totalOutputTax: uva.totalOutputTax,
        netTaxPayable: uva.netTaxPayable,
        intraCommunityAcquisitions: uva.intraCommunityAcquisitions,
        reverseCharge: uva.reverseCharge,
        createdAt: uva.createdAt,
        modifiedAt: uva.modifiedAt,
      },
    };
  }

  /**
   * Create ZM event
   */
  private createZmEvent(
    zm: ZmReturn,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'tax.zm_return',
      timestamp: new Date(zm.modifiedAt),
      actorId: zm.submittedBy,
      targetId: `bmd:zm:${zm.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        zmId: zm.id,
        periodYear: zm.periodYear,
        periodMonth: zm.periodMonth,
        periodQuarter: zm.periodQuarter,
        periodStart: zm.periodStart,
        periodEnd: zm.periodEnd,
        filingType: zm.filingType,
        status: zm.status,
        dueDate: zm.dueDate,
        submittedAt: zm.submittedAt,
        submittedBy: zm.submittedBy,
        confirmationNumber: zm.confirmationNumber,
        confirmationReceivedAt: zm.confirmationReceivedAt,
        totalIntraCommunitySupplies: zm.totalIntraCommunitySupplies,
        totalCountries: zm.totalCountries,
        totalCustomers: zm.totalCustomers,
        lineItemCount: zm.lineItems.length,
        createdAt: zm.createdAt,
        modifiedAt: zm.modifiedAt,
      },
    };
  }

  /**
   * Create deadline event
   */
  private createDeadlineEvent(
    deadline: TaxDeadline,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'tax.deadline',
      timestamp: new Date(deadline.dueDate),
      actorId: undefined,
      targetId: `bmd:tax-deadline:${deadline.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        deadlineId: deadline.id,
        returnType: deadline.returnType,
        periodYear: deadline.periodYear,
        periodMonth: deadline.periodMonth,
        periodQuarter: deadline.periodQuarter,
        dueDate: deadline.dueDate,
        reminderSent: deadline.reminderSent,
        reminderSentAt: deadline.reminderSentAt,
        status: deadline.status,
      },
    };
  }

  /**
   * Calculate UVA from journal entries
   */
  async calculateUva(options: {
    organizationId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<Partial<UvaReturn>> {
    const entries = await this.client.getAllJournalEntries({
      dateFrom: options.periodStart,
      dateTo: options.periodEnd,
    });

    const uva: Partial<UvaReturn> = {
      totalRevenue: 0,
      taxableRevenue20: 0,
      taxableRevenue13: 0,
      taxableRevenue10: 0,
      taxExemptRevenue: 0,
      outputTax20: 0,
      outputTax13: 0,
      outputTax10: 0,
      inputTax: 0,
      totalOutputTax: 0,
      netTaxPayable: 0,
      intraCommunityAcquisitions: 0,
      reverseCharge: 0,
    };

    for (const entry of entries) {
      const amount = Math.abs(entry.debitAmount || entry.creditAmount);
      const taxCode = entry.taxCode?.toUpperCase();

      // Categorize by tax code
      if (taxCode?.includes('20')) {
        uva.taxableRevenue20! += amount;
        uva.outputTax20! += amount * (AUSTRIAN_VAT_RATES.NORMAL / 100);
      } else if (taxCode?.includes('13')) {
        uva.taxableRevenue13! += amount;
        uva.outputTax13! += amount * (AUSTRIAN_VAT_RATES.REDUCED_1 / 100);
      } else if (taxCode?.includes('10')) {
        uva.taxableRevenue10! += amount;
        uva.outputTax10! += amount * (AUSTRIAN_VAT_RATES.REDUCED_2 / 100);
      } else if (taxCode?.includes('EXEMPT') || taxCode?.includes('0')) {
        uva.taxExemptRevenue! += amount;
      } else if (taxCode?.includes('INPUT') || taxCode?.includes('VST')) {
        uva.inputTax! += amount;
      } else if (taxCode?.includes('IG') || taxCode?.includes('IC')) {
        uva.intraCommunityAcquisitions! += amount;
      } else if (taxCode?.includes('RC') || taxCode?.includes('REVERSE')) {
        uva.reverseCharge! += amount;
      }
    }

    uva.totalRevenue = uva.taxableRevenue20! + uva.taxableRevenue13! +
                       uva.taxableRevenue10! + uva.taxExemptRevenue!;
    uva.totalOutputTax = uva.outputTax20! + uva.outputTax13! + uva.outputTax10!;
    uva.netTaxPayable = uva.totalOutputTax! - uva.inputTax!;

    return uva;
  }

  /**
   * Get overdue returns
   */
  getOverdueReturns(): Array<UvaReturn | ZmReturn> {
    const overdue: Array<UvaReturn | ZmReturn> = [];
    const now = new Date();

    for (const uva of this.uvaCache.values()) {
      if (new Date(uva.dueDate) < now &&
          uva.status !== 'submitted' &&
          uva.status !== 'accepted') {
        overdue.push(uva);
      }
    }

    for (const zm of this.zmCache.values()) {
      if (new Date(zm.dueDate) < now &&
          zm.status !== 'submitted' &&
          zm.status !== 'accepted') {
        overdue.push(zm);
      }
    }

    return overdue;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.uvaCache.clear();
    this.zmCache.clear();
  }
}

/**
 * Create tax reporting extractor
 */
export function createTaxReportingExtractor(client: BmdClient): BmdTaxReportingExtractor {
  return new BmdTaxReportingExtractor(client);
}
