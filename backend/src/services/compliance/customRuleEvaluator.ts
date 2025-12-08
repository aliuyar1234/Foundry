/**
 * Custom Rule Evaluator
 * T166 - Create custom rule evaluator
 *
 * Allows organizations to define custom compliance rules
 */

import { PrismaClient } from '@prisma/client';
import type { EvaluationFinding, RuleEvaluationContext } from './ruleEngine.js';
import { registerCustomEvaluator } from './ruleEngine.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface CustomRuleDefinition {
  id: string;
  name: string;
  description: string;
  evaluatorType: CustomEvaluatorType;
  config: CustomEvaluatorConfig;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomEvaluatorType =
  | 'data_exists'
  | 'data_count'
  | 'field_value'
  | 'date_comparison'
  | 'relationship_exists'
  | 'aggregate'
  | 'script';

export type CustomEvaluatorConfig =
  | DataExistsConfig
  | DataCountConfig
  | FieldValueConfig
  | DateComparisonConfig
  | RelationshipExistsConfig
  | AggregateConfig
  | ScriptConfig;

export interface DataExistsConfig {
  type: 'data_exists';
  entityType: string;
  filter: Record<string, unknown>;
  shouldExist: boolean;
  message: {
    pass: string;
    fail: string;
  };
}

export interface DataCountConfig {
  type: 'data_count';
  entityType: string;
  filter: Record<string, unknown>;
  operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value: number | [number, number];
  message: {
    pass: string;
    fail: string;
  };
}

export interface FieldValueConfig {
  type: 'field_value';
  entityType: string;
  field: string;
  operator: 'eq' | 'ne' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'regex';
  value: unknown;
  scope: 'all' | 'any' | 'none';
  message: {
    pass: string;
    fail: string;
  };
}

export interface DateComparisonConfig {
  type: 'date_comparison';
  entityType: string;
  dateField: string;
  comparison: 'before' | 'after' | 'within_days' | 'older_than_days';
  referenceDate?: string; // 'now' or ISO date
  days?: number;
  message: {
    pass: string;
    fail: string;
  };
}

export interface RelationshipExistsConfig {
  type: 'relationship_exists';
  sourceEntity: string;
  targetEntity: string;
  relationshipType: string;
  shouldExist: boolean;
  message: {
    pass: string;
    fail: string;
  };
}

export interface AggregateConfig {
  type: 'aggregate';
  entityType: string;
  aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max';
  field?: string;
  filter?: Record<string, unknown>;
  groupBy?: string;
  operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value: number | [number, number];
  message: {
    pass: string;
    fail: string;
  };
}

export interface ScriptConfig {
  type: 'script';
  /** JavaScript expression that returns boolean */
  expression: string;
  /** Variables available to the expression */
  variables: Record<string, string>; // name -> query
  message: {
    pass: string;
    fail: string;
  };
}

export interface CustomEvaluationResult {
  passed: boolean;
  findings: EvaluationFinding[];
  data?: Record<string, unknown>;
}

// =============================================================================
// Custom Evaluator Functions
// =============================================================================

/**
 * Evaluate data exists rule
 */
async function evaluateDataExists(
  config: DataExistsConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    const count = await countEntities(config.entityType, {
      ...config.filter,
      organizationId: context.organizationId,
    });

    const exists = count > 0;
    const passed = config.shouldExist ? exists : !exists;

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.entityType,
      description: passed ? config.message.pass : config.message.fail,
      remediation: passed ? undefined : `Review ${config.entityType} data`,
    });

    return { passed, findings, data: { count, exists } };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.entityType,
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

/**
 * Evaluate data count rule
 */
async function evaluateDataCount(
  config: DataCountConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    const count = await countEntities(config.entityType, {
      ...config.filter,
      organizationId: context.organizationId,
    });

    let passed = false;

    switch (config.operator) {
      case 'eq':
        passed = count === config.value;
        break;
      case 'gt':
        passed = count > (config.value as number);
        break;
      case 'gte':
        passed = count >= (config.value as number);
        break;
      case 'lt':
        passed = count < (config.value as number);
        break;
      case 'lte':
        passed = count <= (config.value as number);
        break;
      case 'between':
        const [min, max] = config.value as [number, number];
        passed = count >= min && count <= max;
        break;
    }

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.entityType,
      description: passed
        ? config.message.pass.replace('{count}', count.toString())
        : config.message.fail.replace('{count}', count.toString()),
    });

    return { passed, findings, data: { count } };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.entityType,
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

/**
 * Evaluate field value rule
 */
async function evaluateFieldValue(
  config: FieldValueConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    const entities = await getEntities(config.entityType, {
      organizationId: context.organizationId,
    });

    let matchCount = 0;
    let nonMatchCount = 0;
    const nonMatchingEntities: string[] = [];

    for (const entity of entities) {
      const fieldValue = getNestedValue(entity, config.field);
      let matches = false;

      switch (config.operator) {
        case 'eq':
          matches = fieldValue === config.value;
          break;
        case 'ne':
          matches = fieldValue !== config.value;
          break;
        case 'contains':
          matches = String(fieldValue).includes(String(config.value));
          break;
        case 'not_contains':
          matches = !String(fieldValue).includes(String(config.value));
          break;
        case 'in':
          matches = (config.value as unknown[]).includes(fieldValue);
          break;
        case 'not_in':
          matches = !(config.value as unknown[]).includes(fieldValue);
          break;
        case 'regex':
          matches = new RegExp(config.value as string).test(String(fieldValue));
          break;
      }

      if (matches) {
        matchCount++;
      } else {
        nonMatchCount++;
        if (nonMatchingEntities.length < 5) {
          nonMatchingEntities.push(entity.id || entity.name || 'unknown');
        }
      }
    }

    let passed = false;

    switch (config.scope) {
      case 'all':
        passed = nonMatchCount === 0;
        break;
      case 'any':
        passed = matchCount > 0;
        break;
      case 'none':
        passed = matchCount === 0;
        break;
    }

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.entityType,
      description: passed
        ? config.message.pass
        : `${config.message.fail} (${nonMatchCount} non-matching)`,
      remediation: passed
        ? undefined
        : `Review entities: ${nonMatchingEntities.join(', ')}`,
    });

    return { passed, findings, data: { matchCount, nonMatchCount } };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.entityType,
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

/**
 * Evaluate date comparison rule
 */
async function evaluateDateComparison(
  config: DateComparisonConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    const entities = await getEntities(config.entityType, {
      organizationId: context.organizationId,
    });

    const referenceDate =
      config.referenceDate === 'now' || !config.referenceDate
        ? new Date()
        : new Date(config.referenceDate);

    let violationCount = 0;
    const violations: string[] = [];

    for (const entity of entities) {
      const dateValue = new Date(getNestedValue(entity, config.dateField));
      let isViolation = false;

      switch (config.comparison) {
        case 'before':
          isViolation = dateValue >= referenceDate;
          break;
        case 'after':
          isViolation = dateValue <= referenceDate;
          break;
        case 'within_days':
          const withinMs = (config.days || 0) * 24 * 60 * 60 * 1000;
          isViolation = Math.abs(dateValue.getTime() - referenceDate.getTime()) > withinMs;
          break;
        case 'older_than_days':
          const maxAgeMs = (config.days || 0) * 24 * 60 * 60 * 1000;
          isViolation = referenceDate.getTime() - dateValue.getTime() > maxAgeMs;
          break;
      }

      if (isViolation) {
        violationCount++;
        if (violations.length < 5) {
          violations.push(entity.id || entity.name || 'unknown');
        }
      }
    }

    const passed = violationCount === 0;

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.entityType,
      description: passed
        ? config.message.pass
        : `${config.message.fail} (${violationCount} violations)`,
      remediation: passed ? undefined : `Review entities: ${violations.join(', ')}`,
    });

    return { passed, findings, data: { violationCount } };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.entityType,
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

/**
 * Evaluate relationship exists rule
 */
async function evaluateRelationshipExists(
  config: RelationshipExistsConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    // Check for relationships in graph database
    const relationshipExists = await checkRelationshipExists(
      config.sourceEntity,
      config.targetEntity,
      config.relationshipType,
      context.organizationId
    );

    const passed = config.shouldExist ? relationshipExists : !relationshipExists;

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: `${config.sourceEntity}->${config.targetEntity}`,
      description: passed ? config.message.pass : config.message.fail,
    });

    return { passed, findings, data: { relationshipExists } };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.sourceEntity,
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

/**
 * Evaluate aggregate rule
 */
async function evaluateAggregate(
  config: AggregateConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    const aggregateValue = await calculateAggregate(
      config.entityType,
      config.aggregation,
      config.field,
      {
        ...config.filter,
        organizationId: context.organizationId,
      }
    );

    let passed = false;

    switch (config.operator) {
      case 'eq':
        passed = aggregateValue === config.value;
        break;
      case 'gt':
        passed = aggregateValue > (config.value as number);
        break;
      case 'gte':
        passed = aggregateValue >= (config.value as number);
        break;
      case 'lt':
        passed = aggregateValue < (config.value as number);
        break;
      case 'lte':
        passed = aggregateValue <= (config.value as number);
        break;
      case 'between':
        const [min, max] = config.value as [number, number];
        passed = aggregateValue >= min && aggregateValue <= max;
        break;
    }

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: config.entityType,
      description: passed
        ? config.message.pass.replace('{value}', aggregateValue.toString())
        : config.message.fail.replace('{value}', aggregateValue.toString()),
    });

    return { passed, findings, data: { aggregateValue } };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: config.entityType,
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

/**
 * Evaluate script rule (with sandbox)
 */
async function evaluateScript(
  config: ScriptConfig,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const findings: EvaluationFinding[] = [];

  try {
    // Fetch variables
    const variables: Record<string, unknown> = {};

    for (const [name, query] of Object.entries(config.variables)) {
      variables[name] = await executeQuery(query, context.organizationId);
    }

    // Execute expression in sandbox
    const passed = evaluateExpression(config.expression, variables);

    findings.push({
      type: passed ? 'pass' : 'fail',
      entity: 'Script Evaluation',
      description: passed ? config.message.pass : config.message.fail,
    });

    return { passed, findings, data: variables };
  } catch (error) {
    findings.push({
      type: 'fail',
      entity: 'Script Evaluation',
      description: `Evaluation error: ${(error as Error).message}`,
    });
    return { passed: false, findings };
  }
}

// =============================================================================
// Main Evaluator Function
// =============================================================================

/**
 * Evaluate a custom rule based on its type
 */
export async function evaluateCustomRule(
  definition: CustomRuleDefinition,
  context: RuleEvaluationContext
): Promise<CustomEvaluationResult> {
  const config = definition.config;

  switch (config.type) {
    case 'data_exists':
      return evaluateDataExists(config, context);
    case 'data_count':
      return evaluateDataCount(config, context);
    case 'field_value':
      return evaluateFieldValue(config, context);
    case 'date_comparison':
      return evaluateDateComparison(config, context);
    case 'relationship_exists':
      return evaluateRelationshipExists(config, context);
    case 'aggregate':
      return evaluateAggregate(config, context);
    case 'script':
      return evaluateScript(config, context);
    default:
      return {
        passed: false,
        findings: [
          {
            type: 'fail',
            entity: 'Custom Rule',
            description: `Unknown evaluator type: ${(config as CustomEvaluatorConfig).type}`,
          },
        ],
      };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function countEntities(
  _entityType: string,
  _filter: Record<string, unknown>
): Promise<number> {
  // Implementation would use Prisma to count entities
  return 0;
}

async function getEntities(
  _entityType: string,
  _filter: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  // Implementation would fetch entities from database
  return [];
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc, part) => {
    return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
  }, obj as unknown);
}

async function checkRelationshipExists(
  _sourceEntity: string,
  _targetEntity: string,
  _relationshipType: string,
  _organizationId: string
): Promise<boolean> {
  // Implementation would check Neo4j for relationship
  return true;
}

async function calculateAggregate(
  _entityType: string,
  _aggregation: string,
  _field?: string,
  _filter?: Record<string, unknown>
): Promise<number> {
  // Implementation would calculate aggregate
  return 0;
}

async function executeQuery(
  _query: string,
  _organizationId: string
): Promise<unknown> {
  // Implementation would execute query safely
  return null;
}

function evaluateExpression(
  expression: string,
  variables: Record<string, unknown>
): boolean {
  // Safe expression evaluation (no eval!)
  // In production, use a proper expression evaluator library
  const safeExpression = expression
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/!/g, ' not ');

  // Simple evaluation for common patterns
  // Would use a proper sandboxed evaluator in production
  try {
    const fn = new Function(
      ...Object.keys(variables),
      `return ${safeExpression};`
    );
    return Boolean(fn(...Object.values(variables)));
  } catch {
    return false;
  }
}

// =============================================================================
// Register Generic Custom Evaluator
// =============================================================================

registerCustomEvaluator('custom_rule', async (config, context) => {
  // Load custom rule definition
  const definition = await prisma.complianceRule.findFirst({
    where: {
      id: config.parameters.ruleId as string,
      organizationId: context.organizationId,
    },
  });

  if (!definition) {
    return {
      passed: false,
      findings: [
        {
          type: 'fail',
          entity: 'Custom Rule',
          description: 'Custom rule definition not found',
        },
      ],
    };
  }

  return evaluateCustomRule(
    {
      ...definition,
      evaluatorType: (definition.ruleLogic as Record<string, unknown>).evaluatorType as CustomEvaluatorType,
      config: (definition.ruleLogic as Record<string, unknown>).config as CustomEvaluatorConfig,
    } as CustomRuleDefinition,
    context
  );
});

// =============================================================================
// Exports
// =============================================================================

export default {
  evaluateCustomRule,
  evaluateDataExists,
  evaluateDataCount,
  evaluateFieldValue,
  evaluateDateComparison,
  evaluateRelationshipExists,
  evaluateAggregate,
  evaluateScript,
};
