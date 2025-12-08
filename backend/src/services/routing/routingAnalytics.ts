/**
 * Routing Analytics Service
 * T047 - Create routing analytics
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getRoutingAccuracy, getRoutingVolume } from '../operate/timescaleClient.js';

// =============================================================================
// Types
// =============================================================================

export interface RoutingStats {
  totalDecisions: number;
  successfulDecisions: number;
  escalatedDecisions: number;
  averageConfidence: number;
  averageProcessingTimeMs: number;
  successRate: number;
  escalationRate: number;
}

export interface HandlerPerformance {
  handlerId: string;
  handlerName?: string;
  totalAssignments: number;
  successfulAssignments: number;
  averageConfidence: number;
  averageResolutionTimeMs?: number;
  successRate: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
  averageConfidence: number;
}

export interface TimeSeriesPoint {
  time: Date;
  value: number;
}

export interface RoutingTrends {
  volumeOverTime: TimeSeriesPoint[];
  confidenceOverTime: TimeSeriesPoint[];
  successRateOverTime: TimeSeriesPoint[];
  escalationRateOverTime: TimeSeriesPoint[];
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Get overall routing statistics
 */
export async function getRoutingStats(
  organizationId: string,
  startTime: Date,
  endTime: Date
): Promise<RoutingStats> {
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      createdAt: { gte: startTime, lte: endTime },
    },
    select: {
      confidence: true,
      processingTimeMs: true,
      wasSuccessful: true,
      wasEscalated: true,
    },
  });

  if (decisions.length === 0) {
    return {
      totalDecisions: 0,
      successfulDecisions: 0,
      escalatedDecisions: 0,
      averageConfidence: 0,
      averageProcessingTimeMs: 0,
      successRate: 0,
      escalationRate: 0,
    };
  }

  const totalDecisions = decisions.length;
  const successfulDecisions = decisions.filter(d => d.wasSuccessful === true).length;
  const escalatedDecisions = decisions.filter(d => d.wasEscalated).length;
  const averageConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions;
  const averageProcessingTimeMs = decisions.reduce((sum, d) => sum + d.processingTimeMs, 0) / totalDecisions;

  return {
    totalDecisions,
    successfulDecisions,
    escalatedDecisions,
    averageConfidence,
    averageProcessingTimeMs,
    successRate: successfulDecisions / totalDecisions,
    escalationRate: escalatedDecisions / totalDecisions,
  };
}

/**
 * Get handler performance metrics
 */
export async function getHandlerPerformance(
  organizationId: string,
  startTime: Date,
  endTime: Date
): Promise<HandlerPerformance[]> {
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      createdAt: { gte: startTime, lte: endTime },
    },
    select: {
      selectedHandlerId: true,
      confidence: true,
      wasSuccessful: true,
      metadata: true,
    },
  });

  // Group by handler
  const handlerMap = new Map<string, {
    assignments: number;
    successful: number;
    confidenceSum: number;
    resolutionTimeSum: number;
    resolutionTimeCount: number;
  }>();

  for (const decision of decisions) {
    const existing = handlerMap.get(decision.selectedHandlerId) || {
      assignments: 0,
      successful: 0,
      confidenceSum: 0,
      resolutionTimeSum: 0,
      resolutionTimeCount: 0,
    };

    existing.assignments++;
    existing.confidenceSum += decision.confidence;
    if (decision.wasSuccessful === true) existing.successful++;

    const metadata = decision.metadata as Record<string, unknown>;
    if (metadata?.resolutionTimeMs) {
      existing.resolutionTimeSum += metadata.resolutionTimeMs as number;
      existing.resolutionTimeCount++;
    }

    handlerMap.set(decision.selectedHandlerId, existing);
  }

  // Convert to array
  const results: HandlerPerformance[] = [];

  for (const [handlerId, stats] of handlerMap) {
    results.push({
      handlerId,
      totalAssignments: stats.assignments,
      successfulAssignments: stats.successful,
      averageConfidence: stats.confidenceSum / stats.assignments,
      averageResolutionTimeMs: stats.resolutionTimeCount > 0
        ? stats.resolutionTimeSum / stats.resolutionTimeCount
        : undefined,
      successRate: stats.successful / stats.assignments,
    });
  }

  // Sort by total assignments descending
  return results.sort((a, b) => b.totalAssignments - a.totalAssignments);
}

/**
 * Get category distribution
 */
export async function getCategoryDistribution(
  organizationId: string,
  startTime: Date,
  endTime: Date
): Promise<CategoryDistribution[]> {
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      createdAt: { gte: startTime, lte: endTime },
    },
    select: {
      requestCategories: true,
      confidence: true,
    },
  });

  // Count categories
  const categoryMap = new Map<string, { count: number; confidenceSum: number }>();
  let totalCategories = 0;

  for (const decision of decisions) {
    for (const category of decision.requestCategories) {
      const existing = categoryMap.get(category) || { count: 0, confidenceSum: 0 };
      existing.count++;
      existing.confidenceSum += decision.confidence;
      categoryMap.set(category, existing);
      totalCategories++;
    }
  }

  // Convert to array with percentages
  const results: CategoryDistribution[] = [];

  for (const [category, stats] of categoryMap) {
    results.push({
      category,
      count: stats.count,
      percentage: stats.count / totalCategories,
      averageConfidence: stats.confidenceSum / stats.count,
    });
  }

  // Sort by count descending
  return results.sort((a, b) => b.count - a.count);
}

/**
 * Get routing trends over time
 */
export async function getRoutingTrends(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  interval: 'hour' | 'day' | 'week' = 'day'
): Promise<RoutingTrends> {
  // Use TimescaleDB for efficient time-series queries
  const volumeData = await getRoutingVolume(organizationId, startTime, endTime, interval);
  const accuracyData = await getRoutingAccuracy(organizationId, startTime, endTime);

  // Process volume data
  const volumeOverTime: TimeSeriesPoint[] = (volumeData as Array<{ bucket: Date; count: string }>)
    .map(row => ({
      time: row.bucket,
      value: parseInt(row.count, 10),
    }));

  // Calculate confidence over time from decisions
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      createdAt: { gte: startTime, lte: endTime },
    },
    select: {
      createdAt: true,
      confidence: true,
      wasSuccessful: true,
      wasEscalated: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by interval
  const intervalMs = interval === 'hour' ? 3600000 : interval === 'day' ? 86400000 : 604800000;
  const groups = new Map<number, {
    confidenceSum: number;
    successCount: number;
    escalatedCount: number;
    total: number;
  }>();

  for (const decision of decisions) {
    const bucket = Math.floor(decision.createdAt.getTime() / intervalMs) * intervalMs;
    const existing = groups.get(bucket) || {
      confidenceSum: 0,
      successCount: 0,
      escalatedCount: 0,
      total: 0,
    };

    existing.confidenceSum += decision.confidence;
    if (decision.wasSuccessful === true) existing.successCount++;
    if (decision.wasEscalated) existing.escalatedCount++;
    existing.total++;

    groups.set(bucket, existing);
  }

  const confidenceOverTime: TimeSeriesPoint[] = [];
  const successRateOverTime: TimeSeriesPoint[] = [];
  const escalationRateOverTime: TimeSeriesPoint[] = [];

  for (const [bucket, stats] of groups) {
    const time = new Date(bucket);
    confidenceOverTime.push({
      time,
      value: stats.confidenceSum / stats.total,
    });
    successRateOverTime.push({
      time,
      value: stats.successCount / stats.total,
    });
    escalationRateOverTime.push({
      time,
      value: stats.escalatedCount / stats.total,
    });
  }

  return {
    volumeOverTime,
    confidenceOverTime,
    successRateOverTime,
    escalationRateOverTime,
  };
}

/**
 * Get low confidence decisions for review
 */
export async function getLowConfidenceDecisions(
  organizationId: string,
  threshold: number = 0.6,
  limit: number = 50
): Promise<Array<{
  decisionId: string;
  requestType: string;
  categories: string[];
  confidence: number;
  handlerId: string;
  createdAt: Date;
}>> {
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      confidence: { lt: threshold },
    },
    select: {
      id: true,
      requestType: true,
      requestCategories: true,
      confidence: true,
      selectedHandlerId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return decisions.map(d => ({
    decisionId: d.id,
    requestType: d.requestType,
    categories: d.requestCategories,
    confidence: d.confidence,
    handlerId: d.selectedHandlerId,
    createdAt: d.createdAt,
  }));
}

/**
 * Get rule effectiveness
 */
export async function getRuleEffectiveness(
  organizationId: string,
  startTime: Date,
  endTime: Date
): Promise<Array<{
  ruleId: string;
  ruleName?: string;
  matchCount: number;
  successCount: number;
  averageConfidence: number;
  successRate: number;
}>> {
  const decisions = await prisma.routingDecision.findMany({
    where: {
      organizationId,
      createdAt: { gte: startTime, lte: endTime },
      matchedRuleId: { not: null },
    },
    select: {
      matchedRuleId: true,
      confidence: true,
      wasSuccessful: true,
    },
  });

  // Group by rule
  const ruleMap = new Map<string, {
    matchCount: number;
    successCount: number;
    confidenceSum: number;
  }>();

  for (const decision of decisions) {
    if (!decision.matchedRuleId) continue;

    const existing = ruleMap.get(decision.matchedRuleId) || {
      matchCount: 0,
      successCount: 0,
      confidenceSum: 0,
    };

    existing.matchCount++;
    existing.confidenceSum += decision.confidence;
    if (decision.wasSuccessful === true) existing.successCount++;

    ruleMap.set(decision.matchedRuleId, existing);
  }

  // Get rule names
  const ruleIds = Array.from(ruleMap.keys());
  const rules = await prisma.routingRule.findMany({
    where: { id: { in: ruleIds } },
    select: { id: true, name: true },
  });

  const ruleNameMap = new Map(rules.map(r => [r.id, r.name]));

  // Convert to array
  const results = Array.from(ruleMap.entries()).map(([ruleId, stats]) => ({
    ruleId,
    ruleName: ruleNameMap.get(ruleId),
    matchCount: stats.matchCount,
    successCount: stats.successCount,
    averageConfidence: stats.confidenceSum / stats.matchCount,
    successRate: stats.successCount / stats.matchCount,
  }));

  // Sort by match count descending
  return results.sort((a, b) => b.matchCount - a.matchCount);
}

/**
 * Get routing summary for dashboard
 */
export async function getRoutingSummary(
  organizationId: string
): Promise<{
  today: RoutingStats;
  thisWeek: RoutingStats;
  thisMonth: RoutingStats;
  topCategories: CategoryDistribution[];
  topHandlers: HandlerPerformance[];
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, thisWeek, thisMonth, topCategories, topHandlers] = await Promise.all([
    getRoutingStats(organizationId, todayStart, now),
    getRoutingStats(organizationId, weekStart, now),
    getRoutingStats(organizationId, monthStart, now),
    getCategoryDistribution(organizationId, weekStart, now).then(cats => cats.slice(0, 5)),
    getHandlerPerformance(organizationId, weekStart, now).then(handlers => handlers.slice(0, 5)),
  ]);

  return {
    today,
    thisWeek,
    thisMonth,
    topCategories,
    topHandlers,
  };
}

export default {
  getRoutingStats,
  getHandlerPerformance,
  getCategoryDistribution,
  getRoutingTrends,
  getLowConfidenceDecisions,
  getRuleEffectiveness,
  getRoutingSummary,
};
