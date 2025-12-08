/**
 * Decision API Routes (T067-T070)
 * Endpoints for decision archaeology
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDecisionService } from '../../services/decision/decision.service.js';
import { logger } from '../../lib/logger.js';
import type { DecisionStatus } from '@prisma/client';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const decisionStatusEnum = ['DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'DEPRECATED'];

const createDecisionSchema = {
  type: 'object',
  required: ['title', 'description', 'sourceType'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    description: { type: 'string', minLength: 1, maxLength: 10000 },
    context: { type: 'string', maxLength: 10000 },
    alternatives: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        required: ['title', 'description', 'pros', 'cons', 'wasChosen'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 500 },
          description: { type: 'string', maxLength: 5000 },
          pros: { type: 'array', items: { type: 'string', maxLength: 1000 }, maxItems: 20 },
          cons: { type: 'array', items: { type: 'string', maxLength: 1000 }, maxItems: 20 },
          wasChosen: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    outcome: { type: 'string', maxLength: 10000 },
    rationale: { type: 'string', maxLength: 10000 },
    status: { type: 'string', enum: decisionStatusEnum },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    sourceType: { type: 'string', minLength: 1, maxLength: 100 },
    sourceId: { type: 'string', maxLength: 100 },
    decisionMakers: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
    stakeholders: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 100 },
    impactAreas: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
    tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 50 },
    decisionDate: { type: 'string', format: 'date-time' },
    effectiveDate: { type: 'string', format: 'date-time' },
    reviewDate: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
} as const;

const updateDecisionSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    description: { type: 'string', minLength: 1, maxLength: 10000 },
    context: { type: 'string', maxLength: 10000 },
    outcome: { type: 'string', maxLength: 10000 },
    rationale: { type: 'string', maxLength: 10000 },
    status: { type: 'string', enum: decisionStatusEnum },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    decisionMakers: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
    stakeholders: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 100 },
    impactAreas: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
    tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 50 },
  },
  additionalProperties: false,
} as const;

const extractDecisionsSchema = {
  type: 'object',
  required: ['text', 'sourceType'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 100000 },
    sourceType: { type: 'string', minLength: 1, maxLength: 100 },
    sourceId: { type: 'string', maxLength: 100 },
    autoCreate: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

const rejectDecisionSchema = {
  type: 'object',
  required: ['reason'],
  properties: {
    reason: { type: 'string', minLength: 1, maxLength: 5000 },
  },
  additionalProperties: false,
} as const;

const idParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const queryDecisionsSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: decisionStatusEnum },
    sourceType: { type: 'string', maxLength: 100 },
    decisionMaker: { type: 'string', maxLength: 100 },
    impactArea: { type: 'string', maxLength: 100 },
    tag: { type: 'string', maxLength: 50 },
    minConfidence: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
    startDate: { type: 'string', format: 'date-time' },
    endDate: { type: 'string', format: 'date-time' },
    searchText: { type: 'string', maxLength: 500 },
    limit: { type: 'string', pattern: '^[0-9]+$' },
    offset: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

const timelineQuerySchema = {
  type: 'object',
  properties: {
    startDate: { type: 'string', format: 'date-time' },
    endDate: { type: 'string', format: 'date-time' },
    limit: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

const relatedQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

/**
 * Request body types
 */
interface CreateDecisionBody {
  title: string;
  description: string;
  context?: string;
  alternatives?: Array<{
    title: string;
    description: string;
    pros: string[];
    cons: string[];
    wasChosen: boolean;
  }>;
  outcome?: string;
  rationale?: string;
  status?: DecisionStatus;
  confidence?: number;
  sourceType: string;
  sourceId?: string;
  decisionMakers?: string[];
  stakeholders?: string[];
  impactAreas?: string[];
  tags?: string[];
  decisionDate?: string;
  effectiveDate?: string;
  reviewDate?: string;
}

interface UpdateDecisionBody {
  title?: string;
  description?: string;
  context?: string;
  outcome?: string;
  rationale?: string;
  status?: DecisionStatus;
  confidence?: number;
  decisionMakers?: string[];
  stakeholders?: string[];
  impactAreas?: string[];
  tags?: string[];
}

interface ExtractDecisionsBody {
  text: string;
  sourceType: string;
  sourceId?: string;
  autoCreate?: boolean;
}

interface QueryDecisionsQuery {
  status?: DecisionStatus;
  sourceType?: string;
  decisionMaker?: string;
  impactArea?: string;
  tag?: string;
  minConfidence?: string;
  startDate?: string;
  endDate?: string;
  searchText?: string;
  limit?: string;
  offset?: string;
}

/**
 * Register decision routes
 */
export async function decisionRoutes(fastify: FastifyInstance): Promise<void> {
  const decisionService = getDecisionService();

  /**
   * Create a new decision
   * POST /api/v1/decisions
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/',
    {
      schema: { body: createDecisionSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (request: FastifyRequest<{ Body: CreateDecisionBody }>, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);
        const body = request.body;

        const decision = await decisionService.createDecision({
          tenantId,
          title: body.title,
          description: body.description,
          context: body.context,
          alternatives: body.alternatives?.map((a, i) => ({
            id: `alt-${i}`,
            ...a,
          })),
          outcome: body.outcome,
          rationale: body.rationale,
          status: body.status,
          confidence: body.confidence,
          sourceType: body.sourceType,
          sourceId: body.sourceId,
          decisionMakers: body.decisionMakers,
          stakeholders: body.stakeholders,
          impactAreas: body.impactAreas,
          tags: body.tags,
          decisionDate: body.decisionDate ? new Date(body.decisionDate) : undefined,
          effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
          reviewDate: body.reviewDate ? new Date(body.reviewDate) : undefined,
        });

        return reply.status(201).send({
          success: true,
          data: decision,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create decision');
        return reply.status(500).send({
          success: false,
          error: 'Failed to create decision',
        });
      }
    }
  );

  /**
   * Query decisions
   * GET /api/v1/decisions
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/',
    {
      schema: { querystring: queryDecisionsSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Querystring: QueryDecisionsQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const query = request.query;

        const { decisions, total } = await decisionService.queryDecisions(
          {
            tenantId,
            status: query.status,
            sourceType: query.sourceType,
            decisionMaker: query.decisionMaker,
            impactArea: query.impactArea,
            tag: query.tag,
            minConfidence: query.minConfidence ? parseFloat(query.minConfidence) : undefined,
            startDate: query.startDate ? new Date(query.startDate) : undefined,
            endDate: query.endDate ? new Date(query.endDate) : undefined,
            searchText: query.searchText,
          },
          {
            limit: query.limit ? parseInt(query.limit, 10) : 50,
            offset: query.offset ? parseInt(query.offset, 10) : 0,
          }
        );

        return reply.send({
          success: true,
          data: { decisions, total },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to query decisions');
        return reply.status(500).send({
          success: false,
          error: 'Failed to query decisions',
        });
      }
    }
  );

  /**
   * Get decision by ID
   * GET /api/v1/decisions/:id
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/:id',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const decision = await decisionService.getDecision(id);

        if (!decision) {
          return reply.status(404).send({
            success: false,
            error: 'Decision not found',
          });
        }

        return reply.send({
          success: true,
          data: decision,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get decision');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get decision',
        });
      }
    }
  );

  /**
   * Update a decision
   * PATCH /api/v1/decisions/:id
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.patch(
    '/:id',
    {
      schema: { params: idParamSchema, body: updateDecisionSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateDecisionBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const decision = await decisionService.updateDecision(id, request.body);

        if (!decision) {
          return reply.status(404).send({
            success: false,
            error: 'Decision not found',
          });
        }

        return reply.send({
          success: true,
          data: decision,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update decision');
        return reply.status(500).send({
          success: false,
          error: 'Failed to update decision',
        });
      }
    }
  );

  /**
   * Extract decisions from text
   * POST /api/v1/decisions/extract
   * Requires: discovery.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/extract',
    {
      schema: { body: extractDecisionsSchema },
      preHandler: [requirePermission('discovery', 'create')],
    },
    async (
      request: FastifyRequest<{ Body: ExtractDecisionsBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { text, sourceType, sourceId, autoCreate = false } = request.body;

        const extracted = await decisionService.extractDecisions(
          text,
          sourceType,
          sourceId || '',
          tenantId
        );

        let created = [];
        if (autoCreate && extracted.length > 0) {
          created = await decisionService.createFromExtraction(
            extracted,
            sourceType,
            sourceId || '',
            tenantId
          );
        }

        return reply.send({
          success: true,
          data: {
            extracted,
            created: autoCreate ? created : undefined,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to extract decisions');
        return reply.status(500).send({
          success: false,
          error: 'Failed to extract decisions',
        });
      }
    }
  );

  /**
   * Get decision impact analysis
   * GET /api/v1/decisions/:id/impact
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/:id/impact',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const analysis = await decisionService.analyzeImpact(id);

        if (!analysis) {
          return reply.status(404).send({
            success: false,
            error: 'Decision not found or analysis failed',
          });
        }

        return reply.send({
          success: true,
          data: analysis,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to analyze decision impact');
        return reply.status(500).send({
          success: false,
          error: 'Failed to analyze decision impact',
        });
      }
    }
  );

  /**
   * Get decision timeline
   * GET /api/v1/decisions/timeline
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/timeline',
    {
      schema: { querystring: timelineQuerySchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{
        Querystring: { startDate?: string; endDate?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { startDate, endDate, limit } = request.query;

        const timeline = await decisionService.getTimeline(tenantId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          limit: limit ? parseInt(limit, 10) : 100,
        });

        return reply.send({
          success: true,
          data: timeline,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get decision timeline');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get decision timeline',
        });
      }
    }
  );

  /**
   * Get related decisions
   * GET /api/v1/decisions/:id/related
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/:id/related',
    {
      schema: { params: idParamSchema, querystring: relatedQuerySchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { limit } = request.query;

        const related = await decisionService.findRelatedDecisions(
          id,
          limit ? parseInt(limit, 10) : 5
        );

        return reply.send({
          success: true,
          data: related,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to find related decisions');
        return reply.status(500).send({
          success: false,
          error: 'Failed to find related decisions',
        });
      }
    }
  );

  /**
   * Approve a decision
   * POST /api/v1/decisions/:id/approve
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/approve',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const userId = (request as any).userId || 'system';

        const decision = await decisionService.approveDecision(id, userId);

        if (!decision) {
          return reply.status(404).send({
            success: false,
            error: 'Decision not found',
          });
        }

        return reply.send({
          success: true,
          data: decision,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to approve decision');
        return reply.status(500).send({
          success: false,
          error: 'Failed to approve decision',
        });
      }
    }
  );

  /**
   * Reject a decision
   * POST /api/v1/decisions/:id/reject
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/reject',
    {
      schema: { params: idParamSchema, body: rejectDecisionSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { reason } = request.body;

        const decision = await decisionService.rejectDecision(id, reason);

        if (!decision) {
          return reply.status(404).send({
            success: false,
            error: 'Decision not found',
          });
        }

        return reply.send({
          success: true,
          data: decision,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to reject decision');
        return reply.status(500).send({
          success: false,
          error: 'Failed to reject decision',
        });
      }
    }
  );
}

export default decisionRoutes;
