/**
 * Rollback Service
 * T141 - Create rollback service
 *
 * Manages rollback operations for self-healing actions
 */

import { logger } from '../../lib/logger.js';
import { canRollback, rollbackExecution, getExecutionHistory } from './actionExecutor.js';
import type { ActionExecution, ExecutionStatus } from 'shared/types/selfHealing.js';
import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface RollbackRequest {
  executionId: string;
  requestedBy: string;
  reason: string;
}

export interface RollbackResult {
  success: boolean;
  executionId: string;
  message: string;
  rollbackExecutionId?: string;
}

export interface RollbackEligibility {
  eligible: boolean;
  reason: string;
  timeSinceExecution?: number;
  actionType?: string;
}

export interface RollbackPolicy {
  /** Maximum time after execution to allow rollback (hours) */
  maxRollbackWindowHours: number;
  /** Action types that cannot be rolled back */
  nonRollbackableTypes: string[];
  /** Require approval for rollback */
  requireApproval: boolean;
  /** Roles that can approve rollbacks */
  approvalRoles: string[];
}

const DEFAULT_POLICY: RollbackPolicy = {
  maxRollbackWindowHours: 24,
  nonRollbackableTypes: ['reminder', 'notify'],
  requireApproval: false,
  approvalRoles: ['admin', 'supervisor'],
};

// =============================================================================
// Rollback Service Functions
// =============================================================================

/**
 * Check if an execution can be rolled back
 */
export async function checkRollbackEligibility(
  executionId: string,
  policy: Partial<RollbackPolicy> = {}
): Promise<RollbackEligibility> {
  const cfg = { ...DEFAULT_POLICY, ...policy };

  const execution = await prisma.actionExecution.findUnique({
    where: { id: executionId },
    include: {
      action: { select: { actionType: true, name: true } },
    },
  });

  if (!execution) {
    return {
      eligible: false,
      reason: 'Execution not found',
    };
  }

  // Check if already rolled back
  if (execution.wasRolledBack) {
    return {
      eligible: false,
      reason: 'Execution has already been rolled back',
      actionType: execution.action?.actionType,
    };
  }

  // Check status
  if (execution.status !== 'completed') {
    return {
      eligible: false,
      reason: `Cannot rollback execution with status: ${execution.status}`,
      actionType: execution.action?.actionType,
    };
  }

  // Check if action type supports rollback
  const actionType = execution.action?.actionType || 'unknown';
  if (cfg.nonRollbackableTypes.includes(actionType) || !canRollback(actionType)) {
    return {
      eligible: false,
      reason: `Action type '${actionType}' does not support rollback`,
      actionType,
    };
  }

  // Check rollback data exists
  if (!execution.rollbackData) {
    return {
      eligible: false,
      reason: 'No rollback data available for this execution',
      actionType,
    };
  }

  // Check time window
  const executionTime = execution.completedAt || execution.executedAt;
  if (executionTime) {
    const hoursSinceExecution =
      (Date.now() - executionTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceExecution > cfg.maxRollbackWindowHours) {
      return {
        eligible: false,
        reason: `Rollback window of ${cfg.maxRollbackWindowHours} hours has expired`,
        timeSinceExecution: hoursSinceExecution,
        actionType,
      };
    }

    return {
      eligible: true,
      reason: 'Execution is eligible for rollback',
      timeSinceExecution: hoursSinceExecution,
      actionType,
    };
  }

  return {
    eligible: true,
    reason: 'Execution is eligible for rollback',
    actionType,
  };
}

/**
 * Request a rollback
 */
export async function requestRollback(
  request: RollbackRequest,
  policy: Partial<RollbackPolicy> = {}
): Promise<RollbackResult> {
  const cfg = { ...DEFAULT_POLICY, ...policy };

  logger.info({ request }, 'Rollback requested');

  // Check eligibility
  const eligibility = await checkRollbackEligibility(request.executionId, policy);
  if (!eligibility.eligible) {
    return {
      success: false,
      executionId: request.executionId,
      message: eligibility.reason,
    };
  }

  // Check if approval is required
  if (cfg.requireApproval) {
    // Create pending rollback request
    const rollbackRequest = await createPendingRollback(request);
    return {
      success: true,
      executionId: request.executionId,
      message: 'Rollback request submitted for approval',
      rollbackExecutionId: rollbackRequest.id,
    };
  }

  // Execute rollback immediately
  try {
    const execution = await rollbackExecution(
      request.executionId,
      request.requestedBy
    );

    // Log the rollback
    await logRollback(request, 'completed');

    return {
      success: true,
      executionId: request.executionId,
      message: 'Rollback completed successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logRollback(request, 'failed', errorMessage);

    return {
      success: false,
      executionId: request.executionId,
      message: `Rollback failed: ${errorMessage}`,
    };
  }
}

/**
 * Create a pending rollback request
 */
async function createPendingRollback(
  request: RollbackRequest
): Promise<{ id: string }> {
  const rollback = await prisma.rollbackRequest.create({
    data: {
      id: `rb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      executionId: request.executionId,
      requestedBy: request.requestedBy,
      reason: request.reason,
      status: 'pending',
      createdAt: new Date(),
    },
  });

  logger.info({ rollbackId: rollback.id }, 'Pending rollback request created');
  return { id: rollback.id };
}

/**
 * Approve a pending rollback request
 */
export async function approveRollback(
  rollbackId: string,
  approvedBy: string
): Promise<RollbackResult> {
  const rollback = await prisma.rollbackRequest.findUnique({
    where: { id: rollbackId },
  });

  if (!rollback) {
    return {
      success: false,
      executionId: 'unknown',
      message: 'Rollback request not found',
    };
  }

  if (rollback.status !== 'pending') {
    return {
      success: false,
      executionId: rollback.executionId,
      message: `Cannot approve rollback with status: ${rollback.status}`,
    };
  }

  // Update status
  await prisma.rollbackRequest.update({
    where: { id: rollbackId },
    data: {
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    },
  });

  // Execute the rollback
  try {
    await rollbackExecution(rollback.executionId, rollback.requestedBy);

    await prisma.rollbackRequest.update({
      where: { id: rollbackId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    await logRollback(
      {
        executionId: rollback.executionId,
        requestedBy: rollback.requestedBy,
        reason: rollback.reason,
      },
      'completed'
    );

    return {
      success: true,
      executionId: rollback.executionId,
      message: 'Rollback approved and completed',
      rollbackExecutionId: rollbackId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.rollbackRequest.update({
      where: { id: rollbackId },
      data: {
        status: 'failed',
        errorMessage,
      },
    });

    return {
      success: false,
      executionId: rollback.executionId,
      message: `Rollback failed: ${errorMessage}`,
      rollbackExecutionId: rollbackId,
    };
  }
}

/**
 * Reject a pending rollback request
 */
export async function rejectRollback(
  rollbackId: string,
  rejectedBy: string,
  reason: string
): Promise<RollbackResult> {
  const rollback = await prisma.rollbackRequest.findUnique({
    where: { id: rollbackId },
  });

  if (!rollback) {
    return {
      success: false,
      executionId: 'unknown',
      message: 'Rollback request not found',
    };
  }

  await prisma.rollbackRequest.update({
    where: { id: rollbackId },
    data: {
      status: 'rejected',
      rejectedBy,
      rejectionReason: reason,
      rejectedAt: new Date(),
    },
  });

  return {
    success: true,
    executionId: rollback.executionId,
    message: 'Rollback request rejected',
    rollbackExecutionId: rollbackId,
  };
}

/**
 * Log rollback operation
 */
async function logRollback(
  request: RollbackRequest,
  status: 'completed' | 'failed',
  error?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action: 'rollback',
      entityType: 'action_execution',
      entityId: request.executionId,
      performedBy: request.requestedBy,
      details: {
        reason: request.reason,
        status,
        error,
      },
      createdAt: new Date(),
    },
  });
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get rollback-eligible executions for an organization
 */
export async function getRollbackableExecutions(
  organizationId: string,
  policy: Partial<RollbackPolicy> = {}
): Promise<ActionExecution[]> {
  const cfg = { ...DEFAULT_POLICY, ...policy };
  const cutoff = new Date(Date.now() - cfg.maxRollbackWindowHours * 60 * 60 * 1000);

  const executions = await getExecutionHistory(organizationId, {
    status: 'completed',
  });

  const eligible: ActionExecution[] = [];

  for (const exec of executions) {
    const eligibility = await checkRollbackEligibility(exec.id, policy);
    if (eligibility.eligible) {
      eligible.push(exec);
    }
  }

  return eligible;
}

/**
 * Get pending rollback requests
 */
export async function getPendingRollbackRequests(
  organizationId: string
): Promise<
  Array<{
    id: string;
    executionId: string;
    requestedBy: string;
    reason: string;
    createdAt: Date;
  }>
> {
  const requests = await prisma.rollbackRequest.findMany({
    where: {
      status: 'pending',
      execution: { organizationId },
    },
    select: {
      id: true,
      executionId: true,
      requestedBy: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests;
}

/**
 * Get rollback history for an organization
 */
export async function getRollbackHistory(
  organizationId: string,
  limit: number = 50
): Promise<
  Array<{
    id: string;
    executionId: string;
    requestedBy: string;
    reason: string;
    status: string;
    createdAt: Date;
    completedAt?: Date;
  }>
> {
  const history = await prisma.rollbackRequest.findMany({
    where: {
      execution: { organizationId },
    },
    select: {
      id: true,
      executionId: true,
      requestedBy: true,
      reason: true,
      status: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return history;
}

export default {
  checkRollbackEligibility,
  requestRollback,
  approveRollback,
  rejectRollback,
  getRollbackableExecutions,
  getPendingRollbackRequests,
  getRollbackHistory,
  DEFAULT_POLICY,
};
