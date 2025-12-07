/**
 * M365 Sync Job Processor
 * Handles background synchronization of Microsoft 365 data
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus, DataSourceStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { createConnector } from '../../connectors/factory.js';
import { M365Connector } from '../../connectors/m365/index.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';

export interface M365SyncJobData {
  dataSourceId: string;
  syncJobId: string;
  organizationId: string;
  fullSync?: boolean;
  lookbackMonths?: number;
}

export interface M365SyncJobResult {
  eventsCount: number;
  duration: number;
  usersProcessed: number;
}

export class M365SyncProcessor extends BaseProcessor<M365SyncJobData, M365SyncJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.M365_SYNC, prisma);
  }

  async process(
    job: Job<M365SyncJobData>,
    context: ProcessorContext
  ): Promise<M365SyncJobResult> {
    const { dataSourceId, syncJobId, organizationId, fullSync, lookbackMonths } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting M365 sync', { dataSourceId, syncJobId });

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
      const connector = createConnector(dataSource) as M365Connector;

      // Validate configuration
      const validation = connector.validateConfig();
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors?.join(', ')}`);
      }

      // Create event ingestion service
      const ingestionService = createEventIngestionService(context.prisma);

      // Progress callback
      const onProgress = async (progress: JobProgress) => {
        await this.updateProgress(job, {
          current: progress.current,
          total: progress.total,
          stage: progress.stage,
          message: progress.message,
        });
      };

      // Perform sync
      const syncResult = await connector.sync(
        {
          fullSync,
          lookbackMonths: lookbackMonths || 6,
          deltaToken: dataSource.deltaToken || undefined,
          syncEmails: true,
          syncCalendar: true,
        },
        onProgress
      );

      if (!syncResult.success) {
        throw new Error(syncResult.error || 'Sync failed');
      }

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
          },
        },
      });

      context.logger.info('M365 sync completed', {
        dataSourceId,
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
      });

      return {
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        usersProcessed: 0, // Would need to track this in sync
      };
    } catch (error) {
      context.logger.error('M365 sync failed', error as Error, { dataSourceId });

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
export function createM365SyncProcessor(prisma: PrismaClient): M365SyncProcessor {
  return new M365SyncProcessor(prisma);
}
