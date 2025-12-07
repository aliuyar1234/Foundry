/**
 * Salesforce Sync Job Processor
 * Handles background synchronization of Salesforce CRM data
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus, DataSourceStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { createConnector } from '../../connectors/factory.js';
import { SalesforceConnector } from '../../connectors/salesforce/index.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';

export interface SalesforceSyncJobData {
  dataSourceId: string;
  syncJobId: string;
  organizationId: string;
  fullSync?: boolean;
  lookbackMonths?: number;
  objects?: string[];
}

export interface SalesforceSyncJobResult {
  eventsCount: number;
  duration: number;
  accountsProcessed: number;
  contactsProcessed: number;
  opportunitiesProcessed: number;
  casesProcessed: number;
  leadsProcessed: number;
}

export class SalesforceSyncProcessor extends BaseProcessor<SalesforceSyncJobData, SalesforceSyncJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.SALESFORCE_SYNC, prisma);
  }

  async process(
    job: Job<SalesforceSyncJobData>,
    context: ProcessorContext
  ): Promise<SalesforceSyncJobResult> {
    const {
      dataSourceId,
      syncJobId,
      organizationId,
      fullSync,
      lookbackMonths,
    } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting Salesforce sync', { dataSourceId, syncJobId });

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
      const connector = createConnector(dataSource) as SalesforceConnector;

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

      context.logger.info('Salesforce sync completed', {
        dataSourceId,
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
      });

      return {
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        accountsProcessed: 0,
        contactsProcessed: 0,
        opportunitiesProcessed: 0,
        casesProcessed: 0,
        leadsProcessed: 0,
      };
    } catch (error) {
      context.logger.error('Salesforce sync failed', error as Error, { dataSourceId });

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
export function createSalesforceSyncProcessor(prisma: PrismaClient): SalesforceSyncProcessor {
  return new SalesforceSyncProcessor(prisma);
}
