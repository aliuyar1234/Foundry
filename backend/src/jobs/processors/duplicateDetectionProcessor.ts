/**
 * Duplicate Detection Job Processor
 * Processes entity records to find potential duplicates using blocking and matching
 */

import { Job } from 'bullmq';
import { Pool } from 'pg';
import { BaseProcessor } from './baseProcessor.js';
import {
  EntityRecordService,
  createEntityRecordService,
  EntityRecord,
  EntityType,
} from '../../services/preparation/entityRecordService.js';
import {
  generateBlockingKeys,
  getCandidatePairs,
  STANDARD_BLOCKING_CONFIGS,
} from '../../services/preparation/blocking/index.js';
import {
  compareRecords,
  STANDARD_MATCH_CONFIGS,
  MatchResult,
} from '../../services/preparation/matching/index.js';
import { prisma } from '../../lib/prisma.js';

export interface DuplicateDetectionJobData {
  organizationId: string;
  entityType?: EntityType;
  sourceId?: string;
  minMatchScore?: number;
  maxCandidates?: number;
  batchSize?: number;
}

export interface DuplicateDetectionJobResult {
  totalRecordsProcessed: number;
  candidatePairsGenerated: number;
  duplicatesFound: number;
  duplicateGroups: number;
  processingTimeMs: number;
  byEntityType: Record<string, {
    processed: number;
    duplicates: number;
  }>;
}

interface DuplicatePair {
  record1Id: string;
  record2Id: string;
  matchResult: MatchResult;
  entityType: EntityType;
}

interface DuplicateGroup {
  recordIds: string[];
  entityType: EntityType;
  avgConfidence: number;
  suggestedGoldenRecordId: string;
  matchingFields: string[];
}

export class DuplicateDetectionProcessor extends BaseProcessor<
  DuplicateDetectionJobData,
  DuplicateDetectionJobResult
> {
  private pool: Pool;
  private entityRecordService: EntityRecordService;

  constructor() {
    super('duplicate-detection');
    this.pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
    this.entityRecordService = createEntityRecordService(this.pool, prisma);
  }

  async process(job: Job<DuplicateDetectionJobData>): Promise<DuplicateDetectionJobResult> {
    const startTime = Date.now();
    const {
      organizationId,
      entityType,
      sourceId,
      minMatchScore = 0.8,
      maxCandidates = 10000,
      batchSize = 500,
    } = job.data;

    await this.updateProgress(job, 0, 'Starting duplicate detection');

    const result: DuplicateDetectionJobResult = {
      totalRecordsProcessed: 0,
      candidatePairsGenerated: 0,
      duplicatesFound: 0,
      duplicateGroups: 0,
      processingTimeMs: 0,
      byEntityType: {},
    };

    // Get entity types to process
    const entityTypes: EntityType[] = entityType
      ? [entityType]
      : ['person', 'company', 'address', 'product', 'contact'];

    for (const type of entityTypes) {
      await this.updateProgress(
        job,
        (entityTypes.indexOf(type) / entityTypes.length) * 100,
        `Processing ${type} records`
      );

      const typeResult = await this.processEntityType(
        organizationId,
        type,
        sourceId,
        minMatchScore,
        maxCandidates,
        batchSize,
        job
      );

      result.totalRecordsProcessed += typeResult.processed;
      result.candidatePairsGenerated += typeResult.candidates;
      result.duplicatesFound += typeResult.duplicates;
      result.duplicateGroups += typeResult.groups;
      result.byEntityType[type] = {
        processed: typeResult.processed,
        duplicates: typeResult.duplicates,
      };
    }

    result.processingTimeMs = Date.now() - startTime;
    await this.updateProgress(job, 100, 'Duplicate detection complete');

    return result;
  }

  private async processEntityType(
    organizationId: string,
    entityType: EntityType,
    sourceId: string | undefined,
    minMatchScore: number,
    maxCandidates: number,
    batchSize: number,
    job: Job
  ): Promise<{
    processed: number;
    candidates: number;
    duplicates: number;
    groups: number;
  }> {
    // Fetch records
    const records = await this.entityRecordService.queryEntityRecords(organizationId, {
      entityTypes: [entityType],
      sourceIds: sourceId ? [sourceId] : undefined,
      statuses: ['active', 'pending_review'],
      limit: maxCandidates,
    });

    if (records.length < 2) {
      return { processed: records.length, candidates: 0, duplicates: 0, groups: 0 };
    }

    // Get blocking configuration for entity type
    const blockingConfig = STANDARD_BLOCKING_CONFIGS[entityType] || STANDARD_BLOCKING_CONFIGS.person;

    // Generate candidate pairs using blocking
    const recordsWithData = records.map((r) => ({
      id: r.id,
      ...r.normalizedData,
      ...r.data,
    }));

    const candidatePairs = getCandidatePairs(recordsWithData, blockingConfig, 'id');

    if (candidatePairs.length === 0) {
      return { processed: records.length, candidates: 0, duplicates: 0, groups: 0 };
    }

    // Get matching configuration for entity type
    const matchConfig = STANDARD_MATCH_CONFIGS[entityType] || STANDARD_MATCH_CONFIGS.person;

    // Compare candidate pairs
    const duplicatePairs: DuplicatePair[] = [];

    for (let i = 0; i < candidatePairs.length; i += batchSize) {
      const batch = candidatePairs.slice(i, i + batchSize);

      for (const [record1, record2] of batch) {
        const matchResult = compareRecords(record1, record2, matchConfig);

        if (matchResult.overallScore >= minMatchScore) {
          duplicatePairs.push({
            record1Id: record1.id as string,
            record2Id: record2.id as string,
            matchResult,
            entityType,
          });
        }
      }

      // Update progress periodically
      if (i % (batchSize * 10) === 0) {
        await job.updateProgress(
          ((i / candidatePairs.length) * 50) + 25 // 25-75% for matching
        );
      }
    }

    // Group duplicates using Union-Find
    const groups = this.groupDuplicates(duplicatePairs, records);

    // Save duplicate groups to database
    for (const group of groups) {
      await this.saveDuplicateGroup(organizationId, group);
    }

    // Update record statuses
    for (const pair of duplicatePairs) {
      // Mark the lower quality record as duplicate
      const record1 = records.find((r) => r.id === pair.record1Id);
      const record2 = records.find((r) => r.id === pair.record2Id);

      if (record1 && record2) {
        if (record1.qualityScore < record2.qualityScore) {
          await this.entityRecordService.updateStatus(
            record1.id,
            'pending_review',
            record2.id
          );
        } else {
          await this.entityRecordService.updateStatus(
            record2.id,
            'pending_review',
            record1.id
          );
        }
      }
    }

    return {
      processed: records.length,
      candidates: candidatePairs.length,
      duplicates: duplicatePairs.length,
      groups: groups.length,
    };
  }

  /**
   * Group duplicate pairs using Union-Find algorithm
   */
  private groupDuplicates(
    pairs: DuplicatePair[],
    records: EntityRecord[]
  ): DuplicateGroup[] {
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    // Initialize each record as its own parent
    for (const record of records) {
      parent.set(record.id, record.id);
      rank.set(record.id, 0);
    }

    // Find with path compression
    const find = (x: string): string => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    // Union by rank
    const union = (x: string, y: string): void => {
      const rootX = find(x);
      const rootY = find(y);

      if (rootX === rootY) return;

      const rankX = rank.get(rootX) || 0;
      const rankY = rank.get(rootY) || 0;

      if (rankX < rankY) {
        parent.set(rootX, rootY);
      } else if (rankX > rankY) {
        parent.set(rootY, rootX);
      } else {
        parent.set(rootY, rootX);
        rank.set(rootX, rankX + 1);
      }
    };

    // Union all duplicate pairs
    for (const pair of pairs) {
      union(pair.record1Id, pair.record2Id);
    }

    // Collect groups
    const groupMap = new Map<string, {
      recordIds: Set<string>;
      matchResults: MatchResult[];
      entityType: EntityType;
    }>();

    for (const pair of pairs) {
      const root = find(pair.record1Id);

      if (!groupMap.has(root)) {
        groupMap.set(root, {
          recordIds: new Set(),
          matchResults: [],
          entityType: pair.entityType,
        });
      }

      const group = groupMap.get(root)!;
      group.recordIds.add(pair.record1Id);
      group.recordIds.add(pair.record2Id);
      group.matchResults.push(pair.matchResult);
    }

    // Convert to DuplicateGroup format
    const groups: DuplicateGroup[] = [];

    for (const [, groupData] of groupMap) {
      if (groupData.recordIds.size < 2) continue;

      const recordIds = Array.from(groupData.recordIds);
      const avgConfidence =
        groupData.matchResults.reduce((sum, r) => sum + r.confidence, 0) /
        groupData.matchResults.length;

      // Find best record for golden record (highest quality score)
      const groupRecords = records.filter((r) => recordIds.includes(r.id));
      const bestRecord = groupRecords.reduce((best, current) =>
        current.qualityScore > best.qualityScore ? current : best
      );

      // Get common matching fields
      const matchingFields = this.getCommonMatchingFields(groupData.matchResults);

      groups.push({
        recordIds,
        entityType: groupData.entityType,
        avgConfidence,
        suggestedGoldenRecordId: bestRecord.id,
        matchingFields,
      });
    }

    return groups;
  }

  /**
   * Get common matching fields across all match results
   */
  private getCommonMatchingFields(matchResults: MatchResult[]): string[] {
    if (matchResults.length === 0) return [];

    const fieldCounts = new Map<string, number>();

    for (const result of matchResults) {
      for (const [field, score] of Object.entries(result.fieldScores)) {
        if (score >= 0.8) {
          fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
        }
      }
    }

    // Return fields that match in at least 50% of comparisons
    const threshold = matchResults.length / 2;
    return Array.from(fieldCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([field]) => field);
  }

  /**
   * Save duplicate group to database
   */
  private async saveDuplicateGroup(
    organizationId: string,
    group: DuplicateGroup
  ): Promise<void> {
    const query = `
      INSERT INTO duplicate_groups (
        id, organization_id, entity_type, record_ids,
        confidence, suggested_golden_record_id, matching_fields,
        status, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3,
        $4, $5, $6,
        'pending', NOW(), NOW()
      )
      ON CONFLICT (organization_id, entity_type, record_ids)
      DO UPDATE SET
        confidence = $4,
        suggested_golden_record_id = $5,
        matching_fields = $6,
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      organizationId,
      group.entityType,
      JSON.stringify(group.recordIds.sort()),
      group.avgConfidence,
      group.suggestedGoldenRecordId,
      JSON.stringify(group.matchingFields),
    ]);
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
    // Prisma singleton is managed centrally - no need to disconnect here
  }
}

// Factory function
export function createDuplicateDetectionProcessor(): DuplicateDetectionProcessor {
  return new DuplicateDetectionProcessor();
}

export default DuplicateDetectionProcessor;
