/**
 * Audit Trail Logger
 * T144 - Implement audit trail logger
 *
 * Comprehensive logging for all self-healing operations
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import type {
  AutomatedAction,
  ActionExecution,
  DetectedPattern,
  ExecutionStatus,
} from 'shared/types/selfHealing.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export type AuditEventType =
  | 'pattern_detected'
  | 'action_triggered'
  | 'action_executed'
  | 'action_completed'
  | 'action_failed'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'rollback_requested'
  | 'rollback_completed'
  | 'safety_check_passed'
  | 'safety_check_failed'
  | 'configuration_changed'
  | 'action_created'
  | 'action_updated'
  | 'action_deleted'
  | 'learning_pattern_added'
  | 'system_event';

export interface AuditEntry {
  id: string;
  eventType: AuditEventType;
  timestamp: Date;
  organizationId: string;
  userId?: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown>;
  metadata: AuditMetadata;
  severity: 'info' | 'warning' | 'error';
}

export interface AuditMetadata {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  correlationId?: string;
  source?: string;
}

export interface AuditQuery {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  entityType?: string;
  entityId?: string;
  userId?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Audit Trail Logger
// =============================================================================

/**
 * Log an audit event
 */
export async function logAuditEvent(
  eventType: AuditEventType,
  entityType: string,
  entityId: string,
  action: string,
  details: Record<string, unknown>,
  organizationId: string,
  options: {
    userId?: string;
    metadata?: AuditMetadata;
    severity?: 'info' | 'warning' | 'error';
  } = {}
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    timestamp: new Date(),
    organizationId,
    userId: options.userId,
    entityType,
    entityId,
    action,
    details,
    metadata: options.metadata || {},
    severity: options.severity || 'info',
  };

  // Store in database
  await prisma.auditLog.create({
    data: {
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      performedBy: entry.userId || 'system',
      details: entry.details,
      organizationId: entry.organizationId,
      eventType: entry.eventType,
      severity: entry.severity,
      metadata: entry.metadata as Record<string, unknown>,
      createdAt: entry.timestamp,
    },
  });

  // Also log to system logger for operational visibility
  logger.info(
    {
      eventType,
      entityType,
      entityId,
      action,
      organizationId,
      userId: options.userId,
    },
    `Audit: ${action}`
  );

  return entry;
}

// =============================================================================
// Specialized Logging Functions
// =============================================================================

/**
 * Log pattern detection event
 */
export async function logPatternDetected(
  pattern: DetectedPattern,
  organizationId: string,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    'pattern_detected',
    'pattern',
    pattern.id,
    `Pattern detected: ${pattern.type}`,
    {
      patternType: pattern.type,
      description: pattern.description,
      severity: pattern.severity,
      occurrences: pattern.occurrences,
      affectedEntities: pattern.affectedEntities.map((e) => ({
        type: e.type,
        id: e.id,
        name: e.name,
      })),
      suggestedActions: pattern.suggestedActions,
    },
    organizationId,
    { metadata, severity: mapPatternSeverity(pattern.severity) }
  );
}

/**
 * Log action triggered event
 */
export async function logActionTriggered(
  action: AutomatedAction,
  triggeredBy: string,
  pattern?: DetectedPattern,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    'action_triggered',
    'automated_action',
    action.id,
    `Action triggered: ${action.name}`,
    {
      actionType: action.actionType,
      triggerType: action.triggerType,
      patternId: pattern?.id,
      patternType: pattern?.type,
      requiresApproval: action.requiresApproval,
    },
    action.organizationId,
    { userId: triggeredBy, metadata }
  );
}

/**
 * Log action execution event
 */
export async function logActionExecuted(
  execution: ActionExecution,
  action: AutomatedAction,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    'action_executed',
    'action_execution',
    execution.id,
    `Action execution started: ${action.name}`,
    {
      actionId: action.id,
      actionType: action.actionType,
      triggerReason: execution.triggerReason,
    },
    execution.organizationId,
    { metadata }
  );
}

/**
 * Log action completion event
 */
export async function logActionCompleted(
  execution: ActionExecution,
  action: AutomatedAction,
  result: Record<string, unknown>,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    'action_completed',
    'action_execution',
    execution.id,
    `Action completed: ${action.name}`,
    {
      actionId: action.id,
      actionType: action.actionType,
      success: true,
      affectedEntities: result.affectedEntities,
      changes: result.changes,
      metrics: result.metrics,
    },
    execution.organizationId,
    { metadata }
  );
}

/**
 * Log action failure event
 */
export async function logActionFailed(
  execution: ActionExecution,
  action: AutomatedAction,
  error: string,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    'action_failed',
    'action_execution',
    execution.id,
    `Action failed: ${action.name}`,
    {
      actionId: action.id,
      actionType: action.actionType,
      error,
    },
    execution.organizationId,
    { metadata, severity: 'error' }
  );
}

/**
 * Log approval events
 */
export async function logApprovalEvent(
  eventType: 'approval_requested' | 'approval_granted' | 'approval_rejected',
  executionId: string,
  actionName: string,
  organizationId: string,
  userId?: string,
  reason?: string,
  metadata?: AuditMetadata
): Promise<void> {
  const action =
    eventType === 'approval_requested'
      ? 'Approval requested'
      : eventType === 'approval_granted'
        ? 'Approval granted'
        : 'Approval rejected';

  await logAuditEvent(
    eventType,
    'action_execution',
    executionId,
    `${action}: ${actionName}`,
    {
      reason,
      decidedBy: userId,
    },
    organizationId,
    { userId, metadata }
  );
}

/**
 * Log rollback events
 */
export async function logRollbackEvent(
  eventType: 'rollback_requested' | 'rollback_completed',
  executionId: string,
  organizationId: string,
  userId: string,
  reason?: string,
  result?: { success: boolean; error?: string },
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    eventType,
    'action_execution',
    executionId,
    eventType === 'rollback_requested' ? 'Rollback requested' : 'Rollback completed',
    {
      reason,
      success: result?.success,
      error: result?.error,
    },
    organizationId,
    { userId, metadata, severity: result?.success === false ? 'error' : 'info' }
  );
}

/**
 * Log safety check events
 */
export async function logSafetyCheckEvent(
  passed: boolean,
  actionId: string,
  organizationId: string,
  checks: Array<{ name: string; passed: boolean; message: string }>,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    passed ? 'safety_check_passed' : 'safety_check_failed',
    'automated_action',
    actionId,
    passed ? 'Safety checks passed' : 'Safety checks failed',
    {
      checks: checks.map((c) => ({
        name: c.name,
        passed: c.passed,
        message: c.message,
      })),
      failedChecks: checks.filter((c) => !c.passed).map((c) => c.name),
    },
    organizationId,
    { metadata, severity: passed ? 'info' : 'warning' }
  );
}

/**
 * Log configuration changes
 */
export async function logConfigurationChange(
  entityType: 'automated_action' | 'policy' | 'rule',
  entityId: string,
  changeType: 'create' | 'update' | 'delete',
  organizationId: string,
  userId: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
  metadata?: AuditMetadata
): Promise<void> {
  await logAuditEvent(
    'configuration_changed',
    entityType,
    entityId,
    `Configuration ${changeType}d`,
    {
      changeType,
      before,
      after,
      changedFields: before && after ? getChangedFields(before, after) : [],
    },
    organizationId,
    { userId, metadata }
  );
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Query audit trail entries
 */
export async function queryAuditTrail(query: AuditQuery): Promise<{
  entries: AuditEntry[];
  total: number;
}> {
  const where: Record<string, unknown> = {
    organizationId: query.organizationId,
  };

  if (query.startDate) {
    where.createdAt = { ...(where.createdAt as object), gte: query.startDate };
  }
  if (query.endDate) {
    where.createdAt = { ...(where.createdAt as object), lte: query.endDate };
  }
  if (query.eventTypes?.length) {
    where.eventType = { in: query.eventTypes };
  }
  if (query.entityType) {
    where.entityType = query.entityType;
  }
  if (query.entityId) {
    where.entityId = query.entityId;
  }
  if (query.userId) {
    where.performedBy = query.userId;
  }
  if (query.severity) {
    where.severity = query.severity;
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit || 100,
      skip: query.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries: entries.map(mapToAuditEntry),
    total,
  };
}

/**
 * Get audit trail for a specific entity
 */
export async function getEntityAuditTrail(
  entityType: string,
  entityId: string,
  organizationId: string,
  limit: number = 50
): Promise<AuditEntry[]> {
  const entries = await prisma.auditLog.findMany({
    where: {
      entityType,
      entityId,
      organizationId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return entries.map(mapToAuditEntry);
}

/**
 * Get recent activity for a user
 */
export async function getUserActivity(
  userId: string,
  organizationId: string,
  days: number = 7
): Promise<AuditEntry[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const entries = await prisma.auditLog.findMany({
    where: {
      performedBy: userId,
      organizationId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return entries.map(mapToAuditEntry);
}

// =============================================================================
// Statistics and Analytics
// =============================================================================

/**
 * Get audit statistics
 */
export async function getAuditStatistics(
  organizationId: string,
  days: number = 30
): Promise<{
  totalEvents: number;
  byEventType: Record<string, number>;
  bySeverity: Record<string, number>;
  byEntityType: Record<string, number>;
  dailyCounts: Array<{ date: string; count: number }>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const entries = await prisma.auditLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
    },
    select: {
      eventType: true,
      severity: true,
      entityType: true,
      createdAt: true,
    },
  });

  const byEventType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byEntityType: Record<string, number> = {};
  const dailyMap = new Map<string, number>();

  for (const entry of entries) {
    // By event type
    const eventType = entry.eventType || 'unknown';
    byEventType[eventType] = (byEventType[eventType] || 0) + 1;

    // By severity
    const severity = entry.severity || 'info';
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;

    // By entity type
    byEntityType[entry.entityType] = (byEntityType[entry.entityType] || 0) + 1;

    // Daily counts
    const date = entry.createdAt.toISOString().split('T')[0];
    dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
  }

  const dailyCounts = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalEvents: entries.length,
    byEventType,
    bySeverity,
    byEntityType,
    dailyCounts,
  };
}

/**
 * Export audit trail to CSV
 */
export async function exportAuditTrail(
  query: AuditQuery
): Promise<string> {
  const { entries } = await queryAuditTrail({ ...query, limit: 10000 });

  const headers = [
    'Timestamp',
    'Event Type',
    'Entity Type',
    'Entity ID',
    'Action',
    'User',
    'Severity',
    'Details',
  ];

  const rows = entries.map((entry) => [
    entry.timestamp.toISOString(),
    entry.eventType,
    entry.entityType,
    entry.entityId,
    entry.action,
    entry.userId || 'system',
    entry.severity,
    JSON.stringify(entry.details),
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  return csv;
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapToAuditEntry(record: {
  id: string;
  eventType: string | null;
  createdAt: Date;
  organizationId: string | null;
  performedBy: string;
  entityType: string;
  entityId: string;
  action: string;
  details: unknown;
  severity: string | null;
  metadata: unknown;
}): AuditEntry {
  return {
    id: record.id,
    eventType: (record.eventType as AuditEventType) || 'system_event',
    timestamp: record.createdAt,
    organizationId: record.organizationId || '',
    userId: record.performedBy !== 'system' ? record.performedBy : undefined,
    entityType: record.entityType,
    entityId: record.entityId,
    action: record.action,
    details: (record.details as Record<string, unknown>) || {},
    metadata: (record.metadata as AuditMetadata) || {},
    severity: (record.severity as 'info' | 'warning' | 'error') || 'info',
  };
}

function mapPatternSeverity(
  severity: 'low' | 'medium' | 'high' | 'critical'
): 'info' | 'warning' | 'error' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}

function getChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const changed: string[] = [];

  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }

  return changed;
}

export default {
  logAuditEvent,
  logPatternDetected,
  logActionTriggered,
  logActionExecuted,
  logActionCompleted,
  logActionFailed,
  logApprovalEvent,
  logRollbackEvent,
  logSafetyCheckEvent,
  logConfigurationChange,
  queryAuditTrail,
  getEntityAuditTrail,
  getUserActivity,
  getAuditStatistics,
  exportAuditTrail,
};
