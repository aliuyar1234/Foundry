/**
 * Docuware Approval Chain Extractor
 * Task: T166
 * Extracts approval chains and decision tracking
 */

import { DocuwareClient, DocuwareApproval, DocuwareApprover } from '../docuwareClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ApprovalExtractionOptions {
  organizationId: string;
  cabinetId: string;
  documentIds?: number[];
  includeDecisions?: boolean;
}

export interface ApprovalExtractionResult {
  events: ExtractedEvent[];
  stats: {
    totalApprovals: number;
    pending: number;
    approved: number;
    rejected: number;
    byStatus: Record<string, number>;
    averageApprovers: number;
    totalDecisions: number;
  };
}

/**
 * Determine approval status category
 */
function getApprovalStatusCategory(status: string): string {
  const statusLower = status?.toLowerCase() || '';

  if (statusLower.includes('approved') || statusLower.includes('accepted')) {
    return 'approved';
  }
  if (statusLower.includes('rejected') || statusLower.includes('declined')) {
    return 'rejected';
  }
  if (statusLower.includes('pending') || statusLower.includes('waiting')) {
    return 'pending';
  }
  if (statusLower.includes('cancelled') || statusLower.includes('withdrawn')) {
    return 'cancelled';
  }

  return 'unknown';
}

/**
 * Calculate approval chain statistics
 */
function calculateApprovalChainStats(approvers: DocuwareApprover[]): {
  totalApprovers: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  completionRate: number;
  hasRejection: boolean;
} {
  const totalApprovers = approvers.length;
  const pendingCount = approvers.filter(a => a.Decision === 'pending').length;
  const approvedCount = approvers.filter(a => a.Decision === 'approved').length;
  const rejectedCount = approvers.filter(a => a.Decision === 'rejected').length;
  const completionRate = totalApprovers > 0
    ? ((approvedCount + rejectedCount) / totalApprovers) * 100
    : 0;
  const hasRejection = rejectedCount > 0;

  return {
    totalApprovers,
    pendingCount,
    approvedCount,
    rejectedCount,
    completionRate,
    hasRejection,
  };
}

/**
 * Convert Docuware approval to ExtractedEvent
 */
export function approvalToEvent(
  approval: DocuwareApproval,
  cabinetId: string,
  organizationId: string
): ExtractedEvent {
  const timestamp = approval.CompletedAt
    ? new Date(approval.CompletedAt)
    : approval.CreatedAt
      ? new Date(approval.CreatedAt)
      : new Date();

  const statusCategory = getApprovalStatusCategory(approval.ApprovalStatus);
  const isCompleted = !!approval.CompletedAt;
  const chainStats = calculateApprovalChainStats(approval.Approvers);

  const duration = approval.CompletedAt && approval.CreatedAt
    ? new Date(approval.CompletedAt).getTime() - new Date(approval.CreatedAt).getTime()
    : null;

  return {
    externalId: `docuware-approval-${approval.Id}`,
    source: 'docuware',
    eventType: isCompleted ? 'dms.approval.completed' : 'dms.approval.pending',
    timestamp,
    data: {
      approvalId: approval.Id,
      documentId: approval.DocumentId,
      cabinetId,
      status: approval.ApprovalStatus,
      statusCategory,
      createdAt: approval.CreatedAt,
      completedAt: approval.CompletedAt,
      isCompleted,
      durationMs: duration,
      // Approval chain details
      totalApprovers: chainStats.totalApprovers,
      pendingApprovers: chainStats.pendingCount,
      approvedCount: chainStats.approvedCount,
      rejectedCount: chainStats.rejectedCount,
      completionRate: chainStats.completionRate,
      hasRejection: chainStats.hasRejection,
      // Approver details
      approvers: approval.Approvers.map(approver => ({
        userId: approver.UserId,
        userName: approver.UserName,
        decision: approver.Decision,
        decisionDate: approver.DecisionDate,
        comments: approver.Comments,
      })),
    },
    metadata: {
      organizationId,
      objectType: 'Approval',
      source: 'docuware',
    },
  };
}

/**
 * Convert approver decision to ExtractedEvent
 */
export function approverDecisionToEvent(
  approver: DocuwareApprover,
  approval: DocuwareApproval,
  cabinetId: string,
  organizationId: string
): ExtractedEvent {
  const timestamp = approver.DecisionDate
    ? new Date(approver.DecisionDate)
    : new Date();

  const eventType = approver.Decision === 'approved'
    ? 'dms.approval.approved'
    : approver.Decision === 'rejected'
      ? 'dms.approval.rejected'
      : 'dms.approval.pending';

  return {
    externalId: `docuware-decision-${approval.Id}-${approver.UserId}`,
    source: 'docuware',
    eventType,
    timestamp,
    data: {
      approvalId: approval.Id,
      documentId: approval.DocumentId,
      cabinetId,
      userId: approver.UserId,
      userName: approver.UserName,
      decision: approver.Decision,
      decisionDate: approver.DecisionDate,
      comments: approver.Comments,
      hasPendingDecision: approver.Decision === 'pending',
    },
    metadata: {
      organizationId,
      objectType: 'ApprovalDecision',
      source: 'docuware',
    },
  };
}

/**
 * Extract approvals for specific document
 */
export async function extractDocumentApprovals(
  client: DocuwareClient,
  cabinetId: string,
  documentId: number,
  organizationId: string,
  includeDecisions = true
): Promise<ExtractedEvent[]> {
  const events: ExtractedEvent[] = [];

  try {
    const approvals = await client.getDocumentApprovals(cabinetId, documentId);

    for (const approval of approvals) {
      // Create approval event
      events.push(approvalToEvent(approval, cabinetId, organizationId));

      // Create individual decision events if requested
      if (includeDecisions) {
        for (const approver of approval.Approvers) {
          if (approver.Decision && approver.Decision !== 'pending') {
            events.push(approverDecisionToEvent(approver, approval, cabinetId, organizationId));
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting approvals for document ${documentId}:`, error);
  }

  return events;
}

/**
 * Extract approvals from multiple documents
 */
export async function extractApprovals(
  client: DocuwareClient,
  options: ApprovalExtractionOptions
): Promise<ApprovalExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    totalApprovals: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    byStatus: {} as Record<string, number>,
    averageApprovers: 0,
    totalDecisions: 0,
  };

  try {
    let documentIds = options.documentIds;

    // If no document IDs provided, get recent documents
    if (!documentIds || documentIds.length === 0) {
      const docsResult = await client.getDocuments(options.cabinetId, {
        count: 100,
      });
      documentIds = docsResult.Items.map(doc => doc.Id);
    }

    let totalApprovers = 0;

    for (const documentId of documentIds) {
      const docEvents = await extractDocumentApprovals(
        client,
        options.cabinetId,
        documentId,
        options.organizationId,
        options.includeDecisions
      );

      events.push(...docEvents);

      // Update stats from approval events only
      const approvalEvents = docEvents.filter(e =>
        e.eventType === 'dms.approval.completed' || e.eventType === 'dms.approval.pending'
      );

      for (const event of approvalEvents) {
        stats.totalApprovals++;

        const statusCategory = event.data.statusCategory as string;
        if (statusCategory === 'approved') {
          stats.approved++;
        } else if (statusCategory === 'rejected') {
          stats.rejected++;
        } else if (statusCategory === 'pending') {
          stats.pending++;
        }

        const status = event.data.status as string;
        if (status) {
          stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        }

        totalApprovers += event.data.totalApprovers as number || 0;
      }

      // Count decision events
      const decisionEvents = docEvents.filter(e =>
        e.eventType === 'dms.approval.approved' || e.eventType === 'dms.approval.rejected'
      );
      stats.totalDecisions += decisionEvents.length;
    }

    stats.averageApprovers = stats.totalApprovals > 0
      ? totalApprovers / stats.totalApprovals
      : 0;

  } catch (error) {
    console.error('Error extracting approvals:', error);
    // Don't throw error as approvals might not be available
    console.warn('Approvals feature may not be available in this Docuware installation');
  }

  return { events, stats };
}

/**
 * Calculate approval statistics from extracted events
 */
export function calculateApprovalStats(events: ExtractedEvent[]): {
  approvalEvents: number;
  decisionEvents: number;
  approvalRate: number;
  rejectionRate: number;
  averageDuration: number;
  byUser: Record<string, { approved: number; rejected: number; pending: number }>;
  fastestApproval: number;
  slowestApproval: number;
} {
  const approvalEvents = events.filter(e =>
    e.eventType === 'dms.approval.completed' || e.eventType === 'dms.approval.pending'
  ).length;

  const decisionEvents = events.filter(e =>
    e.eventType === 'dms.approval.approved' || e.eventType === 'dms.approval.rejected'
  );

  const completedApprovals = events.filter(e => e.data.isCompleted);
  const approvedCount = events.filter(e => e.data.statusCategory === 'approved').length;
  const rejectedCount = events.filter(e => e.data.statusCategory === 'rejected').length;

  const approvalRate = completedApprovals.length > 0
    ? (approvedCount / completedApprovals.length) * 100
    : 0;

  const rejectionRate = completedApprovals.length > 0
    ? (rejectedCount / completedApprovals.length) * 100
    : 0;

  const durations = completedApprovals
    .filter(e => e.data.durationMs)
    .map(e => e.data.durationMs as number);

  const averageDuration = durations.length > 0
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : 0;

  const fastestApproval = durations.length > 0 ? Math.min(...durations) : 0;
  const slowestApproval = durations.length > 0 ? Math.max(...durations) : 0;

  const byUser: Record<string, { approved: number; rejected: number; pending: number }> = {};

  for (const event of decisionEvents) {
    const userId = event.data.userId as string;
    if (userId) {
      if (!byUser[userId]) {
        byUser[userId] = { approved: 0, rejected: 0, pending: 0 };
      }

      if (event.eventType === 'dms.approval.approved') {
        byUser[userId].approved++;
      } else if (event.eventType === 'dms.approval.rejected') {
        byUser[userId].rejected++;
      } else {
        byUser[userId].pending++;
      }
    }
  }

  return {
    approvalEvents,
    decisionEvents: decisionEvents.length,
    approvalRate,
    rejectionRate,
    averageDuration,
    byUser,
    fastestApproval,
    slowestApproval,
  };
}
