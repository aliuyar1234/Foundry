/**
 * Unit Tests for Compliance Service (T268)
 * Tests for compliance rules, violation detection, and SLA tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==========================================
// Compliance Rule Validation Tests
// ==========================================

describe('Compliance Rule Validation', () => {
  interface ComplianceRule {
    id: string;
    name: string;
    type: string;
    severity: string;
    enabled: boolean;
    conditions: Array<{ field: string; operator: string; value: unknown }>;
    gracePeriod?: number;
    effectiveDate?: Date;
    expiryDate?: Date;
  }

  const validateRule = (rule: ComplianceRule): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!rule.name || rule.name.length < 3) {
      errors.push('Rule name must be at least 3 characters');
    }

    if (!['sla', 'security', 'data', 'regulatory', 'operational'].includes(rule.type)) {
      errors.push('Invalid rule type');
    }

    if (!['critical', 'high', 'medium', 'low', 'info'].includes(rule.severity)) {
      errors.push('Invalid severity level');
    }

    if (rule.conditions.length === 0) {
      errors.push('Rule must have at least one condition');
    }

    if (rule.effectiveDate && rule.expiryDate && rule.expiryDate <= rule.effectiveDate) {
      errors.push('Expiry date must be after effective date');
    }

    for (const condition of rule.conditions) {
      if (!condition.field) errors.push('Condition field is required');
      if (!condition.operator) errors.push('Condition operator is required');
    }

    return { valid: errors.length === 0, errors };
  };

  it('should validate a correct rule', () => {
    const rule: ComplianceRule = {
      id: 'rule-1',
      name: 'Response Time SLA',
      type: 'sla',
      severity: 'high',
      enabled: true,
      conditions: [{ field: 'responseTime', operator: 'greaterThan', value: 3600 }],
    };

    const result = validateRule(rule);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject rule with short name', () => {
    const rule: ComplianceRule = {
      id: 'rule-1',
      name: 'AB',
      type: 'sla',
      severity: 'high',
      enabled: true,
      conditions: [{ field: 'responseTime', operator: 'greaterThan', value: 3600 }],
    };

    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rule name must be at least 3 characters');
  });

  it('should reject rule with invalid type', () => {
    const rule: ComplianceRule = {
      id: 'rule-1',
      name: 'Test Rule',
      type: 'invalid',
      severity: 'high',
      enabled: true,
      conditions: [{ field: 'test', operator: 'equals', value: true }],
    };

    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid rule type');
  });

  it('should reject rule with no conditions', () => {
    const rule: ComplianceRule = {
      id: 'rule-1',
      name: 'Test Rule',
      type: 'sla',
      severity: 'high',
      enabled: true,
      conditions: [],
    };

    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rule must have at least one condition');
  });

  it('should reject rule with invalid date range', () => {
    const rule: ComplianceRule = {
      id: 'rule-1',
      name: 'Test Rule',
      type: 'sla',
      severity: 'high',
      enabled: true,
      conditions: [{ field: 'test', operator: 'equals', value: true }],
      effectiveDate: new Date('2024-12-01'),
      expiryDate: new Date('2024-01-01'),
    };

    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Expiry date must be after effective date');
  });
});

// ==========================================
// Violation Detection Tests
// ==========================================

describe('Violation Detection', () => {
  interface DataPoint {
    field: string;
    value: unknown;
  }

  const checkViolation = (
    data: DataPoint[],
    condition: { field: string; operator: string; value: unknown }
  ): { violated: boolean; actualValue: unknown } => {
    const dataPoint = data.find(d => d.field === condition.field);
    if (!dataPoint) return { violated: false, actualValue: undefined };

    const actualValue = dataPoint.value;
    let violated = false;

    switch (condition.operator) {
      case 'equals':
        violated = actualValue === condition.value;
        break;
      case 'notEquals':
        violated = actualValue !== condition.value;
        break;
      case 'greaterThan':
        violated = Number(actualValue) > Number(condition.value);
        break;
      case 'lessThan':
        violated = Number(actualValue) < Number(condition.value);
        break;
      case 'greaterThanOrEqual':
        violated = Number(actualValue) >= Number(condition.value);
        break;
      case 'lessThanOrEqual':
        violated = Number(actualValue) <= Number(condition.value);
        break;
      case 'contains':
        violated = String(actualValue).includes(String(condition.value));
        break;
      case 'notContains':
        violated = !String(actualValue).includes(String(condition.value));
        break;
    }

    return { violated, actualValue };
  };

  it('should detect threshold breach violation', () => {
    const data = [{ field: 'responseTime', value: 5000 }];
    const condition = { field: 'responseTime', operator: 'greaterThan', value: 3600 };

    const result = checkViolation(data, condition);
    expect(result.violated).toBe(true);
    expect(result.actualValue).toBe(5000);
  });

  it('should not flag when threshold not breached', () => {
    const data = [{ field: 'responseTime', value: 1000 }];
    const condition = { field: 'responseTime', operator: 'greaterThan', value: 3600 };

    const result = checkViolation(data, condition);
    expect(result.violated).toBe(false);
  });

  it('should detect equality violation', () => {
    const data = [{ field: 'status', value: 'failed' }];
    const condition = { field: 'status', operator: 'equals', value: 'failed' };

    const result = checkViolation(data, condition);
    expect(result.violated).toBe(true);
  });

  it('should handle missing field', () => {
    const data = [{ field: 'responseTime', value: 5000 }];
    const condition = { field: 'missingField', operator: 'equals', value: true };

    const result = checkViolation(data, condition);
    expect(result.violated).toBe(false);
    expect(result.actualValue).toBeUndefined();
  });
});

// ==========================================
// SLA Tracking Tests
// ==========================================

describe('SLA Tracking', () => {
  interface SlaConfig {
    priority: string;
    responseTimeMinutes: number;
    resolutionTimeMinutes: number;
  }

  const checkSla = (
    task: { priority: string; createdAt: Date; firstResponseAt?: Date; resolvedAt?: Date },
    config: SlaConfig[],
    currentTime: Date = new Date()
  ): {
    responseBreached: boolean;
    resolutionBreached: boolean;
    responseRemaining: number;
    resolutionRemaining: number;
  } => {
    const sla = config.find(c => c.priority === task.priority);
    if (!sla) {
      return {
        responseBreached: false,
        resolutionBreached: false,
        responseRemaining: Infinity,
        resolutionRemaining: Infinity,
      };
    }

    const elapsedMinutes = (currentTime.getTime() - task.createdAt.getTime()) / (1000 * 60);

    const responseTime = task.firstResponseAt
      ? (task.firstResponseAt.getTime() - task.createdAt.getTime()) / (1000 * 60)
      : elapsedMinutes;

    const resolutionTime = task.resolvedAt
      ? (task.resolvedAt.getTime() - task.createdAt.getTime()) / (1000 * 60)
      : elapsedMinutes;

    return {
      responseBreached: responseTime > sla.responseTimeMinutes,
      resolutionBreached: resolutionTime > sla.resolutionTimeMinutes,
      responseRemaining: Math.max(0, sla.responseTimeMinutes - responseTime),
      resolutionRemaining: Math.max(0, sla.resolutionTimeMinutes - resolutionTime),
    };
  };

  it('should detect response time breach', () => {
    const config: SlaConfig[] = [
      { priority: 'high', responseTimeMinutes: 30, resolutionTimeMinutes: 240 },
    ];

    const task = {
      priority: 'high',
      createdAt: new Date('2024-01-01T10:00:00'),
      firstResponseAt: new Date('2024-01-01T10:45:00'), // 45 minutes later
    };

    const result = checkSla(task, config, new Date('2024-01-01T11:00:00'));
    expect(result.responseBreached).toBe(true);
  });

  it('should detect resolution time breach', () => {
    const config: SlaConfig[] = [
      { priority: 'high', responseTimeMinutes: 30, resolutionTimeMinutes: 240 },
    ];

    const task = {
      priority: 'high',
      createdAt: new Date('2024-01-01T10:00:00'),
      firstResponseAt: new Date('2024-01-01T10:15:00'),
      resolvedAt: new Date('2024-01-01T15:00:00'), // 5 hours later
    };

    const result = checkSla(task, config, new Date('2024-01-01T15:00:00'));
    expect(result.resolutionBreached).toBe(true);
  });

  it('should calculate remaining time', () => {
    const config: SlaConfig[] = [
      { priority: 'high', responseTimeMinutes: 60, resolutionTimeMinutes: 240 },
    ];

    const task = {
      priority: 'high',
      createdAt: new Date('2024-01-01T10:00:00'),
    };

    const result = checkSla(task, config, new Date('2024-01-01T10:30:00'));
    expect(result.responseRemaining).toBe(30);
    expect(result.resolutionRemaining).toBe(210);
  });
});

// ==========================================
// Compliance Score Calculation Tests
// ==========================================

describe('Compliance Score Calculation', () => {
  const calculateComplianceScore = (
    violations: Array<{ severity: string; resolved: boolean }>,
    totalChecks: number
  ): { score: number; grade: string } => {
    if (totalChecks === 0) return { score: 100, grade: 'A' };

    const weights: Record<string, number> = {
      critical: 25,
      high: 15,
      medium: 5,
      low: 2,
    };

    const unresolvedViolations = violations.filter(v => !v.resolved);
    const totalPenalty = unresolvedViolations.reduce(
      (sum, v) => sum + (weights[v.severity] || 0),
      0
    );

    const score = Math.max(0, 100 - totalPenalty);

    let grade = 'F';
    if (score >= 95) grade = 'A';
    else if (score >= 85) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 50) grade = 'D';

    return { score, grade };
  };

  it('should return perfect score with no violations', () => {
    const result = calculateComplianceScore([], 100);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('should reduce score based on violation severity', () => {
    const violations = [
      { severity: 'critical', resolved: false },
    ];
    const result = calculateComplianceScore(violations, 100);
    expect(result.score).toBe(75);
    expect(result.grade).toBe('C');
  });

  it('should not penalize resolved violations', () => {
    const violations = [
      { severity: 'critical', resolved: true },
      { severity: 'high', resolved: true },
    ];
    const result = calculateComplianceScore(violations, 100);
    expect(result.score).toBe(100);
  });

  it('should accumulate penalties for multiple violations', () => {
    const violations = [
      { severity: 'critical', resolved: false },
      { severity: 'high', resolved: false },
      { severity: 'medium', resolved: false },
    ];
    const result = calculateComplianceScore(violations, 100);
    expect(result.score).toBe(55);
    expect(result.grade).toBe('D');
  });
});

// ==========================================
// Grace Period Tests
// ==========================================

describe('Grace Period Handling', () => {
  const isWithinGracePeriod = (
    violationTime: Date,
    gracePeriodMinutes: number,
    currentTime: Date = new Date()
  ): boolean => {
    const elapsedMinutes = (currentTime.getTime() - violationTime.getTime()) / (1000 * 60);
    return elapsedMinutes <= gracePeriodMinutes;
  };

  it('should return true when within grace period', () => {
    const violationTime = new Date('2024-01-01T10:00:00');
    const currentTime = new Date('2024-01-01T10:30:00');
    expect(isWithinGracePeriod(violationTime, 60, currentTime)).toBe(true);
  });

  it('should return false when grace period expired', () => {
    const violationTime = new Date('2024-01-01T10:00:00');
    const currentTime = new Date('2024-01-01T12:00:00');
    expect(isWithinGracePeriod(violationTime, 60, currentTime)).toBe(false);
  });

  it('should return true at exact boundary', () => {
    const violationTime = new Date('2024-01-01T10:00:00');
    const currentTime = new Date('2024-01-01T11:00:00');
    expect(isWithinGracePeriod(violationTime, 60, currentTime)).toBe(true);
  });
});

// ==========================================
// Policy Applicability Tests
// ==========================================

describe('Policy Applicability', () => {
  interface Policy {
    id: string;
    enabled: boolean;
    effectiveDate: Date;
    expiryDate?: Date;
    scope: {
      regions?: string[];
      departments?: string[];
      roles?: string[];
    };
  }

  const isPolicyApplicable = (
    policy: Policy,
    context: { region?: string; department?: string; role?: string },
    currentDate: Date = new Date()
  ): boolean => {
    if (!policy.enabled) return false;
    if (currentDate < policy.effectiveDate) return false;
    if (policy.expiryDate && currentDate > policy.expiryDate) return false;

    // Check scope
    if (policy.scope.regions && context.region) {
      if (!policy.scope.regions.includes(context.region)) return false;
    }
    if (policy.scope.departments && context.department) {
      if (!policy.scope.departments.includes(context.department)) return false;
    }
    if (policy.scope.roles && context.role) {
      if (!policy.scope.roles.includes(context.role)) return false;
    }

    return true;
  };

  it('should return false for disabled policy', () => {
    const policy: Policy = {
      id: 'policy-1',
      enabled: false,
      effectiveDate: new Date('2024-01-01'),
      scope: {},
    };

    expect(isPolicyApplicable(policy, {})).toBe(false);
  });

  it('should return false before effective date', () => {
    const policy: Policy = {
      id: 'policy-1',
      enabled: true,
      effectiveDate: new Date('2025-01-01'),
      scope: {},
    };

    expect(isPolicyApplicable(policy, {}, new Date('2024-06-01'))).toBe(false);
  });

  it('should return false after expiry date', () => {
    const policy: Policy = {
      id: 'policy-1',
      enabled: true,
      effectiveDate: new Date('2024-01-01'),
      expiryDate: new Date('2024-06-01'),
      scope: {},
    };

    expect(isPolicyApplicable(policy, {}, new Date('2024-12-01'))).toBe(false);
  });

  it('should check region scope', () => {
    const policy: Policy = {
      id: 'policy-1',
      enabled: true,
      effectiveDate: new Date('2024-01-01'),
      scope: { regions: ['US', 'EU'] },
    };

    expect(isPolicyApplicable(policy, { region: 'US' }, new Date('2024-06-01'))).toBe(true);
    expect(isPolicyApplicable(policy, { region: 'APAC' }, new Date('2024-06-01'))).toBe(false);
  });
});

// ==========================================
// Violation Aggregation Tests
// ==========================================

describe('Violation Aggregation', () => {
  interface Violation {
    id: string;
    type: string;
    severity: string;
    timestamp: Date;
    resolved: boolean;
  }

  const aggregateViolations = (
    violations: Violation[]
  ): {
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    trend: { period: string; count: number }[];
  } => {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byDate: Record<string, number> = {};

    for (const v of violations) {
      byType[v.type] = (byType[v.type] || 0) + 1;
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;

      const dateKey = v.timestamp.toISOString().split('T')[0];
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;
    }

    const trend = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }));

    return { byType, bySeverity, trend };
  };

  it('should aggregate violations by type', () => {
    const violations: Violation[] = [
      { id: '1', type: 'sla', severity: 'high', timestamp: new Date(), resolved: false },
      { id: '2', type: 'sla', severity: 'medium', timestamp: new Date(), resolved: false },
      { id: '3', type: 'security', severity: 'critical', timestamp: new Date(), resolved: false },
    ];

    const result = aggregateViolations(violations);
    expect(result.byType.sla).toBe(2);
    expect(result.byType.security).toBe(1);
  });

  it('should aggregate violations by severity', () => {
    const violations: Violation[] = [
      { id: '1', type: 'sla', severity: 'high', timestamp: new Date(), resolved: false },
      { id: '2', type: 'sla', severity: 'high', timestamp: new Date(), resolved: false },
      { id: '3', type: 'security', severity: 'critical', timestamp: new Date(), resolved: false },
    ];

    const result = aggregateViolations(violations);
    expect(result.bySeverity.high).toBe(2);
    expect(result.bySeverity.critical).toBe(1);
  });

  it('should calculate daily trend', () => {
    const violations: Violation[] = [
      { id: '1', type: 'sla', severity: 'high', timestamp: new Date('2024-01-01'), resolved: false },
      { id: '2', type: 'sla', severity: 'high', timestamp: new Date('2024-01-01'), resolved: false },
      { id: '3', type: 'security', severity: 'critical', timestamp: new Date('2024-01-02'), resolved: false },
    ];

    const result = aggregateViolations(violations);
    expect(result.trend).toHaveLength(2);
    expect(result.trend[0].count).toBe(2);
    expect(result.trend[1].count).toBe(1);
  });
});
