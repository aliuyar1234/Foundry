/**
 * Threshold Monitor Service
 * T102 - Create threshold monitor
 *
 * Monitors metrics against configurable thresholds and triggers alerts
 */

import { prisma } from '../../lib/prisma';
import * as alertManager from './alertManager';
import * as metricsAggregator from './metricsAggregator';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface ThresholdRule {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  enabled: boolean;
  metric: MetricDefinition;
  conditions: ThresholdCondition[];
  alertConfig: AlertConfig;
  cooldown: number; // seconds before re-alerting
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricDefinition {
  type: 'workload' | 'routing' | 'compliance' | 'process' | 'custom';
  name: string;
  aggregation: 'current' | 'avg' | 'max' | 'min' | 'sum' | 'count';
  timeWindow?: number; // seconds, for aggregated metrics
  filters?: Record<string, unknown>;
}

export interface ThresholdCondition {
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'between';
  value: number;
  value2?: number; // For 'between' operator
  severity: alertManager.AlertSeverity;
  duration?: number; // seconds the condition must persist
}

export interface AlertConfig {
  category: alertManager.AlertCategory;
  titleTemplate: string;
  descriptionTemplate: string;
  autoEscalate: boolean;
  notifyChannels: ('email' | 'slack' | 'webhook' | 'in_app')[];
}

export interface ThresholdEvaluation {
  ruleId: string;
  ruleName: string;
  currentValue: number;
  triggeredCondition?: ThresholdCondition;
  triggered: boolean;
  timestamp: Date;
}

const RULE_CACHE_KEY = 'threshold:rules:';
const METRIC_STATE_KEY = 'threshold:state:';

/**
 * Create a threshold rule
 */
export async function createThresholdRule(
  input: Omit<ThresholdRule, 'id' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt'>
): Promise<ThresholdRule> {
  const id = `threshold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const rule: ThresholdRule = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
  };

  // Store in database
  await prisma.dashboardWidget.create({
    data: {
      id,
      organizationId: input.organizationId,
      type: 'threshold_rule',
      title: input.name,
      config: rule as unknown as Record<string, unknown>,
      position: 0,
      size: 'small',
    },
  });

  // Cache the rule
  await cacheRule(rule);

  return rule;
}

/**
 * Get threshold rules for an organization
 */
export async function getThresholdRules(
  organizationId: string,
  enabledOnly: boolean = true
): Promise<ThresholdRule[]> {
  // Try cache first
  const cacheKey = `${RULE_CACHE_KEY}${organizationId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const rules = JSON.parse(cached) as ThresholdRule[];
    return enabledOnly ? rules.filter(r => r.enabled) : rules;
  }

  // Load from database
  const records = await prisma.dashboardWidget.findMany({
    where: {
      organizationId,
      type: 'threshold_rule',
    },
  });

  const rules = records.map(r => r.config as unknown as ThresholdRule);

  // Cache rules
  await redis.setex(cacheKey, 300, JSON.stringify(rules));

  return enabledOnly ? rules.filter(r => r.enabled) : rules;
}

/**
 * Update a threshold rule
 */
export async function updateThresholdRule(
  ruleId: string,
  updates: Partial<ThresholdRule>
): Promise<ThresholdRule | null> {
  const record = await prisma.dashboardWidget.findUnique({
    where: { id: ruleId },
  });

  if (!record || record.type !== 'threshold_rule') {
    return null;
  }

  const existing = record.config as unknown as ThresholdRule;
  const updated: ThresholdRule = {
    ...existing,
    ...updates,
    id: ruleId,
    updatedAt: new Date(),
  };

  await prisma.dashboardWidget.update({
    where: { id: ruleId },
    data: { config: updated as unknown as Record<string, unknown> },
  });

  // Invalidate cache
  await redis.del(`${RULE_CACHE_KEY}${existing.organizationId}`);

  return updated;
}

/**
 * Delete a threshold rule
 */
export async function deleteThresholdRule(ruleId: string): Promise<boolean> {
  const record = await prisma.dashboardWidget.findUnique({
    where: { id: ruleId },
  });

  if (!record || record.type !== 'threshold_rule') {
    return false;
  }

  await prisma.dashboardWidget.delete({
    where: { id: ruleId },
  });

  // Invalidate cache
  const rule = record.config as unknown as ThresholdRule;
  await redis.del(`${RULE_CACHE_KEY}${rule.organizationId}`);

  return true;
}

/**
 * Evaluate all threshold rules for an organization
 */
export async function evaluateThresholds(
  organizationId: string
): Promise<ThresholdEvaluation[]> {
  const rules = await getThresholdRules(organizationId, true);
  const evaluations: ThresholdEvaluation[] = [];

  for (const rule of rules) {
    const evaluation = await evaluateRule(rule);
    evaluations.push(evaluation);

    if (evaluation.triggered && evaluation.triggeredCondition) {
      await handleTriggeredThreshold(rule, evaluation);
    }
  }

  return evaluations;
}

/**
 * Evaluate a single threshold rule
 */
async function evaluateRule(rule: ThresholdRule): Promise<ThresholdEvaluation> {
  const currentValue = await getMetricValue(rule.metric, rule.organizationId);
  const timestamp = new Date();

  // Check each condition
  for (const condition of rule.conditions) {
    const isTriggered = evaluateCondition(currentValue, condition);

    if (isTriggered) {
      // Check if duration requirement is met
      if (condition.duration && condition.duration > 0) {
        const durationMet = await checkDurationRequirement(rule.id, condition.duration);
        if (!durationMet) {
          // Update state but don't trigger yet
          await updateMetricState(rule.id, currentValue, timestamp);
          continue;
        }
      }

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        currentValue,
        triggeredCondition: condition,
        triggered: true,
        timestamp,
      };
    }
  }

  // Clear state if no conditions triggered
  await clearMetricState(rule.id);

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    currentValue,
    triggered: false,
    timestamp,
  };
}

/**
 * Get current value for a metric
 */
async function getMetricValue(
  metric: MetricDefinition,
  organizationId: string
): Promise<number> {
  try {
    const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);

    switch (metric.type) {
      case 'workload':
        return getWorkloadMetricValue(metrics, metric.name);
      case 'routing':
        return getRoutingMetricValue(metrics, metric.name);
      case 'compliance':
        return getComplianceMetricValue(metrics, metric.name);
      case 'process':
        return getProcessMetricValue(metrics, metric.name);
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

function getWorkloadMetricValue(
  metrics: metricsAggregator.AggregatedMetrics,
  name: string
): number {
  switch (name) {
    case 'avgWorkloadScore':
      return metrics.workload.avgWorkloadScore;
    case 'highWorkloadUsers':
      return metrics.workload.highWorkloadUsers;
    case 'burnoutRiskCount':
      return metrics.workload.burnoutRiskCount;
    case 'overdueTasks':
      return metrics.workload.overdueTasks;
    default:
      return 0;
  }
}

function getRoutingMetricValue(
  metrics: metricsAggregator.AggregatedMetrics,
  name: string
): number {
  switch (name) {
    case 'successRate':
      return metrics.routing.successRate;
    case 'avgConfidence':
      return metrics.routing.avgConfidence;
    case 'manualOverrides':
      return metrics.routing.manualOverrides;
    case 'totalRoutedToday':
      return metrics.routing.totalRoutedToday;
    default:
      return 0;
  }
}

function getComplianceMetricValue(
  metrics: metricsAggregator.AggregatedMetrics,
  name: string
): number {
  switch (name) {
    case 'compliantPercentage':
      return metrics.compliance.compliantPercentage;
    case 'violations':
      return metrics.compliance.violations;
    case 'riskScore':
      return metrics.compliance.riskScore;
    case 'pendingReview':
      return metrics.compliance.pendingReview;
    default:
      return 0;
  }
}

function getProcessMetricValue(
  metrics: metricsAggregator.AggregatedMetrics,
  name: string
): number {
  switch (name) {
    case 'activeProcesses':
      return metrics.overview.activeProcesses;
    case 'pendingApprovals':
      return metrics.overview.pendingApprovals;
    case 'openIssues':
      return metrics.overview.openIssues;
    case 'avgResponseTime':
      return metrics.overview.avgResponseTime;
    default:
      return 0;
  }
}

/**
 * Evaluate a condition against a value
 */
function evaluateCondition(value: number, condition: ThresholdCondition): boolean {
  switch (condition.operator) {
    case 'gt':
      return value > condition.value;
    case 'gte':
      return value >= condition.value;
    case 'lt':
      return value < condition.value;
    case 'lte':
      return value <= condition.value;
    case 'eq':
      return value === condition.value;
    case 'ne':
      return value !== condition.value;
    case 'between':
      return value >= condition.value && value <= (condition.value2 || condition.value);
    default:
      return false;
  }
}

/**
 * Check if duration requirement is met
 */
async function checkDurationRequirement(
  ruleId: string,
  requiredDuration: number
): Promise<boolean> {
  const stateKey = `${METRIC_STATE_KEY}${ruleId}`;
  const state = await redis.get(stateKey);

  if (!state) return false;

  const { firstTriggeredAt } = JSON.parse(state);
  const elapsed = (Date.now() - new Date(firstTriggeredAt).getTime()) / 1000;

  return elapsed >= requiredDuration;
}

/**
 * Update metric state for duration tracking
 */
async function updateMetricState(
  ruleId: string,
  value: number,
  timestamp: Date
): Promise<void> {
  const stateKey = `${METRIC_STATE_KEY}${ruleId}`;
  const existing = await redis.get(stateKey);

  const state = existing
    ? JSON.parse(existing)
    : { firstTriggeredAt: timestamp };

  state.lastValue = value;
  state.lastCheckedAt = timestamp;

  await redis.setex(stateKey, 3600, JSON.stringify(state));
}

/**
 * Clear metric state
 */
async function clearMetricState(ruleId: string): Promise<void> {
  const stateKey = `${METRIC_STATE_KEY}${ruleId}`;
  await redis.del(stateKey);
}

/**
 * Handle a triggered threshold
 */
async function handleTriggeredThreshold(
  rule: ThresholdRule,
  evaluation: ThresholdEvaluation
): Promise<void> {
  // Check cooldown
  if (rule.lastTriggeredAt) {
    const elapsed = (Date.now() - new Date(rule.lastTriggeredAt).getTime()) / 1000;
    if (elapsed < rule.cooldown) {
      return; // Still in cooldown
    }
  }

  const condition = evaluation.triggeredCondition!;

  // Create alert
  const title = interpolateTemplate(rule.alertConfig.titleTemplate, {
    ruleName: rule.name,
    value: evaluation.currentValue,
    threshold: condition.value,
  });

  const description = interpolateTemplate(rule.alertConfig.descriptionTemplate, {
    ruleName: rule.name,
    value: evaluation.currentValue,
    threshold: condition.value,
    operator: getOperatorLabel(condition.operator),
  });

  await alertManager.createAlert({
    organizationId: rule.organizationId,
    category: rule.alertConfig.category,
    severity: condition.severity,
    title,
    description,
    source: {
      type: 'threshold',
      id: rule.id,
      name: rule.name,
      details: {
        metric: rule.metric,
        condition,
        value: evaluation.currentValue,
      },
    },
    impact: {
      businessImpact: getBusinessImpactFromSeverity(condition.severity),
      affectedUsers: 0,
      affectedProcesses: 0,
      slaRisk: condition.severity === 'critical',
    },
    metadata: {
      ruleId: rule.id,
      ruleName: rule.name,
      currentValue: evaluation.currentValue,
      threshold: condition.value,
    },
    actions: [
      { type: 'view_details', label: 'View Details' },
      { type: 'acknowledge', label: 'Acknowledge' },
      { type: 'resolve', label: 'Resolve' },
    ],
  });

  // Update last triggered time
  await updateThresholdRule(rule.id, { lastTriggeredAt: new Date() });
}

/**
 * Interpolate template variables
 */
function interpolateTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key]?.toString() || `{{${key}}}`
  );
}

/**
 * Get human-readable operator label
 */
function getOperatorLabel(operator: ThresholdCondition['operator']): string {
  switch (operator) {
    case 'gt':
      return 'greater than';
    case 'gte':
      return 'greater than or equal to';
    case 'lt':
      return 'less than';
    case 'lte':
      return 'less than or equal to';
    case 'eq':
      return 'equal to';
    case 'ne':
      return 'not equal to';
    case 'between':
      return 'between';
    default:
      return operator;
  }
}

/**
 * Map severity to business impact
 */
function getBusinessImpactFromSeverity(
  severity: alertManager.AlertSeverity
): 'low' | 'medium' | 'high' | 'critical' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Cache a threshold rule
 */
async function cacheRule(rule: ThresholdRule): Promise<void> {
  const cacheKey = `${RULE_CACHE_KEY}${rule.organizationId}`;

  // Get existing rules
  const existing = await redis.get(cacheKey);
  const rules = existing ? JSON.parse(existing) as ThresholdRule[] : [];

  // Add or update rule
  const index = rules.findIndex(r => r.id === rule.id);
  if (index >= 0) {
    rules[index] = rule;
  } else {
    rules.push(rule);
  }

  await redis.setex(cacheKey, 300, JSON.stringify(rules));
}

/**
 * Get predefined threshold templates
 */
export function getThresholdTemplates(): Partial<ThresholdRule>[] {
  return [
    {
      name: 'High Workload Alert',
      description: 'Alert when average workload exceeds safe levels',
      metric: {
        type: 'workload',
        name: 'avgWorkloadScore',
        aggregation: 'current',
      },
      conditions: [
        { operator: 'gte', value: 0.85, severity: 'warning' },
        { operator: 'gte', value: 0.95, severity: 'critical' },
      ],
      alertConfig: {
        category: 'workload',
        titleTemplate: 'High Workload Detected',
        descriptionTemplate: 'Average workload score ({{value}}) exceeds {{threshold}}',
        autoEscalate: true,
        notifyChannels: ['in_app', 'email'],
      },
      cooldown: 3600,
    },
    {
      name: 'Low Routing Success Rate',
      description: 'Alert when routing accuracy drops below threshold',
      metric: {
        type: 'routing',
        name: 'successRate',
        aggregation: 'current',
      },
      conditions: [
        { operator: 'lte', value: 80, severity: 'warning' },
        { operator: 'lte', value: 60, severity: 'error' },
      ],
      alertConfig: {
        category: 'process',
        titleTemplate: 'Routing Success Rate Dropped',
        descriptionTemplate: 'Routing success rate ({{value}}%) is below {{threshold}}%',
        autoEscalate: false,
        notifyChannels: ['in_app'],
      },
      cooldown: 1800,
    },
    {
      name: 'Compliance Violations',
      description: 'Alert on compliance violations',
      metric: {
        type: 'compliance',
        name: 'violations',
        aggregation: 'current',
      },
      conditions: [
        { operator: 'gte', value: 1, severity: 'warning' },
        { operator: 'gte', value: 5, severity: 'error' },
        { operator: 'gte', value: 10, severity: 'critical' },
      ],
      alertConfig: {
        category: 'compliance',
        titleTemplate: 'Compliance Violations Detected',
        descriptionTemplate: '{{value}} compliance violations require attention',
        autoEscalate: true,
        notifyChannels: ['in_app', 'email', 'slack'],
      },
      cooldown: 300,
    },
    {
      name: 'Burnout Risk',
      description: 'Alert when employees show burnout risk',
      metric: {
        type: 'workload',
        name: 'burnoutRiskCount',
        aggregation: 'current',
      },
      conditions: [
        { operator: 'gte', value: 1, severity: 'warning' },
        { operator: 'gte', value: 3, severity: 'error' },
        { operator: 'gte', value: 5, severity: 'critical' },
      ],
      alertConfig: {
        category: 'workload',
        titleTemplate: 'Employee Burnout Risk',
        descriptionTemplate: '{{value}} employees showing burnout risk indicators',
        autoEscalate: true,
        notifyChannels: ['in_app', 'email'],
      },
      cooldown: 7200,
    },
  ];
}

export default {
  createThresholdRule,
  getThresholdRules,
  updateThresholdRule,
  deleteThresholdRule,
  evaluateThresholds,
  getThresholdTemplates,
};
