/**
 * Conflict Resolution Service
 * Handles data conflicts between sources and SSOT
 * T283 - Conflict resolution service
 */

import { v4 as uuidv4 } from 'uuid';
import { getSsotConfig } from './ssotConfig.js';
import { getMasterRecord, updateMasterRecord, MasterRecord } from './masterRecordService.js';
import { trackChange } from './changeTracker.js';
import { prisma } from '../../lib/prisma.js';

export type ConflictStatus = 'pending' | 'resolved' | 'ignored' | 'escalated';
export type ConflictType = 'field_value' | 'record_existence' | 'relationship' | 'schema';
export type ResolutionStrategy = 'keep_master' | 'accept_source' | 'merge' | 'manual';

export interface DataConflict {
  id: string;
  organizationId: string;
  masterRecordId: string;
  sourceId: string;
  sourceName: string;
  conflictType: ConflictType;
  status: ConflictStatus;
  field?: string;
  masterValue: unknown;
  sourceValue: unknown;
  detectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: ResolutionStrategy;
  resolutionNotes?: string;
  metadata?: Record<string, unknown>;
}

export interface ConflictInput {
  masterRecordId: string;
  sourceId: string;
  sourceName: string;
  conflictType: ConflictType;
  field?: string;
  masterValue: unknown;
  sourceValue: unknown;
  metadata?: Record<string, unknown>;
}

export interface ConflictQuery {
  masterRecordId?: string;
  sourceId?: string;
  status?: ConflictStatus;
  conflictType?: ConflictType;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ResolutionResult {
  conflict: DataConflict;
  masterRecord?: MasterRecord;
  appliedChanges: boolean;
}

export interface BulkConflictResult {
  resolved: number;
  failed: number;
  errors: Array<{ conflictId: string; error: string }>;
}

/**
 * Create a new conflict record
 */
export async function createConflict(
  organizationId: string,
  input: ConflictInput
): Promise<DataConflict> {
  // Check for existing unresolved conflict on same field
  const existing = await prisma.dataConflict.findFirst({
    where: {
      organizationId,
      masterRecordId: input.masterRecordId,
      sourceId: input.sourceId,
      field: input.field,
      status: 'pending',
    },
  });

  if (existing) {
    // Update existing conflict with new source value
    const updated = await prisma.dataConflict.update({
      where: { id: existing.id },
      data: {
        sourceValue: input.sourceValue as Record<string, unknown>,
        detectedAt: new Date(),
      },
    });
    return transformConflict(updated);
  }

  const conflict = await prisma.dataConflict.create({
    data: {
      id: uuidv4(),
      organizationId,
      masterRecordId: input.masterRecordId,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      conflictType: input.conflictType,
      status: 'pending',
      field: input.field,
      masterValue: input.masterValue as Record<string, unknown>,
      sourceValue: input.sourceValue as Record<string, unknown>,
      detectedAt: new Date(),
      metadata: input.metadata || {},
    },
  });

  return transformConflict(conflict);
}

/**
 * Detect conflicts between master record and source data
 */
export async function detectConflicts(
  organizationId: string,
  masterRecordId: string,
  sourceId: string,
  sourceName: string,
  sourceData: Record<string, unknown>
): Promise<DataConflict[]> {
  const masterRecord = await getMasterRecord(organizationId, masterRecordId);
  if (!masterRecord) {
    throw new Error('Master record not found');
  }

  const conflicts: DataConflict[] = [];
  const masterData = masterRecord.data;

  // Compare each field
  for (const [field, sourceValue] of Object.entries(sourceData)) {
    const masterValue = masterData[field];

    // Skip if values are equal
    if (JSON.stringify(masterValue) === JSON.stringify(sourceValue)) {
      continue;
    }

    // Skip if source value is empty and master has value
    if (
      (sourceValue === null || sourceValue === undefined || sourceValue === '') &&
      masterValue !== null &&
      masterValue !== undefined &&
      masterValue !== ''
    ) {
      continue;
    }

    // Create conflict if master has value and source has different non-empty value
    if (
      masterValue !== null &&
      masterValue !== undefined &&
      sourceValue !== null &&
      sourceValue !== undefined
    ) {
      const conflict = await createConflict(organizationId, {
        masterRecordId,
        sourceId,
        sourceName,
        conflictType: 'field_value',
        field,
        masterValue,
        sourceValue,
      });
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Get a conflict by ID
 */
export async function getConflict(
  organizationId: string,
  conflictId: string
): Promise<DataConflict | null> {
  const conflict = await prisma.dataConflict.findFirst({
    where: {
      id: conflictId,
      organizationId,
    },
  });

  return conflict ? transformConflict(conflict) : null;
}

/**
 * Query conflicts
 */
export async function queryConflicts(
  organizationId: string,
  query: ConflictQuery
): Promise<{ conflicts: DataConflict[]; total: number }> {
  const where: Record<string, unknown> = {
    organizationId,
  };

  if (query.masterRecordId) {
    where.masterRecordId = query.masterRecordId;
  }

  if (query.sourceId) {
    where.sourceId = query.sourceId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.conflictType) {
    where.conflictType = query.conflictType;
  }

  if (query.fromDate || query.toDate) {
    where.detectedAt = {};
    if (query.fromDate) {
      (where.detectedAt as Record<string, Date>).gte = query.fromDate;
    }
    if (query.toDate) {
      (where.detectedAt as Record<string, Date>).lte = query.toDate;
    }
  }

  const [conflicts, total] = await Promise.all([
    prisma.dataConflict.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: query.limit || 50,
      skip: query.offset || 0,
    }),
    prisma.dataConflict.count({ where }),
  ]);

  return {
    conflicts: conflicts.map(transformConflict),
    total,
  };
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  organizationId: string,
  conflictId: string,
  resolution: ResolutionStrategy,
  resolvedBy: string,
  options?: {
    mergedValue?: unknown;
    notes?: string;
  }
): Promise<ResolutionResult> {
  const conflict = await getConflict(organizationId, conflictId);
  if (!conflict) {
    throw new Error('Conflict not found');
  }

  if (conflict.status !== 'pending') {
    throw new Error('Conflict already resolved');
  }

  let appliedChanges = false;
  let masterRecord: MasterRecord | undefined;

  // Apply resolution based on strategy
  switch (resolution) {
    case 'keep_master':
      // No changes to master record
      break;

    case 'accept_source':
      if (conflict.field) {
        masterRecord = await applyFieldChange(
          organizationId,
          conflict.masterRecordId,
          conflict.field,
          conflict.sourceValue,
          resolvedBy,
          conflict.sourceId
        );
        appliedChanges = true;
      }
      break;

    case 'merge':
      if (conflict.field && options?.mergedValue !== undefined) {
        masterRecord = await applyFieldChange(
          organizationId,
          conflict.masterRecordId,
          conflict.field,
          options.mergedValue,
          resolvedBy,
          'merge'
        );
        appliedChanges = true;
      }
      break;

    case 'manual':
      // Handled externally, just mark as resolved
      break;
  }

  // Update conflict status
  const updated = await prisma.dataConflict.update({
    where: { id: conflictId },
    data: {
      status: 'resolved',
      resolution,
      resolvedAt: new Date(),
      resolvedBy,
      resolutionNotes: options?.notes,
    },
  });

  return {
    conflict: transformConflict(updated),
    masterRecord,
    appliedChanges,
  };
}

/**
 * Auto-resolve conflicts based on configuration
 */
export async function autoResolveConflicts(
  organizationId: string,
  conflictIds?: string[]
): Promise<BulkConflictResult> {
  const config = await getSsotConfig(organizationId);
  const strategy = config.conflictResolution;

  const where: Record<string, unknown> = {
    organizationId,
    status: 'pending',
  };

  if (conflictIds && conflictIds.length > 0) {
    where.id = { in: conflictIds };
  }

  const conflicts = await prisma.dataConflict.findMany({ where });

  let resolved = 0;
  const errors: Array<{ conflictId: string; error: string }> = [];

  for (const conflict of conflicts) {
    try {
      let resolution: ResolutionStrategy;

      switch (strategy) {
        case 'newest_wins':
          // Accept source value (assuming source is newer)
          resolution = 'accept_source';
          break;

        case 'source_priority':
          // Check source priority
          const sourcePriority = config.sourcePriority.indexOf(conflict.sourceId);
          resolution = sourcePriority === 0 ? 'accept_source' : 'keep_master';
          break;

        case 'manual_review':
        default:
          // Skip auto-resolution
          continue;
      }

      await resolveConflict(
        organizationId,
        conflict.id,
        resolution,
        'system',
        { notes: `Auto-resolved using ${strategy} strategy` }
      );
      resolved++;
    } catch (error) {
      errors.push({
        conflictId: conflict.id,
        error: (error as Error).message,
      });
    }
  }

  return {
    resolved,
    failed: errors.length,
    errors,
  };
}

/**
 * Ignore a conflict
 */
export async function ignoreConflict(
  organizationId: string,
  conflictId: string,
  ignoredBy: string,
  reason?: string
): Promise<DataConflict> {
  const conflict = await getConflict(organizationId, conflictId);
  if (!conflict) {
    throw new Error('Conflict not found');
  }

  const updated = await prisma.dataConflict.update({
    where: { id: conflictId },
    data: {
      status: 'ignored',
      resolvedAt: new Date(),
      resolvedBy: ignoredBy,
      resolutionNotes: reason || 'Ignored by user',
    },
  });

  return transformConflict(updated);
}

/**
 * Escalate a conflict for review
 */
export async function escalateConflict(
  organizationId: string,
  conflictId: string,
  escalatedBy: string,
  reason?: string
): Promise<DataConflict> {
  const conflict = await getConflict(organizationId, conflictId);
  if (!conflict) {
    throw new Error('Conflict not found');
  }

  const updated = await prisma.dataConflict.update({
    where: { id: conflictId },
    data: {
      status: 'escalated',
      metadata: {
        ...(conflict.metadata || {}),
        escalatedBy,
        escalatedAt: new Date().toISOString(),
        escalationReason: reason,
      },
    },
  });

  return transformConflict(updated);
}

/**
 * Get conflict statistics
 */
export async function getConflictStats(organizationId: string): Promise<{
  total: number;
  pending: number;
  resolved: number;
  ignored: number;
  escalated: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
  avgResolutionTime: number;
}> {
  const [total, byStatus, bySource, byType, avgResolution] = await Promise.all([
    prisma.dataConflict.count({ where: { organizationId } }),
    prisma.dataConflict.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: true,
    }),
    prisma.dataConflict.groupBy({
      by: ['sourceId'],
      where: { organizationId },
      _count: true,
    }),
    prisma.dataConflict.groupBy({
      by: ['conflictType'],
      where: { organizationId },
      _count: true,
    }),
    prisma.$queryRaw<[{ avg: number }]>`
      SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at))) as avg
      FROM data_conflicts
      WHERE organization_id = ${organizationId}
        AND resolved_at IS NOT NULL
    `,
  ]);

  const statusCounts = Object.fromEntries(
    byStatus.map((s) => [s.status, s._count])
  );

  return {
    total,
    pending: statusCounts.pending || 0,
    resolved: statusCounts.resolved || 0,
    ignored: statusCounts.ignored || 0,
    escalated: statusCounts.escalated || 0,
    bySource: Object.fromEntries(bySource.map((s) => [s.sourceId, s._count])),
    byType: Object.fromEntries(byType.map((t) => [t.conflictType, t._count])),
    avgResolutionTime: avgResolution[0]?.avg || 0,
  };
}

// Helper functions

async function applyFieldChange(
  organizationId: string,
  masterRecordId: string,
  field: string,
  newValue: unknown,
  changedBy: string,
  source: string
): Promise<MasterRecord> {
  const masterRecord = await getMasterRecord(organizationId, masterRecordId);
  if (!masterRecord) {
    throw new Error('Master record not found');
  }

  const previousData = { ...masterRecord.data };
  const newData = { ...masterRecord.data, [field]: newValue };

  // Track the change
  await trackChange(
    organizationId,
    masterRecordId,
    'update',
    previousData,
    newData,
    changedBy,
    { source, reason: 'Conflict resolution' }
  );

  // Update the master record
  return updateMasterRecord(organizationId, masterRecordId, { data: newData }, changedBy);
}

function transformConflict(record: Record<string, unknown>): DataConflict {
  return {
    id: record.id as string,
    organizationId: record.organizationId as string,
    masterRecordId: record.masterRecordId as string,
    sourceId: record.sourceId as string,
    sourceName: record.sourceName as string,
    conflictType: record.conflictType as ConflictType,
    status: record.status as ConflictStatus,
    field: record.field as string | undefined,
    masterValue: record.masterValue,
    sourceValue: record.sourceValue,
    detectedAt: record.detectedAt as Date,
    resolvedAt: record.resolvedAt as Date | undefined,
    resolvedBy: record.resolvedBy as string | undefined,
    resolution: record.resolution as ResolutionStrategy | undefined,
    resolutionNotes: record.resolutionNotes as string | undefined,
    metadata: record.metadata as Record<string, unknown> | undefined,
  };
}

export default {
  createConflict,
  detectConflicts,
  getConflict,
  queryConflicts,
  resolveConflict,
  autoResolveConflicts,
  ignoreConflict,
  escalateConflict,
  getConflictStats,
};
