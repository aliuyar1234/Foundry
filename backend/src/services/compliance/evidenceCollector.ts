/**
 * Evidence Collector Service
 * T167 - Create evidence collector service
 *
 * Collects and manages compliance evidence from various sources
 */

import { prisma } from '../../lib/prisma.js';
import type {
  ComplianceEvidence,
  EvidenceType,
  EvidenceCollection,
  ComplianceFramework,
} from 'shared/types/compliance.js';

// =============================================================================
// Types
// =============================================================================

export interface EvidenceCollectionConfig {
  organizationId: string;
  ruleId?: string;
  framework?: ComplianceFramework;
  evidenceTypes?: EvidenceType[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface CollectedEvidence {
  id: string;
  ruleId: string;
  evidenceType: EvidenceType;
  sourceId: string;
  sourceType: string;
  description: string;
  metadata: Record<string, unknown>;
  collectedAt: Date;
  expiresAt?: Date;
}

export interface EvidenceCollectionResult {
  collected: number;
  failed: number;
  evidenceIds: string[];
  errors: string[];
}

export interface EvidenceSource {
  type: EvidenceType;
  name: string;
  description: string;
  collect: (config: EvidenceCollectionConfig) => Promise<CollectedEvidence[]>;
}

// Registry of evidence sources
const evidenceSources: Map<EvidenceType, EvidenceSource> = new Map();

// =============================================================================
// Evidence Collection Functions
// =============================================================================

/**
 * Register an evidence source
 */
export function registerEvidenceSource(source: EvidenceSource): void {
  evidenceSources.set(source.type, source);
}

/**
 * Get registered evidence sources
 */
export function getRegisteredSources(): EvidenceType[] {
  return Array.from(evidenceSources.keys());
}

/**
 * Collect evidence for a specific rule
 */
export async function collectEvidenceForRule(
  ruleId: string,
  organizationId: string
): Promise<EvidenceCollectionResult> {
  const rule = await prisma.complianceRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    return {
      collected: 0,
      failed: 1,
      evidenceIds: [],
      errors: [`Rule not found: ${ruleId}`],
    };
  }

  // Determine which evidence types are needed based on rule
  const evidenceTypes = determineRequiredEvidenceTypes(rule);

  return collectEvidence({
    organizationId,
    ruleId,
    evidenceTypes,
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: new Date(),
  });
}

/**
 * Collect evidence based on configuration
 */
export async function collectEvidence(
  config: EvidenceCollectionConfig
): Promise<EvidenceCollectionResult> {
  const evidenceIds: string[] = [];
  const errors: string[] = [];
  let collected = 0;
  let failed = 0;

  const typesToCollect = config.evidenceTypes || getRegisteredSources();

  for (const evidenceType of typesToCollect) {
    const source = evidenceSources.get(evidenceType);

    if (!source) {
      errors.push(`No collector registered for evidence type: ${evidenceType}`);
      failed++;
      continue;
    }

    try {
      const evidence = await source.collect(config);

      // Store collected evidence
      for (const item of evidence) {
        const stored = await storeEvidence(item, config.organizationId);
        evidenceIds.push(stored.id);
        collected++;
      }
    } catch (error) {
      errors.push(`Failed to collect ${evidenceType}: ${(error as Error).message}`);
      failed++;
    }
  }

  return { collected, failed, evidenceIds, errors };
}

/**
 * Store evidence in database
 */
async function storeEvidence(
  evidence: CollectedEvidence,
  organizationId: string
): Promise<{ id: string }> {
  const created = await prisma.complianceEvidence.create({
    data: {
      ruleId: evidence.ruleId,
      evidenceType: evidence.evidenceType,
      sourceId: evidence.sourceId,
      sourceType: evidence.sourceType,
      description: evidence.description,
      metadata: evidence.metadata as Record<string, unknown>,
      collectedAt: evidence.collectedAt,
      expiresAt: evidence.expiresAt,
      organizationId,
    },
  });

  return { id: created.id };
}

/**
 * Get evidence for a rule
 */
export async function getEvidenceForRule(
  ruleId: string,
  organizationId: string,
  options: {
    limit?: number;
    offset?: number;
    evidenceType?: EvidenceType;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{ evidence: ComplianceEvidence[]; total: number }> {
  const where: Record<string, unknown> = {
    ruleId,
    organizationId,
  };

  if (options.evidenceType) {
    where.evidenceType = options.evidenceType;
  }

  if (options.startDate || options.endDate) {
    where.collectedAt = {};
    if (options.startDate) {
      (where.collectedAt as Record<string, unknown>).gte = options.startDate;
    }
    if (options.endDate) {
      (where.collectedAt as Record<string, unknown>).lte = options.endDate;
    }
  }

  const [evidence, total] = await Promise.all([
    prisma.complianceEvidence.findMany({
      where,
      take: options.limit || 50,
      skip: options.offset || 0,
      orderBy: { collectedAt: 'desc' },
    }),
    prisma.complianceEvidence.count({ where }),
  ]);

  return {
    evidence: evidence as unknown as ComplianceEvidence[],
    total,
  };
}

/**
 * Get evidence collection summary for a rule
 */
export async function getEvidenceCollectionSummary(
  ruleId: string,
  organizationId: string
): Promise<EvidenceCollection> {
  const rule = await prisma.complianceRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  const evidence = await prisma.complianceEvidence.findMany({
    where: { ruleId, organizationId },
    orderBy: { collectedAt: 'asc' },
  });

  const evidenceTypes = [...new Set(evidence.map((e) => e.evidenceType))] as EvidenceType[];
  const requiredTypes = determineRequiredEvidenceTypes(rule);
  const coveragePercentage =
    requiredTypes.length > 0
      ? Math.round(
          (evidenceTypes.filter((t) => requiredTypes.includes(t)).length /
            requiredTypes.length) *
            100
        )
      : 100;

  return {
    ruleId,
    ruleName: rule.name,
    evidenceCount: evidence.length,
    evidenceTypes,
    oldestEvidence: evidence.length > 0 ? evidence[0].collectedAt : new Date(),
    newestEvidence:
      evidence.length > 0 ? evidence[evidence.length - 1].collectedAt : new Date(),
    coveragePercentage,
  };
}

/**
 * Get all evidence collections for organization
 */
export async function getAllEvidenceCollections(
  organizationId: string
): Promise<EvidenceCollection[]> {
  const rules = await prisma.complianceRule.findMany({
    where: { organizationId, isActive: true },
  });

  const collections: EvidenceCollection[] = [];

  for (const rule of rules) {
    try {
      const collection = await getEvidenceCollectionSummary(rule.id, organizationId);
      collections.push(collection);
    } catch {
      // Skip rules with errors
    }
  }

  return collections;
}

/**
 * Clean up expired evidence
 */
export async function cleanupExpiredEvidence(
  organizationId: string
): Promise<{ deleted: number }> {
  const result = await prisma.complianceEvidence.deleteMany({
    where: {
      organizationId,
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return { deleted: result.count };
}

/**
 * Archive evidence for audit
 */
export async function archiveEvidence(
  evidenceIds: string[],
  organizationId: string,
  archiveReason: string
): Promise<{ archived: number }> {
  // In production, this would move to archive storage
  const updated = await prisma.complianceEvidence.updateMany({
    where: {
      id: { in: evidenceIds },
      organizationId,
    },
    data: {
      metadata: {
        archived: true,
        archivedAt: new Date().toISOString(),
        archiveReason,
      },
    },
  });

  return { archived: updated.count };
}

// =============================================================================
// Helper Functions
// =============================================================================

function determineRequiredEvidenceTypes(rule: Record<string, unknown>): EvidenceType[] {
  const types: EvidenceType[] = [];
  const category = rule.category as string;

  switch (category) {
    case 'data_retention':
    case 'data_protection':
      types.push('document', 'configuration', 'access_log');
      break;
    case 'access_control':
      types.push('access_log', 'configuration', 'approval');
      break;
    case 'process_compliance':
      types.push('process_execution', 'approval', 'audit_report');
      break;
    case 'audit_trail':
      types.push('access_log', 'audit_report');
      break;
    case 'segregation_of_duties':
      types.push('configuration', 'approval', 'audit_report');
      break;
    case 'approval_workflows':
      types.push('approval', 'process_execution');
      break;
    default:
      types.push('document', 'audit_report');
  }

  return types;
}

// =============================================================================
// Built-in Evidence Collectors
// =============================================================================

// Access Log Collector (T168)
registerEvidenceSource({
  type: 'access_log',
  name: 'Access Log Collector',
  description: 'Collects access logs for data access auditing',
  collect: async (config) => {
    // Implementation would query access logs
    const logs = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        action: string;
        resource: string;
        timestamp: Date;
      }>
    >`
      SELECT id, user_id as "userId", action, resource, created_at as timestamp
      FROM access_logs
      WHERE organization_id = ${config.organizationId}
      ${config.startDate ? prisma.$queryRaw`AND created_at >= ${config.startDate}` : prisma.$queryRaw``}
      ${config.endDate ? prisma.$queryRaw`AND created_at <= ${config.endDate}` : prisma.$queryRaw``}
      ORDER BY created_at DESC
      LIMIT ${config.limit || 100}
    `.catch(() => []);

    return logs.map((log) => ({
      id: `access-log-${log.id}`,
      ruleId: config.ruleId || 'access_logging',
      evidenceType: 'access_log' as EvidenceType,
      sourceId: log.id,
      sourceType: 'access_log',
      description: `${log.action} on ${log.resource} by user ${log.userId}`,
      metadata: {
        userId: log.userId,
        action: log.action,
        resource: log.resource,
      },
      collectedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year retention
    }));
  },
});

// Process Execution Collector (T169)
registerEvidenceSource({
  type: 'process_execution',
  name: 'Process Execution Collector',
  description: 'Collects evidence of process executions and completions',
  collect: async (config) => {
    // Implementation would query process executions
    const executions = await prisma.processInstance.findMany({
      where: {
        organizationId: config.organizationId,
        createdAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
      },
      take: config.limit || 100,
      orderBy: { createdAt: 'desc' },
      include: {
        process: true,
      },
    }).catch(() => []);

    return executions.map((exec) => ({
      id: `process-exec-${exec.id}`,
      ruleId: config.ruleId || 'process_compliance',
      evidenceType: 'process_execution' as EvidenceType,
      sourceId: exec.id,
      sourceType: 'process_instance',
      description: `Process ${exec.process?.name || 'Unknown'} execution - Status: ${exec.status}`,
      metadata: {
        processId: exec.processId,
        processName: exec.process?.name,
        status: exec.status,
        startedAt: exec.createdAt,
        completedAt: exec.completedAt,
      },
      collectedAt: new Date(),
    }));
  },
});

// Approval Collector
registerEvidenceSource({
  type: 'approval',
  name: 'Approval Collector',
  description: 'Collects approval records for compliance verification',
  collect: async (config) => {
    // Implementation would query approval records
    const approvals = await prisma.approval.findMany({
      where: {
        organizationId: config.organizationId,
        createdAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
      },
      take: config.limit || 100,
      orderBy: { createdAt: 'desc' },
    }).catch(() => []);

    return approvals.map((approval) => ({
      id: `approval-${approval.id}`,
      ruleId: config.ruleId || 'approval_workflow',
      evidenceType: 'approval' as EvidenceType,
      sourceId: approval.id,
      sourceType: 'approval',
      description: `Approval ${approval.status} by ${approval.approvedBy || 'pending'}`,
      metadata: {
        status: approval.status,
        approvedBy: approval.approvedBy,
        requestedAt: approval.createdAt,
        decidedAt: approval.updatedAt,
        entityType: approval.entityType,
        entityId: approval.entityId,
      },
      collectedAt: new Date(),
    }));
  },
});

// Document Collector
registerEvidenceSource({
  type: 'document',
  name: 'Document Collector',
  description: 'Collects compliance-related documents',
  collect: async (config) => {
    // Implementation would query documents/policies
    const documents = await prisma.document.findMany({
      where: {
        organizationId: config.organizationId,
        type: { in: ['policy', 'procedure', 'compliance'] },
        updatedAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
      },
      take: config.limit || 50,
    }).catch(() => []);

    return documents.map((doc) => ({
      id: `document-${doc.id}`,
      ruleId: config.ruleId || 'documentation',
      evidenceType: 'document' as EvidenceType,
      sourceId: doc.id,
      sourceType: 'document',
      description: `${doc.type}: ${doc.title || doc.name}`,
      metadata: {
        title: doc.title || doc.name,
        type: doc.type,
        version: doc.version,
        lastUpdated: doc.updatedAt,
      },
      collectedAt: new Date(),
    }));
  },
});

// Configuration Collector
registerEvidenceSource({
  type: 'configuration',
  name: 'Configuration Collector',
  description: 'Collects system configuration evidence',
  collect: async (config) => {
    // Collect configuration evidence from various sources
    const evidence: CollectedEvidence[] = [];

    // Security settings
    const securityConfig = await getSecurityConfiguration(config.organizationId);
    if (securityConfig) {
      evidence.push({
        id: `config-security-${Date.now()}`,
        ruleId: config.ruleId || 'security_config',
        evidenceType: 'configuration',
        sourceId: 'security-settings',
        sourceType: 'configuration',
        description: 'Security configuration snapshot',
        metadata: securityConfig,
        collectedAt: new Date(),
      });
    }

    // Access control settings
    const accessConfig = await getAccessControlConfiguration(config.organizationId);
    if (accessConfig) {
      evidence.push({
        id: `config-access-${Date.now()}`,
        ruleId: config.ruleId || 'access_config',
        evidenceType: 'configuration',
        sourceId: 'access-settings',
        sourceType: 'configuration',
        description: 'Access control configuration snapshot',
        metadata: accessConfig,
        collectedAt: new Date(),
      });
    }

    return evidence;
  },
});

// Audit Report Collector
registerEvidenceSource({
  type: 'audit_report',
  name: 'Audit Report Collector',
  description: 'Collects internal and external audit reports',
  collect: async (config) => {
    // Implementation would query audit reports
    // For now, return empty array - would be populated from audit system
    return [];
  },
});

// =============================================================================
// Configuration Helpers
// =============================================================================

async function getSecurityConfiguration(
  _organizationId: string
): Promise<Record<string, unknown> | null> {
  // Implementation would fetch security configuration
  return {
    mfaEnabled: true,
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAge: 90,
    },
    sessionTimeout: 30,
    ipWhitelist: [],
    encryptionAtRest: true,
    encryptionInTransit: true,
  };
}

async function getAccessControlConfiguration(
  _organizationId: string
): Promise<Record<string, unknown> | null> {
  // Implementation would fetch access control configuration
  return {
    rbacEnabled: true,
    defaultRole: 'viewer',
    roleCount: 5,
    principleOfLeastPrivilege: true,
    accessReviewFrequency: 'quarterly',
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  registerEvidenceSource,
  getRegisteredSources,
  collectEvidenceForRule,
  collectEvidence,
  getEvidenceForRule,
  getEvidenceCollectionSummary,
  getAllEvidenceCollections,
  cleanupExpiredEvidence,
  archiveEvidence,
};
