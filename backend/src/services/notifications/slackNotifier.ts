/**
 * Slack Webhook Notifier
 * Sends alert notifications to Slack channels via incoming webhooks
 */

import { Alert, AlertSeverity, NotificationRecord, SubscriptionChannel } from '../alerts/alertService.js';

export interface SlackConfig {
  defaultWebhookUrl?: string;
  username?: string;
  iconEmoji?: string;
  timeout?: number;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: SlackBlock[];
  fields?: Array<{
    type: string;
    text: string;
  }>;
  accessory?: {
    type: string;
    text?: {
      type: string;
      text: string;
      emoji?: boolean;
    };
    url?: string;
  };
}

export interface SlackMessage {
  text: string;
  username?: string;
  icon_emoji?: string;
  channel?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackAttachment {
  color: string;
  fallback: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

// Severity-based colors for Slack
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#dc2626', // Red
  error: '#ea580c', // Orange
  warning: '#ca8a04', // Yellow
  info: '#2563eb', // Blue
};

const SEVERITY_EMOJIS: Record<AlertSeverity, string> = {
  critical: ':rotating_light:',
  error: ':warning:',
  warning: ':zap:',
  info: ':information_source:',
};

export class SlackNotifier {
  private config: SlackConfig;
  private timeout: number;

  constructor(config?: SlackConfig) {
    this.config = {
      defaultWebhookUrl: config?.defaultWebhookUrl || process.env.SLACK_WEBHOOK_URL,
      username: config?.username || 'Alert Bot',
      iconEmoji: config?.iconEmoji || ':bell:',
      timeout: config?.timeout || 10000,
    };
    this.timeout = this.config.timeout || 10000;
  }

  /**
   * Send alert notification to Slack
   */
  async sendAlert(
    alert: Alert,
    channel: SubscriptionChannel
  ): Promise<NotificationRecord> {
    const webhookUrl = channel.config.webhookUrl || this.config.defaultWebhookUrl;

    if (!webhookUrl) {
      return {
        channel: 'slack',
        recipient: 'unknown',
        sentAt: new Date(),
        status: 'failed',
        error: 'No webhook URL configured',
      };
    }

    try {
      const message = this.buildAlertMessage(alert, channel.config.channel);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error: ${response.status} - ${errorText}`);
      }

      return {
        channel: 'slack',
        recipient: channel.config.channel || webhookUrl,
        sentAt: new Date(),
        status: 'sent',
      };
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      return {
        channel: 'slack',
        recipient: channel.config.channel || webhookUrl,
        sentAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send digest notification to Slack
   */
  async sendDigest(
    alerts: Alert[],
    webhookUrl: string,
    period: string,
    slackChannel?: string
  ): Promise<NotificationRecord> {
    try {
      const message = this.buildDigestMessage(alerts, period, slackChannel);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error: ${response.status} - ${errorText}`);
      }

      return {
        channel: 'slack',
        recipient: slackChannel || webhookUrl,
        sentAt: new Date(),
        status: 'sent',
      };
    } catch (error) {
      console.error('Failed to send Slack digest:', error);
      return {
        channel: 'slack',
        recipient: slackChannel || webhookUrl,
        sentAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build Slack message for a single alert
   */
  private buildAlertMessage(alert: Alert, slackChannel?: string): SlackMessage {
    const severityEmoji = SEVERITY_EMOJIS[alert.severity];
    const severityColor = SEVERITY_COLORS[alert.severity];

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} ${alert.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: alert.message,
        },
      },
    ];

    // Add entity info if available
    if (alert.entityName) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Affected:*\n${alert.entityName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${alert.entityType}`,
          },
        ],
      });
    }

    // Add recommended actions if available
    const actions = (alert.metadata as Record<string, unknown>)?.recommendedActions as string[] | undefined;
    if (actions && actions.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Recommended Actions:*\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
        },
      });
    }

    // Add action button if URL available
    if (alert.actionUrl) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ' ',
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Details',
            emoji: true,
          },
          url: alert.actionUrl,
        },
      });
    }

    // Add context
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Alert ID: ${alert.id} | Severity: ${alert.severity.toUpperCase()} | ${new Date(alert.createdAt).toISOString()}`,
        },
      ],
    });

    return {
      text: `${severityEmoji} ${alert.severity.toUpperCase()}: ${alert.title}`,
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      channel: slackChannel,
      blocks,
      attachments: [
        {
          color: severityColor,
          fallback: `${alert.severity.toUpperCase()}: ${alert.title}`,
        },
      ],
    };
  }

  /**
   * Build Slack message for digest
   */
  private buildDigestMessage(
    alerts: Alert[],
    period: string,
    slackChannel?: string
  ): SlackMessage {
    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    const errorCount = alerts.filter((a) => a.severity === 'error').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;
    const infoCount = alerts.filter((a) => a.severity === 'info').length;

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Alert Digest - ${period}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `:rotating_light: *Critical:* ${criticalCount}`,
          },
          {
            type: 'mrkdwn',
            text: `:warning: *Error:* ${errorCount}`,
          },
          {
            type: 'mrkdwn',
            text: `:zap: *Warning:* ${warningCount}`,
          },
          {
            type: 'mrkdwn',
            text: `:information_source: *Info:* ${infoCount}`,
          },
        ],
      },
      {
        type: 'divider',
      } as SlackBlock,
    ];

    // Add top alerts (limit to 10)
    const topAlerts = alerts
      .sort((a, b) => {
        const severityOrder: Record<AlertSeverity, number> = {
          critical: 0,
          error: 1,
          warning: 2,
          info: 3,
        };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 10);

    for (const alert of topAlerts) {
      const emoji = SEVERITY_EMOJIS[alert.severity];
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${alert.title}*${alert.entityName ? ` - ${alert.entityName}` : ''}`,
        },
        accessory: alert.actionUrl
          ? {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View',
                emoji: true,
              },
              url: alert.actionUrl,
            }
          : undefined,
      });
    }

    if (alerts.length > 10) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_...and ${alerts.length - 10} more alerts_`,
          },
        ],
      });
    }

    return {
      text: `Alert Digest: ${alerts.length} alerts (${criticalCount} critical) - ${period}`,
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      channel: slackChannel,
      blocks,
    };
  }
}

// Factory function
let slackNotifierInstance: SlackNotifier | null = null;

export function createSlackNotifier(config?: SlackConfig): SlackNotifier {
  if (!slackNotifierInstance) {
    slackNotifierInstance = new SlackNotifier(config);
  }
  return slackNotifierInstance;
}

export function resetSlackNotifier(): void {
  slackNotifierInstance = null;
}
