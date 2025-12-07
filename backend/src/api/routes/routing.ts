/**
 * Routing API Routes
 * T049-T055 - Routing API endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import {
  routeRequest,
  categorizeRequest,
  quickCategorize,
  matchRules,
  findBestExpert,
  findExperts,
  checkWorkloadCapacity,
  checkAvailability,
  handleEscalation,
  selectBackup,
  getBackupCandidates,
  queryDecisions,
  getDecision,
  updateDecisionOutcome,
  getRoutingStats,
  getHandlerPerformance,
  getCategoryDistribution,
  getRoutingTrends,
  getRoutingSummary,
  getLowConfidenceDecisions,
  getRuleEffectiveness,
} from '../../services/routing/index.js';
import { broadcastRoutingDecision } from '../../lib/sse/sseManager.js';

const router = Router();
const prisma = new PrismaClient();

// =============================================================================
// Validation Schemas
// =============================================================================

const RouteRequestSchema = z.object({
  content: z.string().min(1),
  subject: z.string().optional(),
  requestType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  options: z.object({
    useAI: z.boolean().optional(),
    fallbackToQueue: z.boolean().optional(),
    preferredHandlerId: z.string().optional(),
  }).optional(),
});

const RuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(1000).default(100),
  isActive: z.boolean().default(true),
  criteria: z.object({
    categories: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    senderDomains: z.array(z.string()).optional(),
    urgencyLevel: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  }),
  handler: z.object({
    type: z.enum(['person', 'team', 'queue', 'auto']),
    targetId: z.string().optional(),
    fallbackTargetId: z.string().optional(),
  }),
  schedule: z.object({
    timezone: z.string().optional(),
    activeHours: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    activeDays: z.array(z.number().int().min(0).max(6)).optional(),
  }).optional(),
});

const DecisionFeedbackSchema = z.object({
  wasSuccessful: z.boolean(),
  feedbackScore: z.number().min(1).max(5).optional(),
  feedbackText: z.string().optional(),
  resolutionTimeMs: z.number().optional(),
});

const AnalyticsQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  interval: z.enum(['hour', 'day', 'week']).optional(),
});

// =============================================================================
// Middleware
// =============================================================================

interface AuthenticatedRequest extends Request {
  organizationId?: string;
  userId?: string;
}

function requireOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // In a real app, extract from JWT or session
  const organizationId = req.headers['x-organization-id'] as string || req.query.organizationId as string;

  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID required' });
  }

  req.organizationId = organizationId;
  next();
}

// Apply to all routes
router.use(requireOrganization);

// =============================================================================
// Routing Endpoints
// =============================================================================

/**
 * POST /api/routing/route
 * Route a request to the appropriate handler
 */
router.post('/route', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = RouteRequestSchema.parse(req.body);
    const organizationId = req.organizationId!;

    const result = await routeRequest(
      {
        content: validated.content,
        subject: validated.subject,
        requestType: validated.requestType || 'general',
        metadata: validated.metadata,
      },
      {
        organizationId,
        userId: req.userId,
      },
      validated.options
    );

    // Broadcast decision via SSE
    broadcastRoutingDecision(organizationId, result.decision);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to route request');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/categorize
 * Categorize a request without routing
 */
router.post('/categorize', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, subject, useAI = false } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = useAI
      ? await categorizeRequest(content, subject)
      : quickCategorize(content, subject);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to categorize request');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/match-rules
 * Find matching rules for given categories
 */
router.post('/match-rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categories, context } = req.body;
    const organizationId = req.organizationId!;

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories array is required' });
    }

    const matches = await matchRules(organizationId, categories, context || {});
    res.json({ matches });
  } catch (error) {
    logger.error({ error }, 'Failed to match rules');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/find-expert
 * Find the best expert for given categories
 */
router.post('/find-expert', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categories, options } = req.body;
    const organizationId = req.organizationId!;

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories array is required' });
    }

    const expert = await findBestExpert(organizationId, categories, options);
    res.json({ expert });
  } catch (error) {
    logger.error({ error }, 'Failed to find expert');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/find-experts
 * Find multiple experts for given categories
 */
router.post('/find-experts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categories, options } = req.body;
    const organizationId = req.organizationId!;

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories array is required' });
    }

    const experts = await findExperts(organizationId, categories, options);
    res.json({ experts });
  } catch (error) {
    logger.error({ error }, 'Failed to find experts');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Handler Availability Endpoints
// =============================================================================

/**
 * GET /api/routing/handlers/:handlerId/availability
 * Check handler availability
 */
router.get('/handlers/:handlerId/availability', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;
    const organizationId = req.organizationId!;

    const availability = await checkAvailability(handlerId, organizationId);
    res.json(availability);
  } catch (error) {
    logger.error({ error }, 'Failed to check availability');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/handlers/:handlerId/workload
 * Check handler workload capacity
 */
router.get('/handlers/:handlerId/workload', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;
    const organizationId = req.organizationId!;

    const capacity = await checkWorkloadCapacity(handlerId, organizationId);
    res.json(capacity);
  } catch (error) {
    logger.error({ error }, 'Failed to check workload');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/handlers/:handlerId/backups
 * Get backup candidates for a handler
 */
router.get('/handlers/:handlerId/backups', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;
    const organizationId = req.organizationId!;
    const limit = parseInt(req.query.limit as string) || 5;

    const candidates = await getBackupCandidates(handlerId, organizationId, limit);
    res.json({ candidates });
  } catch (error) {
    logger.error({ error }, 'Failed to get backup candidates');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/handlers/:handlerId/escalate
 * Escalate from a handler
 */
router.post('/handlers/:handlerId/escalate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;
    const { isUrgent, startLevel } = req.body;
    const organizationId = req.organizationId!;

    const result = await handleEscalation(handlerId, organizationId, {
      isUrgent,
      startLevel,
    });

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to escalate');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/handlers/:handlerId/select-backup
 * Select a backup for a handler
 */
router.post('/handlers/:handlerId/select-backup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;
    const { options } = req.body;
    const organizationId = req.organizationId!;

    const backup = await selectBackup(handlerId, organizationId, options || {});
    res.json({ backup });
  } catch (error) {
    logger.error({ error }, 'Failed to select backup');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Rules Management Endpoints
// =============================================================================

/**
 * GET /api/routing/rules
 * List all routing rules
 */
router.get('/rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const { isActive } = req.query;

    const where: Record<string, unknown> = { organizationId };
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const rules = await prisma.routingRule.findMany({
      where,
      orderBy: { priority: 'desc' },
    });

    res.json({ rules });
  } catch (error) {
    logger.error({ error }, 'Failed to list rules');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/rules
 * Create a new routing rule
 */
router.post('/rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = RuleSchema.parse(req.body);
    const organizationId = req.organizationId!;

    const rule = await prisma.routingRule.create({
      data: {
        organizationId,
        name: validated.name,
        description: validated.description,
        priority: validated.priority,
        isActive: validated.isActive,
        criteria: validated.criteria,
        handler: validated.handler,
        schedule: validated.schedule || {},
      },
    });

    res.status(201).json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to create rule');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/rules/:ruleId
 * Get a specific rule
 */
router.get('/rules/:ruleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ruleId } = req.params;
    const organizationId = req.organizationId!;

    const rule = await prisma.routingRule.findFirst({
      where: { id: ruleId, organizationId },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(rule);
  } catch (error) {
    logger.error({ error }, 'Failed to get rule');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/routing/rules/:ruleId
 * Update a routing rule
 */
router.put('/rules/:ruleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ruleId } = req.params;
    const validated = RuleSchema.partial().parse(req.body);
    const organizationId = req.organizationId!;

    const existing = await prisma.routingRule.findFirst({
      where: { id: ruleId, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = await prisma.routingRule.update({
      where: { id: ruleId },
      data: {
        ...validated,
        updatedAt: new Date(),
      },
    });

    res.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to update rule');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/routing/rules/:ruleId
 * Delete a routing rule
 */
router.delete('/rules/:ruleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ruleId } = req.params;
    const organizationId = req.organizationId!;

    const existing = await prisma.routingRule.findFirst({
      where: { id: ruleId, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await prisma.routingRule.delete({
      where: { id: ruleId },
    });

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Failed to delete rule');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Decision History Endpoints
// =============================================================================

/**
 * GET /api/routing/decisions
 * Query routing decisions
 */
router.get('/decisions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const {
      startTime,
      endTime,
      handlerId,
      minConfidence,
      maxConfidence,
      wasEscalated,
      limit,
      offset,
    } = req.query;

    const decisions = await queryDecisions(organizationId, {
      startTime: startTime ? new Date(startTime as string) : undefined,
      endTime: endTime ? new Date(endTime as string) : undefined,
      handlerId: handlerId as string,
      minConfidence: minConfidence ? parseFloat(minConfidence as string) : undefined,
      maxConfidence: maxConfidence ? parseFloat(maxConfidence as string) : undefined,
      wasEscalated: wasEscalated !== undefined ? wasEscalated === 'true' : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ decisions });
  } catch (error) {
    logger.error({ error }, 'Failed to query decisions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/decisions/:decisionId
 * Get a specific decision
 */
router.get('/decisions/:decisionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decisionId } = req.params;

    const decision = await getDecision(decisionId);

    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    res.json(decision);
  } catch (error) {
    logger.error({ error }, 'Failed to get decision');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/decisions/:decisionId/feedback
 * Submit feedback for a decision
 */
router.post('/decisions/:decisionId/feedback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decisionId } = req.params;
    const validated = DecisionFeedbackSchema.parse(req.body);

    await updateDecisionOutcome(decisionId, validated);

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to submit feedback');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Analytics Endpoints
// =============================================================================

/**
 * GET /api/routing/analytics/summary
 * Get routing summary for dashboard
 */
router.get('/analytics/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;

    const summary = await getRoutingSummary(organizationId);
    res.json(summary);
  } catch (error) {
    logger.error({ error }, 'Failed to get routing summary');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/analytics/stats
 * Get routing statistics
 */
router.get('/analytics/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const query = AnalyticsQuerySchema.parse(req.query);

    const now = new Date();
    const startTime = query.startTime ? new Date(query.startTime) : new Date(now.getTime() - 7 * 86400000);
    const endTime = query.endTime ? new Date(query.endTime) : now;

    const stats = await getRoutingStats(organizationId, startTime, endTime);
    res.json(stats);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to get routing stats');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/analytics/handlers
 * Get handler performance metrics
 */
router.get('/analytics/handlers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const query = AnalyticsQuerySchema.parse(req.query);

    const now = new Date();
    const startTime = query.startTime ? new Date(query.startTime) : new Date(now.getTime() - 7 * 86400000);
    const endTime = query.endTime ? new Date(query.endTime) : now;

    const performance = await getHandlerPerformance(organizationId, startTime, endTime);
    res.json({ handlers: performance });
  } catch (error) {
    logger.error({ error }, 'Failed to get handler performance');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/analytics/categories
 * Get category distribution
 */
router.get('/analytics/categories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const query = AnalyticsQuerySchema.parse(req.query);

    const now = new Date();
    const startTime = query.startTime ? new Date(query.startTime) : new Date(now.getTime() - 7 * 86400000);
    const endTime = query.endTime ? new Date(query.endTime) : now;

    const distribution = await getCategoryDistribution(organizationId, startTime, endTime);
    res.json({ categories: distribution });
  } catch (error) {
    logger.error({ error }, 'Failed to get category distribution');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/analytics/trends
 * Get routing trends over time
 */
router.get('/analytics/trends', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const query = AnalyticsQuerySchema.parse(req.query);

    const now = new Date();
    const startTime = query.startTime ? new Date(query.startTime) : new Date(now.getTime() - 7 * 86400000);
    const endTime = query.endTime ? new Date(query.endTime) : now;

    const trends = await getRoutingTrends(organizationId, startTime, endTime, query.interval || 'day');
    res.json(trends);
  } catch (error) {
    logger.error({ error }, 'Failed to get routing trends');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/analytics/low-confidence
 * Get low confidence decisions for review
 */
router.get('/analytics/low-confidence', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const threshold = parseFloat(req.query.threshold as string) || 0.6;
    const limit = parseInt(req.query.limit as string) || 50;

    const decisions = await getLowConfidenceDecisions(organizationId, threshold, limit);
    res.json({ decisions });
  } catch (error) {
    logger.error({ error }, 'Failed to get low confidence decisions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/analytics/rules
 * Get rule effectiveness metrics
 */
router.get('/analytics/rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const query = AnalyticsQuerySchema.parse(req.query);

    const now = new Date();
    const startTime = query.startTime ? new Date(query.startTime) : new Date(now.getTime() - 7 * 86400000);
    const endTime = query.endTime ? new Date(query.endTime) : now;

    const effectiveness = await getRuleEffectiveness(organizationId, startTime, endTime);
    res.json({ rules: effectiveness });
  } catch (error) {
    logger.error({ error }, 'Failed to get rule effectiveness');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
