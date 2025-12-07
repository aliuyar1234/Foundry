/**
 * Export Validation Service
 * Validates export data against target system schemas
 * T273 - Export validation implementation
 */

import { EntityRecord, EntityType } from '../entityRecordService.js';

export interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'length' | 'range' | 'enum' | 'regex' | 'custom';
  params?: any;
  message?: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  recordsValidated: number;
  recordsWithErrors: number;
  recordsWithWarnings: number;
  summary: ValidationSummary;
}

export interface ValidationIssue {
  recordId: string;
  recordIndex: number;
  field: string;
  value: any;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationSummary {
  totalErrors: number;
  totalWarnings: number;
  errorsByField: Record<string, number>;
  warningsByField: Record<string, number>;
  errorsByRule: Record<string, number>;
}

export type ExportTarget = 'sap_b1' | 'odoo' | 'dynamics_365' | 'sql' | 'csv' | 'bpmn';

// Validation rules for SAP B1
const SAP_B1_RULES: Record<EntityType, ValidationRule[]> = {
  company: [
    { field: 'id', type: 'required', severity: 'error', message: 'CardCode is required' },
    { field: 'id', type: 'length', params: { max: 15 }, severity: 'error', message: 'CardCode max 15 chars' },
    { field: 'name', type: 'required', severity: 'error', message: 'CardName is required' },
    { field: 'name', type: 'length', params: { max: 100 }, severity: 'error', message: 'CardName max 100 chars' },
    { field: 'email', type: 'format', params: { format: 'email' }, severity: 'warning', message: 'Invalid email format' },
    { field: 'vatId', type: 'regex', params: { pattern: '^[A-Z]{2}[0-9A-Z]+$' }, severity: 'warning', message: 'VAT ID should be EU format' },
    { field: 'phone', type: 'length', params: { max: 20 }, severity: 'warning', message: 'Phone max 20 chars' },
  ],
  person: [
    { field: 'lastName', type: 'required', severity: 'error', message: 'Last name is required' },
    { field: 'email', type: 'format', params: { format: 'email' }, severity: 'warning', message: 'Invalid email format' },
  ],
  product: [
    { field: 'id', type: 'required', severity: 'error', message: 'ItemCode is required' },
    { field: 'id', type: 'length', params: { max: 20 }, severity: 'error', message: 'ItemCode max 20 chars' },
    { field: 'name', type: 'required', severity: 'error', message: 'ItemName is required' },
    { field: 'name', type: 'length', params: { max: 100 }, severity: 'error', message: 'ItemName max 100 chars' },
  ],
  address: [],
  contact: [],
  invoice: [],
  order: [],
  contract: [],
  project: [],
  document: [],
};

// Validation rules for Odoo
const ODOO_RULES: Record<EntityType, ValidationRule[]> = {
  company: [
    { field: 'name', type: 'required', severity: 'error', message: 'Partner name is required' },
    { field: 'email', type: 'format', params: { format: 'email' }, severity: 'warning', message: 'Invalid email format' },
  ],
  person: [
    { field: 'name', type: 'required', severity: 'error', message: 'Contact name is required' },
  ],
  product: [
    { field: 'name', type: 'required', severity: 'error', message: 'Product name is required' },
    { field: 'price', type: 'range', params: { min: 0 }, severity: 'warning', message: 'Price should be positive' },
  ],
  address: [],
  contact: [],
  invoice: [],
  order: [],
  contract: [],
  project: [],
  document: [],
};

// Validation rules for Dynamics 365
const DYNAMICS_RULES: Record<EntityType, ValidationRule[]> = {
  company: [
    { field: 'name', type: 'required', severity: 'error', message: 'Account name is required' },
    { field: 'name', type: 'length', params: { max: 160 }, severity: 'error', message: 'Name max 160 chars' },
    { field: 'email', type: 'format', params: { format: 'email' }, severity: 'warning', message: 'Invalid email format' },
    { field: 'website', type: 'format', params: { format: 'url' }, severity: 'warning', message: 'Invalid URL format' },
  ],
  person: [
    { field: 'firstName', type: 'required', severity: 'error', message: 'First name is required' },
    { field: 'lastName', type: 'required', severity: 'error', message: 'Last name is required' },
  ],
  product: [
    { field: 'id', type: 'required', severity: 'error', message: 'Product number is required' },
    { field: 'name', type: 'required', severity: 'error', message: 'Product name is required' },
  ],
  address: [],
  contact: [],
  invoice: [],
  order: [],
  contract: [],
  project: [],
  document: [],
};

// Generic SQL rules
const SQL_RULES: Record<EntityType, ValidationRule[]> = {
  company: [
    { field: 'id', type: 'required', severity: 'error', message: 'ID is required' },
  ],
  person: [
    { field: 'id', type: 'required', severity: 'error', message: 'ID is required' },
  ],
  product: [
    { field: 'id', type: 'required', severity: 'error', message: 'ID is required' },
  ],
  address: [],
  contact: [],
  invoice: [],
  order: [],
  contract: [],
  project: [],
  document: [],
};

// Validation rule sets by target
const RULE_SETS: Record<ExportTarget, Record<EntityType, ValidationRule[]>> = {
  sap_b1: SAP_B1_RULES,
  odoo: ODOO_RULES,
  dynamics_365: DYNAMICS_RULES,
  sql: SQL_RULES,
  csv: SQL_RULES,
  bpmn: {},
};

/**
 * Validate a single value against a rule
 */
function validateValue(value: any, rule: ValidationRule): boolean {
  switch (rule.type) {
    case 'required':
      return value !== null && value !== undefined && value !== '';

    case 'length':
      if (typeof value !== 'string') return true;
      const len = value.length;
      if (rule.params.min && len < rule.params.min) return false;
      if (rule.params.max && len > rule.params.max) return false;
      return true;

    case 'range':
      if (typeof value !== 'number') return true;
      if (rule.params.min !== undefined && value < rule.params.min) return false;
      if (rule.params.max !== undefined && value > rule.params.max) return false;
      return true;

    case 'format':
      if (!value) return true;
      switch (rule.params.format) {
        case 'email':
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        case 'url':
          return /^https?:\/\/.+/.test(value);
        case 'phone':
          return /^[+\d\s()-]+$/.test(value);
        case 'date':
          return !isNaN(Date.parse(value));
        default:
          return true;
      }

    case 'regex':
      if (!value) return true;
      return new RegExp(rule.params.pattern).test(value);

    case 'enum':
      if (!value) return true;
      return rule.params.values.includes(value);

    default:
      return true;
  }
}

/**
 * Validate records for export
 */
export async function validateExport(
  records: EntityRecord[],
  target: ExportTarget,
  customRules?: Record<EntityType, ValidationRule[]>
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const recordsWithIssues = new Set<string>();
  const recordsWithErrors = new Set<string>();
  const errorsByField: Record<string, number> = {};
  const warningsByField: Record<string, number> = {};
  const errorsByRule: Record<string, number> = {};

  const rules = { ...RULE_SETS[target], ...customRules };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const entityRules = rules[record.entityType] || [];
    const data = { ...record, ...record.data, ...record.normalizedData };

    for (const rule of entityRules) {
      const value = data[rule.field];
      const isValid = validateValue(value, rule);

      if (!isValid) {
        const issue: ValidationIssue = {
          recordId: record.id,
          recordIndex: i,
          field: rule.field,
          value,
          rule: rule.type,
          message: rule.message || `Validation failed: ${rule.type} on ${rule.field}`,
          severity: rule.severity,
        };

        issues.push(issue);
        recordsWithIssues.add(record.id);

        if (rule.severity === 'error') {
          recordsWithErrors.add(record.id);
          errorsByField[rule.field] = (errorsByField[rule.field] || 0) + 1;
          errorsByRule[rule.type] = (errorsByRule[rule.type] || 0) + 1;
        } else {
          warningsByField[rule.field] = (warningsByField[rule.field] || 0) + 1;
        }
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    recordsValidated: records.length,
    recordsWithErrors: recordsWithErrors.size,
    recordsWithWarnings: recordsWithIssues.size - recordsWithErrors.size,
    summary: {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      errorsByField,
      warningsByField,
      errorsByRule,
    },
  };
}

/**
 * Get validation rules for a target system
 */
export function getValidationRules(
  target: ExportTarget,
  entityType?: EntityType
): Record<EntityType, ValidationRule[]> | ValidationRule[] {
  const rules = RULE_SETS[target] || {};
  if (entityType) {
    return rules[entityType] || [];
  }
  return rules;
}

/**
 * Create a custom validation rule
 */
export function createValidationRule(
  field: string,
  type: ValidationRule['type'],
  severity: 'error' | 'warning',
  params?: any,
  message?: string
): ValidationRule {
  return {
    field,
    type,
    severity,
    params,
    message: message || `${type} validation on ${field}`,
  };
}

/**
 * Get supported export targets
 */
export function getSupportedTargets(): ExportTarget[] {
  return Object.keys(RULE_SETS) as ExportTarget[];
}

/**
 * Format validation result for display
 */
export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [
    '=== Export Validation Report ===',
    '',
    `Records validated: ${result.recordsValidated}`,
    `Records with errors: ${result.recordsWithErrors}`,
    `Records with warnings: ${result.recordsWithWarnings}`,
    '',
    `Total errors: ${result.summary.totalErrors}`,
    `Total warnings: ${result.summary.totalWarnings}`,
    '',
  ];

  if (Object.keys(result.summary.errorsByField).length > 0) {
    lines.push('Errors by field:');
    for (const [field, count] of Object.entries(result.summary.errorsByField)) {
      lines.push(`  ${field}: ${count}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('Sample errors (first 10):');
    for (const error of result.errors.slice(0, 10)) {
      lines.push(`  [${error.recordIndex}] ${error.field}: ${error.message}`);
    }
    lines.push('');
  }

  lines.push(`Validation ${result.valid ? 'PASSED' : 'FAILED'}`);

  return lines.join('\n');
}

export default {
  validateExport,
  getValidationRules,
  createValidationRule,
  getSupportedTargets,
  formatValidationReport,
};
