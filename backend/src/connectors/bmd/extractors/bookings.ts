/**
 * BMD Booking Records Extractor (T150)
 * Extracts journal entries from parsed BMD data
 * Handles Austrian-specific booking types and Soll/Haben (debit/credit) format
 */

import { ExtractedEvent } from '../../base/connector';
import { BmdClient, BmdJournalEntry } from '../bmdClient';

export interface BookingRecord {
  id: string;
  documentId?: string;
  documentNumber?: string;
  postingDate: string;
  accountNumber: string;
  contraAccountNumber: string;
  sollAmount: number;  // Debit (Soll)
  habenAmount: number; // Credit (Haben)
  currency: string;
  description: string;
  taxCode?: string;
  costCenter?: string;
  costObject?: string;
  bookingType: BookingType;
  createdAt: string;
}

export type BookingType =
  | 'standard'           // Standard booking
  | 'opening_balance'    // Eröffnungsbuchung
  | 'closing_balance'    // Abschlussbuchung
  | 'adjustment'         // Korrekturbuchung
  | 'reversal'           // Stornobuchung
  | 'period_adjustment'  // Periodenabgrenzung
  | 'depreciation'       // Abschreibung
  | 'allocation';        // Umlagenbuchung

export interface BookingExtractionOptions {
  organizationId: string;
  dateFrom?: Date;
  dateTo?: Date;
  accountNumber?: string;
  bookingTypes?: BookingType[];
}

export interface BookingExtractionResult {
  events: ExtractedEvent[];
  bookings: BookingRecord[];
  summary: {
    totalBookings: number;
    totalDebit: number;
    totalCredit: number;
    byType: Record<BookingType, number>;
    byAccount: Record<string, { debit: number; credit: number }>;
  };
}

export class BmdBookingExtractor {
  private client: BmdClient;
  private bookingCache: Map<string, BookingRecord> = new Map();

  constructor(client: BmdClient) {
    this.client = client;
  }

  /**
   * Extract booking records from BMD
   */
  async extractBookings(
    options: BookingExtractionOptions
  ): Promise<BookingExtractionResult> {
    const events: ExtractedEvent[] = [];
    const bookings: BookingRecord[] = [];
    const byType: Record<string, number> = {};
    const byAccount: Record<string, { debit: number; credit: number }> = {};
    let totalDebit = 0;
    let totalCredit = 0;

    try {
      // Get journal entries from BMD
      const journalEntries = await this.client.getAllJournalEntries({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      for (const entry of journalEntries) {
        // Filter by account if specified
        if (options.accountNumber &&
            entry.accountNumber !== options.accountNumber &&
            entry.contraAccountNumber !== options.accountNumber) {
          continue;
        }

        // Convert to booking record
        const booking = this.convertToBookingRecord(entry);

        // Filter by booking type if specified
        if (options.bookingTypes &&
            !options.bookingTypes.includes(booking.bookingType)) {
          continue;
        }

        bookings.push(booking);
        this.bookingCache.set(booking.id, booking);

        // Create event
        events.push(this.createBookingEvent(booking, options.organizationId));

        // Update statistics
        totalDebit += booking.sollAmount;
        totalCredit += booking.habenAmount;

        byType[booking.bookingType] = (byType[booking.bookingType] || 0) + 1;

        // Track by account
        if (!byAccount[booking.accountNumber]) {
          byAccount[booking.accountNumber] = { debit: 0, credit: 0 };
        }
        byAccount[booking.accountNumber].debit += booking.sollAmount;

        if (!byAccount[booking.contraAccountNumber]) {
          byAccount[booking.contraAccountNumber] = { debit: 0, credit: 0 };
        }
        byAccount[booking.contraAccountNumber].credit += booking.habenAmount;
      }
    } catch (error) {
      console.warn('Failed to extract bookings:', error);
    }

    return {
      events,
      bookings,
      summary: {
        totalBookings: bookings.length,
        totalDebit,
        totalCredit,
        byType: byType as Record<BookingType, number>,
        byAccount,
      },
    };
  }

  /**
   * Convert BMD journal entry to booking record
   */
  private convertToBookingRecord(entry: BmdJournalEntry): BookingRecord {
    return {
      id: entry.id,
      documentId: entry.documentId,
      documentNumber: entry.documentNumber,
      postingDate: entry.postingDate,
      accountNumber: entry.accountNumber,
      contraAccountNumber: entry.contraAccountNumber,
      sollAmount: entry.debitAmount,
      habenAmount: entry.creditAmount,
      currency: entry.currency,
      description: entry.description,
      taxCode: entry.taxCode,
      costCenter: entry.costCenter,
      costObject: entry.costObject,
      bookingType: this.determineBookingType(entry),
      createdAt: entry.createdAt,
    };
  }

  /**
   * Determine booking type from journal entry
   */
  private determineBookingType(entry: BmdJournalEntry): BookingType {
    const desc = entry.description.toLowerCase();

    // Opening balance
    if (desc.includes('eröffnung') || desc.includes('eb')) {
      return 'opening_balance';
    }

    // Closing balance
    if (desc.includes('abschluss') || desc.includes('saldo')) {
      return 'closing_balance';
    }

    // Reversal
    if (desc.includes('storno') || desc.includes('rückgängig')) {
      return 'reversal';
    }

    // Adjustment
    if (desc.includes('korrektur') || desc.includes('berichtigung')) {
      return 'adjustment';
    }

    // Period adjustment (Periodenabgrenzung)
    if (desc.includes('abgrenzung') || desc.includes('rechnungsabgrenzung')) {
      return 'period_adjustment';
    }

    // Depreciation (Abschreibung)
    if (desc.includes('abschreibung') || desc.includes('afa')) {
      return 'depreciation';
    }

    // Allocation (Umlage)
    if (desc.includes('umlage') || desc.includes('verteilung')) {
      return 'allocation';
    }

    return 'standard';
  }

  /**
   * Create booking event
   */
  private createBookingEvent(
    booking: BookingRecord,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'accounting.booking',
      timestamp: new Date(booking.createdAt),
      actorId: undefined,
      targetId: `bmd:booking:${booking.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        bookingId: booking.id,
        documentId: booking.documentId,
        documentNumber: booking.documentNumber,
        postingDate: booking.postingDate,
        accountNumber: booking.accountNumber,
        contraAccountNumber: booking.contraAccountNumber,
        sollAmount: booking.sollAmount,
        habenAmount: booking.habenAmount,
        currency: booking.currency,
        description: booking.description,
        taxCode: booking.taxCode,
        costCenter: booking.costCenter,
        costObject: booking.costObject,
        bookingType: booking.bookingType,
        createdAt: booking.createdAt,
      },
    };
  }

  /**
   * Get booking by ID
   */
  getBooking(id: string): BookingRecord | undefined {
    return this.bookingCache.get(id);
  }

  /**
   * Calculate trial balance (Saldenliste)
   */
  async calculateTrialBalance(options: {
    organizationId: string;
    dateFrom: Date;
    dateTo: Date;
  }): Promise<Record<string, { debit: number; credit: number; balance: number }>> {
    const trialBalance: Record<string, { debit: number; credit: number; balance: number }> = {};

    const result = await this.extractBookings({
      organizationId: options.organizationId,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    });

    for (const booking of result.bookings) {
      // Debit side (Soll)
      if (!trialBalance[booking.accountNumber]) {
        trialBalance[booking.accountNumber] = { debit: 0, credit: 0, balance: 0 };
      }
      trialBalance[booking.accountNumber].debit += booking.sollAmount;

      // Credit side (Haben)
      if (!trialBalance[booking.contraAccountNumber]) {
        trialBalance[booking.contraAccountNumber] = { debit: 0, credit: 0, balance: 0 };
      }
      trialBalance[booking.contraAccountNumber].credit += booking.habenAmount;
    }

    // Calculate balances
    for (const account in trialBalance) {
      const entry = trialBalance[account];
      entry.balance = entry.debit - entry.credit;
    }

    return trialBalance;
  }

  /**
   * Validate double-entry bookkeeping
   */
  validateDoubleEntry(bookings: BookingRecord[]): {
    valid: boolean;
    sollTotal: number;
    habenTotal: number;
    difference: number;
  } {
    let sollTotal = 0;
    let habenTotal = 0;

    for (const booking of bookings) {
      sollTotal += booking.sollAmount;
      habenTotal += booking.habenAmount;
    }

    const difference = Math.abs(sollTotal - habenTotal);
    const valid = difference < 0.01; // Allow 1 cent difference for rounding

    return {
      valid,
      sollTotal,
      habenTotal,
      difference,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.bookingCache.clear();
  }
}

/**
 * Create booking extractor
 */
export function createBookingExtractor(client: BmdClient): BmdBookingExtractor {
  return new BmdBookingExtractor(client);
}
