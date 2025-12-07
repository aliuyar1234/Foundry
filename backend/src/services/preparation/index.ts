/**
 * Data Preparation Services Index
 * Exports all data preparation and consolidation services
 */

// Entity Record Service
export {
  EntityRecordService,
  createEntityRecordService,
  resetEntityRecordService,
  type EntityRecord,
  type EntityType,
  type EntityStatus,
  type CreateEntityRecordInput,
  type EntityRecordQueryOptions,
  type EntityRecordStats,
  type DuplicateGroup,
} from './entityRecordService.js';

// Quality Scorer
export {
  calculateQualityScore,
  calculateDetailedQualityScore,
  QUALITY_RULES,
  type QualityScore,
  type QualityDetail,
  type QualityRules,
} from './qualityScorer.js';

// Golden Record Merger
export {
  GoldenRecordMerger,
  createGoldenRecordMerger,
  resetGoldenRecordMerger,
  DEFAULT_STRATEGIES,
  type MergeStrategy,
  type MergeStrategyType,
  type MergeResult,
  type MergeConflict,
  type MergeRequest,
} from './goldenRecordMerger.js';

// Re-export submodules
export * from './blocking/index.js';
export * from './matching/index.js';
export * from './normalizers/index.js';
