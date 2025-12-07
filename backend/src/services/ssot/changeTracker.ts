/**
 * Change Tracker Service
 * Tracks changes and versions for master records
 * T282 - Change tracking and versioning
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { MasterRecord } from './masterRecordService.js';

const prisma = new PrismaClient();

export type ChangeType = 'create' | 'update' | 'delete' | 'merge' | 'sync';

export interface ChangeRecord {
  id: string;
  organizationId: string;
  masterRecordId: string;
  changeType: ChangeType;
  version: number;
  previousVersion?: number;
  changedFields: string[];
  previousData?: Record<string, unknown>;
  newData: Record<string, unknown>;
  changedBy: string;
  source?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface VersionSnapshot {
  id: string;
  masterRecordId: string;
  organizationId: string;
  version: number;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  qualityScore: number;
  changedBy: string;
  createdAt: Date;
}

export interface ChangeQuery {
  masterRecordId?: string;
  entityType?: string;
  changeType?: ChangeType;
  changedBy?: string;
  source?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface FieldChange {
  field: string;
  previousValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'modified' | 'removed';
}

/**
 * Record a change to a master record
 */
export async function trackChange(
  organizationId: string,
  masterRecordId: string,
  changeType: ChangeType,
  previousData: Record<string, unknown> | undefined,
  newData: Record<string, unknown>,
  changedBy: string,
  options?: {
    source?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ChangeRecord> {
  const changedFields = previousData
    ? detectChangedFields(previousData, newData)
    : Object.keys(newData);

  // Get current version
  const masterRecord = await prisma.masterRecord.findUnique({
    where: { id: masterRecordId },
    select: { version: true },
  });

  const version = masterRecord?.version || 1;
  const previousVersion = changeType === 'create' ? undefined : version - 1;

  const change = await prisma.changeRecord.create({
    data: {
      id: uuidv4(),
      organizationId,
      masterRecordId,
      changeType,
      version,
      previousVersion,
      changedFields,
      previousData: previousData || {},
      newData,
      changedBy,
      source: options?.source,
      reason: options?.reason,
      metadata: options?.metadata || {},
      createdAt: new Date(),
    },
  });

  return transformChangeRecord(change);
}

/**
 * Get change history for a master record
 */
export async function getChangeHistory(
  organizationId: string,
  masterRecordId: string,
  options?: { limit?: number; offset?: number }
): Promise<ChangeRecord[]> {
  const changes = await prisma.changeRecord.findMany({
    where: {
      organizationId,
      masterRecordId,
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });

  return changes.map(transformChangeRecord);
}

/**
 * Query changes across records
 */
export async function queryChanges(
  organizationId: string,
  query: ChangeQuery
): Promise<{ changes: ChangeRecord[]; total: number }> {
  const where: Record<string, unknown> = {
    organizationId,
  };

  if (query.masterRecordId) {
    where.masterRecordId = query.masterRecordId;
  }

  if (query.changeType) {
    where.changeType = query.changeType;
  }

  if (query.changedBy) {
    where.changedBy = query.changedBy;
  }

  if (query.source) {
    where.source = query.source;
  }

  if (query.fromDate || query.toDate) {
    where.createdAt = {};
    if (query.fromDate) {
      (where.createdAt as Record<string, Date>).gte = query.fromDate;
    }
    if (query.toDate) {
      (where.createdAt as Record<string, Date>).lte = query.toDate;
    }
  }

  const [changes, total] = await Promise.all([
    prisma.changeRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit || 50,
      skip: query.offset || 0,
    }),
    prisma.changeRecord.count({ where }),
  ]);

  return {
    changes: changes.map(transformChangeRecord),
    total,
  };
}

/**
 * Get a specific version of a master record
 */
export async function getVersion(
  organizationId: string,
  masterRecordId: string,
  version: number
): Promise<VersionSnapshot | null> {
  const snapshot = await prisma.masterRecordVersion.findFirst({
    where: {
      organizationId,
      masterRecordId,
      version,
    },
  });

  return snapshot ? transformVersionSnapshot(snapshot) : null;
}

/**
 * Get all versions of a master record
 */
export async function getVersionHistory(
  organizationId: string,
  masterRecordId: string
): Promise<VersionSnapshot[]> {
  const versions = await prisma.masterRecordVersion.findMany({
    where: {
      organizationId,
      masterRecordId,
    },
    orderBy: { version: 'desc' },
  });

  return versions.map(transformVersionSnapshot);
}

/**
 * Compare two versions of a master record
 */
export async function compareVersions(
  organizationId: string,
  masterRecordId: string,
  version1: number,
  version2: number
): Promise<{
  version1: VersionSnapshot | null;
  version2: VersionSnapshot | null;
  differences: FieldChange[];
}> {
  const [v1, v2] = await Promise.all([
    getVersion(organizationId, masterRecordId, version1),
    getVersion(organizationId, masterRecordId, version2),
  ]);

  const differences: FieldChange[] = [];

  if (v1 && v2) {
    const allFields = new Set([
      ...Object.keys(v1.data),
      ...Object.keys(v2.data),
    ]);

    for (const field of allFields) {
      const val1 = v1.data[field];
      const val2 = v2.data[field];

      if (val1 === undefined && val2 !== undefined) {
        differences.push({
          field,
          previousValue: undefined,
          newValue: val2,
          changeType: 'added',
        });
      } else if (val1 !== undefined && val2 === undefined) {
        differences.push({
          field,
          previousValue: val1,
          newValue: undefined,
          changeType: 'removed',
        });
      } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        differences.push({
          field,
          previousValue: val1,
          newValue: val2,
          changeType: 'modified',
        });
      }
    }
  }

  return {
    version1: v1,
    version2: v2,
    differences,
  };
}

/**
 * Restore a master record to a previous version
 */
export async function restoreVersion(
  organizationId: string,
  masterRecordId: string,
  targetVersion: number,
  restoredBy: string
): Promise<MasterRecord> {
  const versionSnapshot = await getVersion(
    organizationId,
    masterRecordId,
    targetVersion
  );

  if (!versionSnapshot) {
    throw new Error(`Version ${targetVersion} not found`);
  }

  // Get current state
  const currentRecord = await prisma.masterRecord.findUnique({
    where: { id: masterRecordId },
  });

  if (!currentRecord) {
    throw new Error('Master record not found');
  }

  const newVersion = currentRecord.version + 1;

  // Track the restore as a change
  await trackChange(
    organizationId,
    masterRecordId,
    'update',
    currentRecord.data as Record<string, unknown>,
    versionSnapshot.data,
    restoredBy,
    {
      reason: `Restored to version ${targetVersion}`,
      metadata: { restoredFromVersion: targetVersion },
    }
  );

  // Create version history entry for current state
  await prisma.masterRecordVersion.create({
    data: {
      id: uuidv4(),
      masterRecordId,
      organizationId,
      version: currentRecord.version,
      data: currentRecord.data as Record<string, unknown>,
      metadata: currentRecord.metadata as Record<string, unknown>,
      status: currentRecord.status,
      qualityScore: currentRecord.qualityScore,
      changedBy: restoredBy,
      createdAt: new Date(),
    },
  });

  // Update the master record
  const updated = await prisma.masterRecord.update({
    where: { id: masterRecordId },
    data: {
      data: versionSnapshot.data,
      metadata: {
        ...(versionSnapshot.metadata as Record<string, unknown>),
        lastModifiedBy: restoredBy,
        restoredAt: new Date().toISOString(),
        restoredFromVersion: targetVersion,
      },
      version: newVersion,
      updatedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    organizationId: updated.organizationId,
    entityType: updated.entityType,
    externalId: updated.externalId || undefined,
    data: updated.data as Record<string, unknown>,
    metadata: updated.metadata as MasterRecord['metadata'],
    status: updated.status as MasterRecord['status'],
    version: updated.version,
    qualityScore: updated.qualityScore,
    sources: (updated.sources as MasterRecord['sources']) || [],
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    lastSyncedAt: updated.lastSyncedAt || undefined,
  };
}

/**
 * Get change statistics
 */
export async function getChangeStats(
  organizationId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<{
  totalChanges: number;
  byType: Record<ChangeType, number>;
  byUser: Record<string, number>;
  bySource: Record<string, number>;
  timeline: Array<{ date: string; count: number }>;
}> {
  const where: Record<string, unknown> = { organizationId };

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      (where.createdAt as Record<string, Date>).gte = fromDate;
    }
    if (toDate) {
      (where.createdAt as Record<string, Date>).lte = toDate;
    }
  }

  const [total, byType, byUser, bySource] = await Promise.all([
    prisma.changeRecord.count({ where }),
    prisma.changeRecord.groupBy({
      by: ['changeType'],
      where,
      _count: true,
    }),
    prisma.changeRecord.groupBy({
      by: ['changedBy'],
      where,
      _count: true,
      take: 10,
      orderBy: { _count: { changedBy: 'desc' } },
    }),
    prisma.changeRecord.groupBy({
      by: ['source'],
      where: { ...where, source: { not: null } },
      _count: true,
    }),
  ]);

  // Build timeline (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const timelineData = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM change_records
    WHERE organization_id = ${organizationId}
      AND created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  return {
    totalChanges: total,
    byType: Object.fromEntries(
      byType.map((t) => [t.changeType, t._count])
    ) as Record<ChangeType, number>,
    byUser: Object.fromEntries(byUser.map((u) => [u.changedBy, u._count])),
    bySource: Object.fromEntries(
      bySource.map((s) => [s.source || 'unknown', s._count])
    ),
    timeline: timelineData.map((t) => ({
      date: t.date,
      count: Number(t.count),
    })),
  };
}

// Helper functions

function detectChangedFields(
  previousData: Record<string, unknown>,
  newData: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  const allFields = new Set([
    ...Object.keys(previousData),
    ...Object.keys(newData),
  ]);

  for (const field of allFields) {
    if (JSON.stringify(previousData[field]) !== JSON.stringify(newData[field])) {
      changed.push(field);
    }
  }

  return changed;
}

function transformChangeRecord(record: Record<string, unknown>): ChangeRecord {
  return {
    id: record.id as string,
    organizationId: record.organizationId as string,
    masterRecordId: record.masterRecordId as string,
    changeType: record.changeType as ChangeType,
    version: record.version as number,
    previousVersion: record.previousVersion as number | undefined,
    changedFields: record.changedFields as string[],
    previousData: record.previousData as Record<string, unknown> | undefined,
    newData: record.newData as Record<string, unknown>,
    changedBy: record.changedBy as string,
    source: record.source as string | undefined,
    reason: record.reason as string | undefined,
    metadata: record.metadata as Record<string, unknown> | undefined,
    createdAt: record.createdAt as Date,
  };
}

function transformVersionSnapshot(
  snapshot: Record<string, unknown>
): VersionSnapshot {
  return {
    id: snapshot.id as string,
    masterRecordId: snapshot.masterRecordId as string,
    organizationId: snapshot.organizationId as string,
    version: snapshot.version as number,
    data: snapshot.data as Record<string, unknown>,
    metadata: snapshot.metadata as Record<string, unknown>,
    status: snapshot.status as string,
    qualityScore: snapshot.qualityScore as number,
    changedBy: snapshot.changedBy as string,
    createdAt: snapshot.createdAt as Date,
  };
}

export default {
  trackChange,
  getChangeHistory,
  queryChanges,
  getVersion,
  getVersionHistory,
  compareVersions,
  restoreVersion,
  getChangeStats,
};
