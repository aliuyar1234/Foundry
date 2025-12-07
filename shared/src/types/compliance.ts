/**
 * Compliance Types for OPERATE Tier
 * T025 - Define ComplianceRule types
 */

// =============================================================================
// Compliance Framework Types
// =============================================================================

export type ComplianceFramework = 'GDPR' | 'SOX' | 'ISO27001' | 'DSGVO' | 'custom';
export type ComplianceCategory =
  | 'data_retention'
  | 'access_control'
  | 'process_compliance'
  | 'audit_trail'
  | 'data_protection'
  | 'segregation_of_duties'
  | 'approval_workflows';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type CheckFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly';

// =============================================================================
// Compliance Rule Types
// =============================================================================

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  framework: ComplianceFramework;
  category: ComplianceCategory;
  ruleLogic: RuleLogic;
  severity: Severity;
  checkFrequency: CheckFrequency;
  isActive: boolean;
  lastCheckedAt?: Date;
  passCount: number;
  failCount: number;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleLogic {
  /** Type of rule evaluation */
  type: 'query' | 'threshold' | 'pattern' | 'workflow' | 'custom';
  /** Rule-specific configuration */
  config: RuleConfig;
  /** Grace period before violation (hours) */
  gracePeriodHours?: number;
  /** Exceptions to the rule */
  exceptions?: RuleException[];
}

export type RuleConfig =
  | QueryRuleConfig
  | ThresholdRuleConfig
  | PatternRuleConfig
  | WorkflowRuleConfig
  | CustomRuleConfig;

export interface QueryRuleConfig {
  type: 'query';
  /** Database query to execute */
  query: string;
  /** Expected result (count, boolean, value) */
  expectedResult: 'zero' | 'non_zero' | 'boolean_true' | 'boolean_false';
  /** Parameters for the query */
  parameters?: Record<string, unknown>;
}

export interface ThresholdRuleConfig {
  type: 'threshold';
  /** Metric to check */
  metric: string;
  /** Comparison operator */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';
  /** Threshold value(s) */
  value: number | [number, number];
}

export interface PatternRuleConfig {
  type: 'pattern';
  /** Pattern to detect */
  pattern: string;
  /** Where to look for the pattern */
  scope: 'processes' | 'access_logs' | 'documents' | 'communications';
  /** Whether pattern should exist (true) or not exist (false) */
  shouldExist: boolean;
}

export interface WorkflowRuleConfig {
  type: 'workflow';
  /** Required workflow steps */
  requiredSteps: string[];
  /** Required approvers (roles or specific people) */
  requiredApprovers?: string[];
  /** Maximum time for workflow completion (hours) */
  maxDurationHours?: number;
}

export interface CustomRuleConfig {
  type: 'custom';
  /** Custom evaluation function name */
  evaluatorName: string;
  /** Parameters for custom evaluator */
  parameters: Record<string, unknown>;
}

export interface RuleException {
  /** Exception type */
  type: 'entity' | 'time_period' | 'condition';
  /** Entity IDs to exclude */
  entityIds?: string[];
  /** Time period exception */
  timePeriod?: {
    start: Date;
    end: Date;
  };
  /** Condition for exception */
  condition?: string;
  /** Reason for exception */
  reason: string;
  /** Who approved the exception */
  approvedBy: string;
  /** When exception expires */
  expiresAt?: Date;
}

// =============================================================================
// Compliance Evidence Types
// =============================================================================

export type EvidenceType =
  | 'access_log'
  | 'process_execution'
  | 'document'
  | 'approval'
  | 'configuration'
  | 'audit_report';

export interface ComplianceEvidence {
  id: string;
  ruleId: string;
  evidenceType: EvidenceType;
  sourceId: string;
  sourceType: string;
  description: string;
  metadata?: Record<string, unknown>;
  collectedAt: Date;
  expiresAt?: Date;
  organizationId: string;
}

export interface EvidenceCollection {
  ruleId: string;
  ruleName: string;
  evidenceCount: number;
  evidenceTypes: EvidenceType[];
  oldestEvidence: Date;
  newestEvidence: Date;
  coveragePercentage: number;
}

// =============================================================================
// Compliance Violation Types
// =============================================================================

export type ViolationStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'remediated'
  | 'accepted_risk'
  | 'false_positive';

export interface ComplianceViolation {
  id: string;
  ruleId: string;
  ruleName?: string;
  framework?: ComplianceFramework;
  severity: Severity;
  description: string;
  affectedEntity: string;
  affectedEntityId?: string;
  evidenceIds: string[];
  status: ViolationStatus;
  assignedTo?: string;
  assignedToName?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  dueDate?: Date;
  organizationId: string;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViolationResolution {
  status: ViolationStatus;
  notes: string;
  evidenceIds?: string[];
}

// =============================================================================
// Compliance Report Types
// =============================================================================

export interface ComplianceReport {
  id: string;
  type: ComplianceReportType;
  framework?: ComplianceFramework;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: ComplianceSummary;
  sections: ComplianceReportSection[];
  organizationId: string;
}

export type ComplianceReportType =
  | 'status_report'
  | 'audit_report'
  | 'gap_analysis'
  | 'pre_audit_checklist'
  | 'violation_report';

export interface ComplianceSummary {
  totalRules: number;
  activeRules: number;
  passingRules: number;
  failingRules: number;
  complianceScore: number; // 0-100
  openViolations: number;
  criticalViolations: number;
  evidenceCompleteness: number; // 0-100
}

export interface ComplianceReportSection {
  title: string;
  framework?: ComplianceFramework;
  category?: ComplianceCategory;
  content: string;
  findings: ComplianceFinding[];
  recommendations: string[];
}

export interface ComplianceFinding {
  type: 'pass' | 'fail' | 'warning' | 'info';
  ruleId: string;
  ruleName: string;
  description: string;
  evidence?: string[];
  remediation?: string;
}

// =============================================================================
// Compliance Deadline Types
// =============================================================================

export interface ComplianceDeadline {
  id: string;
  title: string;
  description: string;
  framework: ComplianceFramework;
  dueDate: Date;
  isRecurring: boolean;
  recurrencePattern?: string; // cron expression
  status: 'upcoming' | 'due_soon' | 'overdue' | 'completed';
  assignedTo?: string;
  relatedRuleIds: string[];
  organizationId: string;
  createdAt: Date;
}

// =============================================================================
// Pre-defined Compliance Rules
// =============================================================================

export interface ComplianceRuleTemplate {
  id: string;
  name: string;
  description: string;
  framework: ComplianceFramework;
  category: ComplianceCategory;
  ruleLogic: RuleLogic;
  severity: Severity;
  checkFrequency: CheckFrequency;
  /** Whether this is a built-in rule */
  isBuiltIn: boolean;
}

export const GDPR_RULE_TEMPLATES: Partial<ComplianceRuleTemplate>[] = [
  {
    name: 'Data Retention Compliance',
    description: 'Ensure personal data is not retained beyond defined retention periods',
    framework: 'GDPR',
    category: 'data_retention',
    severity: 'high',
    checkFrequency: 'daily',
  },
  {
    name: 'Access Logging',
    description: 'Verify all access to personal data is logged',
    framework: 'GDPR',
    category: 'audit_trail',
    severity: 'high',
    checkFrequency: 'realtime',
  },
  {
    name: 'Consent Tracking',
    description: 'Ensure valid consent exists for data processing activities',
    framework: 'GDPR',
    category: 'data_protection',
    severity: 'critical',
    checkFrequency: 'daily',
  },
];
