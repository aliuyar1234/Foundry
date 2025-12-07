/**
 * Metrics Aggregator Service
 * T095 - Create metrics aggregator service
 *
 * Aggregates operational metrics from various sources for the command center dashboard
 */

import { prisma } from '../../lib/prisma';
import * as timescaleClient from '../operate/timescaleClient';
import * as expertiseGraph from '../operate/expertiseGraph';
import Redis from 'ioredis';

// Initialize Redis for caching
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface AggregatedMetrics {
  timestamp: Date;
  organizationId: string;
  overview: OverviewMetrics;
  workload: WorkloadMetrics;
  routing: RoutingMetrics;
  compliance: ComplianceMetrics;
  health: HealthMetrics;
}

export interface OverviewMetrics {
  activeProcesses: number;
  pendingApprovals: number;
  activeUsers: number;
  openIssues: number;
  resolvedToday: number;
  avgResponseTime: number; // minutes
}

export interface WorkloadMetrics {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  avgWorkloadScore: number;
  highWorkloadUsers: number;
  burnoutRiskCount: number;
  distribution: {
    department: string;
    count: number;
    avgWorkload: number;
  }[];
}

export interface RoutingMetrics {
  totalRoutedToday: number;
  successRate: number;
  avgConfidence: number;
  manualOverrides: number;
  topCategories: {
    category: string;
    count: number;
    successRate: number;
  }[];
}

export interface ComplianceMetrics {
  totalRules: number;
  compliantPercentage: number;
  violations: number;
  pendingReview: number;
  upcomingDeadlines: number;
  riskScore: number;
}

export interface HealthMetrics {
  overallScore: number; // 0-100
  processHealth: number;
  systemHealth: number;
  dataHealth: number;
  integrationHealth: number;
  bottlenecks: BottleneckInfo[];
}

export interface BottleneckInfo {
  type: 'process' | 'person' | 'system' | 'integration';
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  affectedCount: number;
}

const CACHE_TTL = 60; // 1 minute cache

/**
 * Get aggregated metrics for an organization
 */
export async function getAggregatedMetrics(
  organizationId: string,
  options: {
    forceRefresh?: boolean;
    timeRange?: 'hour' | 'day' | 'week' | 'month';
  } = {}
): Promise<AggregatedMetrics> {
  const { forceRefresh = false, timeRange = 'day' } = options;
  const cacheKey = `metrics:aggregated:${organizationId}:${timeRange}`;

  // Check cache first
  if (!forceRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  // Aggregate from all sources in parallel
  const [overview, workload, routing, compliance, health] = await Promise.all([
    aggregateOverviewMetrics(organizationId, timeRange),
    aggregateWorkloadMetrics(organizationId, timeRange),
    aggregateRoutingMetrics(organizationId, timeRange),
    aggregateComplianceMetrics(organizationId),
    aggregateHealthMetrics(organizationId),
  ]);

  const metrics: AggregatedMetrics = {
    timestamp: new Date(),
    organizationId,
    overview,
    workload,
    routing,
    compliance,
    health,
  };

  // Cache the result
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(metrics));

  return metrics;
}

/**
 * Aggregate overview metrics
 */
async function aggregateOverviewMetrics(
  organizationId: string,
  _timeRange: string
): Promise<OverviewMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get counts from Prisma
  const [
    activeProcesses,
    pendingApprovals,
    openIssues,
    resolvedToday,
  ] = await Promise.all([
    prisma.process.count({
      where: {
        organizationId,
        status: { in: ['active', 'pending'] },
      },
    }),
    prisma.routingDecision.count({
      where: {
        organizationId,
        status: 'pending',
      },
    }),
    prisma.complianceViolation.count({
      where: {
        organizationId,
        status: { in: ['open', 'investigating'] },
      },
    }),
    prisma.routingDecision.count({
      where: {
        organizationId,
        status: 'completed',
        resolvedAt: { gte: today },
      },
    }),
  ]);

  // Get active users (users with activity in last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const activeUsers = await prisma.user.count({
    where: {
      organizationId,
      lastActiveAt: { gte: oneHourAgo },
    },
  });

  // Calculate average response time from TimescaleDB
  const avgResponseTime = await calculateAvgResponseTime(organizationId);

  return {
    activeProcesses,
    pendingApprovals,
    activeUsers,
    openIssues,
    resolvedToday,
    avgResponseTime,
  };
}

/**
 * Aggregate workload metrics
 */
async function aggregateWorkloadMetrics(
  organizationId: string,
  _timeRange: string
): Promise<WorkloadMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get task counts
  const taskCounts = await prisma.task.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: true,
  });

  const totalTasks = taskCounts.reduce((sum, t) => sum + t._count, 0);
  const completedTasks = taskCounts.find(t => t.status === 'completed')?._count || 0;

  // Get overdue tasks
  const overdueTasks = await prisma.task.count({
    where: {
      organizationId,
      status: { notIn: ['completed', 'cancelled'] },
      dueDate: { lt: new Date() },
    },
  });

  // Get workload scores from expertise profiles
  const workloadData = await getWorkloadDistribution(organizationId);

  return {
    totalTasks,
    completedTasks,
    overdueTasks,
    avgWorkloadScore: workloadData.avgScore,
    highWorkloadUsers: workloadData.highCount,
    burnoutRiskCount: workloadData.burnoutRisk,
    distribution: workloadData.distribution,
  };
}

/**
 * Aggregate routing metrics
 */
async function aggregateRoutingMetrics(
  organizationId: string,
  _timeRange: string
): Promise<RoutingMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get today's routing decisions
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      createdAt: { gte: today },
    },
    select: {
      confidence: true,
      wasSuccessful: true,
      wasManualOverride: true,
      category: true,
    },
  });

  const totalRoutedToday = decisions.length;
  const successful = decisions.filter(d => d.wasSuccessful === true).length;
  const successRate = totalRoutedToday > 0 ? (successful / totalRoutedToday) * 100 : 0;
  const avgConfidence = totalRoutedToday > 0
    ? decisions.reduce((sum, d) => sum + (d.confidence || 0), 0) / totalRoutedToday
    : 0;
  const manualOverrides = decisions.filter(d => d.wasManualOverride).length;

  // Get category distribution
  const categoryMap = new Map<string, { count: number; successful: number }>();
  for (const decision of decisions) {
    const category = decision.category || 'uncategorized';
    const existing = categoryMap.get(category) || { count: 0, successful: 0 };
    existing.count++;
    if (decision.wasSuccessful) existing.successful++;
    categoryMap.set(category, existing);
  }

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      successRate: (data.successful / data.count) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalRoutedToday,
    successRate,
    avgConfidence,
    manualOverrides,
    topCategories,
  };
}

/**
 * Aggregate compliance metrics
 */
async function aggregateComplianceMetrics(
  organizationId: string
): Promise<ComplianceMetrics> {
  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalRules,
    violations,
    pendingReview,
    upcomingDeadlines,
  ] = await Promise.all([
    prisma.complianceRule.count({
      where: { organizationId, isActive: true },
    }),
    prisma.complianceViolation.count({
      where: {
        organizationId,
        status: { in: ['open', 'investigating'] },
      },
    }),
    prisma.complianceEvidence.count({
      where: {
        organizationId,
        status: 'pending_review',
      },
    }),
    prisma.complianceRule.count({
      where: {
        organizationId,
        isActive: true,
        nextReviewDate: { lte: oneWeekFromNow },
      },
    }),
  ]);

  // Calculate compliance percentage
  const evidenceStats = await prisma.complianceEvidence.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: true,
  });

  const totalEvidence = evidenceStats.reduce((sum, e) => sum + e._count, 0);
  const compliantEvidence = evidenceStats.find(e => e.status === 'approved')?._count || 0;
  const compliantPercentage = totalEvidence > 0 ? (compliantEvidence / totalEvidence) * 100 : 100;

  // Calculate risk score (0-100, higher is worse)
  const riskScore = Math.min(100, violations * 10 + (100 - compliantPercentage));

  return {
    totalRules,
    compliantPercentage,
    violations,
    pendingReview,
    upcomingDeadlines,
    riskScore,
  };
}

/**
 * Aggregate health metrics
 */
async function aggregateHealthMetrics(
  organizationId: string
): Promise<HealthMetrics> {
  // Calculate individual health scores
  const [processHealth, systemHealth, dataHealth, integrationHealth] = await Promise.all([
    calculateProcessHealth(organizationId),
    calculateSystemHealth(organizationId),
    calculateDataHealth(organizationId),
    calculateIntegrationHealth(organizationId),
  ]);

  // Detect bottlenecks
  const bottlenecks = await detectBottlenecks(organizationId);

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    processHealth * 0.3 +
    systemHealth * 0.25 +
    dataHealth * 0.25 +
    integrationHealth * 0.2
  );

  return {
    overallScore,
    processHealth,
    systemHealth,
    dataHealth,
    integrationHealth,
    bottlenecks,
  };
}

/**
 * Calculate average response time from TimescaleDB
 */
async function calculateAvgResponseTime(organizationId: string): Promise<number> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    const decisions = await timescaleClient.queryRoutingDecisions({
      organizationId,
      startTime,
      endTime,
    });

    if (decisions.length === 0) return 0;

    const responseTimes = decisions
      .filter((d): d is typeof d & { resolved_at: Date } => d.resolved_at !== null)
      .map(d => {
        const created = new Date(d.created_at);
        const resolved = new Date(d.resolved_at);
        return (resolved.getTime() - created.getTime()) / 60000; // Convert to minutes
      });

    return responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
  } catch {
    return 0;
  }
}

/**
 * Get workload distribution across departments
 */
async function getWorkloadDistribution(organizationId: string): Promise<{
  avgScore: number;
  highCount: number;
  burnoutRisk: number;
  distribution: { department: string; count: number; avgWorkload: number }[];
}> {
  try {
    // Get expertise profiles with workload data
    const profiles = await expertiseGraph.getExpertiseProfiles(organizationId);

    if (profiles.length === 0) {
      return {
        avgScore: 0,
        highCount: 0,
        burnoutRisk: 0,
        distribution: [],
      };
    }

    const workloadScores = profiles.map(p => p.workloadScore || 0);
    const avgScore = workloadScores.reduce((a, b) => a + b, 0) / workloadScores.length;
    const highCount = workloadScores.filter(s => s > 0.7).length;
    const burnoutRisk = workloadScores.filter(s => s > 0.85).length;

    // Group by department
    const deptMap = new Map<string, { count: number; totalWorkload: number }>();
    for (const profile of profiles) {
      const dept = profile.department || 'Unknown';
      const existing = deptMap.get(dept) || { count: 0, totalWorkload: 0 };
      existing.count++;
      existing.totalWorkload += profile.workloadScore || 0;
      deptMap.set(dept, existing);
    }

    const distribution = Array.from(deptMap.entries()).map(([department, data]) => ({
      department,
      count: data.count,
      avgWorkload: data.totalWorkload / data.count,
    }));

    return { avgScore, highCount, burnoutRisk, distribution };
  } catch {
    return {
      avgScore: 0,
      highCount: 0,
      burnoutRisk: 0,
      distribution: [],
    };
  }
}

/**
 * Calculate process health score
 */
async function calculateProcessHealth(organizationId: string): Promise<number> {
  try {
    const [total, stuck, failed] = await Promise.all([
      prisma.process.count({ where: { organizationId } }),
      prisma.process.count({
        where: {
          organizationId,
          status: 'active',
          updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.process.count({
        where: { organizationId, status: 'failed' },
      }),
    ]);

    if (total === 0) return 100;
    const healthyPercent = ((total - stuck - failed) / total) * 100;
    return Math.max(0, Math.min(100, healthyPercent));
  } catch {
    return 100;
  }
}

/**
 * Calculate system health score
 */
async function calculateSystemHealth(_organizationId: string): Promise<number> {
  // Check various system indicators
  try {
    // For now, return a healthy score. In production, check:
    // - API response times
    // - Queue lengths
    // - Error rates
    // - Memory/CPU usage
    return 95;
  } catch {
    return 50;
  }
}

/**
 * Calculate data health score
 */
async function calculateDataHealth(organizationId: string): Promise<number> {
  try {
    // Check for data quality issues
    const [
      processesWithoutOwner,
      usersWithoutDepartment,
      staleProfiles,
    ] = await Promise.all([
      prisma.process.count({
        where: { organizationId, ownerId: null },
      }),
      prisma.user.count({
        where: { organizationId, department: null },
      }),
      prisma.expertiseProfile.count({
        where: {
          organizationId,
          updatedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const totalIssues = processesWithoutOwner + usersWithoutDepartment + staleProfiles;
    // Each issue reduces health by 2%, max reduction 40%
    const reduction = Math.min(40, totalIssues * 2);
    return 100 - reduction;
  } catch {
    return 80;
  }
}

/**
 * Calculate integration health score
 */
async function calculateIntegrationHealth(_organizationId: string): Promise<number> {
  // Check external service health
  // For now, return a healthy score
  return 90;
}

/**
 * Detect operational bottlenecks
 */
async function detectBottlenecks(organizationId: string): Promise<BottleneckInfo[]> {
  const bottlenecks: BottleneckInfo[] = [];

  try {
    // Check for stuck processes (not updated in 7 days)
    const stuckProcesses = await prisma.process.findMany({
      where: {
        organizationId,
        status: 'active',
        updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      take: 5,
    });

    for (const process of stuckProcesses) {
      bottlenecks.push({
        type: 'process',
        name: process.name,
        severity: 'high',
        impact: 'Process has not progressed in over 7 days',
        affectedCount: 1,
      });
    }

    // Check for overloaded users
    const overloadedUsers = await prisma.user.findMany({
      where: {
        organizationId,
        expertiseProfiles: {
          some: {
            workloadScore: { gt: 0.85 },
          },
        },
      },
      include: {
        expertiseProfiles: {
          select: { workloadScore: true },
        },
      },
      take: 5,
    });

    for (const user of overloadedUsers) {
      const workload = user.expertiseProfiles[0]?.workloadScore || 0;
      bottlenecks.push({
        type: 'person',
        name: user.name || user.email,
        severity: workload > 0.95 ? 'critical' : 'high',
        impact: `Workload at ${Math.round(workload * 100)}% - burnout risk`,
        affectedCount: 1,
      });
    }

    // Check for pending approvals bottleneck
    const pendingApprovals = await prisma.routingDecision.groupBy({
      by: ['handlerId'],
      where: {
        organizationId,
        status: 'pending',
      },
      _count: true,
      having: {
        handlerId: {
          _count: { gt: 10 },
        },
      },
    });

    for (const approval of pendingApprovals) {
      if (approval.handlerId) {
        const user = await prisma.user.findUnique({
          where: { id: approval.handlerId },
          select: { name: true, email: true },
        });

        bottlenecks.push({
          type: 'person',
          name: user?.name || user?.email || 'Unknown',
          severity: approval._count > 20 ? 'critical' : 'medium',
          impact: `${approval._count} pending approvals`,
          affectedCount: approval._count,
        });
      }
    }
  } catch (error) {
    console.error('Error detecting bottlenecks:', error);
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return bottlenecks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Invalidate metrics cache for an organization
 */
export async function invalidateMetricsCache(organizationId: string): Promise<void> {
  const patterns = [
    `metrics:aggregated:${organizationId}:*`,
    `metrics:overview:${organizationId}`,
    `metrics:workload:${organizationId}`,
  ];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export default {
  getAggregatedMetrics,
  invalidateMetricsCache,
};
