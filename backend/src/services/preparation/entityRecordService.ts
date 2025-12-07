/**
 * Entity Record Service
 * Manages entity records for data consolidation and deduplication
 */

import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';

export interface EntityRecord {
  id: string;
  organizationId: string;
  entityType: EntityType;
  sourceId: string;
  sourceSystem: string;
  externalId: string;
  data: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  qualityScore: number;
  confidenceScore: number;
  status: EntityStatus;
  goldenRecordId?: string;
  duplicateOfId?: string;
  mergedIntoId?: string;
  lastSyncAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type EntityType = 'person' | 'company' | 'address' | 'product' | 'contact';

export type EntityStatus =
  | 'active'
  | 'pending_review'
  | 'duplicate'
  | 'merged'
  | 'deleted'
  | 'golden';

export interface CreateEntityRecordInput {
  organizationId: string;
  entityType: EntityType;
  sourceId: string;
  sourceSystem: string;
  externalId: string;
  data: Record<string, unknown>;
}

export interface EntityRecordQueryOptions {
  entityTypes?: EntityType[];
  statuses?: EntityStatus[];
  sourceIds?: string[];
  sourceSystems?: string[];
  minQualityScore?: number;
  maxQualityScore?: number;
  hasGoldenRecord?: boolean;
  isDuplicate?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface EntityRecordStats {
  totalRecords: number;
  byEntityType: Record<EntityType, number>;
  byStatus: Record<EntityStatus, number>;
  bySourceSystem: Record<string, number>;
  avgQualityScore: number;
  duplicateCount: number;
  goldenRecordCount: number;
  pendingReviewCount: number;
}

export interface DuplicateGroup {
  id: string;
  entityType: EntityType;
  records: EntityRecord[];
  confidence: number;
  suggestedGoldenRecord: string;
  matchingFields: string[];
  createdAt: Date;
}

export class EntityRecordService {
  private pool: Pool;
  private prisma: PrismaClient;

  constructor(pool: Pool, prisma: PrismaClient) {
    this.pool = pool;
    this.prisma = prisma;
  }

  /**
   * Create a new entity record
   */
  async createEntityRecord(input: CreateEntityRecordInput): Promise<EntityRecord> {
    const insertQuery = `
      INSERT INTO entity_records (
        id, organization_id, entity_type, source_id, source_system,
        external_id, data, normalized_data, quality_score, confidence_score,
        status, last_sync_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, 0, 0,
        'active', NOW(), NOW(), NOW()
      )
      RETURNING *
    `;

    const normalizedData = await this.normalizeData(input.entityType, input.data);

    const result = await this.pool.query(insertQuery, [
      input.organizationId,
      input.entityType,
      input.sourceId,
      input.sourceSystem,
      input.externalId,
      JSON.stringify(input.data),
      JSON.stringify(normalizedData),
    ]);

    const record = this.mapRowToEntityRecord(result.rows[0]);

    // Calculate quality score
    const qualityScore = await this.calculateQualityScore(record);
    await this.updateQualityScore(record.id, qualityScore);

    return { ...record, qualityScore };
  }

  /**
   * Get entity record by ID
   */
  async getEntityRecordById(id: string): Promise<EntityRecord | null> {
    const query = `SELECT * FROM entity_records WHERE id = $1`;
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToEntityRecord(result.rows[0]);
  }

  /**
   * Query entity records
   */
  async queryEntityRecords(
    organizationId: string,
    options: EntityRecordQueryOptions = {}
  ): Promise<EntityRecord[]> {
    const conditions: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (options.entityTypes && options.entityTypes.length > 0) {
      conditions.push(`entity_type = ANY($${paramIndex++})`);
      values.push(options.entityTypes);
    }

    if (options.statuses && options.statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(options.statuses);
    }

    if (options.sourceIds && options.sourceIds.length > 0) {
      conditions.push(`source_id = ANY($${paramIndex++})`);
      values.push(options.sourceIds);
    }

    if (options.sourceSystems && options.sourceSystems.length > 0) {
      conditions.push(`source_system = ANY($${paramIndex++})`);
      values.push(options.sourceSystems);
    }

    if (options.minQualityScore !== undefined) {
      conditions.push(`quality_score >= $${paramIndex++}`);
      values.push(options.minQualityScore);
    }

    if (options.maxQualityScore !== undefined) {
      conditions.push(`quality_score <= $${paramIndex++}`);
      values.push(options.maxQualityScore);
    }

    if (options.hasGoldenRecord !== undefined) {
      if (options.hasGoldenRecord) {
        conditions.push(`golden_record_id IS NOT NULL`);
      } else {
        conditions.push(`golden_record_id IS NULL`);
      }
    }

    if (options.isDuplicate !== undefined) {
      if (options.isDuplicate) {
        conditions.push(`status = 'duplicate'`);
      } else {
        conditions.push(`status != 'duplicate'`);
      }
    }

    if (options.from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(options.from);
    }

    if (options.to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(options.to);
    }

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const query = `
      SELECT * FROM entity_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapRowToEntityRecord(row));
  }

  /**
   * Update entity record data
   */
  async updateEntityRecord(
    id: string,
    data: Record<string, unknown>
  ): Promise<EntityRecord | null> {
    const existing = await this.getEntityRecordById(id);
    if (!existing) return null;

    const normalizedData = await this.normalizeData(existing.entityType, data);

    const query = `
      UPDATE entity_records
      SET data = $1, normalized_data = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      JSON.stringify(data),
      JSON.stringify(normalizedData),
      id,
    ]);

    if (result.rows.length === 0) return null;

    const record = this.mapRowToEntityRecord(result.rows[0]);

    // Recalculate quality score
    const qualityScore = await this.calculateQualityScore(record);
    await this.updateQualityScore(record.id, qualityScore);

    return { ...record, qualityScore };
  }

  /**
   * Update entity record status
   */
  async updateStatus(
    id: string,
    status: EntityStatus,
    relatedId?: string
  ): Promise<EntityRecord | null> {
    let query: string;
    let values: unknown[];

    if (status === 'duplicate' && relatedId) {
      query = `
        UPDATE entity_records
        SET status = $1, duplicate_of_id = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      values = [status, relatedId, id];
    } else if (status === 'merged' && relatedId) {
      query = `
        UPDATE entity_records
        SET status = $1, merged_into_id = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      values = [status, relatedId, id];
    } else if (status === 'golden') {
      query = `
        UPDATE entity_records
        SET status = $1, golden_record_id = id, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      values = [status, id];
    } else {
      query = `
        UPDATE entity_records
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      values = [status, id];
    }

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) return null;

    return this.mapRowToEntityRecord(result.rows[0]);
  }

  /**
   * Link entity record to golden record
   */
  async linkToGoldenRecord(
    id: string,
    goldenRecordId: string
  ): Promise<EntityRecord | null> {
    const query = `
      UPDATE entity_records
      SET golden_record_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [goldenRecordId, id]);
    if (result.rows.length === 0) return null;

    return this.mapRowToEntityRecord(result.rows[0]);
  }

  /**
   * Get entity record statistics
   */
  async getStats(organizationId: string): Promise<EntityRecordStats> {
    const query = `
      SELECT
        COUNT(*) as total_records,
        entity_type,
        status,
        source_system,
        AVG(quality_score) as avg_quality_score
      FROM entity_records
      WHERE organization_id = $1
      GROUP BY GROUPING SETS (
        (),
        (entity_type),
        (status),
        (source_system)
      )
    `;

    const result = await this.pool.query(query, [organizationId]);

    const stats: EntityRecordStats = {
      totalRecords: 0,
      byEntityType: {} as Record<EntityType, number>,
      byStatus: {} as Record<EntityStatus, number>,
      bySourceSystem: {},
      avgQualityScore: 0,
      duplicateCount: 0,
      goldenRecordCount: 0,
      pendingReviewCount: 0,
    };

    for (const row of result.rows) {
      if (!row.entity_type && !row.status && !row.source_system) {
        stats.totalRecords = parseInt(row.total_records, 10);
        stats.avgQualityScore = parseFloat(row.avg_quality_score) || 0;
      } else if (row.entity_type && !row.status && !row.source_system) {
        stats.byEntityType[row.entity_type as EntityType] = parseInt(row.total_records, 10);
      } else if (row.status && !row.entity_type && !row.source_system) {
        stats.byStatus[row.status as EntityStatus] = parseInt(row.total_records, 10);
        if (row.status === 'duplicate') {
          stats.duplicateCount = parseInt(row.total_records, 10);
        } else if (row.status === 'golden') {
          stats.goldenRecordCount = parseInt(row.total_records, 10);
        } else if (row.status === 'pending_review') {
          stats.pendingReviewCount = parseInt(row.total_records, 10);
        }
      } else if (row.source_system && !row.entity_type && !row.status) {
        stats.bySourceSystem[row.source_system] = parseInt(row.total_records, 10);
      }
    }

    return stats;
  }

  /**
   * Get duplicate groups
   */
  async getDuplicateGroups(
    organizationId: string,
    entityType?: EntityType,
    limit = 50
  ): Promise<DuplicateGroup[]> {
    const conditions: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];

    if (entityType) {
      conditions.push('entity_type = $2');
      values.push(entityType);
    }

    const query = `
      SELECT * FROM duplicate_groups
      WHERE ${conditions.join(' AND ')}
      ORDER BY confidence DESC, created_at DESC
      LIMIT ${limit}
    `;

    const result = await this.pool.query(query, values);

    const groups: DuplicateGroup[] = [];

    for (const row of result.rows) {
      const records = await this.queryEntityRecords(organizationId, {
        statuses: ['active', 'pending_review', 'duplicate'],
        limit: 100,
      });

      groups.push({
        id: row.id,
        entityType: row.entity_type,
        records: records.filter((r) =>
          (row.record_ids as string[]).includes(r.id)
        ),
        confidence: row.confidence,
        suggestedGoldenRecord: row.suggested_golden_record_id,
        matchingFields: row.matching_fields || [],
        createdAt: new Date(row.created_at),
      });
    }

    return groups;
  }

  /**
   * Delete entity record
   */
  async deleteEntityRecord(id: string): Promise<boolean> {
    const query = `
      UPDATE entity_records
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Normalize data based on entity type
   */
  private async normalizeData(
    entityType: EntityType,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Import normalizers dynamically to avoid circular dependencies
    const { normalizeAddress } = await import('./normalizers/addressNormalizer.js');
    const { normalizeCompanyName } = await import('./normalizers/companyNormalizer.js');

    const normalized: Record<string, unknown> = { ...data };

    switch (entityType) {
      case 'person':
        if (data.firstName) {
          normalized.firstNameNormalized = String(data.firstName).toLowerCase().trim();
        }
        if (data.lastName) {
          normalized.lastNameNormalized = String(data.lastName).toLowerCase().trim();
        }
        if (data.email) {
          normalized.emailNormalized = String(data.email).toLowerCase().trim();
        }
        break;

      case 'company':
        if (data.name) {
          const companyName = normalizeCompanyName(String(data.name));
          normalized.nameNormalized = companyName.forComparison;
          normalized.legalForm = companyName.legalForm;
          normalized.baseName = companyName.baseName;
        }
        break;

      case 'address':
        const address = normalizeAddress(data);
        normalized.streetNormalized = address.normalized.streetNormalized;
        normalized.cityNormalized = address.normalized.cityNormalized;
        normalized.fullAddressNormalized = address.normalized.fullAddress;
        break;

      case 'product':
        if (data.name) {
          normalized.nameNormalized = String(data.name).toLowerCase().trim();
        }
        if (data.sku) {
          normalized.skuNormalized = String(data.sku).toUpperCase().trim();
        }
        break;

      case 'contact':
        if (data.email) {
          normalized.emailNormalized = String(data.email).toLowerCase().trim();
        }
        if (data.phone) {
          normalized.phoneNormalized = String(data.phone).replace(/\D/g, '');
        }
        break;
    }

    return normalized;
  }

  /**
   * Calculate quality score for a record
   */
  private async calculateQualityScore(record: EntityRecord): Promise<number> {
    // Import quality scorer
    const { calculateQualityScore } = await import('./qualityScorer.js');
    return calculateQualityScore(record.entityType, record.data);
  }

  /**
   * Update quality score
   */
  private async updateQualityScore(id: string, score: number): Promise<void> {
    const query = `
      UPDATE entity_records
      SET quality_score = $1, updated_at = NOW()
      WHERE id = $2
    `;
    await this.pool.query(query, [score, id]);
  }

  /**
   * Map database row to EntityRecord
   */
  private mapRowToEntityRecord(row: Record<string, unknown>): EntityRecord {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      entityType: row.entity_type as EntityType,
      sourceId: row.source_id as string,
      sourceSystem: row.source_system as string,
      externalId: row.external_id as string,
      data: (row.data as Record<string, unknown>) || {},
      normalizedData: (row.normalized_data as Record<string, unknown>) || {},
      qualityScore: parseFloat(row.quality_score as string) || 0,
      confidenceScore: parseFloat(row.confidence_score as string) || 0,
      status: row.status as EntityStatus,
      goldenRecordId: row.golden_record_id as string | undefined,
      duplicateOfId: row.duplicate_of_id as string | undefined,
      mergedIntoId: row.merged_into_id as string | undefined,
      lastSyncAt: new Date(row.last_sync_at as string),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// Factory function
let entityRecordServiceInstance: EntityRecordService | null = null;

export function createEntityRecordService(
  pool: Pool,
  prisma: PrismaClient
): EntityRecordService {
  if (!entityRecordServiceInstance) {
    entityRecordServiceInstance = new EntityRecordService(pool, prisma);
  }
  return entityRecordServiceInstance;
}

export function resetEntityRecordService(): void {
  entityRecordServiceInstance = null;
}

export default {
  EntityRecordService,
  createEntityRecordService,
  resetEntityRecordService,
};
