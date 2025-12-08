/**
 * Workload Metrics Writer Service
 * T042 - Implement workload metrics writer to TimescaleDB
 *
 * Persists workload metrics to TimescaleDB for historical analysis and reporting
 */

import { logger } from '../../lib/logger.js';
import {
  query,
  insertWorkloadMetrics,
  transaction,
  type WorkloadMetricRow,
} from '../operate/timescaleClient.js';
import { getWorkloadTracker, type WorkloadTracker } from './workloadTracker.js';
import type { WorkloadMetrics, WorkloadSnapshot } from 'shared/types/workload.js';

// =============================================================================
// Types
// =============================================================================

export interface MetricsWriteOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface MetricsWriteResult {
  success: boolean;
  writtenCount: number;
  failedCount: number;
  duration: number;
  errors?: string[];
}

interface QueuedMetric {
  metric: WorkloadMetricRow;
  attempts: number;
  addedAt: Date;
}

// =============================================================================
// MetricsWriter Class
// =============================================================================

export class MetricsWriter {
  private writeQueue: QueuedMetric[] = [];
  private isWriting: boolean = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly options: Required<MetricsWriteOptions>;
  private tracker: WorkloadTracker | null = null;

  constructor(options: MetricsWriteOptions = {}) {
    this.options = {
      batchSize: options.batchSize || 100,
      flushIntervalMs: options.flushIntervalMs || 10000, // 10 seconds
      retryAttempts: options.retryAttempts || 3,
      retryDelayMs: options.retryDelayMs || 1000,
    };

    this.startAutoFlush();
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.options.flushIntervalMs);

    logger.info(
      { flushInterval: this.options.flushIntervalMs },
      'Metrics writer auto-flush started'
    );
  }

  /**
   * Stop the writer
   */
  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    logger.info('Metrics writer stopped');
  }

  /**
   * Connect to workload tracker for automatic persistence
   */
  public connectToTracker(tracker?: WorkloadTracker): void {
    this.tracker = tracker || getWorkloadTracker();

    this.tracker.on('workload_updated', (data) => {
      // Don't auto-persist every update, let periodic collection handle it
    });

    logger.info('Metrics writer connected to workload tracker');
  }

  // ==========================================================================
  // Write Operations
  // ==========================================================================

  /**
   * Queue a metric for writing
   */
  public queueMetric(metric: WorkloadMetricRow): void {
    this.writeQueue.push({
      metric,
      attempts: 0,
      addedAt: new Date(),
    });

    // Flush if queue is full
    if (this.writeQueue.length >= this.options.batchSize) {
      this.flush();
    }
  }

  /**
   * Queue multiple metrics
   */
  public queueMetrics(metrics: WorkloadMetricRow[]): void {
    for (const metric of metrics) {
      this.queueMetric(metric);
    }
  }

  /**
   * Convert WorkloadMetrics to TimescaleDB row format
   */
  public metricsToRow(metrics: WorkloadMetrics): WorkloadMetricRow {
    return {
      time: metrics.timestamp,
      organization_id: metrics.organizationId,
      person_id: metrics.personId,
      person_name: metrics.personName,
      active_tasks: metrics.activeTasks,
      pending_tasks: metrics.pendingTasks,
      completed_tasks_today: metrics.completedTasksToday,
      emails_received: metrics.emailsReceived,
      emails_sent: metrics.emailsSent,
      messages_received: metrics.messagesReceived,
      messages_sent: metrics.messagesSent,
      meetings_attended: metrics.meetingsAttended,
      meeting_hours: metrics.meetingHours,
      avg_response_time_ms: metrics.avgResponseTimeMs || null,
      median_response_time_ms: metrics.medianResponseTimeMs || null,
      workload_score: metrics.workloadScore,
      capacity_remaining: metrics.capacityRemaining,
      burnout_risk_score: metrics.burnoutRiskScore,
      department: metrics.department || null,
      team: metrics.team || null,
      role: metrics.role || null,
    };
  }

  /**
   * Write metrics directly (bypass queue)
   */
  public async writeImmediate(
    metrics: WorkloadMetrics[]
  ): Promise<MetricsWriteResult> {
    const startTime = Date.now();
    const rows = metrics.map((m) => this.metricsToRow(m));

    try {
      await insertWorkloadMetrics(rows);

      return {
        success: true,
        writtenCount: rows.length,
        failedCount: 0,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error, count: rows.length }, 'Failed to write metrics immediately');

      return {
        success: false,
        writtenCount: 0,
        failedCount: rows.length,
        duration: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Flush queued metrics to database
   */
  public async flush(): Promise<MetricsWriteResult> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return {
        success: true,
        writtenCount: 0,
        failedCount: 0,
        duration: 0,
      };
    }

    this.isWriting = true;
    const startTime = Date.now();
    const toWrite = [...this.writeQueue];
    this.writeQueue = [];

    let writtenCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      // Process in batches
      for (let i = 0; i < toWrite.length; i += this.options.batchSize) {
        const batch = toWrite.slice(i, i + this.options.batchSize);
        const result = await this.writeBatchWithRetry(batch);

        writtenCount += result.written;
        failedCount += result.failed;
        if (result.error) errors.push(result.error);
      }
    } finally {
      this.isWriting = false;
    }

    const duration = Date.now() - startTime;

    if (writtenCount > 0) {
      logger.debug(
        { writtenCount, failedCount, duration },
        'Flushed workload metrics'
      );
    }

    return {
      success: failedCount === 0,
      writtenCount,
      failedCount,
      duration,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Write a batch with retry logic
   */
  private async writeBatchWithRetry(
    batch: QueuedMetric[]
  ): Promise<{ written: number; failed: number; error?: string }> {
    const metrics = batch.map((b) => b.metric);

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        await insertWorkloadMetrics(metrics);
        return { written: metrics.length, failed: 0 };
      } catch (error) {
        if (attempt === this.options.retryAttempts) {
          logger.error(
            { error, attempt, batchSize: metrics.length },
            'Failed to write metrics batch after retries'
          );

          // Re-queue failed items with incremented attempt count
          for (const item of batch) {
            if (item.attempts < this.options.retryAttempts) {
              item.attempts++;
              this.writeQueue.push(item);
            }
          }

          return {
            written: 0,
            failed: metrics.length,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }

        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, this.options.retryDelayMs * attempt)
        );
      }
    }

    return { written: 0, failed: metrics.length };
  }

  // ==========================================================================
  // Bulk Write Operations
  // ==========================================================================

  /**
   * Write snapshot for all tracked people in organization
   */
  public async writeOrganizationSnapshot(
    organizationId: string
  ): Promise<MetricsWriteResult> {
    const tracker = this.tracker || getWorkloadTracker();
    const snapshots = tracker.getOrganizationSnapshots(organizationId);

    if (snapshots.length === 0) {
      return {
        success: true,
        writtenCount: 0,
        failedCount: 0,
        duration: 0,
      };
    }

    const metrics = snapshots.map((snapshot) =>
      this.snapshotToRow(organizationId, snapshot)
    );

    return this.writeImmediate(
      metrics.map((m) => this.rowToMetrics(m, organizationId))
    );
  }

  /**
   * Convert snapshot to metric row
   */
  private snapshotToRow(
    organizationId: string,
    snapshot: WorkloadSnapshot
  ): WorkloadMetricRow {
    return {
      time: snapshot.timestamp,
      organization_id: organizationId,
      person_id: snapshot.personId,
      person_name: null,
      active_tasks: snapshot.activeTasks,
      pending_tasks: 0,
      completed_tasks_today: 0,
      emails_received: Math.floor(snapshot.communicationVolume / 4),
      emails_sent: Math.floor(snapshot.communicationVolume / 4),
      messages_received: Math.floor(snapshot.communicationVolume / 4),
      messages_sent: Math.ceil(snapshot.communicationVolume / 4),
      meetings_attended: Math.floor(snapshot.meetingLoad / 0.5), // Assume 30 min avg
      meeting_hours: snapshot.meetingLoad,
      avg_response_time_ms: null,
      median_response_time_ms: null,
      workload_score: snapshot.workloadScore,
      capacity_remaining: 100 - snapshot.workloadScore,
      burnout_risk_score: snapshot.burnoutRiskScore,
      department: null,
      team: null,
      role: null,
    };
  }

  /**
   * Convert row back to metrics (for interface consistency)
   */
  private rowToMetrics(
    row: WorkloadMetricRow,
    organizationId: string
  ): WorkloadMetrics {
    return {
      personId: row.person_id,
      personName: row.person_name || 'Unknown',
      organizationId,
      timestamp: row.time,
      activeTasks: row.active_tasks,
      pendingTasks: row.pending_tasks,
      completedTasksToday: row.completed_tasks_today,
      emailsReceived: row.emails_received,
      emailsSent: row.emails_sent,
      messagesReceived: row.messages_received,
      messagesSent: row.messages_sent,
      meetingsAttended: row.meetings_attended,
      meetingHours: row.meeting_hours,
      avgResponseTimeMs: row.avg_response_time_ms || undefined,
      medianResponseTimeMs: row.median_response_time_ms || undefined,
      workloadScore: row.workload_score || 0,
      capacityRemaining: row.capacity_remaining || 100,
      burnoutRiskScore: row.burnout_risk_score || 0,
      department: row.department || undefined,
      team: row.team || undefined,
      role: row.role || undefined,
    };
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get historical metrics for a person
   */
  public async getPersonHistory(
    organizationId: string,
    personId: string,
    startTime: Date,
    endTime: Date,
    interval: 'hour' | 'day' = 'hour'
  ): Promise<WorkloadMetrics[]> {
    const bucket = interval === 'hour' ? '1 hour' : '1 day';

    const result = await query<{
      bucket: Date;
      avg_workload: number;
      avg_burnout: number;
      avg_active_tasks: number;
      total_emails: number;
      total_messages: number;
      total_meetings: number;
    }>(
      `
      SELECT
        time_bucket('${bucket}', time) as bucket,
        AVG(workload_score) as avg_workload,
        AVG(burnout_risk_score) as avg_burnout,
        AVG(active_tasks) as avg_active_tasks,
        SUM(emails_received + emails_sent) as total_emails,
        SUM(messages_received + messages_sent) as total_messages,
        SUM(meetings_attended) as total_meetings
      FROM workload_metrics_ts
      WHERE organization_id = $1
        AND person_id = $2
        AND time >= $3
        AND time <= $4
      GROUP BY time_bucket('${bucket}', time)
      ORDER BY bucket DESC
      `,
      [organizationId, personId, startTime, endTime]
    );

    return result.rows.map((row) => ({
      personId,
      personName: '',
      organizationId,
      timestamp: row.bucket,
      activeTasks: row.avg_active_tasks,
      pendingTasks: 0,
      completedTasksToday: 0,
      emailsReceived: row.total_emails / 2,
      emailsSent: row.total_emails / 2,
      messagesReceived: row.total_messages / 2,
      messagesSent: row.total_messages / 2,
      meetingsAttended: row.total_meetings,
      meetingHours: row.total_meetings * 0.5,
      workloadScore: row.avg_workload,
      capacityRemaining: 100 - row.avg_workload,
      burnoutRiskScore: row.avg_burnout,
    }));
  }

  /**
   * Get team workload trends
   */
  public async getTeamTrends(
    organizationId: string,
    team: string,
    startTime: Date,
    endTime: Date
  ): Promise<
    Array<{
      timestamp: Date;
      avgWorkload: number;
      avgBurnoutRisk: number;
      highRiskCount: number;
      memberCount: number;
    }>
  > {
    const result = await query<{
      bucket: Date;
      avg_workload: number;
      avg_burnout: number;
      high_risk_count: number;
      member_count: number;
    }>(
      `
      SELECT
        time_bucket('1 day', time) as bucket,
        AVG(workload_score) as avg_workload,
        AVG(burnout_risk_score) as avg_burnout,
        COUNT(DISTINCT person_id) FILTER (WHERE burnout_risk_score >= 70) as high_risk_count,
        COUNT(DISTINCT person_id) as member_count
      FROM workload_metrics_ts
      WHERE organization_id = $1
        AND team = $2
        AND time >= $3
        AND time <= $4
      GROUP BY time_bucket('1 day', time)
      ORDER BY bucket DESC
      `,
      [organizationId, team, startTime, endTime]
    );

    return result.rows.map((row) => ({
      timestamp: row.bucket,
      avgWorkload: row.avg_workload,
      avgBurnoutRisk: row.avg_burnout,
      highRiskCount: row.high_risk_count,
      memberCount: row.member_count,
    }));
  }

  /**
   * Get burnout risk alerts from historical data
   */
  public async getBurnoutAlerts(
    organizationId: string,
    threshold: number = 70,
    days: number = 7
  ): Promise<
    Array<{
      personId: string;
      personName: string;
      avgBurnoutRisk: number;
      peakBurnoutRisk: number;
      daysAboveThreshold: number;
    }>
  > {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - days);

    const result = await query<{
      person_id: string;
      person_name: string;
      avg_burnout: number;
      peak_burnout: number;
      days_above: number;
    }>(
      `
      WITH daily_burnout AS (
        SELECT
          person_id,
          MAX(person_name) as person_name,
          time_bucket('1 day', time) as day,
          AVG(burnout_risk_score) as daily_avg
        FROM workload_metrics_ts
        WHERE organization_id = $1
          AND time >= $2
        GROUP BY person_id, time_bucket('1 day', time)
      )
      SELECT
        person_id,
        person_name,
        AVG(daily_avg) as avg_burnout,
        MAX(daily_avg) as peak_burnout,
        COUNT(*) FILTER (WHERE daily_avg >= $3) as days_above
      FROM daily_burnout
      GROUP BY person_id, person_name
      HAVING MAX(daily_avg) >= $3
      ORDER BY peak_burnout DESC
      `,
      [organizationId, startTime, threshold]
    );

    return result.rows.map((row) => ({
      personId: row.person_id,
      personName: row.person_name || 'Unknown',
      avgBurnoutRisk: row.avg_burnout,
      peakBurnoutRisk: row.peak_burnout,
      daysAboveThreshold: row.days_above,
    }));
  }

  /**
   * Get workload distribution for organization
   */
  public async getWorkloadDistribution(
    organizationId: string
  ): Promise<{
    underutilized: number;
    optimal: number;
    high: number;
    critical: number;
  }> {
    const result = await query<{
      category: string;
      count: number;
    }>(
      `
      WITH latest_workload AS (
        SELECT DISTINCT ON (person_id)
          person_id,
          workload_score
        FROM workload_metrics_ts
        WHERE organization_id = $1
          AND time >= NOW() - INTERVAL '1 day'
        ORDER BY person_id, time DESC
      )
      SELECT
        CASE
          WHEN workload_score < 30 THEN 'underutilized'
          WHEN workload_score < 70 THEN 'optimal'
          WHEN workload_score < 90 THEN 'high'
          ELSE 'critical'
        END as category,
        COUNT(*) as count
      FROM latest_workload
      GROUP BY category
      `,
      [organizationId]
    );

    const distribution = {
      underutilized: 0,
      optimal: 0,
      high: 0,
      critical: 0,
    };

    for (const row of result.rows) {
      distribution[row.category as keyof typeof distribution] = Number(row.count);
    }

    return distribution;
  }

  /**
   * Get queue status
   */
  public getQueueStatus(): {
    queueLength: number;
    isWriting: boolean;
    oldestItem?: Date;
  } {
    return {
      queueLength: this.writeQueue.length,
      isWriting: this.isWriting,
      oldestItem:
        this.writeQueue.length > 0 ? this.writeQueue[0].addedAt : undefined,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: MetricsWriter | null = null;

export function getMetricsWriter(
  options?: MetricsWriteOptions
): MetricsWriter {
  if (!instance) {
    instance = new MetricsWriter(options);
  }
  return instance;
}

export function stopMetricsWriter(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

export default {
  MetricsWriter,
  getMetricsWriter,
  stopMetricsWriter,
};
