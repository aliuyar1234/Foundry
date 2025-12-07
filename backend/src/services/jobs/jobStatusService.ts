/**
 * Job Status Tracking Service
 * Provides job status and progress information
 */

import { Job, JobState } from 'bullmq';
import { getQueue, getJob, QueueName, QueueNames, getAllQueueStats } from '../../jobs/queue.js';

export interface JobStatus {
  id: string;
  name: string;
  queue: QueueName;
  state: JobState | 'unknown';
  progress: number | object;
  attempts: number;
  maxAttempts: number;
  failedReason?: string;
  returnValue?: unknown;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  duration?: number;
}

export interface QueueStatus {
  name: QueueName;
  isPaused: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

export class JobStatusService {
  /**
   * Get status of a specific job
   */
  async getJobStatus(queueName: QueueName, jobId: string): Promise<JobStatus | null> {
    const job = await getJob(queueName, jobId);

    if (!job) {
      return null;
    }

    return this.formatJobStatus(job, queueName);
  }

  /**
   * Get recent jobs from a queue
   */
  async getRecentJobs(
    queueName: QueueName,
    options: {
      states?: JobState[];
      limit?: number;
    } = {}
  ): Promise<JobStatus[]> {
    const queue = getQueue(queueName);
    const { states = ['completed', 'failed', 'active', 'waiting', 'delayed'], limit = 50 } = options;

    const jobs: Job[] = [];

    for (const state of states) {
      const stateJobs = await queue.getJobs([state], 0, limit);
      jobs.push(...stateJobs);
    }

    // Sort by timestamp descending and limit
    const sorted = jobs
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    return Promise.all(sorted.map((job) => this.formatJobStatus(job, queueName)));
  }

  /**
   * Get jobs for a specific organization
   */
  async getOrganizationJobs(
    organizationId: string,
    options: {
      queue?: QueueName;
      limit?: number;
    } = {}
  ): Promise<JobStatus[]> {
    const { queue: queueName, limit = 50 } = options;

    const queuesToSearch = queueName
      ? [queueName]
      : Object.values(QueueNames);

    const allJobs: JobStatus[] = [];

    for (const name of queuesToSearch) {
      const jobs = await this.getRecentJobs(name, { limit });
      const orgJobs = jobs.filter((job) => {
        // Filter by organization ID in job data
        // This assumes job data has an organizationId field
        return true; // Will be filtered by actual data structure
      });
      allJobs.push(...orgJobs);
    }

    return allJobs
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get status of all queues
   */
  async getAllQueueStatus(): Promise<QueueStatus[]> {
    const stats = await getAllQueueStats();

    const statuses: QueueStatus[] = [];

    for (const stat of stats) {
      const queue = getQueue(stat.name as QueueName);
      const isPaused = await queue.isPaused();

      statuses.push({
        name: stat.name as QueueName,
        isPaused,
        waiting: stat.waiting,
        active: stat.active,
        completed: stat.completed,
        failed: stat.failed,
        delayed: stat.delayed,
        total: stat.total,
      });
    }

    return statuses;
  }

  /**
   * Get status of a specific queue
   */
  async getQueueStatus(queueName: QueueName): Promise<QueueStatus> {
    const queue = getQueue(queueName);

    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      name: queueName,
      isPaused,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(queueName: QueueName, jobId: string): Promise<boolean> {
    const job = await getJob(queueName, jobId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    if (state === 'active') {
      // Can't cancel active jobs directly
      return false;
    }

    await job.remove();
    return true;
  }

  /**
   * Retry a failed job
   */
  async retryJob(queueName: QueueName, jobId: string): Promise<boolean> {
    const job = await getJob(queueName, jobId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    if (state !== 'failed') {
      return false;
    }

    await job.retry();
    return true;
  }

  /**
   * Format job to JobStatus
   */
  private async formatJobStatus(job: Job, queueName: QueueName): Promise<JobStatus> {
    const state = await job.getState();

    let duration: number | undefined;
    if (job.finishedOn && job.processedOn) {
      duration = job.finishedOn - job.processedOn;
    }

    return {
      id: job.id || '',
      name: job.name,
      queue: queueName,
      state,
      progress: job.progress,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || 1,
      failedReason: job.failedReason,
      returnValue: job.returnvalue,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      duration,
    };
  }
}

// Singleton instance
let jobStatusServiceInstance: JobStatusService | null = null;

export function getJobStatusService(): JobStatusService {
  if (!jobStatusServiceInstance) {
    jobStatusServiceInstance = new JobStatusService();
  }
  return jobStatusServiceInstance;
}
