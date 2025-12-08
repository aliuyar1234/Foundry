/**
 * Odoo Sync Job Processor
 * Handles background synchronization of Odoo ERP data
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus, DataSourceStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { createConnector } from '../../connectors/factory.js';
import { OdooConnector } from '../../connectors/odoo/index.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';

export interface OdooSyncJobData {
  dataSourceId: string;
  syncJobId: string;
  organizationId: string;
  fullSync?: boolean;
  lookbackMonths?: number;
  modules?: string[];
  models?: string[];
  batchId?: string;
}

export interface OdooSyncJobResult {
  eventsCount: number;
  duration: number;
  customersProcessed: number;
  vendorsProcessed: number;
  productsProcessed: number;
  ordersProcessed: number;
  invoicesProcessed: number;
}

export class OdooSyncProcessor extends BaseProcessor<OdooSyncJobData, OdooSyncJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.ODOO_SYNC, prisma);
  }

  async process(
    job: Job<OdooSyncJobData>,
    context: ProcessorContext
  ): Promise<OdooSyncJobResult> {
    const {
      dataSourceId,
      syncJobId,
      organizationId,
      fullSync,
      lookbackMonths,
    } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting Odoo sync', { dataSourceId, syncJobId });

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
      const connector = createConnector(dataSource) as OdooConnector;

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

      context.logger.info('Odoo sync completed', {
        dataSourceId,
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
      });

      // Extract stats from sync metadata if available
      const stats = (syncResult as any).stats || {};

      return {
        eventsCount: syncResult.eventsCount,
        duration: Date.now() - startTime,
        customersProcessed: stats.customers || 0,
        vendorsProcessed: stats.vendors || 0,
        productsProcessed: stats.products || 0,
        ordersProcessed: (stats.saleOrders || 0) + (stats.purchaseOrders || 0),
        invoicesProcessed: stats.invoices || 0,
      };
    } catch (error) {
      context.logger.error('Odoo sync failed', error as Error, { dataSourceId });

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
export function createOdooSyncProcessor(prisma: PrismaClient): OdooSyncProcessor {
  return new OdooSyncProcessor(prisma);
}
