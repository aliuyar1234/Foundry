/**
 * External Enrichment Job Processor
 * Processes batch enrichment jobs from external data sources
 * T309 - Enrichment job processor
 */

import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import {
  enrichCompany,
  enrichCompanies,
  EnrichmentField,
  EnrichmentResult,
  BulkEnrichmentResult,
} from '../../services/enrichment/companyEnricher.js';
import {
  AddressValidator,
  createAddressValidator,
  ValidationResult,
} from '../../services/enrichment/addressValidator.js';

export interface EnrichmentJobData {
  organizationId: string;
  jobType: 'company' | 'address' | 'bulk_company' | 'bulk_address';
  entityIds: string[];
  entityType: 'company' | 'organization' | 'supplier' | 'customer';
  fields?: EnrichmentField[];
  options?: EnrichmentJobOptions;
  requestedBy: string;
}

export interface EnrichmentJobOptions {
  overwriteExisting?: boolean;
  validateOnly?: boolean;
  continueOnError?: boolean;
  batchSize?: number;
  countryCode?: string;
  notifyOnComplete?: boolean;
}

export interface EnrichmentJobResult {
  jobId: string;
  status: 'completed' | 'partial' | 'failed';
  totalEntities: number;
  enriched: number;
  failed: number;
  skipped: number;
  results: Array<EnrichmentResult | ValidationResult>;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  errors: string[];
}

export interface EnrichmentJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  processedCount: number;
  totalCount: number;
  currentEntity?: string;
  estimatedCompletion?: Date;
  startedAt?: Date;
  errors: string[];
}

const QUEUE_NAME = 'external-enrichment';
const CONCURRENCY = 3;

// Job status tracking
const jobStatuses = new Map<string, EnrichmentJobStatus>();

/**
 * Create the enrichment queue
 */
export function createEnrichmentQueue(redisConnection: { host: string; port: number }): Queue<EnrichmentJobData> {
  return new Queue<EnrichmentJobData>(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });
}

/**
 * Create the enrichment worker
 */
export function createEnrichmentWorker(
  redisConnection: { host: string; port: number }
): Worker<EnrichmentJobData, EnrichmentJobResult> {
  const worker = new Worker<EnrichmentJobData, EnrichmentJobResult>(
    QUEUE_NAME,
    async (job) => {
      return processEnrichmentJob(job);
    },
    {
      connection: redisConnection,
      concurrency: CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    console.log(`Enrichment job ${job.id} completed`);
    updateJobStatus(job.id!, 'completed', 100);
  });

  worker.on('failed', (job, error) => {
    console.error(`Enrichment job ${job?.id} failed:`, error);
    if (job?.id) {
      updateJobStatus(job.id, 'failed', 0, error.message);
    }
  });

  worker.on('progress', (job, progress) => {
    if (typeof progress === 'number') {
      updateJobStatus(job.id!, 'processing', progress);
    }
  });

  return worker;
}

/**
 * Process an enrichment job
 */
async function processEnrichmentJob(
  job: Job<EnrichmentJobData>
): Promise<EnrichmentJobResult> {
  const { data } = job;
  const startedAt = new Date();
  const errors: string[] = [];

  // Initialize job status
  initJobStatus(job.id!, data.entityIds.length);

  // Update job status
  await job.updateProgress(0);

  let results: Array<EnrichmentResult | ValidationResult> = [];

  try {
    switch (data.jobType) {
      case 'company':
      case 'bulk_company':
        results = await processCompanyEnrichment(job, data);
        break;

      case 'address':
      case 'bulk_address':
        results = await processAddressValidation(job, data);
        break;

      default:
        throw new Error(`Unknown job type: ${data.jobType}`);
    }
  } catch (error) {
    errors.push((error as Error).message);
  }

  const completedAt = new Date();
  const enriched = results.filter((r) => 'success' in r ? r.success : r.isValid).length;
  const failed = results.filter((r) => 'success' in r ? !r.success : !r.isValid).length;
  const skipped = data.entityIds.length - results.length;

  // Store job result
  await storeJobResult(job.id!, {
    organizationId: data.organizationId,
    jobType: data.jobType,
    totalEntities: data.entityIds.length,
    enriched,
    failed,
    skipped,
    duration: completedAt.getTime() - startedAt.getTime(),
    requestedBy: data.requestedBy,
    startedAt,
    completedAt,
  });

  // Notify if requested
  if (data.options?.notifyOnComplete) {
    await sendCompletionNotification(data.organizationId, data.requestedBy, {
      jobId: job.id!,
      enriched,
      failed,
      skipped,
    });
  }

  return {
    jobId: job.id!,
    status: failed === 0 ? 'completed' : failed < results.length ? 'partial' : 'failed',
    totalEntities: data.entityIds.length,
    enriched,
    failed,
    skipped,
    results,
    startedAt,
    completedAt,
    duration: completedAt.getTime() - startedAt.getTime(),
    errors,
  };
}

/**
 * Process company enrichment
 */
async function processCompanyEnrichment(
  job: Job<EnrichmentJobData>,
  data: EnrichmentJobData
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];
  const batchSize = data.options?.batchSize || 10;
  const totalEntities = data.entityIds.length;

  for (let i = 0; i < totalEntities; i += batchSize) {
    const batch = data.entityIds.slice(i, i + batchSize);

    // Update progress
    const progress = Math.round((i / totalEntities) * 100);
    await job.updateProgress(progress);
    updateJobStatus(job.id!, 'processing', progress, undefined, batch[0]);

    // Process batch
    const batchResults = await Promise.all(
      batch.map(async (entityId) => {
        try {
          return await enrichCompany(data.organizationId, {
            entityId,
            entityType: data.entityType,
            fields: data.fields || ['all'],
            overwriteExisting: data.options?.overwriteExisting,
          });
        } catch (error) {
          return {
            entityId,
            success: false,
            fieldsEnriched: [],
            fieldsSkipped: [],
            errors: [{ field: 'system', code: 'ERROR', message: (error as Error).message }],
            source: 'none',
            matchConfidence: 0,
            enrichedData: {},
            timestamp: new Date(),
          } as EnrichmentResult;
        }
      })
    );

    results.push(...batchResults);

    // Check for early termination
    if (!data.options?.continueOnError) {
      const hasError = batchResults.some((r) => !r.success);
      if (hasError) {
        break;
      }
    }

    // Small delay between batches to avoid rate limiting
    await delay(100);
  }

  return results;
}

/**
 * Process address validation
 */
async function processAddressValidation(
  job: Job<EnrichmentJobData>,
  data: EnrichmentJobData
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const validator = createAddressValidator(data.options?.countryCode);
  const batchSize = data.options?.batchSize || 20;
  const totalEntities = data.entityIds.length;

  for (let i = 0; i < totalEntities; i += batchSize) {
    const batch = data.entityIds.slice(i, i + batchSize);

    // Update progress
    const progress = Math.round((i / totalEntities) * 100);
    await job.updateProgress(progress);
    updateJobStatus(job.id!, 'processing', progress, undefined, batch[0]);

    // Get entity addresses
    const entities = await prisma.entityRecord.findMany({
      where: {
        id: { in: batch },
        organizationId: data.organizationId,
      },
    });

    // Validate addresses
    for (const entity of entities) {
      try {
        const entityData = entity.data as Record<string, unknown>;
        const address = {
          street: entityData.street as string,
          houseNumber: entityData.houseNumber as string,
          postalCode: entityData.postalCode as string,
          city: entityData.city as string,
          country: entityData.country as string,
          countryCode: entityData.countryCode as string,
        };

        const result = await validator.validate(address);
        results.push(result);

        // Update entity if validation successful and not validate-only
        if (result.isValid && result.validatedAddress && !data.options?.validateOnly) {
          await prisma.entityRecord.update({
            where: { id: entity.id },
            data: {
              data: {
                ...entityData,
                street: result.validatedAddress.street,
                houseNumber: result.validatedAddress.houseNumber,
                postalCode: result.validatedAddress.postalCode,
                city: result.validatedAddress.city,
                country: result.validatedAddress.country,
                countryCode: result.validatedAddress.countryCode,
                latitude: result.validatedAddress.latitude,
                longitude: result.validatedAddress.longitude,
                addressValidated: true,
                addressValidatedAt: new Date(),
              },
              updatedAt: new Date(),
            },
          });
        }
      } catch (error) {
        results.push({
          isValid: false,
          confidence: 0,
          originalAddress: {},
          issues: [{ field: 'system', code: 'INCOMPLETE_ADDRESS', message: (error as Error).message }],
          source: 'error',
        });
      }
    }

    // Small delay between batches
    await delay(50);
  }

  return results;
}

/**
 * Queue a new enrichment job
 */
export async function queueEnrichmentJob(
  queue: Queue<EnrichmentJobData>,
  data: EnrichmentJobData
): Promise<string> {
  const job = await queue.add('enrich', data, {
    priority: data.entityIds.length > 100 ? 2 : 1, // Lower priority for large jobs
  });

  return job.id!;
}

/**
 * Get job status
 */
export function getEnrichmentJobStatus(jobId: string): EnrichmentJobStatus | null {
  return jobStatuses.get(jobId) || null;
}

/**
 * Get all active jobs for an organization
 */
export async function getActiveEnrichmentJobs(
  queue: Queue<EnrichmentJobData>,
  organizationId: string
): Promise<Array<{ jobId: string; status: EnrichmentJobStatus }>> {
  const activeJobs = await queue.getJobs(['waiting', 'active', 'delayed']);

  const orgJobs = activeJobs.filter(
    (job) => job.data.organizationId === organizationId
  );

  return orgJobs.map((job) => ({
    jobId: job.id!,
    status: jobStatuses.get(job.id!) || {
      jobId: job.id!,
      status: 'queued',
      progress: 0,
      processedCount: 0,
      totalCount: job.data.entityIds.length,
      errors: [],
    },
  }));
}

/**
 * Cancel an enrichment job
 */
export async function cancelEnrichmentJob(
  queue: Queue<EnrichmentJobData>,
  jobId: string
): Promise<boolean> {
  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    jobStatuses.delete(jobId);
    return true;
  }

  return false;
}

// Helper functions

function initJobStatus(jobId: string, totalCount: number): void {
  jobStatuses.set(jobId, {
    jobId,
    status: 'queued',
    progress: 0,
    processedCount: 0,
    totalCount,
    startedAt: new Date(),
    errors: [],
  });
}

function updateJobStatus(
  jobId: string,
  status: EnrichmentJobStatus['status'],
  progress: number,
  error?: string,
  currentEntity?: string
): void {
  const current = jobStatuses.get(jobId);
  if (!current) return;

  const updated: EnrichmentJobStatus = {
    ...current,
    status,
    progress,
    processedCount: Math.round((progress / 100) * current.totalCount),
    currentEntity,
  };

  if (error) {
    updated.errors.push(error);
  }

  // Estimate completion time
  if (progress > 0 && progress < 100 && current.startedAt) {
    const elapsed = Date.now() - current.startedAt.getTime();
    const estimated = (elapsed / progress) * (100 - progress);
    updated.estimatedCompletion = new Date(Date.now() + estimated);
  }

  jobStatuses.set(jobId, updated);
}

async function storeJobResult(
  jobId: string,
  result: {
    organizationId: string;
    jobType: string;
    totalEntities: number;
    enriched: number;
    failed: number;
    skipped: number;
    duration: number;
    requestedBy: string;
    startedAt: Date;
    completedAt: Date;
  }
): Promise<void> {
  await prisma.enrichmentJob.create({
    data: {
      id: jobId,
      organizationId: result.organizationId,
      jobType: result.jobType,
      totalEntities: result.totalEntities,
      enrichedCount: result.enriched,
      failedCount: result.failed,
      skippedCount: result.skipped,
      duration: result.duration,
      requestedBy: result.requestedBy,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.failed === 0 ? 'completed' : 'partial',
    },
  });
}

async function sendCompletionNotification(
  organizationId: string,
  userId: string,
  summary: { jobId: string; enriched: number; failed: number; skipped: number }
): Promise<void> {
  // In production, this would send an email or push notification
  console.log(`Enrichment job ${summary.jobId} completed for org ${organizationId}`);
  console.log(`Results: ${summary.enriched} enriched, ${summary.failed} failed, ${summary.skipped} skipped`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  createEnrichmentQueue,
  createEnrichmentWorker,
  queueEnrichmentJob,
  getEnrichmentJobStatus,
  getActiveEnrichmentJobs,
  cancelEnrichmentJob,
};
