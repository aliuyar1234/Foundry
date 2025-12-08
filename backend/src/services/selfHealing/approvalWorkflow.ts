/**
 * Action Approval Workflow
 * T143 - Create action approval workflow
 *
 * Manages approval process for automated actions
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { approveExecution, cancelExecution } from './actionExecutor.js';
import type { ActionExecution, ExecutionStatus } from 'shared/types/selfHealing.js';

// =============================================================================
// Types
// =============================================================================

export interface ApprovalRequest {
  id: string;
  executionId: string;
  actionId: string;
  actionName: string;
  actionType: string;
  triggerReason: string;
  requestedAt: Date;
  expiresAt?: Date;
  assignedTo?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  context: ApprovalContext;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface ApprovalContext {
  patternType?: string;
  patternSeverity?: string;
  affectedEntities: Array<{ type: string; name: string }>;
  suggestedActions: string[];
  riskAssessment?: RiskAssessment;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  factors: string[];
  mitigations: string[];
}

export interface ApprovalDecision {
  approved: boolean;
  decidedBy: string;
  reason?: string;
  modifications?: Record<string, unknown>;
}

export interface ApprovalPolicy {
  /** Hours before approval request expires */
  expirationHours: number;
  /** Roles that can approve */
  approverRoles: string[];
  /** Auto-approve low severity after delay (hours, 0 = disabled) */
  autoApproveLowSeverityHours: number;
  /** Notify on pending approval */
  notifyOnPending: boolean;
  /** Notify on expiration */
  notifyOnExpiration: boolean;
  /** Escalate after hours without decision */
  escalateAfterHours: number;
}

const DEFAULT_POLICY: ApprovalPolicy = {
  expirationHours: 24,
  approverRoles: ['admin', 'supervisor', 'manager'],
  autoApproveLowSeverityHours: 0,
  notifyOnPending: true,
  notifyOnExpiration: true,
  escalateAfterHours: 4,
};

// =============================================================================
// Approval Workflow Functions
// =============================================================================

/**
 * Create an approval request for an execution
 */
export async function createApprovalRequest(
  execution: ActionExecution,
  context: ApprovalContext,
  policy: Partial<ApprovalPolicy> = {}
): Promise<ApprovalRequest> {
  const cfg = { ...DEFAULT_POLICY, ...policy };

  const action = await prisma.automatedAction.findUnique({
    where: { id: execution.actionId },
    select: { name: true, actionType: true, approvalRoles: true },
  });

  const priority = determinePriority(context);
  const expiresAt = new Date(Date.now() + cfg.expirationHours * 60 * 60 * 1000);

  // Create approval request record
  const request = await prisma.approvalRequest.create({
    data: {
      id: `apr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      executionId: execution.id,
      actionId: execution.actionId,
      priority,
      context: context as unknown as Record<string, unknown>,
      status: 'pending',
      expiresAt,
      organizationId: execution.organizationId,
      createdAt: new Date(),
    },
  });

  // Notify approvers
  if (cfg.notifyOnPending) {
    await notifyApprovers(
      request.id,
      action?.name || 'Unknown Action',
      execution.organizationId,
      action?.approvalRoles || cfg.approverRoles,
      priority
    );
  }

  logger.info(
    { requestId: request.id, executionId: execution.id, priority },
    'Approval request created'
  );

  return mapToApprovalRequest(request, action);
}

/**
 * Process approval decision
 */
export async function processApprovalDecision(
  requestId: string,
  decision: ApprovalDecision
): Promise<ActionExecution> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: {
      execution: true,
    },
  });

  if (!request) {
    throw new Error(`Approval request not found: ${requestId}`);
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot process decision for request with status: ${request.status}`);
  }

  // Check if request has expired
  if (request.expiresAt && request.expiresAt < new Date()) {
    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'expired' },
    });
    throw new Error('Approval request has expired');
  }

  // Update request status
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      status: decision.approved ? 'approved' : 'rejected',
      decidedBy: decision.decidedBy,
      decidedAt: new Date(),
      decisionReason: decision.reason,
    },
  });

  // Process the execution
  let execution: ActionExecution;

  if (decision.approved) {
    execution = await approveExecution(request.executionId, decision.decidedBy);

    logger.info(
      { requestId, executionId: request.executionId, decidedBy: decision.decidedBy },
      'Approval granted, execution proceeding'
    );
  } else {
    execution = await cancelExecution(request.executionId, decision.decidedBy);

    // Log rejection
    await prisma.auditLog.create({
      data: {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        action: 'approval_rejected',
        entityType: 'action_execution',
        entityId: request.executionId,
        performedBy: decision.decidedBy,
        details: { reason: decision.reason },
        organizationId: request.organizationId,
        createdAt: new Date(),
      },
    });

    logger.info(
      { requestId, executionId: request.executionId, decidedBy: decision.decidedBy, reason: decision.reason },
      'Approval rejected, execution cancelled'
    );
  }

  return execution;
}

/**
 * Get pending approvals for a user
 */
export async function getPendingApprovalsForUser(
  userId: string,
  organizationId: string
): Promise<ApprovalRequest[]> {
  // Get user's roles
  const user = await prisma.person.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return [];
  }

  // Get pending requests where user can approve
  const requests = await prisma.approvalRequest.findMany({
    where: {
      organizationId,
      status: 'pending',
      OR: [
        { assignedTo: userId },
        {
          action: {
            approvalRoles: { has: user.role },
          },
        },
      ],
    },
    include: {
      action: { select: { name: true, actionType: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  return requests.map((r) => mapToApprovalRequest(r, r.action));
}

/**
 * Get all pending approvals for an organization
 */
export async function getAllPendingApprovals(
  organizationId: string
): Promise<ApprovalRequest[]> {
  const requests = await prisma.approvalRequest.findMany({
    where: {
      organizationId,
      status: 'pending',
    },
    include: {
      action: { select: { name: true, actionType: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  return requests.map((r) => mapToApprovalRequest(r, r.action));
}

/**
 * Assign approval request to a specific user
 */
export async function assignApprovalRequest(
  requestId: string,
  assignedTo: string
): Promise<void> {
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { assignedTo },
  });

  // Notify assigned user
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: { action: { select: { name: true } } },
  });

  if (request) {
    await prisma.notification.create({
      data: {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'approval_assigned',
        title: 'Approval Request Assigned',
        message: `You have been assigned to review action "${request.action?.name}"`,
        recipientId: assignedTo,
        organizationId: request.organizationId,
        isRead: false,
        createdAt: new Date(),
      },
    });
  }
}

/**
 * Process expired approval requests
 */
export async function processExpiredApprovals(
  organizationId: string,
  policy: Partial<ApprovalPolicy> = {}
): Promise<number> {
  const cfg = { ...DEFAULT_POLICY, ...policy };

  const expiredRequests = await prisma.approvalRequest.findMany({
    where: {
      organizationId,
      status: 'pending',
      expiresAt: { lt: new Date() },
    },
    include: {
      execution: true,
    },
  });

  let processedCount = 0;

  for (const request of expiredRequests) {
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { status: 'expired' },
    });

    // Cancel the execution
    await cancelExecution(request.executionId, 'system');

    // Notify if configured
    if (cfg.notifyOnExpiration) {
      await notifyExpiration(request.id, request.organizationId);
    }

    processedCount++;
  }

  if (processedCount > 0) {
    logger.info({ organizationId, expiredCount: processedCount }, 'Processed expired approvals');
  }

  return processedCount;
}

/**
 * Check for approvals that need escalation
 */
export async function escalatePendingApprovals(
  organizationId: string,
  policy: Partial<ApprovalPolicy> = {}
): Promise<number> {
  const cfg = { ...DEFAULT_POLICY, ...policy };

  if (cfg.escalateAfterHours <= 0) {
    return 0;
  }

  const escalationThreshold = new Date(
    Date.now() - cfg.escalateAfterHours * 60 * 60 * 1000
  );

  const staleRequests = await prisma.approvalRequest.findMany({
    where: {
      organizationId,
      status: 'pending',
      createdAt: { lt: escalationThreshold },
      escalatedAt: null,
    },
    include: {
      action: { select: { name: true } },
    },
  });

  let escalatedCount = 0;

  for (const request of staleRequests) {
    // Mark as escalated
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        escalatedAt: new Date(),
        priority: 'urgent',
      },
    });

    // Notify managers/admins
    const admins = await prisma.person.findMany({
      where: {
        organizationId,
        role: { in: ['admin', 'manager'] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'approval_escalated',
          title: 'Approval Request Escalated',
          message: `Action "${request.action?.name}" has been pending approval for ${cfg.escalateAfterHours} hours`,
          recipientId: admin.id,
          organizationId,
          isRead: false,
          priority: 'high',
          createdAt: new Date(),
        },
      });
    }

    escalatedCount++;
  }

  if (escalatedCount > 0) {
    logger.info({ organizationId, escalatedCount }, 'Escalated pending approvals');
  }

  return escalatedCount;
}

// =============================================================================
// Helper Functions
// =============================================================================

function determinePriority(
  context: ApprovalContext
): 'low' | 'normal' | 'high' | 'urgent' {
  if (context.patternSeverity === 'critical') return 'urgent';
  if (context.patternSeverity === 'high') return 'high';
  if (context.riskAssessment?.level === 'high') return 'high';
  if (context.affectedEntities.length > 10) return 'high';
  if (context.patternSeverity === 'medium') return 'normal';
  return 'low';
}

async function notifyApprovers(
  requestId: string,
  actionName: string,
  organizationId: string,
  approverRoles: string[],
  priority: string
): Promise<void> {
  const approvers = await prisma.person.findMany({
    where: {
      organizationId,
      role: { in: approverRoles },
      isActive: true,
    },
    select: { id: true },
  });

  for (const approver of approvers) {
    await prisma.notification.create({
      data: {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'approval_pending',
        title: 'Approval Required',
        message: `Action "${actionName}" requires your approval`,
        recipientId: approver.id,
        organizationId,
        isRead: false,
        priority: priority === 'urgent' || priority === 'high' ? 'high' : 'normal',
        metadata: { requestId },
        createdAt: new Date(),
      },
    });
  }
}

async function notifyExpiration(
  requestId: string,
  organizationId: string
): Promise<void> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: { action: { select: { name: true, createdBy: true } } },
  });

  if (request?.action?.createdBy) {
    await prisma.notification.create({
      data: {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'approval_expired',
        title: 'Approval Request Expired',
        message: `Action "${request.action.name}" approval request has expired`,
        recipientId: request.action.createdBy,
        organizationId,
        isRead: false,
        createdAt: new Date(),
      },
    });
  }
}

function mapToApprovalRequest(
  record: {
    id: string;
    executionId: string;
    actionId: string;
    priority: string;
    context: unknown;
    status: string;
    expiresAt: Date | null;
    assignedTo: string | null;
    createdAt: Date;
  },
  action?: { name: string; actionType: string } | null
): ApprovalRequest {
  const context = record.context as ApprovalContext;

  return {
    id: record.id,
    executionId: record.executionId,
    actionId: record.actionId,
    actionName: action?.name || 'Unknown',
    actionType: action?.actionType || 'unknown',
    triggerReason: context.patternType || 'Manual trigger',
    requestedAt: record.createdAt,
    expiresAt: record.expiresAt || undefined,
    assignedTo: record.assignedTo || undefined,
    priority: record.priority as 'low' | 'normal' | 'high' | 'urgent',
    context,
    status: record.status as 'pending' | 'approved' | 'rejected' | 'expired',
  };
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get approval workflow statistics
 */
export async function getApprovalStatistics(
  organizationId: string,
  days: number = 30
): Promise<{
  totalRequests: number;
  approved: number;
  rejected: number;
  expired: number;
  pending: number;
  avgDecisionTimeHours: number;
  byActionType: Record<string, number>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const requests = await prisma.approvalRequest.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
    },
    include: {
      action: { select: { actionType: true } },
    },
  });

  let totalDecisionTime = 0;
  let decisionsWithTime = 0;
  const byActionType: Record<string, number> = {};

  const stats = {
    totalRequests: requests.length,
    approved: 0,
    rejected: 0,
    expired: 0,
    pending: 0,
  };

  for (const request of requests) {
    stats[request.status as keyof typeof stats]++;

    if (request.action?.actionType) {
      byActionType[request.action.actionType] =
        (byActionType[request.action.actionType] || 0) + 1;
    }

    if ((request as { decidedAt?: Date }).decidedAt) {
      const decisionTime =
        ((request as { decidedAt: Date }).decidedAt.getTime() - request.createdAt.getTime()) /
        (1000 * 60 * 60);
      totalDecisionTime += decisionTime;
      decisionsWithTime++;
    }
  }

  return {
    ...stats,
    avgDecisionTimeHours:
      decisionsWithTime > 0 ? totalDecisionTime / decisionsWithTime : 0,
    byActionType,
  };
}

export default {
  createApprovalRequest,
  processApprovalDecision,
  getPendingApprovalsForUser,
  getAllPendingApprovals,
  assignApprovalRequest,
  processExpiredApprovals,
  escalatePendingApprovals,
  getApprovalStatistics,
  DEFAULT_POLICY,
};
