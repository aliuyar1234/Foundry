/**
 * Retention Policy Tracker
 * T170 - Create retention policy tracker
 *
 * Tracks and enforces data retention policies for compliance
 */

import type { ComplianceFramework } from 'shared/types/compliance.js';
import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  entityType: string;
  retentionDays: number;
  legalBasis: string;
  framework?: ComplianceFramework;
  action: 'delete' | 'anonymize' | 'archive';
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionStatus {
  policyId: string;
  policyName: string;
  entityType: string;
  totalRecords: number;
  expiredRecords: number;
  expiringInWeek: number;
  expiringInMonth: number;
  lastProcessed?: Date;
  nextScheduled?: Date;
  status: 'compliant' | 'warning' | 'violation';
}

export interface RetentionReport {
  organizationId: string;
  generatedAt: Date;
  policies: RetentionStatus[];
  summary: {
    totalPolicies: number;
    compliantPolicies: number;
    warningPolicies: number;
    violationPolicies: number;
    totalExpiredRecords: number;
    complianceScore: number;
  };
}

export interface RetentionProcessingResult {
  policyId: string;
  processed: number;
  deleted: number;
  anonymized: number;
  archived: number;
  errors: number;
  errorDetails: string[];
}

// =============================================================================
// Policy Management
// =============================================================================

/**
 * Create a new retention policy
 */
export async function createRetentionPolicy(
  policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>
): Promise<RetentionPolicy> {
  const created = await prisma.retentionPolicy.create({
    data: {
      name: policy.name,
      description: policy.description,
      entityType: policy.entityType,
      retentionDays: policy.retentionDays,
      legalBasis: policy.legalBasis,
      framework: policy.framework,
      action: policy.action,
      isActive: policy.isActive,
      organizationId: policy.organizationId,
    },
  });

  return created as unknown as RetentionPolicy;
}

/**
 * Update retention policy
 */
export async function updateRetentionPolicy(
  policyId: string,
  updates: Partial<Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>>
): Promise<RetentionPolicy> {
  const updated = await prisma.retentionPolicy.update({
    where: { id: policyId },
    data: updates,
  });

  return updated as unknown as RetentionPolicy;
}

/**
 * Get all retention policies for organization
 */
export async function getRetentionPolicies(
  organizationId: string,
  options: {
    isActive?: boolean;
    framework?: ComplianceFramework;
    entityType?: string;
  } = {}
): Promise<RetentionPolicy[]> {
  const where: Record<string, unknown> = { organizationId };

  if (options.isActive !== undefined) {
    where.isActive = options.isActive;
  }
  if (options.framework) {
    where.framework = options.framework;
  }
  if (options.entityType) {
    where.entityType = options.entityType;
  }

  const policies = await prisma.retentionPolicy.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  return policies as unknown as RetentionPolicy[];
}

/**
 * Delete retention policy
 */
export async function deleteRetentionPolicy(policyId: string): Promise<void> {
  await prisma.retentionPolicy.delete({
    where: { id: policyId },
  });
}

// =============================================================================
// Retention Status & Monitoring
// =============================================================================

/**
 * Get retention status for a policy
 */
export async function getRetentionStatus(
  policyId: string,
  organizationId: string
): Promise<RetentionStatus> {
  const policy = await prisma.retentionPolicy.findUnique({
    where: { id: policyId },
  });

  if (!policy || policy.organizationId !== organizationId) {
    throw new Error('Policy not found');
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expirationDate = new Date(now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
  const expirationWeek = new Date(weekFromNow.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
  const expirationMonth = new Date(monthFromNow.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);

  // Count records by status
  const counts = await countRecordsByRetention(
    policy.entityType,
    organizationId,
    expirationDate,
    expirationWeek,
    expirationMonth
  );

  // Get last processing info
  const lastProcessing = await prisma.retentionProcessingLog.findFirst({
    where: { policyId },
    orderBy: { processedAt: 'desc' },
  });

  // Determine status
  let status: 'compliant' | 'warning' | 'violation' = 'compliant';
  if (counts.expired > 0) {
    status = 'violation';
  } else if (counts.expiringWeek > 0) {
    status = 'warning';
  }

  return {
    policyId: policy.id,
    policyName: policy.name,
    entityType: policy.entityType,
    totalRecords: counts.total,
    expiredRecords: counts.expired,
    expiringInWeek: counts.expiringWeek,
    expiringInMonth: counts.expiringMonth,
    lastProcessed: lastProcessing?.processedAt,
    nextScheduled: getNextScheduledProcessing(policy as unknown as RetentionPolicy),
    status,
  };
}

/**
 * Get retention report for organization
 */
export async function getRetentionReport(
  organizationId: string
): Promise<RetentionReport> {
  const policies = await getRetentionPolicies(organizationId, { isActive: true });
  const statuses: RetentionStatus[] = [];

  let compliantCount = 0;
  let warningCount = 0;
  let violationCount = 0;
  let totalExpired = 0;

  for (const policy of policies) {
    const status = await getRetentionStatus(policy.id, organizationId);
    statuses.push(status);

    if (status.status === 'compliant') compliantCount++;
    else if (status.status === 'warning') warningCount++;
    else violationCount++;

    totalExpired += status.expiredRecords;
  }

  const complianceScore =
    policies.length > 0
      ? Math.round((compliantCount / policies.length) * 100)
      : 100;

  return {
    organizationId,
    generatedAt: new Date(),
    policies: statuses,
    summary: {
      totalPolicies: policies.length,
      compliantPolicies: compliantCount,
      warningPolicies: warningCount,
      violationPolicies: violationCount,
      totalExpiredRecords: totalExpired,
      complianceScore,
    },
  };
}

// =============================================================================
// Retention Processing
// =============================================================================

/**
 * Process retention for a policy
 */
export async function processRetentionPolicy(
  policyId: string,
  options: {
    dryRun?: boolean;
    batchSize?: number;
  } = {}
): Promise<RetentionProcessingResult> {
  const policy = await prisma.retentionPolicy.findUnique({
    where: { id: policyId },
  });

  if (!policy) {
    throw new Error('Policy not found');
  }

  const expirationDate = new Date(
    Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000
  );

  const result: RetentionProcessingResult = {
    policyId,
    processed: 0,
    deleted: 0,
    anonymized: 0,
    archived: 0,
    errors: 0,
    errorDetails: [],
  };

  const batchSize = options.batchSize || 100;

  // Get expired records
  const expiredRecords = await getExpiredRecords(
    policy.entityType,
    policy.organizationId,
    expirationDate,
    batchSize
  );

  for (const record of expiredRecords) {
    result.processed++;

    if (options.dryRun) {
      // Just count what would be processed
      switch (policy.action) {
        case 'delete':
          result.deleted++;
          break;
        case 'anonymize':
          result.anonymized++;
          break;
        case 'archive':
          result.archived++;
          break;
      }
      continue;
    }

    try {
      switch (policy.action) {
        case 'delete':
          await deleteRecord(policy.entityType, record.id);
          result.deleted++;
          break;
        case 'anonymize':
          await anonymizeRecord(policy.entityType, record.id);
          result.anonymized++;
          break;
        case 'archive':
          await archiveRecord(policy.entityType, record.id);
          result.archived++;
          break;
      }
    } catch (error) {
      result.errors++;
      result.errorDetails.push(
        `Failed to process ${record.id}: ${(error as Error).message}`
      );
    }
  }

  // Log processing
  if (!options.dryRun) {
    await prisma.retentionProcessingLog.create({
      data: {
        policyId,
        processedAt: new Date(),
        recordsProcessed: result.processed,
        recordsDeleted: result.deleted,
        recordsAnonymized: result.anonymized,
        recordsArchived: result.archived,
        errors: result.errors,
        errorDetails: result.errorDetails,
      },
    });
  }

  return result;
}

/**
 * Process all active retention policies
 */
export async function processAllRetentionPolicies(
  organizationId: string,
  options: {
    dryRun?: boolean;
    batchSize?: number;
  } = {}
): Promise<RetentionProcessingResult[]> {
  const policies = await getRetentionPolicies(organizationId, { isActive: true });
  const results: RetentionProcessingResult[] = [];

  for (const policy of policies) {
    const result = await processRetentionPolicy(policy.id, options);
    results.push(result);
  }

  return results;
}

// =============================================================================
// Default Retention Policies
// =============================================================================

/**
 * Get default retention policies for a framework
 */
export function getDefaultRetentionPolicies(
  framework: ComplianceFramework
): Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>[] {
  const defaults: Record<
    ComplianceFramework,
    Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt' | 'organizationId'>[]
  > = {
    GDPR: [
      {
        name: 'Personal Data - General',
        description: 'General personal data retention per GDPR requirements',
        entityType: 'personal_data',
        retentionDays: 365 * 3, // 3 years
        legalBasis: 'GDPR Article 5(1)(e) - Storage limitation',
        framework: 'GDPR',
        action: 'delete',
        isActive: true,
      },
      {
        name: 'Consent Records',
        description: 'Consent records must be retained while processing',
        entityType: 'consent',
        retentionDays: 365 * 7, // 7 years after last interaction
        legalBasis: 'GDPR Article 7 - Demonstrating consent',
        framework: 'GDPR',
        action: 'archive',
        isActive: true,
      },
      {
        name: 'Access Logs',
        description: 'Data access logs for accountability',
        entityType: 'access_log',
        retentionDays: 365 * 2, // 2 years
        legalBasis: 'GDPR Article 5(2) - Accountability',
        framework: 'GDPR',
        action: 'delete',
        isActive: true,
      },
    ],
    SOX: [
      {
        name: 'Financial Records',
        description: 'Financial transaction records',
        entityType: 'financial_record',
        retentionDays: 365 * 7, // 7 years
        legalBasis: 'SOX Section 802 - Document retention',
        framework: 'SOX',
        action: 'archive',
        isActive: true,
      },
      {
        name: 'Audit Trails',
        description: 'Audit trails for financial systems',
        entityType: 'audit_trail',
        retentionDays: 365 * 7, // 7 years
        legalBasis: 'SOX Section 802 - Criminal penalties',
        framework: 'SOX',
        action: 'archive',
        isActive: true,
      },
      {
        name: 'Work Papers',
        description: 'Audit work papers and documentation',
        entityType: 'work_paper',
        retentionDays: 365 * 7, // 7 years
        legalBasis: 'SOX Section 802',
        framework: 'SOX',
        action: 'archive',
        isActive: true,
      },
    ],
    ISO27001: [
      {
        name: 'Security Logs',
        description: 'Security event and incident logs',
        entityType: 'security_log',
        retentionDays: 365 * 3, // 3 years
        legalBasis: 'ISO 27001 A.12.4 - Logging and monitoring',
        framework: 'ISO27001',
        action: 'archive',
        isActive: true,
      },
      {
        name: 'Access Control Records',
        description: 'User access and authentication records',
        entityType: 'access_control',
        retentionDays: 365 * 2, // 2 years
        legalBasis: 'ISO 27001 A.9 - Access control',
        framework: 'ISO27001',
        action: 'archive',
        isActive: true,
      },
    ],
    DSGVO: [
      // Same as GDPR (DSGVO is German GDPR)
      {
        name: 'Personenbezogene Daten',
        description: 'Allgemeine personenbezogene Daten gemäß DSGVO',
        entityType: 'personal_data',
        retentionDays: 365 * 3,
        legalBasis: 'DSGVO Art. 5 Abs. 1 lit. e - Speicherbegrenzung',
        framework: 'DSGVO',
        action: 'delete',
        isActive: true,
      },
    ],
    custom: [],
  };

  return defaults[framework] || [];
}

/**
 * Initialize default retention policies for organization
 */
export async function initializeDefaultPolicies(
  organizationId: string,
  frameworks: ComplianceFramework[]
): Promise<RetentionPolicy[]> {
  const created: RetentionPolicy[] = [];

  for (const framework of frameworks) {
    const defaults = getDefaultRetentionPolicies(framework);

    for (const policy of defaults) {
      const existing = await prisma.retentionPolicy.findFirst({
        where: {
          organizationId,
          entityType: policy.entityType,
          framework: policy.framework,
        },
      });

      if (!existing) {
        const newPolicy = await createRetentionPolicy({
          ...policy,
          organizationId,
        });
        created.push(newPolicy);
      }
    }
  }

  return created;
}

// =============================================================================
// Helper Functions
// =============================================================================

interface RecordCounts {
  total: number;
  expired: number;
  expiringWeek: number;
  expiringMonth: number;
}

async function countRecordsByRetention(
  _entityType: string,
  _organizationId: string,
  _expirationDate: Date,
  _expirationWeek: Date,
  _expirationMonth: Date
): Promise<RecordCounts> {
  // Implementation would count records by date ranges
  // This is a placeholder
  return {
    total: 0,
    expired: 0,
    expiringWeek: 0,
    expiringMonth: 0,
  };
}

function getNextScheduledProcessing(policy: RetentionPolicy): Date {
  // Default to daily processing at 2 AM
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function getExpiredRecords(
  _entityType: string,
  _organizationId: string,
  _expirationDate: Date,
  _limit: number
): Promise<{ id: string }[]> {
  // Implementation would query expired records
  return [];
}

async function deleteRecord(_entityType: string, _recordId: string): Promise<void> {
  // Implementation would delete the record
}

async function anonymizeRecord(_entityType: string, _recordId: string): Promise<void> {
  // Implementation would anonymize personal data in the record
}

async function archiveRecord(_entityType: string, _recordId: string): Promise<void> {
  // Implementation would move record to archive storage
}

// =============================================================================
// Exports
// =============================================================================

export default {
  createRetentionPolicy,
  updateRetentionPolicy,
  getRetentionPolicies,
  deleteRetentionPolicy,
  getRetentionStatus,
  getRetentionReport,
  processRetentionPolicy,
  processAllRetentionPolicies,
  getDefaultRetentionPolicies,
  initializeDefaultPolicies,
};
