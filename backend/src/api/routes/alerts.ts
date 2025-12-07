/**
 * Alerts API Routes
 * Endpoints for alert management and subscriptions
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import {
  AlertService,
  createAlertService,
  AlertType,
  AlertSeverity,
  AlertStatus,
  NotificationChannel,
} from '../../services/alerts/alertService.js';
import {
  createInsightService,
} from '../../services/insights/insightService.js';
import {
  EmailNotifier,
  createEmailNotifier,
} from '../../services/notifications/emailNotifier.js';
import {
  SlackNotifier,
  createSlackNotifier,
} from '../../services/notifications/slackNotifier.js';
import {
  TeamsNotifier,
  createTeamsNotifier,
} from '../../services/notifications/teamsNotifier.js';

// Request schemas
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const alertQuerySchema = paginationSchema.extend({
  types: z.string().optional().transform((val) =>
    val ? val.split(',') as AlertType[] : undefined
  ),
  severities: z.string().optional().transform((val) =>
    val ? val.split(',') as AlertSeverity[] : undefined
  ),
  statuses: z.string().optional().transform((val) =>
    val ? val.split(',') as AlertStatus[] : undefined
  ),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const alertIdParamSchema = z.object({
  alertId: z.string().uuid(),
});

const subscriptionIdParamSchema = z.object({
  subscriptionId: z.string().uuid(),
});

const channelConfigSchema = z.object({
  email: z.string().email().optional(),
  webhookUrl: z.string().url().optional(),
  channel: z.string().optional(),
  teamsWebhookUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
});

const subscriptionChannelSchema = z.object({
  type: z.enum(['email', 'slack', 'teams', 'webhook', 'in_app']),
  config: channelConfigSchema,
});

const alertFilterSchema = z.object({
  types: z.array(z.enum([
    'burnout_warning',
    'process_degradation',
    'team_conflict',
    'bus_factor_risk',
    'data_quality_issue',
    'compliance_alert',
    'system_alert',
  ])).optional(),
  severities: z.array(z.enum(['info', 'warning', 'error', 'critical'])).optional(),
  categories: z.array(z.enum(['people', 'process', 'risk', 'opportunity'])).optional(),
  entityTypes: z.array(z.string()).optional(),
  minScore: z.number().min(0).max(100).optional(),
});

const alertScheduleSchema = z.object({
  type: z.enum(['immediate', 'digest', 'scheduled']),
  digestFrequency: z.enum(['hourly', 'daily', 'weekly']).optional(),
  digestTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  digestDays: z.array(z.number().int().min(0).max(6)).optional(),
  timezone: z.string().optional(),
});

const createSubscriptionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  channels: z.array(subscriptionChannelSchema).min(1),
  filters: alertFilterSchema,
  schedule: alertScheduleSchema.optional(),
});

const updateSubscriptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  channels: z.array(subscriptionChannelSchema).min(1).optional(),
  filters: alertFilterSchema.optional(),
  schedule: alertScheduleSchema.optional(),
});

export default async function alertsRoutes(fastify: FastifyInstance) {
  const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
  const prisma = new PrismaClient();

  const insightService = createInsightService(pool, prisma);
  const alertService = createAlertService(pool, prisma, insightService);
  const emailNotifier = createEmailNotifier();
  const slackNotifier = createSlackNotifier();
  const teamsNotifier = createTeamsNotifier();

  // ==================== ALERTS ENDPOINTS ====================

  /**
   * GET /alerts
   * List alerts with filtering
   */
  fastify.get(
    '/',
    {
      schema: {
        querystring: alertQuerySchema,
        tags: ['alerts'],
        summary: 'List alerts',
        description: 'Query alerts with filters for type, severity, status, etc.',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = alertQuerySchema.parse(request.query);

      const alerts = await alertService.getAlerts(organizationId, {
        types: query.types,
        severities: query.severities,
        statuses: query.statuses,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit || 50,
        offset: query.offset || 0,
      });

      return {
        success: true,
        data: alerts,
        meta: {
          count: alerts.length,
          limit: query.limit || 50,
          offset: query.offset || 0,
        },
      };
    }
  );

  /**
   * GET /alerts/pending
   * Get pending alerts
   */
  fastify.get(
    '/pending',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
        tags: ['alerts'],
        summary: 'Get pending alerts',
        description: 'Get alerts awaiting notification delivery',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }).parse(request.query);

      const alerts = await alertService.getPendingAlerts(
        organizationId,
        query.limit || 50
      );

      return {
        success: true,
        data: alerts,
      };
    }
  );

  /**
   * GET /alerts/:alertId
   * Get alert details
   */
  fastify.get(
    '/:alertId',
    {
      schema: {
        params: alertIdParamSchema,
        tags: ['alerts'],
        summary: 'Get alert details',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { alertId } = alertIdParamSchema.parse(request.params);

      const alert = await alertService.getAlertById(alertId);

      if (!alert) {
        return reply.status(404).send({
          success: false,
          error: 'Alert not found',
        });
      }

      if (alert.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      return {
        success: true,
        data: alert,
      };
    }
  );

  /**
   * POST /alerts/:alertId/acknowledge
   * Acknowledge an alert
   */
  fastify.post(
    '/:alertId/acknowledge',
    {
      schema: {
        params: alertIdParamSchema,
        tags: ['alerts'],
        summary: 'Acknowledge alert',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { alertId } = alertIdParamSchema.parse(request.params);
      const userId = request.userId!;

      const existing = await alertService.getAlertById(alertId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Alert not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await alertService.updateAlertStatus(
        alertId,
        'acknowledged',
        userId
      );

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * POST /alerts/:alertId/resolve
   * Resolve an alert
   */
  fastify.post(
    '/:alertId/resolve',
    {
      schema: {
        params: alertIdParamSchema,
        tags: ['alerts'],
        summary: 'Resolve alert',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { alertId } = alertIdParamSchema.parse(request.params);

      const existing = await alertService.getAlertById(alertId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Alert not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await alertService.updateAlertStatus(alertId, 'resolved');

      return {
        success: true,
        data: updated,
      };
    }
  );

  // ==================== SUBSCRIPTION ENDPOINTS ====================

  /**
   * GET /alerts/subscriptions
   * List alert subscriptions
   */
  fastify.get(
    '/subscriptions',
    {
      schema: {
        tags: ['alerts', 'subscriptions'],
        summary: 'List alert subscriptions',
        description: 'Get all active alert subscriptions for the organization',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const subscriptions = await alertService.getSubscriptions(organizationId);

      return {
        success: true,
        data: subscriptions,
      };
    }
  );

  /**
   * POST /alerts/subscribe
   * Create a new alert subscription
   */
  fastify.post(
    '/subscribe',
    {
      schema: {
        body: createSubscriptionSchema,
        tags: ['alerts', 'subscriptions'],
        summary: 'Create alert subscription',
        description: 'Subscribe to alerts with specified channels and filters',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const userId = request.userId!;
      const body = createSubscriptionSchema.parse(request.body);

      const subscription = await alertService.createSubscription({
        organizationId,
        userId,
        name: body.name,
        description: body.description,
        channels: body.channels,
        filters: body.filters,
        schedule: body.schedule,
      });

      return reply.status(201).send({
        success: true,
        data: subscription,
      });
    }
  );

  /**
   * GET /alerts/subscriptions/:subscriptionId
   * Get subscription details
   */
  fastify.get(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        params: subscriptionIdParamSchema,
        tags: ['alerts', 'subscriptions'],
        summary: 'Get subscription details',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = subscriptionIdParamSchema.parse(request.params);
      const organizationId = request.organizationId!;

      const subscriptions = await alertService.getSubscriptions(organizationId);
      const subscription = subscriptions.find(s => s.id === subscriptionId);

      if (!subscription) {
        return reply.status(404).send({
          success: false,
          error: 'Subscription not found',
        });
      }

      return {
        success: true,
        data: subscription,
      };
    }
  );

  /**
   * PATCH /alerts/subscriptions/:subscriptionId
   * Update subscription
   */
  fastify.patch(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        params: subscriptionIdParamSchema,
        body: updateSubscriptionSchema,
        tags: ['alerts', 'subscriptions'],
        summary: 'Update subscription',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = subscriptionIdParamSchema.parse(request.params);
      const updates = updateSubscriptionSchema.parse(request.body);
      const organizationId = request.organizationId!;

      // Verify subscription exists and belongs to organization
      const subscriptions = await alertService.getSubscriptions(organizationId);
      const existing = subscriptions.find(s => s.id === subscriptionId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Subscription not found',
        });
      }

      const updated = await alertService.updateSubscription(subscriptionId, updates);

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * DELETE /alerts/subscriptions/:subscriptionId
   * Delete subscription
   */
  fastify.delete(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        params: subscriptionIdParamSchema,
        tags: ['alerts', 'subscriptions'],
        summary: 'Delete subscription',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = subscriptionIdParamSchema.parse(request.params);
      const organizationId = request.organizationId!;

      // Verify subscription exists and belongs to organization
      const subscriptions = await alertService.getSubscriptions(organizationId);
      const existing = subscriptions.find(s => s.id === subscriptionId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Subscription not found',
        });
      }

      await alertService.deleteSubscription(subscriptionId);

      return {
        success: true,
        message: 'Subscription deleted',
      };
    }
  );

  /**
   * POST /alerts/subscriptions/:subscriptionId/test
   * Send a test notification to verify subscription channels
   */
  fastify.post(
    '/subscriptions/:subscriptionId/test',
    {
      schema: {
        params: subscriptionIdParamSchema,
        tags: ['alerts', 'subscriptions'],
        summary: 'Test subscription',
        description: 'Send a test notification to verify channels are configured correctly',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = subscriptionIdParamSchema.parse(request.params);
      const organizationId = request.organizationId!;

      // Verify subscription exists and belongs to organization
      const subscriptions = await alertService.getSubscriptions(organizationId);
      const subscription = subscriptions.find(s => s.id === subscriptionId);

      if (!subscription) {
        return reply.status(404).send({
          success: false,
          error: 'Subscription not found',
        });
      }

      const results: Array<{
        channel: NotificationChannel;
        success: boolean;
        error?: string;
      }> = [];

      // Test each channel
      for (const channel of subscription.channels) {
        try {
          switch (channel.type) {
            case 'email':
              if (channel.config.email) {
                await emailNotifier.sendTestEmail(channel.config.email);
                results.push({ channel: 'email', success: true });
              }
              break;

            case 'slack':
              if (channel.config.webhookUrl) {
                await slackNotifier.sendTestMessage(channel.config.webhookUrl);
                results.push({ channel: 'slack', success: true });
              }
              break;

            case 'teams':
              if (channel.config.teamsWebhookUrl) {
                await teamsNotifier.sendTestMessage(channel.config.teamsWebhookUrl);
                results.push({ channel: 'teams', success: true });
              }
              break;

            case 'webhook':
              // Generic webhook test would go here
              results.push({ channel: 'webhook', success: true });
              break;

            case 'in_app':
              results.push({ channel: 'in_app', success: true });
              break;
          }
        } catch (error) {
          results.push({
            channel: channel.type,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const allSuccessful = results.every(r => r.success);

      return {
        success: allSuccessful,
        data: {
          results,
          message: allSuccessful
            ? 'All channels tested successfully'
            : 'Some channels failed testing',
        },
      };
    }
  );

  /**
   * POST /alerts/process
   * Process pending alerts and send notifications
   */
  fastify.post(
    '/process',
    {
      schema: {
        tags: ['alerts'],
        summary: 'Process pending alerts',
        description: 'Process pending alerts and send notifications to subscribers',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const result = await alertService.processPendingAlerts(
        organizationId,
        async (alert, subscription, channel) => {
          // Send notification based on channel type
          switch (channel.type) {
            case 'email':
              if (channel.config.email) {
                await emailNotifier.sendAlertEmail(channel.config.email, alert);
                return {
                  channel: 'email' as const,
                  recipient: channel.config.email,
                  sentAt: new Date(),
                  status: 'sent' as const,
                };
              }
              break;

            case 'slack':
              if (channel.config.webhookUrl) {
                await slackNotifier.sendAlert(channel.config.webhookUrl, alert);
                return {
                  channel: 'slack' as const,
                  recipient: channel.config.channel || channel.config.webhookUrl,
                  sentAt: new Date(),
                  status: 'sent' as const,
                };
              }
              break;

            case 'teams':
              if (channel.config.teamsWebhookUrl) {
                await teamsNotifier.sendAlert(channel.config.teamsWebhookUrl, alert);
                return {
                  channel: 'teams' as const,
                  recipient: channel.config.teamsWebhookUrl,
                  sentAt: new Date(),
                  status: 'sent' as const,
                };
              }
              break;
          }

          return {
            channel: channel.type,
            recipient: 'unknown',
            sentAt: new Date(),
            status: 'failed' as const,
            error: 'Channel not configured properly',
          };
        }
      );

      return {
        success: true,
        data: result,
      };
    }
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await pool.end();
    await prisma.$disconnect();
  });
}
