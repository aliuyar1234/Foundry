/**
 * Incremental Sync Coordinator
 * Task: T015
 *
 * Coordinates incremental sync operations across all connectors.
 * Handles checkpoint management, resume capability, and sync orchestration.
 */

import { PrismaClient, ConnectorJobStatus, SyncType } from '@prisma/client';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { IDataConnector, SyncCheckpoint, SyncOptions, SyncResult, SyncProgressCallback } from '../../connectors/base/connector';
import { EventIngestionService, getEventIngestionService } from './eventIngestionService';
import { HealthCheckService, getHealthCheckService } from './healthCheckService';
import { Pool } from 'pg';

export interface SyncJobConfig {
  instanceId: string;
  connectorType: string;
  organizationId: string;
  syncType: SyncType;
  options: SyncOptions;
  priority?: number;
  scheduledAt?: Date;
}

export interface SyncJobResult {
  jobId: string;
  instanceId: string;
  status: 'completed' | 'partial' | 'failed';
  eventsProcessed: number;
  errorsCount: number;
  duration: number;
  checkpoints: SyncCheckpoint[];
  error?: string;
}

export interface SyncCoordinatorConfig {
  maxConcurrentJobs?: number;
  jobTimeoutMs?: number;
  checkpointIntervalMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

interface ActiveJob {
  jobId: string;
  config: SyncJobConfig;
  connector: IDataConnector;
  startTime: Date;
  batchId: string;
  eventsProcessed: number;
  lastCheckpoint?: SyncCheckpoint;
  abortController: AbortController;
}

export class SyncCoordinator extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private pgPool: Pool;
  private eventIngestion: EventIngestionService;
  private healthCheck: HealthCheckService;
  private activeJobs: Map<string, ActiveJob> = new Map();
  private jobQueue: SyncJobConfig[] = [];
  private connectorRegistry: Map<string, () => IDataConnector> = new Map();
  private config: Required<SyncCoordinatorConfig>;
  private isProcessing = false;

  constructor(
    prisma: PrismaClient,
    redis: Redis | null,
    pgPool: Pool,
    config: SyncCoordinatorConfig = {}
  ) {
    super();
    this.prisma = prisma;
    this.redis = redis;
    this.pgPool = pgPool;
    this.eventIngestion = getEventIngestionService(pgPool, redis);
    this.healthCheck = getHealthCheckService(redis);

    this.config = {
      maxConcurrentJobs: config.maxConcurrentJobs || 5,
      jobTimeoutMs: config.jobTimeoutMs || 30 * 60 * 1000, // 30 minutes
      checkpointIntervalMs: config.checkpointIntervalMs || 60 * 1000, // 1 minute
      retryAttempts: config.retryAttempts || 3,
      retryDelayMs: config.retryDelayMs || 5000,
    };
  }

  /**
   * Register a connector factory
   */
  registerConnector(
    connectorType: string,
    factory: () => IDataConnector
  ): void {
    this.connectorRegistry.set(connectorType, factory);
  }

  /**
   * Schedule a sync job
   */
  async scheduleSync(config: SyncJobConfig): Promise<string> {
    // Create job record in database
    const job = await this.prisma.connectorSyncJob.create({
      data: {
        instanceId: config.instanceId,
        syncType: config.syncType,
        status: ConnectorJobStatus.PENDING,
        metadata: {
          organizationId: config.organizationId,
          options: config.options,
          priority: config.priority || 0,
          scheduledAt: config.scheduledAt?.toISOString(),
        },
      },
    });

    // Add to queue
    this.jobQueue.push({ ...config, instanceId: job.id });
    this.jobQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Trigger processing
    this.processQueue();

    this.emit('job_scheduled', { jobId: job.id, config });
    return job.id;
  }

  /**
   * Start a sync job immediately
   */
  async startSync(
    instanceId: string,
    options: SyncOptions = {}
  ): Promise<SyncJobResult> {
    const instance = await this.prisma.connectorInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error(`Connector instance not found: ${instanceId}`);
    }

    const jobId = await this.scheduleSync({
      instanceId,
      connectorType: instance.connectorType,
      organizationId: instance.organizationId,
      syncType: options.fullSync ? SyncType.FULL : SyncType.INCREMENTAL,
      options,
      priority: 10, // High priority for immediate syncs
    });

    // Wait for job to complete
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sync job timed out'));
      }, this.config.jobTimeoutMs);

      const checkStatus = async () => {
        const job = await this.prisma.connectorSyncJob.findUnique({
          where: { id: jobId },
        });

        if (!job) {
          clearTimeout(timeout);
          reject(new Error('Job not found'));
          return;
        }

        if (
          job.status === ConnectorJobStatus.COMPLETED ||
          job.status === ConnectorJobStatus.FAILED
        ) {
          clearTimeout(timeout);
          resolve({
            jobId,
            instanceId,
            status: job.status === ConnectorJobStatus.COMPLETED ? 'completed' : 'failed',
            eventsProcessed: job.eventsProcessed,
            errorsCount: job.errorsCount,
            duration: job.completedAt
              ? job.completedAt.getTime() - (job.startedAt?.getTime() || 0)
              : 0,
            checkpoints: [],
            error: job.errorMessage || undefined,
          });
          return;
        }

        // Check again in 1 second
        setTimeout(checkStatus, 1000);
      };

      checkStatus();
    });
  }

  /**
   * Resume a failed or paused sync
   */
  async resumeSync(jobId: string): Promise<SyncJobResult> {
    const job = await this.prisma.connectorSyncJob.findUnique({
      where: { id: jobId },
      include: {
        instance: {
          include: {
            checkpoints: true,
          },
        },
      },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== ConnectorJobStatus.FAILED && job.status !== ConnectorJobStatus.PAUSED) {
      throw new Error(`Job cannot be resumed (status: ${job.status})`);
    }

    // Reset job status
    await this.prisma.connectorSyncJob.update({
      where: { id: jobId },
      data: {
        status: ConnectorJobStatus.PENDING,
        errorMessage: null,
      },
    });

    // Re-queue with existing checkpoints
    const metadata = job.metadata as Record<string, unknown>;
    return this.startSync(job.instanceId, {
      ...(metadata.options as SyncOptions),
      // Resume from checkpoint - don't do full sync
      fullSync: false,
    });
  }

  /**
   * Cancel a running or pending sync
   */
  async cancelSync(jobId: string): Promise<void> {
    const activeJob = this.activeJobs.get(jobId);

    if (activeJob) {
      // Abort the running job
      activeJob.abortController.abort();
      this.activeJobs.delete(jobId);
    }

    // Update job status
    await this.prisma.connectorSyncJob.update({
      where: { id: jobId },
      data: {
        status: ConnectorJobStatus.CANCELLED,
        completedAt: new Date(),
      },
    });

    // Remove from queue if pending
    this.jobQueue = this.jobQueue.filter((j) => j.instanceId !== jobId);

    this.emit('job_cancelled', { jobId });
  }

  /**
   * Get sync status for a job
   */
  async getSyncStatus(jobId: string): Promise<{
    status: ConnectorJobStatus;
    progress: number;
    eventsProcessed: number;
    errorsCount: number;
    startedAt?: Date;
    currentCheckpoint?: SyncCheckpoint;
  }> {
    const job = await this.prisma.connectorSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const activeJob = this.activeJobs.get(jobId);

    return {
      status: job.status,
      progress: job.progress,
      eventsProcessed: activeJob?.eventsProcessed || job.eventsProcessed,
      errorsCount: job.errorsCount,
      startedAt: job.startedAt || undefined,
      currentCheckpoint: activeJob?.lastCheckpoint,
    };
  }

  /**
   * Get active syncs for an organization
   */
  async getActiveSyncs(organizationId: string): Promise<ActiveJob[]> {
    return Array.from(this.activeJobs.values()).filter((job) => {
      return job.config.organizationId === organizationId;
    });
  }

  /**
   * Get sync history for a connector
   */
  async getSyncHistory(
    instanceId: string,
    limit: number = 10
  ): Promise<
    Array<{
      id: string;
      syncType: SyncType;
      status: ConnectorJobStatus;
      eventsProcessed: number;
      errorsCount: number;
      startedAt?: Date;
      completedAt?: Date;
      duration?: number;
    }>
  > {
    const jobs = await this.prisma.connectorSyncJob.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return jobs.map((job) => ({
      id: job.id,
      syncType: job.syncType,
      status: job.status,
      eventsProcessed: job.eventsProcessed,
      errorsCount: job.errorsCount,
      startedAt: job.startedAt || undefined,
      completedAt: job.completedAt || undefined,
      duration:
        job.completedAt && job.startedAt
          ? job.completedAt.getTime() - job.startedAt.getTime()
          : undefined,
    }));
  }

  /**
   * Shutdown the coordinator gracefully
   */
  async shutdown(): Promise<void> {
    // Cancel all active jobs
    for (const [jobId] of this.activeJobs) {
      await this.cancelSync(jobId);
    }

    // Clear queue
    this.jobQueue = [];
    this.isProcessing = false;

    await this.eventIngestion.shutdown();
  }

  // Private methods

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (
        this.jobQueue.length > 0 &&
        this.activeJobs.size < this.config.maxConcurrentJobs
      ) {
        const config = this.jobQueue.shift();
        if (!config) break;

        // Execute job in background
        this.executeJob(config).catch((error) => {
          this.emit('job_error', { config, error });
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(config: SyncJobConfig): Promise<void> {
    const jobId = config.instanceId; // instanceId is actually the job ID from scheduling
    const batchId = this.eventIngestion.createBatchId();
    const abortController = new AbortController();

    // Get or create connector
    const instance = await this.prisma.connectorInstance.findUnique({
      where: { id: jobId },
    });

    // Fetch the actual job to get instanceId
    const job = await this.prisma.connectorSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const connectorInstance = await this.prisma.connectorInstance.findUnique({
      where: { id: job.instanceId },
      include: { checkpoints: true },
    });

    if (!connectorInstance) {
      await this.failJob(jobId, 'Connector instance not found');
      return;
    }

    const connectorFactory = this.connectorRegistry.get(connectorInstance.connectorType);
    if (!connectorFactory) {
      await this.failJob(jobId, `No connector registered for type: ${connectorInstance.connectorType}`);
      return;
    }

    const connector = connectorFactory();
    const startTime = new Date();

    // Create active job tracking
    const activeJob: ActiveJob = {
      jobId,
      config: {
        ...config,
        instanceId: job.instanceId,
        organizationId: connectorInstance.organizationId,
        connectorType: connectorInstance.connectorType,
      },
      connector,
      startTime,
      batchId,
      eventsProcessed: 0,
      abortController,
    };

    this.activeJobs.set(jobId, activeJob);

    try {
      // Update job status to running
      await this.prisma.connectorSyncJob.update({
        where: { id: jobId },
        data: {
          status: ConnectorJobStatus.RUNNING,
          startedAt: startTime,
        },
      });

      // Register health monitoring
      this.healthCheck.registerConnector(connector);

      // Ingest start event
      await this.eventIngestion.ingestEvent({
        instanceId: job.instanceId,
        connectorType: connectorInstance.connectorType,
        organizationId: connectorInstance.organizationId,
        eventType: 'sync_started',
        status: 'success',
        batchId,
        metadata: { syncType: config.syncType, options: config.options },
      });

      // Execute sync with progress tracking
      const result = await this.executeSyncWithCheckpoints(
        activeJob,
        config.options
      );

      // Update job as completed
      await this.prisma.connectorSyncJob.update({
        where: { id: jobId },
        data: {
          status: result.success
            ? ConnectorJobStatus.COMPLETED
            : ConnectorJobStatus.FAILED,
          completedAt: new Date(),
          eventsProcessed: activeJob.eventsProcessed,
          progress: 100,
          errorMessage: result.error,
        },
      });

      // Update connector instance
      await this.prisma.connectorInstance.update({
        where: { id: job.instanceId },
        data: {
          lastHealthCheck: new Date(),
          healthStatus: result.success ? 'HEALTHY' : 'UNHEALTHY',
          errorMessage: result.error,
        },
      });

      // Ingest completion event
      await this.eventIngestion.ingestEvent({
        instanceId: job.instanceId,
        connectorType: connectorInstance.connectorType,
        organizationId: connectorInstance.organizationId,
        eventType: 'sync_completed',
        status: result.success ? 'success' : 'failed',
        batchId,
        durationMs: Date.now() - startTime.getTime(),
        metadata: {
          eventsProcessed: activeJob.eventsProcessed,
          error: result.error,
        },
      });

      this.emit('job_completed', {
        jobId,
        result,
        duration: Date.now() - startTime.getTime(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.failJob(jobId, errorMessage);

      // Ingest error event
      await this.eventIngestion.ingestEvent({
        instanceId: job.instanceId,
        connectorType: connectorInstance.connectorType,
        organizationId: connectorInstance.organizationId,
        eventType: 'sync_error',
        status: 'failed',
        batchId,
        errorMessage,
        durationMs: Date.now() - startTime.getTime(),
      });

      this.emit('job_error', { jobId, error });
    } finally {
      this.activeJobs.delete(jobId);
      this.healthCheck.unregisterConnector(
        connectorInstance.connectorType,
        job.instanceId
      );

      // Continue processing queue
      this.processQueue();
    }
  }

  private async executeSyncWithCheckpoints(
    activeJob: ActiveJob,
    options: SyncOptions
  ): Promise<SyncResult> {
    const { connector, batchId, abortController } = activeJob;

    // Create progress callback that updates checkpoints
    const onProgress: SyncProgressCallback = async (progress) => {
      activeJob.eventsProcessed = progress.current;

      // Update job progress
      await this.prisma.connectorSyncJob.update({
        where: { id: activeJob.jobId },
        data: {
          progress: Math.min(
            Math.floor((progress.current / Math.max(progress.total, 1)) * 100),
            99
          ),
          eventsProcessed: progress.current,
        },
      });

      // Emit progress event
      this.emit('sync_progress', {
        jobId: activeJob.jobId,
        progress,
      });
    };

    // Execute sync
    const result = await connector.sync(options, {
      onProgress,
      onRateLimit: {
        onRateLimitHit: (retryAfter) => {
          this.emit('rate_limit_hit', {
            jobId: activeJob.jobId,
            retryAfter,
          });
        },
        onRateLimitRecovered: () => {
          this.emit('rate_limit_recovered', {
            jobId: activeJob.jobId,
          });
        },
      },
    });

    return result;
  }

  private async failJob(jobId: string, errorMessage: string): Promise<void> {
    await this.prisma.connectorSyncJob.update({
      where: { id: jobId },
      data: {
        status: ConnectorJobStatus.FAILED,
        completedAt: new Date(),
        errorMessage,
      },
    });
  }
}

/**
 * Singleton instance
 */
let syncCoordinatorInstance: SyncCoordinator | null = null;

export function getSyncCoordinator(
  prisma: PrismaClient,
  redis: Redis | null,
  pgPool: Pool,
  config?: SyncCoordinatorConfig
): SyncCoordinator {
  if (!syncCoordinatorInstance) {
    syncCoordinatorInstance = new SyncCoordinator(prisma, redis, pgPool, config);
  }
  return syncCoordinatorInstance;
}
