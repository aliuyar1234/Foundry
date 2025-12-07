/**
 * Process Health Metrics Calculator
 * T096 - Implement process health metrics calculator
 *
 * Calculates detailed health metrics for business processes
 */

import { prisma } from '../../lib/prisma';
import * as timescaleClient from '../operate/timescaleClient';

export interface ProcessHealthDetail {
  processId: string;
  processName: string;
  healthScore: number; // 0-100
  status: 'healthy' | 'warning' | 'critical' | 'stalled';
  metrics: {
    avgCompletionTime: number; // hours
    onTimeRate: number; // percentage
    errorRate: number; // percentage
    throughput: number; // per day
    backlogCount: number;
  };
  issues: ProcessIssue[];
  trend: 'improving' | 'stable' | 'degrading';
}

export interface ProcessIssue {
  type: 'bottleneck' | 'delay' | 'error' | 'overdue' | 'stuck';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedInstances: number;
  recommendedAction?: string;
}

export interface ProcessHealthSummary {
  organizationId: string;
  timestamp: Date;
  overallHealth: number;
  totalProcesses: number;
  healthyProcesses: number;
  warningProcesses: number;
  criticalProcesses: number;
  stalledProcesses: number;
  processes: ProcessHealthDetail[];
}

/**
 * Get process health summary for an organization
 */
export async function getProcessHealthSummary(
  organizationId: string,
  options: {
    timeRange?: 'day' | 'week' | 'month';
    processIds?: string[];
  } = {}
): Promise<ProcessHealthSummary> {
  const { timeRange = 'week', processIds } = options;

  // Get all active processes
  const processes = await prisma.process.findMany({
    where: {
      organizationId,
      ...(processIds && { id: { in: processIds } }),
      status: { notIn: ['archived', 'deleted'] },
    },
    include: {
      steps: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Calculate health for each process
  const healthDetails: ProcessHealthDetail[] = await Promise.all(
    processes.map(process => calculateProcessHealth(process, organizationId, timeRange))
  );

  // Calculate summary stats
  const healthyProcesses = healthDetails.filter(p => p.status === 'healthy').length;
  const warningProcesses = healthDetails.filter(p => p.status === 'warning').length;
  const criticalProcesses = healthDetails.filter(p => p.status === 'critical').length;
  const stalledProcesses = healthDetails.filter(p => p.status === 'stalled').length;

  const overallHealth = healthDetails.length > 0
    ? healthDetails.reduce((sum, p) => sum + p.healthScore, 0) / healthDetails.length
    : 100;

  return {
    organizationId,
    timestamp: new Date(),
    overallHealth: Math.round(overallHealth),
    totalProcesses: processes.length,
    healthyProcesses,
    warningProcesses,
    criticalProcesses,
    stalledProcesses,
    processes: healthDetails.sort((a, b) => a.healthScore - b.healthScore),
  };
}

/**
 * Calculate health for a single process
 */
async function calculateProcessHealth(
  process: { id: string; name: string; status: string; updatedAt: Date; steps?: { id: string }[] },
  organizationId: string,
  timeRange: string
): Promise<ProcessHealthDetail> {
  const timeRangeMs = getTimeRangeMs(timeRange);
  const startTime = new Date(Date.now() - timeRangeMs);
  const endTime = new Date();

  // Get historical metrics from TimescaleDB
  const metrics = await getProcessMetrics(process.id, organizationId, startTime, endTime);
  const issues = await detectProcessIssues(process, metrics);

  // Calculate health score based on multiple factors
  let healthScore = 100;

  // Deduct for error rate
  healthScore -= Math.min(30, metrics.errorRate * 3);

  // Deduct for low on-time rate
  healthScore -= Math.max(0, (80 - metrics.onTimeRate) * 0.5);

  // Deduct for backlog
  healthScore -= Math.min(20, metrics.backlogCount * 2);

  // Deduct for issues
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical':
        healthScore -= 15;
        break;
      case 'high':
        healthScore -= 10;
        break;
      case 'medium':
        healthScore -= 5;
        break;
      case 'low':
        healthScore -= 2;
        break;
    }
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine status
  let status: ProcessHealthDetail['status'];
  if (process.status === 'stalled' || daysSinceUpdate(process.updatedAt) > 14) {
    status = 'stalled';
  } else if (healthScore >= 80) {
    status = 'healthy';
  } else if (healthScore >= 50) {
    status = 'warning';
  } else {
    status = 'critical';
  }

  // Calculate trend
  const trend = await calculateTrend(process.id, organizationId);

  return {
    processId: process.id,
    processName: process.name,
    healthScore: Math.round(healthScore),
    status,
    metrics,
    issues,
    trend,
  };
}

/**
 * Get process metrics from TimescaleDB
 */
async function getProcessMetrics(
  processId: string,
  organizationId: string,
  startTime: Date,
  endTime: Date
): Promise<ProcessHealthDetail['metrics']> {
  try {
    // Get workload metrics that include process data
    const workloadMetrics = await timescaleClient.queryWorkloadMetrics({
      organizationId,
      startTime,
      endTime,
    });

    // Filter for this process if possible
    const processMetrics = workloadMetrics.filter(m => m.metadata?.processId === processId);

    if (processMetrics.length > 0) {
      // Calculate averages from time series data
      const avgCompletionTime = processMetrics.reduce(
        (sum, m) => sum + (m.avg_completion_time || 0),
        0
      ) / processMetrics.length;

      const onTimeRate = processMetrics.reduce(
        (sum, m) => sum + (m.on_time_rate || 0),
        0
      ) / processMetrics.length;

      const errorRate = processMetrics.reduce(
        (sum, m) => sum + (m.error_rate || 0),
        0
      ) / processMetrics.length;

      const throughput = processMetrics.reduce(
        (sum, m) => sum + (m.throughput || 0),
        0
      ) / processMetrics.length;

      return {
        avgCompletionTime,
        onTimeRate,
        errorRate,
        throughput,
        backlogCount: await getBacklogCount(processId, organizationId),
      };
    }

    // Return defaults if no metrics found
    return {
      avgCompletionTime: 0,
      onTimeRate: 100,
      errorRate: 0,
      throughput: 0,
      backlogCount: await getBacklogCount(processId, organizationId),
    };
  } catch {
    return {
      avgCompletionTime: 0,
      onTimeRate: 100,
      errorRate: 0,
      throughput: 0,
      backlogCount: 0,
    };
  }
}

/**
 * Get current backlog count for a process
 */
async function getBacklogCount(processId: string, organizationId: string): Promise<number> {
  try {
    return await prisma.task.count({
      where: {
        organizationId,
        processId,
        status: { notIn: ['completed', 'cancelled'] },
      },
    });
  } catch {
    return 0;
  }
}

/**
 * Detect issues in a process
 */
async function detectProcessIssues(
  process: { id: string; status: string; updatedAt: Date; steps?: { id: string }[] },
  metrics: ProcessHealthDetail['metrics']
): Promise<ProcessIssue[]> {
  const issues: ProcessIssue[] = [];

  // Check for stalled process
  const daysSinceUpdated = daysSinceUpdate(process.updatedAt);
  if (daysSinceUpdated > 14) {
    issues.push({
      type: 'stuck',
      severity: 'critical',
      description: `Process has not been updated in ${daysSinceUpdated} days`,
      affectedInstances: 1,
      recommendedAction: 'Review process status and investigate blockers',
    });
  } else if (daysSinceUpdated > 7) {
    issues.push({
      type: 'stuck',
      severity: 'high',
      description: `Process has not been updated in ${daysSinceUpdated} days`,
      affectedInstances: 1,
      recommendedAction: 'Check for blockers or reassign ownership',
    });
  }

  // Check for high error rate
  if (metrics.errorRate > 20) {
    issues.push({
      type: 'error',
      severity: metrics.errorRate > 40 ? 'critical' : 'high',
      description: `Error rate is at ${metrics.errorRate.toFixed(1)}%`,
      affectedInstances: Math.round(metrics.errorRate * metrics.throughput / 100),
      recommendedAction: 'Analyze error patterns and fix root causes',
    });
  } else if (metrics.errorRate > 10) {
    issues.push({
      type: 'error',
      severity: 'medium',
      description: `Error rate is at ${metrics.errorRate.toFixed(1)}%`,
      affectedInstances: Math.round(metrics.errorRate * metrics.throughput / 100),
      recommendedAction: 'Monitor error trends and address recurring issues',
    });
  }

  // Check for delays (low on-time rate)
  if (metrics.onTimeRate < 60) {
    issues.push({
      type: 'delay',
      severity: 'high',
      description: `Only ${metrics.onTimeRate.toFixed(0)}% of instances completed on time`,
      affectedInstances: Math.round((100 - metrics.onTimeRate) * metrics.throughput / 100),
      recommendedAction: 'Review process timeline and identify bottleneck steps',
    });
  } else if (metrics.onTimeRate < 80) {
    issues.push({
      type: 'delay',
      severity: 'medium',
      description: `On-time completion rate is ${metrics.onTimeRate.toFixed(0)}%`,
      affectedInstances: Math.round((100 - metrics.onTimeRate) * metrics.throughput / 100),
      recommendedAction: 'Consider adjusting timelines or adding resources',
    });
  }

  // Check for backlog
  if (metrics.backlogCount > 50) {
    issues.push({
      type: 'bottleneck',
      severity: 'critical',
      description: `Backlog of ${metrics.backlogCount} pending items`,
      affectedInstances: metrics.backlogCount,
      recommendedAction: 'Add resources or redistribute workload',
    });
  } else if (metrics.backlogCount > 20) {
    issues.push({
      type: 'bottleneck',
      severity: 'medium',
      description: `Backlog of ${metrics.backlogCount} pending items`,
      affectedInstances: metrics.backlogCount,
      recommendedAction: 'Monitor backlog growth and plan capacity',
    });
  }

  // Check for overdue items
  const overdueCount = await getOverdueCount(process.id);
  if (overdueCount > 10) {
    issues.push({
      type: 'overdue',
      severity: overdueCount > 30 ? 'critical' : 'high',
      description: `${overdueCount} overdue items require attention`,
      affectedInstances: overdueCount,
      recommendedAction: 'Prioritize and address overdue items',
    });
  } else if (overdueCount > 0) {
    issues.push({
      type: 'overdue',
      severity: 'medium',
      description: `${overdueCount} overdue items`,
      affectedInstances: overdueCount,
      recommendedAction: 'Review and update overdue items',
    });
  }

  return issues;
}

/**
 * Get count of overdue items for a process
 */
async function getOverdueCount(processId: string): Promise<number> {
  try {
    return await prisma.task.count({
      where: {
        processId,
        status: { notIn: ['completed', 'cancelled'] },
        dueDate: { lt: new Date() },
      },
    });
  } catch {
    return 0;
  }
}

/**
 * Calculate health trend over time
 */
async function calculateTrend(
  processId: string,
  organizationId: string
): Promise<'improving' | 'stable' | 'degrading'> {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Compare recent week vs previous week
    const [recentMetrics, previousMetrics] = await Promise.all([
      timescaleClient.queryWorkloadMetrics({
        organizationId,
        startTime: oneWeekAgo,
        endTime: now,
      }),
      timescaleClient.queryWorkloadMetrics({
        organizationId,
        startTime: twoWeeksAgo,
        endTime: oneWeekAgo,
      }),
    ]);

    const recentProcess = recentMetrics.filter(m => m.metadata?.processId === processId);
    const previousProcess = previousMetrics.filter(m => m.metadata?.processId === processId);

    if (recentProcess.length === 0 || previousProcess.length === 0) {
      return 'stable';
    }

    // Calculate average on-time rates
    const recentOnTime = recentProcess.reduce((sum, m) => sum + (m.on_time_rate || 0), 0) / recentProcess.length;
    const previousOnTime = previousProcess.reduce((sum, m) => sum + (m.on_time_rate || 0), 0) / previousProcess.length;

    const difference = recentOnTime - previousOnTime;

    if (difference > 5) return 'improving';
    if (difference < -5) return 'degrading';
    return 'stable';
  } catch {
    return 'stable';
  }
}

/**
 * Get time range in milliseconds
 */
function getTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case 'day':
      return 24 * 60 * 60 * 1000;
    case 'week':
      return 7 * 24 * 60 * 60 * 1000;
    case 'month':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Calculate days since last update
 */
function daysSinceUpdate(updatedAt: Date): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Get health details for a specific process
 */
export async function getProcessHealthDetail(
  processId: string,
  organizationId: string
): Promise<ProcessHealthDetail | null> {
  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId },
    include: {
      steps: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!process) return null;

  return calculateProcessHealth(process, organizationId, 'week');
}

export default {
  getProcessHealthSummary,
  getProcessHealthDetail,
};
