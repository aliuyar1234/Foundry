/**
 * Self-Healing API Routes
 * T150-T155 - Self-healing API endpoints
 *
 * Endpoints for pattern detection, actions, executions, approvals, and learning
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

// Pattern Detection
import {
  detectPatterns,
  detectPatternType,
  matchPatternsToActions,
  getRegisteredDetectors,
  getPatternStatistics,
} from '../../services/selfHealing/patternDetector.js';

// Action Executor
import {
  executeAction,
  approveExecution,
  cancelExecution,
  rollbackExecution,
  executeActionsForPatterns,
  getExecutionHistory,
  getPendingApprovals as getExecutionPendingApprovals,
  getExecutionStatistics,
  registerActionExecutor,
  getRegisteredActionTypes,
} from '../../services/selfHealing/actionExecutor.js';

// Rollback Service
import {
  checkRollbackEligibility,
  requestRollback,
  approveRollback,
  rejectRollback,
  getRollbackableExecutions,
  getPendingRollbackRequests,
  getRollbackHistory,
} from '../../services/selfHealing/rollbackService.js';

// Safety Checks
import {
  runSafetyChecks,
  validateActionSafety,
  getSafetyStatistics,
} from '../../services/selfHealing/safetyChecks.js';

// Approval Workflow
import {
  createApprovalRequest,
  processApprovalDecision,
  getPendingApprovalsForUser,
  getAllPendingApprovals,
  assignApprovalRequest,
  getApprovalStatistics,
} from '../../services/selfHealing/approvalWorkflow.js';

// Audit Trail
import {
  queryAuditTrail,
  getEntityAuditTrail,
  getUserActivity,
  getAuditStatistics,
  exportAuditTrail,
} from '../../services/selfHealing/auditTrail.js';

// Learning Service
import {
  runLearningAnalysis,
  analyzePatternHistory,
  generateSuggestions,
  getLearnedPatterns,
  approveLearnedPattern,
} from '../../services/selfHealing/learningService.js';

import type { PatternType, AutomatedAction } from 'shared/types/selfHealing.js';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const PatternDetectionSchema = z.object({
  patternTypes: z.array(z.string()).optional(),
  timeWindowMinutes: z.number().int().min(1).max(10080).optional(),
  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  autoExecute: z.boolean().optional(),
});

const ActionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.enum(['pattern', 'threshold', 'schedule', 'event']),
  triggerConfig: z.record(z.unknown()),
  actionType: z.enum(['reminder', 'escalation', 'retry', 'redistribute', 'notify', 'custom']),
  actionConfig: z.record(z.unknown()),
  requiresApproval: z.boolean().default(false),
  approvalRoles: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

const ApprovalDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
  modifications: z.record(z.unknown()).optional(),
});

const RollbackRequestSchema = z.object({
  reason: z.string().min(1),
});

const AuditQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventTypes: z.array(z.string()).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  userId: z.string().optional(),
  severity: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

// =============================================================================
// Middleware
// =============================================================================

interface AuthenticatedRequest extends Request {
  organizationId?: string;
  userId?: string;
}

function requireOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const organizationId = req.headers['x-organization-id'] as string || req.query.organizationId as string;

  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID required' });
  }

  req.organizationId = organizationId;
  req.userId = req.headers['x-user-id'] as string || 'anonymous';
  next();
}

router.use(requireOrganization);

// =============================================================================
// Pattern Detection Endpoints (T150)
// =============================================================================

/**
 * GET /api/self-healing/patterns/detectors
 * List registered pattern detectors
 */
router.get('/patterns/detectors', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const detectors = getRegisteredDetectors();
    res.json({ detectors });
  } catch (error) {
    logger.error({ error }, 'Failed to list detectors');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/patterns/detect
 * Run pattern detection
 */
router.post('/patterns/detect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = PatternDetectionSchema.parse(req.body);
    const organizationId = req.organizationId!;

    const result = await detectPatterns({
      organizationId,
      patternTypes: validated.patternTypes as PatternType[],
      timeWindowMinutes: validated.timeWindowMinutes,
      minSeverity: validated.minSeverity,
    });

    // Optionally execute matched actions
    if (validated.autoExecute && result.patterns.length > 0) {
      await matchPatternsToActions(organizationId, result.patterns);
      const executions = await executeActionsForPatterns(
        organizationId,
        result.patterns,
        { dryRun: false }
      );

      return res.json({
        ...result,
        executionsTriggered: executions.length,
        executionIds: executions.map((e) => e.id),
      });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Pattern detection failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/patterns/statistics
 * Get pattern statistics
 */
router.get('/patterns/statistics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const stats = await getPatternStatistics(organizationId);
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get pattern statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Automated Actions Endpoints (T151)
// =============================================================================

/**
 * GET /api/self-healing/actions
 * List automated actions
 */
router.get('/actions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const { isActive, actionType } = req.query;

    const where: Record<string, unknown> = { organizationId };
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    if (actionType) {
      where.actionType = actionType;
    }

    const actions = await prisma.automatedAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ actions });
  } catch (error) {
    logger.error({ error }, 'Failed to list actions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/actions
 * Create an automated action
 */
router.post('/actions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = ActionSchema.parse(req.body);
    const organizationId = req.organizationId!;
    const userId = req.userId!;

    // Validate action safety
    const safetyResult = await validateActionSafety(validated as Partial<AutomatedAction>, organizationId);
    if (!safetyResult.valid) {
      return res.status(400).json({
        error: 'Action validation failed',
        details: safetyResult.errors,
      });
    }

    const action = await prisma.automatedAction.create({
      data: {
        organizationId,
        createdBy: userId,
        ...validated,
      },
    });

    res.status(201).json(action);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to create action');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/actions/:actionId
 * Get a specific action
 */
router.get('/actions/:actionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const organizationId = req.organizationId!;

    const action = await prisma.automatedAction.findFirst({
      where: { id: actionId, organizationId },
    });

    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    res.json(action);
  } catch (error) {
    logger.error({ error }, 'Failed to get action');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/self-healing/actions/:actionId
 * Update an automated action
 */
router.put('/actions/:actionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const validated = ActionSchema.partial().parse(req.body);
    const organizationId = req.organizationId!;

    const existing = await prisma.automatedAction.findFirst({
      where: { id: actionId, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const action = await prisma.automatedAction.update({
      where: { id: actionId },
      data: {
        ...validated,
        updatedAt: new Date(),
      },
    });

    res.json(action);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to update action');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/self-healing/actions/:actionId
 * Delete an automated action
 */
router.delete('/actions/:actionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const organizationId = req.organizationId!;

    const existing = await prisma.automatedAction.findFirst({
      where: { id: actionId, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Action not found' });
    }

    await prisma.automatedAction.delete({
      where: { id: actionId },
    });

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Failed to delete action');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/actions/:actionId/execute
 * Manually trigger an action
 */
router.post('/actions/:actionId/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const { dryRun = false } = req.body;
    const organizationId = req.organizationId!;
    const userId = req.userId!;

    const action = await prisma.automatedAction.findFirst({
      where: { id: actionId, organizationId },
    });

    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    // Run safety checks
    const safetyResult = await runSafetyChecks(action as AutomatedAction, null);
    if (!safetyResult.passed) {
      return res.status(403).json({
        error: 'Safety checks failed',
        reason: safetyResult.blockedReason,
        checks: safetyResult.checks,
      });
    }

    const execution = await executeAction(
      action as AutomatedAction,
      {
        executionId: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        triggeredBy: 'manual',
        organizationId,
        initiatedBy: userId,
      },
      { dryRun }
    );

    res.json(execution);
  } catch (error) {
    logger.error({ error }, 'Failed to execute action');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Execution Endpoints (T152)
// =============================================================================

/**
 * GET /api/self-healing/executions
 * List action executions
 */
router.get('/executions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const { actionId, status, limit, offset } = req.query;

    const executions = await getExecutionHistory(organizationId, {
      actionId: actionId as string,
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ executions });
  } catch (error) {
    logger.error({ error }, 'Failed to list executions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/executions/statistics
 * Get execution statistics
 */
router.get('/executions/statistics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const days = parseInt(req.query.days as string) || 30;

    const stats = await getExecutionStatistics(organizationId, days);
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get execution statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/executions/:executionId
 * Get a specific execution
 */
router.get('/executions/:executionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { executionId } = req.params;
    const organizationId = req.organizationId!;

    const execution = await prisma.actionExecution.findFirst({
      where: { id: executionId, organizationId },
      include: {
        action: { select: { name: true, actionType: true } },
      },
    });

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(execution);
  } catch (error) {
    logger.error({ error }, 'Failed to get execution');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/executions/:executionId/approve
 * Approve a pending execution
 */
router.post('/executions/:executionId/approve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { executionId } = req.params;
    const userId = req.userId!;

    const execution = await approveExecution(executionId, userId);
    res.json(execution);
  } catch (error) {
    logger.error({ error }, 'Failed to approve execution');
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/self-healing/executions/:executionId/cancel
 * Cancel a pending execution
 */
router.post('/executions/:executionId/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { executionId } = req.params;
    const userId = req.userId!;

    const execution = await cancelExecution(executionId, userId);
    res.json(execution);
  } catch (error) {
    logger.error({ error }, 'Failed to cancel execution');
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/self-healing/executions/:executionId/rollback
 * Request rollback of a completed execution
 */
router.post('/executions/:executionId/rollback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { executionId } = req.params;
    const validated = RollbackRequestSchema.parse(req.body);
    const userId = req.userId!;

    // Check eligibility
    const eligibility = await checkRollbackEligibility(executionId);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: 'Rollback not eligible',
        reason: eligibility.reason,
      });
    }

    const result = await requestRollback({
      executionId,
      requestedBy: userId,
      reason: validated.reason,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to request rollback');
    res.status(500).json({ error: (error as Error).message });
  }
});

// =============================================================================
// Approval Endpoints (T153)
// =============================================================================

/**
 * GET /api/self-healing/approvals/pending
 * Get pending approval requests
 */
router.get('/approvals/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.userId;

    const approvals = userId
      ? await getPendingApprovalsForUser(userId, organizationId)
      : await getAllPendingApprovals(organizationId);

    res.json({ approvals });
  } catch (error) {
    logger.error({ error }, 'Failed to get pending approvals');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/approvals/statistics
 * Get approval statistics
 */
router.get('/approvals/statistics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const days = parseInt(req.query.days as string) || 30;

    const stats = await getApprovalStatistics(organizationId, days);
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get approval statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/approvals/:approvalId/decide
 * Submit approval decision
 */
router.post('/approvals/:approvalId/decide', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { approvalId } = req.params;
    const validated = ApprovalDecisionSchema.parse(req.body);
    const userId = req.userId!;

    const execution = await processApprovalDecision(approvalId, {
      approved: validated.approved,
      decidedBy: userId,
      reason: validated.reason,
      modifications: validated.modifications,
    });

    res.json(execution);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to process approval');
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/self-healing/approvals/:approvalId/assign
 * Assign approval to a specific user
 */
router.post('/approvals/:approvalId/assign', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { approvalId } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ error: 'assignedTo is required' });
    }

    await assignApprovalRequest(approvalId, assignedTo);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to assign approval');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Rollback Endpoints (T154)
// =============================================================================

/**
 * GET /api/self-healing/rollbacks/eligible
 * Get rollback-eligible executions
 */
router.get('/rollbacks/eligible', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const executions = await getRollbackableExecutions(organizationId);
    res.json({ executions });
  } catch (error) {
    logger.error({ error }, 'Failed to get rollback-eligible executions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/rollbacks/pending
 * Get pending rollback requests
 */
router.get('/rollbacks/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const requests = await getPendingRollbackRequests(organizationId);
    res.json({ requests });
  } catch (error) {
    logger.error({ error }, 'Failed to get pending rollback requests');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/rollbacks/history
 * Get rollback history
 */
router.get('/rollbacks/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await getRollbackHistory(organizationId, limit);
    res.json({ history });
  } catch (error) {
    logger.error({ error }, 'Failed to get rollback history');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/rollbacks/:rollbackId/approve
 * Approve a pending rollback
 */
router.post('/rollbacks/:rollbackId/approve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rollbackId } = req.params;
    const userId = req.userId!;

    const result = await approveRollback(rollbackId, userId);
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to approve rollback');
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/self-healing/rollbacks/:rollbackId/reject
 * Reject a pending rollback
 */
router.post('/rollbacks/:rollbackId/reject', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rollbackId } = req.params;
    const { reason } = req.body;
    const userId = req.userId!;

    const result = await rejectRollback(rollbackId, userId, reason || 'Rejected');
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to reject rollback');
    res.status(500).json({ error: (error as Error).message });
  }
});

// =============================================================================
// Learning Endpoints (T155)
// =============================================================================

/**
 * GET /api/self-healing/learning/patterns
 * Get learned patterns
 */
router.get('/learning/patterns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const patterns = await getLearnedPatterns(organizationId);
    res.json({ patterns });
  } catch (error) {
    logger.error({ error }, 'Failed to get learned patterns');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/learning/analyze
 * Run learning analysis
 */
router.post('/learning/analyze', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const { analysisWindowDays = 30 } = req.body;

    const result = await runLearningAnalysis(organizationId, { analysisWindowDays });
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Learning analysis failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/self-healing/learning/patterns/:patternId/approve
 * Approve a learned pattern
 */
router.post('/learning/patterns/:patternId/approve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { patternId } = req.params;
    const userId = req.userId!;

    const pattern = await approveLearnedPattern(patternId, userId);
    res.json(pattern);
  } catch (error) {
    logger.error({ error }, 'Failed to approve learned pattern');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/learning/suggestions
 * Get resolution suggestions
 */
router.get('/learning/suggestions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;

    const analyses = await analyzePatternHistory(organizationId, {
      minOccurrences: 5,
      minSuccessRate: 0.7,
      analysisWindowDays: 30,
      confidenceThreshold: 0.6,
    });

    const suggestions = [];
    for (const analysis of analyses) {
      const generated = await generateSuggestions(organizationId, analysis, {
        minOccurrences: 5,
        minSuccessRate: 0.7,
        analysisWindowDays: 30,
        confidenceThreshold: 0.6,
      });
      suggestions.push(...generated);
    }

    res.json({ suggestions });
  } catch (error) {
    logger.error({ error }, 'Failed to get suggestions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Audit Trail Endpoints
// =============================================================================

/**
 * GET /api/self-healing/audit
 * Query audit trail
 */
router.get('/audit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const validated = AuditQuerySchema.parse(req.query);

    const result = await queryAuditTrail({
      organizationId,
      startDate: validated.startDate ? new Date(validated.startDate) : undefined,
      endDate: validated.endDate ? new Date(validated.endDate) : undefined,
      eventTypes: validated.eventTypes as any,
      entityType: validated.entityType,
      entityId: validated.entityId,
      userId: validated.userId,
      severity: validated.severity,
      limit: validated.limit,
      offset: validated.offset,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to query audit trail');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/audit/statistics
 * Get audit statistics
 */
router.get('/audit/statistics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const days = parseInt(req.query.days as string) || 30;

    const stats = await getAuditStatistics(organizationId, days);
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get audit statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/self-healing/audit/export
 * Export audit trail to CSV
 */
router.get('/audit/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const validated = AuditQuerySchema.parse(req.query);

    const csv = await exportAuditTrail({
      organizationId,
      startDate: validated.startDate ? new Date(validated.startDate) : undefined,
      endDate: validated.endDate ? new Date(validated.endDate) : undefined,
      eventTypes: validated.eventTypes as any,
      entityType: validated.entityType,
      entityId: validated.entityId,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-trail.csv');
    res.send(csv);
  } catch (error) {
    logger.error({ error }, 'Failed to export audit trail');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Safety Statistics
// =============================================================================

/**
 * GET /api/self-healing/safety/statistics
 * Get safety check statistics
 */
router.get('/safety/statistics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const days = parseInt(req.query.days as string) || 7;

    const stats = await getSafetyStatistics(organizationId, days);
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get safety statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
