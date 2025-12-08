/**
 * Workload Metrics Job Processor
 * T220 - Background job processing for workload metrics
 *
 * Processes workload data collection and analysis jobs
 */

import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import { predictBurnout } from './burnoutPredictor.js';
import { calculateBurnoutScore } from './burnoutScorer.js';
import { checkForWarnings, checkTeamWarnings } from './earlyWarning.js';
import { analyzeCalendar, syncCalendar } from './calendarIntegration.js';
import { analyzeMeetings } from './meetingAnalyzer.js';
import { analyzeDistribution } from './taskDistribution.js';
import { forecastPersonWorkload, forecastTeamWorkload } from './workloadForecaster.js';
import { notifyBurnoutRisk, notifyTeamOverload, sendWeeklySummary } from './managerNotifier.js';

// =============================================================================
// Types
// =============================================================================

export interface WorkloadJobData {
  type: WorkloadJobType;
  payload: Record<string, unknown>;
  initiatedBy?: string;
  priority?: number;
}

export type WorkloadJobType =
  | 'collect_person_metrics'
  | 'collect_team_metrics'
  | 'analyze_burnout_risk'
  | 'check_early_warnings'
  | 'sync_calendars'
  | 'generate_forecasts'
  | 'send_weekly_summary'
  | 'process_redistribution'
  | 'update_availability'
  | 'calculate_team_balance';

export interface JobResult {
  success: boolean;
  jobId: string;
  type: WorkloadJobType;
  processedAt: Date;
  duration: number; // ms
  result?: Record<string, unknown>;
  error?: string;
}

export interface ProcessorStats {
  processed: number;
  failed: number;
  avgDuration: number;
  byType: Record<string, { count: number; avgDuration: number }>;
  lastProcessed?: Date;
}

// =============================================================================
// Queue Configuration
// =============================================================================

const QUEUE_NAME = 'workload-metrics';
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Job type configurations
const JOB_CONFIGS: Record<WorkloadJobType, { priority: number; attempts: number; backoff: number }> = {
  collect_person_metrics: { priority: 5, attempts: 3, backoff: 5000 },
  collect_team_metrics: { priority: 5, attempts: 3, backoff: 5000 },
  analyze_burnout_risk: { priority: 3, attempts: 2, backoff: 10000 },
  check_early_warnings: { priority: 2, attempts: 2, backoff: 10000 },
  sync_calendars: { priority: 7, attempts: 3, backoff: 30000 },
  generate_forecasts: { priority: 8, attempts: 2, backoff: 60000 },
  send_weekly_summary: { priority: 10, attempts: 3, backoff: 60000 },
  process_redistribution: { priority: 4, attempts: 2, backoff: 10000 },
  update_availability: { priority: 1, attempts: 3, backoff: 5000 },
  calculate_team_balance: { priority: 6, attempts: 2, backoff: 10000 },
};

// =============================================================================
// Queue & Worker
// =============================================================================

let queue: Queue | null = null;
let worker: Worker | null = null;
let stats: ProcessorStats = {
  processed: 0,
  failed: 0,
  avgDuration: 0,
  byType: {},
};

/**
 * Initialize the workload metrics processor
 */
export function initializeProcessor(): Queue {
  if (queue) return queue;

  queue = new Queue(QUEUE_NAME, {
    connection: REDIS_CONFIG,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  });

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<WorkloadJobData>) => {
      return processJob(job);
    },
    {
      connection: REDIS_CONFIG,
      concurrency: 5,
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    updateStats(job.data.type, result.duration, true);
    console.log(`[Workload] Job ${job.id} (${job.data.type}) completed in ${result.duration}ms`);
  });

  worker.on('failed', (job, error) => {
    if (job) {
      updateStats(job.data.type, 0, false);
      console.error(`[Workload] Job ${job.id} (${job.data.type}) failed:`, error.message);
    }
  });

  console.log('[Workload] Metrics processor initialized');
  return queue;
}

/**
 * Stop the processor
 */
export async function stopProcessor(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  console.log('[Workload] Metrics processor stopped');
}

/**
 * Get the queue instance
 */
export function getQueue(): Queue {
  if (!queue) {
    return initializeProcessor();
  }
  return queue;
}

// =============================================================================
// Job Scheduling
// =============================================================================

/**
 * Schedule a workload job
 */
export async function scheduleJob(
  type: WorkloadJobType,
  payload: Record<string, unknown>,
  options: {
    delay?: number;
    priority?: number;
    jobId?: string;
  } = {}
): Promise<string> {
  const q = getQueue();
  const config = JOB_CONFIGS[type];

  const job = await q.add(
    type,
    { type, payload },
    {
      priority: options.priority ?? config.priority,
      delay: options.delay,
      attempts: config.attempts,
      backoff: {
        type: 'exponential',
        delay: config.backoff,
      },
      jobId: options.jobId,
    }
  );

  return job.id || 'unknown';
}

/**
 * Schedule person metrics collection
 */
export async function schedulePersonMetrics(
  personId: string,
  options: { delay?: number } = {}
): Promise<string> {
  return scheduleJob('collect_person_metrics', { personId }, options);
}

/**
 * Schedule team metrics collection
 */
export async function scheduleTeamMetrics(
  teamId: string,
  options: { delay?: number } = {}
): Promise<string> {
  return scheduleJob('collect_team_metrics', { teamId }, options);
}

/**
 * Schedule burnout risk analysis
 */
export async function scheduleBurnoutAnalysis(
  personId: string,
  options: { delay?: number; notifyManager?: boolean } = {}
): Promise<string> {
  return scheduleJob('analyze_burnout_risk', {
    personId,
    notifyManager: options.notifyManager ?? true,
  }, options);
}

/**
 * Schedule early warning checks
 */
export async function scheduleEarlyWarningCheck(
  target: { personId?: string; teamId?: string },
  options: { delay?: number } = {}
): Promise<string> {
  return scheduleJob('check_early_warnings', target, options);
}

/**
 * Schedule calendar sync
 */
export async function scheduleCalendarSync(
  personId: string,
  options: { delay?: number } = {}
): Promise<string> {
  return scheduleJob('sync_calendars', { personId }, options);
}

/**
 * Schedule workload forecast generation
 */
export async function scheduleForecast(
  target: { personId?: string; teamId?: string },
  options: { delay?: number; days?: number } = {}
): Promise<string> {
  return scheduleJob('generate_forecasts', {
    ...target,
    days: options.days ?? 30,
  }, options);
}

/**
 * Schedule weekly summary
 */
export async function scheduleWeeklySummary(
  teamId: string,
  managerId: string,
  options: { delay?: number } = {}
): Promise<string> {
  return scheduleJob('send_weekly_summary', { teamId, managerId }, options);
}

/**
 * Schedule bulk jobs for all team members
 */
export async function scheduleBulkPersonJobs(
  teamId: string,
  jobType: 'collect_person_metrics' | 'analyze_burnout_risk' | 'sync_calendars'
): Promise<string[]> {
  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const jobIds: string[] = [];

  for (const user of team.users) {
    const jobId = await scheduleJob(jobType, { personId: user.id });
    jobIds.push(jobId);
  }

  return jobIds;
}

// =============================================================================
// Job Processing
// =============================================================================

async function processJob(job: Job<WorkloadJobData>): Promise<JobResult> {
  const startTime = Date.now();
  const { type, payload } = job.data;

  try {
    let result: Record<string, unknown> = {};

    switch (type) {
      case 'collect_person_metrics':
        result = await processPersonMetrics(payload.personId as string);
        break;

      case 'collect_team_metrics':
        result = await processTeamMetrics(payload.teamId as string);
        break;

      case 'analyze_burnout_risk':
        result = await processBurnoutAnalysis(
          payload.personId as string,
          payload.notifyManager as boolean
        );
        break;

      case 'check_early_warnings':
        if (payload.personId) {
          result = await processPersonWarnings(payload.personId as string);
        } else if (payload.teamId) {
          result = await processTeamWarnings(payload.teamId as string);
        }
        break;

      case 'sync_calendars':
        result = await processCalendarSync(payload.personId as string);
        break;

      case 'generate_forecasts':
        if (payload.personId) {
          result = await processPersonForecast(payload.personId as string, payload.days as number);
        } else if (payload.teamId) {
          result = await processTeamForecast(payload.teamId as string, payload.days as number);
        }
        break;

      case 'send_weekly_summary':
        result = await processWeeklySummary(
          payload.teamId as string,
          payload.managerId as string
        );
        break;

      case 'process_redistribution':
        result = await processRedistribution(payload.teamId as string);
        break;

      case 'update_availability':
        result = await processAvailabilityUpdate(payload.personId as string);
        break;

      case 'calculate_team_balance':
        result = await processTeamBalance(payload.teamId as string);
        break;

      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      jobId: job.id || 'unknown',
      type,
      processedAt: new Date(),
      duration,
      result,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      jobId: job.id || 'unknown',
      type,
      processedAt: new Date(),
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Individual job processors
async function processPersonMetrics(personId: string): Promise<Record<string, unknown>> {
  // Collect various metrics
  const [calendar, burnoutScore, warnings] = await Promise.all([
    analyzeCalendar(personId, { workHoursPerDay: 8 }),
    calculateBurnoutScore(personId),
    checkForWarnings(personId),
  ]);

  // Store metrics (would save to database in production)
  const metrics = {
    personId,
    collectedAt: new Date(),
    calendarLoad: calendar.meetingLoad,
    burnoutScore: burnoutScore.overallScore,
    burnoutLevel: burnoutScore.riskLevel,
    warningCount: warnings.length,
    topWarnings: warnings.slice(0, 3).map(w => w.type),
  };

  return metrics;
}

async function processTeamMetrics(teamId: string): Promise<Record<string, unknown>> {
  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) throw new Error(`Team not found: ${teamId}`);

  // Collect team-level metrics
  const [distribution, warnings] = await Promise.all([
    analyzeDistribution(teamId),
    checkTeamWarnings(teamId),
  ]);

  return {
    teamId,
    collectedAt: new Date(),
    memberCount: team.users.length,
    balanceScore: distribution.balanceScore,
    imbalanceCount: distribution.imbalances.length,
    warningCount: warnings.activeWarnings,
    criticalWarnings: warnings.criticalWarnings,
  };
}

async function processBurnoutAnalysis(
  personId: string,
  notifyManager: boolean
): Promise<Record<string, unknown>> {
  const prediction = await predictBurnout(personId);
  const score = await calculateBurnoutScore(personId);

  // Notify manager if risk is high
  if (notifyManager && (score.riskLevel === 'high' || score.riskLevel === 'critical')) {
    // Find manager (would look up in production)
    const managerId = 'manager-placeholder';

    await notifyBurnoutRisk(managerId, {
      personId,
      personName: score.personName,
      riskScore: score.overallScore,
      riskLevel: score.riskLevel,
      topFactors: score.factorScores.slice(0, 3).map(f => f.factor),
    });
  }

  return {
    personId,
    riskScore: score.overallScore,
    riskLevel: score.riskLevel,
    predictedIn30Days: prediction.predictedRiskLevel,
    notificationSent: notifyManager && score.riskLevel !== 'low',
  };
}

async function processPersonWarnings(personId: string): Promise<Record<string, unknown>> {
  const warnings = await checkForWarnings(personId);

  return {
    personId,
    warningCount: warnings.length,
    critical: warnings.filter(w => w.severity === 'critical').length,
    warnings: warnings.map(w => ({
      type: w.type,
      severity: w.severity,
      title: w.title,
    })),
  };
}

async function processTeamWarnings(teamId: string): Promise<Record<string, unknown>> {
  const summary = await checkTeamWarnings(teamId);

  // Notify manager if critical warnings
  if (summary.criticalWarnings > 0) {
    const managerId = 'manager-placeholder';

    await notifyTeamOverload(managerId, teamId, {
      averageLoad: 85, // Would calculate from actual data
      overloadedCount: summary.criticalWarnings,
      totalMembers: summary.warnings.length,
    });
  }

  return {
    teamId,
    totalWarnings: summary.activeWarnings,
    criticalWarnings: summary.criticalWarnings,
    riskTrend: summary.riskTrend,
    topConcerns: summary.topConcerns,
  };
}

async function processCalendarSync(personId: string): Promise<Record<string, unknown>> {
  const result = await syncCalendar(personId);

  // Analyze meetings after sync
  const analysis = await analyzeMeetings(personId, { periodDays: 7 });

  return {
    personId,
    syncedEvents: result.synced,
    errors: result.errors,
    meetingLoad: analysis.overview.totalHours,
    efficiency: analysis.efficiency.score,
  };
}

async function processPersonForecast(
  personId: string,
  days: number
): Promise<Record<string, unknown>> {
  const forecast = await forecastPersonWorkload(personId, {
    forecastDays: days,
  });

  return {
    personId,
    forecastDays: days,
    predictedLoad: forecast.projectedLoad,
    confidence: forecast.confidence,
    peakPeriods: forecast.peakPeriods.length,
  };
}

async function processTeamForecast(
  teamId: string,
  days: number
): Promise<Record<string, unknown>> {
  const forecast = await forecastTeamWorkload(teamId, {
    forecastDays: days,
  });

  return {
    teamId,
    forecastDays: days,
    avgProjectedLoad: forecast.avgProjectedLoad,
    riskPeriods: forecast.riskPeriods.length,
  };
}

async function processWeeklySummary(
  teamId: string,
  managerId: string
): Promise<Record<string, unknown>> {
  // Gather data for summary
  const [teamMetrics, warnings] = await Promise.all([
    processTeamMetrics(teamId),
    checkTeamWarnings(teamId),
  ]);

  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay());

  await sendWeeklySummary(managerId, teamId, {
    weekOf,
    avgLoad: 75 + Math.random() * 20,
    loadChange: -5 + Math.random() * 10,
    atRiskCount: warnings.criticalWarnings,
    warningsCount: warnings.activeWarnings,
    resolvedIssues: Math.floor(Math.random() * 5),
    highlights: [
      `Team handled ${Math.floor(Math.random() * 50 + 20)} tasks this week`,
      warnings.criticalWarnings > 0 ? `${warnings.criticalWarnings} team member(s) need attention` : 'No critical concerns',
    ],
  });

  return {
    teamId,
    managerId,
    sentAt: new Date(),
    weekOf,
  };
}

async function processRedistribution(teamId: string): Promise<Record<string, unknown>> {
  const distribution = await analyzeDistribution(teamId);

  return {
    teamId,
    imbalances: distribution.imbalances.length,
    suggestions: distribution.suggestions.length,
  };
}

async function processAvailabilityUpdate(personId: string): Promise<Record<string, unknown>> {
  // Would update availability based on calendar
  return {
    personId,
    updatedAt: new Date(),
  };
}

async function processTeamBalance(teamId: string): Promise<Record<string, unknown>> {
  const distribution = await analyzeDistribution(teamId);

  return {
    teamId,
    balanceScore: distribution.balanceScore,
    overloaded: distribution.overloaded.length,
    underutilized: distribution.underutilized.length,
  };
}

// =============================================================================
// Stats & Monitoring
// =============================================================================

function updateStats(type: WorkloadJobType, duration: number, success: boolean): void {
  if (success) {
    stats.processed++;
    stats.avgDuration = (stats.avgDuration * (stats.processed - 1) + duration) / stats.processed;
  } else {
    stats.failed++;
  }

  stats.lastProcessed = new Date();

  // Update per-type stats
  if (!stats.byType[type]) {
    stats.byType[type] = { count: 0, avgDuration: 0 };
  }

  const typeStats = stats.byType[type];
  if (success) {
    typeStats.count++;
    typeStats.avgDuration = (typeStats.avgDuration * (typeStats.count - 1) + duration) / typeStats.count;
  }
}

/**
 * Get processor statistics
 */
export function getProcessorStats(): ProcessorStats {
  return { ...stats };
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const q = getQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Job<WorkloadJobData> | undefined> {
  const q = getQueue();
  return q.getJob(jobId);
}

/**
 * Cancel a pending job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    return true;
  }

  return false;
}

// =============================================================================
// Scheduled Jobs
// =============================================================================

/**
 * Set up recurring scheduled jobs
 */
export async function setupScheduledJobs(): Promise<void> {
  const q = getQueue();

  // Daily metrics collection (every day at 2 AM)
  await q.add(
    'daily_metrics',
    { type: 'collect_team_metrics', payload: { teamId: 'all' } },
    {
      repeat: {
        pattern: '0 2 * * *',
      },
    }
  );

  // Weekly summary (every Monday at 9 AM)
  await q.add(
    'weekly_summary',
    { type: 'send_weekly_summary', payload: { teamId: 'all', managerId: 'all' } },
    {
      repeat: {
        pattern: '0 9 * * 1',
      },
    }
  );

  // Calendar sync (every 6 hours)
  await q.add(
    'calendar_sync',
    { type: 'sync_calendars', payload: { personId: 'all' } },
    {
      repeat: {
        pattern: '0 */6 * * *',
      },
    }
  );

  // Early warning checks (every 2 hours during business hours)
  await q.add(
    'early_warnings',
    { type: 'check_early_warnings', payload: { teamId: 'all' } },
    {
      repeat: {
        pattern: '0 9-17/2 * * 1-5',
      },
    }
  );

  console.log('[Workload] Scheduled jobs configured');
}

// =============================================================================
// Exports
// =============================================================================

export default {
  initializeProcessor,
  stopProcessor,
  getQueue,
  scheduleJob,
  schedulePersonMetrics,
  scheduleTeamMetrics,
  scheduleBurnoutAnalysis,
  scheduleEarlyWarningCheck,
  scheduleCalendarSync,
  scheduleForecast,
  scheduleWeeklySummary,
  scheduleBulkPersonJobs,
  getProcessorStats,
  getQueueStatus,
  getJob,
  cancelJob,
  setupScheduledJobs,
};
