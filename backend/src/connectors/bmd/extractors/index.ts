/**
 * BMD Data Extractors
 * Convert BMD records to ExtractedEvent objects
 */

import {
  BmdDocument,
  BmdAccount,
  BmdJournalEntry,
  BmdBusinessPartner,
  BmdCostCenter,
  BmdClient,
} from '../bmdClient.js';

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
    costCenters: number;
    total: number;
  };
}

/**
 * Extract document data
 */
export function extractDocument(
  document: BmdDocument,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `bmd-doc-${document.id}`,
    source: 'bmd',
    eventType: 'accounting.document',
    timestamp: new Date(document.modifiedAt),
    data: {
      id: document.id,
      documentNumber: document.documentNumber,
      documentType: document.documentType,
      documentDate: document.documentDate,
      postingDate: document.postingDate,
      dueDate: document.dueDate,
      amount: document.amount,
      netAmount: document.netAmount,
      taxAmount: document.taxAmount,
      currency: document.currency,
      description: document.description,
      status: document.status,
      accountNumber: document.accountNumber,
      contraAccountNumber: document.contraAccountNumber,
      costCenter: document.costCenter,
      costObject: document.costObject,
      partnerId: document.partnerId,
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
  account: BmdAccount,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `bmd-account-${account.number}`,
    source: 'bmd',
    eventType: 'accounting.account',
    timestamp: new Date(),
    data: {
      number: account.number,
      name: account.name,
      accountClass: account.accountClass,
      accountType: account.accountType,
      balance: account.balance,
      currency: account.currency,
      isActive: account.isActive,
      parentNumber: account.parentNumber,
      taxCode: account.taxCode,
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
  entry: BmdJournalEntry,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `bmd-journal-${entry.id}`,
    source: 'bmd',
    eventType: 'accounting.journal_entry',
    timestamp: new Date(entry.createdAt),
    data: {
      id: entry.id,
      documentId: entry.documentId,
      documentNumber: entry.documentNumber,
      postingDate: entry.postingDate,
      accountNumber: entry.accountNumber,
      contraAccountNumber: entry.contraAccountNumber,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
      currency: entry.currency,
      description: entry.description,
      taxCode: entry.taxCode,
      costCenter: entry.costCenter,
      costObject: entry.costObject,
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
  partner: BmdBusinessPartner,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `bmd-partner-${partner.id}`,
    source: 'bmd',
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
      shortName: partner.shortName,
      type: partner.type,
      taxNumber: partner.taxNumber,
      vatNumber: partner.vatNumber,
      email: partner.email,
      phone: partner.phone,
      fax: partner.fax,
      website: partner.website,
      address: partner.address,
      accountNumber: partner.accountNumber,
      paymentTermsDays: partner.paymentTermsDays,
      creditLimit: partner.creditLimit,
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
 * Extract cost center data
 */
export function extractCostCenter(
  costCenter: BmdCostCenter,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `bmd-costcenter-${costCenter.id}`,
    source: 'bmd',
    eventType: 'accounting.cost_center',
    timestamp: new Date(),
    data: {
      id: costCenter.id,
      number: costCenter.number,
      name: costCenter.name,
      description: costCenter.description,
      isActive: costCenter.isActive,
      parentId: costCenter.parentId,
    },
    metadata: {
      organizationId,
      objectType: 'CostCenter',
    },
  };
}

/**
 * Extract all BMD data
 */
export async function extractAllBmdData(
  client: BmdClient,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    documents: 0,
    accounts: 0,
    journalEntries: 0,
    businessPartners: 0,
    costCenters: 0,
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
  const accounts = await client.getAllAccounts();
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

  // Extract cost centers
  const costCenters = await client.getCostCenters();
  for (const costCenter of costCenters) {
    events.push(extractCostCenter(costCenter, options.organizationId));
    stats.costCenters++;
  }

  stats.total = events.length;

  return { events, stats };
}

// Re-export specialized extractors
export * from './bookings.js';
export * from './payroll.js';
export * from './taxReporting.js';
