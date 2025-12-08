/**
 * Master Record Service
 * Manages master records in SSOT mode
 * T281 - Master record management
 */

import { v4 as uuidv4 } from 'uuid';
import { getSsotConfig, isSsotEnabled } from './ssotConfig.js';
import { prisma } from '../../lib/prisma.js';

export type MasterRecordStatus = 'active' | 'pending' | 'archived' | 'deleted';

export interface MasterRecord {
  id: string;
  organizationId: string;
  entityType: string;
  externalId?: string;
  data: Record<string, unknown>;
  metadata: MasterRecordMetadata;
  status: MasterRecordStatus;
  version: number;
  qualityScore: number;
  sources: RecordSource[];
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

export interface MasterRecordMetadata {
  createdBy: string;
  lastModifiedBy: string;
  sourceSystem?: string;
  tags: string[];
  custom: Record<string, unknown>;
}

export interface RecordSource {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  externalId: string;
  lastSyncedAt: Date;
  syncStatus: 'synced' | 'pending' | 'error';
  fieldContributions: Record<string, boolean>;
}

export interface MasterRecordInput {
  entityType: string;
  externalId?: string;
  data: Record<string, unknown>;
  metadata?: Partial<MasterRecordMetadata>;
  sources?: RecordSource[];
}

export interface MasterRecordUpdate {
  data?: Record<string, unknown>;
  metadata?: Partial<MasterRecordMetadata>;
  status?: MasterRecordStatus;
}

export interface MasterRecordQuery {
  entityType?: string;
  status?: MasterRecordStatus;
  sourceId?: string;
  search?: string;
  minQualityScore?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'qualityScore';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create a new master record
 */
export async function createMasterRecord(
  organizationId: string,
  input: MasterRecordInput,
  userId: string
): Promise<MasterRecord> {
  const ssotEnabled = await isSsotEnabled(organizationId);
  if (!ssotEnabled) {
    throw new Error('SSOT mode is not enabled for this organization');
  }

  const id = uuidv4();
  const now = new Date();

  const metadata: MasterRecordMetadata = {
    createdBy: userId,
    lastModifiedBy: userId,
    sourceSystem: input.metadata?.sourceSystem,
    tags: input.metadata?.tags || [],
    custom: input.metadata?.custom || {},
  };

  const qualityScore = calculateQualityScore(input.data, input.entityType);

  const record = await prisma.masterRecord.create({
    data: {
      id,
      organizationId,
      entityType: input.entityType,
      externalId: input.externalId,
      data: input.data as Record<string, unknown>,
      metadata: metadata as Record<string, unknown>,
      status: 'active',
      version: 1,
      qualityScore,
      sources: (input.sources || []) as unknown as Record<string, unknown>[],
      createdAt: now,
      updatedAt: now,
    },
  });

  return transformRecord(record);
}

/**
 * Get a master record by ID
 */
export async function getMasterRecord(
  organizationId: string,
  recordId: string
): Promise<MasterRecord | null> {
  const record = await prisma.masterRecord.findFirst({
    where: {
      id: recordId,
      organizationId,
    },
  });

  return record ? transformRecord(record) : null;
}

/**
 * Get master record by external ID
 */
export async function getMasterRecordByExternalId(
  organizationId: string,
  entityType: string,
  externalId: string
): Promise<MasterRecord | null> {
  const record = await prisma.masterRecord.findFirst({
    where: {
      organizationId,
      entityType,
      externalId,
    },
  });

  return record ? transformRecord(record) : null;
}

/**
 * Update a master record
 */
export async function updateMasterRecord(
  organizationId: string,
  recordId: string,
  update: MasterRecordUpdate,
  userId: string
): Promise<MasterRecord> {
  const existing = await getMasterRecord(organizationId, recordId);
  if (!existing) {
    throw new Error('Master record not found');
  }

  const now = new Date();
  const newVersion = existing.version + 1;

  // Merge data if provided
  const newData = update.data
    ? { ...existing.data, ...update.data }
    : existing.data;

  // Merge metadata if provided
  const newMetadata: MasterRecordMetadata = {
    ...existing.metadata,
    ...update.metadata,
    lastModifiedBy: userId,
  };

  const qualityScore = calculateQualityScore(newData, existing.entityType);

  // Create version history entry
  await createVersionHistory(organizationId, recordId, existing, userId);

  const record = await prisma.masterRecord.update({
    where: { id: recordId },
    data: {
      data: newData as Record<string, unknown>,
      metadata: newMetadata as Record<string, unknown>,
      status: update.status || existing.status,
      version: newVersion,
      qualityScore,
      updatedAt: now,
    },
  });

  return transformRecord(record);
}

/**
 * Delete a master record (soft delete)
 */
export async function deleteMasterRecord(
  organizationId: string,
  recordId: string,
  userId: string
): Promise<void> {
  const existing = await getMasterRecord(organizationId, recordId);
  if (!existing) {
    throw new Error('Master record not found');
  }

  await createVersionHistory(organizationId, recordId, existing, userId);

  await prisma.masterRecord.update({
    where: { id: recordId },
    data: {
      status: 'deleted',
      metadata: {
        ...(existing.metadata as Record<string, unknown>),
        lastModifiedBy: userId,
        deletedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    },
  });
}

/**
 * Query master records
 */
export async function queryMasterRecords(
  organizationId: string,
  query: MasterRecordQuery
): Promise<{ records: MasterRecord[]; total: number }> {
  const where: Record<string, unknown> = {
    organizationId,
  };

  if (query.entityType) {
    where.entityType = query.entityType;
  }

  if (query.status) {
    where.status = query.status;
  } else {
    // Default to non-deleted records
    where.status = { not: 'deleted' };
  }

  if (query.minQualityScore !== undefined) {
    where.qualityScore = { gte: query.minQualityScore };
  }

  // Handle search across data fields
  if (query.search) {
    where.OR = [
      { externalId: { contains: query.search, mode: 'insensitive' } },
      { data: { path: ['name'], string_contains: query.search } },
      { data: { path: ['email'], string_contains: query.search } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.masterRecord.findMany({
      where,
      orderBy: {
        [query.sortBy || 'updatedAt']: query.sortOrder || 'desc',
      },
      take: query.limit || 50,
      skip: query.offset || 0,
    }),
    prisma.masterRecord.count({ where }),
  ]);

  return {
    records: records.map(transformRecord),
    total,
  };
}

/**
 * Add source to master record
 */
export async function addRecordSource(
  organizationId: string,
  recordId: string,
  source: RecordSource,
  userId: string
): Promise<MasterRecord> {
  const existing = await getMasterRecord(organizationId, recordId);
  if (!existing) {
    throw new Error('Master record not found');
  }

  const existingSourceIndex = existing.sources.findIndex(
    (s) => s.sourceId === source.sourceId && s.externalId === source.externalId
  );

  let newSources: RecordSource[];
  if (existingSourceIndex >= 0) {
    // Update existing source
    newSources = [...existing.sources];
    newSources[existingSourceIndex] = source;
  } else {
    // Add new source
    newSources = [...existing.sources, source];
  }

  await prisma.masterRecord.update({
    where: { id: recordId },
    data: {
      sources: newSources as unknown as Record<string, unknown>[],
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return getMasterRecord(organizationId, recordId) as Promise<MasterRecord>;
}

/**
 * Remove source from master record
 */
export async function removeRecordSource(
  organizationId: string,
  recordId: string,
  sourceId: string,
  externalId: string
): Promise<MasterRecord> {
  const existing = await getMasterRecord(organizationId, recordId);
  if (!existing) {
    throw new Error('Master record not found');
  }

  const newSources = existing.sources.filter(
    (s) => !(s.sourceId === sourceId && s.externalId === externalId)
  );

  await prisma.masterRecord.update({
    where: { id: recordId },
    data: {
      sources: newSources as unknown as Record<string, unknown>[],
      updatedAt: new Date(),
    },
  });

  return getMasterRecord(organizationId, recordId) as Promise<MasterRecord>;
}

/**
 * Get records by source
 */
export async function getRecordsBySource(
  organizationId: string,
  sourceId: string,
  options?: { limit?: number; offset?: number }
): Promise<MasterRecord[]> {
  const records = await prisma.masterRecord.findMany({
    where: {
      organizationId,
      sources: {
        path: '$[*].sourceId',
        array_contains: sourceId,
      },
    },
    take: options?.limit || 100,
    skip: options?.offset || 0,
  });

  return records.map(transformRecord);
}

/**
 * Mark record as synced
 */
export async function markRecordSynced(
  organizationId: string,
  recordId: string,
  sourceId: string
): Promise<void> {
  const existing = await getMasterRecord(organizationId, recordId);
  if (!existing) {
    throw new Error('Master record not found');
  }

  const newSources = existing.sources.map((s) =>
    s.sourceId === sourceId
      ? { ...s, lastSyncedAt: new Date(), syncStatus: 'synced' as const }
      : s
  );

  await prisma.masterRecord.update({
    where: { id: recordId },
    data: {
      sources: newSources as unknown as Record<string, unknown>[],
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Get statistics for master records
 */
export async function getMasterRecordStats(organizationId: string): Promise<{
  total: number;
  byEntityType: Record<string, number>;
  byStatus: Record<string, number>;
  avgQualityScore: number;
  sourcesCount: number;
}> {
  const [total, byEntityType, byStatus, avgQuality] = await Promise.all([
    prisma.masterRecord.count({
      where: { organizationId, status: { not: 'deleted' } },
    }),
    prisma.masterRecord.groupBy({
      by: ['entityType'],
      where: { organizationId, status: { not: 'deleted' } },
      _count: true,
    }),
    prisma.masterRecord.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: true,
    }),
    prisma.masterRecord.aggregate({
      where: { organizationId, status: { not: 'deleted' } },
      _avg: { qualityScore: true },
    }),
  ]);

  // Count unique sources
  const records = await prisma.masterRecord.findMany({
    where: { organizationId, status: { not: 'deleted' } },
    select: { sources: true },
  });

  const uniqueSources = new Set<string>();
  records.forEach((r) => {
    const sources = r.sources as unknown as RecordSource[];
    sources?.forEach((s) => uniqueSources.add(s.sourceId));
  });

  return {
    total,
    byEntityType: Object.fromEntries(
      byEntityType.map((e) => [e.entityType, e._count])
    ),
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    avgQualityScore: avgQuality._avg.qualityScore || 0,
    sourcesCount: uniqueSources.size,
  };
}

// Helper functions

function transformRecord(record: Record<string, unknown>): MasterRecord {
  return {
    id: record.id as string,
    organizationId: record.organizationId as string,
    entityType: record.entityType as string,
    externalId: record.externalId as string | undefined,
    data: record.data as Record<string, unknown>,
    metadata: record.metadata as MasterRecordMetadata,
    status: record.status as MasterRecordStatus,
    version: record.version as number,
    qualityScore: record.qualityScore as number,
    sources: (record.sources as RecordSource[]) || [],
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
    lastSyncedAt: record.lastSyncedAt as Date | undefined,
  };
}

function calculateQualityScore(
  data: Record<string, unknown>,
  entityType: string
): number {
  const requiredFields: Record<string, string[]> = {
    company: ['name', 'email', 'phone', 'address'],
    person: ['firstName', 'lastName', 'email'],
    product: ['name', 'sku', 'price'],
    address: ['street', 'city', 'postalCode', 'country'],
    contact: ['type', 'value'],
  };

  const fields = requiredFields[entityType] || [];
  if (fields.length === 0) return 100;

  let filledCount = 0;
  for (const field of fields) {
    const value = data[field];
    if (value !== null && value !== undefined && value !== '') {
      filledCount++;
    }
  }

  return Math.round((filledCount / fields.length) * 100);
}

async function createVersionHistory(
  organizationId: string,
  recordId: string,
  record: MasterRecord,
  userId: string
): Promise<void> {
  await prisma.masterRecordVersion.create({
    data: {
      id: uuidv4(),
      masterRecordId: recordId,
      organizationId,
      version: record.version,
      data: record.data as Record<string, unknown>,
      metadata: record.metadata as Record<string, unknown>,
      status: record.status,
      qualityScore: record.qualityScore,
      changedBy: userId,
      createdAt: new Date(),
    },
  });
}

export default {
  createMasterRecord,
  getMasterRecord,
  getMasterRecordByExternalId,
  updateMasterRecord,
  deleteMasterRecord,
  queryMasterRecords,
  addRecordSource,
  removeRecordSource,
  getRecordsBySource,
  markRecordSynced,
  getMasterRecordStats,
};
