/**
 * Vector Index API Routes (T028)
 * Endpoints for managing vector indices and embeddings
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 * Organization/tenant context is automatically set from authenticated user's JWT claims
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getQdrantService } from '../../services/vector/qdrant.service.js';
import { getEmbeddingService } from '../../services/vector/embedding.service.js';
import {
  queueDocumentEmbedding,
  queueBatchEmbedding,
  queueReindex,
  getEmbeddingJobStatus,
} from '../../jobs/embedding.job.js';
import { QDRANT_COLLECTIONS } from '../../lib/qdrant.js';
import { logger } from '../../lib/logger.js';
import type { SourceDocument } from '../../models/Embedding.js';
import { SourceType } from '../../models/Embedding.js';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// Default pagination limits
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const createIndexSchema = {
  type: 'object',
  required: ['name', 'embeddingModel', 'dimensions'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
    embeddingModel: { type: 'string', minLength: 1, maxLength: 100 },
    dimensions: { type: 'integer', minimum: 1, maximum: 4096 },
  },
  additionalProperties: false,
} as const;

const embedDocumentSchema = {
  type: 'object',
  required: ['id', 'type', 'content'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 100 },
    type: { type: 'string', enum: ['document', 'email', 'message', 'meeting'] },
    content: { type: 'string', minLength: 1, maxLength: 1000000 }, // 1MB max
    metadata: { type: 'object', additionalProperties: true },
  },
  additionalProperties: false,
} as const;

const embedBatchSchema = {
  type: 'object',
  required: ['documents'],
  properties: {
    documents: {
      type: 'array',
      minItems: 1,
      maxItems: 100, // Limit batch size
      items: {
        type: 'object',
        required: ['id', 'type', 'content'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100 },
          type: { type: 'string', enum: ['document', 'email', 'message', 'meeting'] },
          content: { type: 'string', minLength: 1, maxLength: 100000 }, // 100KB per doc in batch
          metadata: { type: 'object', additionalProperties: true },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

const reindexSchema = {
  type: 'object',
  required: ['indexId', 'newModel', 'newDimensions'],
  properties: {
    indexId: { type: 'string', minLength: 1, maxLength: 100 },
    newModel: { type: 'string', minLength: 1, maxLength: 100 },
    newDimensions: { type: 'integer', minimum: 1, maximum: 4096 },
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

const sourceIdParamSchema = {
  type: 'object',
  required: ['sourceId'],
  properties: {
    sourceId: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const jobIdParamSchema = {
  type: 'object',
  required: ['jobId'],
  properties: {
    jobId: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const paginationQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'string', pattern: '^[0-9]+$' },
    pageSize: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

interface CreateIndexBody {
  name: string;
  embeddingModel: string;
  dimensions: number;
}

interface EmbedDocumentBody {
  id: string;
  type: SourceType;
  content: string;
  metadata?: Record<string, unknown>;
}

interface EmbedBatchBody {
  documents: EmbedDocumentBody[];
}

interface ReindexBody {
  indexId: string;
  newModel: string;
  newDimensions: number;
}

/**
 * Register embedding routes
 */
export async function embeddingRoutes(fastify: FastifyInstance): Promise<void> {
  const qdrantService = getQdrantService();
  const embeddingService = getEmbeddingService();

  /**
   * List all vector indices
   * GET /api/v1/embeddings/indices
   * Requires: dataSource.read permission (VIEWER role minimum)
   */
  fastify.get('/indices', { preHandler: [requirePermission('dataSource', 'read')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const indices = await prisma.vectorIndex.findMany({
        orderBy: { createdAt: 'desc' },
      });

      // Get vector counts from Qdrant
      const indicesWithStats = await Promise.all(
        indices.map(async (index) => {
          try {
            const info = await qdrantService.getCollectionInfo(index.name);
            return {
              ...index,
              vectorCount: info.vectorCount,
              qdrantStatus: info.status,
            };
          } catch {
            return {
              ...index,
              vectorCount: 0,
              qdrantStatus: 'unknown',
            };
          }
        })
      );

      return reply.send({
        success: true,
        data: indicesWithStats,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list indices');
      return reply.status(500).send({
        success: false,
        error: 'Failed to list indices',
      });
    }
  });

  /**
   * Get a single vector index
   * GET /api/v1/embeddings/indices/:id
   * Requires: dataSource.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/indices/:id',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('dataSource', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;

        const index = await prisma.vectorIndex.findUnique({
          where: { id },
          include: {
            _count: {
              select: { embeddings: true },
            },
          },
        });

        if (!index) {
          return reply.status(404).send({
            success: false,
            error: 'Index not found',
          });
        }

        return reply.send({
          success: true,
          data: {
            ...index,
            embeddingsCount: index._count.embeddings,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get index');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get index',
        });
      }
    }
  );

  /**
   * Create a new vector index
   * POST /api/v1/embeddings/indices
   * Requires: dataSource.create permission (ADMIN role minimum)
   */
  fastify.post(
    '/indices',
    {
      schema: { body: createIndexSchema },
      preHandler: [requirePermission('dataSource', 'create')],
    },
    async (
      request: FastifyRequest<{ Body: CreateIndexBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, embeddingModel, dimensions } = request.body;

        // Schema validation handles required check

        // Check if index already exists
        const existing = await prisma.vectorIndex.findUnique({
          where: { name },
        });

        if (existing) {
          return reply.status(409).send({
            success: false,
            error: 'Index with this name already exists',
          });
        }

        // Create index
        const index = await prisma.vectorIndex.create({
          data: {
            name,
            embeddingModel,
            dimensions,
            status: 'ACTIVE',
          },
        });

        logger.info({ indexId: index.id, name }, 'Vector index created');

        return reply.status(201).send({
          success: true,
          data: index,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create index');
        return reply.status(500).send({
          success: false,
          error: 'Failed to create index',
        });
      }
    }
  );

  /**
   * Embed a single document
   * POST /api/v1/embeddings/embed
   * Requires: dataSource.update permission (ADMIN role minimum)
   */
  fastify.post(
    '/embed',
    {
      schema: { body: embedDocumentSchema },
      preHandler: [requirePermission('dataSource', 'update')],
    },
    async (
      request: FastifyRequest<{ Body: EmbedDocumentBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id, type, content, metadata } = request.body;
        const tenantId = getOrganizationId(request);

        // Schema validation handles required check

        const document: SourceDocument = {
          id,
          type,
          content,
          tenantId,
          metadata: metadata || {},
        };

        // Queue for background processing
        const jobId = await queueDocumentEmbedding(document);

        return reply.status(202).send({
          success: true,
          data: {
            jobId,
            message: 'Document queued for embedding',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to queue document embedding');
        return reply.status(500).send({
          success: false,
          error: 'Failed to queue document embedding',
        });
      }
    }
  );

  /**
   * Embed multiple documents in batch
   * POST /api/v1/embeddings/embed/batch
   * Requires: dataSource.update permission (ADMIN role minimum)
   */
  fastify.post(
    '/embed/batch',
    {
      schema: { body: embedBatchSchema },
      preHandler: [requirePermission('dataSource', 'update')],
    },
    async (
      request: FastifyRequest<{ Body: EmbedBatchBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { documents } = request.body;
        const tenantId = getOrganizationId(request);

        // Schema validation handles required and array checks

        const sourceDocuments: SourceDocument[] = documents.map((doc) => ({
          id: doc.id,
          type: doc.type,
          content: doc.content,
          tenantId,
          metadata: doc.metadata || {},
        }));

        // Queue for background processing
        const jobId = await queueBatchEmbedding(sourceDocuments, tenantId);

        return reply.status(202).send({
          success: true,
          data: {
            jobId,
            documentCount: documents.length,
            message: 'Documents queued for embedding',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to queue batch embedding');
        return reply.status(500).send({
          success: false,
          error: 'Failed to queue batch embedding',
        });
      }
    }
  );

  /**
   * Trigger reindexing with new model
   * POST /api/v1/embeddings/reindex
   * Requires: dataSource.update permission (ADMIN role minimum)
   */
  fastify.post(
    '/reindex',
    {
      schema: { body: reindexSchema },
      preHandler: [requirePermission('dataSource', 'update')],
    },
    async (
      request: FastifyRequest<{ Body: ReindexBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { indexId, newModel, newDimensions } = request.body;
        const tenantId = getOrganizationId(request);

        // Schema validation handles required check

        // Verify index exists
        const index = await prisma.vectorIndex.findUnique({
          where: { id: indexId },
        });

        if (!index) {
          return reply.status(404).send({
            success: false,
            error: 'Index not found',
          });
        }

        // Queue reindex job
        const jobId = await queueReindex(indexId, newModel, newDimensions, tenantId);

        return reply.status(202).send({
          success: true,
          data: {
            jobId,
            indexId,
            message: 'Reindex job queued',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to queue reindex');
        return reply.status(500).send({
          success: false,
          error: 'Failed to queue reindex',
        });
      }
    }
  );

  /**
   * Get job status
   * GET /api/v1/embeddings/jobs/:jobId
   * Requires: dataSource.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/jobs/:jobId',
    {
      schema: { params: jobIdParamSchema },
      preHandler: [requirePermission('dataSource', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { jobId } = request.params;
        const status = await getEmbeddingJobStatus(jobId);

        return reply.send({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get job status');
        return reply.status(404).send({
          success: false,
          error: 'Job not found',
        });
      }
    }
  );

  /**
   * Get embeddings for a source document
   * GET /api/v1/embeddings/source/:sourceId
   * SECURITY: Paginated to prevent DoS via unbounded queries
   * Requires: dataSource.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/source/:sourceId',
    {
      schema: { params: sourceIdParamSchema, querystring: paginationQuerySchema },
      preHandler: [requirePermission('dataSource', 'read')],
    },
    async (
      request: FastifyRequest<{
        Params: { sourceId: string };
        Querystring: { page?: string; pageSize?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceId } = request.params;
        const tenantId = getOrganizationId(request);

        // Parse pagination with safe defaults
        const page = Math.max(1, parseInt(request.query.page || '1', 10) || 1);
        const pageSize = Math.min(
          MAX_PAGE_SIZE,
          Math.max(1, parseInt(request.query.pageSize || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
        );
        const skip = (page - 1) * pageSize;

        // Get total count and paginated results
        const [embeddings, total] = await Promise.all([
          prisma.embedding.findMany({
            where: {
              sourceId,
              tenantId,
            },
            orderBy: { chunkIndex: 'asc' },
            skip,
            take: pageSize,
          }),
          prisma.embedding.count({
            where: {
              sourceId,
              tenantId,
            },
          }),
        ]);

        return reply.send({
          success: true,
          data: embeddings,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get embeddings');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get embeddings',
        });
      }
    }
  );

  /**
   * Delete embeddings for a source document
   * DELETE /api/v1/embeddings/source/:sourceId
   * Requires: dataSource.delete permission (ADMIN role minimum)
   */
  fastify.delete(
    '/source/:sourceId',
    {
      schema: { params: sourceIdParamSchema },
      preHandler: [requirePermission('dataSource', 'delete')],
    },
    async (
      request: FastifyRequest<{ Params: { sourceId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceId } = request.params;
        const tenantId = getOrganizationId(request);

        const result = await embeddingService.deleteDocumentEmbeddings(
          sourceId,
          tenantId
        );

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to delete embeddings');
        return reply.status(500).send({
          success: false,
          error: 'Failed to delete embeddings',
        });
      }
    }
  );

  /**
   * Get collection statistics
   * GET /api/v1/embeddings/stats
   * Requires: dataSource.read permission (VIEWER role minimum)
   */
  fastify.get('/stats', { preHandler: [requirePermission('dataSource', 'read')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getOrganizationId(request);

      const [docsInfo, commsInfo, dbStats] = await Promise.all([
        qdrantService.getCollectionInfo(QDRANT_COLLECTIONS.DOCUMENTS),
        qdrantService.getCollectionInfo(QDRANT_COLLECTIONS.COMMUNICATIONS),
        prisma.embedding.groupBy({
          by: ['sourceType'],
          where: { tenantId },
          _count: true,
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          collections: {
            documents: docsInfo,
            communications: commsInfo,
          },
          bySourceType: dbStats.reduce(
            (acc, item) => {
              acc[item.sourceType] = item._count;
              return acc;
            },
            {} as Record<string, number>
          ),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get stats',
      });
    }
  });
}

export default embeddingRoutes;
