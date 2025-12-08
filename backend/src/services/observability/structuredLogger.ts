/**
 * Structured Logger for OPERATE Tier
 * T246-T249 - Structured logging for routing, AI, self-healing, and compliance
 *
 * Provides consistent, queryable log format for all OPERATE tier operations
 */

import { logger, createLogger } from '../../lib/logger.js';

// Types
interface BaseLogEntry {
  timestamp: string;
  correlationId?: string;
  organizationId: string;
  userId?: string;
  sessionId?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

// T246 - Routing decision logging
interface RoutingDecisionLog extends BaseLogEntry {
  type: 'routing_decision';
  requestId: string;
  taskType: string;
  selectedHandler: string;
  confidence: number;
  factors: RoutingFactor[];
  alternativeHandlers: AlternativeHandler[];
  processingTimeMs: number;
  outcome?: 'success' | 'failure' | 'pending';
}

interface RoutingFactor {
  name: string;
  weight: number;
  score: number;
  contribution: number;
}

interface AlternativeHandler {
  handlerId: string;
  handlerName: string;
  score: number;
  reason: string;
}

// T247 - AI assistant query logging
interface AIQueryLog extends BaseLogEntry {
  type: 'ai_query';
  queryId: string;
  query: string;
  queryType: 'question' | 'command' | 'analysis' | 'generation';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  contextDocuments: number;
  responseLength: number;
  confidence?: number;
  citations: number;
  language: string;
  success: boolean;
  errorType?: string;
}

// T248 - Self-healing action logging
interface SelfHealingLog extends BaseLogEntry {
  type: 'self_healing';
  executionId: string;
  patternId: string;
  patternName: string;
  issueType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionsTaken: HealingAction[];
  automaticExecution: boolean;
  requiresApproval: boolean;
  approvedBy?: string;
  outcome: 'success' | 'partial' | 'failure' | 'rollback';
  resolutionTimeMs: number;
  impactedResources: string[];
  rollbackPerformed: boolean;
}

interface HealingAction {
  actionId: string;
  actionType: string;
  target: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  executionTimeMs?: number;
  error?: string;
}

// T249 - Compliance violation logging
interface ComplianceViolationLog extends BaseLogEntry {
  type: 'compliance_violation';
  violationId: string;
  ruleId: string;
  ruleName: string;
  framework: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  affectedEntities: AffectedEntity[];
  evidence: EvidenceItem[];
  remediationStatus: 'open' | 'in_progress' | 'resolved' | 'accepted_risk' | 'false_positive';
  detectedAt: string;
  resolvedAt?: string;
  assignedTo?: string;
  dueDate?: string;
}

interface AffectedEntity {
  type: string;
  id: string;
  name: string;
}

interface EvidenceItem {
  type: string;
  description: string;
  value: string;
  timestamp: string;
}

// Logger instances
const routingLogger = createLogger('routing');
const aiLogger = createLogger('ai-assistant');
const healingLogger = createLogger('self-healing');
const complianceLogger = createLogger('compliance');

// ==========================================
// T246 - Routing Decision Logging
// ==========================================

/**
 * Log a routing decision
 */
export function logRoutingDecision(entry: Omit<RoutingDecisionLog, 'type' | 'timestamp'>): void {
  const log: RoutingDecisionLog = {
    type: 'routing_decision',
    timestamp: new Date().toISOString(),
    ...entry,
  };

  routingLogger.info(log, `Routing decision: ${entry.taskType} -> ${entry.selectedHandler}`);
}

/**
 * Log routing decision start
 */
export function logRoutingStart(
  organizationId: string,
  requestId: string,
  taskType: string,
  correlationId?: string
): void {
  routingLogger.debug({
    type: 'routing_start',
    timestamp: new Date().toISOString(),
    organizationId,
    requestId,
    taskType,
    correlationId,
  }, `Routing started for ${taskType}`);
}

/**
 * Log routing error
 */
export function logRoutingError(
  organizationId: string,
  requestId: string,
  error: Error,
  context?: Record<string, unknown>
): void {
  routingLogger.error({
    type: 'routing_error',
    timestamp: new Date().toISOString(),
    organizationId,
    requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, `Routing error: ${error.message}`);
}

// ==========================================
// T247 - AI Assistant Query Logging
// ==========================================

/**
 * Log an AI assistant query
 */
export function logAIQuery(entry: Omit<AIQueryLog, 'type' | 'timestamp'>): void {
  const log: AIQueryLog = {
    type: 'ai_query',
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Mask sensitive data from query
  const maskedQuery = entry.query.length > 100
    ? entry.query.substring(0, 100) + '...'
    : entry.query;

  aiLogger.info(log, `AI query: ${maskedQuery}`);
}

/**
 * Log AI query start
 */
export function logAIQueryStart(
  organizationId: string,
  queryId: string,
  queryType: string,
  userId?: string
): void {
  aiLogger.debug({
    type: 'ai_query_start',
    timestamp: new Date().toISOString(),
    organizationId,
    queryId,
    queryType,
    userId,
  }, `AI query started: ${queryType}`);
}

/**
 * Log AI query error
 */
export function logAIQueryError(
  organizationId: string,
  queryId: string,
  error: Error,
  context?: Record<string, unknown>
): void {
  aiLogger.error({
    type: 'ai_query_error',
    timestamp: new Date().toISOString(),
    organizationId,
    queryId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, `AI query error: ${error.message}`);
}

/**
 * Log AI token usage
 */
export function logAITokenUsage(
  organizationId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  cost?: number
): void {
  aiLogger.info({
    type: 'ai_token_usage',
    timestamp: new Date().toISOString(),
    organizationId,
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCost: cost,
  }, `AI tokens: ${promptTokens + completionTokens} (${model})`);
}

// ==========================================
// T248 - Self-Healing Action Logging
// ==========================================

/**
 * Log a self-healing execution
 */
export function logSelfHealingExecution(entry: Omit<SelfHealingLog, 'type' | 'timestamp'>): void {
  const log: SelfHealingLog = {
    type: 'self_healing',
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const level = entry.outcome === 'failure' ? 'error' :
                entry.outcome === 'rollback' ? 'warn' : 'info';

  healingLogger[level](log, `Self-healing ${entry.outcome}: ${entry.patternName}`);
}

/**
 * Log healing pattern detection
 */
export function logPatternDetected(
  organizationId: string,
  patternId: string,
  patternName: string,
  issueType: string,
  severity: string,
  affectedResources: string[]
): void {
  healingLogger.info({
    type: 'pattern_detected',
    timestamp: new Date().toISOString(),
    organizationId,
    patternId,
    patternName,
    issueType,
    severity,
    affectedResources,
  }, `Pattern detected: ${patternName} (${severity})`);
}

/**
 * Log healing action execution
 */
export function logHealingAction(
  organizationId: string,
  executionId: string,
  action: HealingAction
): void {
  const level = action.status === 'failed' ? 'error' :
                action.status === 'rolled_back' ? 'warn' : 'info';

  healingLogger[level]({
    type: 'healing_action',
    timestamp: new Date().toISOString(),
    organizationId,
    executionId,
    action,
  }, `Healing action ${action.status}: ${action.actionType} on ${action.target}`);
}

/**
 * Log healing rollback
 */
export function logHealingRollback(
  organizationId: string,
  executionId: string,
  reason: string,
  rolledBackActions: string[]
): void {
  healingLogger.warn({
    type: 'healing_rollback',
    timestamp: new Date().toISOString(),
    organizationId,
    executionId,
    reason,
    rolledBackActions,
  }, `Healing rollback: ${reason}`);
}

// ==========================================
// T249 - Compliance Violation Logging
// ==========================================

/**
 * Log a compliance violation
 */
export function logComplianceViolation(entry: Omit<ComplianceViolationLog, 'type' | 'timestamp'>): void {
  const log: ComplianceViolationLog = {
    type: 'compliance_violation',
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const level = entry.severity === 'critical' ? 'error' :
                entry.severity === 'warning' ? 'warn' : 'info';

  complianceLogger[level](log, `Compliance violation: ${entry.ruleName} (${entry.severity})`);
}

/**
 * Log compliance check execution
 */
export function logComplianceCheck(
  organizationId: string,
  checkId: string,
  ruleId: string,
  ruleName: string,
  result: 'pass' | 'fail' | 'warning' | 'not_applicable',
  executionTimeMs: number
): void {
  complianceLogger.debug({
    type: 'compliance_check',
    timestamp: new Date().toISOString(),
    organizationId,
    checkId,
    ruleId,
    ruleName,
    result,
    executionTimeMs,
  }, `Compliance check ${result}: ${ruleName}`);
}

/**
 * Log violation remediation
 */
export function logViolationRemediation(
  organizationId: string,
  violationId: string,
  action: string,
  performedBy: string,
  newStatus: string
): void {
  complianceLogger.info({
    type: 'violation_remediation',
    timestamp: new Date().toISOString(),
    organizationId,
    violationId,
    action,
    performedBy,
    newStatus,
  }, `Violation remediation: ${action} by ${performedBy}`);
}

/**
 * Log compliance report generation
 */
export function logComplianceReportGeneration(
  organizationId: string,
  reportId: string,
  reportType: string,
  frameworks: string[],
  generationTimeMs: number,
  violationsIncluded: number
): void {
  complianceLogger.info({
    type: 'compliance_report',
    timestamp: new Date().toISOString(),
    organizationId,
    reportId,
    reportType,
    frameworks,
    generationTimeMs,
    violationsIncluded,
  }, `Compliance report generated: ${reportType}`);
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Create a correlation ID for tracking related operations
 */
export function createCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Time an operation and log the result
 */
export async function timeOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  context: {
    organizationId: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    logger.debug({
      type: 'operation_timing',
      timestamp: new Date().toISOString(),
      operationName,
      duration,
      success: true,
      ...context,
    }, `${operationName} completed in ${duration}ms`);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      type: 'operation_timing',
      timestamp: new Date().toISOString(),
      operationName,
      duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      ...context,
    }, `${operationName} failed after ${duration}ms`);

    throw error;
  }
}

// Export types
export type {
  RoutingDecisionLog,
  RoutingFactor,
  AIQueryLog,
  SelfHealingLog,
  HealingAction,
  ComplianceViolationLog,
  AffectedEntity,
  EvidenceItem,
};

export default {
  // Routing (T246)
  logRoutingDecision,
  logRoutingStart,
  logRoutingError,

  // AI (T247)
  logAIQuery,
  logAIQueryStart,
  logAIQueryError,
  logAITokenUsage,

  // Self-healing (T248)
  logSelfHealingExecution,
  logPatternDetected,
  logHealingAction,
  logHealingRollback,

  // Compliance (T249)
  logComplianceViolation,
  logComplianceCheck,
  logViolationRemediation,
  logComplianceReportGeneration,

  // Utilities
  createCorrelationId,
  timeOperation,
};
