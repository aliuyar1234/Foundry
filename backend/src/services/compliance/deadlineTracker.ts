/**
 * Deadline Tracker Service
 * T175-T177 - Deadline tracking and monitoring
 *
 * Tracks compliance deadlines and sends alerts
 */

import { prisma } from '../../lib/prisma.js';
import type {
  ComplianceDeadline,
  ComplianceFramework,
} from 'shared/types/compliance.js';

// =============================================================================
// Types
// =============================================================================

export interface DeadlineAlert {
  id: string;
  deadlineId: string;
  deadlineTitle: string;
  alertType: 'upcoming' | 'due_soon' | 'overdue';
  dueDate: Date;
  daysRemaining: number;
  assignedTo?: string;
  notifiedAt?: Date;
  acknowledged: boolean;
}

export interface DeadlineSchedule {
  upcoming: ComplianceDeadline[];
  dueSoon: ComplianceDeadline[];
  overdue: ComplianceDeadline[];
  completed: ComplianceDeadline[];
}

export interface DeadlineStatistics {
  total: number;
  upcoming: number;
  dueSoon: number;
  overdue: number;
  completed: number;
  byFramework: Record<ComplianceFramework, number>;
  completionRate: number;
}

// =============================================================================
// Deadline Management
// =============================================================================

/**
 * Create a compliance deadline
 */
export async function createDeadline(
  deadline: Omit<ComplianceDeadline, 'id' | 'createdAt' | 'status'>
): Promise<ComplianceDeadline> {
  const status = calculateDeadlineStatus(new Date(deadline.dueDate));

  const created = await prisma.complianceDeadline.create({
    data: {
      title: deadline.title,
      description: deadline.description,
      framework: deadline.framework,
      dueDate: deadline.dueDate,
      isRecurring: deadline.isRecurring,
      recurrencePattern: deadline.recurrencePattern,
      status,
      assignedTo: deadline.assignedTo,
      relatedRuleIds: deadline.relatedRuleIds,
      organizationId: deadline.organizationId,
    },
  });

  return created as unknown as ComplianceDeadline;
}

/**
 * Update deadline
 */
export async function updateDeadline(
  deadlineId: string,
  updates: Partial<Omit<ComplianceDeadline, 'id' | 'createdAt' | 'organizationId'>>
): Promise<ComplianceDeadline> {
  const data: Record<string, unknown> = { ...updates };

  // Recalculate status if due date changed
  if (updates.dueDate) {
    data.status = calculateDeadlineStatus(new Date(updates.dueDate));
  }

  const updated = await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data,
  });

  return updated as unknown as ComplianceDeadline;
}

/**
 * Complete a deadline
 */
export async function completeDeadline(deadlineId: string): Promise<ComplianceDeadline> {
  const deadline = await prisma.complianceDeadline.findUnique({
    where: { id: deadlineId },
  });

  if (!deadline) {
    throw new Error('Deadline not found');
  }

  // If recurring, create next occurrence
  if (deadline.isRecurring && deadline.recurrencePattern) {
    await createNextRecurrence(deadline as unknown as ComplianceDeadline);
  }

  const updated = await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data: { status: 'completed' },
  });

  return updated as unknown as ComplianceDeadline;
}

/**
 * Delete deadline
 */
export async function deleteDeadline(deadlineId: string): Promise<void> {
  await prisma.complianceDeadline.delete({
    where: { id: deadlineId },
  });
}

/**
 * Get deadlines by query
 */
export async function getDeadlines(
  organizationId: string,
  options: {
    status?: string | string[];
    framework?: ComplianceFramework;
    assignedTo?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ deadlines: ComplianceDeadline[]; total: number }> {
  const where: Record<string, unknown> = { organizationId };

  if (options.status) {
    where.status = Array.isArray(options.status)
      ? { in: options.status }
      : options.status;
  }

  if (options.framework) {
    where.framework = options.framework;
  }

  if (options.assignedTo) {
    where.assignedTo = options.assignedTo;
  }

  if (options.startDate || options.endDate) {
    where.dueDate = {};
    if (options.startDate) {
      (where.dueDate as Record<string, unknown>).gte = options.startDate;
    }
    if (options.endDate) {
      (where.dueDate as Record<string, unknown>).lte = options.endDate;
    }
  }

  const [deadlines, total] = await Promise.all([
    prisma.complianceDeadline.findMany({
      where,
      take: options.limit || 50,
      skip: options.offset || 0,
      orderBy: { dueDate: 'asc' },
    }),
    prisma.complianceDeadline.count({ where }),
  ]);

  return {
    deadlines: deadlines as unknown as ComplianceDeadline[],
    total,
  };
}

/**
 * Get deadline schedule overview
 */
export async function getDeadlineSchedule(
  organizationId: string
): Promise<DeadlineSchedule> {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const deadlines = await prisma.complianceDeadline.findMany({
    where: { organizationId },
    orderBy: { dueDate: 'asc' },
  });

  const schedule: DeadlineSchedule = {
    upcoming: [],
    dueSoon: [],
    overdue: [],
    completed: [],
  };

  for (const deadline of deadlines) {
    const d = deadline as unknown as ComplianceDeadline;
    const dueDate = new Date(d.dueDate);

    if (d.status === 'completed') {
      schedule.completed.push(d);
    } else if (dueDate < now) {
      schedule.overdue.push(d);
    } else if (dueDate <= weekFromNow) {
      schedule.dueSoon.push(d);
    } else {
      schedule.upcoming.push(d);
    }
  }

  return schedule;
}

/**
 * Get deadline statistics
 */
export async function getDeadlineStatistics(
  organizationId: string
): Promise<DeadlineStatistics> {
  const schedule = await getDeadlineSchedule(organizationId);

  const byFramework: Record<string, number> = {};
  const allDeadlines = [
    ...schedule.upcoming,
    ...schedule.dueSoon,
    ...schedule.overdue,
    ...schedule.completed,
  ];

  for (const deadline of allDeadlines) {
    const framework = deadline.framework || 'custom';
    byFramework[framework] = (byFramework[framework] || 0) + 1;
  }

  const total = allDeadlines.length;
  const completionRate =
    total > 0 ? Math.round((schedule.completed.length / total) * 100) : 100;

  return {
    total,
    upcoming: schedule.upcoming.length,
    dueSoon: schedule.dueSoon.length,
    overdue: schedule.overdue.length,
    completed: schedule.completed.length,
    byFramework: byFramework as Record<ComplianceFramework, number>,
    completionRate,
  };
}

// =============================================================================
// Alert Management
// =============================================================================

/**
 * Get deadline alerts
 */
export async function getDeadlineAlerts(
  organizationId: string,
  options: {
    unacknowledgedOnly?: boolean;
    assignedTo?: string;
  } = {}
): Promise<DeadlineAlert[]> {
  const schedule = await getDeadlineSchedule(organizationId);
  const alerts: DeadlineAlert[] = [];
  const now = new Date();

  // Process overdue deadlines
  for (const deadline of schedule.overdue) {
    if (options.assignedTo && deadline.assignedTo !== options.assignedTo) {
      continue;
    }

    const daysRemaining = Math.floor(
      (new Date(deadline.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    alerts.push({
      id: `alert-${deadline.id}-overdue`,
      deadlineId: deadline.id,
      deadlineTitle: deadline.title,
      alertType: 'overdue',
      dueDate: new Date(deadline.dueDate),
      daysRemaining,
      assignedTo: deadline.assignedTo,
      acknowledged: false,
    });
  }

  // Process due soon deadlines
  for (const deadline of schedule.dueSoon) {
    if (options.assignedTo && deadline.assignedTo !== options.assignedTo) {
      continue;
    }

    const daysRemaining = Math.floor(
      (new Date(deadline.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    alerts.push({
      id: `alert-${deadline.id}-due-soon`,
      deadlineId: deadline.id,
      deadlineTitle: deadline.title,
      alertType: 'due_soon',
      dueDate: new Date(deadline.dueDate),
      daysRemaining,
      assignedTo: deadline.assignedTo,
      acknowledged: false,
    });
  }

  // Sort by days remaining (most urgent first)
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return alerts;
}

/**
 * Update deadline statuses (for scheduled job)
 */
export async function updateDeadlineStatuses(
  organizationId: string
): Promise<{ updated: number }> {
  const deadlines = await prisma.complianceDeadline.findMany({
    where: {
      organizationId,
      status: { not: 'completed' },
    },
  });

  let updated = 0;

  for (const deadline of deadlines) {
    const newStatus = calculateDeadlineStatus(new Date(deadline.dueDate));

    if (newStatus !== deadline.status) {
      await prisma.complianceDeadline.update({
        where: { id: deadline.id },
        data: { status: newStatus },
      });
      updated++;
    }
  }

  return { updated };
}

/**
 * Send deadline notifications (T177)
 */
export async function sendDeadlineNotifications(
  organizationId: string
): Promise<{ sent: number }> {
  const alerts = await getDeadlineAlerts(organizationId);
  let sent = 0;

  for (const alert of alerts) {
    if (alert.assignedTo) {
      // Send notification (implementation would use notification service)
      await sendNotification({
        userId: alert.assignedTo,
        type: 'compliance_deadline',
        title: `Compliance Deadline: ${alert.deadlineTitle}`,
        message: getAlertMessage(alert),
        priority: alert.alertType === 'overdue' ? 'high' : 'medium',
        data: {
          deadlineId: alert.deadlineId,
          alertType: alert.alertType,
          daysRemaining: alert.daysRemaining,
        },
      });
      sent++;
    }
  }

  return { sent };
}

// =============================================================================
// Recurring Deadlines
// =============================================================================

/**
 * Create next recurrence for a deadline
 */
async function createNextRecurrence(deadline: ComplianceDeadline): Promise<ComplianceDeadline | null> {
  if (!deadline.isRecurring || !deadline.recurrencePattern) {
    return null;
  }

  const nextDueDate = calculateNextOccurrence(
    new Date(deadline.dueDate),
    deadline.recurrencePattern
  );

  if (!nextDueDate) {
    return null;
  }

  return createDeadline({
    title: deadline.title,
    description: deadline.description,
    framework: deadline.framework,
    dueDate: nextDueDate,
    isRecurring: deadline.isRecurring,
    recurrencePattern: deadline.recurrencePattern,
    assignedTo: deadline.assignedTo,
    relatedRuleIds: deadline.relatedRuleIds,
    organizationId: deadline.organizationId,
  });
}

/**
 * Calculate next occurrence based on cron-like pattern
 */
function calculateNextOccurrence(
  currentDate: Date,
  pattern: string
): Date | null {
  // Simplified pattern parsing (real implementation would use proper cron parser)
  const patterns: Record<string, () => Date> = {
    '@weekly': () => {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 7);
      return next;
    },
    '@monthly': () => {
      const next = new Date(currentDate);
      next.setMonth(next.getMonth() + 1);
      return next;
    },
    '@quarterly': () => {
      const next = new Date(currentDate);
      next.setMonth(next.getMonth() + 3);
      return next;
    },
    '@yearly': () => {
      const next = new Date(currentDate);
      next.setFullYear(next.getFullYear() + 1);
      return next;
    },
  };

  const calculator = patterns[pattern];
  return calculator ? calculator() : null;
}

// =============================================================================
// Default Deadlines
// =============================================================================

/**
 * Get default compliance deadlines for a framework
 */
export function getDefaultDeadlines(
  framework: ComplianceFramework
): Omit<ComplianceDeadline, 'id' | 'createdAt' | 'status' | 'organizationId'>[] {
  const defaults: Record<
    ComplianceFramework,
    Omit<ComplianceDeadline, 'id' | 'createdAt' | 'status' | 'organizationId'>[]
  > = {
    GDPR: [
      {
        title: 'Annual Privacy Policy Review',
        description: 'Review and update privacy policy and notices',
        framework: 'GDPR',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
      {
        title: 'Data Processing Inventory Update',
        description: 'Update records of processing activities (Article 30)',
        framework: 'GDPR',
        dueDate: getQuarterlyDate(),
        isRecurring: true,
        recurrencePattern: '@quarterly',
        relatedRuleIds: [],
      },
      {
        title: 'DPIA Review',
        description: 'Review Data Protection Impact Assessments',
        framework: 'GDPR',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
    ],
    SOX: [
      {
        title: 'Quarterly Internal Control Testing',
        description: 'Test effectiveness of internal controls',
        framework: 'SOX',
        dueDate: getQuarterlyDate(),
        isRecurring: true,
        recurrencePattern: '@quarterly',
        relatedRuleIds: [],
      },
      {
        title: 'Annual SOX Audit Preparation',
        description: 'Prepare documentation for annual SOX audit',
        framework: 'SOX',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
      {
        title: 'Access Review Certification',
        description: 'Certify user access to financial systems',
        framework: 'SOX',
        dueDate: getQuarterlyDate(),
        isRecurring: true,
        recurrencePattern: '@quarterly',
        relatedRuleIds: [],
      },
    ],
    ISO27001: [
      {
        title: 'ISMS Management Review',
        description: 'Conduct management review of information security',
        framework: 'ISO27001',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
      {
        title: 'Risk Assessment Update',
        description: 'Review and update risk assessments',
        framework: 'ISO27001',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
      {
        title: 'Internal Audit',
        description: 'Conduct internal ISMS audit',
        framework: 'ISO27001',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
    ],
    DSGVO: [
      {
        title: 'Jährliche Datenschutzprüfung',
        description: 'Überprüfung der Datenschutzrichtlinien',
        framework: 'DSGVO',
        dueDate: getAnnualDate(),
        isRecurring: true,
        recurrencePattern: '@yearly',
        relatedRuleIds: [],
      },
    ],
    custom: [],
  };

  return defaults[framework] || [];
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateDeadlineStatus(
  dueDate: Date
): 'upcoming' | 'due_soon' | 'overdue' | 'completed' {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (dueDate < now) {
    return 'overdue';
  } else if (dueDate <= weekFromNow) {
    return 'due_soon';
  }
  return 'upcoming';
}

function getAlertMessage(alert: DeadlineAlert): string {
  switch (alert.alertType) {
    case 'overdue':
      return `The compliance deadline "${alert.deadlineTitle}" is overdue by ${Math.abs(alert.daysRemaining)} days.`;
    case 'due_soon':
      return `The compliance deadline "${alert.deadlineTitle}" is due in ${alert.daysRemaining} days.`;
    default:
      return `Upcoming compliance deadline: ${alert.deadlineTitle}`;
  }
}

async function sendNotification(_notification: {
  userId: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  data: Record<string, unknown>;
}): Promise<void> {
  // Implementation would use notification service
}

function getAnnualDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date;
}

function getQuarterlyDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  createDeadline,
  updateDeadline,
  completeDeadline,
  deleteDeadline,
  getDeadlines,
  getDeadlineSchedule,
  getDeadlineStatistics,
  getDeadlineAlerts,
  updateDeadlineStatuses,
  sendDeadlineNotifications,
  getDefaultDeadlines,
};
