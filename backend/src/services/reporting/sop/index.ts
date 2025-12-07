/**
 * SOP Services Index
 * Exports all SOP-related services and types
 */

// SOP Generator
export {
  SOPGenerator,
  createSOPGenerator,
  type SOPGenerationResult,
  type SOPReviewResult,
  type SOPIssue,
  type RegenerateOptions,
} from './sopGenerator.js';

// SOP Service
export {
  SOPService,
  createSOPService,
  resetSOPService,
  type SOPStatus,
  type CreateSOPInput,
  type UpdateSOPInput,
  type SOPQueryOptions,
  type SOPWithVersions,
} from './sopService.js';

// Version Manager
export {
  VersionManager,
  createVersionManager,
  type VersionComparison,
  type VersionChange,
  type VersionHistoryEntry,
  type BranchInfo,
} from './versionManager.js';

// Deviation Detector
export {
  DeviationDetector,
  createDeviationDetector,
  type DeviationReport,
  type Deviation,
  type DeviationType,
  type DeviationCategory,
  type DeviationExample,
  type DeviationSummary,
  type DeviationDetectorConfig,
} from './deviationDetector.js';

// Input Formatter
export {
  formatProcessForSOP,
  validateProcessData,
  enrichProcessData,
  type ProcessData,
  type ProcessStepData,
  type ProcessVariantData,
  type ProcessMetricsData,
  type ParticipantData,
  type SystemData,
  type DocumentData,
} from './inputFormatter.js';

// Confidence Scorer
export {
  calculateConfidenceScore,
  getConfidenceLevel,
  getConfidenceLevelDescription,
  type ConfidenceScore,
  type ConfidenceBreakdown,
} from './confidenceScorer.js';

// Prompt Templates
export {
  generateSOPPrompt,
  getSystemPrompt,
  getReviewPrompt,
  type ProcessInput,
  type ProcessStepInput,
  type ProcessVariantInput,
  type ProcessMetrics,
  type SOPGenerationOptions,
} from './prompts/sopTemplates.js';
