/**
 * Self-Healing Components Index
 *
 * Export all self-healing frontend components
 */

// Pattern Monitoring
export { PatternMonitorDashboard } from './PatternMonitorDashboard';
export type { DetectedPattern, PatternStatistics } from './PatternMonitorDashboard';

// Action Configuration
export { ActionConfigEditor } from './ActionConfigEditor';
export type {
  AutomatedAction,
  TriggerType,
  ActionType,
  TriggerConfig,
  ActionConfig,
} from './ActionConfigEditor';

// Execution History
export { ExecutionHistoryViewer } from './ExecutionHistoryViewer';
export type {
  ExecutionStatus,
  ActionExecution,
  ExecutionStatistics,
} from './ExecutionHistoryViewer';

// Approval Queue
export { ApprovalQueueInterface } from './ApprovalQueueInterface';
export type {
  ApprovalStatus,
  ApprovalRequest,
  ApprovalStatistics,
} from './ApprovalQueueInterface';

// Learning Insights
export { LearningInsightsPanel } from './LearningInsightsPanel';
export type {
  LearnedPattern,
  LearningInsight,
  ActionSuggestion,
  LearningStatistics,
} from './LearningInsightsPanel';

// Rollback Management
export { RollbackManagementUI } from './RollbackManagementUI';
export type {
  RollbackStatus,
  RollbackableExecution,
  RollbackRequest,
  RollbackStatistics,
} from './RollbackManagementUI';
