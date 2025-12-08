/**
 * Odoo Incremental Sync
 * Task: T050
 *
 * Implements incremental synchronization using write_date cursor.
 * Supports checkpoint-based resume and batch processing.
 */

import { ExtractedEvent } from '../base/connector';
import { OdooXmlRpcClient } from './xmlrpcClient';
import { OdooRestClient } from './restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface IncrementalSyncConfig {
  model: string;
  fields: string[];
  domain?: Array<[string, string, unknown]>;
  batchSize?: number;
  dateField?: string;
  orderField?: string;
}

export interface SyncCheckpoint {
  model: string;
  lastSyncDate: Date;
  lastId: number;
  processedCount: number;
  metadata?: Record<string, unknown>;
}

export interface IncrementalSyncResult {
  records: Array<Record<string, unknown>>;
  events: ExtractedEvent[];
  checkpoint: SyncCheckpoint;
  hasMore: boolean;
  stats: {
    fetched: number;
    created: number;
    updated: number;
    errors: number;
  };
}

export interface SyncProgress {
  model: string;
  current: number;
  total: number;
  stage: 'fetching' | 'processing' | 'complete';
  message: string;
}

export class OdooIncrementalSync {
  private client: OdooClient;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();
  private onProgress?: (progress: SyncProgress) => void;

  constructor(client: OdooClient, onProgress?: (progress: SyncProgress) => void) {
    this.client = client;
    this.onProgress = onProgress;
  }

  /**
   * Perform incremental sync for a model
   */
  async sync(
    config: IncrementalSyncConfig,
    organizationId: string,
    checkpoint?: SyncCheckpoint
  ): Promise<IncrementalSyncResult> {
    const {
      model,
      fields,
      domain = [],
      batchSize = 100,
      dateField = 'write_date',
      orderField = 'write_date',
    } = config;

    const currentCheckpoint = checkpoint || this.checkpoints.get(model);
    const records: Array<Record<string, unknown>> = [];
    const events: ExtractedEvent[] = [];
    const stats = { fetched: 0, created: 0, updated: 0, errors: 0 };

    // Build domain with date filter
    const syncDomain: Array<[string, string, unknown]> = [...domain];

    if (currentCheckpoint?.lastSyncDate) {
      syncDomain.push([
        dateField,
        '>',
        currentCheckpoint.lastSyncDate.toISOString().replace('T', ' ').slice(0, 19),
      ]);
    }

    // Get total count for progress
    const totalCount = await this.client.searchCount(model, syncDomain);

    this.reportProgress({
      model,
      current: 0,
      total: totalCount,
      stage: 'fetching',
      message: `Starting sync of ${model}...`,
    });

    // Ensure we have write_date and id in fields
    const fieldsToFetch = [...new Set([...fields, dateField, 'id', 'create_date'])];

    let offset = 0;
    let hasMore = true;
    let lastWriteDate: Date | null = null;
    let lastId = 0;

    while (hasMore) {
      const batch = await this.client.searchRead<Record<string, unknown>>(
        model,
        syncDomain,
        {
          fields: fieldsToFetch,
          limit: batchSize,
          offset,
          order: `${orderField} asc, id asc`,
        }
      );

      stats.fetched += batch.length;

      this.reportProgress({
        model,
        current: stats.fetched,
        total: totalCount,
        stage: 'processing',
        message: `Processing ${stats.fetched} of ${totalCount} records...`,
      });

      for (const record of batch) {
        try {
          records.push(record);

          // Track last write_date
          const writeDate = record[dateField] as string;
          if (writeDate) {
            lastWriteDate = new Date(writeDate);
          }
          lastId = record.id as number;

          // Determine event type
          const createDate = new Date(record.create_date as string);
          const updateDate = new Date(record[dateField] as string);
          const isNew = Math.abs(updateDate.getTime() - createDate.getTime()) < 60000;

          if (isNew) {
            stats.created++;
          } else {
            stats.updated++;
          }

          // Create event
          events.push(this.recordToEvent(model, record, organizationId, isNew));
        } catch (error) {
          stats.errors++;
          console.error(`Error processing record ${record.id}:`, error);
        }
      }

      hasMore = batch.length === batchSize;
      offset += batchSize;
    }

    // Create new checkpoint
    const newCheckpoint: SyncCheckpoint = {
      model,
      lastSyncDate: lastWriteDate || new Date(),
      lastId,
      processedCount: (currentCheckpoint?.processedCount || 0) + stats.fetched,
    };

    this.checkpoints.set(model, newCheckpoint);

    this.reportProgress({
      model,
      current: stats.fetched,
      total: totalCount,
      stage: 'complete',
      message: `Sync complete: ${stats.created} created, ${stats.updated} updated`,
    });

    return {
      records,
      events,
      checkpoint: newCheckpoint,
      hasMore: false,
      stats,
    };
  }

  /**
   * Sync multiple models
   */
  async syncModels(
    configs: IncrementalSyncConfig[],
    organizationId: string,
    checkpoints?: Map<string, SyncCheckpoint>
  ): Promise<Map<string, IncrementalSyncResult>> {
    const results = new Map<string, IncrementalSyncResult>();

    for (const config of configs) {
      const checkpoint = checkpoints?.get(config.model);
      const result = await this.sync(config, organizationId, checkpoint);
      results.set(config.model, result);
    }

    return results;
  }

  /**
   * Get changes since checkpoint
   */
  async getChanges(
    model: string,
    checkpoint: SyncCheckpoint,
    fields: string[]
  ): Promise<{
    created: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
    deleted: number[];
  }> {
    const dateField = 'write_date';

    // Get records modified since checkpoint
    const modified = await this.client.searchRead<Record<string, unknown>>(
      model,
      [[dateField, '>', checkpoint.lastSyncDate.toISOString().replace('T', ' ').slice(0, 19)]],
      {
        fields: [...fields, 'create_date', dateField],
        order: `${dateField} asc`,
      }
    );

    const created: Array<Record<string, unknown>> = [];
    const updated: Array<Record<string, unknown>> = [];

    for (const record of modified) {
      const createDate = new Date(record.create_date as string);
      const updateDate = new Date(record[dateField] as string);

      if (createDate > checkpoint.lastSyncDate) {
        created.push(record);
      } else {
        updated.push(record);
      }
    }

    // Note: Odoo doesn't track deletions by default
    // Would need message_ids or audit log to track deletions

    return { created, updated, deleted: [] };
  }

  /**
   * Set checkpoint manually
   */
  setCheckpoint(model: string, checkpoint: SyncCheckpoint): void {
    this.checkpoints.set(model, checkpoint);
  }

  /**
   * Get current checkpoint
   */
  getCheckpoint(model: string): SyncCheckpoint | undefined {
    return this.checkpoints.get(model);
  }

  /**
   * Clear checkpoint
   */
  clearCheckpoint(model: string): void {
    this.checkpoints.delete(model);
  }

  /**
   * Clear all checkpoints
   */
  clearAllCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * Get all checkpoints
   */
  getAllCheckpoints(): Map<string, SyncCheckpoint> {
    return new Map(this.checkpoints);
  }

  /**
   * Convert record to event
   */
  private recordToEvent(
    model: string,
    record: Record<string, unknown>,
    organizationId: string,
    isNew: boolean
  ): ExtractedEvent {
    const modelPrefix = model.replace('.', '_');
    const eventType = isNew
      ? `erp.${modelPrefix}.created`
      : `erp.${modelPrefix}.updated`;

    return {
      type: eventType,
      timestamp: new Date(record.write_date as string),
      actorId: undefined,
      targetId: String(record.id),
      metadata: {
        source: 'odoo',
        organizationId,
        model,
        recordId: record.id,
        ...record,
      },
    };
  }

  /**
   * Report progress
   */
  private reportProgress(progress: SyncProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }
}

/**
 * Standard sync configurations for common models
 */
export const STANDARD_SYNC_CONFIGS: Record<string, IncrementalSyncConfig> = {
  'res.partner': {
    model: 'res.partner',
    fields: [
      'name', 'email', 'phone', 'street', 'city', 'zip',
      'country_id', 'is_company', 'customer_rank', 'supplier_rank',
      'parent_id', 'child_ids', 'active',
    ],
    domain: [['active', '=', true]],
    batchSize: 200,
  },
  'product.product': {
    model: 'product.product',
    fields: [
      'name', 'default_code', 'barcode', 'type', 'categ_id',
      'list_price', 'standard_price', 'active',
    ],
    domain: [['active', '=', true]],
    batchSize: 200,
  },
  'sale.order': {
    model: 'sale.order',
    fields: [
      'name', 'partner_id', 'state', 'date_order',
      'amount_total', 'amount_untaxed', 'amount_tax',
      'currency_id', 'user_id', 'order_line',
    ],
    batchSize: 100,
  },
  'purchase.order': {
    model: 'purchase.order',
    fields: [
      'name', 'partner_id', 'state', 'date_order',
      'amount_total', 'amount_untaxed', 'amount_tax',
      'currency_id', 'user_id', 'order_line',
    ],
    batchSize: 100,
  },
  'account.move': {
    model: 'account.move',
    fields: [
      'name', 'partner_id', 'move_type', 'state',
      'invoice_date', 'date', 'amount_total', 'amount_untaxed',
      'amount_tax', 'amount_residual', 'currency_id',
    ],
    domain: [['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']]],
    batchSize: 100,
  },
  'stock.picking': {
    model: 'stock.picking',
    fields: [
      'name', 'partner_id', 'picking_type_id', 'location_id',
      'location_dest_id', 'state', 'scheduled_date', 'date_done',
      'origin', 'move_ids_without_package',
    ],
    batchSize: 100,
  },
};

/**
 * Create incremental sync
 */
export function createOdooIncrementalSync(
  client: OdooClient,
  onProgress?: (progress: SyncProgress) => void
): OdooIncrementalSync {
  return new OdooIncrementalSync(client, onProgress);
}
