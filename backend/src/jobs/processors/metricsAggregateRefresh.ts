/**
 * Metrics Aggregate Refresh Processor
 * T244 - TimescaleDB aggregate refresh job
 *
 * Refreshes materialized views and continuous aggregates
 * for time-series metrics in TimescaleDB
 */

import { Job, Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';

// Types
interface RefreshJobData {
  organizationId?: string;
  aggregateType: AggregateType;
  timeRange?: {
    start: string;
    end: string;
  };
  force?: boolean;
}

interface RefreshResult {
  aggregateType: AggregateType;
  refreshedViews: string[];
  rowsAffected: number;
  durationMs: number;
  success: boolean;
  errors: string[];
}

type AggregateType =
  | 'routing_metrics'
  | 'workload_metrics'
  | 'compliance_metrics'
  | 'performance_metrics'
  | 'usage_metrics'
  | 'all';

interface AggregateView {
  name: string;
  type: AggregateType;
  refreshQuery: string;
  dependencies: string[];
  refreshIntervalMinutes: number;
  lastRefreshed?: Date;
}

// Aggregate view definitions
const AGGREGATE_VIEWS: AggregateView[] = [
  // Routing metrics
  {
    name: 'routing_decisions_hourly',
    type: 'routing_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY routing_decisions_hourly
    `,
    dependencies: [],
    refreshIntervalMinutes: 5,
  },
  {
    name: 'routing_decisions_daily',
    type: 'routing_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY routing_decisions_daily
    `,
    dependencies: ['routing_decisions_hourly'],
    refreshIntervalMinutes: 60,
  },
  {
    name: 'routing_accuracy_summary',
    type: 'routing_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY routing_accuracy_summary
    `,
    dependencies: ['routing_decisions_daily'],
    refreshIntervalMinutes: 60,
  },

  // Workload metrics
  {
    name: 'workload_metrics_hourly',
    type: 'workload_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY workload_metrics_hourly
    `,
    dependencies: [],
    refreshIntervalMinutes: 15,
  },
  {
    name: 'workload_metrics_daily',
    type: 'workload_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY workload_metrics_daily
    `,
    dependencies: ['workload_metrics_hourly'],
    refreshIntervalMinutes: 60,
  },
  {
    name: 'burnout_risk_trends',
    type: 'workload_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY burnout_risk_trends
    `,
    dependencies: ['workload_metrics_daily'],
    refreshIntervalMinutes: 60,
  },
  {
    name: 'team_capacity_summary',
    type: 'workload_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY team_capacity_summary
    `,
    dependencies: ['workload_metrics_hourly'],
    refreshIntervalMinutes: 30,
  },

  // Compliance metrics
  {
    name: 'compliance_checks_hourly',
    type: 'compliance_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_checks_hourly
    `,
    dependencies: [],
    refreshIntervalMinutes: 15,
  },
  {
    name: 'compliance_score_daily',
    type: 'compliance_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_score_daily
    `,
    dependencies: ['compliance_checks_hourly'],
    refreshIntervalMinutes: 60,
  },
  {
    name: 'violation_trends',
    type: 'compliance_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY violation_trends
    `,
    dependencies: ['compliance_checks_hourly'],
    refreshIntervalMinutes: 60,
  },

  // Performance metrics
  {
    name: 'api_latency_percentiles',
    type: 'performance_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY api_latency_percentiles
    `,
    dependencies: [],
    refreshIntervalMinutes: 5,
  },
  {
    name: 'system_health_summary',
    type: 'performance_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY system_health_summary
    `,
    dependencies: [],
    refreshIntervalMinutes: 5,
  },
  {
    name: 'error_rate_trends',
    type: 'performance_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY error_rate_trends
    `,
    dependencies: [],
    refreshIntervalMinutes: 15,
  },

  // Usage metrics
  {
    name: 'ai_usage_hourly',
    type: 'usage_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY ai_usage_hourly
    `,
    dependencies: [],
    refreshIntervalMinutes: 15,
  },
  {
    name: 'ai_usage_daily',
    type: 'usage_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY ai_usage_daily
    `,
    dependencies: ['ai_usage_hourly'],
    refreshIntervalMinutes: 60,
  },
  {
    name: 'feature_usage_summary',
    type: 'usage_metrics',
    refreshQuery: `
      REFRESH MATERIALIZED VIEW CONCURRENTLY feature_usage_summary
    `,
    dependencies: [],
    refreshIntervalMinutes: 60,
  },
];

// Queue configuration
const QUEUE_NAME = 'metrics-aggregate-refresh';

let queue: Queue<RefreshJobData> | null = null;
let worker: Worker<RefreshJobData, RefreshResult> | null = null;
let prisma: PrismaClient | null = null;

// Track last refresh times
const lastRefreshTimes = new Map<string, Date>();

/**
 * Initialize the aggregate refresh processor
 */
export function initializeProcessor(
  redisConnection: IORedis,
  prismaClient: PrismaClient
): void {
  prisma = prismaClient;

  // Create queue
  queue = new Queue<RefreshJobData>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  // Create worker
  worker = new Worker<RefreshJobData, RefreshResult>(
    QUEUE_NAME,
    processRefreshJob,
    {
      connection: redisConnection,
      concurrency: 2, // Limit concurrent refreshes
    }
  );

  // Set up event handlers
  worker.on('completed', (job, result) => {
    console.log(
      `Aggregate refresh completed: ${result.aggregateType}, ` +
      `${result.refreshedViews.length} views, ${result.durationMs}ms`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(
      `Aggregate refresh failed: ${job?.data?.aggregateType}`,
      error
    );
  });

  console.log('Metrics aggregate refresh processor initialized');
}

/**
 * Process a refresh job
 */
async function processRefreshJob(
  job: Job<RefreshJobData>
): Promise<RefreshResult> {
  const { aggregateType, timeRange, force } = job.data;
  const startTime = Date.now();
  const refreshedViews: string[] = [];
  const errors: string[] = [];
  let rowsAffected = 0;

  // Get views to refresh
  const viewsToRefresh = AGGREGATE_VIEWS.filter((v) => {
    if (aggregateType !== 'all' && v.type !== aggregateType) return false;
    return true;
  });

  // Sort by dependencies (topological sort)
  const sortedViews = topologicalSort(viewsToRefresh);

  for (const view of sortedViews) {
    try {
      // Check if refresh is needed
      const lastRefresh = lastRefreshTimes.get(view.name);
      const needsRefresh = force ||
        !lastRefresh ||
        Date.now() - lastRefresh.getTime() > view.refreshIntervalMinutes * 60 * 1000;

      if (!needsRefresh) {
        continue;
      }

      // Update job progress
      await job.updateProgress({
        currentView: view.name,
        completedViews: refreshedViews.length,
        totalViews: sortedViews.length,
      });

      // Execute refresh
      const result = await refreshView(view, timeRange);
      refreshedViews.push(view.name);
      rowsAffected += result.rowsAffected;
      lastRefreshTimes.set(view.name, new Date());

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${view.name}: ${errorMessage}`);
      console.error(`Failed to refresh ${view.name}:`, error);
    }
  }

  return {
    aggregateType,
    refreshedViews,
    rowsAffected,
    durationMs: Date.now() - startTime,
    success: errors.length === 0,
    errors,
  };
}

/**
 * Refresh a single view
 */
async function refreshView(
  view: AggregateView,
  timeRange?: { start: string; end: string }
): Promise<{ rowsAffected: number }> {
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  // Check if the view exists first (graceful handling for missing views)
  const viewExists = await checkViewExists(view.name);
  if (!viewExists) {
    console.log(`View ${view.name} does not exist, skipping`);
    return { rowsAffected: 0 };
  }

  // Execute refresh
  const result = await prisma.$executeRawUnsafe(view.refreshQuery);

  return { rowsAffected: result };
}

/**
 * Check if a materialized view exists
 */
async function checkViewExists(viewName: string): Promise<boolean> {
  if (!prisma) return false;

  try {
    const result = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_matviews WHERE matviewname = ${viewName}
      ) as exists
    `;
    return result[0]?.exists ?? false;
  } catch {
    return false;
  }
}

/**
 * Topological sort for dependency ordering
 */
function topologicalSort(views: AggregateView[]): AggregateView[] {
  const sorted: AggregateView[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const viewMap = new Map(views.map((v) => [v.name, v]));

  function visit(view: AggregateView): void {
    if (visited.has(view.name)) return;
    if (visiting.has(view.name)) {
      throw new Error(`Circular dependency detected: ${view.name}`);
    }

    visiting.add(view.name);

    for (const depName of view.dependencies) {
      const dep = viewMap.get(depName);
      if (dep) visit(dep);
    }

    visiting.delete(view.name);
    visited.add(view.name);
    sorted.push(view);
  }

  for (const view of views) {
    visit(view);
  }

  return sorted;
}

/**
 * Schedule a refresh job
 */
export async function scheduleRefresh(
  aggregateType: AggregateType,
  options?: {
    organizationId?: string;
    timeRange?: { start: string; end: string };
    force?: boolean;
    delay?: number;
  }
): Promise<string> {
  if (!queue) {
    throw new Error('Queue not initialized');
  }

  const job = await queue.add(
    `refresh-${aggregateType}`,
    {
      aggregateType,
      organizationId: options?.organizationId,
      timeRange: options?.timeRange,
      force: options?.force,
    },
    {
      delay: options?.delay,
      jobId: `${aggregateType}-${Date.now()}`,
    }
  );

  return job.id || '';
}

/**
 * Set up scheduled refresh jobs
 */
export async function setupScheduledJobs(): Promise<void> {
  if (!queue) {
    throw new Error('Queue not initialized');
  }

  // Remove existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Schedule recurring refreshes
  const schedules: Array<{ type: AggregateType; cron: string }> = [
    { type: 'routing_metrics', cron: '*/5 * * * *' },      // Every 5 minutes
    { type: 'workload_metrics', cron: '*/15 * * * *' },    // Every 15 minutes
    { type: 'compliance_metrics', cron: '*/15 * * * *' },  // Every 15 minutes
    { type: 'performance_metrics', cron: '*/5 * * * *' },  // Every 5 minutes
    { type: 'usage_metrics', cron: '*/15 * * * *' },       // Every 15 minutes
    { type: 'all', cron: '0 * * * *' },                    // Every hour (full refresh)
  ];

  for (const schedule of schedules) {
    await queue.add(
      `scheduled-${schedule.type}`,
      { aggregateType: schedule.type },
      {
        repeat: { pattern: schedule.cron },
        jobId: `scheduled-${schedule.type}`,
      }
    );
  }

  console.log('Scheduled aggregate refresh jobs configured');
}

/**
 * Get refresh status
 */
export async function getRefreshStatus(): Promise<{
  views: Array<{
    name: string;
    type: AggregateType;
    lastRefreshed: Date | null;
    nextRefreshDue: Date | null;
    intervalMinutes: number;
  }>;
  pendingJobs: number;
  activeJobs: number;
}> {
  const views = AGGREGATE_VIEWS.map((view) => {
    const lastRefreshed = lastRefreshTimes.get(view.name) || null;
    const nextRefreshDue = lastRefreshed
      ? new Date(lastRefreshed.getTime() + view.refreshIntervalMinutes * 60 * 1000)
      : null;

    return {
      name: view.name,
      type: view.type,
      lastRefreshed,
      nextRefreshDue,
      intervalMinutes: view.refreshIntervalMinutes,
    };
  });

  const pendingJobs = queue ? await queue.getWaitingCount() : 0;
  const activeJobs = queue ? await queue.getActiveCount() : 0;

  return { views, pendingJobs, activeJobs };
}

/**
 * Force refresh all aggregates
 */
export async function forceRefreshAll(): Promise<string> {
  return scheduleRefresh('all', { force: true });
}

/**
 * Cleanup and shutdown
 */
export async function shutdown(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  prisma = null;
}

// Export types
export type { RefreshJobData, RefreshResult, AggregateType };

export default {
  initializeProcessor,
  scheduleRefresh,
  setupScheduledJobs,
  getRefreshStatus,
  forceRefreshAll,
  shutdown,
};
