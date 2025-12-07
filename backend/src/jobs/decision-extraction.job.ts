/**
 * Decision Extraction Job (T075)
 * Background job for automatic decision extraction
 */

import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { getDecisionService } from '../services/decision/decision.service.js';
import { getRedisConnection } from '../lib/redis.js';

const prisma = new PrismaClient();

interface DecisionExtractionJobData {
  eventId?: string;
  documentId?: string;
  tenantId: string;
  sourceType: string;
  content: string;
  autoCreate?: boolean;
}

const QUEUE_NAME = 'decision-extraction';

// Create queue
export const decisionExtractionQueue = new Queue<DecisionExtractionJobData>(QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Create worker
export const decisionExtractionWorker = new Worker<DecisionExtractionJobData>(
  QUEUE_NAME,
  async (job: Job<DecisionExtractionJobData>) => {
    const { eventId, documentId, tenantId, sourceType, content, autoCreate = true } = job.data;
    const sourceId = eventId || documentId || '';

    logger.info(
      { jobId: job.id, sourceType, sourceId },
      'Processing decision extraction job'
    );

    try {
      const decisionService = getDecisionService();

      // Extract decisions
      const extracted = await decisionService.extractDecisions(
        content,
        sourceType,
        sourceId,
        tenantId
      );

      if (extracted.length === 0) {
        logger.debug({ sourceId }, 'No decisions found in content');
        return { extracted: 0, created: 0 };
      }

      // Create decision records if autoCreate is enabled
      let created = 0;
      if (autoCreate) {
        const decisions = await decisionService.createFromExtraction(
          extracted,
          sourceType,
          sourceId,
          tenantId
        );
        created = decisions.length;
      }

      logger.info(
        { sourceId, extracted: extracted.length, created },
        'Decision extraction completed'
      );

      return { extracted: extracted.length, created };
    } catch (error) {
      logger.error(
        { error, sourceId, jobId: job.id },
        'Decision extraction job failed'
      );
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 3,
  }
);

// Event handlers
decisionExtractionWorker.on('completed', (job, result) => {
  logger.debug({ jobId: job.id, result }, 'Decision extraction job completed');
});

decisionExtractionWorker.on('failed', (job, error) => {
  logger.error(
    { jobId: job?.id, error: error.message },
    'Decision extraction job failed'
  );
});

/**
 * Queue a decision extraction job
 */
export async function queueDecisionExtraction(
  data: DecisionExtractionJobData
): Promise<string> {
  const job = await decisionExtractionQueue.add('extract', data, {
    priority: 5,
  });
  return job.id || '';
}

/**
 * Process new events for decision extraction
 */
export async function processEventForDecisions(
  eventId: string,
  tenantId: string
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) return;

  // Only process events with substantial content
  const content = event.description || '';
  if (content.length < 100) return;

  await queueDecisionExtraction({
    eventId,
    tenantId,
    sourceType: 'event',
    content,
    autoCreate: true,
  });
}

/**
 * Process new documents for decision extraction
 */
export async function processDocumentForDecisions(
  documentId: string,
  tenantId: string,
  content: string
): Promise<void> {
  if (content.length < 100) return;

  await queueDecisionExtraction({
    documentId,
    tenantId,
    sourceType: 'document',
    content,
    autoCreate: true,
  });
}

export default decisionExtractionQueue;
