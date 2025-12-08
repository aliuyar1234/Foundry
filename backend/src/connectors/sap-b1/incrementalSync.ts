/**
 * SAP B1 Incremental Sync
 * Task: T068
 *
 * Handles incremental synchronization using UpdateDate cursor.
 * Manages sync checkpoints and change detection.
 */

import { ExtractedEvent } from '../base/connector';
import { SapB1Client } from './sapClient';

export interface SyncCheckpoint {
  entityType: string;
  lastSyncTime: Date;
  lastDocEntry?: number;
  recordCount: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface IncrementalSyncConfig {
  entityType: string;
  batchSize: number;
  dateField: string;
  keyField: string;
  expandFields?: string[];
  additionalFilters?: string[];
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

// Standard sync configurations for SAP B1 entities
export const SAP_SYNC_CONFIGS: Record<string, IncrementalSyncConfig> = {
  BusinessPartners: {
    entityType: 'BusinessPartners',
    batchSize: 500,
    dateField: 'UpdateDate',
    keyField: 'CardCode',
    expandFields: ['BPAddresses', 'ContactEmployees'],
  },
  Items: {
    entityType: 'Items',
    batchSize: 500,
    dateField: 'UpdateDate',
    keyField: 'ItemCode',
    expandFields: ['ItemPrices'],
  },
  Orders: {
    entityType: 'Orders',
    batchSize: 200,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['DocumentLines'],
  },
  PurchaseOrders: {
    entityType: 'PurchaseOrders',
    batchSize: 200,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['DocumentLines'],
  },
  Invoices: {
    entityType: 'Invoices',
    batchSize: 200,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['DocumentLines'],
  },
  PurchaseInvoices: {
    entityType: 'PurchaseInvoices',
    batchSize: 200,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['DocumentLines'],
  },
  DeliveryNotes: {
    entityType: 'DeliveryNotes',
    batchSize: 200,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['DocumentLines'],
  },
  CreditNotes: {
    entityType: 'CreditNotes',
    batchSize: 200,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['DocumentLines'],
  },
  IncomingPayments: {
    entityType: 'IncomingPayments',
    batchSize: 300,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['PaymentInvoices'],
  },
  VendorPayments: {
    entityType: 'VendorPayments',
    batchSize: 300,
    dateField: 'UpdateDate',
    keyField: 'DocEntry',
    expandFields: ['PaymentInvoices'],
  },
  JournalEntries: {
    entityType: 'JournalEntries',
    batchSize: 300,
    dateField: 'UpdateDate',
    keyField: 'JdtNum',
    expandFields: ['JournalEntryLines'],
  },
  ApprovalRequests: {
    entityType: 'ApprovalRequests',
    batchSize: 100,
    dateField: 'UpdateDate',
    keyField: 'WddCode',
  },
};

export class SapIncrementalSync {
  private client: SapB1Client;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(client: SapB1Client) {
    this.client = client;
  }

  /**
   * Perform incremental sync for an entity type
   */
  async syncEntity(
    config: IncrementalSyncConfig,
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

    const startTime = options.lastCheckpoint?.lastSyncTime || new Date(0);
    const maxRecords = options.maxRecords || config.batchSize * 10;

    try {
      // Build query
      const filters: string[] = [
        `${config.dateField} gt '${startTime.toISOString().split('T')[0]}'`,
      ];

      if (config.additionalFilters) {
        filters.push(...config.additionalFilters);
      }

      const queryOptions: Record<string, any> = {
        $filter: filters.join(' and '),
        $orderby: `${config.dateField} asc`,
        $top: Math.min(config.batchSize, maxRecords),
      };

      if (config.expandFields?.length) {
        queryOptions.$expand = config.expandFields.join(',');
      }

      const response = await this.client.query<any>(config.entityType, queryOptions);

      let latestDate = startTime;
      let latestKey: string | number | undefined;

      for (const record of response.value) {
        try {
          const recordDate = new Date(record[config.dateField]);
          const createDate = record.CreateDate ? new Date(record.CreateDate) : recordDate;
          const isNew = Math.abs(recordDate.getTime() - createDate.getTime()) < 60000;

          // Create event
          const event = this.recordToEvent(
            record,
            config,
            options.organizationId,
            isNew
          );
          events.push(event);

          // Update stats
          stats.processed++;
          if (isNew) {
            stats.created++;
          } else {
            stats.updated++;
          }

          // Track latest
          if (recordDate > latestDate) {
            latestDate = recordDate;
            latestKey = record[config.keyField];
          }
        } catch (error) {
          console.warn(`Error processing ${config.entityType} record:`, error);
          stats.errors++;
        }
      }

      // Check if more records exist
      const hasMore = response.value.length >= config.batchSize;

      // Create checkpoint
      const checkpoint: SyncCheckpoint = {
        entityType: config.entityType,
        lastSyncTime: latestDate,
        lastDocEntry: typeof latestKey === 'number' ? latestKey : undefined,
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : stats.errors < stats.processed ? 'partial' : 'failed',
      };

      this.checkpoints.set(config.entityType, checkpoint);

      return { events, checkpoint, hasMore, stats };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: config.entityType,
        lastSyncTime: startTime,
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync all configured entity types
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

    const entityTypes = options.entityTypes || Object.keys(SAP_SYNC_CONFIGS);

    for (const entityType of entityTypes) {
      const config = SAP_SYNC_CONFIGS[entityType];
      if (!config) {
        console.warn(`No sync config found for ${entityType}`);
        continue;
      }

      const lastCheckpoint = options.checkpoints?.get(entityType);

      const result = await this.syncEntity(config, {
        organizationId: options.organizationId,
        lastCheckpoint,
        maxRecords: options.maxRecordsPerEntity,
      });

      allEvents.push(...result.events);
      checkpoints.set(entityType, result.checkpoint);
      stats[entityType] = result.stats;

      // Continue fetching if more records exist
      let hasMore = result.hasMore;
      let currentCheckpoint = result.checkpoint;

      while (hasMore && allEvents.length < (options.maxRecordsPerEntity || 10000)) {
        const moreResult = await this.syncEntity(config, {
          organizationId: options.organizationId,
          lastCheckpoint: currentCheckpoint,
          maxRecords: options.maxRecordsPerEntity,
        });

        allEvents.push(...moreResult.events);
        currentCheckpoint = moreResult.checkpoint;
        hasMore = moreResult.hasMore;

        // Accumulate stats
        stats[entityType].processed += moreResult.stats.processed;
        stats[entityType].created += moreResult.stats.created;
        stats[entityType].updated += moreResult.stats.updated;
        stats[entityType].errors += moreResult.stats.errors;
      }

      checkpoints.set(entityType, currentCheckpoint);
    }

    return { events: allEvents, checkpoints, stats };
  }

  /**
   * Get changes since a specific date
   */
  async getChangesSince(
    entityType: string,
    since: Date,
    options: {
      organizationId: string;
      limit?: number;
    }
  ): Promise<ExtractedEvent[]> {
    const config = SAP_SYNC_CONFIGS[entityType];
    if (!config) {
      throw new Error(`No sync config found for ${entityType}`);
    }

    const checkpoint: SyncCheckpoint = {
      entityType,
      lastSyncTime: since,
      recordCount: 0,
      status: 'success',
    };

    const result = await this.syncEntity(config, {
      organizationId: options.organizationId,
      lastCheckpoint: checkpoint,
      maxRecords: options.limit,
    });

    return result.events;
  }

  /**
   * Detect deleted records (using tombstone or comparison)
   */
  async detectDeletedRecords(
    entityType: string,
    knownKeys: Set<string | number>,
    options: { organizationId: string }
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];
    const config = SAP_SYNC_CONFIGS[entityType];

    if (!config) {
      return events;
    }

    try {
      // Get all current keys
      const response = await this.client.query<any>(entityType, {
        $select: config.keyField,
      });

      const currentKeys = new Set(
        response.value.map((r: any) => r[config.keyField])
      );

      // Find deleted (keys in known but not in current)
      for (const key of knownKeys) {
        if (!currentKeys.has(key)) {
          events.push({
            type: `erp.${entityType.toLowerCase()}.deleted`,
            timestamp: new Date(),
            actorId: undefined,
            targetId: String(key),
            metadata: {
              source: 'sap_b1',
              organizationId: options.organizationId,
              entityType,
              [config.keyField]: key,
              deletedAt: new Date().toISOString(),
            },
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to detect deleted records for ${entityType}:`, error);
    }

    return events;
  }

  /**
   * Convert record to event
   */
  private recordToEvent(
    record: any,
    config: IncrementalSyncConfig,
    organizationId: string,
    isNew: boolean
  ): ExtractedEvent {
    const eventType = isNew
      ? `erp.${config.entityType.toLowerCase()}.created`
      : `erp.${config.entityType.toLowerCase()}.updated`;

    const metadata: Record<string, unknown> = {
      source: 'sap_b1',
      organizationId,
      entityType: config.entityType,
    };

    // Copy key fields
    const keyFields = [
      config.keyField,
      config.dateField,
      'CreateDate',
      'DocNum',
      'CardCode',
      'CardName',
      'ItemCode',
      'ItemName',
      'DocTotal',
      'Status',
      'DocumentStatus',
      'Cancelled',
    ];

    for (const field of keyFields) {
      if (field in record) {
        metadata[field] = record[field];
      }
    }

    return {
      type: eventType,
      timestamp: new Date(record[config.dateField]),
      actorId: record.UserSign?.toString(),
      targetId: String(record[config.keyField]),
      metadata,
    };
  }

  /**
   * Get checkpoint for entity type
   */
  getCheckpoint(entityType: string): SyncCheckpoint | undefined {
    return this.checkpoints.get(entityType);
  }

  /**
   * Set checkpoint for entity type
   */
  setCheckpoint(checkpoint: SyncCheckpoint): void {
    this.checkpoints.set(checkpoint.entityType, checkpoint);
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * Get sync status summary
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
 * Create incremental sync handler
 */
export function createSapIncrementalSync(client: SapB1Client): SapIncrementalSync {
  return new SapIncrementalSync(client);
}
