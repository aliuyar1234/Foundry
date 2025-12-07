/**
 * TimescaleDB Continuous Aggregate Refresh Processor (T186)
 * Manages refresh of continuous aggregates for time-series data
 */

import { Job } from 'bullmq';
import { Pool } from 'pg';
import { auditService } from '../../services/audit/auditService.js';

// Aggregate configuration
interface AggregateConfig {
  name: string;
  refreshInterval: string; // PostgreSQL interval format
  retentionPeriod: string; // How long to keep aggregated data
  description: string;
}

// Default aggregates to manage
const CONTINUOUS_AGGREGATES: AggregateConfig[] = [
  {
    name: 'events_hourly',
    refreshInterval: '1 hour',
    retentionPeriod: '90 days',
    description: 'Hourly event counts and metrics',
  },
  {
    name: 'events_daily',
    refreshInterval: '1 day',
    retentionPeriod: '2 years',
    description: 'Daily event summaries',
  },
  {
    name: 'communication_hourly',
    refreshInterval: '1 hour',
    retentionPeriod: '30 days',
    description: 'Hourly communication patterns',
  },
  {
    name: 'communication_daily',
    refreshInterval: '1 day',
    retentionPeriod: '1 year',
    description: 'Daily communication summaries',
  },
  {
    name: 'process_execution_hourly',
    refreshInterval: '1 hour',
    retentionPeriod: '30 days',
    description: 'Hourly process execution metrics',
  },
  {
    name: 'process_execution_daily',
    refreshInterval: '1 day',
    retentionPeriod: '2 years',
    description: 'Daily process execution summaries',
  },
];

interface RefreshJobData {
  aggregates?: string[]; // Specific aggregates to refresh, or all if not specified
  forceRefresh?: boolean; // Force refresh even if not due
  startTime?: string; // Custom start time for refresh window
  endTime?: string; // Custom end time for refresh window
}

interface RefreshResult {
  refreshedAggregates: {
    name: string;
    rowsRefreshed: number;
    duration: number;
    error?: string;
  }[];
  totalDuration: number;
  completedAt: Date;
}

// TimescaleDB connection pool
let timescalePool: Pool | null = null;

/**
 * Initialize TimescaleDB connection pool
 */
export function initTimescalePool(connectionString: string): void {
  timescalePool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

/**
 * Process aggregate refresh job
 */
export async function processAggregateRefresh(job: Job<RefreshJobData>): Promise<RefreshResult> {
  const startTime = Date.now();
  const { aggregates, forceRefresh = false, startTime: customStart, endTime: customEnd } = job.data;

  const result: RefreshResult = {
    refreshedAggregates: [],
    totalDuration: 0,
    completedAt: new Date(),
  };

  // Filter aggregates to refresh
  const aggregatesToRefresh = aggregates
    ? CONTINUOUS_AGGREGATES.filter((a) => aggregates.includes(a.name))
    : CONTINUOUS_AGGREGATES;

  if (!timescalePool) {
    // If TimescaleDB is not configured, skip but don't fail
    result.refreshedAggregates = aggregatesToRefresh.map((a) => ({
      name: a.name,
      rowsRefreshed: 0,
      duration: 0,
      error: 'TimescaleDB not configured',
    }));
    result.totalDuration = Date.now() - startTime;
    return result;
  }

  // Refresh each aggregate
  for (let i = 0; i < aggregatesToRefresh.length; i++) {
    const aggregate = aggregatesToRefresh[i];
    const aggregateStart = Date.now();

    await job.updateProgress(Math.round(((i + 1) / aggregatesToRefresh.length) * 100));

    try {
      const refreshResult = await refreshAggregate(
        aggregate,
        forceRefresh,
        customStart,
        customEnd
      );

      result.refreshedAggregates.push({
        name: aggregate.name,
        rowsRefreshed: refreshResult.rowsRefreshed,
        duration: Date.now() - aggregateStart,
      });
    } catch (error) {
      result.refreshedAggregates.push({
        name: aggregate.name,
        rowsRefreshed: 0,
        duration: Date.now() - aggregateStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Log completion
  await auditService.log({
    organizationId: 'system',
    userId: 'system',
    action: 'aggregates.refreshed',
    resourceType: 'aggregate',
    resourceId: job.id || 'manual',
    details: {
      aggregatesRefreshed: result.refreshedAggregates.filter((a) => !a.error).length,
      errors: result.refreshedAggregates.filter((a) => a.error).length,
    },
  });

  result.totalDuration = Date.now() - startTime;
  return result;
}

/**
 * Refresh a single continuous aggregate
 */
async function refreshAggregate(
  aggregate: AggregateConfig,
  forceRefresh: boolean,
  customStart?: string,
  customEnd?: string
): Promise<{ rowsRefreshed: number }> {
  if (!timescalePool) {
    throw new Error('TimescaleDB pool not initialized');
  }

  const client = await timescalePool.connect();

  try {
    // Check if aggregate exists
    const checkResult = await client.query(
      `
      SELECT viewname
      FROM timescaledb_information.continuous_aggregates
      WHERE view_name = $1
      `,
      [aggregate.name]
    );

    if (checkResult.rows.length === 0) {
      // Aggregate doesn't exist, create it
      await createAggregate(client, aggregate);
    }

    // Calculate refresh window
    const endTime = customEnd || 'now()';
    const startTime = customStart || `now() - interval '${aggregate.refreshInterval}'`;

    // Refresh the aggregate
    if (forceRefresh) {
      // Force complete refresh
      await client.query(
        `
        CALL refresh_continuous_aggregate($1, NULL, NULL)
        `,
        [aggregate.name]
      );
    } else {
      // Incremental refresh
      await client.query(
        `
        CALL refresh_continuous_aggregate($1, ${startTime}, ${endTime})
        `,
        [aggregate.name]
      );
    }

    // Get row count (approximate)
    const countResult = await client.query(
      `SELECT count(*) as count FROM ${aggregate.name}`
    );
    const rowsRefreshed = parseInt(countResult.rows[0]?.count || '0', 10);

    return { rowsRefreshed };
  } finally {
    client.release();
  }
}

/**
 * Create a continuous aggregate if it doesn't exist
 */
async function createAggregate(client: any, aggregate: AggregateConfig): Promise<void> {
  // Note: Actual SQL depends on the specific aggregate schema
  // This is a template that would need to be customized per aggregate

  const createStatements: Record<string, string> = {
    events_hourly: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS events_hourly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', timestamp) as bucket,
        organization_id,
        event_type,
        count(*) as event_count,
        count(DISTINCT actor_id) as unique_actors
      FROM events
      GROUP BY bucket, organization_id, event_type
      WITH NO DATA
    `,
    events_daily: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS events_daily
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', timestamp) as bucket,
        organization_id,
        event_type,
        count(*) as event_count,
        count(DISTINCT actor_id) as unique_actors,
        avg(duration_ms) as avg_duration
      FROM events
      GROUP BY bucket, organization_id, event_type
      WITH NO DATA
    `,
    communication_hourly: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS communication_hourly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', timestamp) as bucket,
        organization_id,
        communication_type,
        count(*) as message_count,
        count(DISTINCT sender_id) as unique_senders,
        count(DISTINCT recipient_id) as unique_recipients
      FROM communication_events
      GROUP BY bucket, organization_id, communication_type
      WITH NO DATA
    `,
    communication_daily: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS communication_daily
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', timestamp) as bucket,
        organization_id,
        communication_type,
        count(*) as message_count,
        count(DISTINCT sender_id) as unique_senders,
        count(DISTINCT recipient_id) as unique_recipients,
        avg(response_time_minutes) as avg_response_time
      FROM communication_events
      GROUP BY bucket, organization_id, communication_type
      WITH NO DATA
    `,
    process_execution_hourly: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS process_execution_hourly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', started_at) as bucket,
        organization_id,
        process_id,
        count(*) as execution_count,
        avg(duration_ms) as avg_duration,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration
      FROM process_executions
      GROUP BY bucket, organization_id, process_id
      WITH NO DATA
    `,
    process_execution_daily: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS process_execution_daily
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', started_at) as bucket,
        organization_id,
        process_id,
        count(*) as execution_count,
        sum(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        avg(duration_ms) as avg_duration,
        min(duration_ms) as min_duration,
        max(duration_ms) as max_duration
      FROM process_executions
      GROUP BY bucket, organization_id, process_id
      WITH NO DATA
    `,
  };

  const createSQL = createStatements[aggregate.name];
  if (createSQL) {
    await client.query(createSQL);

    // Set up refresh policy
    await client.query(
      `
      SELECT add_continuous_aggregate_policy($1,
        start_offset => interval '${aggregate.retentionPeriod}',
        end_offset => interval '1 hour',
        schedule_interval => interval '${aggregate.refreshInterval}'
      )
      `,
      [aggregate.name]
    );

    // Set up retention policy
    await client.query(
      `
      SELECT add_retention_policy($1, interval '${aggregate.retentionPeriod}')
      `,
      [aggregate.name]
    );
  }
}

/**
 * Get aggregate status and statistics
 */
export async function getAggregateStatus(): Promise<{
  aggregates: {
    name: string;
    lastRefresh: Date | null;
    rowCount: number;
    status: 'healthy' | 'stale' | 'error';
  }[];
}> {
  if (!timescalePool) {
    return {
      aggregates: CONTINUOUS_AGGREGATES.map((a) => ({
        name: a.name,
        lastRefresh: null,
        rowCount: 0,
        status: 'error' as const,
      })),
    };
  }

  const client = await timescalePool.connect();

  try {
    const results = await Promise.all(
      CONTINUOUS_AGGREGATES.map(async (aggregate) => {
        try {
          // Get last refresh time
          const refreshResult = await client.query(
            `
            SELECT last_run_finished_at
            FROM timescaledb_information.jobs
            WHERE hypertable_name = $1
            ORDER BY last_run_finished_at DESC
            LIMIT 1
            `,
            [aggregate.name]
          );

          // Get row count
          const countResult = await client.query(
            `SELECT count(*) as count FROM ${aggregate.name}`
          );

          const lastRefresh = refreshResult.rows[0]?.last_run_finished_at || null;
          const rowCount = parseInt(countResult.rows[0]?.count || '0', 10);

          // Determine status
          let status: 'healthy' | 'stale' | 'error' = 'healthy';
          if (!lastRefresh) {
            status = 'error';
          } else {
            const hoursSinceRefresh =
              (Date.now() - new Date(lastRefresh).getTime()) / (1000 * 60 * 60);
            const expectedHours = parseIntervalToHours(aggregate.refreshInterval);
            if (hoursSinceRefresh > expectedHours * 2) {
              status = 'stale';
            }
          }

          return {
            name: aggregate.name,
            lastRefresh,
            rowCount,
            status,
          };
        } catch {
          return {
            name: aggregate.name,
            lastRefresh: null,
            rowCount: 0,
            status: 'error' as const,
          };
        }
      })
    );

    return { aggregates: results };
  } finally {
    client.release();
  }
}

/**
 * Parse PostgreSQL interval to hours
 */
function parseIntervalToHours(interval: string): number {
  const match = interval.match(/(\d+)\s*(hour|day|week|month)/i);
  if (!match) return 1;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'hour':
      return value;
    case 'day':
      return value * 24;
    case 'week':
      return value * 24 * 7;
    case 'month':
      return value * 24 * 30;
    default:
      return 1;
  }
}

/**
 * Manual refresh trigger for admin use
 */
export async function triggerManualRefresh(
  aggregateNames?: string[]
): Promise<RefreshResult> {
  const job = {
    data: {
      aggregates: aggregateNames,
      forceRefresh: true,
    },
    updateProgress: async () => {},
  } as unknown as Job<RefreshJobData>;

  return processAggregateRefresh(job);
}

export default processAggregateRefresh;
