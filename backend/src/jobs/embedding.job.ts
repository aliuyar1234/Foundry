/**
 * Embedding Background Job (T026)
 * Processes document/communication embedding in the background
 */

import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { getEmbeddingService, EmbeddingService } from '../services/vector/embedding.service.js';
import { logger } from '../lib/logger.js';
import type { SourceDocument } from '../models/Embedding.js';
import { SourceType } from '../models/Embedding.js';

/**
 * Job data for embedding tasks
 */
export interface EmbeddingJobData {
  type: 'single' | 'batch' | 'reindex';
  tenantId: string;
  documents?: SourceDocument[];
  documentIds?: string[];
  sourceType?: SourceType;
  reindexConfig?: {
    indexId: string;
    newModel: string;
    newDimensions: number;
  };
}

/**
 * Job result
 */
export interface EmbeddingJobResult {
  processedCount: number;
  successCount: number;
  failureCount: number;
  errors: string[];
}

// Queue configuration
const QUEUE_NAME = 'embedding';
const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

// Create queue
export const embeddingQueue = new Queue<EmbeddingJobData, EmbeddingJobResult>(
  QUEUE_NAME,
  {
    connection: REDIS_CONNECTION,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

/**
 * Process embedding job
 */
async function processEmbeddingJob(
  job: Job<EmbeddingJobData, EmbeddingJobResult>
): Promise<EmbeddingJobResult> {
  const { type, tenantId, documents, documentIds, sourceType, reindexConfig } = job.data;
  const embeddingService = getEmbeddingService();

  logger.info(
    { jobId: job.id, type, tenantId, documentsCount: documents?.length || documentIds?.length },
    'Processing embedding job'
  );

  const result: EmbeddingJobResult = {
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    errors: [],
  };

  try {
    switch (type) {
      case 'single':
        if (documents && documents.length > 0) {
          const doc = documents[0];
          const embedResult = await embeddingService.embedWithRetry(doc);
          result.processedCount = 1;
          result.successCount = embedResult.failedChunks === 0 ? 1 : 0;
          result.failureCount = embedResult.failedChunks > 0 ? 1 : 0;
          if (embedResult.failedChunks > 0) {
            result.errors.push(`${embedResult.failedChunks} chunks failed for ${doc.id}`);
          }
        }
        break;

      case 'batch':
        if (documents && documents.length > 0) {
          const batchResults = await embeddingService.embedDocumentsBatch(documents);
          for (const res of batchResults) {
            result.processedCount++;
            if (res.failedChunks === 0) {
              result.successCount++;
            } else {
              result.failureCount++;
              result.errors.push(`${res.failedChunks} chunks failed for ${res.sourceId}`);
            }
          }
        } else if (documentIds && documentIds.length > 0) {
          // Fetch documents from database and process
          for (const docId of documentIds) {
            try {
              const doc = await fetchDocumentContent(docId, sourceType || SourceType.DOCUMENT, tenantId);
              if (doc) {
                const embedResult = await embeddingService.embedWithRetry(doc);
                result.processedCount++;
                if (embedResult.failedChunks === 0) {
                  result.successCount++;
                } else {
                  result.failureCount++;
                }
              }
            } catch (error) {
              result.processedCount++;
              result.failureCount++;
              result.errors.push(`Failed to process ${docId}: ${error}`);
            }

            // Update progress
            await job.updateProgress(
              Math.round((result.processedCount / documentIds.length) * 100)
            );
          }
        }
        break;

      case 'reindex':
        if (reindexConfig) {
          await embeddingService.startReindex(
            reindexConfig.indexId,
            reindexConfig.newModel,
            reindexConfig.newDimensions
          );
          // Full reindex is handled separately
          result.processedCount = 1;
          result.successCount = 1;
        }
        break;
    }

    logger.info(
      { jobId: job.id, result },
      'Embedding job completed'
    );

    return result;
  } catch (error) {
    logger.error({ jobId: job.id, error }, 'Embedding job failed');
    throw error;
  }
}

/**
 * Fetch document content from database
 */
async function fetchDocumentContent(
  documentId: string,
  sourceType: SourceType,
  tenantId: string
): Promise<SourceDocument | null> {
  // This would fetch from the appropriate table based on source type
  // For now, returning a placeholder structure
  // In production, this would query the actual document/email/message tables

  logger.debug({ documentId, sourceType }, 'Fetching document content');

  // Placeholder - implement based on your data model
  return null;
}

// Create worker
export function createEmbeddingWorker(): Worker<EmbeddingJobData, EmbeddingJobResult> {
  const worker = new Worker<EmbeddingJobData, EmbeddingJobResult>(
    QUEUE_NAME,
    processEmbeddingJob,
    {
      connection: REDIS_CONNECTION,
      concurrency: 5,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, result },
      'Embedding worker: job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error },
      'Embedding worker: job failed'
    );
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Embedding worker error');
  });

  logger.info('Embedding worker started');

  return worker;
}

/**
 * Add document embedding job to queue
 */
export async function queueDocumentEmbedding(
  document: SourceDocument
): Promise<string> {
  const job = await embeddingQueue.add('embed-document', {
    type: 'single',
    tenantId: document.tenantId,
    documents: [document],
  });

  logger.info(
    { jobId: job.id, sourceId: document.id },
    'Document embedding job queued'
  );

  return job.id!;
}

/**
 * Add batch embedding job to queue
 */
export async function queueBatchEmbedding(
  documents: SourceDocument[],
  tenantId: string
): Promise<string> {
  const job = await embeddingQueue.add('embed-batch', {
    type: 'batch',
    tenantId,
    documents,
  });

  logger.info(
    { jobId: job.id, documentsCount: documents.length },
    'Batch embedding job queued'
  );

  return job.id!;
}

/**
 * Add reindex job to queue
 */
export async function queueReindex(
  indexId: string,
  newModel: string,
  newDimensions: number,
  tenantId: string
): Promise<string> {
  const job = await embeddingQueue.add('reindex', {
    type: 'reindex',
    tenantId,
    reindexConfig: {
      indexId,
      newModel,
      newDimensions,
    },
  });

  logger.info(
    { jobId: job.id, indexId, newModel },
    'Reindex job queued'
  );

  return job.id!;
}

/**
 * Get job status
 */
export async function getEmbeddingJobStatus(jobId: string): Promise<{
  state: string;
  progress: number;
  result?: EmbeddingJobResult;
}> {
  const job = await embeddingQueue.getJob(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const state = await job.getState();
  const progress = job.progress as number || 0;

  return {
    state,
    progress,
    result: job.returnvalue ?? undefined,
  };
}
