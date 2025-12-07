/**
 * Base Job Processor Class
 * Provides common functionality for all job processors
 */

import { Worker, Job, Processor } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { getConnectionOptions, QueueName } from './queue.js';

export interface ProcessorContext {
  prisma: PrismaClient;
  logger: ProcessorLogger;
}

export interface ProcessorLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
}

export interface JobProgress {
  current: number;
  total: number;
  stage?: string;
  message?: string;
}

export abstract class BaseProcessor<TData, TResult> {
  protected worker: Worker<TData, TResult> | null = null;
  protected prisma: PrismaClient;
  protected logger: ProcessorLogger;

  constructor(
    protected queueName: QueueName,
    prisma: PrismaClient
  ) {
    this.prisma = prisma;
    this.logger = this.createLogger();
  }

  /**
   * Process a job - must be implemented by subclasses
   */
  protected abstract process(
    job: Job<TData>,
    context: ProcessorContext
  ): Promise<TResult>;

  /**
   * Start the worker
   */
  start(concurrency = 1): void {
    if (this.worker) {
      return;
    }

    const processor: Processor<TData, TResult> = async (job) => {
      const context: ProcessorContext = {
        prisma: this.prisma,
        logger: this.createJobLogger(job),
      };

      try {
        this.logger.info(`Starting job ${job.id}`, {
          name: job.name,
          data: job.data,
        });

        const result = await this.process(job, context);

        this.logger.info(`Completed job ${job.id}`, {
          name: job.name,
        });

        return result;
      } catch (error) {
        this.logger.error(`Failed job ${job.id}`, error as Error, {
          name: job.name,
          attempt: job.attemptsMade,
        });

        throw error;
      }
    };

    this.worker = new Worker<TData, TResult>(this.queueName, processor, {
      connection: getConnectionOptions(),
      concurrency,
      limiter: {
        max: 10,
        duration: 1000,
      },
    });

    this.setupEventHandlers();

    this.logger.info(`Worker started for queue: ${this.queueName}`, {
      concurrency,
    });
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      this.logger.info(`Worker stopped for queue: ${this.queueName}`);
    }
  }

  /**
   * Update job progress
   */
  protected async updateProgress(
    job: Job<TData>,
    progress: JobProgress
  ): Promise<void> {
    const percentage = Math.round((progress.current / progress.total) * 100);
    await job.updateProgress({
      ...progress,
      percentage,
    });
  }

  /**
   * Setup worker event handlers
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job failed: ${job?.id}`, error);
    });

    this.worker.on('error', (error) => {
      this.logger.error('Worker error', error);
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`Job stalled: ${jobId}`);
    });
  }

  /**
   * Create a logger for the processor
   */
  private createLogger(): ProcessorLogger {
    const prefix = `[${this.queueName}]`;

    return {
      info: (message, data) => {
        console.info(`${prefix} ${message}`, data || '');
      },
      warn: (message, data) => {
        console.warn(`${prefix} ${message}`, data || '');
      },
      error: (message, error, data) => {
        console.error(`${prefix} ${message}`, error, data || '');
      },
      debug: (message, data) => {
        if (process.env.LOG_LEVEL === 'debug') {
          console.debug(`${prefix} ${message}`, data || '');
        }
      },
    };
  }

  /**
   * Create a logger for a specific job
   */
  private createJobLogger(job: Job<TData>): ProcessorLogger {
    const prefix = `[${this.queueName}:${job.id}]`;

    return {
      info: (message, data) => {
        console.info(`${prefix} ${message}`, data || '');
      },
      warn: (message, data) => {
        console.warn(`${prefix} ${message}`, data || '');
      },
      error: (message, error, data) => {
        console.error(`${prefix} ${message}`, error, data || '');
      },
      debug: (message, data) => {
        if (process.env.LOG_LEVEL === 'debug') {
          console.debug(`${prefix} ${message}`, data || '');
        }
      },
    };
  }
}

/**
 * Helper to run a processor with graceful shutdown
 */
export async function runProcessor(
  processor: BaseProcessor<unknown, unknown>,
  concurrency = 1
): Promise<void> {
  processor.start(concurrency);

  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}, shutting down processor...`);
    await processor.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep process alive
  await new Promise(() => {});
}
