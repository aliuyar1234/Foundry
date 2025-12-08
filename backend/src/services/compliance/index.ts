/**
 * Compliance Services Index
 *
 * Export all compliance service modules
 */

// Rule Engine (T162)
export { default as ruleEngine } from './ruleEngine.js';
export {
  evaluateRule,
  evaluateAllRules,
  evaluateDueRules,
  registerCustomEvaluator,
  getRegisteredEvaluators,
  getComplianceSummary,
} from './ruleEngine.js';

// Compliance Checkers (T163-T165)
export * from './checkers/index.js';

// Custom Rule Evaluator (T166)
export { default as customRuleEvaluator } from './customRuleEvaluator.js';
export { evaluateCustomRule } from './customRuleEvaluator.js';

// Evidence Collector (T167-T169)
export { default as evidenceCollector } from './evidenceCollector.js';
export {
  registerEvidenceSource,
  getRegisteredSources,
  collectEvidenceForRule,
  collectEvidence,
  getEvidenceForRule,
  getEvidenceCollectionSummary,
  getAllEvidenceCollections,
  cleanupExpiredEvidence,
  archiveEvidence,
} from './evidenceCollector.js';

// Retention Tracker (T170)
export { default as retentionTracker } from './retentionTracker.js';
export {
  createRetentionPolicy,
  updateRetentionPolicy,
  getRetentionPolicies,
  deleteRetentionPolicy,
  getRetentionStatus,
  getRetentionReport,
  processRetentionPolicy,
  processAllRetentionPolicies,
  getDefaultRetentionPolicies,
  initializeDefaultPolicies,
} from './retentionTracker.js';

// Violation Detector (T171-T174)
export { default as violationDetector } from './violationDetector.js';
export {
  detectViolations,
  getViolations,
  getViolationById,
  getViolationStatistics,
  resolveViolation,
  assignViolation,
  updateViolationStatus,
  addViolationEvidence,
  updateViolationDueDate,
  detectApprovalBypasses,
  detectRetentionViolations,
  detectProcessDeviations,
} from './violationDetector.js';

// Deadline Tracker (T175-T177)
export { default as deadlineTracker } from './deadlineTracker.js';
export {
  createDeadline,
  updateDeadline,
  completeDeadline,
  deleteDeadline,
  getDeadlines,
  getDeadlineSchedule,
  getDeadlineStatistics,
  getDeadlineAlerts,
  updateDeadlineStatuses,
  sendDeadlineNotifications,
  getDefaultDeadlines,
} from './deadlineTracker.js';

// Report Generator (T178-T181)
export { default as reportGenerator } from './reportGenerator.js';
export { generateReport } from './reportGenerator.js';
