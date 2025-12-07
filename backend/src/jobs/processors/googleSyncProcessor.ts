/**
 * Google Workspace Sync Job Processor
 * Handles background synchronization of Google Workspace data (Gmail, Calendar, Drive)
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus, DataSourceStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { createConnector } from '../../connectors/factory.js';
import { GoogleWorkspaceConnector } from '../../connectors/google/index.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';

export interface GoogleSyncJobData {
  dataSourceId: string;
  syncJobId: string;
  organizationId: string;
  fullSync?: boolean;
  lookbackMonths?: number;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncDrive?: boolean;
}

export interface GoogleSyncJobResult {
  eventsCount: number;
  duration: number;
  emailsProcessed: number;
  calendarEventsProcessed: number;
  driveFilesProcessed: number;
}

export class GoogleSyncProcessor extends BaseProcessor<GoogleSyncJobData, GoogleSyncJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.GOOGLE_SYNC, prisma);
  }

  async process(
    job: Job<GoogleSyncJobData>,
    context: ProcessorContext
  ): Promise<GoogleSyncJobResult> {
    const {
      dataSourceId,
      syncJobId,
      organizationId,
      fullSync,
      lookbackMonths,
      syncEmails = true,
      syncCalendar = true,
      syncDrive = true,
    } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting Google Workspace sync', { dataSourceId, syncJobId });

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
      const connector = createConnector(dataSource) as GoogleWorkspaceConnector;

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
          syncEmails,
          syncCalendar,
          syncFiles: syncDrive,
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
            syncEmails,
            syncCalendar,
            syncDrive,
          },
        },
      });

      context.logger.info('Google Workspace sync completed', {
        dataSourceId,
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
      });

      return {
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        emailsProcessed: 0, // Would need to track from sync result stats
        calendarEventsProcessed: 0,
        driveFilesProcessed: 0,
      };
    } catch (error) {
      context.logger.error('Google Workspace sync failed', error as Error, { dataSourceId });

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
export function createGoogleSyncProcessor(prisma: PrismaClient): GoogleSyncProcessor {
  return new GoogleSyncProcessor(prisma);
}
