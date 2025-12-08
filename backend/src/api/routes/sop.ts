/**
 * SOP API Routes (T083-T086)
 * Endpoints for SOP generation and management
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSopService } from '../../services/sop/sop.service.js';
import { logger } from '../../lib/logger.js';
import type { SopDraftStatus } from '@prisma/client';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const sopDraftStatusEnum = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];

const generateSopSchema = {
  type: 'object',
  required: ['processId'],
  properties: {
    processId: { type: 'string', minLength: 1, maxLength: 100 },
    options: {
      type: 'object',
      properties: {
        detailLevel: { type: 'string', enum: ['summary', 'standard', 'detailed'] },
        focusAreas: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 20 },
        includeDecisions: { type: 'boolean' },
        includeQualityChecks: { type: 'boolean' },
        customInstructions: { type: 'string', maxLength: 5000 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const updateSopSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    content: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
    status: { type: 'string', enum: sopDraftStatusEnum },
  },
  additionalProperties: false,
} as const;

const reviewSchema = {
  type: 'object',
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['approve', 'reject'] },
    comments: { type: 'string', maxLength: 5000 },
  },
  additionalProperties: false,
} as const;

const versionSchema = {
  type: 'object',
  properties: {
    versionType: { type: 'string', enum: ['major', 'minor', 'patch'], default: 'minor' },
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

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

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
   * Requires: sop.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/generate',
    {
      schema: { body: generateSopSchema },
      preHandler: [requirePermission('sop', 'create')],
    },
    async (request: FastifyRequest<{ Body: GenerateSopBody }>, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);
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
   * Requires: sop.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/:id',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('sop', 'read')],
    },
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
   * Requires: sop.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/process/:processId',
    {
      schema: { params: processIdParamSchema },
      preHandler: [requirePermission('sop', 'read')],
    },
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
   * Requires: sop.update permission (ANALYST role minimum)
   */
  fastify.patch(
    '/:id',
    {
      schema: { params: idParamSchema, body: updateSopSchema },
      preHandler: [requirePermission('sop', 'update')],
    },
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
   * Requires: sop.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/submit',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('sop', 'update')],
    },
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
   * Requires: sop.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/review',
    {
      schema: { params: idParamSchema, body: reviewSchema },
      preHandler: [requirePermission('sop', 'update')],
    },
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
   * Requires: sop.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/publish',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('sop', 'update')],
    },
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
   * Requires: sop.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/:id/version',
    {
      schema: { params: idParamSchema, body: versionSchema },
      preHandler: [requirePermission('sop', 'create')],
    },
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
   * Requires: sop.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/:id/completeness',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('sop', 'read')],
    },
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
