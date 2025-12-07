/**
 * BullMQ Queue Configuration
 * Manages job queues for async processing
 */

import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';

// Queue names
export const QueueNames = {
  M365_SYNC: 'm365-sync',
  DISCOVERY: 'discovery',
  PATTERN_DETECTION: 'pattern-detection',
  DUPLICATE_DETECTION: 'duplicate-detection',
  SOP_GENERATION: 'sop-generation',
  ASSESSMENT: 'assessment',
  SIMULATION: 'simulation',
  RETENTION: 'retention',
  AGGREGATE_REFRESH: 'aggregate-refresh',
  NETWORK_ANALYSIS: 'network-analysis',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

// Redis connection
let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    redisConnection.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    redisConnection.on('connect', () => {
      console.info('Redis connected');
    });
  }

  return redisConnection;
}

export function getConnectionOptions(): ConnectionOptions {
  return getRedisConnection() as unknown as ConnectionOptions;
}

// Queue registry
const queues: Map<QueueName, Queue> = new Map();
const queueEvents: Map<QueueName, QueueEvents> = new Map();

/**
 * Get or create a queue
 */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);

  if (!queue) {
    queue = new Queue(name, {
      connection: getConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60, // 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    });

    queues.set(name, queue);
  }

  return queue;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(name: QueueName): QueueEvents {
  let events = queueEvents.get(name);

  if (!events) {
    events = new QueueEvents(name, {
      connection: getConnectionOptions(),
    });

    queueEvents.set(name, events);
  }

  return events;
}

/**
 * Add a job to a queue
 */
export async function addJob<T>(
  queueName: QueueName,
  name: string,
  data: T,
  options?: {
    priority?: number;
    delay?: number;
    attempts?: number;
    jobId?: string;
  }
): Promise<Job<T>> {
  const queue = getQueue(queueName);

  return queue.add(name, data, {
    priority: options?.priority,
    delay: options?.delay,
    attempts: options?.attempts,
    jobId: options?.jobId,
  });
}

/**
 * Schedule a recurring job
 */
export async function scheduleJob<T>(
  queueName: QueueName,
  name: string,
  data: T,
  cron: string
): Promise<void> {
  const queue = getQueue(queueName);

  await queue.add(name, data, {
    repeat: {
      pattern: cron,
    },
  });
}

/**
 * Get job by ID
 */
export async function getJob<T>(
  queueName: QueueName,
  jobId: string
): Promise<Job<T> | null> {
  const queue = getQueue(queueName);
  return queue.getJob(jobId) as Promise<Job<T> | null>;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: QueueName) {
  const queue = getQueue(queueName);

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    name: queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats() {
  const stats = await Promise.all(
    Object.values(QueueNames).map((name) => getQueueStats(name))
  );

  return stats;
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: QueueName): Promise<void> {
  const queue = getQueue(queueName);
  await queue.pause();
}

/**
 * Resume a queue
 */
export async function resumeQueue(queueName: QueueName): Promise<void> {
  const queue = getQueue(queueName);
  await queue.resume();
}

/**
 * Clean up old jobs
 */
export async function cleanQueue(
  queueName: QueueName,
  grace: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<void> {
  const queue = getQueue(queueName);

  await Promise.all([
    queue.clean(grace, 1000, 'completed'),
    queue.clean(grace * 7, 1000, 'failed'),
  ]);
}

/**
 * Close all connections
 */
export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const queue of queues.values()) {
    closePromises.push(queue.close());
  }

  for (const events of queueEvents.values()) {
    closePromises.push(events.close());
  }

  await Promise.all(closePromises);

  queues.clear();
  queueEvents.clear();

  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}
