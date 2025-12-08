/**
 * Self-Healing Services Index
 *
 * Export all self-healing service modules
 */

// Pattern Detection
export { default as patternDetector } from './patternDetector.js';
export {
  detectPatterns,
  detectPatternType,
  matchPatternsToActions,
  registerDetector,
  getRegisteredDetectors,
  createDetectedPattern,
  mergePatterns,
} from './patternDetector.js';

// Pattern Detectors
export { default as stuckProcessDetector } from './stuckProcessDetector.js';
export { detectStuckProcesses, detectBottleneckSteps } from './stuckProcessDetector.js';

export { default as integrationFailureDetector } from './integrationFailureDetector.js';
export {
  detectIntegrationFailures,
  checkIntegrationHealth,
  getIntegrationHealthSummary,
} from './integrationFailureDetector.js';

export { default as workloadImbalanceDetector } from './workloadImbalanceDetector.js';
export {
  detectWorkloadImbalances,
  getRedistributionSuggestions,
} from './workloadImbalanceDetector.js';

export { default as approvalBottleneckDetector } from './approvalBottleneckDetector.js';
export {
  detectApprovalBottlenecks,
  getPendingApprovals as getApprovalsPending,
  getApprovalQueueSummary,
} from './approvalBottleneckDetector.js';

// Action Executor
export { default as actionExecutor } from './actionExecutor.js';
export {
  registerActionExecutor,
  getRegisteredActionTypes,
  canRollback,
  executeAction,
  approveExecution,
  cancelExecution,
  rollbackExecution,
  executeActionsForPatterns,
  getExecutionHistory,
  getPendingApprovals,
  getExecutionStatistics,
} from './actionExecutor.js';

// Actions
export * from './actions/index.js';

// Rollback Service
export { default as rollbackService } from './rollbackService.js';
export {
  checkRollbackEligibility,
  requestRollback,
  approveRollback,
  rejectRollback,
  getRollbackableExecutions,
  getPendingRollbackRequests,
  getRollbackHistory,
} from './rollbackService.js';

// Safety Checks
export { default as safetyChecks } from './safetyChecks.js';
export {
  runSafetyChecks,
  validateActionSafety,
  getSafetyStatistics,
  logSafetyResult,
} from './safetyChecks.js';

// Approval Workflow
export { default as approvalWorkflow } from './approvalWorkflow.js';
export {
  createApprovalRequest,
  processApprovalDecision,
  getPendingApprovalsForUser,
  getAllPendingApprovals,
  assignApprovalRequest,
  processExpiredApprovals,
  escalatePendingApprovals,
  getApprovalStatistics,
} from './approvalWorkflow.js';

// Audit Trail
export { default as auditTrail } from './auditTrail.js';
export {
  logAuditEvent,
  logPatternDetected,
  logActionTriggered,
  logActionExecuted,
  logActionCompleted,
  logActionFailed,
  logApprovalEvent,
  logRollbackEvent,
  logSafetyCheckEvent,
  logConfigurationChange,
  queryAuditTrail,
  getEntityAuditTrail,
  getUserActivity,
  getAuditStatistics,
  exportAuditTrail,
} from './auditTrail.js';

// Learning Service
export { default as learningService } from './learningService.js';
export {
  runLearningAnalysis,
  analyzePatternHistory,
  generateSuggestions,
  getLearnedPatterns,
  approveLearnedPattern,
} from './learningService.js';
