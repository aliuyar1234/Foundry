/**
 * DATEV Incremental Sync
 * Task: T141
 *
 * Handles incremental synchronization using modifiedAt cursor.
 * Manages sync checkpoints and change detection.
 */

import { ExtractedEvent } from '../base/connector';
import { DatevClient, DatevDocument, DatevJournalEntry, DatevBusinessPartner, DatevAccount } from './datevClient';

export interface SyncCheckpoint {
  entityType: string;
  lastSyncTime: Date;
  lastModifiedAt?: string;
  recordCount: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface IncrementalSyncConfig {
  entityType: 'documents' | 'journal_entries' | 'accounts' | 'business_partners';
  batchSize: number;
}

export interface IncrementalSyncResult {
  events: ExtractedEvent[];
  checkpoint: SyncCheckpoint;
  hasMore: boolean;
  stats: {
    processed: number;
    created: number;
    updated: number;
    errors: number;
  };
}

// Standard sync configurations
export const DATEV_SYNC_CONFIGS: Record<string, IncrementalSyncConfig> = {
  documents: {
    entityType: 'documents',
    batchSize: 100,
  },
  journal_entries: {
    entityType: 'journal_entries',
    batchSize: 500,
  },
  accounts: {
    entityType: 'accounts',
    batchSize: 1000,
  },
  business_partners: {
    entityType: 'business_partners',
    batchSize: 200,
  },
};

export class DatevIncrementalSync {
  private client: DatevClient;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(client: DatevClient) {
    this.client = client;
  }

  /**
   * Sync documents incrementally
   */
  async syncDocuments(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      maxRecords?: number;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    const config = DATEV_SYNC_CONFIGS.documents;
    const modifiedSince = options.lastCheckpoint?.lastSyncTime;
    const maxRecords = options.maxRecords || config.batchSize * 10;

    let latestModified: Date | undefined;

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore && stats.processed < maxRecords) {
        const result = await this.client.getDocuments({
          page,
          pageSize: Math.min(config.batchSize, maxRecords - stats.processed),
          modifiedSince,
        });

        for (const doc of result.data) {
          try {
            const event = this.documentToEvent(doc, options.organizationId);
            events.push(event);
            stats.processed++;

            const modifiedAt = new Date(doc.modifiedAt);
            if (!latestModified || modifiedAt > latestModified) {
              latestModified = modifiedAt;
            }

            // Determine if created or updated
            const createdAt = new Date(doc.createdAt);
            if (Math.abs(modifiedAt.getTime() - createdAt.getTime()) < 60000) {
              stats.created++;
            } else {
              stats.updated++;
            }
          } catch (error) {
            console.warn('Error processing document:', error);
            stats.errors++;
          }
        }

        hasMore = page < result.pagination.totalPages && stats.processed < maxRecords;
        page++;
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'documents',
        lastSyncTime: latestModified || modifiedSince || new Date(),
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : stats.errors < stats.processed ? 'partial' : 'failed',
      };

      this.checkpoints.set('documents', checkpoint);

      return {
        events,
        checkpoint,
        hasMore: stats.processed >= maxRecords,
        stats,
      };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'documents',
        lastSyncTime: modifiedSince || new Date(0),
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync journal entries incrementally
   */
  async syncJournalEntries(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      dateFrom?: Date;
      dateTo?: Date;
      maxRecords?: number;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    const config = DATEV_SYNC_CONFIGS.journal_entries;
    const dateFrom = options.lastCheckpoint?.lastSyncTime || options.dateFrom;
    const dateTo = options.dateTo || new Date();
    const maxRecords = options.maxRecords || config.batchSize * 10;

    let latestDate: Date | undefined;

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore && stats.processed < maxRecords) {
        const result = await this.client.getJournalEntries({
          page,
          pageSize: Math.min(config.batchSize, maxRecords - stats.processed),
          dateFrom,
          dateTo,
        });

        for (const entry of result.data) {
          try {
            const event = this.journalEntryToEvent(entry, options.organizationId);
            events.push(event);
            stats.processed++;
            stats.created++;

            const entryDate = new Date(entry.createdAt);
            if (!latestDate || entryDate > latestDate) {
              latestDate = entryDate;
            }
          } catch (error) {
            console.warn('Error processing journal entry:', error);
            stats.errors++;
          }
        }

        hasMore = page < result.pagination.totalPages && stats.processed < maxRecords;
        page++;
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'journal_entries',
        lastSyncTime: latestDate || dateFrom || new Date(),
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : stats.errors < stats.processed ? 'partial' : 'failed',
      };

      this.checkpoints.set('journal_entries', checkpoint);

      return {
        events,
        checkpoint,
        hasMore: stats.processed >= maxRecords,
        stats,
      };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'journal_entries',
        lastSyncTime: dateFrom || new Date(0),
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync accounts
   */
  async syncAccounts(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    try {
      const accounts = await this.client.getAccounts();

      for (const account of accounts) {
        try {
          const event = this.accountToEvent(account, options.organizationId);
          events.push(event);
          stats.processed++;
          stats.created++;
        } catch (error) {
          console.warn('Error processing account:', error);
          stats.errors++;
        }
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'accounts',
        lastSyncTime: new Date(),
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : 'partial',
      };

      this.checkpoints.set('accounts', checkpoint);

      return {
        events,
        checkpoint,
        hasMore: false,
        stats,
      };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'accounts',
        lastSyncTime: new Date(0),
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync business partners incrementally
   */
  async syncBusinessPartners(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      maxRecords?: number;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    const config = DATEV_SYNC_CONFIGS.business_partners;
    const maxRecords = options.maxRecords || config.batchSize * 5;

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore && stats.processed < maxRecords) {
        const result = await this.client.getBusinessPartners({
          page,
          pageSize: Math.min(config.batchSize, maxRecords - stats.processed),
        });

        for (const partner of result.data) {
          try {
            const event = this.businessPartnerToEvent(partner, options.organizationId);
            events.push(event);
            stats.processed++;
            stats.created++;
          } catch (error) {
            console.warn('Error processing business partner:', error);
            stats.errors++;
          }
        }

        hasMore = page < result.pagination.totalPages && stats.processed < maxRecords;
        page++;
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'business_partners',
        lastSyncTime: new Date(),
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : 'partial',
      };

      this.checkpoints.set('business_partners', checkpoint);

      return {
        events,
        checkpoint,
        hasMore: stats.processed >= maxRecords,
        stats,
      };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'business_partners',
        lastSyncTime: new Date(0),
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync all entities
   */
  async syncAll(
    options: {
      organizationId: string;
      checkpoints?: Map<string, SyncCheckpoint>;
      entityTypes?: string[];
      maxRecordsPerEntity?: number;
    }
  ): Promise<{
    events: ExtractedEvent[];
    checkpoints: Map<string, SyncCheckpoint>;
    stats: Record<string, IncrementalSyncResult['stats']>;
  }> {
    const allEvents: ExtractedEvent[] = [];
    const checkpoints = new Map<string, SyncCheckpoint>();
    const stats: Record<string, IncrementalSyncResult['stats']> = {};

    const entityTypes = options.entityTypes || Object.keys(DATEV_SYNC_CONFIGS);

    for (const entityType of entityTypes) {
      const lastCheckpoint = options.checkpoints?.get(entityType);
      let result: IncrementalSyncResult;

      switch (entityType) {
        case 'documents':
          result = await this.syncDocuments({
            organizationId: options.organizationId,
            lastCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });
          break;
        case 'journal_entries':
          result = await this.syncJournalEntries({
            organizationId: options.organizationId,
            lastCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });
          break;
        case 'accounts':
          result = await this.syncAccounts({
            organizationId: options.organizationId,
            lastCheckpoint,
          });
          break;
        case 'business_partners':
          result = await this.syncBusinessPartners({
            organizationId: options.organizationId,
            lastCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });
          break;
        default:
          continue;
      }

      allEvents.push(...result.events);
      checkpoints.set(entityType, result.checkpoint);
      stats[entityType] = result.stats;
    }

    return { events: allEvents, checkpoints, stats };
  }

  /**
   * Convert document to event
   */
  private documentToEvent(doc: DatevDocument, organizationId: string): ExtractedEvent {
    return {
      type: `accounting.document.${doc.type.toLowerCase()}`,
      timestamp: new Date(doc.modifiedAt),
      actorId: undefined,
      targetId: `datev:doc:${doc.id}`,
      metadata: {
        source: 'datev',
        organizationId,
        documentId: doc.id,
        documentType: doc.type,
        documentNumber: doc.number,
        date: doc.date,
        dueDate: doc.dueDate,
        amount: doc.amount,
        currency: doc.currency,
        taxAmount: doc.taxAmount,
        description: doc.description,
        status: doc.status,
        accountNumber: doc.accountNumber,
        contraAccountNumber: doc.contraAccountNumber,
        costCenter: doc.costCenter,
        costObject: doc.costObject,
        createdAt: doc.createdAt,
        modifiedAt: doc.modifiedAt,
      },
    };
  }

  /**
   * Convert journal entry to event
   */
  private journalEntryToEvent(entry: DatevJournalEntry, organizationId: string): ExtractedEvent {
    return {
      type: 'accounting.journal_entry',
      timestamp: new Date(entry.createdAt),
      actorId: undefined,
      targetId: `datev:journal:${entry.id}`,
      metadata: {
        source: 'datev',
        organizationId,
        entryId: entry.id,
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
        createdAt: entry.createdAt,
      },
    };
  }

  /**
   * Convert account to event
   */
  private accountToEvent(account: DatevAccount, organizationId: string): ExtractedEvent {
    return {
      type: 'accounting.account',
      timestamp: new Date(),
      actorId: undefined,
      targetId: `datev:account:${account.number}`,
      metadata: {
        source: 'datev',
        organizationId,
        accountNumber: account.number,
        name: account.name,
        accountType: account.type,
        balance: account.balance,
        currency: account.currency,
        isActive: account.isActive,
        parentNumber: account.parentNumber,
      },
    };
  }

  /**
   * Convert business partner to event
   */
  private businessPartnerToEvent(partner: DatevBusinessPartner, organizationId: string): ExtractedEvent {
    const eventType = partner.type === 'customer'
      ? 'accounting.customer'
      : partner.type === 'vendor'
        ? 'accounting.vendor'
        : 'accounting.business_partner';

    return {
      type: eventType,
      timestamp: new Date(partner.modifiedAt),
      actorId: undefined,
      targetId: `datev:partner:${partner.id}`,
      metadata: {
        source: 'datev',
        organizationId,
        partnerId: partner.id,
        partnerNumber: partner.number,
        name: partner.name,
        partnerType: partner.type,
        taxId: partner.taxId,
        vatId: partner.vatId,
        email: partner.email,
        phone: partner.phone,
        address: partner.address,
        accountNumber: partner.accountNumber,
        paymentTerms: partner.paymentTerms,
        isActive: partner.isActive,
        createdAt: partner.createdAt,
        modifiedAt: partner.modifiedAt,
      },
    };
  }

  /**
   * Get checkpoint
   */
  getCheckpoint(entityType: string): SyncCheckpoint | undefined {
    return this.checkpoints.get(entityType);
  }

  /**
   * Set checkpoint
   */
  setCheckpoint(checkpoint: SyncCheckpoint): void {
    this.checkpoints.set(checkpoint.entityType, checkpoint);
  }

  /**
   * Clear checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    entities: string[];
    lastSync: Date | null;
    totalRecords: number;
    status: 'healthy' | 'partial' | 'failed';
  } {
    const entities: string[] = [];
    let lastSync: Date | null = null;
    let totalRecords = 0;
    let hasFailures = false;
    let hasPartial = false;

    for (const [entityType, checkpoint] of this.checkpoints) {
      entities.push(entityType);
      totalRecords += checkpoint.recordCount;

      if (!lastSync || checkpoint.lastSyncTime > lastSync) {
        lastSync = checkpoint.lastSyncTime;
      }

      if (checkpoint.status === 'failed') {
        hasFailures = true;
      } else if (checkpoint.status === 'partial') {
        hasPartial = true;
      }
    }

    return {
      entities,
      lastSync,
      totalRecords,
      status: hasFailures ? 'failed' : hasPartial ? 'partial' : 'healthy',
    };
  }
}

/**
 * Create incremental sync
 */
export function createDatevIncrementalSync(client: DatevClient): DatevIncrementalSync {
  return new DatevIncrementalSync(client);
}
