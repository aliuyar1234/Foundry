/**
 * M-Files Sync Job Processor
 * Task: T175
 *
 * Handles background synchronization of M-Files data
 * - Vault sync
 * - Object sync
 * - Progress reporting
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus, DataSourceStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { createConnector } from '../../connectors/factory.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';

export interface MFilesSyncJobData {
  dataSourceId: string;
  syncJobId: string;
  organizationId: string;
  fullSync?: boolean;
  vaultGuids?: string[];
  syncScope?: {
    includeVaults?: string[];
    excludeVaults?: string[];
    includeObjectTypes?: number[];
    includeClasses?: number[];
  };
}

export interface MFilesSyncJobResult {
  eventsCount: number;
  duration: number;
  vaultsProcessed: number;
  objectsProcessed: number;
  workflowsProcessed: number;
}

export class MFilesSyncProcessor extends BaseProcessor<MFilesSyncJobData, MFilesSyncJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.MFILES_SYNC, prisma);
  }

  async process(
    job: Job<MFilesSyncJobData>,
    context: ProcessorContext
  ): Promise<MFilesSyncJobResult> {
    const { dataSourceId, syncJobId, organizationId, fullSync, vaultGuids, syncScope } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting M-Files sync', { dataSourceId, syncJobId });

    // Update sync job status to running
    await context.prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    try {
      // Get data source
      const dataSource = await context.prisma.dataSource.findUnique({
        where: { id: dataSourceId },
      });

      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }

      // Create connector
      const connector = createConnector(dataSource);

      // Validate configuration
      const validation = connector.validateConfig();
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors?.join(', ')}`);
      }

      // Create event ingestion service
      const ingestionService = createEventIngestionService(context.prisma);

      // Stats tracking
      const stats = {
        vaultsProcessed: 0,
        objectsProcessed: 0,
        workflowsProcessed: 0,
        totalEvents: 0,
      };

      // Progress callback with vault/object granularity
      const onProgress = async (progress: JobProgress) => {
        await this.updateProgress(job, {
          current: progress.current,
          total: progress.total,
          stage: progress.stage,
          message: progress.message,
        });

        // Track stats from progress metadata
        if (progress.stage === 'vault_sync') {
          stats.vaultsProcessed++;
        } else if (progress.stage === 'object_sync') {
          stats.objectsProcessed++;
        } else if (progress.stage === 'workflow_sync') {
          stats.workflowsProcessed++;
        }
      };

      // Perform sync
      const syncResult = await connector.sync(
        {
          fullSync,
          deltaToken: dataSource.deltaToken || undefined,
          vaultGuids,
          syncScope,
        },
        onProgress
      );

      if (!syncResult.success) {
        throw new Error(syncResult.error || 'Sync failed');
      }

      stats.totalEvents = syncResult.eventsCount;

      // Update data source with new delta token and sync status
      await context.prisma.dataSource.update({
        where: { id: dataSourceId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: syncResult.partial ? 'PARTIAL' : 'SUCCESS',
          deltaToken: syncResult.deltaToken,
          status: DataSourceStatus.CONNECTED,
          config: connector['config'], // Update config with refreshed tokens
        },
      });

      // Update sync job status to completed
      await context.prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          eventsCount: syncResult.eventsCount,
          metadata: {
            duration: Date.now() - startTime,
            vaultsProcessed: stats.vaultsProcessed,
            objectsProcessed: stats.objectsProcessed,
            workflowsProcessed: stats.workflowsProcessed,
            fullSync,
            vaultGuids,
          },
        },
      });

      context.logger.info('M-Files sync completed', {
        dataSourceId,
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        stats,
      });

      return {
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        vaultsProcessed: stats.vaultsProcessed,
        objectsProcessed: stats.objectsProcessed,
        workflowsProcessed: stats.workflowsProcessed,
      };
    } catch (error) {
      context.logger.error('M-Files sync failed', error as Error, { dataSourceId });

      // Update sync job status to failed
      await context.prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      // Update data source status to error
      await context.prisma.dataSource.update({
        where: { id: dataSourceId },
        data: {
          lastSyncStatus: 'FAILED',
          status: DataSourceStatus.ERROR,
        },
      });

      throw error;
    }
  }
}

// Factory function
export function createMFilesSyncProcessor(prisma: PrismaClient): MFilesSyncProcessor {
  return new MFilesSyncProcessor(prisma);
}
