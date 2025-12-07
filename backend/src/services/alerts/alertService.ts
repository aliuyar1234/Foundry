/**
 * Alert Generation Service
 * Generates and manages alerts based on insights and pattern detection
 *
 * Responsibilities:
 * - Convert insights to alerts based on rules
 * - Manage alert subscriptions
 * - Coordinate notification delivery
 * - Track alert acknowledgment and resolution
 */

import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import {
  InsightService,
  Insight,
  InsightSeverity,
  InsightCategory,
  InsightType,
} from '../insights/insightService.js';

export interface Alert {
  id: string;
  organizationId: string;
  insightId: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  actionUrl?: string;
  metadata: Record<string, unknown>;
  notificationsSent: NotificationRecord[];
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AlertType =
  | 'burnout_warning'
  | 'process_degradation'
  | 'team_conflict'
  | 'bus_factor_risk'
  | 'data_quality_issue'
  | 'compliance_alert'
  | 'system_alert';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export type AlertStatus = 'pending' | 'sent' | 'acknowledged' | 'resolved' | 'expired';

export interface NotificationRecord {
  channel: NotificationChannel;
  recipient: string;
  sentAt: Date;
  status: 'sent' | 'failed' | 'delivered';
  error?: string;
}

export type NotificationChannel = 'email' | 'slack' | 'teams' | 'webhook' | 'in_app';

export interface AlertSubscription {
  id: string;
  organizationId: string;
  userId?: string;
  name: string;
  description?: string;
  isActive: boolean;
  channels: SubscriptionChannel[];
  filters: AlertFilter;
  schedule?: AlertSchedule;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionChannel {
  type: NotificationChannel;
  config: ChannelConfig;
}

export interface ChannelConfig {
  // Email
  email?: string;
  // Slack
  webhookUrl?: string;
  channel?: string;
  // Teams
  teamsWebhookUrl?: string;
  // Generic webhook
  url?: string;
  headers?: Record<string, string>;
}

export interface AlertFilter {
  types?: AlertType[];
  severities?: AlertSeverity[];
  categories?: InsightCategory[];
  entityTypes?: string[];
  minScore?: number;
}

export interface AlertSchedule {
  type: 'immediate' | 'digest' | 'scheduled';
  digestFrequency?: 'hourly' | 'daily' | 'weekly';
  digestTime?: string; // HH:MM format
  digestDays?: number[]; // 0-6 for weekly
  timezone?: string;
}

export interface CreateAlertInput {
  organizationId: string;
  insightId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionInput {
  organizationId: string;
  userId?: string;
  name: string;
  description?: string;
  channels: SubscriptionChannel[];
  filters: AlertFilter;
  schedule?: AlertSchedule;
}

// Mapping from insight severity to alert severity
const SEVERITY_MAP: Record<InsightSeverity, AlertSeverity> = {
  critical: 'critical',
  high: 'error',
  medium: 'warning',
  low: 'info',
};

// Mapping from insight type to alert type
const TYPE_MAP: Record<InsightType, AlertType> = {
  burnout_risk: 'burnout_warning',
  process_degradation: 'process_degradation',
  team_conflict: 'team_conflict',
  bus_factor_risk: 'bus_factor_risk',
  data_quality: 'data_quality_issue',
  compliance_gap: 'compliance_alert',
  opportunity: 'system_alert',
  anomaly: 'system_alert',
};

export class AlertService {
  private pool: Pool;
  private prisma: PrismaClient;
  private insightService: InsightService;

  constructor(pool: Pool, prisma: PrismaClient, insightService: InsightService) {
    this.pool = pool;
    this.prisma = prisma;
    this.insightService = insightService;
  }

  /**
   * Create alert from insight
   */
  async createAlertFromInsight(insight: Insight): Promise<Alert | null> {
    // Check if alert already exists for this insight
    const existingQuery = `
      SELECT id FROM alerts
      WHERE insight_id = $1
        AND status NOT IN ('resolved', 'expired')
      LIMIT 1
    `;

    const existing = await this.pool.query(existingQuery, [insight.id]);
    if (existing.rows.length > 0) {
      return this.getAlertById(existing.rows[0].id);
    }

    const alertType = TYPE_MAP[insight.type] || 'system_alert';
    const alertSeverity = SEVERITY_MAP[insight.severity] || 'warning';

    const alert = await this.createAlert({
      organizationId: insight.organizationId,
      insightId: insight.id,
      type: alertType,
      severity: alertSeverity,
      title: insight.title,
      message: this.formatAlertMessage(insight),
      entityType: insight.entityType,
      entityId: insight.entityId,
      entityName: insight.entityName,
      actionUrl: this.generateActionUrl(insight),
      metadata: {
        insightScore: insight.score,
        insightCategory: insight.category,
        recommendedActions: insight.recommendedActions,
      },
    });

    return alert;
  }

  /**
   * Create a new alert
   */
  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const insertQuery = `
      INSERT INTO alerts (
        id, organization_id, insight_id, type, severity, status,
        title, message, entity_type, entity_id, entity_name,
        action_url, metadata, notifications_sent,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'pending',
        $5, $6, $7, $8, $9,
        $10, $11, '[]'::jsonb,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await this.pool.query(insertQuery, [
      input.organizationId,
      input.insightId,
      input.type,
      input.severity,
      input.title,
      input.message,
      input.entityType,
      input.entityId,
      input.entityName || null,
      input.actionUrl || null,
      JSON.stringify(input.metadata || {}),
    ]);

    return this.mapRowToAlert(result.rows[0]);
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id: string): Promise<Alert | null> {
    const query = `SELECT * FROM alerts WHERE id = $1`;
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAlert(result.rows[0]);
  }

  /**
   * Get pending alerts for processing
   */
  async getPendingAlerts(organizationId: string, limit = 50): Promise<Alert[]> {
    const query = `
      SELECT * FROM alerts
      WHERE organization_id = $1
        AND status = 'pending'
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'error' THEN 2
          WHEN 'warning' THEN 3
          WHEN 'info' THEN 4
        END,
        created_at ASC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [organizationId, limit]);
    return result.rows.map((row) => this.mapRowToAlert(row));
  }

  /**
   * Get alerts for organization
   */
  async getAlerts(
    organizationId: string,
    options?: {
      types?: AlertType[];
      severities?: AlertSeverity[];
      statuses?: AlertStatus[];
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<Alert[]> {
    const conditions: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (options?.types && options.types.length > 0) {
      conditions.push(`type = ANY($${paramIndex++})`);
      values.push(options.types);
    }

    if (options?.severities && options.severities.length > 0) {
      conditions.push(`severity = ANY($${paramIndex++})`);
      values.push(options.severities);
    }

    if (options?.statuses && options.statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(options.statuses);
    }

    if (options?.from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(options.from);
    }

    if (options?.to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(options.to);
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const query = `
      SELECT * FROM alerts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapRowToAlert(row));
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(
    id: string,
    status: AlertStatus,
    acknowledgedBy?: string
  ): Promise<Alert | null> {
    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [status];
    let paramIndex = 2;

    if (status === 'acknowledged' && acknowledgedBy) {
      updates.push(`acknowledged_by = $${paramIndex++}`);
      values.push(acknowledgedBy);
      updates.push('acknowledged_at = NOW()');
    }

    values.push(id);

    const query = `
      UPDATE alerts
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAlert(result.rows[0]);
  }

  /**
   * Record notification sent
   */
  async recordNotificationSent(
    alertId: string,
    notification: NotificationRecord
  ): Promise<void> {
    const query = `
      UPDATE alerts
      SET notifications_sent = notifications_sent || $1::jsonb,
          status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
          updated_at = NOW()
      WHERE id = $2
    `;

    await this.pool.query(query, [JSON.stringify([notification]), alertId]);
  }

  /**
   * Create alert subscription
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<AlertSubscription> {
    const insertQuery = `
      INSERT INTO alert_subscriptions (
        id, organization_id, user_id, name, description, is_active,
        channels, filters, schedule, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, true,
        $5, $6, $7, NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await this.pool.query(insertQuery, [
      input.organizationId,
      input.userId || null,
      input.name,
      input.description || null,
      JSON.stringify(input.channels),
      JSON.stringify(input.filters),
      input.schedule ? JSON.stringify(input.schedule) : null,
    ]);

    return this.mapRowToSubscription(result.rows[0]);
  }

  /**
   * Get subscriptions for organization
   */
  async getSubscriptions(organizationId: string): Promise<AlertSubscription[]> {
    const query = `
      SELECT * FROM alert_subscriptions
      WHERE organization_id = $1
        AND is_active = true
      ORDER BY name ASC
    `;

    const result = await this.pool.query(query, [organizationId]);
    return result.rows.map((row) => this.mapRowToSubscription(row));
  }

  /**
   * Get subscriptions matching an alert
   */
  async getMatchingSubscriptions(alert: Alert): Promise<AlertSubscription[]> {
    const subscriptions = await this.getSubscriptions(alert.organizationId);

    return subscriptions.filter((sub) => {
      const filters = sub.filters;

      // Check type filter
      if (filters.types && filters.types.length > 0) {
        if (!filters.types.includes(alert.type)) {
          return false;
        }
      }

      // Check severity filter
      if (filters.severities && filters.severities.length > 0) {
        if (!filters.severities.includes(alert.severity)) {
          return false;
        }
      }

      // Check entity type filter
      if (filters.entityTypes && filters.entityTypes.length > 0) {
        if (!filters.entityTypes.includes(alert.entityType)) {
          return false;
        }
      }

      // Check min score filter
      if (filters.minScore !== undefined) {
        const score = (alert.metadata as Record<string, unknown>)?.insightScore;
        if (typeof score === 'number' && score < filters.minScore) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    id: string,
    updates: Partial<CreateSubscriptionInput>
  ): Promise<AlertSubscription | null> {
    const setClause: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClause.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClause.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.channels !== undefined) {
      setClause.push(`channels = $${paramIndex++}`);
      values.push(JSON.stringify(updates.channels));
    }

    if (updates.filters !== undefined) {
      setClause.push(`filters = $${paramIndex++}`);
      values.push(JSON.stringify(updates.filters));
    }

    if (updates.schedule !== undefined) {
      setClause.push(`schedule = $${paramIndex++}`);
      values.push(JSON.stringify(updates.schedule));
    }

    values.push(id);

    const query = `
      UPDATE alert_subscriptions
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToSubscription(result.rows[0]);
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(id: string): Promise<boolean> {
    const query = `
      UPDATE alert_subscriptions
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Process pending alerts and send notifications
   */
  async processPendingAlerts(
    organizationId: string,
    sendNotification: (
      alert: Alert,
      subscription: AlertSubscription,
      channel: SubscriptionChannel
    ) => Promise<NotificationRecord>
  ): Promise<{ processed: number; sent: number; failed: number }> {
    const pendingAlerts = await this.getPendingAlerts(organizationId);

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const alert of pendingAlerts) {
      processed++;

      const subscriptions = await this.getMatchingSubscriptions(alert);

      for (const subscription of subscriptions) {
        // Check schedule
        if (subscription.schedule?.type === 'digest') {
          // Skip for digest processing (handled separately)
          continue;
        }

        for (const channel of subscription.channels) {
          try {
            const notification = await sendNotification(alert, subscription, channel);
            await this.recordNotificationSent(alert.id, notification);

            if (notification.status === 'sent' || notification.status === 'delivered') {
              sent++;
            } else {
              failed++;
            }
          } catch (error) {
            failed++;
            await this.recordNotificationSent(alert.id, {
              channel: channel.type,
              recipient: this.getRecipient(channel),
              sentAt: new Date(),
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      // Mark alert as sent if any notifications were attempted
      if (alert.status === 'pending') {
        await this.updateAlertStatus(alert.id, 'sent');
      }
    }

    return { processed, sent, failed };
  }

  /**
   * Format alert message from insight
   */
  private formatAlertMessage(insight: Insight): string {
    const parts: string[] = [insight.description];

    if (insight.recommendedActions.length > 0) {
      parts.push('\nRecommended actions:');
      insight.recommendedActions.forEach((action, i) => {
        parts.push(`${i + 1}. ${action}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Generate action URL for insight
   */
  private generateActionUrl(insight: Insight): string {
    const baseUrl = process.env.APP_URL || 'https://app.example.com';
    return `${baseUrl}/insights/${insight.id}`;
  }

  /**
   * Get recipient from channel config
   */
  private getRecipient(channel: SubscriptionChannel): string {
    switch (channel.type) {
      case 'email':
        return channel.config.email || 'unknown';
      case 'slack':
        return channel.config.channel || channel.config.webhookUrl || 'unknown';
      case 'teams':
        return channel.config.teamsWebhookUrl || 'unknown';
      case 'webhook':
        return channel.config.url || 'unknown';
      default:
        return 'unknown';
    }
  }

  /**
   * Map database row to Alert object
   */
  private mapRowToAlert(row: Record<string, unknown>): Alert {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      insightId: row.insight_id as string,
      type: row.type as AlertType,
      severity: row.severity as AlertSeverity,
      status: row.status as AlertStatus,
      title: row.title as string,
      message: row.message as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      entityName: row.entity_name as string | undefined,
      actionUrl: row.action_url as string | undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      notificationsSent: (row.notifications_sent as NotificationRecord[]) || [],
      acknowledgedBy: row.acknowledged_by as string | undefined,
      acknowledgedAt: row.acknowledged_at
        ? new Date(row.acknowledged_at as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  /**
   * Map database row to AlertSubscription object
   */
  private mapRowToSubscription(row: Record<string, unknown>): AlertSubscription {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      userId: row.user_id as string | undefined,
      name: row.name as string,
      description: row.description as string | undefined,
      isActive: row.is_active as boolean,
      channels: (row.channels as SubscriptionChannel[]) || [],
      filters: (row.filters as AlertFilter) || {},
      schedule: row.schedule as AlertSchedule | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// Factory function
let alertServiceInstance: AlertService | null = null;

export function createAlertService(
  pool: Pool,
  prisma: PrismaClient,
  insightService: InsightService
): AlertService {
  if (!alertServiceInstance) {
    alertServiceInstance = new AlertService(pool, prisma, insightService);
  }
  return alertServiceInstance;
}

export function resetAlertService(): void {
  alertServiceInstance = null;
}
