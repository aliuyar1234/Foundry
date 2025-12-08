/**
 * Connector Event Ingestion Service
 * Task: T013
 *
 * Handles high-volume ingestion of connector sync events into TimescaleDB.
 * Supports batching, buffering, and async processing for optimal performance.
 */

import { Pool, PoolClient } from 'pg';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectorEvent {
  instanceId: string;
  connectorType: string;
  organizationId: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  action?: 'created' | 'updated' | 'deleted';
  status: 'success' | 'failed' | 'skipped';
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  batchId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export interface RateLimitEvent {
  instanceId: string;
  connectorType: string;
  endpoint?: string;
  windowType: 'second' | 'minute' | 'hour' | 'day';
  limit: number;
  consumed: number;
  remaining: number;
  resetAt: Date;
  wasLimited: boolean;
  waitDurationMs?: number;
}

export interface HealthCheckEvent {
  instanceId: string;
  connectorType: string;
  organizationId: string;
  status: 'connected' | 'degraded' | 'disconnected' | 'error';
  isHealthy: boolean;
  latencyMs?: number;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

export interface IngestionConfig {
  batchSize?: number; // Events per batch, default: 100
  flushIntervalMs?: number; // Max time before flush, default: 5000
  maxBufferSize?: number; // Max events in buffer, default: 10000
  retryAttempts?: number; // Retry count on failure, default: 3
  retryDelayMs?: number; // Base retry delay, default: 1000
}

interface BufferedEvent {
  type: 'connector' | 'rate_limit' | 'health';
  data: ConnectorEvent | RateLimitEvent | HealthCheckEvent;
  timestamp: Date;
}

export class EventIngestionService extends EventEmitter {
  private pool: Pool;
  private redis: Redis | null;
  private buffer: BufferedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private config: Required<IngestionConfig>;
  private stats = {
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
    batchesFlushed: 0,
    lastFlushTime: null as Date | null,
  };

  constructor(
    pool: Pool,
    redis: Redis | null,
    config: IngestionConfig = {}
  ) {
    super();
    this.pool = pool;
    this.redis = redis;
    this.config = {
      batchSize: config.batchSize || 100,
      flushIntervalMs: config.flushIntervalMs || 5000,
      maxBufferSize: config.maxBufferSize || 10000,
      retryAttempts: config.retryAttempts || 3,
      retryDelayMs: config.retryDelayMs || 1000,
    };

    this.startFlushTimer();
  }

  /**
   * Ingest a connector event
   */
  async ingestEvent(event: ConnectorEvent): Promise<void> {
    this.addToBuffer({
      type: 'connector',
      data: { ...event, createdAt: event.createdAt || new Date() },
      timestamp: new Date(),
    });
  }

  /**
   * Ingest multiple connector events
   */
  async ingestEvents(events: ConnectorEvent[]): Promise<void> {
    for (const event of events) {
      await this.ingestEvent(event);
    }
  }

  /**
   * Ingest a rate limit event
   */
  async ingestRateLimitEvent(event: RateLimitEvent): Promise<void> {
    this.addToBuffer({
      type: 'rate_limit',
      data: event,
      timestamp: new Date(),
    });
  }

  /**
   * Ingest a health check event
   */
  async ingestHealthEvent(event: HealthCheckEvent): Promise<void> {
    this.addToBuffer({
      type: 'health',
      data: event,
      timestamp: new Date(),
    });
  }

  /**
   * Create a batch ID for grouping events
   */
  createBatchId(): string {
    return uuidv4();
  }

  /**
   * Force flush all buffered events
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    await this.processBuffer();
  }

  /**
   * Get ingestion statistics
   */
  getStats(): typeof this.stats & { bufferSize: number } {
    return {
      ...this.stats,
      bufferSize: this.buffer.length,
    };
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining events
    await this.flush();
  }

  // Private methods

  private addToBuffer(event: BufferedEvent): void {
    this.buffer.push(event);
    this.stats.totalEvents++;

    // Check if buffer is full
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.emit('buffer_full', { size: this.buffer.length });
      this.processBuffer().catch((err) => {
        this.emit('error', err);
      });
    }

    // Check if batch is ready
    if (this.buffer.length >= this.config.batchSize && !this.isProcessing) {
      this.processBuffer().catch((err) => {
        this.emit('error', err);
      });
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0 && !this.isProcessing) {
        this.processBuffer().catch((err) => {
          this.emit('error', err);
        });
      }
    }, this.config.flushIntervalMs);
  }

  private async processBuffer(): Promise<void> {
    if (this.isProcessing || this.buffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Take events from buffer
    const events = this.buffer.splice(0, this.config.batchSize);

    try {
      await this.insertEvents(events);
      this.stats.successfulEvents += events.length;
      this.stats.batchesFlushed++;
      this.stats.lastFlushTime = new Date();
      this.emit('flush_complete', { count: events.length });
    } catch (error) {
      // Put events back in buffer for retry
      this.buffer.unshift(...events);
      this.stats.failedEvents += events.length;
      this.emit('flush_error', { error, count: events.length });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async insertEvents(events: BufferedEvent[]): Promise<void> {
    const connectorEvents: ConnectorEvent[] = [];
    const rateLimitEvents: RateLimitEvent[] = [];
    const healthEvents: HealthCheckEvent[] = [];

    // Group events by type
    for (const event of events) {
      switch (event.type) {
        case 'connector':
          connectorEvents.push(event.data as ConnectorEvent);
          break;
        case 'rate_limit':
          rateLimitEvents.push(event.data as RateLimitEvent);
          break;
        case 'health':
          healthEvents.push(event.data as HealthCheckEvent);
          break;
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (connectorEvents.length > 0) {
        await this.insertConnectorEvents(client, connectorEvents);
      }

      if (rateLimitEvents.length > 0) {
        await this.insertRateLimitEvents(client, rateLimitEvents);
      }

      if (healthEvents.length > 0) {
        await this.insertHealthEvents(client, healthEvents);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertConnectorEvents(
    client: PoolClient,
    events: ConnectorEvent[]
  ): Promise<void> {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const event of events) {
      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );

      values.push(
        event.instanceId,
        event.connectorType,
        event.organizationId,
        event.eventType,
        event.resourceType || null,
        event.resourceId || null,
        event.action || null,
        event.status,
        event.errorCode || null,
        event.errorMessage || null,
        event.durationMs || null,
        event.batchId || null,
        JSON.stringify(event.metadata || {})
      );
    }

    const query = `
      INSERT INTO connector_events_ts (
        instance_id, connector_type, organization_id, event_type,
        resource_type, resource_id, action, status,
        error_code, error_message, duration_ms, batch_id, metadata
      ) VALUES ${placeholders.join(', ')}
    `;

    await client.query(query, values);
  }

  private async insertRateLimitEvents(
    client: PoolClient,
    events: RateLimitEvent[]
  ): Promise<void> {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const event of events) {
      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );

      values.push(
        event.instanceId,
        event.connectorType,
        event.endpoint || null,
        event.windowType,
        event.limit,
        event.consumed,
        event.remaining,
        event.resetAt,
        event.wasLimited,
        event.waitDurationMs || null
      );
    }

    const query = `
      INSERT INTO connector_rate_limits_ts (
        instance_id, connector_type, endpoint, window_type,
        limit_value, consumed, remaining, reset_at,
        was_limited, wait_duration_ms
      ) VALUES ${placeholders.join(', ')}
    `;

    await client.query(query, values);
  }

  private async insertHealthEvents(
    client: PoolClient,
    events: HealthCheckEvent[]
  ): Promise<void> {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const event of events) {
      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );

      values.push(
        event.instanceId,
        event.connectorType,
        event.organizationId,
        event.status,
        event.isHealthy,
        event.latencyMs || null,
        event.errorMessage || null,
        JSON.stringify(event.details || {})
      );
    }

    const query = `
      INSERT INTO connector_health_ts (
        instance_id, connector_type, organization_id, status,
        is_healthy, latency_ms, error_message, details
      ) VALUES ${placeholders.join(', ')}
    `;

    await client.query(query, values);
  }
}

/**
 * Query helpers for connector events
 */
export class ConnectorEventQueries {
  constructor(private pool: Pool) {}

  /**
   * Get sync summary for a connector
   */
  async getSyncSummary(
    instanceId: string,
    startTime: Date = new Date(Date.now() - 24 * 60 * 60 * 1000),
    endTime: Date = new Date()
  ): Promise<{
    totalEvents: number;
    successCount: number;
    failureCount: number;
    uniqueResources: number;
    avgDurationMs: number | null;
    errorRate: number;
  }> {
    const result = await this.pool.query(
      'SELECT * FROM get_connector_sync_summary($1, $2, $3)',
      [instanceId, startTime, endTime]
    );

    const row = result.rows[0];
    return {
      totalEvents: parseInt(row.total_events) || 0,
      successCount: parseInt(row.success_count) || 0,
      failureCount: parseInt(row.failure_count) || 0,
      uniqueResources: parseInt(row.unique_resources) || 0,
      avgDurationMs: row.avg_duration_ms ? parseFloat(row.avg_duration_ms) : null,
      errorRate: row.error_rate ? parseFloat(row.error_rate) : 0,
    };
  }

  /**
   * Get recent events for a connector
   */
  async getRecentEvents(
    instanceId: string,
    limit: number = 100
  ): Promise<ConnectorEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM connector_events_ts
       WHERE instance_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [instanceId, limit]
    );

    return result.rows.map((row) => ({
      instanceId: row.instance_id,
      connectorType: row.connector_type,
      organizationId: row.organization_id,
      eventType: row.event_type,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      action: row.action,
      status: row.status,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      batchId: row.batch_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get hourly metrics for a connector
   */
  async getHourlyMetrics(
    instanceId: string,
    hours: number = 24
  ): Promise<
    Array<{
      bucket: Date;
      eventCount: number;
      successCount: number;
      failureCount: number;
      avgDurationMs: number | null;
    }>
  > {
    const result = await this.pool.query(
      `SELECT
         bucket,
         SUM(event_count) as event_count,
         SUM(success_count) as success_count,
         SUM(failure_count) as failure_count,
         AVG(avg_duration_ms) as avg_duration_ms
       FROM connector_sync_metrics_hourly
       WHERE instance_id = $1
         AND bucket >= NOW() - make_interval(hours => $2)
       GROUP BY bucket
       ORDER BY bucket DESC`,
      [instanceId, hours]
    );

    return result.rows.map((row) => ({
      bucket: row.bucket,
      eventCount: parseInt(row.event_count) || 0,
      successCount: parseInt(row.success_count) || 0,
      failureCount: parseInt(row.failure_count) || 0,
      avgDurationMs: row.avg_duration_ms
        ? parseFloat(row.avg_duration_ms)
        : null,
    }));
  }

  /**
   * Get uptime for a connector
   */
  async getUptime(
    instanceId: string,
    days: number = 7
  ): Promise<
    Array<{
      bucket: Date;
      totalChecks: number;
      healthyChecks: number;
      uptimePercent: number;
      avgLatencyMs: number | null;
    }>
  > {
    const result = await this.pool.query(
      `SELECT * FROM connector_uptime_daily
       WHERE instance_id = $1
         AND bucket >= NOW() - make_interval(days => $2)
       ORDER BY bucket DESC`,
      [instanceId, days]
    );

    return result.rows.map((row) => ({
      bucket: row.bucket,
      totalChecks: parseInt(row.total_checks) || 0,
      healthyChecks: parseInt(row.healthy_checks) || 0,
      uptimePercent: parseFloat(row.uptime_percent) || 0,
      avgLatencyMs: row.avg_latency_ms
        ? parseFloat(row.avg_latency_ms)
        : null,
    }));
  }
}

/**
 * Singleton instance
 */
let eventIngestionInstance: EventIngestionService | null = null;

export function getEventIngestionService(
  pool: Pool,
  redis?: Redis | null,
  config?: IngestionConfig
): EventIngestionService {
  if (!eventIngestionInstance) {
    eventIngestionInstance = new EventIngestionService(
      pool,
      redis || null,
      config
    );
  }
  return eventIngestionInstance;
}
