/**
 * Privacy Audit Trail
 * Comprehensive logging of all privacy-related operations for GDPR compliance
 * T299 - Privacy audit trail
 */

import { prisma } from '../../lib/prisma.js';

export type AuditAction =
  | 'data_access'
  | 'data_export'
  | 'data_deletion'
  | 'data_modification'
  | 'consent_given'
  | 'consent_withdrawn'
  | 'anonymization'
  | 'visibility_change'
  | 'config_change'
  | 'report_generated'
  | 'report_viewed'
  | 'dsar_request'
  | 'dsar_fulfilled'
  | 'breach_detected'
  | 'policy_violation';

export type AuditCategory =
  | 'access'
  | 'consent'
  | 'data_lifecycle'
  | 'configuration'
  | 'reporting'
  | 'compliance'
  | 'security';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  id: string;
  organizationId: string;
  action: AuditAction;
  category: AuditCategory;
  severity: AuditSeverity;
  actorId: string;
  actorType: 'user' | 'system' | 'api' | 'automated';
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  dataCategory?: string;
  description: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
  timestamp: Date;
  retentionUntil: Date;
}

export interface AuditEntryInput {
  action: AuditAction;
  category: AuditCategory;
  severity?: AuditSeverity;
  actorId: string;
  actorType: 'user' | 'system' | 'api' | 'automated';
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  dataCategory?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  failureReason?: string;
}

export interface AuditQuery {
  action?: AuditAction;
  category?: AuditCategory;
  severity?: AuditSeverity;
  actorId?: string;
  targetId?: string;
  targetType?: string;
  fromDate?: Date;
  toDate?: Date;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditStatistics {
  totalEntries: number;
  byAction: Record<AuditAction, number>;
  byCategory: Record<AuditCategory, number>;
  bySeverity: Record<AuditSeverity, number>;
  successRate: number;
  criticalEvents: number;
  topActors: Array<{ actorId: string; count: number }>;
  recentActivity: AuditEntry[];
}

export interface DataAccessLog {
  userId: string;
  accessedData: string[];
  purpose: string;
  timestamp: Date;
  justification?: string;
}

export interface ConsentAuditEntry {
  userId: string;
  consentType: string;
  action: 'given' | 'withdrawn' | 'updated';
  previousValue?: boolean;
  newValue: boolean;
  source: string;
  timestamp: Date;
}

// Default retention period for audit logs (7 years for GDPR)
const DEFAULT_RETENTION_YEARS = 7;

/**
 * Log a privacy audit entry
 */
export async function logAuditEntry(
  organizationId: string,
  input: AuditEntryInput
): Promise<AuditEntry> {
  const retentionYears = await getRetentionPeriod(organizationId);
  const retentionUntil = new Date();
  retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

  const entry = await prisma.privacyAuditLog.create({
    data: {
      organizationId,
      action: input.action,
      category: input.category,
      severity: input.severity || determineSeverity(input.action),
      actorId: input.actorId,
      actorType: input.actorType,
      actorRole: input.actorRole,
      targetType: input.targetType,
      targetId: input.targetId,
      dataCategory: input.dataCategory,
      description: input.description,
      metadata: input.metadata || {},
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      success: input.success ?? true,
      failureReason: input.failureReason,
      timestamp: new Date(),
      retentionUntil,
    },
  });

  // Check for policy violations or critical events
  if (input.severity === 'critical' || input.action === 'policy_violation') {
    await handleCriticalEvent(organizationId, entry);
  }

  return transformEntry(entry);
}

/**
 * Log data access
 */
export async function logDataAccess(
  organizationId: string,
  accessLog: DataAccessLog & { actorId: string; actorRole?: string }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'data_access',
    category: 'access',
    actorId: accessLog.actorId,
    actorType: 'user',
    actorRole: accessLog.actorRole,
    targetType: 'user_data',
    targetId: accessLog.userId,
    description: `Accessed ${accessLog.accessedData.length} data fields for user ${accessLog.userId}`,
    metadata: {
      accessedFields: accessLog.accessedData,
      purpose: accessLog.purpose,
      justification: accessLog.justification,
    },
  });
}

/**
 * Log consent change
 */
export async function logConsentChange(
  organizationId: string,
  consent: ConsentAuditEntry
): Promise<AuditEntry> {
  const action: AuditAction =
    consent.action === 'withdrawn' ? 'consent_withdrawn' : 'consent_given';

  return logAuditEntry(organizationId, {
    action,
    category: 'consent',
    actorId: consent.userId,
    actorType: 'user',
    targetType: 'consent',
    targetId: consent.consentType,
    description: `Consent ${consent.action}: ${consent.consentType}`,
    metadata: {
      consentType: consent.consentType,
      previousValue: consent.previousValue,
      newValue: consent.newValue,
      source: consent.source,
    },
  });
}

/**
 * Log data export (DSAR)
 */
export async function logDataExport(
  organizationId: string,
  input: {
    requesterId: string;
    subjectId: string;
    exportedDataTypes: string[];
    format: string;
    deliveryMethod: string;
  }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'data_export',
    category: 'compliance',
    severity: 'warning',
    actorId: input.requesterId,
    actorType: 'user',
    targetType: 'user_data',
    targetId: input.subjectId,
    description: `Data export requested for subject ${input.subjectId}`,
    metadata: {
      exportedDataTypes: input.exportedDataTypes,
      format: input.format,
      deliveryMethod: input.deliveryMethod,
    },
  });
}

/**
 * Log data deletion
 */
export async function logDataDeletion(
  organizationId: string,
  input: {
    requesterId: string;
    subjectId: string;
    deletedDataTypes: string[];
    reason: string;
    retainedDataTypes?: string[];
    retentionJustification?: string;
  }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'data_deletion',
    category: 'data_lifecycle',
    severity: 'warning',
    actorId: input.requesterId,
    actorType: 'user',
    targetType: 'user_data',
    targetId: input.subjectId,
    description: `Data deletion executed for subject ${input.subjectId}`,
    metadata: {
      deletedDataTypes: input.deletedDataTypes,
      reason: input.reason,
      retainedDataTypes: input.retainedDataTypes,
      retentionJustification: input.retentionJustification,
    },
  });
}

/**
 * Log anonymization operation
 */
export async function logAnonymization(
  organizationId: string,
  input: {
    actorId: string;
    recordCount: number;
    anonymizedFields: string[];
    strategy: string;
  }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'anonymization',
    category: 'data_lifecycle',
    actorId: input.actorId,
    actorType: 'user',
    description: `Anonymized ${input.recordCount} records`,
    metadata: {
      recordCount: input.recordCount,
      anonymizedFields: input.anonymizedFields,
      strategy: input.strategy,
    },
  });
}

/**
 * Log DSAR request
 */
export async function logDSARRequest(
  organizationId: string,
  input: {
    requestId: string;
    subjectId: string;
    requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
    requestedBy: string;
    verificationMethod: string;
  }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'dsar_request',
    category: 'compliance',
    severity: 'warning',
    actorId: input.requestedBy,
    actorType: 'user',
    targetType: 'dsar',
    targetId: input.requestId,
    description: `DSAR ${input.requestType} request received for subject ${input.subjectId}`,
    metadata: {
      requestId: input.requestId,
      subjectId: input.subjectId,
      requestType: input.requestType,
      verificationMethod: input.verificationMethod,
    },
  });
}

/**
 * Log DSAR fulfillment
 */
export async function logDSARFulfillment(
  organizationId: string,
  input: {
    requestId: string;
    fulfilledBy: string;
    fulfillmentDetails: Record<string, unknown>;
    responseTime: number; // in hours
  }
): Promise<AuditEntry> {
  const severity: AuditSeverity = input.responseTime > 720 ? 'warning' : 'info'; // > 30 days

  return logAuditEntry(organizationId, {
    action: 'dsar_fulfilled',
    category: 'compliance',
    severity,
    actorId: input.fulfilledBy,
    actorType: 'user',
    targetType: 'dsar',
    targetId: input.requestId,
    description: `DSAR request ${input.requestId} fulfilled`,
    metadata: {
      ...input.fulfillmentDetails,
      responseTimeHours: input.responseTime,
    },
  });
}

/**
 * Log policy violation
 */
export async function logPolicyViolation(
  organizationId: string,
  input: {
    actorId: string;
    violationType: string;
    policyName: string;
    details: string;
    attemptedAction: string;
  }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'policy_violation',
    category: 'security',
    severity: 'critical',
    actorId: input.actorId,
    actorType: 'user',
    description: `Policy violation: ${input.violationType}`,
    metadata: {
      violationType: input.violationType,
      policyName: input.policyName,
      details: input.details,
      attemptedAction: input.attemptedAction,
    },
    success: false,
    failureReason: 'Policy violation detected',
  });
}

/**
 * Log configuration change
 */
export async function logConfigChange(
  organizationId: string,
  input: {
    actorId: string;
    configType: string;
    previousValue: Record<string, unknown>;
    newValue: Record<string, unknown>;
  }
): Promise<AuditEntry> {
  return logAuditEntry(organizationId, {
    action: 'config_change',
    category: 'configuration',
    severity: 'warning',
    actorId: input.actorId,
    actorType: 'user',
    targetType: 'config',
    targetId: input.configType,
    description: `Privacy configuration changed: ${input.configType}`,
    metadata: {
      configType: input.configType,
      previousValue: input.previousValue,
      newValue: input.newValue,
      changes: getConfigChanges(input.previousValue, input.newValue),
    },
  });
}

/**
 * Query audit entries
 */
export async function queryAuditLog(
  organizationId: string,
  query: AuditQuery
): Promise<{ entries: AuditEntry[]; total: number }> {
  const where: Record<string, unknown> = { organizationId };

  if (query.action) {
    where.action = query.action;
  }

  if (query.category) {
    where.category = query.category;
  }

  if (query.severity) {
    where.severity = query.severity;
  }

  if (query.actorId) {
    where.actorId = query.actorId;
  }

  if (query.targetId) {
    where.targetId = query.targetId;
  }

  if (query.targetType) {
    where.targetType = query.targetType;
  }

  if (query.success !== undefined) {
    where.success = query.success;
  }

  if (query.fromDate || query.toDate) {
    where.timestamp = {};
    if (query.fromDate) {
      (where.timestamp as Record<string, Date>).gte = query.fromDate;
    }
    if (query.toDate) {
      (where.timestamp as Record<string, Date>).lte = query.toDate;
    }
  }

  const [entries, total] = await Promise.all([
    prisma.privacyAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: query.limit || 100,
      skip: query.offset || 0,
    }),
    prisma.privacyAuditLog.count({ where }),
  ]);

  return {
    entries: entries.map(transformEntry),
    total,
  };
}

/**
 * Get audit statistics
 */
export async function getAuditStatistics(
  organizationId: string,
  period?: { start: Date; end: Date }
): Promise<AuditStatistics> {
  const where: Record<string, unknown> = { organizationId };

  if (period) {
    where.timestamp = {
      gte: period.start,
      lte: period.end,
    };
  }

  const [
    totalEntries,
    byAction,
    byCategory,
    bySeverity,
    successCount,
    criticalEvents,
    topActors,
    recentActivity,
  ] = await Promise.all([
    prisma.privacyAuditLog.count({ where }),
    prisma.privacyAuditLog.groupBy({
      by: ['action'],
      where,
      _count: true,
    }),
    prisma.privacyAuditLog.groupBy({
      by: ['category'],
      where,
      _count: true,
    }),
    prisma.privacyAuditLog.groupBy({
      by: ['severity'],
      where,
      _count: true,
    }),
    prisma.privacyAuditLog.count({ where: { ...where, success: true } }),
    prisma.privacyAuditLog.count({ where: { ...where, severity: 'critical' } }),
    prisma.privacyAuditLog.groupBy({
      by: ['actorId'],
      where,
      _count: true,
      orderBy: { _count: { actorId: 'desc' } },
      take: 10,
    }),
    prisma.privacyAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 10,
    }),
  ]);

  return {
    totalEntries,
    byAction: Object.fromEntries(
      byAction.map((a) => [a.action, a._count])
    ) as Record<AuditAction, number>,
    byCategory: Object.fromEntries(
      byCategory.map((c) => [c.category, c._count])
    ) as Record<AuditCategory, number>,
    bySeverity: Object.fromEntries(
      bySeverity.map((s) => [s.severity, s._count])
    ) as Record<AuditSeverity, number>,
    successRate: totalEntries > 0 ? (successCount / totalEntries) * 100 : 100,
    criticalEvents,
    topActors: topActors.map((a) => ({
      actorId: a.actorId,
      count: a._count,
    })),
    recentActivity: recentActivity.map(transformEntry),
  };
}

/**
 * Get data access history for a user
 */
export async function getDataAccessHistory(
  organizationId: string,
  userId: string,
  options?: { fromDate?: Date; toDate?: Date; limit?: number }
): Promise<AuditEntry[]> {
  const where: Record<string, unknown> = {
    organizationId,
    action: 'data_access',
    targetId: userId,
  };

  if (options?.fromDate || options?.toDate) {
    where.timestamp = {};
    if (options.fromDate) {
      (where.timestamp as Record<string, Date>).gte = options.fromDate;
    }
    if (options.toDate) {
      (where.timestamp as Record<string, Date>).lte = options.toDate;
    }
  }

  const entries = await prisma.privacyAuditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: options?.limit || 100,
  });

  return entries.map(transformEntry);
}

/**
 * Get consent history for a user
 */
export async function getConsentHistory(
  organizationId: string,
  userId: string
): Promise<AuditEntry[]> {
  const entries = await prisma.privacyAuditLog.findMany({
    where: {
      organizationId,
      action: { in: ['consent_given', 'consent_withdrawn'] },
      actorId: userId,
    },
    orderBy: { timestamp: 'desc' },
  });

  return entries.map(transformEntry);
}

/**
 * Export audit log for compliance reporting
 */
export async function exportAuditLog(
  organizationId: string,
  options: {
    fromDate: Date;
    toDate: Date;
    format: 'json' | 'csv';
    includeMetadata: boolean;
  }
): Promise<{ data: string; filename: string }> {
  const { entries } = await queryAuditLog(organizationId, {
    fromDate: options.fromDate,
    toDate: options.toDate,
    limit: 100000, // High limit for exports
  });

  // Log the export itself
  await logAuditEntry(organizationId, {
    action: 'data_export',
    category: 'compliance',
    actorId: 'system',
    actorType: 'system',
    description: `Audit log exported (${entries.length} entries)`,
    metadata: {
      fromDate: options.fromDate,
      toDate: options.toDate,
      entryCount: entries.length,
      format: options.format,
    },
  });

  const filename = `audit_log_${organizationId}_${options.fromDate.toISOString().split('T')[0]}_${options.toDate.toISOString().split('T')[0]}.${options.format}`;

  if (options.format === 'csv') {
    const csv = entriesToCSV(entries, options.includeMetadata);
    return { data: csv, filename };
  }

  const json = JSON.stringify(
    options.includeMetadata
      ? entries
      : entries.map((e) => ({ ...e, metadata: undefined })),
    null,
    2
  );
  return { data: json, filename };
}

/**
 * Cleanup expired audit entries
 */
export async function cleanupExpiredEntries(
  organizationId: string
): Promise<number> {
  const result = await prisma.privacyAuditLog.deleteMany({
    where: {
      organizationId,
      retentionUntil: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    await logAuditEntry(organizationId, {
      action: 'data_deletion',
      category: 'data_lifecycle',
      actorId: 'system',
      actorType: 'automated',
      description: `Cleaned up ${result.count} expired audit entries`,
      metadata: { deletedCount: result.count },
    });
  }

  return result.count;
}

// Helper functions

async function getRetentionPeriod(organizationId: string): Promise<number> {
  const config = await prisma.privacyConfig.findUnique({
    where: { organizationId },
  });

  return (config?.auditRetentionYears as number) || DEFAULT_RETENTION_YEARS;
}

function determineSeverity(action: AuditAction): AuditSeverity {
  const criticalActions: AuditAction[] = [
    'breach_detected',
    'policy_violation',
    'data_deletion',
  ];

  const warningActions: AuditAction[] = [
    'data_export',
    'consent_withdrawn',
    'dsar_request',
    'config_change',
    'visibility_change',
  ];

  if (criticalActions.includes(action)) return 'critical';
  if (warningActions.includes(action)) return 'warning';
  return 'info';
}

async function handleCriticalEvent(
  organizationId: string,
  entry: Record<string, unknown>
): Promise<void> {
  // In production, this would:
  // 1. Send notifications to DPO
  // 2. Trigger incident response workflow
  // 3. Create alert in monitoring system

  // For now, just ensure it's logged
  console.warn(`Critical privacy event: ${entry.action} in org ${organizationId}`);
}

function getConfigChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): string[] {
  const changes: string[] = [];

  const allKeys = new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ]);

  for (const key of allKeys) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      changes.push(key);
    }
  }

  return changes;
}

function transformEntry(entry: Record<string, unknown>): AuditEntry {
  return {
    id: entry.id as string,
    organizationId: entry.organizationId as string,
    action: entry.action as AuditAction,
    category: entry.category as AuditCategory,
    severity: entry.severity as AuditSeverity,
    actorId: entry.actorId as string,
    actorType: entry.actorType as AuditEntry['actorType'],
    actorRole: entry.actorRole as string | undefined,
    targetType: entry.targetType as string | undefined,
    targetId: entry.targetId as string | undefined,
    dataCategory: entry.dataCategory as string | undefined,
    description: entry.description as string,
    metadata: entry.metadata as Record<string, unknown>,
    ipAddress: entry.ipAddress as string | undefined,
    userAgent: entry.userAgent as string | undefined,
    success: entry.success as boolean,
    failureReason: entry.failureReason as string | undefined,
    timestamp: entry.timestamp as Date,
    retentionUntil: entry.retentionUntil as Date,
  };
}

function entriesToCSV(entries: AuditEntry[], includeMetadata: boolean): string {
  const headers = [
    'id',
    'timestamp',
    'action',
    'category',
    'severity',
    'actorId',
    'actorType',
    'targetType',
    'targetId',
    'description',
    'success',
  ];

  if (includeMetadata) {
    headers.push('metadata');
  }

  const rows = entries.map((entry) => {
    const row = [
      entry.id,
      entry.timestamp.toISOString(),
      entry.action,
      entry.category,
      entry.severity,
      entry.actorId,
      entry.actorType,
      entry.targetType || '',
      entry.targetId || '',
      `"${entry.description.replace(/"/g, '""')}"`,
      entry.success ? 'true' : 'false',
    ];

    if (includeMetadata) {
      row.push(`"${JSON.stringify(entry.metadata).replace(/"/g, '""')}"`);
    }

    return row.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export default {
  logAuditEntry,
  logDataAccess,
  logConsentChange,
  logDataExport,
  logDataDeletion,
  logAnonymization,
  logDSARRequest,
  logDSARFulfillment,
  logPolicyViolation,
  logConfigChange,
  queryAuditLog,
  getAuditStatistics,
  getDataAccessHistory,
  getConsentHistory,
  exportAuditLog,
  cleanupExpiredEntries,
};
