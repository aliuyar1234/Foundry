/**
 * Embedding Service (T023, T029, T030)
 * Generates and manages embeddings via OpenAI
 */

import { PrismaClient } from '@prisma/client';
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  DEFAULT_EMBEDDING_CONFIG,
} from '../../lib/openai.js';
import { QDRANT_COLLECTIONS } from '../../lib/qdrant.js';
import { logger } from '../../lib/logger.js';
import { getQdrantService, QdrantService } from './qdrant.service.js';
import {
  chunkText,
  generateContentPreview,
  generateChunkHash,
  DEFAULT_CHUNKING_CONFIG,
} from './chunking.js';
import type {
  SourceDocument,
  VectorPoint,
  VectorPayload,
  BatchEmbeddingResult,
  EmbeddingResult,
  EmbeddingMetadata,
} from '../../models/Embedding.js';
import { SourceType } from '../../models/Embedding.js';
import { IndexStatus } from '../../models/VectorIndex.js';

const prisma = new PrismaClient();

/**
 * Embedding generation options
 */
export interface EmbeddingOptions {
  model?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Reindexing status
 */
export interface ReindexStatus {
  indexId: string;
  status: IndexStatus;
  processedCount: number;
  totalCount: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * EmbeddingService - Manages embedding generation and storage
 */
export class EmbeddingService {
  private qdrantService: QdrantService;

  constructor() {
    this.qdrantService = getQdrantService();
  }

  /**
   * Embed a single document and store in vector database
   */
  async embedDocument(document: SourceDocument): Promise<BatchEmbeddingResult> {
    const { id, type, content, tenantId, metadata } = document;
    const collectionName = this.getCollectionForSourceType(type);

    logger.info(
      { sourceId: id, sourceType: type, contentLength: content.length },
      'Starting document embedding'
    );

    try {
      // Chunk the document
      const chunks = chunkText(content, DEFAULT_CHUNKING_CONFIG);

      if (chunks.length === 0) {
        logger.warn({ sourceId: id }, 'No chunks generated from document');
        return {
          sourceId: id,
          sourceType: type,
          totalChunks: 0,
          successfulChunks: 0,
          failedChunks: 0,
          results: [],
        };
      }

      // Generate embeddings in batch
      const embeddings = await generateEmbeddingsBatch(chunks);

      // Prepare vector points and database records
      const results: EmbeddingResult[] = [];
      const vectorPoints: VectorPoint[] = [];

      // Get or create vector index
      const vectorIndex = await this.getOrCreateIndex(
        collectionName,
        DEFAULT_EMBEDDING_CONFIG.model,
        DEFAULT_EMBEDDING_CONFIG.dimensions
      );

      for (let i = 0; i < chunks.length; i++) {
        try {
          const chunkContent = chunks[i];
          const vector = embeddings[i];
          const vectorId = QdrantService.generateVectorId();
          const chunkHash = await generateChunkHash(chunkContent);
          const contentPreview = generateContentPreview(chunkContent);

          // Create database record
          const embedding = await prisma.embedding.create({
            data: {
              vectorIndexId: vectorIndex.id,
              sourceType: type,
              sourceId: id,
              chunkIndex: i,
              chunkHash,
              contentPreview,
              metadata: metadata as Record<string, unknown>,
              tenantId,
            },
          });

          // Prepare vector payload
          const payload: VectorPayload = {
            tenant_id: tenantId,
            source_type: type,
            source_id: id,
            chunk_index: i,
            content_preview: contentPreview,
            created_at: new Date().toISOString(),
            ...this.flattenMetadata(metadata),
          };

          vectorPoints.push({
            id: vectorId,
            vector,
            payload,
          });

          results.push({
            embeddingId: embedding.id,
            chunkIndex: i,
            vectorId,
            success: true,
          });
        } catch (chunkError) {
          logger.error(
            { sourceId: id, chunkIndex: i, error: chunkError },
            'Failed to process chunk'
          );
          results.push({
            embeddingId: '',
            chunkIndex: i,
            vectorId: '',
            success: false,
            error: chunkError instanceof Error ? chunkError.message : 'Unknown error',
          });
        }
      }

      // Batch upsert to Qdrant
      if (vectorPoints.length > 0) {
        await this.qdrantService.upsertVectorsBatch({
          collectionName,
          points: vectorPoints,
        });
      }

      // Update index document count
      await this.updateIndexCount(vectorIndex.id);

      const successfulChunks = results.filter((r) => r.success).length;
      const failedChunks = results.filter((r) => !r.success).length;

      logger.info(
        {
          sourceId: id,
          sourceType: type,
          totalChunks: chunks.length,
          successfulChunks,
          failedChunks,
        },
        'Document embedding complete'
      );

      return {
        sourceId: id,
        sourceType: type,
        totalChunks: chunks.length,
        successfulChunks,
        failedChunks,
        results,
      };
    } catch (error) {
      logger.error({ sourceId: id, sourceType: type, error }, 'Document embedding failed');
      throw error;
    }
  }

  /**
   * Embed multiple documents in batch
   */
  async embedDocumentsBatch(documents: SourceDocument[]): Promise<BatchEmbeddingResult[]> {
    const results: BatchEmbeddingResult[] = [];

    for (const document of documents) {
      try {
        const result = await this.embedDocument(document);
        results.push(result);
      } catch (error) {
        logger.error(
          { sourceId: document.id, error },
          'Failed to embed document in batch'
        );
        results.push({
          sourceId: document.id,
          sourceType: document.type,
          totalChunks: 0,
          successfulChunks: 0,
          failedChunks: 1,
          results: [
            {
              embeddingId: '',
              chunkIndex: 0,
              vectorId: '',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          ],
        });
      }
    }

    return results;
  }

  /**
   * Delete embeddings for a source document
   */
  async deleteDocumentEmbeddings(
    sourceId: string,
    tenantId: string
  ): Promise<{ deletedFromDb: number; deletedFromVector: number }> {
    // Delete from both collections
    const [docsDeleted, commsDeleted] = await Promise.all([
      this.qdrantService.deleteBySourceId(
        QDRANT_COLLECTIONS.DOCUMENTS,
        sourceId,
        tenantId
      ),
      this.qdrantService.deleteBySourceId(
        QDRANT_COLLECTIONS.COMMUNICATIONS,
        sourceId,
        tenantId
      ),
    ]);

    // Delete from PostgreSQL
    const dbResult = await prisma.embedding.deleteMany({
      where: {
        sourceId,
        tenantId,
      },
    });

    return {
      deletedFromDb: dbResult.count,
      deletedFromVector: docsDeleted + commsDeleted,
    };
  }

  /**
   * Generate embedding for a query
   */
  async embedQuery(query: string): Promise<number[]> {
    return generateEmbedding(query);
  }

  /**
   * Reindex with new model (T029) - creates parallel index during transition
   */
  async startReindex(
    indexId: string,
    newModel: string,
    newDimensions: number
  ): Promise<ReindexStatus> {
    const index = await prisma.vectorIndex.findUnique({
      where: { id: indexId },
    });

    if (!index) {
      throw new Error(`Index not found: ${indexId}`);
    }

    // Update status to reindexing
    await prisma.vectorIndex.update({
      where: { id: indexId },
      data: { status: IndexStatus.REINDEXING },
    });

    logger.info(
      { indexId, oldModel: index.embeddingModel, newModel },
      'Starting index reindexing'
    );

    // Return initial status - actual reindexing done by job
    return {
      indexId,
      status: IndexStatus.REINDEXING,
      processedCount: 0,
      totalCount: index.documentCount,
      startedAt: new Date(),
    };
  }

  /**
   * Get or create a vector index
   */
  private async getOrCreateIndex(
    name: string,
    model: string,
    dimensions: number
  ) {
    let index = await prisma.vectorIndex.findUnique({
      where: { name },
    });

    if (!index) {
      index = await prisma.vectorIndex.create({
        data: {
          name,
          embeddingModel: model,
          dimensions,
          status: IndexStatus.CREATING,
        },
      });

      // Update to active after creation
      index = await prisma.vectorIndex.update({
        where: { id: index.id },
        data: { status: IndexStatus.ACTIVE },
      });

      logger.info({ indexName: name, indexId: index.id }, 'Vector index created');
    }

    return index;
  }

  /**
   * Update index document count
   */
  private async updateIndexCount(indexId: string): Promise<void> {
    const count = await prisma.embedding.count({
      where: { vectorIndexId: indexId },
    });

    await prisma.vectorIndex.update({
      where: { id: indexId },
      data: { documentCount: count },
    });
  }

  /**
   * Get collection name for source type
   */
  private getCollectionForSourceType(type: SourceType): string {
    switch (type) {
      case SourceType.EMAIL:
      case SourceType.MESSAGE:
      case SourceType.MEETING:
        return QDRANT_COLLECTIONS.COMMUNICATIONS;
      case SourceType.DOCUMENT:
      default:
        return QDRANT_COLLECTIONS.DOCUMENTS;
    }
  }

  /**
   * Flatten metadata for Qdrant payload
   */
  private flattenMetadata(
    metadata: EmbeddingMetadata
  ): Partial<VectorPayload> {
    const flat: Partial<VectorPayload> = {};

    if (metadata.authorId) flat.author_id = metadata.authorId;
    if (metadata.category) flat.category = metadata.category;
    if (metadata.language) flat.language = metadata.language;
    if (metadata.participants) flat.participants = metadata.participants;
    if (metadata.threadId) flat.thread_id = metadata.threadId;
    if (metadata.sentAt) flat.sent_at = metadata.sentAt;

    return flat;
  }

  /**
   * Retry embedding with exponential backoff (T030)
   */
  async embedWithRetry(
    document: SourceDocument,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<BatchEmbeddingResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.embedDocument(document);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if retryable (rate limit, temporary failure)
        const isRetryable = this.isRetryableError(lastError);

        if (!isRetryable || attempt === maxRetries - 1) {
          throw lastError;
        }

        // Exponential backoff
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn(
          {
            sourceId: document.id,
            attempt: attempt + 1,
            maxRetries,
            delay,
            error: lastError.message,
          },
          'Embedding failed, retrying'
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Embedding failed after retries');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('connection')
    );
  }
}

// Singleton instance
let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}
