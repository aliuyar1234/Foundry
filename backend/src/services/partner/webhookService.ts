/**
 * Webhook Service
 * SCALE Tier - Tasks T070-T075
 *
 * Manages webhook subscriptions and delivery
 */

import { PrismaClient, WebhookSubscription, WebhookDelivery } from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../../lib/errors/AppError';

export interface WebhookServiceConfig {
  prisma: PrismaClient;
  maxRetries?: number;
  retryDelayMs?: number;
}

// T075: Webhook event types
export const WEBHOOK_EVENT_TYPES = [
  'process.discovered',
  'process.updated',
  'process.completed',
  'insight.created',
  'insight.updated',
  'data_source.connected',
  'data_source.synced',
  'data_source.error',
  'compliance.violation',
  'compliance.resolved',
  'user.created',
  'user.updated',
  'routing.decision',
  'automation.executed',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  entityId: string;
  data: Record<string, unknown>;
}

export interface CreateWebhookInput {
  applicationId: string;
  eventTypes: WebhookEventType[];
  targetUrl: string;
}

export class WebhookService {
  private prisma: PrismaClient;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(config: WebhookServiceConfig) {
    this.prisma = config.prisma;
    this.maxRetries = config.maxRetries || 5;
    this.retryDelayMs = config.retryDelayMs || 60000; // 1 minute
  }

  // ==========================================================================
  // T071: Subscription Management
  // ==========================================================================

  /**
   * Create webhook subscription
   */
  async subscribe(input: CreateWebhookInput): Promise<WebhookSubscription> {
    // Validate event types
    this.validateEventTypes(input.eventTypes);

    // Validate target URL
    this.validateTargetUrl(input.targetUrl);

    // Generate webhook secret
    const secret = this.generateSecret();

    return this.prisma.webhookSubscription.create({
      data: {
        applicationId: input.applicationId,
        eventTypes: input.eventTypes,
        targetUrl: input.targetUrl,
        secret,
      },
    });
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    return this.prisma.webhookSubscription.findUnique({
      where: { id },
    });
  }

  /**
   * List subscriptions for application
   */
  async listSubscriptions(applicationId: string): Promise<WebhookSubscription[]> {
    return this.prisma.webhookSubscription.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    id: string,
    updates: {
      eventTypes?: WebhookEventType[];
      targetUrl?: string;
      isActive?: boolean;
    }
  ): Promise<WebhookSubscription> {
    if (updates.eventTypes) {
      this.validateEventTypes(updates.eventTypes);
    }

    if (updates.targetUrl) {
      this.validateTargetUrl(updates.targetUrl);
    }

    return this.prisma.webhookSubscription.update({
      where: { id },
      data: updates,
    });
  }

  /**
   * Unsubscribe (delete subscription)
   */
  async unsubscribe(id: string): Promise<void> {
    await this.prisma.webhookSubscription.delete({
      where: { id },
    });
  }

  /**
   * Rotate webhook secret
   */
  async rotateSecret(id: string): Promise<{ secret: string }> {
    const secret = this.generateSecret();

    await this.prisma.webhookSubscription.update({
      where: { id },
      data: { secret },
    });

    return { secret };
  }

  // ==========================================================================
  // T072: Payload Signing (HMAC)
  // ==========================================================================

  /**
   * Sign webhook payload with HMAC-SHA256
   */
  signPayload(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;

    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Verify webhook signature
   */
  verifySignature(
    payload: string,
    signature: string,
    secret: string,
    toleranceSeconds = 300
  ): boolean {
    try {
      // Parse signature header
      const parts = signature.split(',').reduce(
        (acc, part) => {
          const [key, value] = part.split('=');
          acc[key] = value;
          return acc;
        },
        {} as Record<string, string>
      );

      const timestamp = parseInt(parts['t'], 10);
      const expectedSignature = parts['v1'];

      if (!timestamp || !expectedSignature) {
        return false;
      }

      // Check timestamp tolerance
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > toleranceSeconds) {
        return false;
      }

      // Verify signature
      const signedPayload = `${timestamp}.${payload}`;
      const computedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(computedSignature)
      );
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // T073-T074: Webhook Delivery with Retries
  // ==========================================================================

  /**
   * Queue webhook for delivery
   */
  async queueDelivery(
    eventType: WebhookEventType,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    // Find all active subscriptions for this event type
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        eventTypes: { has: eventType },
        isActive: true,
      },
      include: {
        application: true,
      },
    });

    // Create delivery records for each subscription
    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      entityId,
      data,
    };

    await Promise.all(
      subscriptions.map(sub =>
        this.prisma.webhookDelivery.create({
          data: {
            subscriptionId: sub.id,
            eventType,
            payload,
            status: 'pending',
          },
        })
      )
    );
  }

  /**
   * Deliver webhook (called by job processor)
   */
  async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { subscription: true },
    });

    if (!delivery) {
      throw new AppError('DELIVERY_NOT_FOUND', 'Webhook delivery not found');
    }

    const { subscription, payload } = delivery;
    const payloadString = JSON.stringify(payload);
    const signature = this.signPayload(payloadString, subscription.secret);

    try {
      const response = await fetch(subscription.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Foundry-Signature': signature,
          'X-Foundry-Event': delivery.eventType,
          'X-Foundry-Delivery-ID': deliveryId,
        },
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseBody = await response.text();

      if (response.ok) {
        // Success
        await this.markDelivered(deliveryId, response.status, responseBody);
        await this.resetFailureCount(subscription.id);
      } else {
        // HTTP error
        await this.handleDeliveryFailure(
          delivery,
          response.status,
          `HTTP ${response.status}: ${responseBody.slice(0, 500)}`
        );
      }
    } catch (error) {
      // Network or timeout error
      await this.handleDeliveryFailure(
        delivery,
        null,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Mark delivery as delivered
   */
  private async markDelivered(
    deliveryId: string,
    statusCode: number,
    responseBody: string
  ): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
        statusCode,
        responseBody: responseBody.slice(0, 1000),
      },
    });
  }

  /**
   * Handle delivery failure with exponential backoff
   */
  private async handleDeliveryFailure(
    delivery: WebhookDelivery & { subscription: WebhookSubscription },
    statusCode: number | null,
    errorMessage: string
  ): Promise<void> {
    const newAttempts = delivery.attempts + 1;
    const shouldRetry = newAttempts < this.maxRetries;

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: shouldRetry ? 'retrying' : 'failed',
        attempts: newAttempts,
        lastAttemptAt: new Date(),
        statusCode,
        errorMessage,
      },
    });

    // Update subscription failure count
    await this.prisma.webhookSubscription.update({
      where: { id: delivery.subscriptionId },
      data: {
        failureCount: { increment: 1 },
        lastFailedAt: new Date(),
      },
    });

    // Disable subscription after too many consecutive failures
    if (delivery.subscription.failureCount >= 10) {
      await this.prisma.webhookSubscription.update({
        where: { id: delivery.subscriptionId },
        data: { isActive: false },
      });
    }
  }

  /**
   * Reset failure count on successful delivery
   */
  private async resetFailureCount(subscriptionId: string): Promise<void> {
    await this.prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        failureCount: 0,
        lastDeliveredAt: new Date(),
      },
    });
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1min, 2min, 4min, 8min, 16min
    return this.retryDelayMs * Math.pow(2, attempt - 1);
  }

  /**
   * Get pending deliveries for retry
   */
  async getPendingDeliveries(limit = 100): Promise<WebhookDelivery[]> {
    return this.prisma.webhookDelivery.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        attempts: { lt: this.maxRetries },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { subscription: true },
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Validate event types
   */
  private validateEventTypes(types: string[]): void {
    const invalid = types.filter(
      t => !WEBHOOK_EVENT_TYPES.includes(t as WebhookEventType)
    );
    if (invalid.length > 0) {
      throw new AppError(
        'INVALID_EVENT_TYPES',
        `Invalid event types: ${invalid.join(', ')}`
      );
    }
  }

  /**
   * Validate target URL
   */
  private validateTargetUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new AppError(
          'INVALID_WEBHOOK_URL',
          'Webhook URL must use HTTPS'
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('INVALID_WEBHOOK_URL', 'Invalid webhook URL format');
    }
  }

  /**
   * Generate webhook secret
   */
  private generateSecret(): string {
    return `whsec_${crypto.randomBytes(32).toString('base64url')}`;
  }
}
