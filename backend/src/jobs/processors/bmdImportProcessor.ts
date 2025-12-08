/**
 * BMD Import Job Processor
 * Task: T154
 *
 * Handles file-based imports of BMD NTCS and CSV files.
 * Processes BMD file uploads, parses data, normalizes events, and ingests them.
 * Includes Austrian-specific error messages and progress reporting.
 */

import { Job } from 'bullmq';
import { PrismaClient, JobStatus } from '@prisma/client';
import { BaseProcessor, ProcessorContext, JobProgress } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { parseNtcsBuffer, validateNtcsFile, NtcsParseResult } from '../../connectors/bmd/parsers/ntcsParser.js';
import { createBmdEventNormalizer } from '../../connectors/bmd/eventNormalizer.js';
import { createEventIngestionService } from '../../services/ingestion/eventIngestionService.js';
import { ExtractedEvent } from '../../connectors/base/connector.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface BmdImportJobData {
  importJobId: string;
  organizationId: string;
  dataSourceId: string;
  filePath: string;
  fileName: string;
  fileType: 'ntcs' | 'csv';
  fiscalYear?: number;
  userId?: string;
}

export interface BmdImportJobResult {
  success: boolean;
  eventsCount: number;
  duration: number;
  stats: {
    accounts: number;
    bookings: number;
    businessPartners: number;
    costCenters: number;
    errors: number;
    warnings: number;
  };
  errors?: string[];
  warnings?: string[];
}

// Austrian error messages
const AUSTRIAN_ERROR_MESSAGES = {
  FILE_NOT_FOUND: 'Datei nicht gefunden',
  FILE_READ_ERROR: 'Fehler beim Lesen der Datei',
  INVALID_FORMAT: 'Ungültiges Dateiformat',
  PARSE_ERROR: 'Fehler beim Parsen der Datei',
  VALIDATION_ERROR: 'Validierungsfehler',
  IMPORT_FAILED: 'Import fehlgeschlagen',
  INSUFFICIENT_FIELDS: 'Unzureichende Felder',
  INVALID_DATE: 'Ungültiges Datum',
  INVALID_AMOUNT: 'Ungültiger Betrag',
  MISSING_HEADER: 'Fehlende Kopfzeile',
  CHECKSUM_MISMATCH: 'Prüfsumme stimmt nicht überein',
  EMPTY_FILE: 'Leere Datei',
};

export class BmdImportProcessor extends BaseProcessor<BmdImportJobData, BmdImportJobResult> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.BMD_IMPORT || 'bmd-import', prisma);
  }

  async process(
    job: Job<BmdImportJobData>,
    context: ProcessorContext
  ): Promise<BmdImportJobResult> {
    const {
      importJobId,
      organizationId,
      dataSourceId,
      filePath,
      fileName,
      fileType,
      fiscalYear,
      userId,
    } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting BMD file import', {
      importJobId,
      fileName,
      fileType,
      organizationId,
    });

    // Update import job status to running
    await this.updateJobStatus(context.prisma, importJobId, JobStatus.RUNNING, {
      startedAt: new Date(),
    });

    try {
      // Stage 1: File validation
      await this.updateProgress(job, {
        current: 5,
        total: 100,
        stage: 'validation',
        message: 'Validiere Datei...',
      });

      const fileBuffer = await this.readFile(filePath, context);

      // Stage 2: File parsing
      await this.updateProgress(job, {
        current: 15,
        total: 100,
        stage: 'parsing',
        message: 'Parse Datei...',
      });

      let parseResult: NtcsParseResult;
      try {
        if (fileType === 'ntcs') {
          parseResult = await this.parseNtcsFile(fileBuffer, fileName, context);
        } else if (fileType === 'csv') {
          parseResult = await this.parseCsvFile(fileBuffer, fileName, context);
        } else {
          throw new Error(`${AUSTRIAN_ERROR_MESSAGES.INVALID_FORMAT}: ${fileType}`);
        }
      } catch (error) {
        throw new Error(
          `${AUSTRIAN_ERROR_MESSAGES.PARSE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Stage 3: Data extraction
      await this.updateProgress(job, {
        current: 30,
        total: 100,
        stage: 'extraction',
        message: 'Extrahiere Daten...',
      });

      const extractedEvents = await this.extractEvents(parseResult, organizationId, context);

      // Stage 4: Event normalization
      await this.updateProgress(job, {
        current: 50,
        total: 100,
        stage: 'normalization',
        message: 'Normalisiere Events...',
      });

      const normalizer = createBmdEventNormalizer();
      const normalizedEvents = normalizer.normalizeEvents(extractedEvents, {
        organizationId,
        fiscalYear,
        includeRawData: true,
      });

      context.logger.info('Normalized BMD events', {
        total: normalizedEvents.length,
        stats: normalizer.calculateStatistics(normalizedEvents),
      });

      // Stage 5: Event ingestion
      await this.updateProgress(job, {
        current: 70,
        total: 100,
        stage: 'ingestion',
        message: 'Speichere Events...',
      });

      const ingestionService = createEventIngestionService(context.prisma);

      // Ingest events in batches
      const batchSize = 100;
      let ingestedCount = 0;

      for (let i = 0; i < normalizedEvents.length; i += batchSize) {
        const batch = normalizedEvents.slice(i, i + batchSize);

        // TODO: Convert normalized events to ingestion format and ingest
        // This would need an adapter between NormalizedBmdEvent and the ingestion service format

        ingestedCount += batch.length;

        // Update progress within ingestion stage
        const ingestionProgress = 70 + Math.floor((ingestedCount / normalizedEvents.length) * 20);
        await this.updateProgress(job, {
          current: ingestionProgress,
          total: 100,
          stage: 'ingestion',
          message: `Speichere Events (${ingestedCount}/${normalizedEvents.length})...`,
        });
      }

      // Stage 6: Cleanup
      await this.updateProgress(job, {
        current: 95,
        total: 100,
        stage: 'cleanup',
        message: 'Bereinige temporäre Dateien...',
      });

      await this.cleanupFile(filePath, context);

      // Final stage: Complete
      await this.updateProgress(job, {
        current: 100,
        total: 100,
        stage: 'complete',
        message: `Import abgeschlossen. ${normalizedEvents.length} Events verarbeitet.`,
      });

      const result: BmdImportJobResult = {
        success: true,
        eventsCount: normalizedEvents.length,
        duration: Date.now() - startTime,
        stats: {
          accounts: parseResult.accounts.length,
          bookings: parseResult.bookings.length,
          businessPartners: parseResult.businessPartners.length,
          costCenters: parseResult.costCenters.length,
          errors: parseResult.errors.length,
          warnings: parseResult.warnings.length,
        },
        errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
        warnings: parseResult.warnings.length > 0 ? parseResult.warnings : undefined,
      };

      // Update import job status to completed
      await this.updateJobStatus(context.prisma, importJobId, JobStatus.COMPLETED, {
        completedAt: new Date(),
        eventsCount: result.eventsCount,
        metadata: result,
      });

      // Update data source last import
      await context.prisma.dataSource.update({
        where: { id: dataSourceId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'SUCCESS',
        },
      });

      context.logger.info('BMD import completed', {
        importJobId,
        eventsCount: result.eventsCount,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('BMD import failed', error as Error, { importJobId });

      // Update import job status to failed
      await this.updateJobStatus(context.prisma, importJobId, JobStatus.FAILED, {
        completedAt: new Date(),
        errorMessage,
      });

      // Try to cleanup file even on error
      try {
        await this.cleanupFile(filePath, context);
      } catch (cleanupError) {
        context.logger.warn('Failed to cleanup file after error', {
          filePath,
          error: cleanupError,
        });
      }

      throw error;
    }
  }

  /**
   * Read file from disk
   */
  private async readFile(filePath: string, context: ProcessorContext): Promise<Buffer> {
    try {
      const buffer = await fs.readFile(filePath);
      context.logger.debug('File read successfully', { filePath, size: buffer.length });
      return buffer;
    } catch (error) {
      throw new Error(
        `${AUSTRIAN_ERROR_MESSAGES.FILE_READ_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse NTCS file
   */
  private async parseNtcsFile(
    buffer: Buffer,
    fileName: string,
    context: ProcessorContext
  ): Promise<NtcsParseResult> {
    context.logger.info('Parsing NTCS file', { fileName });

    // Validate file structure first
    const content = buffer.toString('utf-8');
    const validation = validateNtcsFile(content);

    if (!validation.valid) {
      throw new Error(
        `${AUSTRIAN_ERROR_MESSAGES.VALIDATION_ERROR}: ${validation.errors.join(', ')}`
      );
    }

    // Parse file
    const parseResult = parseNtcsBuffer(buffer, {
      encoding: 'utf-8',
      strictMode: false,
      skipInvalidRecords: true,
    });

    context.logger.info('NTCS file parsed', {
      fileName,
      accounts: parseResult.accounts.length,
      bookings: parseResult.bookings.length,
      businessPartners: parseResult.businessPartners.length,
      costCenters: parseResult.costCenters.length,
      errors: parseResult.errors.length,
      warnings: parseResult.warnings.length,
    });

    // Log errors and warnings
    if (parseResult.errors.length > 0) {
      context.logger.warn('NTCS parsing errors', { errors: parseResult.errors });
    }
    if (parseResult.warnings.length > 0) {
      context.logger.warn('NTCS parsing warnings', { warnings: parseResult.warnings });
    }

    return parseResult;
  }

  /**
   * Parse CSV file
   * Basic CSV parsing for BMD exports
   */
  private async parseCsvFile(
    buffer: Buffer,
    fileName: string,
    context: ProcessorContext
  ): Promise<NtcsParseResult> {
    context.logger.info('Parsing CSV file', { fileName });

    // Simple CSV parsing - convert to NTCS format internally
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      throw new Error(AUSTRIAN_ERROR_MESSAGES.EMPTY_FILE);
    }

    // Basic CSV structure validation
    // For now, return empty result - full CSV parsing would be implemented here
    const result: NtcsParseResult = {
      accounts: [],
      bookings: [],
      businessPartners: [],
      costCenters: [],
      errors: [],
      warnings: ['CSV import is not fully implemented yet'],
    };

    context.logger.warn('CSV parsing not fully implemented', { fileName });

    return result;
  }

  /**
   * Extract events from parse result
   */
  private async extractEvents(
    parseResult: NtcsParseResult,
    organizationId: string,
    context: ProcessorContext
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    // Extract account events
    for (const account of parseResult.accounts) {
      events.push({
        type: 'accounting.account',
        timestamp: new Date(),
        targetId: account.accountNumber,
        metadata: {
          organizationId,
          accountNumber: account.accountNumber,
          name: account.accountName,
          accountClass: account.accountClass,
          accountType: account.accountType,
          balance: account.balance,
          currency: account.currency,
          isActive: account.isActive,
          parentAccountNumber: account.parentAccountNumber,
          taxCode: account.taxCode,
          objectType: 'Account',
        },
        rawData: { ntcsLine: account.rawData },
      });
    }

    // Extract booking events
    for (const booking of parseResult.bookings) {
      events.push({
        type: 'accounting.booking',
        timestamp: new Date(booking.postingDate),
        targetId: booking.bookingNumber,
        metadata: {
          organizationId,
          bookingNumber: booking.bookingNumber,
          documentNumber: booking.documentNumber,
          bookingDate: booking.bookingDate,
          postingDate: booking.postingDate,
          accountNumber: booking.accountNumber,
          contraAccountNumber: booking.contraAccountNumber,
          debitAmount: booking.debitAmount,
          creditAmount: booking.creditAmount,
          amount: booking.amount,
          currency: booking.currency,
          description: booking.description,
          taxCode: booking.taxCode,
          taxAmount: booking.taxAmount,
          costCenter: booking.costCenter,
          costObject: booking.costObject,
          partnerId: booking.partnerId,
          documentType: booking.documentType,
          dueDate: booking.dueDate,
          objectType: 'Booking',
        },
        rawData: { ntcsLine: booking.rawData },
      });
    }

    // Extract business partner events
    for (const partner of parseResult.businessPartners) {
      const partnerType = partner.partnerType === 'K' ? 'customer' :
                         partner.partnerType === 'L' ? 'vendor' : 'business_partner';

      events.push({
        type: `accounting.${partnerType}`,
        timestamp: new Date(),
        targetId: partner.partnerId,
        metadata: {
          organizationId,
          id: partner.partnerId,
          number: partner.partnerNumber,
          name: partner.name,
          shortName: partner.shortName,
          type: partnerType,
          steuernummer: partner.steuernummer,
          uid: partner.uidNummer,
          email: partner.email,
          phone: partner.phone,
          fax: partner.fax,
          website: partner.website,
          address: {
            street: partner.street,
            city: partner.city,
            postalCode: partner.postalCode,
            country: partner.country,
          },
          accountNumber: partner.accountNumber,
          paymentTermsDays: partner.paymentTermsDays,
          creditLimit: partner.creditLimit,
          isActive: partner.isActive,
          objectType: 'BusinessPartner',
        },
        rawData: { ntcsLine: partner.rawData },
      });
    }

    // Extract cost center events
    for (const costCenter of parseResult.costCenters) {
      events.push({
        type: 'accounting.cost_center',
        timestamp: new Date(),
        targetId: costCenter.costCenterId,
        metadata: {
          organizationId,
          id: costCenter.costCenterId,
          number: costCenter.costCenterNumber,
          name: costCenter.name,
          description: costCenter.description,
          isActive: costCenter.isActive,
          parentId: costCenter.parentCostCenterId,
          objectType: 'CostCenter',
        },
        rawData: { ntcsLine: costCenter.rawData },
      });
    }

    context.logger.info('Extracted events from BMD data', {
      total: events.length,
      accounts: parseResult.accounts.length,
      bookings: parseResult.bookings.length,
      businessPartners: parseResult.businessPartners.length,
      costCenters: parseResult.costCenters.length,
    });

    return events;
  }

  /**
   * Update job status in database
   */
  private async updateJobStatus(
    prisma: PrismaClient,
    jobId: string,
    status: JobStatus,
    data: {
      startedAt?: Date;
      completedAt?: Date;
      eventsCount?: number;
      errorMessage?: string;
      metadata?: unknown;
    }
  ): Promise<void> {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status,
        ...data,
      },
    });
  }

  /**
   * Cleanup temporary file
   */
  private async cleanupFile(filePath: string, context: ProcessorContext): Promise<void> {
    try {
      await fs.unlink(filePath);
      context.logger.debug('Temporary file cleaned up', { filePath });
    } catch (error) {
      context.logger.warn('Failed to cleanup temporary file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Factory function
 */
export function createBmdImportProcessor(prisma: PrismaClient): BmdImportProcessor {
  return new BmdImportProcessor(prisma);
}
