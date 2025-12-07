/**
 * Drill-Down Service
 * T104 - Create drill-down service
 *
 * Provides detailed drill-down capabilities for metrics and alerts
 */

import { prisma } from '../../lib/prisma';
import * as metricsAggregator from './metricsAggregator';
import * as processHealthMetrics from './processHealthMetrics';
import * as workloadDistribution from './workloadDistribution';
import * as bottleneckDetector from './bottleneckDetector';
import * as trendAnalyzer from './trendAnalyzer';

export interface DrillDownRequest {
  organizationId: string;
  metricId: string;
  metricType: 'overview' | 'workload' | 'routing' | 'compliance' | 'health' | 'bottleneck' | 'alert';
  filters?: Record<string, unknown>;
  depth?: 'summary' | 'detailed' | 'full';
}

export interface DrillDownResult {
  metricId: string;
  metricType: string;
  title: string;
  summary: DrillDownSummary;
  details: DrillDownDetails;
  relatedMetrics: RelatedMetric[];
  suggestedActions: SuggestedAction[];
  breadcrumbs: Breadcrumb[];
}

export interface DrillDownSummary {
  currentValue: number | string;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
  trendPeriod: string;
  status: 'good' | 'warning' | 'critical';
  statusMessage: string;
}

export interface DrillDownDetails {
  breakdown: BreakdownItem[];
  timeline: TimelinePoint[];
  contributors: Contributor[];
  insights: Insight[];
}

export interface BreakdownItem {
  id: string;
  name: string;
  value: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  drillDownAvailable: boolean;
}

export interface TimelinePoint {
  timestamp: Date;
  value: number;
  annotation?: string;
}

export interface Contributor {
  type: 'user' | 'process' | 'department' | 'system';
  id: string;
  name: string;
  contribution: number;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface Insight {
  type: 'observation' | 'correlation' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
}

export interface RelatedMetric {
  metricId: string;
  name: string;
  value: number | string;
  correlation: number;
  drillDownAvailable: boolean;
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionType: 'view' | 'assign' | 'escalate' | 'automate' | 'investigate';
  targetUrl?: string;
}

export interface Breadcrumb {
  level: number;
  title: string;
  metricId?: string;
  isCurrent: boolean;
}

/**
 * Get drill-down details for a metric
 */
export async function getDrillDown(request: DrillDownRequest): Promise<DrillDownResult> {
  const { organizationId, metricId, metricType, depth = 'detailed' } = request;

  switch (metricType) {
    case 'overview':
      return drillDownOverview(organizationId, metricId, depth);
    case 'workload':
      return drillDownWorkload(organizationId, metricId, depth);
    case 'routing':
      return drillDownRouting(organizationId, metricId, depth);
    case 'compliance':
      return drillDownCompliance(organizationId, metricId, depth);
    case 'health':
      return drillDownHealth(organizationId, metricId, depth);
    case 'bottleneck':
      return drillDownBottleneck(organizationId, metricId, depth);
    case 'alert':
      return drillDownAlert(organizationId, metricId, depth);
    default:
      throw new Error(`Unknown metric type: ${metricType}`);
  }
}

/**
 * Drill down into overview metrics
 */
async function drillDownOverview(
  organizationId: string,
  metricId: string,
  depth: string
): Promise<DrillDownResult> {
  const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);
  const trends = await trendAnalyzer.analyzeTrends(organizationId, { timeRange: 'week' });

  let title = '';
  let currentValue: number = 0;
  let unit = '';

  switch (metricId) {
    case 'activeProcesses':
      title = 'Active Processes';
      currentValue = metrics.overview.activeProcesses;
      unit = 'processes';
      break;
    case 'pendingApprovals':
      title = 'Pending Approvals';
      currentValue = metrics.overview.pendingApprovals;
      unit = 'approvals';
      break;
    case 'activeUsers':
      title = 'Active Users';
      currentValue = metrics.overview.activeUsers;
      unit = 'users';
      break;
    case 'avgResponseTime':
      title = 'Average Response Time';
      currentValue = metrics.overview.avgResponseTime;
      unit = 'minutes';
      break;
    default:
      title = metricId;
      currentValue = 0;
  }

  // Get breakdown by department
  const breakdown = await getMetricBreakdown(organizationId, metricId);

  // Get timeline
  const timeline = getTimelineFromTrends(trends, metricId);

  // Get contributors
  const contributors = await getTopContributors(organizationId, metricId);

  // Generate insights
  const insights = generateInsights(currentValue, timeline, breakdown);

  // Get related metrics
  const relatedMetrics = getRelatedMetrics(metricId, metrics);

  // Get suggested actions
  const suggestedActions = getSuggestedActions(metricId, currentValue, breakdown);

  return {
    metricId,
    metricType: 'overview',
    title,
    summary: {
      currentValue,
      unit,
      trend: getTrendDirection(timeline),
      trendValue: calculateTrendPercentage(timeline),
      trendPeriod: 'vs last week',
      status: getMetricStatus(metricId, currentValue),
      statusMessage: getStatusMessage(metricId, currentValue),
    },
    details: {
      breakdown,
      timeline,
      contributors,
      insights,
    },
    relatedMetrics,
    suggestedActions,
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Overview', isCurrent: false },
      { level: 2, title, isCurrent: true },
    ],
  };
}

/**
 * Drill down into workload metrics
 */
async function drillDownWorkload(
  organizationId: string,
  metricId: string,
  depth: string
): Promise<DrillDownResult> {
  const workload = await workloadDistribution.getWorkloadDistribution(organizationId);
  const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);

  let title = '';
  let currentValue: number | string = 0;
  let unit = '';

  switch (metricId) {
    case 'avgWorkloadScore':
      title = 'Average Workload Score';
      currentValue = (workload.summary.avgWorkloadScore * 100).toFixed(1);
      unit = '%';
      break;
    case 'highWorkloadUsers':
      title = 'High Workload Users';
      currentValue = workload.summary.overloadedCount;
      unit = 'users';
      break;
    case 'burnoutRiskCount':
      title = 'Burnout Risk';
      currentValue = metrics.workload.burnoutRiskCount;
      unit = 'users';
      break;
    default:
      title = metricId;
  }

  // Breakdown by department
  const breakdown: BreakdownItem[] = workload.byDepartment.map(dept => ({
    id: dept.departmentId,
    name: dept.departmentName,
    value: dept.avgWorkloadScore * 100,
    percentage: (dept.headcount / workload.summary.totalCapacity) * 100,
    trend: dept.trend === 'increasing' ? 'up' : dept.trend === 'decreasing' ? 'down' : 'stable',
    drillDownAvailable: true,
  }));

  // Top contributors (overloaded individuals)
  const contributors: Contributor[] = workload.byIndividual
    .filter(i => i.status === 'overloaded' || i.status === 'burnout_risk')
    .slice(0, 10)
    .map(i => ({
      type: 'user' as const,
      id: i.userId,
      name: i.userName,
      contribution: i.workloadScore * 100,
      impact: 'negative' as const,
    }));

  // Insights from imbalances
  const insights: Insight[] = workload.imbalances.map(imb => ({
    type: 'observation' as const,
    title: imb.description,
    description: imb.impact,
    confidence: imb.severity === 'critical' ? 0.95 : imb.severity === 'high' ? 0.85 : 0.7,
    actionable: true,
  }));

  // Recommendations
  for (const rec of workload.recommendations) {
    insights.push({
      type: 'recommendation',
      title: rec.description,
      description: rec.expectedImpact,
      confidence: 0.8,
      actionable: true,
    });
  }

  return {
    metricId,
    metricType: 'workload',
    title,
    summary: {
      currentValue,
      unit,
      trend: workload.summary.avgWorkloadScore > 0.7 ? 'up' : 'stable',
      trendValue: 0,
      trendPeriod: 'current',
      status: workload.summary.avgWorkloadScore > 0.85 ? 'critical' :
        workload.summary.avgWorkloadScore > 0.7 ? 'warning' : 'good',
      statusMessage: getWorkloadStatusMessage(workload.summary.avgWorkloadScore),
    },
    details: {
      breakdown,
      timeline: [],
      contributors,
      insights,
    },
    relatedMetrics: [
      {
        metricId: 'overdueTasks',
        name: 'Overdue Tasks',
        value: metrics.workload.overdueTasks,
        correlation: 0.7,
        drillDownAvailable: true,
      },
      {
        metricId: 'completedTasks',
        name: 'Completed Tasks',
        value: metrics.workload.completedTasks,
        correlation: -0.5,
        drillDownAvailable: true,
      },
    ],
    suggestedActions: workload.recommendations.map((rec, i) => ({
      id: `rec-${i}`,
      title: rec.description,
      description: rec.expectedImpact,
      priority: rec.priority === 'urgent' ? 'urgent' : rec.priority === 'high' ? 'high' : 'medium',
      actionType: rec.type === 'redistribute' ? 'assign' : 'investigate',
    })),
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Workload', isCurrent: false },
      { level: 2, title, isCurrent: true },
    ],
  };
}

/**
 * Drill down into routing metrics
 */
async function drillDownRouting(
  organizationId: string,
  metricId: string,
  _depth: string
): Promise<DrillDownResult> {
  const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);

  let title = '';
  let currentValue: number = 0;
  let unit = '';

  switch (metricId) {
    case 'successRate':
      title = 'Routing Success Rate';
      currentValue = metrics.routing.successRate;
      unit = '%';
      break;
    case 'totalRoutedToday':
      title = 'Total Routed Today';
      currentValue = metrics.routing.totalRoutedToday;
      unit = 'requests';
      break;
    case 'avgConfidence':
      title = 'Average Confidence';
      currentValue = metrics.routing.avgConfidence;
      unit = '%';
      break;
    default:
      title = metricId;
  }

  // Breakdown by category
  const breakdown: BreakdownItem[] = metrics.routing.topCategories.map(cat => ({
    id: cat.category,
    name: cat.category,
    value: cat.count,
    percentage: (cat.count / metrics.routing.totalRoutedToday) * 100,
    trend: 'stable' as const,
    drillDownAvailable: true,
  }));

  return {
    metricId,
    metricType: 'routing',
    title,
    summary: {
      currentValue,
      unit,
      trend: 'stable',
      trendValue: 0,
      trendPeriod: 'today',
      status: metrics.routing.successRate >= 90 ? 'good' :
        metrics.routing.successRate >= 75 ? 'warning' : 'critical',
      statusMessage: `${metrics.routing.successRate.toFixed(1)}% of requests routed successfully`,
    },
    details: {
      breakdown,
      timeline: [],
      contributors: [],
      insights: [],
    },
    relatedMetrics: [],
    suggestedActions: metrics.routing.successRate < 80 ? [
      {
        id: 'review-rules',
        title: 'Review Routing Rules',
        description: 'Low success rate may indicate outdated routing rules',
        priority: 'high',
        actionType: 'investigate',
        targetUrl: '/settings/routing/rules',
      },
    ] : [],
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Routing', isCurrent: false },
      { level: 2, title, isCurrent: true },
    ],
  };
}

/**
 * Drill down into compliance metrics
 */
async function drillDownCompliance(
  organizationId: string,
  metricId: string,
  _depth: string
): Promise<DrillDownResult> {
  const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);

  return {
    metricId,
    metricType: 'compliance',
    title: 'Compliance Overview',
    summary: {
      currentValue: metrics.compliance.compliantPercentage,
      unit: '%',
      trend: 'stable',
      trendValue: 0,
      trendPeriod: 'current',
      status: metrics.compliance.violations > 0 ? 'critical' :
        metrics.compliance.compliantPercentage < 95 ? 'warning' : 'good',
      statusMessage: `${metrics.compliance.violations} active violations`,
    },
    details: {
      breakdown: [],
      timeline: [],
      contributors: [],
      insights: [],
    },
    relatedMetrics: [],
    suggestedActions: metrics.compliance.violations > 0 ? [
      {
        id: 'review-violations',
        title: 'Review Violations',
        description: 'Address active compliance violations',
        priority: 'urgent',
        actionType: 'investigate',
        targetUrl: '/compliance/violations',
      },
    ] : [],
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Compliance', isCurrent: false },
      { level: 2, title: 'Compliance Overview', isCurrent: true },
    ],
  };
}

/**
 * Drill down into health metrics
 */
async function drillDownHealth(
  organizationId: string,
  metricId: string,
  _depth: string
): Promise<DrillDownResult> {
  const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);
  const processHealth = await processHealthMetrics.getProcessHealthSummary(organizationId);

  return {
    metricId,
    metricType: 'health',
    title: 'System Health',
    summary: {
      currentValue: metrics.health.overallScore,
      unit: '%',
      trend: 'stable',
      trendValue: 0,
      trendPeriod: 'current',
      status: metrics.health.overallScore >= 80 ? 'good' :
        metrics.health.overallScore >= 60 ? 'warning' : 'critical',
      statusMessage: `Overall health score: ${metrics.health.overallScore}%`,
    },
    details: {
      breakdown: [
        {
          id: 'process',
          name: 'Process Health',
          value: metrics.health.processHealth,
          percentage: metrics.health.processHealth,
          trend: 'stable',
          drillDownAvailable: true,
        },
        {
          id: 'system',
          name: 'System Health',
          value: metrics.health.systemHealth,
          percentage: metrics.health.systemHealth,
          trend: 'stable',
          drillDownAvailable: false,
        },
        {
          id: 'data',
          name: 'Data Health',
          value: metrics.health.dataHealth,
          percentage: metrics.health.dataHealth,
          trend: 'stable',
          drillDownAvailable: false,
        },
        {
          id: 'integration',
          name: 'Integration Health',
          value: metrics.health.integrationHealth,
          percentage: metrics.health.integrationHealth,
          trend: 'stable',
          drillDownAvailable: false,
        },
      ],
      timeline: [],
      contributors: [],
      insights: metrics.health.bottlenecks.map(b => ({
        type: 'observation' as const,
        title: `${b.type} bottleneck: ${b.name}`,
        description: b.impact,
        confidence: 0.9,
        actionable: true,
      })),
    },
    relatedMetrics: [],
    suggestedActions: metrics.health.bottlenecks.slice(0, 3).map((b, i) => ({
      id: `bottleneck-${i}`,
      title: `Resolve ${b.name} bottleneck`,
      description: b.impact,
      priority: b.severity === 'critical' ? 'urgent' : b.severity === 'high' ? 'high' : 'medium',
      actionType: 'investigate' as const,
    })),
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Health', isCurrent: false },
      { level: 2, title: 'System Health', isCurrent: true },
    ],
  };
}

/**
 * Drill down into bottleneck details
 */
async function drillDownBottleneck(
  organizationId: string,
  bottleneckId: string,
  _depth: string
): Promise<DrillDownResult> {
  const report = await bottleneckDetector.detectBottlenecks(organizationId);
  const bottleneck = report.bottlenecks.find(b => b.id === bottleneckId);

  if (!bottleneck) {
    throw new Error(`Bottleneck not found: ${bottleneckId}`);
  }

  return {
    metricId: bottleneckId,
    metricType: 'bottleneck',
    title: bottleneck.name,
    summary: {
      currentValue: bottleneck.metrics.queueLength,
      unit: 'items',
      trend: bottleneck.metrics.trend === 'worsening' ? 'up' :
        bottleneck.metrics.trend === 'improving' ? 'down' : 'stable',
      trendValue: 0,
      trendPeriod: 'current',
      status: bottleneck.severity === 'critical' ? 'critical' :
        bottleneck.severity === 'high' ? 'warning' : 'good',
      statusMessage: bottleneck.description,
    },
    details: {
      breakdown: [],
      timeline: [],
      contributors: [],
      insights: bottleneck.recommendations.map((rec, i) => ({
        type: 'recommendation' as const,
        title: `Recommendation ${i + 1}`,
        description: rec,
        confidence: 0.8,
        actionable: true,
      })),
    },
    relatedMetrics: [],
    suggestedActions: bottleneck.recommendations.map((rec, i) => ({
      id: `action-${i}`,
      title: rec,
      description: `Address bottleneck in ${bottleneck.name}`,
      priority: bottleneck.severity as 'low' | 'medium' | 'high',
      actionType: 'investigate' as const,
    })),
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Bottlenecks', isCurrent: false },
      { level: 2, title: bottleneck.name, isCurrent: true },
    ],
  };
}

/**
 * Drill down into alert details
 */
async function drillDownAlert(
  organizationId: string,
  alertId: string,
  _depth: string
): Promise<DrillDownResult> {
  const alertManager = await import('./alertManager');
  const alert = await alertManager.getAlert(alertId);

  if (!alert) {
    throw new Error(`Alert not found: ${alertId}`);
  }

  return {
    metricId: alertId,
    metricType: 'alert',
    title: alert.title,
    summary: {
      currentValue: alert.severity,
      trend: 'stable',
      trendValue: 0,
      trendPeriod: '',
      status: alert.severity === 'critical' ? 'critical' :
        alert.severity === 'error' ? 'warning' : 'good',
      statusMessage: alert.description,
    },
    details: {
      breakdown: [],
      timeline: [
        { timestamp: new Date(alert.createdAt), value: 1, annotation: 'Alert created' },
        ...(alert.acknowledgedAt ? [{ timestamp: new Date(alert.acknowledgedAt), value: 2, annotation: 'Acknowledged' }] : []),
        ...(alert.resolvedAt ? [{ timestamp: new Date(alert.resolvedAt), value: 3, annotation: 'Resolved' }] : []),
      ],
      contributors: [],
      insights: [],
    },
    relatedMetrics: [],
    suggestedActions: alert.actions.map(action => ({
      id: action.type,
      title: action.label,
      description: '',
      priority: 'medium' as const,
      actionType: action.type as 'view' | 'assign' | 'escalate' | 'automate' | 'investigate',
      targetUrl: action.url,
    })),
    breadcrumbs: [
      { level: 0, title: 'Command Center', isCurrent: false },
      { level: 1, title: 'Alerts', isCurrent: false },
      { level: 2, title: alert.title, isCurrent: true },
    ],
  };
}

// Helper functions

async function getMetricBreakdown(
  organizationId: string,
  metricId: string
): Promise<BreakdownItem[]> {
  // Implementation would vary based on metric
  return [];
}

function getTimelineFromTrends(
  trends: trendAnalyzer.TrendAnalysis,
  metricId: string
): TimelinePoint[] {
  const metric = trends.metrics.find(m => m.metricId === metricId);
  if (!metric) return [];

  return metric.dataPoints.map(dp => ({
    timestamp: dp.timestamp,
    value: dp.value,
  }));
}

async function getTopContributors(
  organizationId: string,
  metricId: string
): Promise<Contributor[]> {
  return [];
}

function generateInsights(
  currentValue: number,
  timeline: TimelinePoint[],
  breakdown: BreakdownItem[]
): Insight[] {
  const insights: Insight[] = [];

  if (timeline.length >= 2) {
    const recent = timeline.slice(-5);
    const avg = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
    if (currentValue > avg * 1.2) {
      insights.push({
        type: 'observation',
        title: 'Above average',
        description: `Current value is ${((currentValue / avg - 1) * 100).toFixed(0)}% above recent average`,
        confidence: 0.8,
        actionable: false,
      });
    }
  }

  return insights;
}

function getRelatedMetrics(
  metricId: string,
  metrics: metricsAggregator.AggregatedMetrics
): RelatedMetric[] {
  return [];
}

function getSuggestedActions(
  metricId: string,
  currentValue: number,
  breakdown: BreakdownItem[]
): SuggestedAction[] {
  return [];
}

function getTrendDirection(timeline: TimelinePoint[]): 'up' | 'down' | 'stable' {
  if (timeline.length < 2) return 'stable';
  const first = timeline.slice(0, Math.floor(timeline.length / 2));
  const second = timeline.slice(Math.floor(timeline.length / 2));
  const firstAvg = first.reduce((s, p) => s + p.value, 0) / first.length;
  const secondAvg = second.reduce((s, p) => s + p.value, 0) / second.length;

  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  if (change > 5) return 'up';
  if (change < -5) return 'down';
  return 'stable';
}

function calculateTrendPercentage(timeline: TimelinePoint[]): number {
  if (timeline.length < 2) return 0;
  const first = timeline[0].value;
  const last = timeline[timeline.length - 1].value;
  return ((last - first) / first) * 100;
}

function getMetricStatus(
  metricId: string,
  value: number
): 'good' | 'warning' | 'critical' {
  return 'good';
}

function getStatusMessage(metricId: string, value: number): string {
  return `Current value: ${value}`;
}

function getWorkloadStatusMessage(score: number): string {
  if (score > 0.85) return 'Critical workload levels detected';
  if (score > 0.7) return 'Workload is elevated';
  if (score > 0.5) return 'Workload is at healthy levels';
  return 'Workload is below optimal';
}

export default {
  getDrillDown,
};
