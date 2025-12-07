/**
 * Email Notification Sender
 * Sends alert notifications via email using configurable SMTP or transactional email services
 */

import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { Alert, AlertSeverity, NotificationRecord, SubscriptionChannel } from '../alerts/alertService.js';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  replyTo?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Severity-based styling
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#dc2626', // Red
  error: '#ea580c', // Orange
  warning: '#ca8a04', // Yellow
  info: '#2563eb', // Blue
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: '🚨 CRITICAL',
  error: '⚠️ ERROR',
  warning: '⚡ WARNING',
  info: 'ℹ️ INFO',
};

export class EmailNotifier {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private isInitialized = false;

  constructor(config?: Partial<EmailConfig>) {
    this.config = {
      host: config?.host || process.env.SMTP_HOST || 'smtp.example.com',
      port: config?.port || parseInt(process.env.SMTP_PORT || '587'),
      secure: config?.secure ?? (process.env.SMTP_SECURE === 'true'),
      auth: {
        user: config?.auth?.user || process.env.SMTP_USER || '',
        pass: config?.auth?.pass || process.env.SMTP_PASS || '',
      },
      from: config?.from || process.env.SMTP_FROM || 'alerts@example.com',
      replyTo: config?.replyTo || process.env.SMTP_REPLY_TO,
    };
  }

  /**
   * Initialize the email transporter
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      });

      // Verify connection
      await this.transporter.verify();
      this.isInitialized = true;
      console.info('Email notifier initialized successfully');
    } catch (error) {
      console.error('Failed to initialize email notifier:', error);
      throw error;
    }
  }

  /**
   * Send alert notification via email
   */
  async sendAlert(
    alert: Alert,
    channel: SubscriptionChannel
  ): Promise<NotificationRecord> {
    const email = channel.config.email;
    if (!email) {
      return {
        channel: 'email',
        recipient: 'unknown',
        sentAt: new Date(),
        status: 'failed',
        error: 'No email address configured',
      };
    }

    try {
      await this.initialize();

      const template = this.generateAlertEmail(alert);

      const mailOptions: SendMailOptions = {
        from: this.config.from,
        to: email,
        replyTo: this.config.replyTo,
        subject: template.subject,
        html: template.html,
        text: template.text,
        headers: {
          'X-Alert-ID': alert.id,
          'X-Alert-Type': alert.type,
          'X-Alert-Severity': alert.severity,
        },
      };

      await this.transporter!.sendMail(mailOptions);

      return {
        channel: 'email',
        recipient: email,
        sentAt: new Date(),
        status: 'sent',
      };
    } catch (error) {
      console.error('Failed to send email notification:', error);
      return {
        channel: 'email',
        recipient: email,
        sentAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send digest email with multiple alerts
   */
  async sendDigest(
    alerts: Alert[],
    email: string,
    period: string
  ): Promise<NotificationRecord> {
    try {
      await this.initialize();

      const template = this.generateDigestEmail(alerts, period);

      const mailOptions: SendMailOptions = {
        from: this.config.from,
        to: email,
        replyTo: this.config.replyTo,
        subject: template.subject,
        html: template.html,
        text: template.text,
      };

      await this.transporter!.sendMail(mailOptions);

      return {
        channel: 'email',
        recipient: email,
        sentAt: new Date(),
        status: 'sent',
      };
    } catch (error) {
      console.error('Failed to send digest email:', error);
      return {
        channel: 'email',
        recipient: email,
        sentAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate email template for single alert
   */
  private generateAlertEmail(alert: Alert): EmailTemplate {
    const severityColor = SEVERITY_COLORS[alert.severity];
    const severityLabel = SEVERITY_LABELS[alert.severity];

    const subject = `${severityLabel} - ${alert.title}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${alert.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table cellpadding="0" cellspacing="0" width="100%" style="background-color: ${severityColor}; border-radius: 8px 8px 0 0;">
          <tr>
            <td style="padding: 20px; color: white;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600;">${severityLabel}</h1>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table cellpadding="0" cellspacing="0" width="100%" style="background-color: white; border-radius: 0 0 8px 8px;">
          <tr>
            <td style="padding: 24px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111827;">${alert.title}</h2>

              ${alert.entityName ? `
              <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
                Affected: <strong>${alert.entityName}</strong> (${alert.entityType})
              </p>
              ` : ''}

              <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-line;">${alert.message}</p>
              </div>

              ${this.renderRecommendedActions(alert)}

              ${alert.actionUrl ? `
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-top: 16px;">
                    <a href="${alert.actionUrl}" style="display: inline-block; background-color: ${severityColor}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                      View Details
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Alert ID: ${alert.id}<br>
                Generated at: ${alert.createdAt.toISOString()}
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px;">
          <tr>
            <td style="text-align: center; padding: 16px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                You're receiving this because you subscribed to alerts.<br>
                <a href="#" style="color: #6b7280;">Manage notification preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `
${severityLabel}

${alert.title}

${alert.entityName ? `Affected: ${alert.entityName} (${alert.entityType})\n` : ''}

${alert.message}

${this.renderRecommendedActionsText(alert)}

${alert.actionUrl ? `View details: ${alert.actionUrl}` : ''}

---
Alert ID: ${alert.id}
Generated at: ${alert.createdAt.toISOString()}
`;

    return { subject, html, text };
  }

  /**
   * Generate email template for digest
   */
  private generateDigestEmail(alerts: Alert[], period: string): EmailTemplate {
    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    const errorCount = alerts.filter((a) => a.severity === 'error').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;
    const infoCount = alerts.filter((a) => a.severity === 'info').length;

    const subject = `Alert Digest: ${alerts.length} alerts (${criticalCount} critical) - ${period}`;

    const alertRows = alerts
      .map((alert) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: ${SEVERITY_COLORS[alert.severity]}20; color: ${SEVERITY_COLORS[alert.severity]}; font-size: 12px; font-weight: 500;">
              ${alert.severity.toUpperCase()}
            </span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <a href="${alert.actionUrl}" style="color: #111827; text-decoration: none; font-weight: 500;">${alert.title}</a>
            ${alert.entityName ? `<br><span style="color: #6b7280; font-size: 12px;">${alert.entityName}</span>` : ''}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
            ${alert.createdAt.toLocaleString()}
          </td>
        </tr>
      `)
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alert Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 700px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table cellpadding="0" cellspacing="0" width="100%" style="background-color: #1f2937; border-radius: 8px 8px 0 0;">
          <tr>
            <td style="padding: 24px; color: white;">
              <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Alert Digest</h1>
              <p style="margin: 0; opacity: 0.8; font-size: 14px;">${period}</p>
            </td>
          </tr>
        </table>

        <!-- Summary -->
        <table cellpadding="0" cellspacing="0" width="100%" style="background-color: white;">
          <tr>
            <td style="padding: 24px;">
              <h2 style="margin: 0 0 16px 0; font-size: 16px; color: #374151;">Summary</h2>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding: 8px 16px; background-color: ${SEVERITY_COLORS.critical}20; border-radius: 4px; text-align: center;">
                    <span style="font-size: 24px; font-weight: 700; color: ${SEVERITY_COLORS.critical};">${criticalCount}</span>
                    <br><span style="font-size: 12px; color: #6b7280;">Critical</span>
                  </td>
                  <td style="width: 12px;"></td>
                  <td style="padding: 8px 16px; background-color: ${SEVERITY_COLORS.error}20; border-radius: 4px; text-align: center;">
                    <span style="font-size: 24px; font-weight: 700; color: ${SEVERITY_COLORS.error};">${errorCount}</span>
                    <br><span style="font-size: 12px; color: #6b7280;">Error</span>
                  </td>
                  <td style="width: 12px;"></td>
                  <td style="padding: 8px 16px; background-color: ${SEVERITY_COLORS.warning}20; border-radius: 4px; text-align: center;">
                    <span style="font-size: 24px; font-weight: 700; color: ${SEVERITY_COLORS.warning};">${warningCount}</span>
                    <br><span style="font-size: 12px; color: #6b7280;">Warning</span>
                  </td>
                  <td style="width: 12px;"></td>
                  <td style="padding: 8px 16px; background-color: ${SEVERITY_COLORS.info}20; border-radius: 4px; text-align: center;">
                    <span style="font-size: 24px; font-weight: 700; color: ${SEVERITY_COLORS.info};">${infoCount}</span>
                    <br><span style="font-size: 12px; color: #6b7280;">Info</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Alert List -->
        <table cellpadding="0" cellspacing="0" width="100%" style="background-color: white; border-radius: 0 0 8px 8px;">
          <tr>
            <td style="padding: 0 24px 24px 24px;">
              <h2 style="margin: 0 0 16px 0; font-size: 16px; color: #374151;">Alerts</h2>
              <table cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 6px;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Severity</th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Alert</th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${alertRows}
                </tbody>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px;">
          <tr>
            <td style="text-align: center; padding: 16px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                You're receiving this digest because you subscribed to alerts.<br>
                <a href="#" style="color: #6b7280;">Manage notification preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `
Alert Digest - ${period}

Summary:
- Critical: ${criticalCount}
- Error: ${errorCount}
- Warning: ${warningCount}
- Info: ${infoCount}

Alerts:
${alerts.map((a) => `[${a.severity.toUpperCase()}] ${a.title} - ${a.actionUrl}`).join('\n')}
`;

    return { subject, html, text };
  }

  /**
   * Render recommended actions HTML
   */
  private renderRecommendedActions(alert: Alert): string {
    const actions = (alert.metadata as Record<string, unknown>)?.recommendedActions as string[] | undefined;
    if (!actions || actions.length === 0) {
      return '';
    }

    const actionItems = actions
      .map((action) => `<li style="margin-bottom: 8px; color: #374151;">${action}</li>`)
      .join('');

    return `
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #111827;">Recommended Actions:</h3>
        <ul style="margin: 0; padding-left: 20px;">
          ${actionItems}
        </ul>
      </div>
    `;
  }

  /**
   * Render recommended actions text
   */
  private renderRecommendedActionsText(alert: Alert): string {
    const actions = (alert.metadata as Record<string, unknown>)?.recommendedActions as string[] | undefined;
    if (!actions || actions.length === 0) {
      return '';
    }

    return `
Recommended Actions:
${actions.map((action, i) => `${i + 1}. ${action}`).join('\n')}
`;
  }

  /**
   * Close the transporter
   */
  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.isInitialized = false;
    }
  }
}

// Factory function
let emailNotifierInstance: EmailNotifier | null = null;

export function createEmailNotifier(config?: Partial<EmailConfig>): EmailNotifier {
  if (!emailNotifierInstance) {
    emailNotifierInstance = new EmailNotifier(config);
  }
  return emailNotifierInstance;
}

export function resetEmailNotifier(): void {
  emailNotifierInstance?.close();
  emailNotifierInstance = null;
}
