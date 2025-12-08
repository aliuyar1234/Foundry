/**
 * Approval Bottleneck Detector
 * T135 - Create approval bottleneck detector
 *
 * Detects approval workflows that are causing delays
 */

import { logger } from '../../lib/logger.js';
import {
  registerDetector,
  createDetectedPattern,
  mergePatterns,
} from './patternDetector.js';
import type { DetectedPattern, AffectedEntity } from 'shared/types/selfHealing.js';
import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface ApprovalBottleneckConfig {
  /** Maximum time for an approval (minutes) */
  maxApprovalTimeMinutes: number;
  /** Number of pending approvals to consider a bottleneck */
  pendingApprovalThreshold: number;
  /** Average approval time threshold (minutes) */
  avgApprovalTimeThreshold: number;
  /** Minimum approvals to calculate statistics */
  minApprovalsForStats: number;
}

interface ApproverStats {
  approverId: string;
  approverName: string;
  approverEmail?: string;
  department?: string;
  pendingCount: number;
  overdueCount: number;
  avgApprovalTimeMinutes: number;
  totalApprovals: number;
  oldestPending?: {
    id: string;
    type: string;
    requestedAt: Date;
    waitingMinutes: number;
  };
}

interface PendingApproval {
  id: string;
  type: string;
  requestedAt: Date;
  approverId: string;
  approverName: string;
  processInstanceId?: string;
  processName?: string;
  requesterId: string;
  requesterName: string;
  waitingMinutes: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

// Default configuration
const DEFAULT_CONFIG: ApprovalBottleneckConfig = {
  maxApprovalTimeMinutes: 1440, // 24 hours
  pendingApprovalThreshold: 5,
  avgApprovalTimeThreshold: 480, // 8 hours
  minApprovalsForStats: 5,
};

// =============================================================================
// Detector Implementation
// =============================================================================

/**
 * Detect approval bottlenecks
 */
export async function detectApprovalBottlenecks(
  organizationId: string,
  timeWindowMinutes: number,
  config: Partial<ApprovalBottleneckConfig> = {}
): Promise<DetectedPattern[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const patterns: DetectedPattern[] = [];

  logger.debug({ organizationId, config: cfg }, 'Detecting approval bottlenecks');

  try {
    // Get approver statistics
    const approverStats = await getApproverStatistics(organizationId, cfg);

    // Find bottleneck approvers
    for (const stats of approverStats) {
      const issues = analyzeApproverStats(stats, cfg);

      if (issues.length > 0) {
        const severity = determineSeverity(stats, cfg);
        const affectedEntities = await buildAffectedEntities(stats, organizationId);

        const pattern = createDetectedPattern(
          'approval_bottleneck',
          `Approver "${stats.approverName}" is a bottleneck: ${issues.join(', ')}`,
          severity,
          affectedEntities,
          generateSuggestedActions(stats, cfg)
        );

        patterns.push(pattern);
      }
    }

    // Also detect process-level bottlenecks
    const processBottlenecks = await detectProcessApprovalBottlenecks(
      organizationId,
      cfg
    );
    patterns.push(...processBottlenecks);

    const merged = mergePatterns(patterns);

    logger.info(
      {
        organizationId,
        approverBottlenecks: approverStats.filter(
          (s) => analyzeApproverStats(s, cfg).length > 0
        ).length,
        patternCount: merged.length,
      },
      'Approval bottleneck detection completed'
    );

    return merged;
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to detect approval bottlenecks');
    throw error;
  }
}

// =============================================================================
// Statistics Gathering
// =============================================================================

async function getApproverStatistics(
  organizationId: string,
  config: ApprovalBottleneckConfig
): Promise<ApproverStats[]> {
  const now = new Date();
  const overdueThreshold = new Date(
    now.getTime() - config.maxApprovalTimeMinutes * 60 * 1000
  );

  // Get pending approvals grouped by approver
  const approverData = await prisma.$queryRaw<
    Array<{
      approverId: string;
      approverName: string;
      approverEmail: string | null;
      department: string | null;
      pendingCount: number;
      overdueCount: number;
      avgApprovalTimeMinutes: number | null;
      totalApprovals: number;
      oldestPendingId: string | null;
      oldestPendingType: string | null;
      oldestPendingAt: Date | null;
    }>
  >`
    WITH pending AS (
      SELECT
        a."approverId",
        COUNT(*) as pending_count,
        COUNT(*) FILTER (WHERE a."requestedAt" < ${overdueThreshold}) as overdue_count,
        MIN(a."requestedAt") as oldest_pending_at,
        (array_agg(a.id ORDER BY a."requestedAt"))[1] as oldest_pending_id,
        (array_agg(a.type ORDER BY a."requestedAt"))[1] as oldest_pending_type
      FROM "ApprovalRequest" a
      WHERE a."organizationId" = ${organizationId}
        AND a.status = 'pending'
      GROUP BY a."approverId"
    ),
    completed AS (
      SELECT
        a."approverId",
        AVG(EXTRACT(EPOCH FROM (a."completedAt" - a."requestedAt")) / 60) as avg_approval_time,
        COUNT(*) as total_approvals
      FROM "ApprovalRequest" a
      WHERE a."organizationId" = ${organizationId}
        AND a.status IN ('approved', 'rejected')
        AND a."completedAt" > NOW() - INTERVAL '30 days'
      GROUP BY a."approverId"
    )
    SELECT
      COALESCE(p."approverId", c."approverId") as "approverId",
      per.name as "approverName",
      per.email as "approverEmail",
      per.department,
      COALESCE(p.pending_count, 0) as "pendingCount",
      COALESCE(p.overdue_count, 0) as "overdueCount",
      c.avg_approval_time as "avgApprovalTimeMinutes",
      COALESCE(c.total_approvals, 0) as "totalApprovals",
      p.oldest_pending_id as "oldestPendingId",
      p.oldest_pending_type as "oldestPendingType",
      p.oldest_pending_at as "oldestPendingAt"
    FROM pending p
    FULL OUTER JOIN completed c ON p."approverId" = c."approverId"
    JOIN "Person" per ON per.id = COALESCE(p."approverId", c."approverId")
    WHERE per."organizationId" = ${organizationId}
    ORDER BY COALESCE(p.pending_count, 0) DESC
  `.catch(() => []);

  return approverData.map((d) => ({
    approverId: d.approverId,
    approverName: d.approverName,
    approverEmail: d.approverEmail || undefined,
    department: d.department || undefined,
    pendingCount: Number(d.pendingCount),
    overdueCount: Number(d.overdueCount),
    avgApprovalTimeMinutes: d.avgApprovalTimeMinutes || 0,
    totalApprovals: Number(d.totalApprovals),
    oldestPending: d.oldestPendingId
      ? {
          id: d.oldestPendingId,
          type: d.oldestPendingType || 'unknown',
          requestedAt: d.oldestPendingAt!,
          waitingMinutes: Math.floor(
            (now.getTime() - d.oldestPendingAt!.getTime()) / (60 * 1000)
          ),
        }
      : undefined,
  }));
}

async function detectProcessApprovalBottlenecks(
  organizationId: string,
  config: ApprovalBottleneckConfig
): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = [];

  // Find approval steps that consistently slow down processes
  const slowApprovalSteps = await prisma.$queryRaw<
    Array<{
      processId: string;
      processName: string;
      stepId: string;
      stepName: string;
      avgDurationMinutes: number;
      pendingCount: number;
    }>
  >`
    SELECT
      p.id as "processId",
      p.name as "processName",
      ps.id as "stepId",
      ps.name as "stepName",
      AVG(EXTRACT(EPOCH FROM (psl."endedAt" - psl."startedAt")) / 60) as "avgDurationMinutes",
      COUNT(*) FILTER (WHERE psl."endedAt" IS NULL) as "pendingCount"
    FROM "ProcessStepLog" psl
    JOIN "ProcessStep" ps ON psl."stepId" = ps.id
    JOIN "Process" p ON ps."processId" = p.id
    WHERE p."organizationId" = ${organizationId}
      AND ps."requiresApproval" = true
      AND psl."startedAt" > NOW() - INTERVAL '30 days'
    GROUP BY p.id, p.name, ps.id, ps.name
    HAVING AVG(EXTRACT(EPOCH FROM (psl."endedAt" - psl."startedAt")) / 60) > ${config.avgApprovalTimeThreshold}
       OR COUNT(*) FILTER (WHERE psl."endedAt" IS NULL) >= ${config.pendingApprovalThreshold}
    ORDER BY "avgDurationMinutes" DESC
    LIMIT 10
  `.catch(() => []);

  for (const step of slowApprovalSteps) {
    const severity =
      step.avgDurationMinutes > config.maxApprovalTimeMinutes
        ? 'high'
        : step.pendingCount >= config.pendingApprovalThreshold * 2
        ? 'high'
        : 'medium';

    const pattern = createDetectedPattern(
      'approval_bottleneck',
      `Approval step "${step.stepName}" in process "${step.processName}" is slow (avg ${formatDuration(step.avgDurationMinutes)}, ${step.pendingCount} pending)`,
      severity,
      [
        {
          type: 'process_step',
          id: step.stepId,
          name: step.stepName,
          impact: 'direct',
        },
        {
          type: 'process',
          id: step.processId,
          name: step.processName,
          impact: 'indirect',
        },
      ],
      [
        'Review approval requirements for this step',
        'Consider adding backup approvers',
        'Automate approval for low-risk cases',
      ]
    );

    patterns.push(pattern);
  }

  return patterns;
}

// =============================================================================
// Analysis Functions
// =============================================================================

function analyzeApproverStats(
  stats: ApproverStats,
  config: ApprovalBottleneckConfig
): string[] {
  const issues: string[] = [];

  if (stats.pendingCount >= config.pendingApprovalThreshold) {
    issues.push(`${stats.pendingCount} pending approvals`);
  }

  if (stats.overdueCount > 0) {
    issues.push(`${stats.overdueCount} overdue approvals`);
  }

  if (
    stats.totalApprovals >= config.minApprovalsForStats &&
    stats.avgApprovalTimeMinutes > config.avgApprovalTimeThreshold
  ) {
    issues.push(
      `slow average approval time (${formatDuration(stats.avgApprovalTimeMinutes)})`
    );
  }

  if (
    stats.oldestPending &&
    stats.oldestPending.waitingMinutes > config.maxApprovalTimeMinutes
  ) {
    issues.push(
      `oldest pending waiting ${formatDuration(stats.oldestPending.waitingMinutes)}`
    );
  }

  return issues;
}

function determineSeverity(
  stats: ApproverStats,
  config: ApprovalBottleneckConfig
): DetectedPattern['severity'] {
  if (stats.overdueCount >= config.pendingApprovalThreshold) return 'critical';
  if (stats.overdueCount > 0) return 'high';
  if (stats.pendingCount >= config.pendingApprovalThreshold * 2) return 'high';
  if (stats.pendingCount >= config.pendingApprovalThreshold) return 'medium';
  return 'low';
}

async function buildAffectedEntities(
  stats: ApproverStats,
  organizationId: string
): Promise<AffectedEntity[]> {
  const entities: AffectedEntity[] = [
    {
      type: 'person',
      id: stats.approverId,
      name: stats.approverName,
      impact: 'direct',
    },
  ];

  // Get requesters waiting on this approver
  const waitingRequesters = await prisma.$queryRaw<
    Array<{ requesterId: string; requesterName: string }>
  >`
    SELECT DISTINCT
      a."requesterId",
      p.name as "requesterName"
    FROM "ApprovalRequest" a
    JOIN "Person" p ON a."requesterId" = p.id
    WHERE a."approverId" = ${stats.approverId}
      AND a.status = 'pending'
    LIMIT 5
  `.catch(() => []);

  for (const requester of waitingRequesters) {
    entities.push({
      type: 'person',
      id: requester.requesterId,
      name: `${requester.requesterName} (waiting)`,
      impact: 'indirect',
    });
  }

  return entities;
}

function generateSuggestedActions(
  stats: ApproverStats,
  config: ApprovalBottleneckConfig
): string[] {
  const actions: string[] = [];

  if (stats.overdueCount > 0) {
    actions.push('Send urgent reminder for overdue approvals');
    actions.push('Escalate overdue items to backup approver');
  }

  if (stats.pendingCount >= config.pendingApprovalThreshold) {
    actions.push('Review pending approval queue');
    actions.push('Consider delegating approvals temporarily');
  }

  if (stats.avgApprovalTimeMinutes > config.avgApprovalTimeThreshold) {
    actions.push('Set up automatic reminders');
    actions.push('Review if approver has too many responsibilities');
  }

  // General suggestions
  actions.push('Configure backup approvers');
  actions.push('Consider approval automation for routine items');

  return actions;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

// =============================================================================
// Advanced Analysis
// =============================================================================

/**
 * Get pending approvals for an approver
 */
export async function getPendingApprovals(
  organizationId: string,
  approverId: string
): Promise<PendingApproval[]> {
  const now = new Date();

  const approvals = await prisma.$queryRaw<
    Array<{
      id: string;
      type: string;
      requestedAt: Date;
      requesterId: string;
      requesterName: string;
      processInstanceId: string | null;
      processName: string | null;
      priority: string;
    }>
  >`
    SELECT
      a.id,
      a.type,
      a."requestedAt",
      a."requesterId",
      p.name as "requesterName",
      a."processInstanceId",
      pr.name as "processName",
      COALESCE(a.priority, 'normal') as priority
    FROM "ApprovalRequest" a
    JOIN "Person" p ON a."requesterId" = p.id
    LEFT JOIN "ProcessInstance" pi ON a."processInstanceId" = pi.id
    LEFT JOIN "Process" pr ON pi."processId" = pr.id
    WHERE a."approverId" = ${approverId}
      AND a."organizationId" = ${organizationId}
      AND a.status = 'pending'
    ORDER BY
      CASE a.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        ELSE 3
      END,
      a."requestedAt" ASC
  `.catch(() => []);

  return approvals.map((a) => ({
    id: a.id,
    type: a.type,
    requestedAt: a.requestedAt,
    approverId,
    approverName: '', // Would need to join
    processInstanceId: a.processInstanceId || undefined,
    processName: a.processName || undefined,
    requesterId: a.requesterId,
    requesterName: a.requesterName,
    waitingMinutes: Math.floor(
      (now.getTime() - a.requestedAt.getTime()) / (60 * 1000)
    ),
    priority: a.priority as PendingApproval['priority'],
  }));
}

/**
 * Get approval queue summary for organization
 */
export async function getApprovalQueueSummary(
  organizationId: string
): Promise<{
  totalPending: number;
  totalOverdue: number;
  byPriority: Record<string, number>;
  topBottlenecks: Array<{ approverId: string; approverName: string; count: number }>;
}> {
  const stats = await getApproverStatistics(organizationId, DEFAULT_CONFIG);

  const totalPending = stats.reduce((sum, s) => sum + s.pendingCount, 0);
  const totalOverdue = stats.reduce((sum, s) => sum + s.overdueCount, 0);

  const topBottlenecks = stats
    .filter((s) => s.pendingCount > 0)
    .sort((a, b) => b.pendingCount - a.pendingCount)
    .slice(0, 5)
    .map((s) => ({
      approverId: s.approverId,
      approverName: s.approverName,
      count: s.pendingCount,
    }));

  return {
    totalPending,
    totalOverdue,
    byPriority: {}, // Would need additional query
    topBottlenecks,
  };
}

// =============================================================================
// Register Detector
// =============================================================================

registerDetector({
  patternType: 'approval_bottleneck',
  detect: (organizationId, timeWindowMinutes) =>
    detectApprovalBottlenecks(organizationId, timeWindowMinutes),
});

export default {
  detectApprovalBottlenecks,
  getPendingApprovals,
  getApprovalQueueSummary,
  DEFAULT_CONFIG,
};
