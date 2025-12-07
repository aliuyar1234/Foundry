/**
 * Golden Record Merger
 * Merges duplicate entity records into a single golden record
 * Implements various merge strategies for different field types
 */

import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import {
  EntityRecordService,
  createEntityRecordService,
  EntityRecord,
  EntityType,
} from './entityRecordService.js';
import { calculateDetailedQualityScore } from './qualityScorer.js';

export interface MergeStrategy {
  field: string;
  strategy: MergeStrategyType;
  options?: MergeStrategyOptions;
}

export type MergeStrategyType =
  | 'highest_quality' // Use value from record with highest quality score
  | 'most_recent' // Use most recently updated value
  | 'most_complete' // Use longest/most complete value
  | 'majority' // Use most common value across records
  | 'concatenate' // Combine all unique values
  | 'sum' // Sum numeric values
  | 'average' // Average numeric values
  | 'min' // Minimum value
  | 'max' // Maximum value
  | 'first' // Use first non-null value
  | 'custom'; // Custom merge function

export interface MergeStrategyOptions {
  separator?: string;
  customMerge?: (values: unknown[], records: EntityRecord[]) => unknown;
  priorityField?: string;
}

export interface MergeResult {
  goldenRecord: EntityRecord;
  mergedRecords: string[];
  fieldSources: Record<string, string>; // field -> source record ID
  conflicts: MergeConflict[];
  qualityImprovement: number;
}

export interface MergeConflict {
  field: string;
  values: Array<{ recordId: string; value: unknown }>;
  resolution: unknown;
  strategy: MergeStrategyType;
}

export interface MergeRequest {
  recordIds: string[];
  baseRecordId?: string; // Optional: use this record as base
  strategies?: MergeStrategy[];
  autoMerge?: boolean; // If true, automatically apply merge strategies
  preserveHistory?: boolean; // Keep references to original records
}

/**
 * Default merge strategies by entity type
 */
const DEFAULT_STRATEGIES: Record<EntityType, MergeStrategy[]> = {
  person: [
    { field: 'firstName', strategy: 'highest_quality' },
    { field: 'lastName', strategy: 'highest_quality' },
    { field: 'email', strategy: 'most_recent' },
    { field: 'phone', strategy: 'most_recent' },
    { field: 'dateOfBirth', strategy: 'majority' },
    { field: 'address', strategy: 'most_complete' },
    { field: 'jobTitle', strategy: 'most_recent' },
    { field: 'department', strategy: 'most_recent' },
    { field: 'notes', strategy: 'concatenate', options: { separator: '\n---\n' } },
  ],

  company: [
    { field: 'name', strategy: 'highest_quality' },
    { field: 'vatId', strategy: 'first' },
    { field: 'registrationNumber', strategy: 'first' },
    { field: 'email', strategy: 'most_recent' },
    { field: 'phone', strategy: 'most_recent' },
    { field: 'address', strategy: 'most_complete' },
    { field: 'website', strategy: 'most_recent' },
    { field: 'industry', strategy: 'majority' },
    { field: 'employeeCount', strategy: 'max' },
    { field: 'revenue', strategy: 'max' },
  ],

  address: [
    { field: 'street', strategy: 'highest_quality' },
    { field: 'houseNumber', strategy: 'first' },
    { field: 'addition', strategy: 'concatenate' },
    { field: 'postalCode', strategy: 'majority' },
    { field: 'city', strategy: 'highest_quality' },
    { field: 'state', strategy: 'first' },
    { field: 'country', strategy: 'majority' },
  ],

  product: [
    { field: 'name', strategy: 'highest_quality' },
    { field: 'sku', strategy: 'first' },
    { field: 'ean', strategy: 'first' },
    { field: 'description', strategy: 'most_complete' },
    { field: 'category', strategy: 'majority' },
    { field: 'manufacturer', strategy: 'majority' },
    { field: 'price', strategy: 'average' },
    { field: 'stock', strategy: 'sum' },
  ],

  contact: [
    { field: 'name', strategy: 'highest_quality' },
    { field: 'email', strategy: 'most_recent' },
    { field: 'phone', strategy: 'most_recent' },
    { field: 'company', strategy: 'most_recent' },
    { field: 'position', strategy: 'most_recent' },
    { field: 'notes', strategy: 'concatenate', options: { separator: '\n---\n' } },
  ],
};

export class GoldenRecordMerger {
  private pool: Pool;
  private prisma: PrismaClient;
  private entityRecordService: EntityRecordService;

  constructor(pool: Pool, prisma: PrismaClient) {
    this.pool = pool;
    this.prisma = prisma;
    this.entityRecordService = createEntityRecordService(pool, prisma);
  }

  /**
   * Merge multiple records into a golden record
   */
  async mergeRecords(request: MergeRequest): Promise<MergeResult> {
    const { recordIds, baseRecordId, strategies, autoMerge = true, preserveHistory = true } = request;

    if (recordIds.length < 2) {
      throw new Error('At least 2 records are required for merging');
    }

    // Fetch all records
    const records: EntityRecord[] = [];
    for (const id of recordIds) {
      const record = await this.entityRecordService.getEntityRecordById(id);
      if (record) {
        records.push(record);
      }
    }

    if (records.length < 2) {
      throw new Error('Could not find enough records to merge');
    }

    // Verify all records are same entity type
    const entityTypes = new Set(records.map((r) => r.entityType));
    if (entityTypes.size > 1) {
      throw new Error('Cannot merge records of different entity types');
    }

    const entityType = records[0].entityType;

    // Determine base record (highest quality or specified)
    let baseRecord: EntityRecord;
    if (baseRecordId) {
      baseRecord = records.find((r) => r.id === baseRecordId) || records[0];
    } else {
      baseRecord = records.reduce((best, current) =>
        current.qualityScore > best.qualityScore ? current : best
      );
    }

    // Get merge strategies
    const mergeStrategies = strategies || DEFAULT_STRATEGIES[entityType] || [];

    // Merge data
    const { mergedData, fieldSources, conflicts } = this.mergeData(
      records,
      baseRecord,
      mergeStrategies,
      autoMerge
    );

    // Create golden record
    const goldenRecord = await this.createGoldenRecord(
      baseRecord,
      mergedData,
      recordIds
    );

    // Update source records
    if (preserveHistory) {
      for (const record of records) {
        if (record.id !== goldenRecord.id) {
          await this.entityRecordService.updateStatus(
            record.id,
            'merged',
            goldenRecord.id
          );
        }
      }
    }

    // Calculate quality improvement
    const originalAvgQuality =
      records.reduce((sum, r) => sum + r.qualityScore, 0) / records.length;
    const qualityImprovement = goldenRecord.qualityScore - originalAvgQuality;

    // Update duplicate group status
    await this.updateDuplicateGroupStatus(recordIds, goldenRecord.id);

    return {
      goldenRecord,
      mergedRecords: recordIds.filter((id) => id !== goldenRecord.id),
      fieldSources,
      conflicts,
      qualityImprovement,
    };
  }

  /**
   * Merge data from multiple records
   */
  private mergeData(
    records: EntityRecord[],
    baseRecord: EntityRecord,
    strategies: MergeStrategy[],
    autoMerge: boolean
  ): {
    mergedData: Record<string, unknown>;
    fieldSources: Record<string, string>;
    conflicts: MergeConflict[];
  } {
    const mergedData: Record<string, unknown> = { ...baseRecord.data };
    const fieldSources: Record<string, string> = {};
    const conflicts: MergeConflict[] = [];

    // Get all unique fields across records
    const allFields = new Set<string>();
    for (const record of records) {
      for (const field of Object.keys(record.data)) {
        allFields.add(field);
      }
    }

    // Apply merge strategy for each field
    for (const field of allFields) {
      const strategy = strategies.find((s) => s.field === field);
      const strategyType = strategy?.strategy || 'highest_quality';
      const options = strategy?.options || {};

      const values = records
        .map((r) => ({
          recordId: r.id,
          value: r.data[field],
          quality: r.qualityScore,
          updatedAt: r.updatedAt,
        }))
        .filter((v) => v.value !== null && v.value !== undefined);

      if (values.length === 0) continue;

      // Check if all values are the same
      const uniqueValues = new Set(values.map((v) => JSON.stringify(v.value)));
      if (uniqueValues.size === 1) {
        mergedData[field] = values[0].value;
        fieldSources[field] = values[0].recordId;
        continue;
      }

      // Apply merge strategy
      const { value, sourceId, hasConflict } = this.applyStrategy(
        strategyType,
        values,
        records,
        options
      );

      mergedData[field] = value;
      fieldSources[field] = sourceId || baseRecord.id;

      if (hasConflict && !autoMerge) {
        conflicts.push({
          field,
          values: values.map((v) => ({ recordId: v.recordId, value: v.value })),
          resolution: value,
          strategy: strategyType,
        });
      }
    }

    return { mergedData, fieldSources, conflicts };
  }

  /**
   * Apply merge strategy to field values
   */
  private applyStrategy(
    strategyType: MergeStrategyType,
    values: Array<{
      recordId: string;
      value: unknown;
      quality: number;
      updatedAt: Date;
    }>,
    records: EntityRecord[],
    options: MergeStrategyOptions
  ): { value: unknown; sourceId?: string; hasConflict: boolean } {
    const hasConflict = new Set(values.map((v) => JSON.stringify(v.value))).size > 1;

    switch (strategyType) {
      case 'highest_quality': {
        const best = values.reduce((a, b) => (a.quality > b.quality ? a : b));
        return { value: best.value, sourceId: best.recordId, hasConflict };
      }

      case 'most_recent': {
        const best = values.reduce((a, b) =>
          a.updatedAt > b.updatedAt ? a : b
        );
        return { value: best.value, sourceId: best.recordId, hasConflict };
      }

      case 'most_complete': {
        const best = values.reduce((a, b) => {
          const aLen = String(a.value || '').length;
          const bLen = String(b.value || '').length;
          return aLen > bLen ? a : b;
        });
        return { value: best.value, sourceId: best.recordId, hasConflict };
      }

      case 'majority': {
        const counts = new Map<string, { count: number; value: unknown; recordId: string }>();
        for (const v of values) {
          const key = JSON.stringify(v.value);
          const existing = counts.get(key);
          if (existing) {
            existing.count++;
          } else {
            counts.set(key, { count: 1, value: v.value, recordId: v.recordId });
          }
        }
        const best = Array.from(counts.values()).reduce((a, b) =>
          a.count > b.count ? a : b
        );
        return { value: best.value, sourceId: best.recordId, hasConflict };
      }

      case 'concatenate': {
        const separator = options.separator || ', ';
        const uniqueValues = [...new Set(values.map((v) => String(v.value)))];
        return { value: uniqueValues.join(separator), hasConflict: false };
      }

      case 'sum': {
        const sum = values.reduce(
          (acc, v) => acc + (parseFloat(String(v.value)) || 0),
          0
        );
        return { value: sum, hasConflict: false };
      }

      case 'average': {
        const nums = values
          .map((v) => parseFloat(String(v.value)))
          .filter((n) => !isNaN(n));
        const avg = nums.length > 0 ? nums.reduce((a, b) => a + b) / nums.length : 0;
        return { value: avg, hasConflict: false };
      }

      case 'min': {
        const nums = values
          .map((v) => ({ value: parseFloat(String(v.value)), recordId: v.recordId }))
          .filter((n) => !isNaN(n.value));
        if (nums.length === 0) return { value: null, hasConflict: false };
        const min = nums.reduce((a, b) => (a.value < b.value ? a : b));
        return { value: min.value, sourceId: min.recordId, hasConflict };
      }

      case 'max': {
        const nums = values
          .map((v) => ({ value: parseFloat(String(v.value)), recordId: v.recordId }))
          .filter((n) => !isNaN(n.value));
        if (nums.length === 0) return { value: null, hasConflict: false };
        const max = nums.reduce((a, b) => (a.value > b.value ? a : b));
        return { value: max.value, sourceId: max.recordId, hasConflict };
      }

      case 'first': {
        const first = values[0];
        return { value: first.value, sourceId: first.recordId, hasConflict };
      }

      case 'custom': {
        if (options.customMerge) {
          const result = options.customMerge(
            values.map((v) => v.value),
            records
          );
          return { value: result, hasConflict: false };
        }
        return { value: values[0].value, sourceId: values[0].recordId, hasConflict };
      }

      default:
        return { value: values[0].value, sourceId: values[0].recordId, hasConflict };
    }
  }

  /**
   * Create golden record from merged data
   */
  private async createGoldenRecord(
    baseRecord: EntityRecord,
    mergedData: Record<string, unknown>,
    sourceRecordIds: string[]
  ): Promise<EntityRecord> {
    // Update base record with merged data and mark as golden
    const query = `
      UPDATE entity_records
      SET
        data = $1,
        status = 'golden',
        golden_record_id = id,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      JSON.stringify(mergedData),
      baseRecord.id,
    ]);

    // Calculate new quality score
    const qualityScore = calculateDetailedQualityScore(
      baseRecord.entityType,
      mergedData
    ).overall;

    // Update quality score
    await this.pool.query(
      'UPDATE entity_records SET quality_score = $1 WHERE id = $2',
      [qualityScore, baseRecord.id]
    );

    // Store merge history
    await this.storeMergeHistory(baseRecord.id, sourceRecordIds);

    return {
      ...baseRecord,
      data: mergedData,
      status: 'golden',
      goldenRecordId: baseRecord.id,
      qualityScore,
      updatedAt: new Date(),
    };
  }

  /**
   * Store merge history for audit
   */
  private async storeMergeHistory(
    goldenRecordId: string,
    sourceRecordIds: string[]
  ): Promise<void> {
    const query = `
      INSERT INTO merge_history (
        id, golden_record_id, source_record_ids, merged_at
      ) VALUES (
        gen_random_uuid(), $1, $2, NOW()
      )
    `;

    await this.pool.query(query, [
      goldenRecordId,
      JSON.stringify(sourceRecordIds),
    ]);
  }

  /**
   * Update duplicate group status after merge
   */
  private async updateDuplicateGroupStatus(
    recordIds: string[],
    goldenRecordId: string
  ): Promise<void> {
    const query = `
      UPDATE duplicate_groups
      SET status = 'merged', merged_record_id = $1, updated_at = NOW()
      WHERE record_ids @> $2::jsonb
    `;

    await this.pool.query(query, [
      goldenRecordId,
      JSON.stringify(recordIds.sort()),
    ]);
  }

  /**
   * Preview merge result without applying
   */
  async previewMerge(request: MergeRequest): Promise<{
    previewData: Record<string, unknown>;
    conflicts: MergeConflict[];
    qualityScoreChange: number;
  }> {
    const { recordIds, baseRecordId, strategies } = request;

    // Fetch all records
    const records: EntityRecord[] = [];
    for (const id of recordIds) {
      const record = await this.entityRecordService.getEntityRecordById(id);
      if (record) {
        records.push(record);
      }
    }

    if (records.length < 2) {
      throw new Error('Could not find enough records to preview');
    }

    const entityType = records[0].entityType;

    // Determine base record
    let baseRecord: EntityRecord;
    if (baseRecordId) {
      baseRecord = records.find((r) => r.id === baseRecordId) || records[0];
    } else {
      baseRecord = records.reduce((best, current) =>
        current.qualityScore > best.qualityScore ? current : best
      );
    }

    // Get merge strategies
    const mergeStrategies = strategies || DEFAULT_STRATEGIES[entityType] || [];

    // Merge data (preview only)
    const { mergedData, conflicts } = this.mergeData(
      records,
      baseRecord,
      mergeStrategies,
      false
    );

    // Calculate quality score change
    const originalAvgQuality =
      records.reduce((sum, r) => sum + r.qualityScore, 0) / records.length;
    const newQuality = calculateDetailedQualityScore(entityType, mergedData).overall;
    const qualityScoreChange = newQuality - originalAvgQuality;

    return {
      previewData: mergedData,
      conflicts,
      qualityScoreChange,
    };
  }

  /**
   * Undo a merge operation
   */
  async undoMerge(goldenRecordId: string): Promise<boolean> {
    // Get merge history
    const historyQuery = `
      SELECT source_record_ids FROM merge_history
      WHERE golden_record_id = $1
      ORDER BY merged_at DESC
      LIMIT 1
    `;

    const historyResult = await this.pool.query(historyQuery, [goldenRecordId]);
    if (historyResult.rows.length === 0) {
      return false;
    }

    const sourceRecordIds = historyResult.rows[0].source_record_ids as string[];

    // Restore source records
    for (const id of sourceRecordIds) {
      await this.entityRecordService.updateStatus(id, 'active');
    }

    // Reset golden record to active
    await this.entityRecordService.updateStatus(goldenRecordId, 'active');

    // Update merge history
    await this.pool.query(
      `UPDATE merge_history SET undone_at = NOW() WHERE golden_record_id = $1`,
      [goldenRecordId]
    );

    return true;
  }
}

// Factory function
let goldenRecordMergerInstance: GoldenRecordMerger | null = null;

export function createGoldenRecordMerger(
  pool: Pool,
  prisma: PrismaClient
): GoldenRecordMerger {
  if (!goldenRecordMergerInstance) {
    goldenRecordMergerInstance = new GoldenRecordMerger(pool, prisma);
  }
  return goldenRecordMergerInstance;
}

export function resetGoldenRecordMerger(): void {
  goldenRecordMergerInstance = null;
}

export default {
  GoldenRecordMerger,
  createGoldenRecordMerger,
  resetGoldenRecordMerger,
  DEFAULT_STRATEGIES,
};
