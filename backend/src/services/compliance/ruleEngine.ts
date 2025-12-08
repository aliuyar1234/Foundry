/**
 * Compliance Rule Engine
 * T162 - Create compliance rule engine service
 *
 * Core engine for evaluating compliance rules against organizational data
 */

import { PrismaClient } from '@prisma/client';
import type {
  ComplianceRule,
  RuleLogic,
  RuleConfig,
  QueryRuleConfig,
  ThresholdRuleConfig,
  PatternRuleConfig,
  WorkflowRuleConfig,
  CustomRuleConfig,
  RuleException,
  ComplianceFramework,
  ComplianceCategory,
  CheckFrequency,
  Severity,
} from 'shared/types/compliance.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  framework: ComplianceFramework;
  category: ComplianceCategory;
  severity: Severity;
  evaluatedAt: Date;
  details: {
    message: string;
    findings: EvaluationFinding[];
    evidenceIds: string[];
    exceptions: string[];
  };
  executionTimeMs: number;
}

export interface EvaluationFinding {
  type: 'pass' | 'fail' | 'warning' | 'info';
  entity: string;
  entityId?: string;
  description: string;
  remediation?: string;
}

export interface RuleEvaluationContext {
  organizationId: string;
  evaluationTime: Date;
  dryRun?: boolean;
  /** Specific entity IDs to check (if not provided, checks all) */
  entityScope?: string[];
}

export interface BatchEvaluationResult {
  organizationId: string;
  evaluatedAt: Date;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  skippedRules: number;
  results: RuleEvaluationResult[];
  executionTimeMs: number;
}

/** Registry of custom rule evaluators */
type CustomEvaluatorFn = (
  config: CustomRuleConfig,
  context: RuleEvaluationContext
) => Promise<{ passed: boolean; findings: EvaluationFinding[] }>;

const customEvaluators: Map<string, CustomEvaluatorFn> = new Map();

// =============================================================================
// Rule Evaluation Functions
// =============================================================================

/**
 * Evaluate a single compliance rule
 */
export async function evaluateRule(
  rule: ComplianceRule,
  context: RuleEvaluationContext
): Promise<RuleEvaluationResult> {
  const startTime = Date.now();
  const findings: EvaluationFinding[] = [];
  const evidenceIds: string[] = [];
  const exceptions: string[] = [];

  try {
    // Check if rule is active
    if (!rule.isActive) {
      return createResult(rule, false, findings, evidenceIds, exceptions, startTime, 'Rule is inactive');
    }

    // Check exceptions
    const activeExceptions = checkExceptions(rule.ruleLogic.exceptions || [], context.evaluationTime);
    if (activeExceptions.length > 0) {
      exceptions.push(...activeExceptions.map((e) => e.reason));
    }

    // Evaluate based on rule type
    let passed = false;
    let message = '';

    switch (rule.ruleLogic.config.type) {
      case 'query':
        const queryResult = await evaluateQueryRule(
          rule.ruleLogic.config as QueryRuleConfig,
          context
        );
        passed = queryResult.passed;
        findings.push(...queryResult.findings);
        message = queryResult.message;
        break;

      case 'threshold':
        const thresholdResult = await evaluateThresholdRule(
          rule.ruleLogic.config as ThresholdRuleConfig,
          context
        );
        passed = thresholdResult.passed;
        findings.push(...thresholdResult.findings);
        message = thresholdResult.message;
        break;

      case 'pattern':
        const patternResult = await evaluatePatternRule(
          rule.ruleLogic.config as PatternRuleConfig,
          context
        );
        passed = patternResult.passed;
        findings.push(...patternResult.findings);
        message = patternResult.message;
        break;

      case 'workflow':
        const workflowResult = await evaluateWorkflowRule(
          rule.ruleLogic.config as WorkflowRuleConfig,
          context
        );
        passed = workflowResult.passed;
        findings.push(...workflowResult.findings);
        message = workflowResult.message;
        break;

      case 'custom':
        const customResult = await evaluateCustomRule(
          rule.ruleLogic.config as CustomRuleConfig,
          context
        );
        passed = customResult.passed;
        findings.push(...customResult.findings);
        message = customResult.message;
        break;

      default:
        message = `Unknown rule type: ${(rule.ruleLogic.config as RuleConfig).type}`;
        findings.push({
          type: 'warning',
          entity: 'Rule Engine',
          description: message,
        });
    }

    // Update rule statistics if not dry run
    if (!context.dryRun) {
      await updateRuleStatistics(rule.id, passed);
    }

    return createResult(rule, passed, findings, evidenceIds, exceptions, startTime, message);
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: 'Rule Engine',
      description: `Evaluation error: ${(error as Error).message}`,
    });

    return createResult(rule, false, findings, evidenceIds, exceptions, startTime, `Error: ${(error as Error).message}`);
  }
}

/**
 * Evaluate query-based rule
 */
async function evaluateQueryRule(
  config: QueryRuleConfig,
  context: RuleEvaluationContext
): Promise<{ passed: boolean; findings: EvaluationFinding[]; message: string }> {
  const findings: EvaluationFinding[] = [];

  try {
    // Execute the query with parameters
    const params = {
      ...config.parameters,
      organizationId: context.organizationId,
    };

    // Using raw query execution (simplified for demo)
    const result = await prisma.$queryRawUnsafe<{ count?: number; result?: boolean }[]>(
      config.query,
      ...Object.values(params)
    );

    let passed = false;
    const resultValue = result[0];

    switch (config.expectedResult) {
      case 'zero':
        passed = (resultValue?.count || 0) === 0;
        break;
      case 'non_zero':
        passed = (resultValue?.count || 0) > 0;
        break;
      case 'boolean_true':
        passed = resultValue?.result === true;
        break;
      case 'boolean_false':
        passed = resultValue?.result === false;
        break;
    }

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: 'Query Result',
      description: passed
        ? `Query returned expected result (${config.expectedResult})`
        : `Query did not return expected result. Expected: ${config.expectedResult}`,
    });

    return {
      passed,
      findings,
      message: passed ? 'Query compliance check passed' : 'Query compliance check failed',
    };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: 'Query Execution',
      description: `Query execution failed: ${(error as Error).message}`,
    });

    return {
      passed: false,
      findings,
      message: `Query execution error: ${(error as Error).message}`,
    };
  }
}

/**
 * Evaluate threshold-based rule
 */
async function evaluateThresholdRule(
  config: ThresholdRuleConfig,
  context: RuleEvaluationContext
): Promise<{ passed: boolean; findings: EvaluationFinding[]; message: string }> {
  const findings: EvaluationFinding[] = [];

  try {
    // Get metric value (implementation would fetch from metrics service)
    const metricValue = await getMetricValue(config.metric, context.organizationId);

    let passed = false;

    switch (config.operator) {
      case 'gt':
        passed = metricValue > (config.value as number);
        break;
      case 'gte':
        passed = metricValue >= (config.value as number);
        break;
      case 'lt':
        passed = metricValue < (config.value as number);
        break;
      case 'lte':
        passed = metricValue <= (config.value as number);
        break;
      case 'eq':
        passed = metricValue === (config.value as number);
        break;
      case 'between':
        const [min, max] = config.value as [number, number];
        passed = metricValue >= min && metricValue <= max;
        break;
    }

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.metric,
      description: passed
        ? `Metric ${config.metric} (${metricValue}) meets threshold requirement`
        : `Metric ${config.metric} (${metricValue}) does not meet threshold (${config.operator} ${config.value})`,
      remediation: passed ? undefined : `Adjust ${config.metric} to meet compliance threshold`,
    });

    return {
      passed,
      findings,
      message: passed
        ? `Threshold check passed for ${config.metric}`
        : `Threshold check failed for ${config.metric}`,
    };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.metric,
      description: `Failed to evaluate threshold: ${(error as Error).message}`,
    });

    return {
      passed: false,
      findings,
      message: `Threshold evaluation error: ${(error as Error).message}`,
    };
  }
}

/**
 * Evaluate pattern-based rule
 */
async function evaluatePatternRule(
  config: PatternRuleConfig,
  context: RuleEvaluationContext
): Promise<{ passed: boolean; findings: EvaluationFinding[]; message: string }> {
  const findings: EvaluationFinding[] = [];

  try {
    // Search for pattern in specified scope
    const patternFound = await searchForPattern(
      config.pattern,
      config.scope,
      context.organizationId
    );

    // Pass if pattern should exist and is found, or shouldn't exist and isn't found
    const passed = config.shouldExist ? patternFound : !patternFound;

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.scope,
      description: passed
        ? config.shouldExist
          ? `Required pattern found in ${config.scope}`
          : `Prohibited pattern not found in ${config.scope}`
        : config.shouldExist
        ? `Required pattern not found in ${config.scope}`
        : `Prohibited pattern detected in ${config.scope}`,
      remediation: passed
        ? undefined
        : config.shouldExist
        ? `Implement the required pattern: ${config.pattern}`
        : `Remove instances of prohibited pattern: ${config.pattern}`,
    });

    return {
      passed,
      findings,
      message: passed ? 'Pattern compliance check passed' : 'Pattern compliance check failed',
    };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.scope,
      description: `Pattern search failed: ${(error as Error).message}`,
    });

    return {
      passed: false,
      findings,
      message: `Pattern evaluation error: ${(error as Error).message}`,
    };
  }
}

/**
 * Evaluate workflow-based rule
 */
async function evaluateWorkflowRule(
  config: WorkflowRuleConfig,
  context: RuleEvaluationContext
): Promise<{ passed: boolean; findings: EvaluationFinding[]; message: string }> {
  const findings: EvaluationFinding[] = [];

  try {
    // Get recent workflow executions
    const workflows = await getWorkflowExecutions(context.organizationId);

    let allPassed = true;
    let checkedCount = 0;

    for (const workflow of workflows) {
      checkedCount++;

      // Check required steps
      const hasAllSteps = config.requiredSteps.every((step) =>
        workflow.completedSteps.includes(step)
      );

      // Check required approvers
      const hasApprovers = config.requiredApprovers
        ? config.requiredApprovers.every((approver) =>
            workflow.approvers.some((a) => a === approver || a.includes(approver))
          )
        : true;

      // Check duration
      const withinTime = config.maxDurationHours
        ? workflow.durationHours <= config.maxDurationHours
        : true;

      const workflowPassed = hasAllSteps && hasApprovers && withinTime;

      if (!workflowPassed) {
        allPassed = false;
        const issues: string[] = [];
        if (!hasAllSteps) issues.push('missing required steps');
        if (!hasApprovers) issues.push('missing required approvers');
        if (!withinTime) issues.push('exceeded time limit');

        findings.push({
          type: 'fail',
          entity: workflow.name,
          entityId: workflow.id,
          description: `Workflow non-compliant: ${issues.join(', ')}`,
          remediation: `Review and update workflow ${workflow.name} to meet requirements`,
        });
      }
    }

    if (checkedCount === 0) {
      findings.push({
        type: 'info',
        entity: 'Workflows',
        description: 'No workflows found to evaluate',
      });
    } else if (allPassed) {
      findings.push({
        type: 'pass',
        entity: 'Workflows',
        description: `All ${checkedCount} workflows meet compliance requirements`,
      });
    }

    return {
      passed: allPassed,
      findings,
      message: allPassed
        ? 'Workflow compliance check passed'
        : 'Workflow compliance check failed',
    };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: 'Workflow Engine',
      description: `Workflow evaluation failed: ${(error as Error).message}`,
    });

    return {
      passed: false,
      findings,
      message: `Workflow evaluation error: ${(error as Error).message}`,
    };
  }
}

/**
 * Evaluate custom rule using registered evaluator
 */
async function evaluateCustomRule(
  config: CustomRuleConfig,
  context: RuleEvaluationContext
): Promise<{ passed: boolean; findings: EvaluationFinding[]; message: string }> {
  const evaluator = customEvaluators.get(config.evaluatorName);

  if (!evaluator) {
    return {
      passed: false,
      findings: [
        {
          type: 'fail',
          entity: 'Custom Evaluator',
          description: `Custom evaluator not found: ${config.evaluatorName}`,
        },
      ],
      message: `Custom evaluator "${config.evaluatorName}" not registered`,
    };
  }

  try {
    const result = await evaluator(config, context);
    return {
      passed: result.passed,
      findings: result.findings,
      message: result.passed
        ? `Custom rule "${config.evaluatorName}" passed`
        : `Custom rule "${config.evaluatorName}" failed`,
    };
  } catch (error) {
    return {
      passed: false,
      findings: [
        {
          type: 'fail',
          entity: 'Custom Evaluator',
          description: `Custom evaluator error: ${(error as Error).message}`,
        },
      ],
      message: `Custom evaluation error: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// Batch Evaluation
// =============================================================================

/**
 * Evaluate all active rules for an organization
 */
export async function evaluateAllRules(
  organizationId: string,
  options: {
    framework?: ComplianceFramework;
    category?: ComplianceCategory;
    frequency?: CheckFrequency;
    dryRun?: boolean;
  } = {}
): Promise<BatchEvaluationResult> {
  const startTime = Date.now();

  // Build query filters
  const where: Record<string, unknown> = {
    organizationId,
    isActive: true,
  };

  if (options.framework) where.framework = options.framework;
  if (options.category) where.category = options.category;
  if (options.frequency) where.checkFrequency = options.frequency;

  // Get rules to evaluate
  const rules = await prisma.complianceRule.findMany({
    where,
    orderBy: [{ severity: 'asc' }, { name: 'asc' }],
  });

  const context: RuleEvaluationContext = {
    organizationId,
    evaluationTime: new Date(),
    dryRun: options.dryRun,
  };

  const results: RuleEvaluationResult[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Evaluate each rule
  for (const rule of rules) {
    try {
      const result = await evaluateRule(rule as unknown as ComplianceRule, context);
      results.push(result);

      if (result.passed) {
        passedCount++;
      } else {
        failedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  return {
    organizationId,
    evaluatedAt: new Date(),
    totalRules: rules.length,
    passedRules: passedCount,
    failedRules: failedCount,
    skippedRules: skippedCount,
    results,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Evaluate rules that are due based on their check frequency
 */
export async function evaluateDueRules(organizationId: string): Promise<BatchEvaluationResult> {
  const now = new Date();

  // Get rules that are due for checking
  const rules = await prisma.complianceRule.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        { lastCheckedAt: null },
        {
          AND: [
            { checkFrequency: 'hourly' },
            { lastCheckedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
          ],
        },
        {
          AND: [
            { checkFrequency: 'daily' },
            { lastCheckedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        },
        {
          AND: [
            { checkFrequency: 'weekly' },
            { lastCheckedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
        {
          AND: [
            { checkFrequency: 'monthly' },
            { lastCheckedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          ],
        },
      ],
    },
  });

  const context: RuleEvaluationContext = {
    organizationId,
    evaluationTime: now,
  };

  const results: RuleEvaluationResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const rule of rules) {
    const result = await evaluateRule(rule as unknown as ComplianceRule, context);
    results.push(result);
    if (result.passed) passedCount++;
    else failedCount++;
  }

  return {
    organizationId,
    evaluatedAt: now,
    totalRules: rules.length,
    passedRules: passedCount,
    failedRules: failedCount,
    skippedRules: 0,
    results,
    executionTimeMs: 0,
  };
}

// =============================================================================
// Rule Management
// =============================================================================

/**
 * Register a custom rule evaluator
 */
export function registerCustomEvaluator(name: string, evaluator: CustomEvaluatorFn): void {
  customEvaluators.set(name, evaluator);
}

/**
 * Get registered custom evaluators
 */
export function getRegisteredEvaluators(): string[] {
  return Array.from(customEvaluators.keys());
}

/**
 * Get compliance summary for organization
 */
export async function getComplianceSummary(
  organizationId: string
): Promise<{
  totalRules: number;
  activeRules: number;
  passingRules: number;
  failingRules: number;
  complianceScore: number;
  byFramework: Record<ComplianceFramework, { total: number; passing: number }>;
  byCategory: Record<ComplianceCategory, { total: number; passing: number }>;
}> {
  const rules = await prisma.complianceRule.findMany({
    where: { organizationId },
  });

  const activeRules = rules.filter((r) => r.isActive);
  const passingRules = activeRules.filter((r) => r.passCount > r.failCount);

  const byFramework: Record<string, { total: number; passing: number }> = {};
  const byCategory: Record<string, { total: number; passing: number }> = {};

  for (const rule of activeRules) {
    const framework = rule.framework as string;
    const category = rule.category as string;
    const isPassing = rule.passCount > rule.failCount;

    if (!byFramework[framework]) {
      byFramework[framework] = { total: 0, passing: 0 };
    }
    byFramework[framework].total++;
    if (isPassing) byFramework[framework].passing++;

    if (!byCategory[category]) {
      byCategory[category] = { total: 0, passing: 0 };
    }
    byCategory[category].total++;
    if (isPassing) byCategory[category].passing++;
  }

  const complianceScore =
    activeRules.length > 0
      ? Math.round((passingRules.length / activeRules.length) * 100)
      : 100;

  return {
    totalRules: rules.length,
    activeRules: activeRules.length,
    passingRules: passingRules.length,
    failingRules: activeRules.length - passingRules.length,
    complianceScore,
    byFramework: byFramework as Record<ComplianceFramework, { total: number; passing: number }>,
    byCategory: byCategory as Record<ComplianceCategory, { total: number; passing: number }>,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function createResult(
  rule: ComplianceRule,
  passed: boolean,
  findings: EvaluationFinding[],
  evidenceIds: string[],
  exceptions: string[],
  startTime: number,
  message: string
): RuleEvaluationResult {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    passed,
    framework: rule.framework,
    category: rule.category,
    severity: rule.severity,
    evaluatedAt: new Date(),
    details: {
      message,
      findings,
      evidenceIds,
      exceptions,
    },
    executionTimeMs: Date.now() - startTime,
  };
}

function checkExceptions(exceptions: RuleException[], evaluationTime: Date): RuleException[] {
  return exceptions.filter((exception) => {
    // Check if exception is still valid
    if (exception.expiresAt && new Date(exception.expiresAt) < evaluationTime) {
      return false;
    }

    // Check time period exception
    if (exception.timePeriod) {
      const start = new Date(exception.timePeriod.start);
      const end = new Date(exception.timePeriod.end);
      if (evaluationTime >= start && evaluationTime <= end) {
        return true;
      }
    }

    // Other exception types would be checked against specific entities
    return exception.type === 'condition' || exception.type === 'entity';
  });
}

async function updateRuleStatistics(ruleId: string, passed: boolean): Promise<void> {
  await prisma.complianceRule.update({
    where: { id: ruleId },
    data: {
      lastCheckedAt: new Date(),
      passCount: passed ? { increment: 1 } : undefined,
      failCount: passed ? undefined : { increment: 1 },
    },
  });
}

async function getMetricValue(metric: string, _organizationId: string): Promise<number> {
  // Implementation would fetch from metrics service
  // For now, return a placeholder
  console.log(`Fetching metric: ${metric}`);
  return Math.random() * 100;
}

async function searchForPattern(
  _pattern: string,
  _scope: string,
  _organizationId: string
): Promise<boolean> {
  // Implementation would search for pattern in specified scope
  // For now, return placeholder
  return true;
}

interface WorkflowExecution {
  id: string;
  name: string;
  completedSteps: string[];
  approvers: string[];
  durationHours: number;
}

async function getWorkflowExecutions(_organizationId: string): Promise<WorkflowExecution[]> {
  // Implementation would fetch recent workflow executions
  // For now, return placeholder
  return [];
}

// =============================================================================
// Exports
// =============================================================================

export default {
  evaluateRule,
  evaluateAllRules,
  evaluateDueRules,
  registerCustomEvaluator,
  getRegisteredEvaluators,
  getComplianceSummary,
};
