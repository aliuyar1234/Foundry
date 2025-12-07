/**
 * SAP Business One Sync Job Processor
 * Handles background synchronization of SAP B1 data
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus, DataSourceStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { createConnector } from '../../connectors/factory.js';
import { SapB1Connector } from '../../connectors/sap-b1/index.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';

export interface SapSyncJobData {
  dataSourceId: string;
  syncJobId: string;
  organizationId: string;
  fullSync?: boolean;
  lookbackMonths?: number;
  entities?: string[];
}

export interface SapSyncJobResult {
  eventsCount: number;
  duration: number;
  customersProcessed: number;
  vendorsProcessed: number;
  itemsProcessed: number;
  ordersProcessed: number;
  invoicesProcessed: number;
}

export class SapSyncProcessor extends BaseProcessor<SapSyncJobData, SapSyncJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.SAP_SYNC, prisma);
  }

  async process(
    job: Job<SapSyncJobData>,
    context: ProcessorContext
  ): Promise<SapSyncJobResult> {
    const {
      dataSourceId,
      syncJobId,
      organizationId,
      fullSync,
      lookbackMonths,
    } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting SAP B1 sync', { dataSourceId, syncJobId });

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
      const connector = createConnector(dataSource) as SapB1Connector;

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
          config: connector['config'],
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

      context.logger.info('SAP B1 sync completed', {
        dataSourceId,
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
      });

      return {
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        customersProcessed: 0,
        vendorsProcessed: 0,
        itemsProcessed: 0,
        ordersProcessed: 0,
        invoicesProcessed: 0,
      };
    } catch (error) {
      context.logger.error('SAP B1 sync failed', error as Error, { dataSourceId });

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
export function createSapSyncProcessor(prisma: PrismaClient): SapSyncProcessor {
  return new SapSyncProcessor(prisma);
}
