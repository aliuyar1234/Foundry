/**
 * SSOT Validation Rules Engine
 * Validates master records against configurable rules
 * T285 - Validation rules engine
 */

import { v4 as uuidv4 } from 'uuid';
import { MasterRecord } from './masterRecordService.js';
import { prisma } from '../../lib/prisma.js';

export type RuleType =
  | 'required'
  | 'format'
  | 'range'
  | 'enum'
  | 'unique'
  | 'reference'
  | 'custom'
  | 'conditional';

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface ValidationRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  entityType: string;
  field: string;
  ruleType: RuleType;
  severity: RuleSeverity;
  config: RuleConfig;
  enabled: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleConfig {
  // Required rule
  allowEmpty?: boolean;

  // Format rule
  pattern?: string;
  patternDescription?: string;

  // Range rule
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;

  // Enum rule
  allowedValues?: unknown[];

  // Reference rule
  referenceEntity?: string;
  referenceField?: string;

  // Conditional rule
  condition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'exists' | 'empty';
    value?: unknown;
  };

  // Custom rule
  customValidator?: string;

  // Error message
  errorMessage?: string;
}

export interface ValidationRuleInput {
  name: string;
  description?: string;
  entityType: string;
  field: string;
  ruleType: RuleType;
  severity?: RuleSeverity;
  config: RuleConfig;
  enabled?: boolean;
  order?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

export interface ValidationError {
  field: string;
  rule: string;
  ruleType: RuleType;
  message: string;
  severity: RuleSeverity;
  value?: unknown;
}

export interface BulkValidationResult {
  recordId: string;
  valid: boolean;
  result: ValidationResult;
}

/**
 * Create a validation rule
 */
export async function createValidationRule(
  organizationId: string,
  input: ValidationRuleInput
): Promise<ValidationRule> {
  const id = uuidv4();
  const now = new Date();

  // Get max order for entity type
  const maxOrder = await prisma.validationRule.aggregate({
    where: { organizationId, entityType: input.entityType },
    _max: { order: true },
  });

  const rule = await prisma.validationRule.create({
    data: {
      id,
      organizationId,
      name: input.name,
      description: input.description,
      entityType: input.entityType,
      field: input.field,
      ruleType: input.ruleType,
      severity: input.severity || 'error',
      config: input.config as Record<string, unknown>,
      enabled: input.enabled !== false,
      order: input.order ?? (maxOrder._max.order || 0) + 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  return transformRule(rule);
}

/**
 * Get a validation rule by ID
 */
export async function getValidationRule(
  organizationId: string,
  ruleId: string
): Promise<ValidationRule | null> {
  const rule = await prisma.validationRule.findFirst({
    where: {
      id: ruleId,
      organizationId,
    },
  });

  return rule ? transformRule(rule) : null;
}

/**
 * Update a validation rule
 */
export async function updateValidationRule(
  organizationId: string,
  ruleId: string,
  updates: Partial<ValidationRuleInput>
): Promise<ValidationRule> {
  const existing = await getValidationRule(organizationId, ruleId);
  if (!existing) {
    throw new Error('Validation rule not found');
  }

  const rule = await prisma.validationRule.update({
    where: { id: ruleId },
    data: {
      name: updates.name,
      description: updates.description,
      field: updates.field,
      ruleType: updates.ruleType,
      severity: updates.severity,
      config: updates.config as Record<string, unknown>,
      enabled: updates.enabled,
      order: updates.order,
      updatedAt: new Date(),
    },
  });

  return transformRule(rule);
}

/**
 * Delete a validation rule
 */
export async function deleteValidationRule(
  organizationId: string,
  ruleId: string
): Promise<void> {
  const existing = await getValidationRule(organizationId, ruleId);
  if (!existing) {
    throw new Error('Validation rule not found');
  }

  await prisma.validationRule.delete({
    where: { id: ruleId },
  });
}

/**
 * Get validation rules for an entity type
 */
export async function getValidationRules(
  organizationId: string,
  entityType?: string,
  options?: { enabledOnly?: boolean }
): Promise<ValidationRule[]> {
  const where: Record<string, unknown> = {
    organizationId,
  };

  if (entityType) {
    where.entityType = entityType;
  }

  if (options?.enabledOnly) {
    where.enabled = true;
  }

  const rules = await prisma.validationRule.findMany({
    where,
    orderBy: [{ entityType: 'asc' }, { order: 'asc' }],
  });

  return rules.map(transformRule);
}

/**
 * Validate a master record against all applicable rules
 */
export async function validateRecord(
  organizationId: string,
  record: MasterRecord | { entityType: string; data: Record<string, unknown> }
): Promise<ValidationResult> {
  const rules = await getValidationRules(organizationId, record.entityType, {
    enabledOnly: true,
  });

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  };

  for (const rule of rules) {
    const error = await evaluateRule(rule, record.data, organizationId);
    if (error) {
      switch (error.severity) {
        case 'error':
          result.errors.push(error);
          result.valid = false;
          break;
        case 'warning':
          result.warnings.push(error);
          break;
        case 'info':
          result.info.push(error);
          break;
      }
    }
  }

  return result;
}

/**
 * Validate multiple records
 */
export async function validateRecords(
  organizationId: string,
  records: Array<MasterRecord | { id: string; entityType: string; data: Record<string, unknown> }>
): Promise<BulkValidationResult[]> {
  const results: BulkValidationResult[] = [];

  for (const record of records) {
    const result = await validateRecord(organizationId, record);
    results.push({
      recordId: 'id' in record ? record.id : 'unknown',
      valid: result.valid,
      result,
    });
  }

  return results;
}

/**
 * Validate data before creating/updating a record
 */
export async function validateData(
  organizationId: string,
  entityType: string,
  data: Record<string, unknown>
): Promise<ValidationResult> {
  return validateRecord(organizationId, { entityType, data });
}

/**
 * Toggle rule enabled status
 */
export async function toggleRule(
  organizationId: string,
  ruleId: string,
  enabled: boolean
): Promise<ValidationRule> {
  return updateValidationRule(organizationId, ruleId, { enabled });
}

/**
 * Reorder rules
 */
export async function reorderRules(
  organizationId: string,
  entityType: string,
  ruleIds: string[]
): Promise<ValidationRule[]> {
  const updates = ruleIds.map((id, index) =>
    prisma.validationRule.updateMany({
      where: { id, organizationId, entityType },
      data: { order: index + 1, updatedAt: new Date() },
    })
  );

  await prisma.$transaction(updates);

  return getValidationRules(organizationId, entityType);
}

/**
 * Get predefined rule templates
 */
export function getRuleTemplates(): Array<{
  name: string;
  ruleType: RuleType;
  description: string;
  config: Partial<RuleConfig>;
}> {
  return [
    {
      name: 'Required Field',
      ruleType: 'required',
      description: 'Ensures the field has a non-empty value',
      config: { allowEmpty: false },
    },
    {
      name: 'Email Format',
      ruleType: 'format',
      description: 'Validates email address format',
      config: {
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        patternDescription: 'Valid email address',
      },
    },
    {
      name: 'Phone Format',
      ruleType: 'format',
      description: 'Validates phone number format',
      config: {
        pattern: '^[+]?[(]?[0-9]{1,4}[)]?[-\\s./0-9]*$',
        patternDescription: 'Valid phone number',
      },
    },
    {
      name: 'URL Format',
      ruleType: 'format',
      description: 'Validates URL format',
      config: {
        pattern: '^https?://[\\w.-]+(?:\\.[\\w.-]+)+[/\\w.-]*$',
        patternDescription: 'Valid URL',
      },
    },
    {
      name: 'Postal Code (DE)',
      ruleType: 'format',
      description: 'Validates German postal code format',
      config: {
        pattern: '^[0-9]{5}$',
        patternDescription: '5-digit postal code',
      },
    },
    {
      name: 'String Length',
      ruleType: 'range',
      description: 'Validates string length within bounds',
      config: { minLength: 1, maxLength: 255 },
    },
    {
      name: 'Numeric Range',
      ruleType: 'range',
      description: 'Validates numeric value within bounds',
      config: { min: 0, max: 1000000 },
    },
    {
      name: 'Positive Number',
      ruleType: 'range',
      description: 'Ensures value is a positive number',
      config: { min: 0 },
    },
    {
      name: 'Percentage',
      ruleType: 'range',
      description: 'Validates percentage value (0-100)',
      config: { min: 0, max: 100 },
    },
    {
      name: 'Status Values',
      ruleType: 'enum',
      description: 'Validates against allowed status values',
      config: { allowedValues: ['active', 'inactive', 'pending', 'archived'] },
    },
    {
      name: 'Country Code',
      ruleType: 'enum',
      description: 'Validates ISO country code',
      config: {
        allowedValues: ['DE', 'AT', 'CH', 'US', 'GB', 'FR', 'IT', 'ES', 'NL', 'BE'],
      },
    },
  ];
}

/**
 * Create default rules for an entity type
 */
export async function createDefaultRules(
  organizationId: string,
  entityType: string
): Promise<ValidationRule[]> {
  const defaultRules: Record<string, ValidationRuleInput[]> = {
    company: [
      {
        name: 'Company Name Required',
        entityType: 'company',
        field: 'name',
        ruleType: 'required',
        config: { errorMessage: 'Company name is required' },
      },
      {
        name: 'Valid Email',
        entityType: 'company',
        field: 'email',
        ruleType: 'format',
        severity: 'warning',
        config: {
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          errorMessage: 'Invalid email format',
        },
      },
    ],
    person: [
      {
        name: 'First Name Required',
        entityType: 'person',
        field: 'firstName',
        ruleType: 'required',
        config: { errorMessage: 'First name is required' },
      },
      {
        name: 'Last Name Required',
        entityType: 'person',
        field: 'lastName',
        ruleType: 'required',
        config: { errorMessage: 'Last name is required' },
      },
      {
        name: 'Valid Email',
        entityType: 'person',
        field: 'email',
        ruleType: 'format',
        severity: 'warning',
        config: {
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          errorMessage: 'Invalid email format',
        },
      },
    ],
    product: [
      {
        name: 'Product Name Required',
        entityType: 'product',
        field: 'name',
        ruleType: 'required',
        config: { errorMessage: 'Product name is required' },
      },
      {
        name: 'SKU Required',
        entityType: 'product',
        field: 'sku',
        ruleType: 'required',
        config: { errorMessage: 'SKU is required' },
      },
      {
        name: 'Positive Price',
        entityType: 'product',
        field: 'price',
        ruleType: 'range',
        config: { min: 0, errorMessage: 'Price must be positive' },
      },
    ],
    address: [
      {
        name: 'Street Required',
        entityType: 'address',
        field: 'street',
        ruleType: 'required',
        config: { errorMessage: 'Street is required' },
      },
      {
        name: 'City Required',
        entityType: 'address',
        field: 'city',
        ruleType: 'required',
        config: { errorMessage: 'City is required' },
      },
      {
        name: 'Postal Code Required',
        entityType: 'address',
        field: 'postalCode',
        ruleType: 'required',
        config: { errorMessage: 'Postal code is required' },
      },
      {
        name: 'Country Required',
        entityType: 'address',
        field: 'country',
        ruleType: 'required',
        config: { errorMessage: 'Country is required' },
      },
    ],
  };

  const rules = defaultRules[entityType] || [];
  const created: ValidationRule[] = [];

  for (const rule of rules) {
    const createdRule = await createValidationRule(organizationId, rule);
    created.push(createdRule);
  }

  return created;
}

/**
 * Get validation statistics
 */
export async function getValidationStats(organizationId: string): Promise<{
  totalRules: number;
  enabledRules: number;
  byEntityType: Record<string, number>;
  byRuleType: Record<string, number>;
  bySeverity: Record<string, number>;
}> {
  const [total, enabled, byEntityType, byRuleType, bySeverity] = await Promise.all([
    prisma.validationRule.count({ where: { organizationId } }),
    prisma.validationRule.count({ where: { organizationId, enabled: true } }),
    prisma.validationRule.groupBy({
      by: ['entityType'],
      where: { organizationId },
      _count: true,
    }),
    prisma.validationRule.groupBy({
      by: ['ruleType'],
      where: { organizationId },
      _count: true,
    }),
    prisma.validationRule.groupBy({
      by: ['severity'],
      where: { organizationId },
      _count: true,
    }),
  ]);

  return {
    totalRules: total,
    enabledRules: enabled,
    byEntityType: Object.fromEntries(byEntityType.map((e) => [e.entityType, e._count])),
    byRuleType: Object.fromEntries(byRuleType.map((r) => [r.ruleType, r._count])),
    bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
  };
}

// Helper functions

async function evaluateRule(
  rule: ValidationRule,
  data: Record<string, unknown>,
  organizationId: string
): Promise<ValidationError | null> {
  const value = getNestedValue(data, rule.field);
  const config = rule.config;

  // Check conditional rules first
  if (rule.ruleType === 'conditional' && config.condition) {
    const conditionMet = evaluateCondition(data, config.condition);
    if (!conditionMet) {
      return null; // Skip rule if condition not met
    }
  }

  let isValid = true;
  let errorMessage = config.errorMessage || `Validation failed for ${rule.field}`;

  switch (rule.ruleType) {
    case 'required':
      isValid = !isEmpty(value, config.allowEmpty);
      errorMessage = config.errorMessage || `${rule.field} is required`;
      break;

    case 'format':
      if (!isEmpty(value, true) && config.pattern) {
        const regex = new RegExp(config.pattern);
        isValid = typeof value === 'string' && regex.test(value);
        errorMessage =
          config.errorMessage ||
          `${rule.field} must match format: ${config.patternDescription || config.pattern}`;
      } else {
        return null; // Skip format validation for empty values
      }
      break;

    case 'range':
      if (!isEmpty(value, true)) {
        if (typeof value === 'number') {
          if (config.min !== undefined && value < config.min) {
            isValid = false;
            errorMessage = config.errorMessage || `${rule.field} must be at least ${config.min}`;
          }
          if (config.max !== undefined && value > config.max) {
            isValid = false;
            errorMessage = config.errorMessage || `${rule.field} must be at most ${config.max}`;
          }
        } else if (typeof value === 'string') {
          if (config.minLength !== undefined && value.length < config.minLength) {
            isValid = false;
            errorMessage =
              config.errorMessage ||
              `${rule.field} must be at least ${config.minLength} characters`;
          }
          if (config.maxLength !== undefined && value.length > config.maxLength) {
            isValid = false;
            errorMessage =
              config.errorMessage ||
              `${rule.field} must be at most ${config.maxLength} characters`;
          }
        }
      } else {
        return null; // Skip range validation for empty values
      }
      break;

    case 'enum':
      if (!isEmpty(value, true) && config.allowedValues) {
        isValid = config.allowedValues.includes(value);
        errorMessage =
          config.errorMessage ||
          `${rule.field} must be one of: ${config.allowedValues.join(', ')}`;
      } else {
        return null;
      }
      break;

    case 'unique':
      if (!isEmpty(value, true)) {
        isValid = await checkUnique(organizationId, rule.entityType, rule.field, value);
        errorMessage = config.errorMessage || `${rule.field} must be unique`;
      } else {
        return null;
      }
      break;

    case 'reference':
      if (!isEmpty(value, true) && config.referenceEntity) {
        isValid = await checkReference(
          organizationId,
          config.referenceEntity,
          config.referenceField || 'id',
          value
        );
        errorMessage =
          config.errorMessage ||
          `${rule.field} must reference a valid ${config.referenceEntity}`;
      } else {
        return null;
      }
      break;

    case 'custom':
      if (config.customValidator) {
        try {
          // Custom validators can be JavaScript expressions
          // They have access to 'value', 'data', and 'field' variables
          const fn = new Function('value', 'data', 'field', `return ${config.customValidator}`);
          isValid = fn(value, data, rule.field);
        } catch {
          isValid = false;
          errorMessage = 'Custom validation error';
        }
      }
      break;

    case 'conditional':
      // Already handled the condition check above
      // Now apply the actual validation (usually required or format)
      if (!isEmpty(value, config.allowEmpty)) {
        return null;
      }
      isValid = false;
      errorMessage = config.errorMessage || `${rule.field} is required when condition is met`;
      break;
  }

  if (!isValid) {
    return {
      field: rule.field,
      rule: rule.name,
      ruleType: rule.ruleType,
      message: errorMessage,
      severity: rule.severity,
      value,
    };
  }

  return null;
}

function isEmpty(value: unknown, allowEmpty?: boolean): boolean {
  if (allowEmpty) return false;
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function evaluateCondition(
  data: Record<string, unknown>,
  condition: NonNullable<RuleConfig['condition']>
): boolean {
  const value = getNestedValue(data, condition.field);

  switch (condition.operator) {
    case 'equals':
      return value === condition.value;
    case 'not_equals':
      return value !== condition.value;
    case 'contains':
      return (
        typeof value === 'string' &&
        typeof condition.value === 'string' &&
        value.includes(condition.value)
      );
    case 'exists':
      return value !== null && value !== undefined;
    case 'empty':
      return isEmpty(value, false);
    default:
      return false;
  }
}

async function checkUnique(
  organizationId: string,
  entityType: string,
  field: string,
  value: unknown
): Promise<boolean> {
  const count = await prisma.masterRecord.count({
    where: {
      organizationId,
      entityType,
      status: { not: 'deleted' },
      data: {
        path: [field],
        equals: value,
      },
    },
  });

  return count === 0;
}

async function checkReference(
  organizationId: string,
  referenceEntity: string,
  referenceField: string,
  value: unknown
): Promise<boolean> {
  const where: Record<string, unknown> = {
    organizationId,
    entityType: referenceEntity,
    status: { not: 'deleted' },
  };

  if (referenceField === 'id') {
    where.id = value;
  } else {
    where.data = {
      path: [referenceField],
      equals: value,
    };
  }

  const count = await prisma.masterRecord.count({ where });
  return count > 0;
}

function transformRule(rule: Record<string, unknown>): ValidationRule {
  return {
    id: rule.id as string,
    organizationId: rule.organizationId as string,
    name: rule.name as string,
    description: rule.description as string | undefined,
    entityType: rule.entityType as string,
    field: rule.field as string,
    ruleType: rule.ruleType as RuleType,
    severity: rule.severity as RuleSeverity,
    config: rule.config as RuleConfig,
    enabled: rule.enabled as boolean,
    order: rule.order as number,
    createdAt: rule.createdAt as Date,
    updatedAt: rule.updatedAt as Date,
  };
}

export default {
  createValidationRule,
  getValidationRule,
  updateValidationRule,
  deleteValidationRule,
  getValidationRules,
  validateRecord,
  validateRecords,
  validateData,
  toggleRule,
  reorderRules,
  getRuleTemplates,
  createDefaultRules,
  getValidationStats,
};
