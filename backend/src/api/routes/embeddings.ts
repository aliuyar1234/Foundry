/**
 * Vector Index API Routes (T028)
 * Endpoints for managing vector indices and embeddings
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
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

const prisma = new PrismaClient();

/**
 * Request body types
 */
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
   */
  fastify.get('/indices', async (request: FastifyRequest, reply: FastifyReply) => {
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
   */
  fastify.get(
    '/indices/:id',
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
   */
  fastify.post(
    '/indices',
    async (
      request: FastifyRequest<{ Body: CreateIndexBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, embeddingModel, dimensions } = request.body;

        // Validate
        if (!name || !embeddingModel || !dimensions) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields: name, embeddingModel, dimensions',
          });
        }

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
   */
  fastify.post(
    '/embed',
    async (
      request: FastifyRequest<{ Body: EmbedDocumentBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id, type, content, metadata } = request.body;
        const tenantId = (request as any).tenantId || 'default';

        if (!id || !type || !content) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields: id, type, content',
          });
        }

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
   */
  fastify.post(
    '/embed/batch',
    async (
      request: FastifyRequest<{ Body: EmbedBatchBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { documents } = request.body;
        const tenantId = (request as any).tenantId || 'default';

        if (!documents || documents.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'No documents provided',
          });
        }

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
   */
  fastify.post(
    '/reindex',
    async (
      request: FastifyRequest<{ Body: ReindexBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { indexId, newModel, newDimensions } = request.body;
        const tenantId = (request as any).tenantId || 'default';

        if (!indexId || !newModel || !newDimensions) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields: indexId, newModel, newDimensions',
          });
        }

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
   */
  fastify.get(
    '/jobs/:jobId',
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
   */
  fastify.get(
    '/source/:sourceId',
    async (
      request: FastifyRequest<{ Params: { sourceId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceId } = request.params;
        const tenantId = (request as any).tenantId || 'default';

        const embeddings = await prisma.embedding.findMany({
          where: {
            sourceId,
            tenantId,
          },
          orderBy: { chunkIndex: 'asc' },
        });

        return reply.send({
          success: true,
          data: embeddings,
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
   */
  fastify.delete(
    '/source/:sourceId',
    async (
      request: FastifyRequest<{ Params: { sourceId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceId } = request.params;
        const tenantId = (request as any).tenantId || 'default';

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
   */
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenantId || 'default';

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
