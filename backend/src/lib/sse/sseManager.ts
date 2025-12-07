/**
 * Server-Sent Events Manager for OPERATE Tier
 * T030 - Create SSE infrastructure for real-time updates
 */

import { FastifyReply } from 'fastify';
import { EventEmitter } from 'events';
import { logger } from '../logger.js';

// =============================================================================
// Types
// =============================================================================

export interface SSEClient {
  id: string;
  userId: string;
  organizationId: string;
  reply: FastifyReply;
  channels: Set<string>;
  connectedAt: Date;
  lastPingAt: Date;
}

export interface SSEMessage {
  event?: string;
  data: unknown;
  id?: string;
  retry?: number;
}

export type SSEChannel =
  | 'routing'
  | 'workload'
  | 'alerts'
  | 'compliance'
  | 'assistant'
  | 'metrics'
  | 'system';

// =============================================================================
// SSE Manager Class
// =============================================================================

class SSEManager extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private channelSubscriptions: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly CLIENT_TIMEOUT = 120000; // 2 minutes

  constructor() {
    super();
    this.startPingInterval();
    logger.info('SSE Manager initialized');
  }

  /**
   * Register a new SSE client
   */
  registerClient(
    reply: FastifyReply,
    userId: string,
    organizationId: string,
    channels: SSEChannel[] = ['system']
  ): string {
    const clientId = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    const client: SSEClient = {
      id: clientId,
      userId,
      organizationId,
      reply,
      channels: new Set(channels),
      connectedAt: new Date(),
      lastPingAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Subscribe to channels
    for (const channel of channels) {
      this.subscribeToChannel(clientId, channel, organizationId);
    }

    // Handle client disconnect
    reply.raw.on('close', () => {
      this.unregisterClient(clientId);
    });

    // Send initial connection message
    this.sendToClient(clientId, {
      event: 'connected',
      data: { clientId, channels },
    });

    logger.info({ clientId, userId, organizationId, channels }, 'SSE client registered');
    this.emit('client:connected', { clientId, userId, organizationId });

    return clientId;
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Unsubscribe from all channels
    for (const channel of client.channels) {
      this.unsubscribeFromChannel(clientId, channel, client.organizationId);
    }

    this.clients.delete(clientId);
    logger.info({ clientId }, 'SSE client unregistered');
    this.emit('client:disconnected', { clientId, userId: client.userId });
  }

  /**
   * Subscribe client to a channel
   */
  subscribeToChannel(clientId: string, channel: SSEChannel, organizationId: string): void {
    const key = `${organizationId}:${channel}`;
    if (!this.channelSubscriptions.has(key)) {
      this.channelSubscriptions.set(key, new Set());
    }
    this.channelSubscriptions.get(key)!.add(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      client.channels.add(channel);
    }
  }

  /**
   * Unsubscribe client from a channel
   */
  unsubscribeFromChannel(clientId: string, channel: SSEChannel, organizationId: string): void {
    const key = `${organizationId}:${channel}`;
    const subscribers = this.channelSubscriptions.get(key);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.channelSubscriptions.delete(key);
      }
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.channels.delete(channel);
    }
  }

  /**
   * Send message to a specific client
   */
  sendToClient(clientId: string, message: SSEMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      const formattedMessage = this.formatMessage(message);
      client.reply.raw.write(formattedMessage);
      return true;
    } catch (error) {
      logger.error({ error, clientId }, 'Failed to send SSE message to client');
      this.unregisterClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast message to a channel
   */
  broadcast(
    organizationId: string,
    channel: SSEChannel,
    message: SSEMessage
  ): number {
    const key = `${organizationId}:${channel}`;
    const subscribers = this.channelSubscriptions.get(key);
    if (!subscribers || subscribers.size === 0) return 0;

    let sentCount = 0;
    for (const clientId of subscribers) {
      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug({ organizationId, channel, sentCount }, 'SSE broadcast sent');
    return sentCount;
  }

  /**
   * Broadcast to user (all their connections)
   */
  broadcastToUser(
    userId: string,
    organizationId: string,
    message: SSEMessage
  ): number {
    let sentCount = 0;
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId && client.organizationId === organizationId) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }
    return sentCount;
  }

  /**
   * Broadcast to all clients in an organization
   */
  broadcastToOrganization(
    organizationId: string,
    message: SSEMessage
  ): number {
    let sentCount = 0;
    for (const [clientId, client] of this.clients) {
      if (client.organizationId === organizationId) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }
    return sentCount;
  }

  /**
   * Format SSE message
   */
  private formatMessage(message: SSEMessage): string {
    let formatted = '';

    if (message.id) {
      formatted += `id: ${message.id}\n`;
    }

    if (message.event) {
      formatted += `event: ${message.event}\n`;
    }

    if (message.retry) {
      formatted += `retry: ${message.retry}\n`;
    }

    const data = typeof message.data === 'string'
      ? message.data
      : JSON.stringify(message.data);

    // Handle multi-line data
    const lines = data.split('\n');
    for (const line of lines) {
      formatted += `data: ${line}\n`;
    }

    formatted += '\n';
    return formatted;
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const pingMessage = this.formatMessage({
        event: 'ping',
        data: { timestamp: new Date().toISOString() },
      });

      for (const [clientId, client] of this.clients) {
        // Check for stale connections
        if (now - client.lastPingAt.getTime() > this.CLIENT_TIMEOUT) {
          logger.warn({ clientId }, 'SSE client timed out');
          this.unregisterClient(clientId);
          continue;
        }

        try {
          client.reply.raw.write(pingMessage);
          client.lastPingAt = new Date();
        } catch (error) {
          logger.error({ error, clientId }, 'SSE ping failed');
          this.unregisterClient(clientId);
        }
      }
    }, this.PING_INTERVAL);
  }

  /**
   * Get connection stats
   */
  getStats(): {
    totalClients: number;
    clientsByOrg: Record<string, number>;
    channelSubscriptions: Record<string, number>;
  } {
    const clientsByOrg: Record<string, number> = {};
    const channelSubs: Record<string, number> = {};

    for (const client of this.clients.values()) {
      clientsByOrg[client.organizationId] = (clientsByOrg[client.organizationId] || 0) + 1;
    }

    for (const [key, subscribers] of this.channelSubscriptions) {
      channelSubs[key] = subscribers.size;
    }

    return {
      totalClients: this.clients.size,
      clientsByOrg,
      channelSubscriptions: channelSubs,
    };
  }

  /**
   * Check if user has active connections
   */
  isUserConnected(userId: string, organizationId: string): boolean {
    for (const client of this.clients.values()) {
      if (client.userId === userId && client.organizationId === organizationId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Shutdown SSE manager
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all connections
    for (const clientId of this.clients.keys()) {
      this.unregisterClient(clientId);
    }

    logger.info('SSE Manager shutdown');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let sseManager: SSEManager | null = null;

export function getSSEManager(): SSEManager {
  if (!sseManager) {
    sseManager = new SSEManager();
  }
  return sseManager;
}

// =============================================================================
// Helper Functions for Common Events
// =============================================================================

/**
 * Broadcast a routing decision update
 */
export function broadcastRoutingDecision(
  organizationId: string,
  decision: {
    requestId: string;
    handlerId: string;
    handlerName: string;
    confidence: number;
  }
): void {
  getSSEManager().broadcast(organizationId, 'routing', {
    event: 'routing:decision',
    data: decision,
  });
}

/**
 * Broadcast a workload update
 */
export function broadcastWorkloadUpdate(
  organizationId: string,
  update: {
    personId: string;
    workloadScore: number;
    burnoutRisk: number;
  }
): void {
  getSSEManager().broadcast(organizationId, 'workload', {
    event: 'workload:update',
    data: update,
  });
}

/**
 * Broadcast an alert
 */
export function broadcastAlert(
  organizationId: string,
  alert: {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
  }
): void {
  getSSEManager().broadcast(organizationId, 'alerts', {
    event: 'alert:new',
    data: alert,
  });
}

/**
 * Broadcast compliance violation
 */
export function broadcastComplianceViolation(
  organizationId: string,
  violation: {
    id: string;
    ruleId: string;
    ruleName: string;
    severity: string;
    description: string;
  }
): void {
  getSSEManager().broadcast(organizationId, 'compliance', {
    event: 'compliance:violation',
    data: violation,
  });
}

/**
 * Broadcast metric update
 */
export function broadcastMetricUpdate(
  organizationId: string,
  metric: {
    id: string;
    name: string;
    value: number;
    previousValue?: number;
    trend?: 'up' | 'down' | 'stable';
  }
): void {
  getSSEManager().broadcast(organizationId, 'metrics', {
    event: 'metric:update',
    data: metric,
  });
}

export default {
  getSSEManager,
  broadcastRoutingDecision,
  broadcastWorkloadUpdate,
  broadcastAlert,
  broadcastComplianceViolation,
  broadcastMetricUpdate,
};
