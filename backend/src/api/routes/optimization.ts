/**
 * Optimization API Routes (T098-T101)
 * Endpoints for process optimization
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getOptimizationService } from '../../services/optimization/optimization.service.js';
import { logger } from '../../lib/logger.js';
import type { OptimizationType, SuggestionStatus } from '@prisma/client';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const optimizationTypeEnum = ['BOTTLENECK', 'AUTOMATION', 'RESOURCE', 'WORKFLOW', 'COMPLIANCE', 'QUALITY'];
const suggestionStatusEnum = ['PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'ARCHIVED'];

const detectOptimizationsSchema = {
  type: 'object',
  required: ['processId'],
  properties: {
    processId: { type: 'string', minLength: 1, maxLength: 100 },
    options: {
      type: 'object',
      properties: {
        types: { type: 'array', items: { type: 'string', enum: optimizationTypeEnum }, maxItems: 10 },
        minConfidence: { type: 'number', minimum: 0, maximum: 1 },
        includeImplementationPlan: { type: 'boolean' },
        customCriteria: { type: 'string', maxLength: 2000 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const updateSuggestionSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: suggestionStatusEnum },
    title: { type: 'string', minLength: 1, maxLength: 500 },
    description: { type: 'string', maxLength: 5000 },
    priority: { type: 'integer', minimum: 1, maximum: 10 },
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

const processIdParamSchema = {
  type: 'object',
  required: ['processId'],
  properties: {
    processId: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const queryOptimizationsSchema = {
  type: 'object',
  properties: {
    processId: { type: 'string', maxLength: 100 },
    type: { type: 'string', enum: optimizationTypeEnum },
    status: { type: 'string', enum: suggestionStatusEnum },
    minPriority: { type: 'string', pattern: '^[0-9]+$' },
    minConfidence: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
    limit: { type: 'string', pattern: '^[0-9]+$' },
    offset: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

/**
 * Request body types
 */
interface DetectOptimizationsBody {
  processId: string;
  options?: {
    types?: OptimizationType[];
    minConfidence?: number;
    includeImplementationPlan?: boolean;
    customCriteria?: string;
  };
}

interface UpdateSuggestionBody {
  status?: SuggestionStatus;
  title?: string;
  description?: string;
  priority?: number;
}

interface QueryOptimizationsQuery {
  processId?: string;
  type?: OptimizationType;
  status?: SuggestionStatus;
  minPriority?: string;
  minConfidence?: string;
  limit?: string;
  offset?: string;
}

/**
 * Register optimization routes
 */
export async function optimizationRoutes(fastify: FastifyInstance): Promise<void> {
  const optimizationService = getOptimizationService();

  /**
   * Detect optimization opportunities
   * POST /api/v1/optimization/detect
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/detect',
    {
      schema: { body: detectOptimizationsSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (
      request: FastifyRequest<{ Body: DetectOptimizationsBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { processId, options } = request.body;

        const suggestions = await optimizationService.detectOptimizations({
          processId,
          tenantId,
          options,
        });

        return reply.send({
          success: true,
          data: suggestions,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to detect optimizations');
        return reply.status(500).send({
          success: false,
          error: 'Failed to detect optimizations',
        });
      }
    }
  );

  /**
   * Query optimization suggestions
   * GET /api/v1/optimization
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/',
    {
      schema: { querystring: queryOptimizationsSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Querystring: QueryOptimizationsQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const query = request.query;

        const { suggestions, total } = await optimizationService.querySuggestions(
          {
            tenantId,
            processId: query.processId,
            type: query.type,
            status: query.status,
            minPriority: query.minPriority ? parseInt(query.minPriority, 10) : undefined,
            minConfidence: query.minConfidence
              ? parseFloat(query.minConfidence)
              : undefined,
          },
          {
            limit: query.limit ? parseInt(query.limit, 10) : 50,
            offset: query.offset ? parseInt(query.offset, 10) : 0,
          }
        );

        return reply.send({
          success: true,
          data: { suggestions, total },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to query optimizations');
        return reply.status(500).send({
          success: false,
          error: 'Failed to query optimizations',
        });
      }
    }
  );

  /**
   * Get suggestion by ID
   * GET /api/v1/optimization/:id
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
        const suggestion = await optimizationService.getSuggestion(id);

        if (!suggestion) {
          return reply.status(404).send({
            success: false,
            error: 'Suggestion not found',
          });
        }

        return reply.send({
          success: true,
          data: suggestion,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get optimization suggestion');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get optimization suggestion',
        });
      }
    }
  );

  /**
   * Update suggestion
   * PATCH /api/v1/optimization/:id
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.patch(
    '/:id',
    {
      schema: { params: idParamSchema, body: updateSuggestionSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateSuggestionBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const suggestion = await optimizationService.updateSuggestion(id, request.body);

        if (!suggestion) {
          return reply.status(404).send({
            success: false,
            error: 'Suggestion not found',
          });
        }

        return reply.send({
          success: true,
          data: suggestion,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update optimization suggestion');
        return reply.status(500).send({
          success: false,
          error: 'Failed to update optimization suggestion',
        });
      }
    }
  );

  /**
   * Approve suggestion
   * POST /api/v1/optimization/:id/approve
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

        const suggestion = await optimizationService.approveSuggestion(id, userId);

        if (!suggestion) {
          return reply.status(404).send({
            success: false,
            error: 'Suggestion not found',
          });
        }

        return reply.send({
          success: true,
          data: suggestion,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to approve optimization suggestion');
        return reply.status(500).send({
          success: false,
          error: 'Failed to approve optimization suggestion',
        });
      }
    }
  );

  /**
   * Reject suggestion
   * POST /api/v1/optimization/:id/reject
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/reject',
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

        const suggestion = await optimizationService.rejectSuggestion(id, userId);

        if (!suggestion) {
          return reply.status(404).send({
            success: false,
            error: 'Suggestion not found',
          });
        }

        return reply.send({
          success: true,
          data: suggestion,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to reject optimization suggestion');
        return reply.status(500).send({
          success: false,
          error: 'Failed to reject optimization suggestion',
        });
      }
    }
  );

  /**
   * Mark suggestion as implemented
   * POST /api/v1/optimization/:id/implement
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/implement',
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
        const suggestion = await optimizationService.markImplemented(id);

        if (!suggestion) {
          return reply.status(404).send({
            success: false,
            error: 'Suggestion not found',
          });
        }

        return reply.send({
          success: true,
          data: suggestion,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to mark optimization as implemented');
        return reply.status(500).send({
          success: false,
          error: 'Failed to mark optimization as implemented',
        });
      }
    }
  );

  /**
   * Get optimization summary for a process
   * GET /api/v1/optimization/process/:processId/summary
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/process/:processId/summary',
    {
      schema: { params: processIdParamSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { processId } = request.params;

        const { suggestions } = await optimizationService.querySuggestions({
          tenantId,
          processId,
        });

        const { groupByType } = await import('../../models/OptimizationSuggestion.js');
        const byType = groupByType(suggestions);

        const summary = {
          total: suggestions.length,
          byStatus: {
            pending: suggestions.filter((s) => s.status === 'PENDING').length,
            approved: suggestions.filter((s) => s.status === 'APPROVED').length,
            rejected: suggestions.filter((s) => s.status === 'REJECTED').length,
            implemented: suggestions.filter((s) => s.status === 'IMPLEMENTED').length,
          },
          byType: Object.entries(byType).map(([type, items]) => ({
            type,
            count: items.length,
            avgPriority:
              items.reduce((acc, s) => acc + s.priority, 0) / items.length || 0,
          })),
          topPriority: suggestions
            .filter((s) => s.status === 'PENDING')
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 5),
        };

        return reply.send({
          success: true,
          data: summary,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get optimization summary');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get optimization summary',
        });
      }
    }
  );
}

export default optimizationRoutes;
