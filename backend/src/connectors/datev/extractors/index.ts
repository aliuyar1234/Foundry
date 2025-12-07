/**
 * DATEV Data Extractors
 * Convert DATEV records to ExtractedEvent objects
 */

import {
  DatevDocument,
  DatevAccount,
  DatevJournalEntry,
  DatevBusinessPartner,
  DatevClient,
} from '../datevClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ExtractionOptions {
  organizationId: string;
  modifiedSince?: Date;
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  stats: {
    documents: number;
    accounts: number;
    journalEntries: number;
    businessPartners: number;
    total: number;
  };
}

/**
 * Extract document data
 */
export function extractDocument(
  document: DatevDocument,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `datev-doc-${document.id}`,
    source: 'datev',
    eventType: 'accounting.document',
    timestamp: new Date(document.modifiedAt),
    data: {
      id: document.id,
      type: document.type,
      number: document.number,
      date: document.date,
      dueDate: document.dueDate,
      amount: document.amount,
      currency: document.currency,
      taxAmount: document.taxAmount,
      description: document.description,
      status: document.status,
      accountNumber: document.accountNumber,
      contraAccountNumber: document.contraAccountNumber,
      costCenter: document.costCenter,
      costObject: document.costObject,
    },
    metadata: {
      organizationId,
      createdAt: document.createdAt,
      modifiedAt: document.modifiedAt,
      objectType: 'Document',
    },
  };
}

/**
 * Extract account data
 */
export function extractAccount(
  account: DatevAccount,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `datev-account-${account.number}`,
    source: 'datev',
    eventType: 'accounting.account',
    timestamp: new Date(),
    data: {
      number: account.number,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      isActive: account.isActive,
      parentNumber: account.parentNumber,
    },
    metadata: {
      organizationId,
      objectType: 'Account',
    },
  };
}

/**
 * Extract journal entry data
 */
export function extractJournalEntry(
  entry: DatevJournalEntry,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `datev-journal-${entry.id}`,
    source: 'datev',
    eventType: 'accounting.journal_entry',
    timestamp: new Date(entry.createdAt),
    data: {
      id: entry.id,
      documentId: entry.documentId,
      date: entry.date,
      accountNumber: entry.accountNumber,
      contraAccountNumber: entry.contraAccountNumber,
      amount: entry.amount,
      currency: entry.currency,
      description: entry.description,
      taxCode: entry.taxCode,
      costCenter: entry.costCenter,
      costObject: entry.costObject,
      documentNumber: entry.documentNumber,
    },
    metadata: {
      organizationId,
      createdAt: entry.createdAt,
      objectType: 'JournalEntry',
    },
  };
}

/**
 * Extract business partner data
 */
export function extractBusinessPartner(
  partner: DatevBusinessPartner,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `datev-partner-${partner.id}`,
    source: 'datev',
    eventType: partner.type === 'customer'
      ? 'accounting.customer'
      : partner.type === 'vendor'
        ? 'accounting.vendor'
        : 'accounting.business_partner',
    timestamp: new Date(partner.modifiedAt),
    data: {
      id: partner.id,
      number: partner.number,
      name: partner.name,
      type: partner.type,
      taxId: partner.taxId,
      vatId: partner.vatId,
      email: partner.email,
      phone: partner.phone,
      address: partner.address,
      accountNumber: partner.accountNumber,
      paymentTerms: partner.paymentTerms,
      isActive: partner.isActive,
    },
    metadata: {
      organizationId,
      createdAt: partner.createdAt,
      modifiedAt: partner.modifiedAt,
      objectType: 'BusinessPartner',
    },
  };
}

/**
 * Extract all DATEV data
 */
export async function extractAllDatevData(
  client: DatevClient,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    documents: 0,
    accounts: 0,
    journalEntries: 0,
    businessPartners: 0,
    total: 0,
  };

  // Extract documents
  const documents = await client.getAllDocuments({
    modifiedSince: options.modifiedSince,
  });
  for (const document of documents) {
    events.push(extractDocument(document, options.organizationId));
    stats.documents++;
  }

  // Extract accounts
  const accounts = await client.getAccounts();
  for (const account of accounts) {
    events.push(extractAccount(account, options.organizationId));
    stats.accounts++;
  }

  // Extract journal entries
  const journalEntries = await client.getAllJournalEntries({
    dateFrom: options.modifiedSince,
  });
  for (const entry of journalEntries) {
    events.push(extractJournalEntry(entry, options.organizationId));
    stats.journalEntries++;
  }

  // Extract business partners
  const partners = await client.getAllBusinessPartners();
  for (const partner of partners) {
    events.push(extractBusinessPartner(partner, options.organizationId));
    stats.businessPartners++;
  }

  stats.total = events.length;

  return { events, stats };
}
