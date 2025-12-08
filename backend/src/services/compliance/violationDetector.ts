/**
 * Violation Detector Service
 * T171 - Create violation detector service
 *
 * Detects and manages compliance violations
 */

import { prisma } from '../../lib/prisma.js';
import type {
  ComplianceViolation,
  ViolationStatus,
  ViolationResolution,
  Severity,
  ComplianceFramework,
  ComplianceCategory,
} from 'shared/types/compliance.js';
import { evaluateRule, evaluateAllRules, type RuleEvaluationResult } from './ruleEngine.js';

// =============================================================================
// Types
// =============================================================================

export interface ViolationDetectionResult {
  totalRulesChecked: number;
  violationsDetected: number;
  newViolations: number;
  existingViolations: number;
  violations: ComplianceViolation[];
  executionTimeMs: number;
}

export interface ViolationQuery {
  organizationId: string;
  status?: ViolationStatus | ViolationStatus[];
  severity?: Severity | Severity[];
  framework?: ComplianceFramework;
  category?: ComplianceCategory;
  ruleId?: string;
  assignedTo?: string;
  overdue?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ViolationStatistics {
  total: number;
  byStatus: Record<ViolationStatus, number>;
  bySeverity: Record<Severity, number>;
  byFramework: Record<ComplianceFramework, number>;
  avgResolutionTimeHours: number;
  overdueCount: number;
}

// =============================================================================
// Violation Detection
// =============================================================================

/**
 * Detect violations by evaluating all rules
 */
export async function detectViolations(
  organizationId: string,
  options: {
    framework?: ComplianceFramework;
    category?: ComplianceCategory;
    ruleIds?: string[];
  } = {}
): Promise<ViolationDetectionResult> {
  const startTime = Date.now();
  const violations: ComplianceViolation[] = [];
  let newViolations = 0;
  let existingViolations = 0;

  // Evaluate rules
  const evaluationResult = await evaluateAllRules(organizationId, {
    framework: options.framework,
    category: options.category,
  });

  // Process failed rules
  for (const result of evaluationResult.results) {
    if (!result.passed) {
      const violation = await processViolation(result, organizationId);
      violations.push(violation);

      if (violation.createdAt.getTime() > startTime - 1000) {
        newViolations++;
      } else {
        existingViolations++;
      }
    }
  }

  return {
    totalRulesChecked: evaluationResult.totalRules,
    violationsDetected: violations.length,
    newViolations,
    existingViolations,
    violations,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Process a rule evaluation result into a violation
 */
async function processViolation(
  result: RuleEvaluationResult,
  organizationId: string
): Promise<ComplianceViolation> {
  // Check for existing open violation
  const existingViolation = await prisma.complianceViolation.findFirst({
    where: {
      ruleId: result.ruleId,
      organizationId,
      status: { in: ['open', 'acknowledged', 'in_progress'] },
    },
  });

  if (existingViolation) {
    // Update existing violation
    const updated = await prisma.complianceViolation.update({
      where: { id: existingViolation.id },
      data: {
        updatedAt: new Date(),
        description: result.details.message,
      },
    });
    return updated as unknown as ComplianceViolation;
  }

  // Create new violation
  const findings = result.details.findings.filter((f) => f.type === 'fail');
  const affectedEntity = findings.length > 0 ? findings[0].entity : 'Unknown';
  const affectedEntityId = findings.length > 0 ? findings[0].entityId : undefined;

  const created = await prisma.complianceViolation.create({
    data: {
      ruleId: result.ruleId,
      severity: result.severity,
      description: result.details.message,
      affectedEntity,
      affectedEntityId,
      evidenceIds: result.details.evidenceIds,
      status: 'open',
      organizationId,
      detectedAt: new Date(),
      dueDate: calculateDueDate(result.severity),
    },
  });

  return created as unknown as ComplianceViolation;
}

/**
 * Get violations by query
 */
export async function getViolations(
  query: ViolationQuery
): Promise<{ violations: ComplianceViolation[]; total: number }> {
  const where: Record<string, unknown> = {
    organizationId: query.organizationId,
  };

  if (query.status) {
    where.status = Array.isArray(query.status)
      ? { in: query.status }
      : query.status;
  }

  if (query.severity) {
    where.severity = Array.isArray(query.severity)
      ? { in: query.severity }
      : query.severity;
  }

  if (query.ruleId) {
    where.ruleId = query.ruleId;
  }

  if (query.assignedTo) {
    where.assignedTo = query.assignedTo;
  }

  if (query.overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: ['remediated', 'accepted_risk', 'false_positive'] };
  }

  if (query.startDate || query.endDate) {
    where.detectedAt = {};
    if (query.startDate) {
      (where.detectedAt as Record<string, unknown>).gte = query.startDate;
    }
    if (query.endDate) {
      (where.detectedAt as Record<string, unknown>).lte = query.endDate;
    }
  }

  // Join with rule for framework/category filtering
  if (query.framework || query.category) {
    const ruleWhere: Record<string, unknown> = {};
    if (query.framework) ruleWhere.framework = query.framework;
    if (query.category) ruleWhere.category = query.category;

    const rules = await prisma.complianceRule.findMany({
      where: { ...ruleWhere, organizationId: query.organizationId },
      select: { id: true },
    });

    where.ruleId = { in: rules.map((r) => r.id) };
  }

  const [violations, total] = await Promise.all([
    prisma.complianceViolation.findMany({
      where,
      include: {
        rule: {
          select: {
            name: true,
            framework: true,
            category: true,
          },
        },
      },
      take: query.limit || 50,
      skip: query.offset || 0,
      orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
    }),
    prisma.complianceViolation.count({ where }),
  ]);

  return {
    violations: violations.map((v) => ({
      ...v,
      ruleName: v.rule?.name,
      framework: v.rule?.framework as ComplianceFramework,
    })) as unknown as ComplianceViolation[],
    total,
  };
}

/**
 * Get violation by ID
 */
export async function getViolationById(
  violationId: string,
  organizationId: string
): Promise<ComplianceViolation | null> {
  const violation = await prisma.complianceViolation.findFirst({
    where: { id: violationId, organizationId },
    include: {
      rule: {
        select: {
          name: true,
          framework: true,
          category: true,
        },
      },
    },
  });

  if (!violation) return null;

  return {
    ...violation,
    ruleName: violation.rule?.name,
    framework: violation.rule?.framework as ComplianceFramework,
  } as unknown as ComplianceViolation;
}

/**
 * Get violation statistics
 */
export async function getViolationStatistics(
  organizationId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<ViolationStatistics> {
  const where: Record<string, unknown> = { organizationId };

  if (options.startDate || options.endDate) {
    where.detectedAt = {};
    if (options.startDate) {
      (where.detectedAt as Record<string, unknown>).gte = options.startDate;
    }
    if (options.endDate) {
      (where.detectedAt as Record<string, unknown>).lte = options.endDate;
    }
  }

  const violations = await prisma.complianceViolation.findMany({
    where,
    include: {
      rule: {
        select: { framework: true },
      },
    },
  });

  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byFramework: Record<string, number> = {};
  let totalResolutionTime = 0;
  let resolvedCount = 0;
  let overdueCount = 0;

  const now = new Date();

  for (const v of violations) {
    // By status
    byStatus[v.status] = (byStatus[v.status] || 0) + 1;

    // By severity
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;

    // By framework
    const framework = v.rule?.framework || 'custom';
    byFramework[framework] = (byFramework[framework] || 0) + 1;

    // Resolution time
    if (v.resolvedAt) {
      const resolutionTime =
        new Date(v.resolvedAt).getTime() - new Date(v.detectedAt).getTime();
      totalResolutionTime += resolutionTime;
      resolvedCount++;
    }

    // Overdue
    if (
      v.dueDate &&
      new Date(v.dueDate) < now &&
      !['remediated', 'accepted_risk', 'false_positive'].includes(v.status)
    ) {
      overdueCount++;
    }
  }

  const avgResolutionTimeHours =
    resolvedCount > 0
      ? Math.round(totalResolutionTime / resolvedCount / (1000 * 60 * 60))
      : 0;

  return {
    total: violations.length,
    byStatus: byStatus as Record<ViolationStatus, number>,
    bySeverity: bySeverity as Record<Severity, number>,
    byFramework: byFramework as Record<ComplianceFramework, number>,
    avgResolutionTimeHours,
    overdueCount,
  };
}

// =============================================================================
// Violation Management
// =============================================================================

/**
 * Resolve a violation
 */
export async function resolveViolation(
  violationId: string,
  resolution: ViolationResolution,
  resolvedBy: string
): Promise<ComplianceViolation> {
  const updated = await prisma.complianceViolation.update({
    where: { id: violationId },
    data: {
      status: resolution.status,
      resolutionNotes: resolution.notes,
      resolvedBy,
      resolvedAt: new Date(),
      evidenceIds: resolution.evidenceIds
        ? { push: resolution.evidenceIds }
        : undefined,
    },
  });

  return updated as unknown as ComplianceViolation;
}

/**
 * Assign violation to user
 */
export async function assignViolation(
  violationId: string,
  assignedTo: string
): Promise<ComplianceViolation> {
  const updated = await prisma.complianceViolation.update({
    where: { id: violationId },
    data: {
      assignedTo,
      status: 'acknowledged',
    },
  });

  return updated as unknown as ComplianceViolation;
}

/**
 * Update violation status
 */
export async function updateViolationStatus(
  violationId: string,
  status: ViolationStatus
): Promise<ComplianceViolation> {
  const data: Record<string, unknown> = { status };

  if (['remediated', 'accepted_risk', 'false_positive'].includes(status)) {
    data.resolvedAt = new Date();
  }

  const updated = await prisma.complianceViolation.update({
    where: { id: violationId },
    data,
  });

  return updated as unknown as ComplianceViolation;
}

/**
 * Add evidence to violation
 */
export async function addViolationEvidence(
  violationId: string,
  evidenceIds: string[]
): Promise<ComplianceViolation> {
  const updated = await prisma.complianceViolation.update({
    where: { id: violationId },
    data: {
      evidenceIds: { push: evidenceIds },
    },
  });

  return updated as unknown as ComplianceViolation;
}

/**
 * Update violation due date
 */
export async function updateViolationDueDate(
  violationId: string,
  dueDate: Date
): Promise<ComplianceViolation> {
  const updated = await prisma.complianceViolation.update({
    where: { id: violationId },
    data: { dueDate },
  });

  return updated as unknown as ComplianceViolation;
}

// =============================================================================
// Specialized Detectors (T172-T174)
// =============================================================================

/**
 * Detect approval bypass violations (T172)
 */
export async function detectApprovalBypasses(
  organizationId: string
): Promise<ComplianceViolation[]> {
  const violations: ComplianceViolation[] = [];

  // Find processes that completed without required approvals
  const bypasses = await prisma.processInstance.findMany({
    where: {
      organizationId,
      status: 'completed',
      // Check for missing approvals in process data
    },
    include: {
      process: {
        select: {
          name: true,
          requiresApproval: true,
          approvalRules: true,
        },
      },
    },
  });

  for (const bypass of bypasses) {
    if (bypass.process?.requiresApproval) {
      // Check if approval was actually obtained
      const approval = await prisma.approval.findFirst({
        where: {
          entityType: 'process_instance',
          entityId: bypass.id,
          status: 'approved',
        },
      });

      if (!approval) {
        const violation = await createViolation({
          ruleId: 'approval_bypass',
          severity: 'high',
          description: `Process "${bypass.process.name}" completed without required approval`,
          affectedEntity: bypass.process.name,
          affectedEntityId: bypass.id,
          organizationId,
        });
        violations.push(violation);
      }
    }
  }

  return violations;
}

/**
 * Detect retention violations (T173)
 */
export async function detectRetentionViolations(
  organizationId: string
): Promise<ComplianceViolation[]> {
  const violations: ComplianceViolation[] = [];

  // Get retention policies
  const policies = await prisma.retentionPolicy.findMany({
    where: { organizationId, isActive: true },
  });

  for (const policy of policies) {
    const expirationDate = new Date(
      Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000
    );

    // Count records beyond retention
    const expiredCount = await countExpiredRecords(
      policy.entityType,
      organizationId,
      expirationDate
    );

    if (expiredCount > 0) {
      const violation = await createViolation({
        ruleId: 'data_retention',
        severity: 'high',
        description: `${expiredCount} ${policy.entityType} records exceed retention period of ${policy.retentionDays} days`,
        affectedEntity: policy.entityType,
        organizationId,
      });
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Detect process deviation violations (T174)
 */
export async function detectProcessDeviations(
  organizationId: string
): Promise<ComplianceViolation[]> {
  const violations: ComplianceViolation[] = [];

  // Find processes with deviations from defined steps
  const processes = await prisma.processInstance.findMany({
    where: {
      organizationId,
      status: { in: ['completed', 'failed'] },
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
    include: {
      process: {
        select: {
          name: true,
          requiredSteps: true,
        },
      },
    },
  });

  for (const instance of processes) {
    if (instance.process?.requiredSteps) {
      const requiredSteps = instance.process.requiredSteps as string[];
      const completedSteps = (instance.completedSteps || []) as string[];

      const missingSteps = requiredSteps.filter(
        (step) => !completedSteps.includes(step)
      );

      if (missingSteps.length > 0) {
        const violation = await createViolation({
          ruleId: 'process_deviation',
          severity: 'medium',
          description: `Process "${instance.process.name}" completed with ${missingSteps.length} missing required steps`,
          affectedEntity: instance.process.name,
          affectedEntityId: instance.id,
          organizationId,
        });
        violations.push(violation);
      }
    }
  }

  return violations;
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateDueDate(severity: Severity): Date {
  const dueDays: Record<Severity, number> = {
    critical: 1,
    high: 7,
    medium: 30,
    low: 90,
  };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays[severity]);
  return dueDate;
}

async function createViolation(data: {
  ruleId: string;
  severity: Severity;
  description: string;
  affectedEntity: string;
  affectedEntityId?: string;
  organizationId: string;
}): Promise<ComplianceViolation> {
  const created = await prisma.complianceViolation.create({
    data: {
      ...data,
      evidenceIds: [],
      status: 'open',
      detectedAt: new Date(),
      dueDate: calculateDueDate(data.severity),
    },
  });

  return created as unknown as ComplianceViolation;
}

async function countExpiredRecords(
  _entityType: string,
  _organizationId: string,
  _expirationDate: Date
): Promise<number> {
  // Implementation would count records beyond retention
  return 0;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  detectViolations,
  getViolations,
  getViolationById,
  getViolationStatistics,
  resolveViolation,
  assignViolation,
  updateViolationStatus,
  addViolationEvidence,
  updateViolationDueDate,
  detectApprovalBypasses,
  detectRetentionViolations,
  detectProcessDeviations,
};
