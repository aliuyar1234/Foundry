/**
 * Self-Healing Operations Types for OPERATE Tier
 * T024 - Define AutomatedAction types
 */

// =============================================================================
// Automated Action Types
// =============================================================================

export type TriggerType = 'pattern' | 'threshold' | 'schedule' | 'event';
export type ActionType = 'reminder' | 'escalation' | 'retry' | 'redistribute' | 'notify' | 'custom';

export interface AutomatedAction {
  id: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  actionType: ActionType;
  actionConfig: ActionConfig;
  requiresApproval: boolean;
  approvalRoles: string[];
  isActive: boolean;
  successCount: number;
  failureCount: number;
  lastTriggeredAt?: Date;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Trigger Configuration Types
// =============================================================================

export type TriggerConfig =
  | PatternTriggerConfig
  | ThresholdTriggerConfig
  | ScheduleTriggerConfig
  | EventTriggerConfig;

export interface PatternTriggerConfig {
  type: 'pattern';
  /** Pattern type to detect */
  patternType: PatternType;
  /** Minimum occurrences before triggering */
  minOccurrences?: number;
  /** Time window for pattern detection (minutes) */
  timeWindowMinutes?: number;
  /** Additional pattern-specific parameters */
  parameters?: Record<string, unknown>;
}

export type PatternType =
  | 'stuck_process'
  | 'integration_failure'
  | 'workload_imbalance'
  | 'approval_bottleneck'
  | 'response_delay'
  | 'repeated_errors'
  | 'communication_gap';

export interface ThresholdTriggerConfig {
  type: 'threshold';
  /** Metric to monitor */
  metric: string;
  /** Comparison operator */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  /** Threshold value */
  value: number;
  /** Duration metric must exceed threshold (minutes) */
  durationMinutes?: number;
  /** Entity type to monitor (person, team, process) */
  entityType?: string;
  /** Specific entity ID (optional, monitors all if not set) */
  entityId?: string;
}

export interface ScheduleTriggerConfig {
  type: 'schedule';
  /** Cron expression */
  cronExpression: string;
  /** Timezone */
  timezone: string;
}

export interface EventTriggerConfig {
  type: 'event';
  /** Event types to listen for */
  eventTypes: string[];
  /** Filter conditions */
  filters?: Record<string, unknown>;
}

// =============================================================================
// Action Configuration Types
// =============================================================================

export type ActionConfig =
  | ReminderActionConfig
  | EscalationActionConfig
  | RetryActionConfig
  | RedistributeActionConfig
  | NotifyActionConfig
  | CustomActionConfig;

export interface ReminderActionConfig {
  type: 'reminder';
  /** Target (person ID or role) */
  target: string;
  /** Message template */
  messageTemplate: string;
  /** Channel (email, slack, in-app) */
  channel: 'email' | 'slack' | 'in_app';
  /** Repeat interval (minutes, 0 = no repeat) */
  repeatIntervalMinutes?: number;
  /** Max reminders to send */
  maxReminders?: number;
}

export interface EscalationActionConfig {
  type: 'escalation';
  /** Escalation chain */
  escalationChain: EscalationLevel[];
  /** Include original context */
  includeContext: boolean;
  /** Skip levels if person unavailable */
  skipUnavailable: boolean;
}

export interface EscalationLevel {
  level: number;
  targetType: 'person' | 'role' | 'manager';
  targetId?: string;
  role?: string;
  waitMinutes: number;
}

export interface RetryActionConfig {
  type: 'retry';
  /** What to retry (job ID, integration name) */
  targetType: 'job' | 'integration' | 'process_step';
  /** Max retry attempts */
  maxAttempts: number;
  /** Delay between retries (seconds) */
  delaySeconds: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
}

export interface RedistributeActionConfig {
  type: 'redistribute';
  /** Redistribution strategy */
  strategy: 'round_robin' | 'least_loaded' | 'skill_based';
  /** Target pool (team ID or person IDs) */
  targetPool: string[];
  /** Preserve assignment history */
  preserveHistory: boolean;
}

export interface NotifyActionConfig {
  type: 'notify';
  /** Notification recipients */
  recipients: NotificationRecipient[];
  /** Message template */
  messageTemplate: string;
  /** Severity level */
  severity: 'info' | 'warning' | 'critical';
  /** Include metrics/data */
  includeData: boolean;
}

export interface NotificationRecipient {
  type: 'person' | 'team' | 'role' | 'channel';
  id: string;
  channel?: 'email' | 'slack' | 'in_app';
}

export interface CustomActionConfig {
  type: 'custom';
  /** Webhook URL */
  webhookUrl: string;
  /** HTTP method */
  method: 'POST' | 'PUT';
  /** Headers */
  headers?: Record<string, string>;
  /** Payload template (JSON) */
  payloadTemplate: string;
  /** Expected success status codes */
  successCodes: number[];
}

// =============================================================================
// Action Execution Types
// =============================================================================

export type ExecutionStatus =
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export interface ActionExecution {
  id: string;
  actionId: string;
  actionName?: string;
  triggerReason: string;
  status: ExecutionStatus;
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  completedAt?: Date;
  result?: ExecutionResult;
  errorMessage?: string;
  rollbackData?: Record<string, unknown>;
  wasRolledBack: boolean;
  rolledBackAt?: Date;
  rolledBackBy?: string;
  organizationId: string;
  createdAt: Date;
}

export interface ExecutionResult {
  success: boolean;
  affectedEntities: string[];
  changes: ExecutionChange[];
  metrics?: Record<string, number>;
}

export interface ExecutionChange {
  entityType: string;
  entityId: string;
  changeType: 'create' | 'update' | 'delete' | 'notify';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// =============================================================================
// Pattern Detection Types
// =============================================================================

export interface DetectedPattern {
  id: string;
  type: PatternType;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedEntities: AffectedEntity[];
  occurrences: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  suggestedActions: string[];
  matchedActions: string[]; // Action IDs that would handle this
}

export interface AffectedEntity {
  type: string;
  id: string;
  name: string;
  impact: 'direct' | 'indirect';
}

// =============================================================================
// Learning Types
// =============================================================================

export interface LearnedPattern {
  id: string;
  patternType: string;
  description: string;
  detectionCriteria: Record<string, unknown>;
  suggestedResolution: string;
  successRate: number;
  occurrenceCount: number;
  lastOccurrence: Date;
  isApproved: boolean;
  approvedBy?: string;
  createdAt: Date;
}

export interface ResolutionSuggestion {
  patternId: string;
  patternDescription: string;
  suggestedAction: Partial<AutomatedAction>;
  confidence: number;
  basedOnHistory: number; // Number of historical resolutions analyzed
}
