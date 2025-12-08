/**
 * Role-Based Data Visibility Rules
 * Controls what data different roles can access
 * T296 - Role-based data visibility rules
 */

import { prisma } from '../../lib/prisma.js';

export type VisibilityLevel = 'full' | 'partial' | 'aggregated' | 'none';
export type DataCategory =
  | 'personal'
  | 'communication'
  | 'process'
  | 'financial'
  | 'performance'
  | 'organizational'
  | 'system';

export interface VisibilityRule {
  id: string;
  organizationId: string;
  role: string;
  dataCategory: DataCategory;
  visibilityLevel: VisibilityLevel;
  conditions?: VisibilityCondition[];
  allowedFields?: string[];
  deniedFields?: string[];
  aggregationLevel?: 'individual' | 'team' | 'department' | 'organization';
  requiresJustification: boolean;
  auditRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisibilityCondition {
  type: 'time_based' | 'hierarchy' | 'consent' | 'purpose';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  field: string;
  value: unknown;
}

export interface VisibilityRuleInput {
  role: string;
  dataCategory: DataCategory;
  visibilityLevel: VisibilityLevel;
  conditions?: VisibilityCondition[];
  allowedFields?: string[];
  deniedFields?: string[];
  aggregationLevel?: 'individual' | 'team' | 'department' | 'organization';
  requiresJustification?: boolean;
  auditRequired?: boolean;
}

export interface AccessRequest {
  userId: string;
  role: string;
  dataCategory: DataCategory;
  targetEntityId?: string;
  targetEntityType?: string;
  purpose?: string;
  justification?: string;
}

export interface AccessDecision {
  allowed: boolean;
  visibilityLevel: VisibilityLevel;
  allowedFields: string[];
  deniedFields: string[];
  aggregationRequired: boolean;
  aggregationLevel?: string;
  requiresAudit: boolean;
  reason?: string;
}

// Default visibility rules per role
const DEFAULT_VISIBILITY: Record<string, Record<DataCategory, VisibilityLevel>> = {
  admin: {
    personal: 'full',
    communication: 'full',
    process: 'full',
    financial: 'full',
    performance: 'full',
    organizational: 'full',
    system: 'full',
  },
  manager: {
    personal: 'partial',
    communication: 'aggregated',
    process: 'full',
    financial: 'partial',
    performance: 'partial',
    organizational: 'full',
    system: 'none',
  },
  analyst: {
    personal: 'aggregated',
    communication: 'aggregated',
    process: 'full',
    financial: 'aggregated',
    performance: 'aggregated',
    organizational: 'partial',
    system: 'none',
  },
  employee: {
    personal: 'none',
    communication: 'none',
    process: 'partial',
    financial: 'none',
    performance: 'none',
    organizational: 'partial',
    system: 'none',
  },
  auditor: {
    personal: 'full',
    communication: 'full',
    process: 'full',
    financial: 'full',
    performance: 'full',
    organizational: 'full',
    system: 'full',
  },
  works_council: {
    personal: 'none',
    communication: 'aggregated',
    process: 'aggregated',
    financial: 'none',
    performance: 'aggregated',
    organizational: 'aggregated',
    system: 'none',
  },
};

/**
 * Create a visibility rule
 */
export async function createVisibilityRule(
  organizationId: string,
  input: VisibilityRuleInput
): Promise<VisibilityRule> {
  const rule = await prisma.visibilityRule.create({
    data: {
      organizationId,
      role: input.role,
      dataCategory: input.dataCategory,
      visibilityLevel: input.visibilityLevel,
      conditions: input.conditions || [],
      allowedFields: input.allowedFields || [],
      deniedFields: input.deniedFields || [],
      aggregationLevel: input.aggregationLevel,
      requiresJustification: input.requiresJustification ?? false,
      auditRequired: input.auditRequired ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return transformRule(rule);
}

/**
 * Get visibility rules for an organization
 */
export async function getVisibilityRules(
  organizationId: string,
  options?: { role?: string; dataCategory?: DataCategory }
): Promise<VisibilityRule[]> {
  const where: Record<string, unknown> = { organizationId };

  if (options?.role) {
    where.role = options.role;
  }

  if (options?.dataCategory) {
    where.dataCategory = options.dataCategory;
  }

  const rules = await prisma.visibilityRule.findMany({
    where,
    orderBy: [{ role: 'asc' }, { dataCategory: 'asc' }],
  });

  return rules.map(transformRule);
}

/**
 * Update a visibility rule
 */
export async function updateVisibilityRule(
  organizationId: string,
  ruleId: string,
  updates: Partial<VisibilityRuleInput>
): Promise<VisibilityRule> {
  const rule = await prisma.visibilityRule.update({
    where: { id: ruleId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });

  return transformRule(rule);
}

/**
 * Delete a visibility rule
 */
export async function deleteVisibilityRule(
  organizationId: string,
  ruleId: string
): Promise<void> {
  await prisma.visibilityRule.delete({
    where: { id: ruleId },
  });
}

/**
 * Check data access for a user
 */
export async function checkDataAccess(
  organizationId: string,
  request: AccessRequest
): Promise<AccessDecision> {
  // Get applicable rules
  const rules = await getVisibilityRules(organizationId, {
    role: request.role,
    dataCategory: request.dataCategory,
  });

  // If no custom rules, use defaults
  if (rules.length === 0) {
    const defaultLevel =
      DEFAULT_VISIBILITY[request.role]?.[request.dataCategory] || 'none';

    return {
      allowed: defaultLevel !== 'none',
      visibilityLevel: defaultLevel,
      allowedFields: [],
      deniedFields: [],
      aggregationRequired: defaultLevel === 'aggregated',
      aggregationLevel: defaultLevel === 'aggregated' ? 'department' : undefined,
      requiresAudit: true,
    };
  }

  // Evaluate rules
  const applicableRule = await findApplicableRule(rules, request);

  if (!applicableRule) {
    return {
      allowed: false,
      visibilityLevel: 'none',
      allowedFields: [],
      deniedFields: [],
      aggregationRequired: false,
      requiresAudit: true,
      reason: 'No applicable visibility rule found',
    };
  }

  // Check if justification is required but not provided
  if (applicableRule.requiresJustification && !request.justification) {
    return {
      allowed: false,
      visibilityLevel: 'none',
      allowedFields: [],
      deniedFields: [],
      aggregationRequired: false,
      requiresAudit: true,
      reason: 'Justification required for this access',
    };
  }

  return {
    allowed: applicableRule.visibilityLevel !== 'none',
    visibilityLevel: applicableRule.visibilityLevel,
    allowedFields: applicableRule.allowedFields || [],
    deniedFields: applicableRule.deniedFields || [],
    aggregationRequired: applicableRule.visibilityLevel === 'aggregated',
    aggregationLevel: applicableRule.aggregationLevel,
    requiresAudit: applicableRule.auditRequired,
  };
}

/**
 * Filter data based on visibility rules
 */
export async function filterDataForVisibility<T extends Record<string, unknown>>(
  organizationId: string,
  data: T | T[],
  request: AccessRequest
): Promise<T | T[] | null> {
  const decision = await checkDataAccess(organizationId, request);

  if (!decision.allowed) {
    return null;
  }

  const filterRecord = (record: T): T => {
    if (decision.visibilityLevel === 'full') {
      // Remove only explicitly denied fields
      if (decision.deniedFields.length === 0) {
        return record;
      }

      const filtered = { ...record };
      for (const field of decision.deniedFields) {
        deleteNestedField(filtered, field);
      }
      return filtered;
    }

    if (decision.visibilityLevel === 'partial') {
      // Only include allowed fields
      if (decision.allowedFields.length === 0) {
        return record; // No restrictions if no fields specified
      }

      const filtered: Record<string, unknown> = {};
      for (const field of decision.allowedFields) {
        const value = getNestedField(record, field);
        if (value !== undefined) {
          setNestedField(filtered, field, value);
        }
      }
      return filtered as T;
    }

    if (decision.visibilityLevel === 'aggregated') {
      // Return only aggregatable fields
      return aggregateRecord(record, decision.aggregationLevel || 'department') as T;
    }

    return {} as T;
  };

  if (Array.isArray(data)) {
    return data.map(filterRecord);
  }

  return filterRecord(data);
}

/**
 * Get visibility summary for a role
 */
export async function getRoleVisibilitySummary(
  organizationId: string,
  role: string
): Promise<Record<DataCategory, { level: VisibilityLevel; restrictions: string[] }>> {
  const rules = await getVisibilityRules(organizationId, { role });
  const summary: Record<DataCategory, { level: VisibilityLevel; restrictions: string[] }> = {} as any;

  const categories: DataCategory[] = [
    'personal',
    'communication',
    'process',
    'financial',
    'performance',
    'organizational',
    'system',
  ];

  for (const category of categories) {
    const rule = rules.find((r) => r.dataCategory === category);

    if (rule) {
      const restrictions: string[] = [];
      if (rule.deniedFields && rule.deniedFields.length > 0) {
        restrictions.push(`Denied fields: ${rule.deniedFields.join(', ')}`);
      }
      if (rule.requiresJustification) {
        restrictions.push('Requires justification');
      }
      if (rule.aggregationLevel) {
        restrictions.push(`Aggregation: ${rule.aggregationLevel}`);
      }

      summary[category] = {
        level: rule.visibilityLevel,
        restrictions,
      };
    } else {
      const defaultLevel = DEFAULT_VISIBILITY[role]?.[category] || 'none';
      summary[category] = {
        level: defaultLevel,
        restrictions: ['Using default visibility'],
      };
    }
  }

  return summary;
}

/**
 * Create default visibility rules for an organization
 */
export async function createDefaultRules(organizationId: string): Promise<VisibilityRule[]> {
  const rules: VisibilityRule[] = [];

  for (const [role, categories] of Object.entries(DEFAULT_VISIBILITY)) {
    for (const [category, level] of Object.entries(categories)) {
      const rule = await createVisibilityRule(organizationId, {
        role,
        dataCategory: category as DataCategory,
        visibilityLevel: level,
        auditRequired: true,
        requiresJustification: level === 'full' && role !== 'admin',
      });
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Check if a specific field is visible
 */
export async function isFieldVisible(
  organizationId: string,
  role: string,
  dataCategory: DataCategory,
  fieldName: string
): Promise<boolean> {
  const decision = await checkDataAccess(organizationId, {
    userId: '',
    role,
    dataCategory,
  });

  if (!decision.allowed) {
    return false;
  }

  if (decision.visibilityLevel === 'full') {
    return !decision.deniedFields.includes(fieldName);
  }

  if (decision.visibilityLevel === 'partial') {
    return (
      decision.allowedFields.length === 0 ||
      decision.allowedFields.includes(fieldName)
    );
  }

  return false;
}

// Helper functions

function transformRule(rule: Record<string, unknown>): VisibilityRule {
  return {
    id: rule.id as string,
    organizationId: rule.organizationId as string,
    role: rule.role as string,
    dataCategory: rule.dataCategory as DataCategory,
    visibilityLevel: rule.visibilityLevel as VisibilityLevel,
    conditions: rule.conditions as VisibilityCondition[] | undefined,
    allowedFields: rule.allowedFields as string[] | undefined,
    deniedFields: rule.deniedFields as string[] | undefined,
    aggregationLevel: rule.aggregationLevel as 'individual' | 'team' | 'department' | 'organization' | undefined,
    requiresJustification: rule.requiresJustification as boolean,
    auditRequired: rule.auditRequired as boolean,
    createdAt: rule.createdAt as Date,
    updatedAt: rule.updatedAt as Date,
  };
}

async function findApplicableRule(
  rules: VisibilityRule[],
  request: AccessRequest
): Promise<VisibilityRule | null> {
  for (const rule of rules) {
    if (!rule.conditions || rule.conditions.length === 0) {
      return rule;
    }

    // Evaluate conditions
    const conditionsMet = await evaluateConditions(rule.conditions, request);
    if (conditionsMet) {
      return rule;
    }
  }

  return rules[0] || null;
}

async function evaluateConditions(
  conditions: VisibilityCondition[],
  request: AccessRequest
): Promise<boolean> {
  for (const condition of conditions) {
    const met = evaluateCondition(condition, request);
    if (!met) {
      return false;
    }
  }
  return true;
}

function evaluateCondition(
  condition: VisibilityCondition,
  request: AccessRequest
): boolean {
  const requestValue = (request as Record<string, unknown>)[condition.field];

  switch (condition.operator) {
    case 'equals':
      return requestValue === condition.value;
    case 'contains':
      return String(requestValue).includes(String(condition.value));
    case 'greater_than':
      return Number(requestValue) > Number(condition.value);
    case 'less_than':
      return Number(requestValue) < Number(condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(requestValue);
    default:
      return false;
  }
}

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setNestedField(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

function deleteNestedField(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) return;
    current = current[part] as Record<string, unknown>;
  }

  delete current[parts[parts.length - 1]];
}

function aggregateRecord(
  record: Record<string, unknown>,
  level: string
): Record<string, unknown> {
  // Return only non-PII fields with aggregated labels
  const aggregated: Record<string, unknown> = {};
  const nonPiiFields = ['count', 'total', 'average', 'category', 'type', 'status'];

  for (const field of nonPiiFields) {
    if (field in record) {
      aggregated[field] = record[field];
    }
  }

  aggregated._aggregationLevel = level;
  aggregated._recordType = record.type || 'unknown';

  return aggregated;
}

export default {
  createVisibilityRule,
  getVisibilityRules,
  updateVisibilityRule,
  deleteVisibilityRule,
  checkDataAccess,
  filterDataForVisibility,
  getRoleVisibilitySummary,
  createDefaultRules,
  isFieldVisible,
};
