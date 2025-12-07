/**
 * Prediction Job (T128)
 * Background job for prediction model training and scoring
 */

import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { getPredictionService } from '../services/prediction/prediction.service.js';
import { getRedisConnection } from '../lib/redis.js';

const prisma = new PrismaClient();

interface PredictionJobData {
  tenantId: string;
  type: 'train' | 'predict' | 'health' | 'anomaly';
  modelId?: string;
  processId?: string;
  options?: Record<string, unknown>;
}

const QUEUE_NAME = 'predictions';

// Create queue
export const predictionQueue = new Queue<PredictionJobData>(QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

// Create worker
export const predictionWorker = new Worker<PredictionJobData>(
  QUEUE_NAME,
  async (job: Job<PredictionJobData>) => {
    const { tenantId, type, modelId, processId, options } = job.data;

    logger.info({ jobId: job.id, type, tenantId }, 'Processing prediction job');

    try {
      const predictionService = getPredictionService();

      switch (type) {
        case 'train': {
          if (!modelId) {
            throw new Error('modelId required for training');
          }
          const model = await predictionService.trainModel(modelId);
          return {
            type: 'train',
            modelId,
            status: model?.status,
            accuracy: (model?.metrics as Record<string, unknown>)?.accuracy,
          };
        }

        case 'predict': {
          if (!modelId || !processId) {
            throw new Error('modelId and processId required for prediction');
          }
          const prediction = await predictionService.predict({
            modelId,
            processId,
            tenantId,
            context: options,
          });
          return {
            type: 'predict',
            predictionId: prediction.id,
            confidence: prediction.confidence,
          };
        }

        case 'health': {
          if (!processId) {
            throw new Error('processId required for health check');
          }
          const health = await predictionService.calculateHealthScore(processId, tenantId);
          return {
            type: 'health',
            processId,
            score: health.overallScore,
            alerts: health.alerts.length,
          };
        }

        case 'anomaly': {
          if (!processId) {
            throw new Error('processId required for anomaly detection');
          }
          const anomalies = await predictionService.detectAnomalies(processId, tenantId);
          return {
            type: 'anomaly',
            processId,
            detected: anomalies.filter((a) => a.isAnomaly).length,
          };
        }

        default:
          throw new Error(`Unknown prediction job type: ${type}`);
      }
    } catch (error) {
      logger.error({ error, type, jobId: job.id }, 'Prediction job failed');
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
);

// Event handlers
predictionWorker.on('completed', (job, result) => {
  logger.debug({ jobId: job.id, result }, 'Prediction job completed');
});

predictionWorker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, 'Prediction job failed');
});

/**
 * Queue model training
 */
export async function queueModelTraining(modelId: string, tenantId: string): Promise<string> {
  const job = await predictionQueue.add('train', {
    tenantId,
    type: 'train',
    modelId,
  });
  return job.id || '';
}

/**
 * Queue health score calculation for all processes
 */
export async function queueHealthScores(tenantId: string): Promise<string[]> {
  const processes = await prisma.process.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const jobIds: string[] = [];
  for (const process of processes) {
    const job = await predictionQueue.add('health', {
      tenantId,
      type: 'health',
      processId: process.id,
    });
    if (job.id) jobIds.push(job.id);
  }

  return jobIds;
}

/**
 * Queue anomaly detection for all processes
 */
export async function queueAnomalyDetection(tenantId: string): Promise<string[]> {
  const processes = await prisma.process.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const jobIds: string[] = [];
  for (const process of processes) {
    const job = await predictionQueue.add('anomaly', {
      tenantId,
      type: 'anomaly',
      processId: process.id,
    });
    if (job.id) jobIds.push(job.id);
  }

  return jobIds;
}

/**
 * Schedule periodic prediction jobs
 */
export async function schedulePeriodicPredictions(tenantId: string): Promise<void> {
  // Schedule hourly health checks
  await predictionQueue.add(
    'periodic-health',
    { tenantId, type: 'health' },
    {
      repeat: {
        pattern: '0 * * * *', // Every hour
      },
    }
  );

  // Schedule 4x daily anomaly detection
  await predictionQueue.add(
    'periodic-anomaly',
    { tenantId, type: 'anomaly' },
    {
      repeat: {
        pattern: '0 */6 * * *', // Every 6 hours
      },
    }
  );
}

export default predictionQueue;
