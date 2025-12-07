/**
 * Alert Manager Service
 * T100 - Create alert manager service
 *
 * Manages operational alerts including creation, acknowledgement, and resolution
 */

import { prisma } from '../../lib/prisma';
import Redis from 'ioredis';

// Initialize Redis for real-time alert state
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'suppressed';
export type AlertCategory =
  | 'workload'
  | 'process'
  | 'compliance'
  | 'integration'
  | 'performance'
  | 'security'
  | 'deadline'
  | 'capacity';

export interface Alert {
  id: string;
  organizationId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  source: AlertSource;
  impact: AlertImpact;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  escalationLevel: number;
  nextEscalationAt?: Date;
  relatedAlerts?: string[];
  actions: AlertAction[];
}

export interface AlertSource {
  type: 'bottleneck' | 'threshold' | 'pattern' | 'anomaly' | 'user' | 'system';
  id?: string;
  name: string;
  details?: Record<string, unknown>;
}

export interface AlertImpact {
  businessImpact: 'low' | 'medium' | 'high' | 'critical';
  affectedUsers: number;
  affectedProcesses: number;
  estimatedCost?: number;
  slaRisk: boolean;
}

export interface AlertAction {
  type: 'view_details' | 'acknowledge' | 'assign' | 'escalate' | 'resolve' | 'suppress';
  label: string;
  url?: string;
  handler?: string;
}

export interface AlertQuery {
  organizationId: string;
  status?: AlertStatus[];
  severity?: AlertSeverity[];
  category?: AlertCategory[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AlertStats {
  total: number;
  active: number;
  acknowledged: number;
  resolved: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<AlertCategory, number>;
  avgResolutionTime: number; // hours
}

const ALERT_CACHE_PREFIX = 'alert:';
const ALERT_LIST_KEY = 'alerts:active:';

/**
 * Create a new alert
 */
export async function createAlert(
  input: Omit<Alert, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'escalationLevel'>
): Promise<Alert> {
  const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const alert: Alert = {
    ...input,
    id,
    status: 'active',
    escalationLevel: 0,
    createdAt: now,
    updatedAt: now,
    nextEscalationAt: calculateNextEscalation(input.severity, 0),
  };

  // Store in database (using JSON for flexibility)
  await prisma.dashboardWidget.create({
    data: {
      id,
      organizationId: input.organizationId,
      type: 'alert',
      title: input.title,
      config: alert as unknown as Record<string, unknown>,
      position: 0,
      size: 'small',
    },
  });

  // Cache for quick access
  await redis.setex(
    `${ALERT_CACHE_PREFIX}${id}`,
    3600,
    JSON.stringify(alert)
  );

  // Add to active alerts list
  await redis.zadd(
    `${ALERT_LIST_KEY}${input.organizationId}`,
    getSeverityScore(input.severity),
    id
  );

  // Publish event for real-time updates
  await redis.publish(
    `alerts:${input.organizationId}`,
    JSON.stringify({ type: 'created', alert })
  );

  return alert;
}

/**
 * Get alert by ID
 */
export async function getAlert(alertId: string): Promise<Alert | null> {
  // Check cache first
  const cached = await redis.get(`${ALERT_CACHE_PREFIX}${alertId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Load from database
  const record = await prisma.dashboardWidget.findUnique({
    where: { id: alertId },
  });

  if (!record || record.type !== 'alert') {
    return null;
  }

  const alert = record.config as unknown as Alert;

  // Update cache
  await redis.setex(
    `${ALERT_CACHE_PREFIX}${alertId}`,
    3600,
    JSON.stringify(alert)
  );

  return alert;
}

/**
 * Query alerts with filters
 */
export async function queryAlerts(query: AlertQuery): Promise<{
  alerts: Alert[];
  total: number;
}> {
  const { organizationId, status, severity, category, startDate, endDate, limit = 50, offset = 0 } = query;

  // Get all alerts for organization
  const records = await prisma.dashboardWidget.findMany({
    where: {
      organizationId,
      type: 'alert',
      ...(startDate && { createdAt: { gte: startDate } }),
      ...(endDate && { createdAt: { lte: endDate } }),
    },
    orderBy: { createdAt: 'desc' },
  });

  // Parse and filter
  let alerts = records
    .map(r => r.config as unknown as Alert)
    .filter(a => {
      if (status && !status.includes(a.status)) return false;
      if (severity && !severity.includes(a.severity)) return false;
      if (category && !category.includes(a.category)) return false;
      return true;
    });

  const total = alerts.length;

  // Apply pagination
  alerts = alerts.slice(offset, offset + limit);

  return { alerts, total };
}

/**
 * Get active alerts for an organization
 */
export async function getActiveAlerts(organizationId: string): Promise<Alert[]> {
  // Get from Redis sorted set (sorted by severity)
  const alertIds = await redis.zrevrange(`${ALERT_LIST_KEY}${organizationId}`, 0, -1);

  if (alertIds.length === 0) {
    // Fallback to database
    const { alerts } = await queryAlerts({
      organizationId,
      status: ['active', 'acknowledged'],
    });
    return alerts;
  }

  const alerts: Alert[] = [];
  for (const id of alertIds) {
    const alert = await getAlert(id);
    if (alert && (alert.status === 'active' || alert.status === 'acknowledged')) {
      alerts.push(alert);
    }
  }

  return alerts;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string
): Promise<Alert | null> {
  const alert = await getAlert(alertId);
  if (!alert) return null;

  const now = new Date();
  const updated: Alert = {
    ...alert,
    status: 'acknowledged',
    acknowledgedAt: now,
    acknowledgedBy: userId,
    updatedAt: now,
    escalationLevel: alert.escalationLevel, // Stop escalation
    nextEscalationAt: undefined,
  };

  // Update database
  await prisma.dashboardWidget.update({
    where: { id: alertId },
    data: { config: updated as unknown as Record<string, unknown> },
  });

  // Update cache
  await redis.setex(
    `${ALERT_CACHE_PREFIX}${alertId}`,
    3600,
    JSON.stringify(updated)
  );

  // Publish event
  await redis.publish(
    `alerts:${alert.organizationId}`,
    JSON.stringify({ type: 'acknowledged', alert: updated })
  );

  return updated;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(
  alertId: string,
  userId: string,
  notes?: string
): Promise<Alert | null> {
  const alert = await getAlert(alertId);
  if (!alert) return null;

  const now = new Date();
  const updated: Alert = {
    ...alert,
    status: 'resolved',
    resolvedAt: now,
    resolvedBy: userId,
    resolutionNotes: notes,
    updatedAt: now,
    nextEscalationAt: undefined,
  };

  // Update database
  await prisma.dashboardWidget.update({
    where: { id: alertId },
    data: { config: updated as unknown as Record<string, unknown> },
  });

  // Remove from active list
  await redis.zrem(`${ALERT_LIST_KEY}${alert.organizationId}`, alertId);

  // Clear cache
  await redis.del(`${ALERT_CACHE_PREFIX}${alertId}`);

  // Publish event
  await redis.publish(
    `alerts:${alert.organizationId}`,
    JSON.stringify({ type: 'resolved', alert: updated })
  );

  return updated;
}

/**
 * Escalate an alert to the next level
 */
export async function escalateAlert(alertId: string): Promise<Alert | null> {
  const alert = await getAlert(alertId);
  if (!alert || alert.status !== 'active') return null;

  const newLevel = alert.escalationLevel + 1;
  const now = new Date();

  // Increase severity at certain escalation levels
  let newSeverity = alert.severity;
  if (newLevel >= 3 && alert.severity === 'warning') {
    newSeverity = 'error';
  } else if (newLevel >= 5 && alert.severity !== 'critical') {
    newSeverity = 'critical';
  }

  const updated: Alert = {
    ...alert,
    escalationLevel: newLevel,
    severity: newSeverity,
    updatedAt: now,
    nextEscalationAt: calculateNextEscalation(newSeverity, newLevel),
  };

  // Update database
  await prisma.dashboardWidget.update({
    where: { id: alertId },
    data: { config: updated as unknown as Record<string, unknown> },
  });

  // Update cache
  await redis.setex(
    `${ALERT_CACHE_PREFIX}${alertId}`,
    3600,
    JSON.stringify(updated)
  );

  // Update severity score in list
  await redis.zadd(
    `${ALERT_LIST_KEY}${alert.organizationId}`,
    getSeverityScore(newSeverity),
    alertId
  );

  // Publish event
  await redis.publish(
    `alerts:${alert.organizationId}`,
    JSON.stringify({ type: 'escalated', alert: updated })
  );

  return updated;
}

/**
 * Suppress an alert (hide temporarily)
 */
export async function suppressAlert(
  alertId: string,
  userId: string,
  duration: number = 3600000 // 1 hour default
): Promise<Alert | null> {
  const alert = await getAlert(alertId);
  if (!alert) return null;

  const now = new Date();
  const updated: Alert = {
    ...alert,
    status: 'suppressed',
    updatedAt: now,
    metadata: {
      ...alert.metadata,
      suppressedBy: userId,
      suppressedUntil: new Date(now.getTime() + duration),
    },
  };

  // Update database
  await prisma.dashboardWidget.update({
    where: { id: alertId },
    data: { config: updated as unknown as Record<string, unknown> },
  });

  // Remove from active list temporarily
  await redis.zrem(`${ALERT_LIST_KEY}${alert.organizationId}`, alertId);

  // Schedule unsuppression
  setTimeout(async () => {
    await unsuppressAlert(alertId);
  }, duration);

  return updated;
}

/**
 * Unsuppress an alert
 */
async function unsuppressAlert(alertId: string): Promise<void> {
  const alert = await getAlert(alertId);
  if (!alert || alert.status !== 'suppressed') return;

  const updated: Alert = {
    ...alert,
    status: 'active',
    updatedAt: new Date(),
  };

  await prisma.dashboardWidget.update({
    where: { id: alertId },
    data: { config: updated as unknown as Record<string, unknown> },
  });

  await redis.setex(
    `${ALERT_CACHE_PREFIX}${alertId}`,
    3600,
    JSON.stringify(updated)
  );

  await redis.zadd(
    `${ALERT_LIST_KEY}${alert.organizationId}`,
    getSeverityScore(alert.severity),
    alertId
  );
}

/**
 * Get alert statistics for an organization
 */
export async function getAlertStats(
  organizationId: string,
  timeRange: 'day' | 'week' | 'month' = 'week'
): Promise<AlertStats> {
  const startDate = new Date();
  switch (timeRange) {
    case 'day':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const { alerts } = await queryAlerts({
    organizationId,
    startDate,
    limit: 1000,
  });

  const stats: AlertStats = {
    total: alerts.length,
    active: 0,
    acknowledged: 0,
    resolved: 0,
    bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
    byCategory: {
      workload: 0,
      process: 0,
      compliance: 0,
      integration: 0,
      performance: 0,
      security: 0,
      deadline: 0,
      capacity: 0,
    },
    avgResolutionTime: 0,
  };

  let totalResolutionTime = 0;
  let resolvedCount = 0;

  for (const alert of alerts) {
    // Status counts
    switch (alert.status) {
      case 'active':
        stats.active++;
        break;
      case 'acknowledged':
        stats.acknowledged++;
        break;
      case 'resolved':
        stats.resolved++;
        if (alert.resolvedAt && alert.createdAt) {
          totalResolutionTime +=
            new Date(alert.resolvedAt).getTime() - new Date(alert.createdAt).getTime();
          resolvedCount++;
        }
        break;
    }

    // Severity counts
    stats.bySeverity[alert.severity]++;

    // Category counts
    stats.byCategory[alert.category]++;
  }

  // Calculate average resolution time in hours
  stats.avgResolutionTime = resolvedCount > 0
    ? (totalResolutionTime / resolvedCount) / (1000 * 60 * 60)
    : 0;

  return stats;
}

/**
 * Group related alerts
 */
export async function groupRelatedAlerts(organizationId: string): Promise<Alert[][]> {
  const activeAlerts = await getActiveAlerts(organizationId);
  const groups: Alert[][] = [];
  const assigned = new Set<string>();

  for (const alert of activeAlerts) {
    if (assigned.has(alert.id)) continue;

    const related = activeAlerts.filter(a =>
      !assigned.has(a.id) &&
      (a.source.id === alert.source.id ||
       a.category === alert.category ||
       (alert.relatedAlerts && alert.relatedAlerts.includes(a.id)))
    );

    if (related.length > 1) {
      groups.push(related);
      related.forEach(a => assigned.add(a.id));
    } else {
      groups.push([alert]);
      assigned.add(alert.id);
    }
  }

  return groups;
}

// Helper functions

function getSeverityScore(severity: AlertSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'error':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

function calculateNextEscalation(severity: AlertSeverity, level: number): Date | undefined {
  // Critical alerts escalate faster
  const baseMinutes = severity === 'critical' ? 15 :
    severity === 'error' ? 30 :
    severity === 'warning' ? 60 :
    120;

  // Escalation interval increases with level
  const multiplier = Math.pow(1.5, level);
  const minutes = baseMinutes * multiplier;

  return new Date(Date.now() + minutes * 60 * 1000);
}

export default {
  createAlert,
  getAlert,
  queryAlerts,
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert,
  escalateAlert,
  suppressAlert,
  getAlertStats,
  groupRelatedAlerts,
};
