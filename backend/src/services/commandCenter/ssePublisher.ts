/**
 * SSE Publisher Service
 * T107 - Create SSE broadcast service
 *
 * Manages Server-Sent Events for real-time command center updates
 */

import { Response } from 'express';
import Redis from 'ioredis';
import * as metricsAggregator from './metricsAggregator';
import * as alertManager from './alertManager';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Store active SSE connections
const connections = new Map<string, Set<SSEConnection>>();

export interface SSEConnection {
  id: string;
  userId: string;
  organizationId: string;
  response: Response;
  subscribedChannels: Set<string>;
  createdAt: Date;
  lastPingAt: Date;
}

export interface SSEEvent {
  type: string;
  data: unknown;
  id?: string;
  retry?: number;
}

export type EventChannel =
  | 'metrics'
  | 'alerts'
  | 'bottlenecks'
  | 'workload'
  | 'routing'
  | 'compliance'
  | 'notifications';

const CHANNEL_PREFIX = 'sse:';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 300000; // 5 minutes

/**
 * Initialize SSE publisher with Redis pub/sub
 */
export async function initialize(): Promise<void> {
  // Subscribe to Redis channels
  await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);

  subscriber.on('pmessage', (_pattern, channel, message) => {
    const channelName = channel.replace(CHANNEL_PREFIX, '');
    const [orgId, eventType] = channelName.split(':');

    // Broadcast to all connections for this organization
    broadcastToOrganization(orgId, {
      type: eventType,
      data: JSON.parse(message),
    });
  });

  // Start heartbeat
  setInterval(sendHeartbeats, HEARTBEAT_INTERVAL);

  // Clean up stale connections
  setInterval(cleanupStaleConnections, 60000);

  console.log('SSE Publisher initialized');
}

/**
 * Register a new SSE connection
 */
export function registerConnection(
  userId: string,
  organizationId: string,
  response: Response,
  channels: EventChannel[] = ['metrics', 'alerts']
): SSEConnection {
  const connectionId = `${userId}-${Date.now()}`;

  // Set SSE headers
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');

  const connection: SSEConnection = {
    id: connectionId,
    userId,
    organizationId,
    response,
    subscribedChannels: new Set(channels),
    createdAt: new Date(),
    lastPingAt: new Date(),
  };

  // Add to connections map
  const orgConnections = connections.get(organizationId) || new Set();
  orgConnections.add(connection);
  connections.set(organizationId, orgConnections);

  // Handle client disconnect
  response.on('close', () => {
    unregisterConnection(connection);
  });

  // Send initial connection event
  sendEvent(connection, {
    type: 'connected',
    data: {
      connectionId,
      channels: Array.from(connection.subscribedChannels),
    },
  });

  // Send initial data
  sendInitialData(connection);

  return connection;
}

/**
 * Unregister an SSE connection
 */
export function unregisterConnection(connection: SSEConnection): void {
  const orgConnections = connections.get(connection.organizationId);
  if (orgConnections) {
    orgConnections.delete(connection);
    if (orgConnections.size === 0) {
      connections.delete(connection.organizationId);
    }
  }
}

/**
 * Send an event to a specific connection
 */
export function sendEvent(connection: SSEConnection, event: SSEEvent): void {
  try {
    let message = '';

    if (event.id) {
      message += `id: ${event.id}\n`;
    }

    if (event.retry) {
      message += `retry: ${event.retry}\n`;
    }

    message += `event: ${event.type}\n`;
    message += `data: ${JSON.stringify(event.data)}\n\n`;

    connection.response.write(message);
    connection.lastPingAt = new Date();
  } catch (error) {
    console.error('Failed to send SSE event:', error);
    unregisterConnection(connection);
  }
}

/**
 * Broadcast an event to all connections for an organization
 */
export function broadcastToOrganization(
  organizationId: string,
  event: SSEEvent
): void {
  const orgConnections = connections.get(organizationId);
  if (!orgConnections) return;

  for (const connection of orgConnections) {
    // Check if connection is subscribed to this event type
    const eventChannel = getEventChannel(event.type);
    if (eventChannel && !connection.subscribedChannels.has(eventChannel)) {
      continue;
    }

    sendEvent(connection, event);
  }
}

/**
 * Publish an event through Redis for distributed broadcasting
 */
export async function publishEvent(
  organizationId: string,
  eventType: string,
  data: unknown
): Promise<void> {
  const channel = `${CHANNEL_PREFIX}${organizationId}:${eventType}`;
  await redis.publish(channel, JSON.stringify(data));
}

/**
 * Send initial data to a new connection
 */
async function sendInitialData(connection: SSEConnection): Promise<void> {
  const { organizationId, subscribedChannels } = connection;

  try {
    // Send metrics if subscribed
    if (subscribedChannels.has('metrics')) {
      const metrics = await metricsAggregator.getAggregatedMetrics(organizationId);
      sendEvent(connection, {
        type: 'metrics_update',
        data: metrics,
      });
    }

    // Send alerts if subscribed
    if (subscribedChannels.has('alerts')) {
      const alerts = await alertManager.getActiveAlerts(organizationId);
      sendEvent(connection, {
        type: 'alerts_update',
        data: { alerts },
      });
    }
  } catch (error) {
    console.error('Failed to send initial data:', error);
  }
}

/**
 * Send heartbeats to all connections
 */
function sendHeartbeats(): void {
  const now = new Date();

  for (const orgConnections of connections.values()) {
    for (const connection of orgConnections) {
      sendEvent(connection, {
        type: 'heartbeat',
        data: { timestamp: now.toISOString() },
      });
    }
  }
}

/**
 * Clean up stale connections
 */
function cleanupStaleConnections(): void {
  const now = Date.now();

  for (const [orgId, orgConnections] of connections) {
    for (const connection of orgConnections) {
      const lastPing = connection.lastPingAt.getTime();
      if (now - lastPing > CONNECTION_TIMEOUT) {
        console.log(`Cleaning up stale connection: ${connection.id}`);
        unregisterConnection(connection);
      }
    }
  }
}

/**
 * Get the event channel for an event type
 */
function getEventChannel(eventType: string): EventChannel | null {
  if (eventType.startsWith('metrics')) return 'metrics';
  if (eventType.startsWith('alert')) return 'alerts';
  if (eventType.startsWith('bottleneck')) return 'bottlenecks';
  if (eventType.startsWith('workload')) return 'workload';
  if (eventType.startsWith('routing')) return 'routing';
  if (eventType.startsWith('compliance')) return 'compliance';
  if (eventType.startsWith('notification')) return 'notifications';
  return null;
}

/**
 * Update connection subscriptions
 */
export function updateSubscriptions(
  connectionId: string,
  channels: EventChannel[]
): boolean {
  for (const orgConnections of connections.values()) {
    for (const connection of orgConnections) {
      if (connection.id === connectionId) {
        connection.subscribedChannels = new Set(channels);
        sendEvent(connection, {
          type: 'subscriptions_updated',
          data: { channels },
        });
        return true;
      }
    }
  }
  return false;
}

/**
 * Get connection count for an organization
 */
export function getConnectionCount(organizationId: string): number {
  return connections.get(organizationId)?.size || 0;
}

/**
 * Get all active connection stats
 */
export function getConnectionStats(): {
  totalConnections: number;
  byOrganization: Record<string, number>;
} {
  const stats: { totalConnections: number; byOrganization: Record<string, number> } = {
    totalConnections: 0,
    byOrganization: {},
  };

  for (const [orgId, orgConnections] of connections) {
    stats.byOrganization[orgId] = orgConnections.size;
    stats.totalConnections += orgConnections.size;
  }

  return stats;
}

/**
 * Broadcast metrics update
 */
export async function broadcastMetricsUpdate(organizationId: string): Promise<void> {
  const metrics = await metricsAggregator.getAggregatedMetrics(organizationId, {
    forceRefresh: true,
  });

  await publishEvent(organizationId, 'metrics_update', metrics);
}

/**
 * Broadcast alert update
 */
export async function broadcastAlertUpdate(
  organizationId: string,
  alert: alertManager.Alert,
  action: 'created' | 'updated' | 'resolved'
): Promise<void> {
  await publishEvent(organizationId, `alert_${action}`, alert);

  // Also send updated alert list
  const alerts = await alertManager.getActiveAlerts(organizationId);
  await publishEvent(organizationId, 'alerts_update', { alerts });
}

/**
 * Broadcast workload update
 */
export async function broadcastWorkloadUpdate(organizationId: string): Promise<void> {
  const workloadDistribution = await import('./workloadDistribution');
  const data = await workloadDistribution.getWorkloadDistribution(organizationId);
  await publishEvent(organizationId, 'workload_update', data);
}

/**
 * Broadcast bottleneck update
 */
export async function broadcastBottleneckUpdate(organizationId: string): Promise<void> {
  const bottleneckDetector = await import('./bottleneckDetector');
  const data = await bottleneckDetector.detectBottlenecks(organizationId);
  await publishEvent(organizationId, 'bottleneck_update', data);
}

// Auto-initialize when module is loaded
initialize().catch(console.error);

export default {
  initialize,
  registerConnection,
  unregisterConnection,
  sendEvent,
  broadcastToOrganization,
  publishEvent,
  updateSubscriptions,
  getConnectionCount,
  getConnectionStats,
  broadcastMetricsUpdate,
  broadcastAlertUpdate,
  broadcastWorkloadUpdate,
  broadcastBottleneckUpdate,
};
