/**
 * HubSpot Incremental Sync
 * Task: T104
 *
 * Handles incremental synchronization using updatedAt cursor.
 * Manages sync checkpoints and change detection.
 */

import { ExtractedEvent } from '../base/connector';
import { HubSpotClient, HubSpotObject, HubSpotPaginatedResult } from './hubspotClient';

export interface SyncCheckpoint {
  objectType: string;
  lastSyncTime: Date;
  lastObjectId?: string;
  recordCount: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface IncrementalSyncConfig {
  objectType: string;
  batchSize: number;
  properties: string[];
}

export interface IncrementalSyncResult {
  events: ExtractedEvent[];
  checkpoint: SyncCheckpoint;
  hasMore: boolean;
  stats: {
    processed: number;
    created: number;
    updated: number;
    archived: number;
    errors: number;
  };
}

// Standard sync configurations for HubSpot objects
export const HUBSPOT_SYNC_CONFIGS: Record<string, IncrementalSyncConfig> = {
  contacts: {
    objectType: 'contacts',
    batchSize: 100,
    properties: [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'company', 'jobtitle', 'city', 'state', 'country', 'zip', 'address',
      'hubspot_owner_id', 'lifecyclestage', 'hs_lead_status', 'createdate',
    ],
  },
  companies: {
    objectType: 'companies',
    batchSize: 100,
    properties: [
      'name', 'domain', 'industry', 'phone', 'website', 'description',
      'city', 'state', 'country', 'zip', 'address',
      'annualrevenue', 'numberofemployees', 'hubspot_owner_id', 'lifecyclestage', 'createdate',
    ],
  },
  deals: {
    objectType: 'deals',
    batchSize: 100,
    properties: [
      'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
      'hubspot_owner_id', 'description', 'dealtype', 'hs_priority',
      'hs_deal_stage_probability', 'createdate',
    ],
  },
  tickets: {
    objectType: 'tickets',
    batchSize: 100,
    properties: [
      'subject', 'content', 'hs_pipeline', 'hs_pipeline_stage',
      'hs_ticket_priority', 'hubspot_owner_id', 'createdate',
      'hs_lastmodifieddate', 'closed_date',
    ],
  },
};

export class HubSpotIncrementalSync {
  private client: HubSpotClient;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(client: HubSpotClient) {
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
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      archived: 0,
      errors: 0,
    };

    const startTime = options.lastCheckpoint?.lastSyncTime || new Date(0);
    const maxRecords = options.maxRecords || config.batchSize * 10;

    try {
      let after: string | undefined;
      let latestDate = startTime;
      let latestId: string | undefined;

      do {
        // HubSpot v3 search API for incremental sync
        const searchBody = {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'hs_lastmodifieddate',
                  operator: 'GT',
                  value: startTime.getTime().toString(),
                },
              ],
            },
          ],
          sorts: [
            {
              propertyName: 'hs_lastmodifieddate',
              direction: 'ASCENDING',
            },
          ],
          properties: config.properties,
          limit: Math.min(config.batchSize, maxRecords - stats.processed),
          after: after ? parseInt(after, 10) : undefined,
        };

        const response = await (this.client as any).request<HubSpotPaginatedResult<HubSpotObject>>(
          `/crm/v3/objects/${config.objectType}/search`,
          {
            method: 'POST',
            body: JSON.stringify(searchBody),
          }
        );

        for (const record of response.results) {
          try {
            const recordDate = new Date(record.updatedAt);
            const createDate = new Date(record.createdAt);
            const isNew = Math.abs(recordDate.getTime() - createDate.getTime()) < 60000;
            const isArchived = record.archived;

            // Create event
            const event = this.recordToEvent(
              record,
              config.objectType,
              options.organizationId,
              isNew,
              isArchived
            );
            events.push(event);

            // Update stats
            stats.processed++;
            if (isArchived) {
              stats.archived++;
            } else if (isNew) {
              stats.created++;
            } else {
              stats.updated++;
            }

            // Track latest
            if (recordDate > latestDate) {
              latestDate = recordDate;
              latestId = record.id;
            }
          } catch (error) {
            console.warn(`Error processing ${config.objectType} record:`, error);
            stats.errors++;
          }

          if (stats.processed >= maxRecords) break;
        }

        after = response.paging?.next?.after;
      } while (after && stats.processed < maxRecords);

      // Check if more records exist
      const hasMore = Boolean(after) && stats.processed >= maxRecords;

      // Create checkpoint
      const checkpoint: SyncCheckpoint = {
        objectType: config.objectType,
        lastSyncTime: latestDate,
        lastObjectId: latestId,
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
    }
  ): Promise<{
    events: ExtractedEvent[];
    checkpoints: Map<string, SyncCheckpoint>;
    stats: Record<string, IncrementalSyncResult['stats']>;
  }> {
    const allEvents: ExtractedEvent[] = [];
    const checkpoints = new Map<string, SyncCheckpoint>();
    const stats: Record<string, IncrementalSyncResult['stats']> = {};

    const objectTypes = options.objectTypes || Object.keys(HUBSPOT_SYNC_CONFIGS);

    for (const objectType of objectTypes) {
      const config = HUBSPOT_SYNC_CONFIGS[objectType];
      if (!config) {
        console.warn(`No sync config found for ${objectType}`);
        continue;
      }

      const lastCheckpoint = options.checkpoints?.get(objectType);

      const result = await this.syncObject(config, {
        organizationId: options.organizationId,
        lastCheckpoint,
        maxRecords: options.maxRecordsPerObject,
      });

      allEvents.push(...result.events);
      checkpoints.set(objectType, result.checkpoint);
      stats[objectType] = result.stats;

      // Continue fetching if more records exist
      let hasMore = result.hasMore;
      let currentCheckpoint = result.checkpoint;

      while (hasMore) {
        const moreResult = await this.syncObject(config, {
          organizationId: options.organizationId,
          lastCheckpoint: currentCheckpoint,
          maxRecords: options.maxRecordsPerObject,
        });

        allEvents.push(...moreResult.events);
        currentCheckpoint = moreResult.checkpoint;
        hasMore = moreResult.hasMore;

        // Accumulate stats
        stats[objectType].processed += moreResult.stats.processed;
        stats[objectType].created += moreResult.stats.created;
        stats[objectType].updated += moreResult.stats.updated;
        stats[objectType].archived += moreResult.stats.archived;
        stats[objectType].errors += moreResult.stats.errors;
      }

      checkpoints.set(objectType, currentCheckpoint);
    }

    return { events: allEvents, checkpoints, stats };
  }

  /**
   * Get recently modified records using search API
   */
  async getRecentlyModified(
    objectType: string,
    since: Date,
    options: {
      organizationId: string;
      limit?: number;
    }
  ): Promise<ExtractedEvent[]> {
    const config = HUBSPOT_SYNC_CONFIGS[objectType];
    if (!config) {
      throw new Error(`No sync config found for ${objectType}`);
    }

    const checkpoint: SyncCheckpoint = {
      objectType,
      lastSyncTime: since,
      recordCount: 0,
      status: 'success',
    };

    const result = await this.syncObject(config, {
      organizationId: options.organizationId,
      lastCheckpoint: checkpoint,
      maxRecords: options.limit,
    });

    return result.events;
  }

  /**
   * Convert record to event
   */
  private recordToEvent(
    record: HubSpotObject,
    objectType: string,
    organizationId: string,
    isNew: boolean,
    isArchived: boolean
  ): ExtractedEvent {
    let eventType: string;

    if (isArchived) {
      eventType = `crm.${objectType.slice(0, -1)}.archived`;
    } else if (isNew) {
      eventType = `crm.${objectType.slice(0, -1)}.created`;
    } else {
      eventType = `crm.${objectType.slice(0, -1)}.updated`;
    }

    // Build metadata from properties
    const metadata: Record<string, unknown> = {
      source: 'hubspot',
      organizationId,
      objectType,
      recordId: record.id,
      isArchived,
    };

    // Copy all properties
    for (const [key, value] of Object.entries(record.properties)) {
      if (value !== null) {
        metadata[key] = value;
      }
    }

    metadata.createdAt = record.createdAt;
    metadata.updatedAt = record.updatedAt;

    return {
      type: eventType,
      timestamp: new Date(record.updatedAt),
      actorId: record.properties.hubspot_owner_id || undefined,
      targetId: record.id,
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
export function createHubSpotIncrementalSync(client: HubSpotClient): HubSpotIncrementalSync {
  return new HubSpotIncrementalSync(client);
}
