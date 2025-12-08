/**
 * Action Audit Service
 * T253 - Implement audit trail for automated actions
 *
 * Tracks and logs all automated system actions including
 * self-healing, task assignments, notifications, and more
 */

import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';

// Types
interface ActionAudit {
  id: string;
  organizationId: string;
  actionType: ActionType;
  actionName: string;
  triggeredBy: TriggerSource;
  triggerId?: string;
  triggerName?: string;
  status: ActionStatus;
  targetType: string;
  targetId: string;
  targetName?: string;
  parameters: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  impact: ActionImpact;
  approvedBy?: string;
  approvedAt?: Date;
  rollbackAvailable: boolean;
  rolledBack: boolean;
  rollbackAt?: Date;
  rollbackBy?: string;
  metadata: Record<string, unknown>;
}

type ActionType =
  | 'self_healing'
  | 'task_assignment'
  | 'task_redistribution'
  | 'notification'
  | 'escalation'
  | 'compliance_remediation'
  | 'scheduled_job'
  | 'data_sync'
  | 'cache_invalidation'
  | 'alert_resolution'
  | 'configuration_change'
  | 'user_provision'
  | 'access_grant'
  | 'access_revoke'
  | 'other';

type TriggerSource =
  | 'system'
  | 'schedule'
  | 'rule'
  | 'ai_decision'
  | 'user_action'
  | 'api_call'
  | 'webhook'
  | 'event';

type ActionStatus =
  | 'pending'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

type ActionImpact = 'none' | 'low' | 'medium' | 'high' | 'critical';

interface ActionQueryOptions {
  organizationId: string;
  actionType?: ActionType;
  status?: ActionStatus;
  triggeredBy?: TriggerSource;
  targetType?: string;
  targetId?: string;
  impact?: ActionImpact;
  startDate?: Date;
  endDate?: Date;
  requiresApproval?: boolean;
  limit?: number;
  offset?: number;
}

interface ActionSummary {
  organizationId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalActions: number;
  actionsByType: Record<string, number>;
  actionsByStatus: Record<string, number>;
  actionsByTrigger: Record<string, number>;
  actionsByImpact: Record<string, number>;
  successRate: number;
  averageDurationMs: number;
  rollbackCount: number;
}

// In-memory action tracking
const activeActions = new Map<string, ActionAudit>();
const actionBuffer: ActionAudit[] = [];
const BUFFER_SIZE = 50;
const FLUSH_INTERVAL = 15000; // 15 seconds

let prisma: PrismaClient | null = null;
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Initialize the action audit service
 */
export function initializeActionAuditService(prismaClient: PrismaClient): void {
  prisma = prismaClient;
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL);
}

/**
 * Shutdown the action audit service
 */
export async function shutdownActionAuditService(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushBuffer();
}

/**
 * Start tracking an action
 */
export function startAction(
  organizationId: string,
  actionType: ActionType,
  actionName: string,
  triggeredBy: TriggerSource,
  targetType: string,
  targetId: string,
  options?: {
    triggerId?: string;
    triggerName?: string;
    targetName?: string;
    parameters?: Record<string, unknown>;
    impact?: ActionImpact;
    requiresApproval?: boolean;
    metadata?: Record<string, unknown>;
  }
): string {
  const id = generateActionId();

  const action: ActionAudit = {
    id,
    organizationId,
    actionType,
    actionName,
    triggeredBy,
    triggerId: options?.triggerId,
    triggerName: options?.triggerName,
    status: options?.requiresApproval ? 'pending' : 'executing',
    targetType,
    targetId,
    targetName: options?.targetName,
    parameters: options?.parameters || {},
    startedAt: new Date(),
    impact: options?.impact || 'low',
    rollbackAvailable: false,
    rolledBack: false,
    metadata: options?.metadata || {},
  };

  activeActions.set(id, action);
  return id;
}

/**
 * Complete an action successfully
 */
export async function completeAction(
  actionId: string,
  result?: Record<string, unknown>,
  options?: {
    rollbackAvailable?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const action = activeActions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  action.status = 'completed';
  action.completedAt = new Date();
  action.durationMs = action.completedAt.getTime() - action.startedAt.getTime();
  action.result = result;
  action.rollbackAvailable = options?.rollbackAvailable || false;
  if (options?.metadata) {
    action.metadata = { ...action.metadata, ...options.metadata };
  }

  activeActions.delete(actionId);
  actionBuffer.push(action);

  if (actionBuffer.length >= BUFFER_SIZE) {
    await flushBuffer();
  }
}

/**
 * Fail an action
 */
export async function failAction(
  actionId: string,
  error: string,
  options?: {
    result?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const action = activeActions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  action.status = 'failed';
  action.completedAt = new Date();
  action.durationMs = action.completedAt.getTime() - action.startedAt.getTime();
  action.error = error;
  action.result = options?.result;
  if (options?.metadata) {
    action.metadata = { ...action.metadata, ...options.metadata };
  }

  activeActions.delete(actionId);
  actionBuffer.push(action);

  if (actionBuffer.length >= BUFFER_SIZE) {
    await flushBuffer();
  }
}

/**
 * Cancel an action
 */
export async function cancelAction(
  actionId: string,
  reason: string
): Promise<void> {
  const action = activeActions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  action.status = 'cancelled';
  action.completedAt = new Date();
  action.durationMs = action.completedAt.getTime() - action.startedAt.getTime();
  action.error = reason;

  activeActions.delete(actionId);
  actionBuffer.push(action);
}

/**
 * Approve a pending action
 */
export async function approveAction(
  actionId: string,
  approvedBy: string
): Promise<void> {
  const action = activeActions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  if (action.status !== 'pending') {
    throw new Error(`Action ${actionId} is not pending approval`);
  }

  action.status = 'approved';
  action.approvedBy = approvedBy;
  action.approvedAt = new Date();
}

/**
 * Start execution of an approved action
 */
export function startExecution(actionId: string): void {
  const action = activeActions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  if (action.status !== 'approved' && action.status !== 'pending') {
    throw new Error(`Action ${actionId} cannot be executed`);
  }

  action.status = 'executing';
}

/**
 * Roll back a completed action
 */
export async function rollbackAction(
  actionId: string,
  rollbackBy: string
): Promise<void> {
  if (!prisma) {
    throw new Error('Action audit service not initialized');
  }

  // Find action in database
  const record = await prisma.actionAudit.findUnique({
    where: { id: actionId },
  });

  if (!record) {
    throw new Error(`Action ${actionId} not found`);
  }

  if (!record.rollbackAvailable) {
    throw new Error(`Action ${actionId} cannot be rolled back`);
  }

  if (record.rolledBack) {
    throw new Error(`Action ${actionId} already rolled back`);
  }

  // Update record
  await prisma.actionAudit.update({
    where: { id: actionId },
    data: {
      status: 'rolled_back',
      rolledBack: true,
      rollbackAt: new Date(),
      rollbackBy,
    },
  });
}

/**
 * Log a simple action (immediate completion)
 */
export async function logAction(
  organizationId: string,
  actionType: ActionType,
  actionName: string,
  triggeredBy: TriggerSource,
  targetType: string,
  targetId: string,
  options?: {
    triggerId?: string;
    triggerName?: string;
    targetName?: string;
    parameters?: Record<string, unknown>;
    result?: Record<string, unknown>;
    impact?: ActionImpact;
    metadata?: Record<string, unknown>;
    success?: boolean;
    error?: string;
  }
): Promise<string> {
  const id = generateActionId();
  const now = new Date();

  const action: ActionAudit = {
    id,
    organizationId,
    actionType,
    actionName,
    triggeredBy,
    triggerId: options?.triggerId,
    triggerName: options?.triggerName,
    status: options?.success === false ? 'failed' : 'completed',
    targetType,
    targetId,
    targetName: options?.targetName,
    parameters: options?.parameters || {},
    result: options?.result,
    error: options?.error,
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    impact: options?.impact || 'low',
    rollbackAvailable: false,
    rolledBack: false,
    metadata: options?.metadata || {},
  };

  actionBuffer.push(action);

  if (actionBuffer.length >= BUFFER_SIZE) {
    await flushBuffer();
  }

  return id;
}

/**
 * Query action records
 */
export async function queryActionRecords(
  options: ActionQueryOptions
): Promise<ActionAudit[]> {
  if (!prisma) {
    throw new Error('Action audit service not initialized');
  }

  const where: Record<string, unknown> = {
    organizationId: options.organizationId,
  };

  if (options.actionType) where.actionType = options.actionType;
  if (options.status) where.status = options.status;
  if (options.triggeredBy) where.triggeredBy = options.triggeredBy;
  if (options.targetType) where.targetType = options.targetType;
  if (options.targetId) where.targetId = options.targetId;
  if (options.impact) where.impact = options.impact;
  if (options.startDate || options.endDate) {
    where.startedAt = {};
    if (options.startDate) (where.startedAt as Record<string, Date>).gte = options.startDate;
    if (options.endDate) (where.startedAt as Record<string, Date>).lte = options.endDate;
  }

  const records = await prisma.actionAudit.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: options.limit || 100,
    skip: options.offset || 0,
  });

  return records.map(mapDbRecordToAction);
}

/**
 * Get action summary
 */
export async function getActionSummary(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<ActionSummary> {
  if (!prisma) {
    throw new Error('Action audit service not initialized');
  }

  const baseWhere = {
    organizationId,
    startedAt: { gte: startDate, lte: endDate },
  };

  // Total count
  const total = await prisma.actionAudit.count({ where: baseWhere });

  // Count by type
  const byType = await prisma.actionAudit.groupBy({
    by: ['actionType'],
    where: baseWhere,
    _count: { id: true },
  });

  // Count by status
  const byStatus = await prisma.actionAudit.groupBy({
    by: ['status'],
    where: baseWhere,
    _count: { id: true },
  });

  // Count by trigger
  const byTrigger = await prisma.actionAudit.groupBy({
    by: ['triggeredBy'],
    where: baseWhere,
    _count: { id: true },
  });

  // Count by impact
  const byImpact = await prisma.actionAudit.groupBy({
    by: ['impact'],
    where: baseWhere,
    _count: { id: true },
  });

  // Success rate and average duration
  const stats = await prisma.actionAudit.aggregate({
    where: baseWhere,
    _avg: { durationMs: true },
  });

  const successCount = await prisma.actionAudit.count({
    where: { ...baseWhere, status: 'completed' },
  });

  // Rollback count
  const rollbackCount = await prisma.actionAudit.count({
    where: { ...baseWhere, rolledBack: true },
  });

  return {
    organizationId,
    period: { start: startDate, end: endDate },
    totalActions: total,
    actionsByType: byType.reduce((acc, item) => {
      acc[item.actionType] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
    actionsByStatus: byStatus.reduce((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
    actionsByTrigger: byTrigger.reduce((acc, item) => {
      acc[item.triggeredBy] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
    actionsByImpact: byImpact.reduce((acc, item) => {
      acc[item.impact] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
    successRate: total > 0 ? successCount / total : 0,
    averageDurationMs: stats._avg.durationMs || 0,
    rollbackCount,
  };
}

/**
 * Get action by ID
 */
export async function getActionRecord(
  actionId: string
): Promise<ActionAudit | null> {
  // Check active actions first
  const active = activeActions.get(actionId);
  if (active) return active;

  if (!prisma) return null;

  const record = await prisma.actionAudit.findUnique({
    where: { id: actionId },
  });

  return record ? mapDbRecordToAction(record) : null;
}

/**
 * Get active actions for organization
 */
export function getActiveActions(
  organizationId: string
): ActionAudit[] {
  return Array.from(activeActions.values()).filter(
    (a) => a.organizationId === organizationId
  );
}

// ==========================================
// Helper Functions
// ==========================================

function generateActionId(): string {
  return `action_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

async function flushBuffer(): Promise<void> {
  if (actionBuffer.length === 0 || !prisma) return;

  const toFlush = actionBuffer.splice(0, actionBuffer.length);

  try {
    await prisma.actionAudit.createMany({
      data: toFlush.map((action) => ({
        id: action.id,
        organizationId: action.organizationId,
        actionType: action.actionType,
        actionName: action.actionName,
        triggeredBy: action.triggeredBy,
        triggerId: action.triggerId,
        triggerName: action.triggerName,
        status: action.status,
        targetType: action.targetType,
        targetId: action.targetId,
        targetName: action.targetName,
        parameters: action.parameters,
        result: action.result,
        error: action.error,
        startedAt: action.startedAt,
        completedAt: action.completedAt,
        durationMs: action.durationMs,
        impact: action.impact,
        approvedBy: action.approvedBy,
        approvedAt: action.approvedAt,
        rollbackAvailable: action.rollbackAvailable,
        rolledBack: action.rolledBack,
        rollbackAt: action.rollbackAt,
        rollbackBy: action.rollbackBy,
        metadata: action.metadata,
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    actionBuffer.push(...toFlush);
    console.error('Failed to flush action buffer:', error);
  }
}

function mapDbRecordToAction(record: Record<string, unknown>): ActionAudit {
  return {
    id: record.id as string,
    organizationId: record.organizationId as string,
    actionType: record.actionType as ActionType,
    actionName: record.actionName as string,
    triggeredBy: record.triggeredBy as TriggerSource,
    triggerId: record.triggerId as string | undefined,
    triggerName: record.triggerName as string | undefined,
    status: record.status as ActionStatus,
    targetType: record.targetType as string,
    targetId: record.targetId as string,
    targetName: record.targetName as string | undefined,
    parameters: record.parameters as Record<string, unknown>,
    result: record.result as Record<string, unknown> | undefined,
    error: record.error as string | undefined,
    startedAt: record.startedAt as Date,
    completedAt: record.completedAt as Date | undefined,
    durationMs: record.durationMs as number | undefined,
    impact: record.impact as ActionImpact,
    approvedBy: record.approvedBy as string | undefined,
    approvedAt: record.approvedAt as Date | undefined,
    rollbackAvailable: record.rollbackAvailable as boolean,
    rolledBack: record.rolledBack as boolean,
    rollbackAt: record.rollbackAt as Date | undefined,
    rollbackBy: record.rollbackBy as string | undefined,
    metadata: record.metadata as Record<string, unknown>,
  };
}

// Export types
export type {
  ActionAudit,
  ActionType,
  TriggerSource,
  ActionStatus,
  ActionImpact,
  ActionQueryOptions,
  ActionSummary,
};

export default {
  initializeActionAuditService,
  shutdownActionAuditService,
  startAction,
  completeAction,
  failAction,
  cancelAction,
  approveAction,
  startExecution,
  rollbackAction,
  logAction,
  queryActionRecords,
  getActionSummary,
  getActionRecord,
  getActiveActions,
};
