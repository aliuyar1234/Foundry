/**
 * Microsoft Teams Webhook Notifier
 * Sends alert notifications to Microsoft Teams channels via incoming webhooks
 */

import { Alert, AlertSeverity, NotificationRecord, SubscriptionChannel } from '../alerts/alertService.js';

export interface TeamsConfig {
  defaultWebhookUrl?: string;
  timeout?: number;
}

export interface TeamsAdaptiveCard {
  type: 'AdaptiveCard';
  $schema: string;
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
}

export interface AdaptiveCardElement {
  type: string;
  text?: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  spacing?: string;
  separator?: boolean;
  columns?: AdaptiveCardColumn[];
  items?: AdaptiveCardElement[];
  facts?: Array<{ title: string; value: string }>;
  style?: string;
  horizontalAlignment?: string;
}

export interface AdaptiveCardColumn {
  type: 'Column';
  width: string;
  items: AdaptiveCardElement[];
}

export interface AdaptiveCardAction {
  type: string;
  title: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface TeamsMessage {
  type: 'message';
  attachments: Array<{
    contentType: string;
    contentUrl: null;
    content: TeamsAdaptiveCard;
  }>;
}

// Severity-based colors for Teams (Adaptive Card color names)
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: 'attention', // Red
  error: 'warning', // Orange/Yellow
  warning: 'warning',
  info: 'accent', // Blue
};

const SEVERITY_ICONS: Record<AlertSeverity, string> = {
  critical: '🚨',
  error: '⚠️',
  warning: '⚡',
  info: 'ℹ️',
};

export class TeamsNotifier {
  private config: TeamsConfig;
  private timeout: number;

  constructor(config?: TeamsConfig) {
    this.config = {
      defaultWebhookUrl: config?.defaultWebhookUrl || process.env.TEAMS_WEBHOOK_URL,
      timeout: config?.timeout || 10000,
    };
    this.timeout = this.config.timeout || 10000;
  }

  /**
   * Send alert notification to Microsoft Teams
   */
  async sendAlert(
    alert: Alert,
    channel: SubscriptionChannel
  ): Promise<NotificationRecord> {
    const webhookUrl = channel.config.teamsWebhookUrl || this.config.defaultWebhookUrl;

    if (!webhookUrl) {
      return {
        channel: 'teams',
        recipient: 'unknown',
        sentAt: new Date(),
        status: 'failed',
        error: 'No webhook URL configured',
      };
    }

    try {
      const message = this.buildAlertMessage(alert);

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
        throw new Error(`Teams API error: ${response.status} - ${errorText}`);
      }

      return {
        channel: 'teams',
        recipient: webhookUrl,
        sentAt: new Date(),
        status: 'sent',
      };
    } catch (error) {
      console.error('Failed to send Teams notification:', error);
      return {
        channel: 'teams',
        recipient: webhookUrl,
        sentAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send digest notification to Microsoft Teams
   */
  async sendDigest(
    alerts: Alert[],
    webhookUrl: string,
    period: string
  ): Promise<NotificationRecord> {
    try {
      const message = this.buildDigestMessage(alerts, period);

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
        throw new Error(`Teams API error: ${response.status} - ${errorText}`);
      }

      return {
        channel: 'teams',
        recipient: webhookUrl,
        sentAt: new Date(),
        status: 'sent',
      };
    } catch (error) {
      console.error('Failed to send Teams digest:', error);
      return {
        channel: 'teams',
        recipient: webhookUrl,
        sentAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build Teams Adaptive Card message for a single alert
   */
  private buildAlertMessage(alert: Alert): TeamsMessage {
    const severityColor = SEVERITY_COLORS[alert.severity];
    const severityIcon = SEVERITY_ICONS[alert.severity];

    const body: AdaptiveCardElement[] = [
      // Header
      {
        type: 'TextBlock',
        text: `${severityIcon} ${alert.title}`,
        size: 'Large',
        weight: 'Bolder',
        wrap: true,
      },
      // Severity badge
      {
        type: 'TextBlock',
        text: alert.severity.toUpperCase(),
        color: severityColor,
        size: 'Small',
        weight: 'Bolder',
      },
      // Message
      {
        type: 'TextBlock',
        text: alert.message,
        wrap: true,
        spacing: 'Medium',
      },
    ];

    // Add entity info if available
    if (alert.entityName) {
      body.push({
        type: 'FactSet',
        facts: [
          {
            title: 'Affected',
            value: alert.entityName,
          },
          {
            title: 'Type',
            value: alert.entityType,
          },
        ],
        spacing: 'Medium',
      });
    }

    // Add recommended actions if available
    const actions = (alert.metadata as Record<string, unknown>)?.recommendedActions as string[] | undefined;
    if (actions && actions.length > 0) {
      body.push({
        type: 'TextBlock',
        text: '**Recommended Actions:**',
        spacing: 'Medium',
        wrap: true,
      });

      body.push({
        type: 'TextBlock',
        text: actions.map((a, i) => `${i + 1}. ${a}`).join('\n'),
        wrap: true,
      });
    }

    // Add footer
    body.push({
      type: 'TextBlock',
      text: `Alert ID: ${alert.id} | ${new Date(alert.createdAt).toISOString()}`,
      size: 'Small',
      color: 'light',
      spacing: 'Large',
      separator: true,
    });

    const cardActions: AdaptiveCardAction[] = [];
    if (alert.actionUrl) {
      cardActions.push({
        type: 'Action.OpenUrl',
        title: 'View Details',
        url: alert.actionUrl,
      });
    }

    const card: TeamsAdaptiveCard = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body,
      actions: cardActions.length > 0 ? cardActions : undefined,
    };

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        },
      ],
    };
  }

  /**
   * Build Teams Adaptive Card message for digest
   */
  private buildDigestMessage(alerts: Alert[], period: string): TeamsMessage {
    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    const errorCount = alerts.filter((a) => a.severity === 'error').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;
    const infoCount = alerts.filter((a) => a.severity === 'info').length;

    const body: AdaptiveCardElement[] = [
      // Header
      {
        type: 'TextBlock',
        text: `📊 Alert Digest - ${period}`,
        size: 'Large',
        weight: 'Bolder',
        wrap: true,
      },
      // Summary
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: '🚨 Critical',
                size: 'Small',
              },
              {
                type: 'TextBlock',
                text: criticalCount.toString(),
                size: 'ExtraLarge',
                weight: 'Bolder',
                color: 'attention',
              },
            ],
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: '⚠️ Error',
                size: 'Small',
              },
              {
                type: 'TextBlock',
                text: errorCount.toString(),
                size: 'ExtraLarge',
                weight: 'Bolder',
                color: 'warning',
              },
            ],
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: '⚡ Warning',
                size: 'Small',
              },
              {
                type: 'TextBlock',
                text: warningCount.toString(),
                size: 'ExtraLarge',
                weight: 'Bolder',
              },
            ],
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: 'ℹ️ Info',
                size: 'Small',
              },
              {
                type: 'TextBlock',
                text: infoCount.toString(),
                size: 'ExtraLarge',
                weight: 'Bolder',
                color: 'accent',
              },
            ],
          },
        ],
        spacing: 'Medium',
      },
    ];

    // Add top alerts (limit to 5)
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
      .slice(0, 5);

    if (topAlerts.length > 0) {
      body.push({
        type: 'TextBlock',
        text: '**Top Alerts:**',
        spacing: 'Large',
        separator: true,
      });

      for (const alert of topAlerts) {
        const icon = SEVERITY_ICONS[alert.severity];
        body.push({
          type: 'TextBlock',
          text: `${icon} **${alert.title}**${alert.entityName ? ` - ${alert.entityName}` : ''}`,
          wrap: true,
          spacing: 'Small',
        });
      }

      if (alerts.length > 5) {
        body.push({
          type: 'TextBlock',
          text: `_...and ${alerts.length - 5} more alerts_`,
          size: 'Small',
          color: 'light',
          spacing: 'Small',
        });
      }
    }

    const card: TeamsAdaptiveCard = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body,
    };

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        },
      ],
    };
  }
}

// Factory function
let teamsNotifierInstance: TeamsNotifier | null = null;

export function createTeamsNotifier(config?: TeamsConfig): TeamsNotifier {
  if (!teamsNotifierInstance) {
    teamsNotifierInstance = new TeamsNotifier(config);
  }
  return teamsNotifierInstance;
}

export function resetTeamsNotifier(): void {
  teamsNotifierInstance = null;
}
