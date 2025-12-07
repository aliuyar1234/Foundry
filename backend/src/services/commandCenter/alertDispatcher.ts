/**
 * Alert Notification Dispatcher
 * T103 - Implement alert notification dispatcher
 *
 * Dispatches alert notifications through various channels
 */

import { Alert, AlertSeverity } from './alertManager';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export type NotificationChannel = 'email' | 'slack' | 'webhook' | 'in_app' | 'sms';

export interface NotificationConfig {
  organizationId: string;
  channels: ChannelConfig[];
  escalationPolicy: EscalationPolicy;
  quietHours?: QuietHoursConfig;
  digestConfig?: DigestConfig;
}

export interface ChannelConfig {
  type: NotificationChannel;
  enabled: boolean;
  config: Record<string, unknown>;
  severityFilter?: AlertSeverity[];
}

export interface EscalationPolicy {
  levels: EscalationLevel[];
  maxLevel: number;
}

export interface EscalationLevel {
  level: number;
  delayMinutes: number;
  channels: NotificationChannel[];
  recipients: string[];
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number;
  timezone: string;
  overrideForCritical: boolean;
}

export interface DigestConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxAlertsPerDigest: number;
}

export interface NotificationResult {
  alertId: string;
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  sentAt: Date;
  recipientCount?: number;
}

export interface NotificationPayload {
  alert: Alert;
  channel: NotificationChannel;
  recipients: string[];
  isDigest?: boolean;
  digestAlerts?: Alert[];
}

const NOTIFICATION_LOG_KEY = 'notifications:log:';
const DIGEST_QUEUE_KEY = 'notifications:digest:';

/**
 * Dispatch notifications for an alert
 */
export async function dispatchNotification(
  alert: Alert,
  config: NotificationConfig
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  // Check quiet hours
  if (config.quietHours?.enabled && isInQuietHours(config.quietHours)) {
    if (alert.severity !== 'critical' || !config.quietHours.overrideForCritical) {
      // Add to digest queue instead
      await queueForDigest(alert, config.organizationId);
      return [];
    }
  }

  // Check if this should be digested
  if (config.digestConfig?.enabled && alert.severity !== 'critical') {
    await queueForDigest(alert, config.organizationId);
    return [];
  }

  // Get applicable channels based on escalation level
  const escalationLevel = getEscalationLevel(alert.escalationLevel, config.escalationPolicy);
  const channels = escalationLevel?.channels || getDefaultChannels(config);

  // Dispatch to each channel
  for (const channelType of channels) {
    const channelConfig = config.channels.find(c => c.type === channelType && c.enabled);
    if (!channelConfig) continue;

    // Check severity filter
    if (channelConfig.severityFilter && !channelConfig.severityFilter.includes(alert.severity)) {
      continue;
    }

    const recipients = escalationLevel?.recipients || getDefaultRecipients(channelType, config);

    try {
      const result = await dispatchToChannel({
        alert,
        channel: channelType,
        recipients,
      });
      results.push(result);
    } catch (error) {
      results.push({
        alertId: alert.id,
        channel: channelType,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date(),
      });
    }
  }

  // Log notifications
  await logNotifications(results);

  return results;
}

/**
 * Dispatch to a specific channel
 */
async function dispatchToChannel(payload: NotificationPayload): Promise<NotificationResult> {
  const { alert, channel, recipients } = payload;

  switch (channel) {
    case 'email':
      return sendEmailNotification(alert, recipients);
    case 'slack':
      return sendSlackNotification(alert, recipients);
    case 'webhook':
      return sendWebhookNotification(alert, recipients);
    case 'in_app':
      return sendInAppNotification(alert, recipients);
    case 'sms':
      return sendSmsNotification(alert, recipients);
    default:
      throw new Error(`Unknown notification channel: ${channel}`);
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(
  alert: Alert,
  recipients: string[]
): Promise<NotificationResult> {
  const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
  const body = formatEmailBody(alert);

  // In production, integrate with email service (SendGrid, SES, etc.)
  console.log(`[Email] Sending to ${recipients.length} recipients: ${subject}`);

  // Simulate email sending
  // await emailService.send({ to: recipients, subject, body });

  return {
    alertId: alert.id,
    channel: 'email',
    success: true,
    sentAt: new Date(),
    recipientCount: recipients.length,
  };
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(
  alert: Alert,
  channels: string[]
): Promise<NotificationResult> {
  const message = formatSlackMessage(alert);

  // In production, use Slack API
  console.log(`[Slack] Sending to ${channels.length} channels`);

  // await slackClient.chat.postMessage({ channel, blocks: message });

  return {
    alertId: alert.id,
    channel: 'slack',
    success: true,
    sentAt: new Date(),
    recipientCount: channels.length,
  };
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(
  alert: Alert,
  webhookUrls: string[]
): Promise<NotificationResult> {
  const payload = formatWebhookPayload(alert);

  // Send to each webhook URL
  for (const url of webhookUrls) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error(`Webhook delivery failed to ${url}:`, error);
    }
  }

  return {
    alertId: alert.id,
    channel: 'webhook',
    success: true,
    sentAt: new Date(),
    recipientCount: webhookUrls.length,
  };
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(
  alert: Alert,
  userIds: string[]
): Promise<NotificationResult> {
  // Store notification in Redis for real-time delivery
  const notification = {
    id: `notif-${Date.now()}`,
    type: 'alert',
    alertId: alert.id,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    createdAt: new Date(),
    read: false,
  };

  for (const userId of userIds) {
    await redis.lpush(
      `notifications:user:${userId}`,
      JSON.stringify(notification)
    );
    await redis.ltrim(`notifications:user:${userId}`, 0, 99); // Keep last 100

    // Publish for real-time delivery
    await redis.publish(`notifications:${userId}`, JSON.stringify(notification));
  }

  return {
    alertId: alert.id,
    channel: 'in_app',
    success: true,
    sentAt: new Date(),
    recipientCount: userIds.length,
  };
}

/**
 * Send SMS notification
 */
async function sendSmsNotification(
  alert: Alert,
  phoneNumbers: string[]
): Promise<NotificationResult> {
  const message = formatSmsMessage(alert);

  // In production, use SMS service (Twilio, etc.)
  console.log(`[SMS] Sending to ${phoneNumbers.length} numbers: ${message}`);

  return {
    alertId: alert.id,
    channel: 'sms',
    success: true,
    sentAt: new Date(),
    recipientCount: phoneNumbers.length,
  };
}

/**
 * Queue alert for digest
 */
async function queueForDigest(alert: Alert, organizationId: string): Promise<void> {
  const key = `${DIGEST_QUEUE_KEY}${organizationId}`;
  await redis.rpush(key, JSON.stringify(alert));
}

/**
 * Send digest notifications
 */
export async function sendDigest(
  organizationId: string,
  config: NotificationConfig
): Promise<NotificationResult[]> {
  const key = `${DIGEST_QUEUE_KEY}${organizationId}`;

  // Get all queued alerts
  const alertStrings = await redis.lrange(key, 0, -1);
  if (alertStrings.length === 0) return [];

  const alerts = alertStrings.map(s => JSON.parse(s) as Alert);

  // Clear the queue
  await redis.del(key);

  // Limit alerts in digest
  const maxAlerts = config.digestConfig?.maxAlertsPerDigest || 20;
  const digestAlerts = alerts.slice(0, maxAlerts);

  const results: NotificationResult[] = [];

  // Send digest to each enabled channel
  for (const channelConfig of config.channels) {
    if (!channelConfig.enabled) continue;

    try {
      const result = await dispatchDigest(digestAlerts, channelConfig.type, config);
      results.push(result);
    } catch (error) {
      results.push({
        alertId: 'digest',
        channel: channelConfig.type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date(),
      });
    }
  }

  return results;
}

/**
 * Dispatch digest to a channel
 */
async function dispatchDigest(
  alerts: Alert[],
  channel: NotificationChannel,
  config: NotificationConfig
): Promise<NotificationResult> {
  const recipients = getDefaultRecipients(channel, config);

  switch (channel) {
    case 'email':
      return sendEmailDigest(alerts, recipients);
    case 'slack':
      return sendSlackDigest(alerts, recipients);
    default:
      return {
        alertId: 'digest',
        channel,
        success: false,
        error: `Digest not supported for channel: ${channel}`,
        sentAt: new Date(),
      };
  }
}

/**
 * Send email digest
 */
async function sendEmailDigest(
  alerts: Alert[],
  recipients: string[]
): Promise<NotificationResult> {
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const errorCount = alerts.filter(a => a.severity === 'error').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  const subject = `Alert Digest: ${criticalCount} critical, ${errorCount} errors, ${warningCount} warnings`;

  console.log(`[Email Digest] Sending to ${recipients.length} recipients: ${subject}`);

  return {
    alertId: 'digest',
    channel: 'email',
    success: true,
    sentAt: new Date(),
    recipientCount: recipients.length,
  };
}

/**
 * Send Slack digest
 */
async function sendSlackDigest(
  alerts: Alert[],
  channels: string[]
): Promise<NotificationResult> {
  console.log(`[Slack Digest] Sending ${alerts.length} alerts to ${channels.length} channels`);

  return {
    alertId: 'digest',
    channel: 'slack',
    success: true,
    sentAt: new Date(),
    recipientCount: channels.length,
  };
}

// Formatting functions

function formatEmailBody(alert: Alert): string {
  return `
Alert: ${alert.title}
Severity: ${alert.severity.toUpperCase()}
Category: ${alert.category}

Description:
${alert.description}

Source: ${alert.source.name}
Created: ${new Date(alert.createdAt).toLocaleString()}

Impact:
- Business Impact: ${alert.impact.businessImpact}
- Affected Users: ${alert.impact.affectedUsers}
- Affected Processes: ${alert.impact.affectedProcesses}
${alert.impact.slaRisk ? '⚠️ SLA AT RISK' : ''}

---
View alert details in the Command Center
  `.trim();
}

function formatSlackMessage(alert: Alert): Record<string, unknown>[] {
  const severityEmoji = {
    critical: '🚨',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${severityEmoji[alert.severity]} ${alert.title}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Severity:*\n${alert.severity}` },
        { type: 'mrkdwn', text: `*Category:*\n${alert.category}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: alert.description,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Details' },
          action_id: `view_alert_${alert.id}`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Acknowledge' },
          action_id: `ack_alert_${alert.id}`,
        },
      ],
    },
  ];
}

function formatWebhookPayload(alert: Alert): Record<string, unknown> {
  return {
    event: 'alert.created',
    timestamp: new Date().toISOString(),
    alert: {
      id: alert.id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      category: alert.category,
      status: alert.status,
      source: alert.source,
      impact: alert.impact,
      createdAt: alert.createdAt,
    },
  };
}

function formatSmsMessage(alert: Alert): string {
  const severityPrefix = alert.severity === 'critical' ? 'CRITICAL: ' : '';
  return `${severityPrefix}${alert.title}. ${alert.description.substring(0, 100)}...`;
}

// Helper functions

function isInQuietHours(config: QuietHoursConfig): boolean {
  const now = new Date();
  // Simple implementation - would need proper timezone handling in production
  const currentHour = now.getHours();

  if (config.startHour < config.endHour) {
    return currentHour >= config.startHour && currentHour < config.endHour;
  } else {
    // Overnight quiet hours (e.g., 22:00 to 06:00)
    return currentHour >= config.startHour || currentHour < config.endHour;
  }
}

function getEscalationLevel(
  level: number,
  policy: EscalationPolicy
): EscalationLevel | undefined {
  return policy.levels.find(l => l.level === Math.min(level, policy.maxLevel));
}

function getDefaultChannels(config: NotificationConfig): NotificationChannel[] {
  return config.channels
    .filter(c => c.enabled)
    .map(c => c.type);
}

function getDefaultRecipients(
  channel: NotificationChannel,
  config: NotificationConfig
): string[] {
  const channelConfig = config.channels.find(c => c.type === channel);
  if (!channelConfig) return [];

  return (channelConfig.config.recipients as string[]) || [];
}

async function logNotifications(results: NotificationResult[]): Promise<void> {
  for (const result of results) {
    const key = `${NOTIFICATION_LOG_KEY}${result.alertId}`;
    await redis.rpush(key, JSON.stringify(result));
    await redis.expire(key, 86400 * 7); // Keep for 7 days
  }
}

/**
 * Get notification history for an alert
 */
export async function getNotificationHistory(
  alertId: string
): Promise<NotificationResult[]> {
  const key = `${NOTIFICATION_LOG_KEY}${alertId}`;
  const results = await redis.lrange(key, 0, -1);
  return results.map(r => JSON.parse(r));
}

/**
 * Get in-app notifications for a user
 */
export async function getUserNotifications(
  userId: string,
  limit: number = 20
): Promise<unknown[]> {
  const notifications = await redis.lrange(
    `notifications:user:${userId}`,
    0,
    limit - 1
  );
  return notifications.map(n => JSON.parse(n));
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const key = `notifications:user:${userId}`;
  const notifications = await redis.lrange(key, 0, -1);

  const updated = notifications.map(n => {
    const notification = JSON.parse(n);
    if (notification.id === notificationId) {
      notification.read = true;
    }
    return JSON.stringify(notification);
  });

  // Replace the list
  await redis.del(key);
  if (updated.length > 0) {
    await redis.rpush(key, ...updated);
  }
}

export default {
  dispatchNotification,
  sendDigest,
  getNotificationHistory,
  getUserNotifications,
  markNotificationRead,
};
