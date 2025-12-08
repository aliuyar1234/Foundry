/**
 * Manager Notification Service
 * T216 - Notify managers about team workload concerns
 *
 * Sends targeted notifications to managers about team issues
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

// =============================================================================
// Types
// =============================================================================

export interface ManagerNotification {
  id: string;
  managerId: string;
  managerName: string;
  type: NotificationType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  summary: string;
  details: NotificationDetails;
  actionRequired: boolean;
  suggestedActions: NotificationAction[];
  createdAt: Date;
  expiresAt?: Date;
  status: 'pending' | 'sent' | 'read' | 'actioned' | 'dismissed';
  sentVia: NotificationChannel[];
  readAt?: Date;
  actionedAt?: Date;
}

export type NotificationType =
  | 'team_overload'
  | 'individual_burnout_risk'
  | 'workload_imbalance'
  | 'deadline_risk'
  | 'capacity_warning'
  | 'early_warning_escalation'
  | 'weekly_summary'
  | 'resource_request'
  | 'performance_concern';

export type NotificationChannel = 'in_app' | 'email' | 'slack' | 'teams' | 'sms';

export interface NotificationDetails {
  affectedPersons?: Array<{
    personId: string;
    personName: string;
    role?: string;
    metric?: string;
    value?: number;
  }>;
  teamMetrics?: {
    averageLoad: number;
    overloadedCount: number;
    atRiskCount: number;
    balanceScore: number;
  };
  comparison?: {
    period: string;
    previousValue: number;
    currentValue: number;
    change: number;
  };
  context?: string;
  links?: Array<{ label: string; url: string }>;
}

export interface NotificationAction {
  id: string;
  label: string;
  actionType: 'view_details' | 'reassign_tasks' | 'schedule_meeting' | 'acknowledge' | 'dismiss' | 'custom';
  url?: string;
  data?: Record<string, unknown>;
}

export interface NotificationPreferences {
  managerId: string;
  enabledTypes: NotificationType[];
  channels: {
    [key in NotificationType]?: NotificationChannel[];
  };
  quietHours?: {
    start: string; // HH:mm
    end: string;
  };
  minimumPriority: 'low' | 'medium' | 'high' | 'urgent';
  digestFrequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
  escalationDelay: number; // minutes
}

export interface NotificationStats {
  managerId: string;
  period: string;
  sent: number;
  read: number;
  actioned: number;
  dismissed: number;
  avgResponseTime: number; // minutes
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

// =============================================================================
// Manager Notifier
// =============================================================================

const prisma = new PrismaClient();
const notificationEmitter = new EventEmitter();

// In-memory notification queue (would be database/queue in production)
const notificationQueue: ManagerNotification[] = [];
const notificationHistory: ManagerNotification[] = [];

// Default preferences
const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'managerId'> = {
  enabledTypes: [
    'team_overload',
    'individual_burnout_risk',
    'workload_imbalance',
    'deadline_risk',
    'capacity_warning',
    'early_warning_escalation',
    'weekly_summary',
  ],
  channels: {
    team_overload: ['in_app', 'email'],
    individual_burnout_risk: ['in_app', 'email', 'slack'],
    workload_imbalance: ['in_app'],
    deadline_risk: ['in_app', 'email'],
    capacity_warning: ['in_app'],
    early_warning_escalation: ['in_app', 'email', 'slack'],
    weekly_summary: ['email'],
  },
  quietHours: {
    start: '22:00',
    end: '07:00',
  },
  minimumPriority: 'medium',
  digestFrequency: 'immediate',
  escalationDelay: 60,
};

/**
 * Send a notification to a manager
 */
export async function notifyManager(
  managerId: string,
  notification: Omit<ManagerNotification, 'id' | 'managerId' | 'managerName' | 'createdAt' | 'status' | 'sentVia'>
): Promise<ManagerNotification> {
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
  });

  if (!manager) {
    throw new Error(`Manager not found: ${managerId}`);
  }

  const preferences = await getManagerPreferences(managerId);

  // Check if notification type is enabled
  if (!preferences.enabledTypes.includes(notification.type)) {
    throw new Error(`Notification type ${notification.type} is disabled for this manager`);
  }

  // Check minimum priority
  const priorityOrder = { low: 0, medium: 1, high: 2, urgent: 3 };
  if (priorityOrder[notification.priority] < priorityOrder[preferences.minimumPriority]) {
    throw new Error(`Notification priority ${notification.priority} is below minimum ${preferences.minimumPriority}`);
  }

  // Check quiet hours (except for urgent)
  if (notification.priority !== 'urgent' && isQuietHours(preferences.quietHours)) {
    // Queue for later
    return queueNotification(managerId, manager.name || manager.email, notification);
  }

  // Determine channels
  const channels = preferences.channels[notification.type] || ['in_app'];

  const fullNotification: ManagerNotification = {
    id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    managerId,
    managerName: manager.name || manager.email,
    ...notification,
    createdAt: new Date(),
    status: 'pending',
    sentVia: [],
  };

  // Send via each channel
  for (const channel of channels) {
    await sendViaChannel(fullNotification, channel);
    fullNotification.sentVia.push(channel);
  }

  fullNotification.status = 'sent';
  notificationHistory.push(fullNotification);

  // Emit event
  notificationEmitter.emit('notification_sent', fullNotification);

  return fullNotification;
}

/**
 * Send team overload notification
 */
export async function notifyTeamOverload(
  managerId: string,
  teamId: string,
  metrics: {
    averageLoad: number;
    overloadedCount: number;
    totalMembers: number;
  }
): Promise<ManagerNotification> {
  const overloadPercent = (metrics.overloadedCount / metrics.totalMembers) * 100;
  const priority = overloadPercent > 50 ? 'urgent' : overloadPercent > 30 ? 'high' : 'medium';

  return notifyManager(managerId, {
    type: 'team_overload',
    priority,
    title: 'Team Capacity Warning',
    summary: `${metrics.overloadedCount} of ${metrics.totalMembers} team members are over capacity`,
    details: {
      teamMetrics: {
        averageLoad: metrics.averageLoad,
        overloadedCount: metrics.overloadedCount,
        atRiskCount: 0,
        balanceScore: 0,
      },
      context: `Team average load is ${metrics.averageLoad}%`,
    },
    actionRequired: priority === 'urgent' || priority === 'high',
    suggestedActions: [
      {
        id: 'view-team',
        label: 'View Team Dashboard',
        actionType: 'view_details',
        url: `/teams/${teamId}/workload`,
      },
      {
        id: 'redistribute',
        label: 'Redistribute Tasks',
        actionType: 'reassign_tasks',
        url: `/teams/${teamId}/redistribute`,
      },
    ],
  });
}

/**
 * Send individual burnout risk notification
 */
export async function notifyBurnoutRisk(
  managerId: string,
  person: {
    personId: string;
    personName: string;
    riskScore: number;
    riskLevel: string;
    topFactors: string[];
  }
): Promise<ManagerNotification> {
  const priority = person.riskLevel === 'critical' ? 'urgent' : person.riskLevel === 'high' ? 'high' : 'medium';

  return notifyManager(managerId, {
    type: 'individual_burnout_risk',
    priority,
    title: `${person.riskLevel.charAt(0).toUpperCase() + person.riskLevel.slice(1)} Burnout Risk: ${person.personName}`,
    summary: `${person.personName} shows ${person.riskLevel} burnout risk (score: ${person.riskScore})`,
    details: {
      affectedPersons: [{
        personId: person.personId,
        personName: person.personName,
        metric: 'Burnout Risk Score',
        value: person.riskScore,
      }],
      context: `Top factors: ${person.topFactors.join(', ')}`,
    },
    actionRequired: priority === 'urgent',
    suggestedActions: [
      {
        id: 'schedule-checkin',
        label: 'Schedule 1:1 Check-in',
        actionType: 'schedule_meeting',
        data: { personId: person.personId },
      },
      {
        id: 'view-details',
        label: 'View Risk Details',
        actionType: 'view_details',
        url: `/people/${person.personId}/burnout`,
      },
      {
        id: 'redistribute',
        label: 'Redistribute Tasks',
        actionType: 'reassign_tasks',
        data: { personId: person.personId },
      },
    ],
  });
}

/**
 * Send workload imbalance notification
 */
export async function notifyWorkloadImbalance(
  managerId: string,
  teamId: string,
  imbalance: {
    overloaded: Array<{ personId: string; personName: string; load: number }>;
    underutilized: Array<{ personId: string; personName: string; load: number }>;
    balanceScore: number;
  }
): Promise<ManagerNotification> {
  const priority = imbalance.balanceScore < 50 ? 'high' : 'medium';

  return notifyManager(managerId, {
    type: 'workload_imbalance',
    priority,
    title: 'Workload Imbalance Detected',
    summary: `Team balance score: ${imbalance.balanceScore}/100 - ${imbalance.overloaded.length} overloaded, ${imbalance.underutilized.length} underutilized`,
    details: {
      affectedPersons: [
        ...imbalance.overloaded.map(p => ({
          personId: p.personId,
          personName: p.personName,
          metric: 'Overloaded',
          value: p.load,
        })),
        ...imbalance.underutilized.map(p => ({
          personId: p.personId,
          personName: p.personName,
          metric: 'Underutilized',
          value: p.load,
        })),
      ],
      teamMetrics: {
        averageLoad: 0,
        overloadedCount: imbalance.overloaded.length,
        atRiskCount: 0,
        balanceScore: imbalance.balanceScore,
      },
    },
    actionRequired: priority === 'high',
    suggestedActions: [
      {
        id: 'view-suggestions',
        label: 'View Redistribution Suggestions',
        actionType: 'view_details',
        url: `/teams/${teamId}/redistribute`,
      },
    ],
  });
}

/**
 * Send weekly summary to manager
 */
export async function sendWeeklySummary(
  managerId: string,
  teamId: string,
  summary: {
    weekOf: Date;
    avgLoad: number;
    loadChange: number;
    atRiskCount: number;
    warningsCount: number;
    resolvedIssues: number;
    highlights: string[];
  }
): Promise<ManagerNotification> {
  const trend = summary.loadChange > 5 ? 'increasing' : summary.loadChange < -5 ? 'decreasing' : 'stable';

  return notifyManager(managerId, {
    type: 'weekly_summary',
    priority: 'low',
    title: `Weekly Team Health Summary - Week of ${summary.weekOf.toLocaleDateString()}`,
    summary: `Average load: ${summary.avgLoad}% (${trend}), ${summary.atRiskCount} at risk, ${summary.warningsCount} active warnings`,
    details: {
      teamMetrics: {
        averageLoad: summary.avgLoad,
        overloadedCount: 0,
        atRiskCount: summary.atRiskCount,
        balanceScore: 0,
      },
      comparison: {
        period: 'week-over-week',
        previousValue: summary.avgLoad - summary.loadChange,
        currentValue: summary.avgLoad,
        change: summary.loadChange,
      },
      context: summary.highlights.join('\n'),
    },
    actionRequired: false,
    suggestedActions: [
      {
        id: 'view-dashboard',
        label: 'View Full Dashboard',
        actionType: 'view_details',
        url: `/teams/${teamId}/dashboard`,
      },
    ],
  });
}

/**
 * Get notifications for a manager
 */
export async function getManagerNotifications(
  managerId: string,
  options: {
    status?: ManagerNotification['status'][];
    types?: NotificationType[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  notifications: ManagerNotification[];
  total: number;
  unread: number;
}> {
  const { status, types, limit = 50, offset = 0 } = options;

  let filtered = notificationHistory.filter(n => n.managerId === managerId);

  if (status?.length) {
    filtered = filtered.filter(n => status.includes(n.status));
  }

  if (types?.length) {
    filtered = filtered.filter(n => types.includes(n.type));
  }

  const sorted = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const paginated = sorted.slice(offset, offset + limit);
  const unread = filtered.filter(n => n.status === 'sent' || n.status === 'pending').length;

  return {
    notifications: paginated,
    total: filtered.length,
    unread,
  };
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<ManagerNotification> {
  const notification = notificationHistory.find(n => n.id === notificationId);

  if (!notification) {
    throw new Error(`Notification not found: ${notificationId}`);
  }

  notification.status = 'read';
  notification.readAt = new Date();

  return notification;
}

/**
 * Mark notification as actioned
 */
export async function markAsActioned(
  notificationId: string,
  actionId: string
): Promise<ManagerNotification> {
  const notification = notificationHistory.find(n => n.id === notificationId);

  if (!notification) {
    throw new Error(`Notification not found: ${notificationId}`);
  }

  notification.status = 'actioned';
  notification.actionedAt = new Date();

  return notification;
}

/**
 * Dismiss notification
 */
export async function dismissNotification(notificationId: string): Promise<ManagerNotification> {
  const notification = notificationHistory.find(n => n.id === notificationId);

  if (!notification) {
    throw new Error(`Notification not found: ${notificationId}`);
  }

  notification.status = 'dismissed';

  return notification;
}

/**
 * Get manager notification preferences
 */
export async function getManagerPreferences(managerId: string): Promise<NotificationPreferences> {
  // In production, fetch from database
  return {
    managerId,
    ...DEFAULT_PREFERENCES,
  };
}

/**
 * Update manager notification preferences
 */
export async function updateManagerPreferences(
  managerId: string,
  updates: Partial<Omit<NotificationPreferences, 'managerId'>>
): Promise<NotificationPreferences> {
  // In production, update in database
  return {
    managerId,
    ...DEFAULT_PREFERENCES,
    ...updates,
  };
}

/**
 * Get notification statistics
 */
export async function getNotificationStats(
  managerId: string,
  periodDays: number = 30
): Promise<NotificationStats> {
  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const relevant = notificationHistory.filter(
    n => n.managerId === managerId && n.createdAt >= cutoff
  );

  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let totalResponseTime = 0;
  let respondedCount = 0;

  for (const notification of relevant) {
    byType[notification.type] = (byType[notification.type] || 0) + 1;
    byPriority[notification.priority] = (byPriority[notification.priority] || 0) + 1;

    if (notification.readAt) {
      const responseTime = notification.readAt.getTime() - notification.createdAt.getTime();
      totalResponseTime += responseTime;
      respondedCount++;
    }
  }

  return {
    managerId,
    period: `${periodDays} days`,
    sent: relevant.length,
    read: relevant.filter(n => n.readAt).length,
    actioned: relevant.filter(n => n.status === 'actioned').length,
    dismissed: relevant.filter(n => n.status === 'dismissed').length,
    avgResponseTime: respondedCount > 0 ? Math.round(totalResponseTime / respondedCount / 60000) : 0,
    byType,
    byPriority,
  };
}

/**
 * Subscribe to notification events
 */
export function onNotification(
  event: 'notification_sent' | 'notification_read' | 'notification_actioned',
  callback: (notification: ManagerNotification) => void
): () => void {
  notificationEmitter.on(event, callback);
  return () => notificationEmitter.off(event, callback);
}

// =============================================================================
// Helper Functions
// =============================================================================

function isQuietHours(quietHours?: { start: string; end: string }): boolean {
  if (!quietHours) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = quietHours.start.split(':').map(Number);
  const [endHour, endMin] = quietHours.end.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Quiet hours span midnight
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function queueNotification(
  managerId: string,
  managerName: string,
  notification: Omit<ManagerNotification, 'id' | 'managerId' | 'managerName' | 'createdAt' | 'status' | 'sentVia'>
): ManagerNotification {
  const queued: ManagerNotification = {
    id: `notification-queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    managerId,
    managerName,
    ...notification,
    createdAt: new Date(),
    status: 'pending',
    sentVia: [],
  };

  notificationQueue.push(queued);
  return queued;
}

async function sendViaChannel(
  notification: ManagerNotification,
  channel: NotificationChannel
): Promise<void> {
  // Simulate sending via different channels
  switch (channel) {
    case 'in_app':
      // Would store in database for in-app display
      console.log(`[IN-APP] Notification for ${notification.managerName}: ${notification.title}`);
      break;

    case 'email':
      // Would send email via email service
      console.log(`[EMAIL] Sending to ${notification.managerName}: ${notification.title}`);
      break;

    case 'slack':
      // Would send via Slack API
      console.log(`[SLACK] Sending to ${notification.managerName}: ${notification.title}`);
      break;

    case 'teams':
      // Would send via Teams API
      console.log(`[TEAMS] Sending to ${notification.managerName}: ${notification.title}`);
      break;

    case 'sms':
      // Would send via SMS service
      console.log(`[SMS] Sending to ${notification.managerName}: ${notification.title}`);
      break;
  }
}

// =============================================================================
// Scheduled Tasks
// =============================================================================

/**
 * Process queued notifications (called when quiet hours end)
 */
export async function processQueuedNotifications(): Promise<number> {
  const toProcess = [...notificationQueue];
  notificationQueue.length = 0;

  let processed = 0;

  for (const notification of toProcess) {
    try {
      const preferences = await getManagerPreferences(notification.managerId);
      const channels = preferences.channels[notification.type] || ['in_app'];

      for (const channel of channels) {
        await sendViaChannel(notification, channel);
        notification.sentVia.push(channel);
      }

      notification.status = 'sent';
      notificationHistory.push(notification);
      processed++;
    } catch (error) {
      console.error(`Failed to process queued notification ${notification.id}:`, error);
      // Re-queue for retry
      notificationQueue.push(notification);
    }
  }

  return processed;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  notifyManager,
  notifyTeamOverload,
  notifyBurnoutRisk,
  notifyWorkloadImbalance,
  sendWeeklySummary,
  getManagerNotifications,
  markAsRead,
  markAsActioned,
  dismissNotification,
  getManagerPreferences,
  updateManagerPreferences,
  getNotificationStats,
  onNotification,
  processQueuedNotifications,
};
