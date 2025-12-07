/**
 * SOP API Routes (T083-T086)
 * Endpoints for SOP generation and management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSopService } from '../../services/sop/sop.service.js';
import { logger } from '../../lib/logger.js';
import type { SopDraftStatus } from '@prisma/client';

/**
 * Request body types
 */
interface GenerateSopBody {
  processId: string;
  options?: {
    detailLevel?: 'summary' | 'standard' | 'detailed';
    focusAreas?: string[];
    includeDecisions?: boolean;
    includeQualityChecks?: boolean;
    customInstructions?: string;
  };
}

interface UpdateSopBody {
  title?: string;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: SopDraftStatus;
}

interface ReviewBody {
  action: 'approve' | 'reject';
  comments?: string;
}

/**
 * Register SOP routes
 */
export async function sopRoutes(fastify: FastifyInstance): Promise<void> {
  const sopService = getSopService();

  /**
   * Generate SOP for a process
   * POST /api/v1/sop/generate
   */
  fastify.post(
    '/generate',
    async (request: FastifyRequest<{ Body: GenerateSopBody }>, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
        const { processId, options } = request.body;

        const sop = await sopService.generateSop({
          processId,
          tenantId,
          options,
        });

        return reply.status(201).send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate SOP');
        return reply.status(500).send({
          success: false,
          error: 'Failed to generate SOP',
        });
      }
    }
  );

  /**
   * Get SOP by ID
   * GET /api/v1/sop/:id
   */
  fastify.get(
    '/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const sop = await sopService.getDraft(id);

        if (!sop) {
          return reply.status(404).send({
            success: false,
            error: 'SOP not found',
          });
        }

        return reply.send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get SOP');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get SOP',
        });
      }
    }
  );

  /**
   * Get SOPs for a process
   * GET /api/v1/sop/process/:processId
   */
  fastify.get(
    '/process/:processId',
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { processId } = request.params;
        const sops = await sopService.getSopsForProcess(processId);

        return reply.send({
          success: true,
          data: sops,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get SOPs for process');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get SOPs for process',
        });
      }
    }
  );

  /**
   * Update SOP draft
   * PATCH /api/v1/sop/:id
   */
  fastify.patch(
    '/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateSopBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const sop = await sopService.updateDraft(id, request.body);

        if (!sop) {
          return reply.status(404).send({
            success: false,
            error: 'SOP not found',
          });
        }

        return reply.send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update SOP');
        return reply.status(500).send({
          success: false,
          error: 'Failed to update SOP',
        });
      }
    }
  );

  /**
   * Submit SOP for review
   * POST /api/v1/sop/:id/submit
   */
  fastify.post(
    '/:id/submit',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const userId = (request as any).userId || 'system';

        const sop = await sopService.submitForReview(id, userId);

        if (!sop) {
          return reply.status(404).send({
            success: false,
            error: 'SOP not found',
          });
        }

        return reply.send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to submit SOP for review');
        return reply.status(500).send({
          success: false,
          error: 'Failed to submit SOP for review',
        });
      }
    }
  );

  /**
   * Review SOP (approve/reject)
   * POST /api/v1/sop/:id/review
   */
  fastify.post(
    '/:id/review',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: ReviewBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { action, comments } = request.body;
        const userId = (request as any).userId || 'system';

        let sop;
        if (action === 'approve') {
          sop = await sopService.approveDraft(id, userId, comments);
        } else {
          sop = await sopService.rejectDraft(id, userId, comments || 'Rejected');
        }

        if (!sop) {
          return reply.status(404).send({
            success: false,
            error: 'SOP not found',
          });
        }

        return reply.send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to review SOP');
        return reply.status(500).send({
          success: false,
          error: 'Failed to review SOP',
        });
      }
    }
  );

  /**
   * Publish approved SOP
   * POST /api/v1/sop/:id/publish
   */
  fastify.post(
    '/:id/publish',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const sop = await sopService.publishDraft(id);

        if (!sop) {
          return reply.status(400).send({
            success: false,
            error: 'SOP not found or not approved',
          });
        }

        return reply.send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to publish SOP');
        return reply.status(500).send({
          success: false,
          error: 'Failed to publish SOP',
        });
      }
    }
  );

  /**
   * Create new version of SOP
   * POST /api/v1/sop/:id/version
   */
  fastify.post(
    '/:id/version',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { versionType?: 'major' | 'minor' | 'patch' };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { versionType = 'minor' } = request.body;

        const sop = await sopService.createNewVersion(id, versionType);

        if (!sop) {
          return reply.status(404).send({
            success: false,
            error: 'SOP not found',
          });
        }

        return reply.status(201).send({
          success: true,
          data: sop,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create new SOP version');
        return reply.status(500).send({
          success: false,
          error: 'Failed to create new SOP version',
        });
      }
    }
  );

  /**
   * Get SOP completeness score
   * GET /api/v1/sop/:id/completeness
   */
  fastify.get(
    '/:id/completeness',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const sop = await sopService.getDraft(id);

        if (!sop) {
          return reply.status(404).send({
            success: false,
            error: 'SOP not found',
          });
        }

        const { calculateCompletenessScore, validateSopContent } = await import(
          '../../models/SopDraft.js'
        );

        const score = calculateCompletenessScore(sop.content);
        const validationErrors = validateSopContent(sop.content);

        return reply.send({
          success: true,
          data: {
            score,
            maxScore: 100,
            percentage: score,
            validationErrors,
            isComplete: validationErrors.length === 0,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to calculate SOP completeness');
        return reply.status(500).send({
          success: false,
          error: 'Failed to calculate SOP completeness',
        });
      }
    }
  );
}

export default sopRoutes;
