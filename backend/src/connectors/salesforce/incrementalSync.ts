/**
 * Salesforce Incremental Sync
 * Task: T086
 *
 * Handles incremental synchronization using SystemModstamp cursor.
 * Manages sync checkpoints and change detection.
 */

import { ExtractedEvent } from '../base/connector';
import { SalesforceClient, SalesforceRecord } from './salesforceClient';

export interface SyncCheckpoint {
  objectType: string;
  lastSyncTime: Date;
  lastRecordId?: string;
  recordCount: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface IncrementalSyncConfig {
  objectType: string;
  batchSize: number;
  fields: string[];
  dateField: 'LastModifiedDate' | 'SystemModstamp';
  orderField: string;
  additionalFilters?: string;
}

export interface IncrementalSyncResult {
  events: ExtractedEvent[];
  checkpoint: SyncCheckpoint;
  hasMore: boolean;
  stats: {
    processed: number;
    created: number;
    updated: number;
    deleted: number;
    errors: number;
  };
}

// Standard sync configurations for Salesforce objects
export const SALESFORCE_SYNC_CONFIGS: Record<string, IncrementalSyncConfig> = {
  Account: {
    objectType: 'Account',
    batchSize: 2000,
    fields: [
      'Id', 'Name', 'Type', 'Industry', 'Phone', 'Website', 'Description',
      'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode', 'BillingCountry',
      'AnnualRevenue', 'NumberOfEmployees', 'OwnerId', 'ParentId', 'IsDeleted',
      'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
  Contact: {
    objectType: 'Contact',
    batchSize: 2000,
    fields: [
      'Id', 'FirstName', 'LastName', 'Name', 'AccountId', 'Title', 'Department',
      'Phone', 'MobilePhone', 'Email', 'OwnerId', 'IsDeleted',
      'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode', 'MailingCountry',
      'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
  Lead: {
    objectType: 'Lead',
    batchSize: 2000,
    fields: [
      'Id', 'FirstName', 'LastName', 'Name', 'Company', 'Title', 'Email', 'Phone',
      'Status', 'Industry', 'LeadSource', 'Rating', 'IsConverted', 'ConvertedAccountId',
      'ConvertedContactId', 'ConvertedOpportunityId', 'OwnerId', 'IsDeleted',
      'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
  Opportunity: {
    objectType: 'Opportunity',
    batchSize: 2000,
    fields: [
      'Id', 'Name', 'AccountId', 'Amount', 'CloseDate', 'StageName', 'Probability',
      'Type', 'LeadSource', 'IsClosed', 'IsWon', 'Description', 'OwnerId',
      'ForecastCategory', 'ForecastCategoryName', 'IsDeleted',
      'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
  Case: {
    objectType: 'Case',
    batchSize: 2000,
    fields: [
      'Id', 'CaseNumber', 'Subject', 'Description', 'Status', 'Priority', 'Origin',
      'Type', 'Reason', 'AccountId', 'ContactId', 'OwnerId', 'IsClosed', 'ClosedDate',
      'IsDeleted', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
  Task: {
    objectType: 'Task',
    batchSize: 2000,
    fields: [
      'Id', 'Subject', 'Description', 'Status', 'Priority', 'ActivityDate',
      'WhoId', 'WhatId', 'OwnerId', 'IsClosed', 'IsHighPriority', 'TaskSubtype',
      'IsDeleted', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
  Event: {
    objectType: 'Event',
    batchSize: 2000,
    fields: [
      'Id', 'Subject', 'Description', 'StartDateTime', 'EndDateTime',
      'IsAllDayEvent', 'DurationInMinutes', 'Location', 'WhoId', 'WhatId',
      'OwnerId', 'ShowAs', 'IsPrivate', 'IsDeleted',
      'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
    ],
    dateField: 'SystemModstamp',
    orderField: 'SystemModstamp',
  },
};

export class SalesforceIncrementalSync {
  private client: SalesforceClient;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Perform incremental sync for an object type
   */
  async syncObject(
    config: IncrementalSyncConfig,
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      maxRecords?: number;
      includeDeleted?: boolean;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: 0,
    };

    const startTime = options.lastCheckpoint?.lastSyncTime || new Date(0);
    const maxRecords = options.maxRecords || config.batchSize * 10;

    try {
      // Build SOQL query
      let soql = `SELECT ${config.fields.join(', ')} FROM ${config.objectType}`;

      const conditions: string[] = [
        `${config.dateField} > ${startTime.toISOString()}`,
      ];

      if (config.additionalFilters) {
        conditions.push(config.additionalFilters);
      }

      soql += ` WHERE ${conditions.join(' AND ')}`;
      soql += ` ORDER BY ${config.orderField} ASC`;
      soql += ` LIMIT ${Math.min(config.batchSize, maxRecords)}`;

      // Use queryAll to include deleted records if requested
      const queryMethod = options.includeDeleted ? 'queryAll' : 'query';
      const result = await (this.client as any)[queryMethod]<any>(soql);

      let latestDate = startTime;
      let latestId: string | undefined;

      for (const record of result.records || []) {
        try {
          const recordDate = new Date(record[config.dateField]);
          const createdDate = new Date(record.CreatedDate);
          const isNew = Math.abs(recordDate.getTime() - createdDate.getTime()) < 60000;
          const isDeleted = record.IsDeleted === true;

          // Create event
          const event = this.recordToEvent(
            record,
            config.objectType,
            options.organizationId,
            isNew,
            isDeleted
          );
          events.push(event);

          // Update stats
          stats.processed++;
          if (isDeleted) {
            stats.deleted++;
          } else if (isNew) {
            stats.created++;
          } else {
            stats.updated++;
          }

          // Track latest
          if (recordDate > latestDate) {
            latestDate = recordDate;
            latestId = record.Id;
          }
        } catch (error) {
          console.warn(`Error processing ${config.objectType} record:`, error);
          stats.errors++;
        }
      }

      // Check if more records exist
      const hasMore = (result.records?.length || 0) >= config.batchSize;

      // Create checkpoint
      const checkpoint: SyncCheckpoint = {
        objectType: config.objectType,
        lastSyncTime: latestDate,
        lastRecordId: latestId,
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : stats.errors < stats.processed ? 'partial' : 'failed',
      };

      this.checkpoints.set(config.objectType, checkpoint);

      return { events, checkpoint, hasMore, stats };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        objectType: config.objectType,
        lastSyncTime: startTime,
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync all configured object types
   */
  async syncAll(
    options: {
      organizationId: string;
      checkpoints?: Map<string, SyncCheckpoint>;
      objectTypes?: string[];
      maxRecordsPerObject?: number;
      includeDeleted?: boolean;
    }
  ): Promise<{
    events: ExtractedEvent[];
    checkpoints: Map<string, SyncCheckpoint>;
    stats: Record<string, IncrementalSyncResult['stats']>;
  }> {
    const allEvents: ExtractedEvent[] = [];
    const checkpoints = new Map<string, SyncCheckpoint>();
    const stats: Record<string, IncrementalSyncResult['stats']> = {};

    const objectTypes = options.objectTypes || Object.keys(SALESFORCE_SYNC_CONFIGS);

    for (const objectType of objectTypes) {
      const config = SALESFORCE_SYNC_CONFIGS[objectType];
      if (!config) {
        console.warn(`No sync config found for ${objectType}`);
        continue;
      }

      const lastCheckpoint = options.checkpoints?.get(objectType);

      const result = await this.syncObject(config, {
        organizationId: options.organizationId,
        lastCheckpoint,
        maxRecords: options.maxRecordsPerObject,
        includeDeleted: options.includeDeleted,
      });

      allEvents.push(...result.events);
      checkpoints.set(objectType, result.checkpoint);
      stats[objectType] = result.stats;

      // Continue fetching if more records exist
      let hasMore = result.hasMore;
      let currentCheckpoint = result.checkpoint;

      while (hasMore && allEvents.length < (options.maxRecordsPerObject || 10000)) {
        const moreResult = await this.syncObject(config, {
          organizationId: options.organizationId,
          lastCheckpoint: currentCheckpoint,
          maxRecords: options.maxRecordsPerObject,
          includeDeleted: options.includeDeleted,
        });

        allEvents.push(...moreResult.events);
        currentCheckpoint = moreResult.checkpoint;
        hasMore = moreResult.hasMore;

        // Accumulate stats
        stats[objectType].processed += moreResult.stats.processed;
        stats[objectType].created += moreResult.stats.created;
        stats[objectType].updated += moreResult.stats.updated;
        stats[objectType].deleted += moreResult.stats.deleted;
        stats[objectType].errors += moreResult.stats.errors;
      }

      checkpoints.set(objectType, currentCheckpoint);
    }

    return { events: allEvents, checkpoints, stats };
  }

  /**
   * Get deleted records using getDeleted API
   */
  async getDeletedRecords(
    objectType: string,
    startDate: Date,
    endDate: Date,
    options: { organizationId: string }
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      // Salesforce getDeleted endpoint
      const start = startDate.toISOString();
      const end = endDate.toISOString();

      const result = await (this.client as any).request(
        `/sobjects/${objectType}/deleted/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );

      for (const deleted of result.deletedRecords || []) {
        events.push({
          type: `crm.${objectType.toLowerCase()}.deleted`,
          timestamp: new Date(deleted.deletedDate),
          actorId: undefined,
          targetId: deleted.id,
          metadata: {
            source: 'salesforce',
            organizationId: options.organizationId,
            objectType,
            recordId: deleted.id,
            deletedDate: deleted.deletedDate,
          },
        });
      }
    } catch (error) {
      console.warn(`Failed to get deleted records for ${objectType}:`, error);
    }

    return events;
  }

  /**
   * Get updated records using getUpdated API
   */
  async getUpdatedRecordIds(
    objectType: string,
    startDate: Date,
    endDate: Date
  ): Promise<string[]> {
    try {
      const start = startDate.toISOString();
      const end = endDate.toISOString();

      const result = await (this.client as any).request(
        `/sobjects/${objectType}/updated/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );

      return result.ids || [];
    } catch (error) {
      console.warn(`Failed to get updated records for ${objectType}:`, error);
      return [];
    }
  }

  /**
   * Convert record to event
   */
  private recordToEvent(
    record: any,
    objectType: string,
    organizationId: string,
    isNew: boolean,
    isDeleted: boolean
  ): ExtractedEvent {
    let eventType: string;

    if (isDeleted) {
      eventType = `crm.${objectType.toLowerCase()}.deleted`;
    } else if (isNew) {
      eventType = `crm.${objectType.toLowerCase()}.created`;
    } else {
      eventType = `crm.${objectType.toLowerCase()}.updated`;
    }

    // Build metadata from record
    const metadata: Record<string, unknown> = {
      source: 'salesforce',
      organizationId,
      objectType,
      recordId: record.Id,
      isDeleted,
    };

    // Copy all fields except attributes
    for (const [key, value] of Object.entries(record)) {
      if (key !== 'attributes') {
        metadata[key] = value;
      }
    }

    return {
      type: eventType,
      timestamp: new Date(record.SystemModstamp || record.LastModifiedDate),
      actorId: record.OwnerId,
      targetId: record.Id,
      metadata,
    };
  }

  /**
   * Get checkpoint for object type
   */
  getCheckpoint(objectType: string): SyncCheckpoint | undefined {
    return this.checkpoints.get(objectType);
  }

  /**
   * Set checkpoint for object type
   */
  setCheckpoint(checkpoint: SyncCheckpoint): void {
    this.checkpoints.set(checkpoint.objectType, checkpoint);
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
    objects: string[];
    lastSync: Date | null;
    totalRecords: number;
    status: 'healthy' | 'partial' | 'failed';
  } {
    const objects: string[] = [];
    let lastSync: Date | null = null;
    let totalRecords = 0;
    let hasFailures = false;
    let hasPartial = false;

    for (const [objectType, checkpoint] of this.checkpoints) {
      objects.push(objectType);
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
      objects,
      lastSync,
      totalRecords,
      status: hasFailures ? 'failed' : hasPartial ? 'partial' : 'healthy',
    };
  }
}

/**
 * Create incremental sync handler
 */
export function createSalesforceIncrementalSync(client: SalesforceClient): SalesforceIncrementalSync {
  return new SalesforceIncrementalSync(client);
}
