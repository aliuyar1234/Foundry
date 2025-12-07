/**
 * Optimization API Routes (T098-T101)
 * Endpoints for process optimization
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getOptimizationService } from '../../services/optimization/optimization.service.js';
import { logger } from '../../lib/logger.js';
import type { OptimizationType, SuggestionStatus } from '@prisma/client';

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
   */
  fastify.post(
    '/detect',
    async (
      request: FastifyRequest<{ Body: DetectOptimizationsBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: QueryOptimizationsQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/:id',
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
   */
  fastify.patch(
    '/:id',
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
   */
  fastify.post(
    '/:id/approve',
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
   */
  fastify.post(
    '/:id/reject',
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
   */
  fastify.post(
    '/:id/implement',
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
   */
  fastify.get(
    '/process/:processId/summary',
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
