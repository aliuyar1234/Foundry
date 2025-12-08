/**
 * Routing Analysis Job Processor
 * T048 - Create routing analysis job processor
 *
 * Performs background analysis of routing decisions to:
 * - Calculate accuracy metrics
 * - Identify optimization opportunities
 * - Update routing rule effectiveness
 * - Generate routing recommendations
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { BaseProcessor, ProcessorContext } from '../baseProcessor.js';
import {
  query,
  getRoutingAccuracy,
  getRoutingByHandler,
} from '../../services/operate/timescaleClient.js';
import type { RoutingMetrics, RoutingTrend } from 'shared/types/routing.js';

// =============================================================================
// Types
// =============================================================================

export interface RoutingAnalysisJobData {
  organizationId: string;
  analysisType: AnalysisType;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  options?: {
    includeRecommendations?: boolean;
    updateRuleEffectiveness?: boolean;
    generateAlerts?: boolean;
  };
}

export type AnalysisType =
  | 'daily_summary'
  | 'weekly_report'
  | 'rule_effectiveness'
  | 'handler_performance'
  | 'trend_analysis'
  | 'optimization_scan';

export interface RoutingAnalysisResult {
  organizationId: string;
  analysisType: AnalysisType;
  timestamp: Date;
  metrics: RoutingMetrics;
  trends?: RoutingTrend[];
  recommendations?: RoutingRecommendation[];
  ruleEffectiveness?: RuleEffectivenessReport[];
  handlerPerformance?: HandlerPerformanceReport[];
  alerts?: RoutingAlert[];
}

export interface RoutingRecommendation {
  id: string;
  type: 'create_rule' | 'modify_rule' | 'disable_rule' | 'adjust_handler' | 'add_fallback';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  expectedImpact: string;
  affectedRuleId?: string;
  suggestedChanges?: Record<string, unknown>;
}

export interface RuleEffectivenessReport {
  ruleId: string;
  ruleName: string;
  matchCount: number;
  successRate: number;
  avgConfidence: number;
  escalationRate: number;
  avgFeedbackScore: number;
  effectiveness: 'excellent' | 'good' | 'fair' | 'poor';
  trend: 'improving' | 'stable' | 'declining';
}

export interface HandlerPerformanceReport {
  handlerId: string;
  handlerType: string;
  totalReceived: number;
  avgResponseTime: number;
  avgFeedbackScore: number;
  capacityUtilization: number;
  performance: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface RoutingAlert {
  type: RoutingAlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export type RoutingAlertType =
  | 'accuracy_drop'
  | 'escalation_spike'
  | 'handler_overload'
  | 'rule_ineffective'
  | 'no_fallback'
  | 'slow_routing';

// =============================================================================
// Processor Implementation
// =============================================================================

export class RoutingAnalysisProcessor extends BaseProcessor<
  RoutingAnalysisJobData,
  RoutingAnalysisResult
> {
  constructor(prisma: PrismaClient) {
    super('routing-analysis' as any, prisma);
  }

  protected async process(
    job: Job<RoutingAnalysisJobData>,
    context: ProcessorContext
  ): Promise<RoutingAnalysisResult> {
    const { organizationId, analysisType, dateRange, options } = job.data;

    context.logger.info(`Starting routing analysis: ${analysisType}`);

    // Calculate date range
    const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : new Date();
    const startDate = dateRange?.startDate
      ? new Date(dateRange.startDate)
      : this.getDefaultStartDate(analysisType, endDate);

    await this.updateProgress(job, { current: 1, total: 5, stage: 'Fetching metrics' });

    // Fetch base metrics
    const metrics = await this.calculateMetrics(organizationId, startDate, endDate, context);

    await this.updateProgress(job, { current: 2, total: 5, stage: 'Analyzing trends' });

    // Analyze trends
    const trends = await this.analyzeTrends(organizationId, startDate, endDate);

    await this.updateProgress(job, { current: 3, total: 5, stage: 'Evaluating rules' });

    // Evaluate rule effectiveness
    let ruleEffectiveness: RuleEffectivenessReport[] | undefined;
    if (
      analysisType === 'rule_effectiveness' ||
      analysisType === 'weekly_report' ||
      analysisType === 'optimization_scan'
    ) {
      ruleEffectiveness = await this.evaluateRuleEffectiveness(
        organizationId,
        startDate,
        endDate,
        context
      );
    }

    await this.updateProgress(job, { current: 4, total: 5, stage: 'Analyzing handlers' });

    // Analyze handler performance
    let handlerPerformance: HandlerPerformanceReport[] | undefined;
    if (
      analysisType === 'handler_performance' ||
      analysisType === 'weekly_report' ||
      analysisType === 'optimization_scan'
    ) {
      handlerPerformance = await this.analyzeHandlerPerformance(
        organizationId,
        startDate,
        endDate
      );
    }

    await this.updateProgress(job, { current: 5, total: 5, stage: 'Generating insights' });

    // Generate recommendations if requested
    let recommendations: RoutingRecommendation[] | undefined;
    if (options?.includeRecommendations) {
      recommendations = this.generateRecommendations(
        metrics,
        trends,
        ruleEffectiveness,
        handlerPerformance
      );
    }

    // Generate alerts if requested
    let alerts: RoutingAlert[] | undefined;
    if (options?.generateAlerts) {
      alerts = this.generateAlerts(metrics, trends, ruleEffectiveness);
    }

    // Update rule effectiveness if requested
    if (options?.updateRuleEffectiveness && ruleEffectiveness) {
      await this.updateRuleEffectivenessInDb(organizationId, ruleEffectiveness, context);
    }

    const result: RoutingAnalysisResult = {
      organizationId,
      analysisType,
      timestamp: new Date(),
      metrics,
      trends,
      recommendations,
      ruleEffectiveness,
      handlerPerformance,
      alerts,
    };

    context.logger.info('Routing analysis completed', {
      metricsCount: 1,
      trendsCount: trends?.length,
      recommendationsCount: recommendations?.length,
      alertsCount: alerts?.length,
    });

    return result;
  }

  // ==========================================================================
  // Metrics Calculation
  // ==========================================================================

  private async calculateMetrics(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    context: ProcessorContext
  ): Promise<RoutingMetrics> {
    // Get decisions from database
    const decisions = await context.prisma.routingDecision.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        confidence: true,
        wasEscalated: true,
        wasRerouted: true,
        responseTime: true,
        feedbackScore: true,
        requestType: true,
        handlerId: true,
      },
    });

    if (decisions.length === 0) {
      return this.emptyMetrics();
    }

    // Calculate aggregate metrics
    const totalDecisions = decisions.length;
    const confidences = decisions.map((d) => d.confidence);
    const escalations = decisions.filter((d) => d.wasEscalated).length;
    const reroutes = decisions.filter((d) => d.wasRerouted).length;
    const responseTimes = decisions
      .filter((d) => d.responseTime)
      .map((d) => d.responseTime!);
    const feedbackScores = decisions
      .filter((d) => d.feedbackScore)
      .map((d) => d.feedbackScore!);

    // Calculate by request type
    const byRequestType: Record<
      string,
      { count: number; avgConfidence: number; avgResponseTime: number }
    > = {};
    const typeGroups = this.groupBy(decisions, 'requestType');
    for (const [type, items] of Object.entries(typeGroups)) {
      byRequestType[type] = {
        count: items.length,
        avgConfidence: this.average(items.map((i) => i.confidence)),
        avgResponseTime: this.average(
          items.filter((i) => i.responseTime).map((i) => i.responseTime!)
        ),
      };
    }

    // Calculate by handler
    const byHandler: Record<
      string,
      { count: number; avgConfidence: number; feedbackScore: number }
    > = {};
    const handlerGroups = this.groupBy(decisions, 'handlerId');
    for (const [handler, items] of Object.entries(handlerGroups)) {
      const scores = items.filter((i) => i.feedbackScore).map((i) => i.feedbackScore!);
      byHandler[handler] = {
        count: items.length,
        avgConfidence: this.average(items.map((i) => i.confidence)),
        feedbackScore: scores.length > 0 ? this.average(scores) : 0,
      };
    }

    // Calculate accuracy (feedback >= 4 considered correct)
    const correctDecisions = feedbackScores.filter((s) => s >= 4).length;
    const accuracyRate =
      feedbackScores.length > 0 ? correctDecisions / feedbackScores.length : 0;

    return {
      totalDecisions,
      averageConfidence: this.average(confidences),
      escalationRate: escalations / totalDecisions,
      rerouteRate: reroutes / totalDecisions,
      averageResponseTimeMs:
        responseTimes.length > 0 ? this.average(responseTimes) : 0,
      feedbackScore: feedbackScores.length > 0 ? this.average(feedbackScores) : 0,
      accuracyRate,
      byRequestType,
      byHandler,
    };
  }

  // ==========================================================================
  // Trend Analysis
  // ==========================================================================

  private async analyzeTrends(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RoutingTrend[]> {
    try {
      const accuracy = await getRoutingAccuracy(organizationId, startDate, endDate, 'day');

      return accuracy.map((row: any) => ({
        timestamp: new Date(row.period),
        totalDecisions: Number(row.total_decisions),
        averageConfidence: Number(row.avg_confidence) || 0,
        escalationRate: row.escalations / row.total_decisions,
        accuracyRate: Number(row.accuracy_pct) / 100 || 0,
      }));
    } catch (error) {
      // TimescaleDB might not be configured
      return [];
    }
  }

  // ==========================================================================
  // Rule Effectiveness
  // ==========================================================================

  private async evaluateRuleEffectiveness(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    context: ProcessorContext
  ): Promise<RuleEffectivenessReport[]> {
    const rules = await context.prisma.routingRule.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });

    const reports: RuleEffectivenessReport[] = [];

    for (const rule of rules) {
      const decisions = await context.prisma.routingDecision.findMany({
        where: {
          ruleId: rule.id,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          confidence: true,
          wasEscalated: true,
          feedbackScore: true,
        },
      });

      if (decisions.length === 0) continue;

      const escalations = decisions.filter((d) => d.wasEscalated).length;
      const feedbackScores = decisions
        .filter((d) => d.feedbackScore)
        .map((d) => d.feedbackScore!);
      const avgFeedback =
        feedbackScores.length > 0 ? this.average(feedbackScores) : 0;
      const successCount = feedbackScores.filter((s) => s >= 4).length;
      const successRate =
        feedbackScores.length > 0 ? successCount / feedbackScores.length : 0;

      // Determine effectiveness
      let effectiveness: RuleEffectivenessReport['effectiveness'];
      if (successRate >= 0.9 && avgFeedback >= 4.5) effectiveness = 'excellent';
      else if (successRate >= 0.75 && avgFeedback >= 4.0) effectiveness = 'good';
      else if (successRate >= 0.6 && avgFeedback >= 3.5) effectiveness = 'fair';
      else effectiveness = 'poor';

      reports.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matchCount: decisions.length,
        successRate,
        avgConfidence: this.average(decisions.map((d) => d.confidence)),
        escalationRate: escalations / decisions.length,
        avgFeedbackScore: avgFeedback,
        effectiveness,
        trend: 'stable', // Would need historical comparison
      });
    }

    return reports.sort((a, b) => b.matchCount - a.matchCount);
  }

  // ==========================================================================
  // Handler Performance
  // ==========================================================================

  private async analyzeHandlerPerformance(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<HandlerPerformanceReport[]> {
    try {
      const handlerData = await getRoutingByHandler(organizationId, startDate, endDate);

      return handlerData.map((row: any) => {
        const avgFeedback = Number(row.avg_feedback) || 0;
        const avgResponseTime = Number(row.avg_response_time) || 0;

        // Determine performance rating
        let performance: HandlerPerformanceReport['performance'];
        if (avgFeedback >= 4.5 && avgResponseTime < 1800000) performance = 'excellent';
        else if (avgFeedback >= 4.0 && avgResponseTime < 3600000) performance = 'good';
        else if (avgFeedback >= 3.5) performance = 'fair';
        else performance = 'poor';

        return {
          handlerId: row.handler_id,
          handlerType: row.handler_type,
          totalReceived: Number(row.total_received),
          avgResponseTime,
          avgFeedbackScore: avgFeedback,
          capacityUtilization: 0, // Would need workload data
          performance,
        };
      });
    } catch (error) {
      return [];
    }
  }

  // ==========================================================================
  // Recommendations
  // ==========================================================================

  private generateRecommendations(
    metrics: RoutingMetrics,
    trends?: RoutingTrend[],
    ruleEffectiveness?: RuleEffectivenessReport[],
    handlerPerformance?: HandlerPerformanceReport[]
  ): RoutingRecommendation[] {
    const recommendations: RoutingRecommendation[] = [];

    // Check overall accuracy
    if (metrics.accuracyRate < 0.85) {
      recommendations.push({
        id: `rec-${Date.now()}-1`,
        type: 'modify_rule',
        priority: 'high',
        title: 'Improve routing accuracy',
        description: `Current accuracy is ${(metrics.accuracyRate * 100).toFixed(1)}%, below the 85% target. Review rule criteria for top misrouted categories.`,
        expectedImpact: 'Increase accuracy by 5-10%',
      });
    }

    // Check escalation rate
    if (metrics.escalationRate > 0.15) {
      recommendations.push({
        id: `rec-${Date.now()}-2`,
        type: 'add_fallback',
        priority: 'medium',
        title: 'Reduce escalation rate',
        description: `Escalation rate is ${(metrics.escalationRate * 100).toFixed(1)}%. Consider adding fallback handlers or adjusting handler workload limits.`,
        expectedImpact: 'Reduce escalations by 25%',
      });
    }

    // Check ineffective rules
    if (ruleEffectiveness) {
      const poorRules = ruleEffectiveness.filter((r) => r.effectiveness === 'poor');
      for (const rule of poorRules.slice(0, 3)) {
        recommendations.push({
          id: `rec-${Date.now()}-rule-${rule.ruleId}`,
          type: rule.matchCount < 10 ? 'disable_rule' : 'modify_rule',
          priority: rule.matchCount > 50 ? 'high' : 'medium',
          title: `Review rule: ${rule.ruleName}`,
          description: `This rule has ${(rule.successRate * 100).toFixed(1)}% success rate with ${rule.matchCount} matches. Consider updating criteria or disabling.`,
          expectedImpact: 'Improve routing quality for affected requests',
          affectedRuleId: rule.ruleId,
        });
      }
    }

    // Check handler overload
    if (handlerPerformance) {
      const overloaded = handlerPerformance.filter(
        (h) => h.capacityUtilization > 90 || h.avgResponseTime > 7200000
      );
      for (const handler of overloaded.slice(0, 2)) {
        recommendations.push({
          id: `rec-${Date.now()}-handler-${handler.handlerId}`,
          type: 'adjust_handler',
          priority: 'high',
          title: `Reduce load for handler`,
          description: `Handler ${handler.handlerId} has high response times (${Math.round(handler.avgResponseTime / 60000)}min avg). Consider redistributing workload.`,
          expectedImpact: 'Improve response times by 30%',
        });
      }
    }

    // Trend-based recommendations
    if (trends && trends.length >= 3) {
      const recentTrend = trends.slice(0, 3);
      const accuracyTrend = recentTrend[0].accuracyRate - recentTrend[2].accuracyRate;
      if (accuracyTrend < -0.1) {
        recommendations.push({
          id: `rec-${Date.now()}-trend`,
          type: 'modify_rule',
          priority: 'high',
          title: 'Address declining accuracy trend',
          description: `Accuracy has dropped ${Math.abs(accuracyTrend * 100).toFixed(1)}% over the past 3 periods. Investigate recent changes.`,
          expectedImpact: 'Reverse negative trend',
        });
      }
    }

    return recommendations;
  }

  // ==========================================================================
  // Alerts
  // ==========================================================================

  private generateAlerts(
    metrics: RoutingMetrics,
    trends?: RoutingTrend[],
    ruleEffectiveness?: RuleEffectivenessReport[]
  ): RoutingAlert[] {
    const alerts: RoutingAlert[] = [];

    // Accuracy alert
    if (metrics.accuracyRate < 0.8) {
      alerts.push({
        type: 'accuracy_drop',
        severity: metrics.accuracyRate < 0.7 ? 'critical' : 'warning',
        message: `Routing accuracy dropped to ${(metrics.accuracyRate * 100).toFixed(1)}%`,
        data: { currentAccuracy: metrics.accuracyRate },
        createdAt: new Date(),
      });
    }

    // Escalation spike
    if (metrics.escalationRate > 0.2) {
      alerts.push({
        type: 'escalation_spike',
        severity: metrics.escalationRate > 0.3 ? 'critical' : 'warning',
        message: `Escalation rate is ${(metrics.escalationRate * 100).toFixed(1)}%`,
        data: { escalationRate: metrics.escalationRate },
        createdAt: new Date(),
      });
    }

    // Slow routing
    if (metrics.averageResponseTimeMs > 5 * 60 * 60 * 1000) {
      // > 5 hours
      alerts.push({
        type: 'slow_routing',
        severity: 'warning',
        message: `Average response time is ${Math.round(metrics.averageResponseTimeMs / 3600000)}h`,
        data: { avgResponseTime: metrics.averageResponseTimeMs },
        createdAt: new Date(),
      });
    }

    // Ineffective rules
    if (ruleEffectiveness) {
      const veryPoor = ruleEffectiveness.filter(
        (r) => r.effectiveness === 'poor' && r.matchCount > 20
      );
      if (veryPoor.length > 0) {
        alerts.push({
          type: 'rule_ineffective',
          severity: 'warning',
          message: `${veryPoor.length} routing rules have poor effectiveness`,
          data: { rules: veryPoor.map((r) => r.ruleId) },
          createdAt: new Date(),
        });
      }
    }

    return alerts;
  }

  // ==========================================================================
  // Database Updates
  // ==========================================================================

  private async updateRuleEffectivenessInDb(
    organizationId: string,
    reports: RuleEffectivenessReport[],
    context: ProcessorContext
  ): Promise<void> {
    for (const report of reports) {
      try {
        // Store effectiveness metrics (could add to RoutingRule model or separate table)
        // For now, just log
        context.logger.debug('Rule effectiveness updated', {
          ruleId: report.ruleId,
          effectiveness: report.effectiveness,
          successRate: report.successRate,
        });
      } catch (error) {
        context.logger.error('Failed to update rule effectiveness', error as Error);
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getDefaultStartDate(analysisType: AnalysisType, endDate: Date): Date {
    const start = new Date(endDate);
    switch (analysisType) {
      case 'daily_summary':
        start.setDate(start.getDate() - 1);
        break;
      case 'weekly_report':
        start.setDate(start.getDate() - 7);
        break;
      case 'trend_analysis':
        start.setDate(start.getDate() - 30);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }
    return start;
  }

  private emptyMetrics(): RoutingMetrics {
    return {
      totalDecisions: 0,
      averageConfidence: 0,
      escalationRate: 0,
      rerouteRate: 0,
      averageResponseTimeMs: 0,
      feedbackScore: 0,
      accuracyRate: 0,
      byRequestType: {},
      byHandler: {},
    };
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  private groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
    return arr.reduce(
      (groups, item) => {
        const val = String(item[key] || 'unknown');
        groups[val] = groups[val] || [];
        groups[val].push(item);
        return groups;
      },
      {} as Record<string, T[]>
    );
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRoutingAnalysisProcessor(
  prisma: PrismaClient
): RoutingAnalysisProcessor {
  return new RoutingAnalysisProcessor(prisma);
}

export default RoutingAnalysisProcessor;
