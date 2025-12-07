/**
 * SOP API Routes
 * Standard Operating Procedure management endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import {
  SOPService,
  createSOPService,
  SOPStatus,
  VersionManager,
  createVersionManager,
  DeviationDetector,
  createDeviationDetector,
  SOPGenerationOptions,
} from '../../services/reporting/sop/index.js';
import { exportToPDF, exportToDOCX } from '../../services/export/index.js';

// Validation schemas
const sopStatusSchema = z.enum(['draft', 'review', 'approved', 'published', 'archived']);

const sopGenerationOptionsSchema = z.object({
  language: z.enum(['en', 'de']).default('en'),
  style: z.enum(['formal', 'conversational']).default('formal'),
  detailLevel: z.enum(['brief', 'standard', 'detailed']).default('standard'),
  includeFlowchart: z.boolean().default(false),
  includeCheckboxes: z.boolean().default(true),
  includeTimelines: z.boolean().default(true),
  targetAudience: z.string().optional(),
  companyName: z.string().optional(),
  department: z.string().optional(),
});

const createSOPSchema = z.object({
  processId: z.string().uuid(),
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  language: z.string().default('en'),
  status: sopStatusSchema.default('draft'),
  metadata: z.record(z.unknown()).optional(),
});

const updateSOPSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  status: sopStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  changeNotes: z.string().optional(),
});

const querySOPsSchema = z.object({
  processIds: z.array(z.string().uuid()).optional(),
  statuses: z.array(sopStatusSchema).optional(),
  languages: z.array(z.string()).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const generateSOPSchema = z.object({
  processId: z.string().uuid(),
  options: sopGenerationOptionsSchema.optional(),
});

const exportSOPSchema = z.object({
  format: z.enum(['pdf', 'docx', 'markdown']),
  includeMetadata: z.boolean().default(false),
  includeVersionHistory: z.boolean().default(false),
});

export default async function sopRoutes(fastify: FastifyInstance): Promise<void> {
  const sopService = createSOPService();
  const versionManager = createVersionManager();
  const deviationDetector = createDeviationDetector();

  // Get SOP generation queue
  const sopQueue = new Queue('sop-generation', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  });

  /**
   * GET /organizations/:organizationId/sops
   * List SOPs with filtering
   */
  fastify.get<{
    Params: { organizationId: string };
    Querystring: z.infer<typeof querySOPsSchema>;
  }>(
    '/organizations/:organizationId/sops',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        querystring: querySOPsSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const options = querySOPsSchema.parse(request.query);

      const { data, total } = await sopService.querySOPs(organizationId, {
        processIds: options.processIds,
        statuses: options.statuses as SOPStatus[],
        languages: options.languages,
        search: options.search,
        limit: options.limit,
        offset: options.offset,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
      });

      return reply.send({
        data,
        pagination: {
          total,
          limit: options.limit,
          offset: options.offset,
          hasMore: options.offset + data.length < total,
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/sops/stats
   * Get SOP statistics
   */
  fastify.get<{
    Params: { organizationId: string };
  }>(
    '/organizations/:organizationId/sops/stats',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const stats = await sopService.getSOPStats(organizationId);
      return reply.send({ data: stats });
    }
  );

  /**
   * POST /organizations/:organizationId/sops
   * Create a new SOP manually
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: z.infer<typeof createSOPSchema>;
  }>(
    '/organizations/:organizationId/sops',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: createSOPSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const input = createSOPSchema.parse(request.body);
      const userId = (request as { userId?: string }).userId || 'system';

      const sop = await sopService.createSOP(organizationId, {
        processId: input.processId,
        title: input.title,
        content: input.content,
        language: input.language,
        status: input.status as SOPStatus,
        createdBy: userId,
        metadata: input.metadata,
      });

      return reply.status(201).send({ data: sop });
    }
  );

  /**
   * POST /organizations/:organizationId/sops/generate
   * Generate SOP from process (async job)
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: z.infer<typeof generateSOPSchema>;
  }>(
    '/organizations/:organizationId/sops/generate',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: generateSOPSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const input = generateSOPSchema.parse(request.body);
      const userId = (request as { userId?: string }).userId || 'system';

      // Queue generation job
      const job = await sopQueue.add('generate', {
        organizationId,
        processId: input.processId,
        userId,
        options: input.options || {},
      });

      return reply.status(202).send({
        data: {
          jobId: job.id,
          status: 'queued',
          message: 'SOP generation started',
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/sops/:sopId
   * Get SOP by ID
   */
  fastify.get<{
    Params: { organizationId: string; sopId: string };
    Querystring: { includeVersions?: boolean };
  }>(
    '/organizations/:organizationId/sops/:sopId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
        querystring: z.object({
          includeVersions: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;
      const { includeVersions } = request.query;

      const sop = await sopService.getSOP(organizationId, sopId, includeVersions);

      if (!sop) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SOP not found',
        });
      }

      return reply.send({ data: sop });
    }
  );

  /**
   * PUT /organizations/:organizationId/sops/:sopId
   * Update SOP
   */
  fastify.put<{
    Params: { organizationId: string; sopId: string };
    Body: z.infer<typeof updateSOPSchema>;
  }>(
    '/organizations/:organizationId/sops/:sopId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
        body: updateSOPSchema,
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;
      const input = updateSOPSchema.parse(request.body);
      const userId = (request as { userId?: string }).userId || 'system';

      const sop = await sopService.updateSOP(organizationId, sopId, {
        title: input.title,
        content: input.content,
        status: input.status as SOPStatus,
        metadata: input.metadata,
        updatedBy: userId,
        changeNotes: input.changeNotes,
      });

      return reply.send({ data: sop });
    }
  );

  /**
   * DELETE /organizations/:organizationId/sops/:sopId
   * Delete SOP
   */
  fastify.delete<{
    Params: { organizationId: string; sopId: string };
  }>(
    '/organizations/:organizationId/sops/:sopId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;

      await sopService.deleteSOP(organizationId, sopId);

      return reply.status(204).send();
    }
  );

  /**
   * PATCH /organizations/:organizationId/sops/:sopId/status
   * Update SOP status
   */
  fastify.patch<{
    Params: { organizationId: string; sopId: string };
    Body: { status: SOPStatus };
  }>(
    '/organizations/:organizationId/sops/:sopId/status',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
        body: z.object({ status: sopStatusSchema }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;
      const { status } = request.body;
      const userId = (request as { userId?: string }).userId || 'system';

      const sop = await sopService.updateStatus(organizationId, sopId, status, userId);

      return reply.send({ data: sop });
    }
  );

  /**
   * GET /organizations/:organizationId/sops/:sopId/versions
   * Get SOP version history
   */
  fastify.get<{
    Params: { organizationId: string; sopId: string };
  }>(
    '/organizations/:organizationId/sops/:sopId/versions',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;

      // Verify SOP exists
      const sop = await sopService.getSOP(organizationId, sopId);
      if (!sop) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SOP not found',
        });
      }

      const versions = await versionManager.getVersionHistory(sopId);

      return reply.send({ data: versions });
    }
  );

  /**
   * GET /organizations/:organizationId/sops/:sopId/versions/:versionId
   * Get specific version
   */
  fastify.get<{
    Params: { organizationId: string; sopId: string; versionId: string };
  }>(
    '/organizations/:organizationId/sops/:sopId/versions/:versionId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
          versionId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId, versionId } = request.params;

      const version = await sopService.getSOPVersion(organizationId, sopId, versionId);

      if (!version) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Version not found',
        });
      }

      return reply.send({ data: version });
    }
  );

  /**
   * POST /organizations/:organizationId/sops/:sopId/versions/:versionId/restore
   * Restore a previous version
   */
  fastify.post<{
    Params: { organizationId: string; sopId: string; versionId: string };
  }>(
    '/organizations/:organizationId/sops/:sopId/versions/:versionId/restore',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
          versionId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId, versionId } = request.params;
      const userId = (request as { userId?: string }).userId || 'system';

      const sop = await sopService.restoreVersion(organizationId, sopId, versionId, userId);

      return reply.send({ data: sop });
    }
  );

  /**
   * GET /organizations/:organizationId/sops/:sopId/versions/compare
   * Compare two versions
   */
  fastify.get<{
    Params: { organizationId: string; sopId: string };
    Querystring: { from: string; to: string };
  }>(
    '/organizations/:organizationId/sops/:sopId/versions/compare',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
        querystring: z.object({
          from: z.string().uuid(),
          to: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { sopId } = request.params;
      const { from, to } = request.query;

      const comparison = await versionManager.compareVersions(sopId, from, to);

      return reply.send({ data: comparison });
    }
  );

  /**
   * POST /organizations/:organizationId/sops/:sopId/export
   * Export SOP to file format
   */
  fastify.post<{
    Params: { organizationId: string; sopId: string };
    Body: z.infer<typeof exportSOPSchema>;
  }>(
    '/organizations/:organizationId/sops/:sopId/export',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
        body: exportSOPSchema,
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;
      const { format, includeMetadata, includeVersionHistory } = exportSOPSchema.parse(request.body);

      const sop = await sopService.getSOP(organizationId, sopId, includeVersionHistory);

      if (!sop) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SOP not found',
        });
      }

      let exportResult: { content: Buffer | string; mimeType: string; filename: string };

      switch (format) {
        case 'pdf':
          exportResult = await exportToPDF(sop, { includeMetadata, includeVersionHistory });
          break;
        case 'docx':
          exportResult = await exportToDOCX(sop, { includeMetadata, includeVersionHistory });
          break;
        case 'markdown':
        default:
          exportResult = {
            content: sop.content,
            mimeType: 'text/markdown',
            filename: `${sop.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`,
          };
          break;
      }

      return reply
        .header('Content-Type', exportResult.mimeType)
        .header('Content-Disposition', `attachment; filename="${exportResult.filename}"`)
        .send(exportResult.content);
    }
  );

  /**
   * GET /organizations/:organizationId/sops/:sopId/deviations
   * Detect deviations between SOP and current process
   */
  fastify.get<{
    Params: { organizationId: string; sopId: string };
  }>(
    '/organizations/:organizationId/sops/:sopId/deviations',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, sopId } = request.params;

      // Get SOP
      const sop = await sopService.getSOP(organizationId, sopId);
      if (!sop) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SOP not found',
        });
      }

      // Get current process data from the linked process
      // This would need to be fetched from the discovery service
      // For now, return a placeholder response
      return reply.send({
        data: {
          sopId,
          message: 'Deviation detection requires current process data',
          hint: 'Use POST /deviations with process data to run deviation analysis',
        },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/sops/:sopId/deviations
   * Run deviation analysis with provided process data
   */
  fastify.post<{
    Params: { organizationId: string; sopId: string };
    Body: { processData: Record<string, unknown> };
  }>(
    '/organizations/:organizationId/sops/:sopId/deviations',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          sopId: z.string().uuid(),
        }),
        body: z.object({
          processData: z.record(z.unknown()),
        }),
      },
    },
    async (request, reply) => {
      const { sopId } = request.params;
      const { processData } = request.body;

      const report = await deviationDetector.detectDeviations(
        sopId,
        processData as unknown as import('../../services/reporting/sop/inputFormatter.js').ProcessData
      );

      return reply.send({ data: report });
    }
  );

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await sopQueue.close();
  });
}
