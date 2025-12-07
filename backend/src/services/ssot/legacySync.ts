/**
 * Legacy Sync Service
 * Bi-directional sync service for legacy systems
 * T284 - Bi-directional sync service
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getSsotConfig, getSyncDirection } from './ssotConfig.js';
import {
  getMasterRecord,
  getMasterRecordByExternalId,
  createMasterRecord,
  updateMasterRecord,
  markRecordSynced,
  MasterRecord,
  RecordSource,
} from './masterRecordService.js';
import { detectConflicts, autoResolveConflicts } from './conflictResolver.js';
import { trackChange } from './changeTracker.js';

const prisma = new PrismaClient();

export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';
export type SyncDirection = 'inbound' | 'outbound' | 'bidirectional';

export interface SyncJob {
  id: string;
  organizationId: string;
  sourceId: string;
  sourceName: string;
  direction: SyncDirection;
  status: SyncStatus;
  entityTypes: string[];
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  conflictsDetected: number;
  errors: SyncError[];
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SyncError {
  recordId?: string;
  externalId?: string;
  message: string;
  code: string;
  timestamp: Date;
}

export interface SyncRecord {
  externalId: string;
  entityType: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  job: SyncJob;
  records: {
    created: string[];
    updated: string[];
    skipped: string[];
    failed: string[];
  };
  conflicts: string[];
}

export interface OutboundSyncResult {
  recordId: string;
  externalId: string;
  success: boolean;
  error?: string;
}

/**
 * Start a new sync job
 */
export async function startSyncJob(
  organizationId: string,
  sourceId: string,
  sourceName: string,
  direction: SyncDirection,
  entityTypes: string[]
): Promise<SyncJob> {
  const syncDirection = await getSyncDirection(organizationId);

  // Validate direction is allowed
  if (
    direction === 'outbound' &&
    syncDirection === 'read_only'
  ) {
    throw new Error('Outbound sync is not enabled for this organization');
  }

  const job = await prisma.syncJob.create({
    data: {
      id: uuidv4(),
      organizationId,
      sourceId,
      sourceName,
      direction,
      status: 'pending',
      entityTypes,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      conflictsDetected: 0,
      errors: [],
      startedAt: new Date(),
    },
  });

  return transformSyncJob(job);
}

/**
 * Process inbound sync (from legacy system to SSOT)
 */
export async function processInboundSync(
  organizationId: string,
  jobId: string,
  records: SyncRecord[],
  userId: string
): Promise<SyncResult> {
  const job = await getSyncJob(organizationId, jobId);
  if (!job) {
    throw new Error('Sync job not found');
  }

  // Update job status
  await updateSyncJobStatus(jobId, 'in_progress');

  const result: SyncResult = {
    job,
    records: {
      created: [],
      updated: [],
      skipped: [],
      failed: [],
    },
    conflicts: [],
  };

  const config = await getSsotConfig(organizationId);

  for (const record of records) {
    try {
      // Check if entity type is enabled
      if (!config.enabledEntityTypes.includes(record.entityType)) {
        result.records.skipped.push(record.externalId);
        continue;
      }

      // Check for existing master record
      const existing = await getMasterRecordByExternalId(
        organizationId,
        record.entityType,
        record.externalId
      );

      if (existing) {
        // Detect conflicts
        const conflicts = await detectConflicts(
          organizationId,
          existing.id,
          job.sourceId,
          job.sourceName,
          record.data
        );

        if (conflicts.length > 0) {
          result.conflicts.push(...conflicts.map((c) => c.id));

          // Auto-resolve if configured
          if (config.autoMergeEnabled) {
            await autoResolveConflicts(
              organizationId,
              conflicts.map((c) => c.id)
            );
          }
        }

        // Update record with non-conflicting fields
        const nonConflictingData = getNonConflictingFields(
          existing.data,
          record.data,
          conflicts.map((c) => c.field || '')
        );

        if (Object.keys(nonConflictingData).length > 0) {
          await updateMasterRecord(
            organizationId,
            existing.id,
            { data: { ...existing.data, ...nonConflictingData } },
            userId
          );
        }

        // Update source info
        await updateRecordSource(
          organizationId,
          existing.id,
          job.sourceId,
          job.sourceName,
          record.externalId
        );

        result.records.updated.push(existing.id);
      } else {
        // Create new master record
        const newRecord = await createMasterRecord(
          organizationId,
          {
            entityType: record.entityType,
            externalId: record.externalId,
            data: record.data,
            metadata: record.metadata,
            sources: [
              {
                sourceId: job.sourceId,
                sourceName: job.sourceName,
                sourceType: 'legacy',
                externalId: record.externalId,
                lastSyncedAt: new Date(),
                syncStatus: 'synced',
                fieldContributions: Object.fromEntries(
                  Object.keys(record.data).map((k) => [k, true])
                ),
              },
            ],
          },
          userId
        );

        result.records.created.push(newRecord.id);
      }
    } catch (error) {
      result.records.failed.push(record.externalId);
      await addSyncJobError(jobId, {
        externalId: record.externalId,
        message: (error as Error).message,
        code: 'PROCESS_ERROR',
        timestamp: new Date(),
      });
    }
  }

  // Update job with results
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: result.records.failed.length > 0 ? 'partial' : 'completed',
      recordsProcessed: records.length,
      recordsCreated: result.records.created.length,
      recordsUpdated: result.records.updated.length,
      recordsSkipped: result.records.skipped.length,
      conflictsDetected: result.conflicts.length,
      completedAt: new Date(),
    },
  });

  result.job = (await getSyncJob(organizationId, jobId))!;
  return result;
}

/**
 * Process outbound sync (from SSOT to legacy system)
 */
export async function getOutboundSyncRecords(
  organizationId: string,
  sourceId: string,
  entityTypes: string[],
  options?: {
    since?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{
  records: Array<{
    masterRecordId: string;
    externalId?: string;
    entityType: string;
    data: Record<string, unknown>;
    lastSyncedAt?: Date;
    syncRequired: boolean;
  }>;
  total: number;
}> {
  const syncDirection = await getSyncDirection(organizationId);

  if (syncDirection === 'read_only') {
    return { records: [], total: 0 };
  }

  const where: Record<string, unknown> = {
    organizationId,
    entityType: { in: entityTypes },
    status: { not: 'deleted' },
  };

  if (options?.since) {
    where.updatedAt = { gte: options.since };
  }

  const [records, total] = await Promise.all([
    prisma.masterRecord.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    }),
    prisma.masterRecord.count({ where }),
  ]);

  return {
    records: records.map((r) => {
      const sources = r.sources as unknown as RecordSource[];
      const sourceInfo = sources?.find((s) => s.sourceId === sourceId);

      return {
        masterRecordId: r.id,
        externalId: sourceInfo?.externalId || r.externalId || undefined,
        entityType: r.entityType,
        data: r.data as Record<string, unknown>,
        lastSyncedAt: sourceInfo?.lastSyncedAt,
        syncRequired: !sourceInfo || sourceInfo.lastSyncedAt < r.updatedAt,
      };
    }),
    total,
  };
}

/**
 * Mark records as synced to external system
 */
export async function markRecordsSynced(
  organizationId: string,
  sourceId: string,
  results: OutboundSyncResult[]
): Promise<void> {
  for (const result of results) {
    if (result.success) {
      await markRecordSynced(organizationId, result.recordId, sourceId);
    }
  }
}

/**
 * Get sync job by ID
 */
export async function getSyncJob(
  organizationId: string,
  jobId: string
): Promise<SyncJob | null> {
  const job = await prisma.syncJob.findFirst({
    where: {
      id: jobId,
      organizationId,
    },
  });

  return job ? transformSyncJob(job) : null;
}

/**
 * Get sync jobs for an organization
 */
export async function getSyncJobs(
  organizationId: string,
  options?: {
    sourceId?: string;
    status?: SyncStatus;
    direction?: SyncDirection;
    limit?: number;
    offset?: number;
  }
): Promise<{ jobs: SyncJob[]; total: number }> {
  const where: Record<string, unknown> = {
    organizationId,
  };

  if (options?.sourceId) {
    where.sourceId = options.sourceId;
  }

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.direction) {
    where.direction = options.direction;
  }

  const [jobs, total] = await Promise.all([
    prisma.syncJob.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.syncJob.count({ where }),
  ]);

  return {
    jobs: jobs.map(transformSyncJob),
    total,
  };
}

/**
 * Get sync status for a source
 */
export async function getSyncStatus(
  organizationId: string,
  sourceId: string
): Promise<{
  lastSync?: Date;
  lastStatus?: SyncStatus;
  recordCount: number;
  pendingConflicts: number;
  recentJobs: SyncJob[];
}> {
  const [lastJob, recordCount, pendingConflicts, recentJobs] = await Promise.all([
    prisma.syncJob.findFirst({
      where: { organizationId, sourceId },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.masterRecord.count({
      where: {
        organizationId,
        sources: {
          path: '$[*].sourceId',
          array_contains: sourceId,
        },
      },
    }),
    prisma.dataConflict.count({
      where: {
        organizationId,
        sourceId,
        status: 'pending',
      },
    }),
    prisma.syncJob.findMany({
      where: { organizationId, sourceId },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    lastSync: lastJob?.completedAt || lastJob?.startedAt,
    lastStatus: lastJob?.status as SyncStatus | undefined,
    recordCount,
    pendingConflicts,
    recentJobs: recentJobs.map(transformSyncJob),
  };
}

/**
 * Retry failed sync job
 */
export async function retrySyncJob(
  organizationId: string,
  jobId: string
): Promise<SyncJob> {
  const originalJob = await getSyncJob(organizationId, jobId);
  if (!originalJob) {
    throw new Error('Sync job not found');
  }

  if (originalJob.status !== 'failed' && originalJob.status !== 'partial') {
    throw new Error('Job cannot be retried');
  }

  // Create a new retry job
  const retryJob = await prisma.syncJob.create({
    data: {
      id: uuidv4(),
      organizationId,
      sourceId: originalJob.sourceId,
      sourceName: originalJob.sourceName,
      direction: originalJob.direction,
      status: 'pending',
      entityTypes: originalJob.entityTypes,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      conflictsDetected: 0,
      errors: [],
      startedAt: new Date(),
      metadata: {
        retryOf: jobId,
      },
    },
  });

  return transformSyncJob(retryJob);
}

// Helper functions

async function updateSyncJobStatus(
  jobId: string,
  status: SyncStatus
): Promise<void> {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: { status },
  });
}

async function addSyncJobError(
  jobId: string,
  error: SyncError
): Promise<void> {
  const job = await prisma.syncJob.findUnique({
    where: { id: jobId },
    select: { errors: true },
  });

  const errors = (job?.errors as SyncError[]) || [];
  errors.push(error);

  await prisma.syncJob.update({
    where: { id: jobId },
    data: { errors: errors as unknown as Record<string, unknown>[] },
  });
}

async function updateRecordSource(
  organizationId: string,
  masterRecordId: string,
  sourceId: string,
  sourceName: string,
  externalId: string
): Promise<void> {
  const record = await getMasterRecord(organizationId, masterRecordId);
  if (!record) return;

  const existingSourceIndex = record.sources.findIndex(
    (s) => s.sourceId === sourceId
  );

  const newSource: RecordSource = {
    sourceId,
    sourceName,
    sourceType: 'legacy',
    externalId,
    lastSyncedAt: new Date(),
    syncStatus: 'synced',
    fieldContributions: {},
  };

  let newSources: RecordSource[];
  if (existingSourceIndex >= 0) {
    newSources = [...record.sources];
    newSources[existingSourceIndex] = {
      ...newSources[existingSourceIndex],
      ...newSource,
    };
  } else {
    newSources = [...record.sources, newSource];
  }

  await prisma.masterRecord.update({
    where: { id: masterRecordId },
    data: {
      sources: newSources as unknown as Record<string, unknown>[],
      lastSyncedAt: new Date(),
    },
  });
}

function getNonConflictingFields(
  masterData: Record<string, unknown>,
  sourceData: Record<string, unknown>,
  conflictFields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(sourceData)) {
    // Skip if this field has a conflict
    if (conflictFields.includes(field)) {
      continue;
    }

    // Skip if master already has a non-empty value
    const masterValue = masterData[field];
    if (
      masterValue !== null &&
      masterValue !== undefined &&
      masterValue !== ''
    ) {
      continue;
    }

    // Add if source has a value
    if (value !== null && value !== undefined && value !== '') {
      result[field] = value;
    }
  }

  return result;
}

function transformSyncJob(job: Record<string, unknown>): SyncJob {
  return {
    id: job.id as string,
    organizationId: job.organizationId as string,
    sourceId: job.sourceId as string,
    sourceName: job.sourceName as string,
    direction: job.direction as SyncDirection,
    status: job.status as SyncStatus,
    entityTypes: job.entityTypes as string[],
    recordsProcessed: job.recordsProcessed as number,
    recordsCreated: job.recordsCreated as number,
    recordsUpdated: job.recordsUpdated as number,
    recordsSkipped: job.recordsSkipped as number,
    conflictsDetected: job.conflictsDetected as number,
    errors: (job.errors as SyncError[]) || [],
    startedAt: job.startedAt as Date,
    completedAt: job.completedAt as Date | undefined,
    metadata: job.metadata as Record<string, unknown> | undefined,
  };
}

export default {
  startSyncJob,
  processInboundSync,
  getOutboundSyncRecords,
  markRecordsSynced,
  getSyncJob,
  getSyncJobs,
  getSyncStatus,
  retrySyncJob,
};
