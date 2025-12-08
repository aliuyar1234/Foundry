/**
 * SSE Connection Pool Manager
 * T245 - Optimized SSE connection management
 *
 * Provides advanced connection pooling, load balancing,
 * and resource management for SSE connections
 */

import { FastifyReply } from 'fastify';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// Types
interface PoolConfig {
  maxConnectionsPerUser: number;
  maxConnectionsPerOrg: number;
  maxTotalConnections: number;
  connectionTimeout: number;
  pingInterval: number;
  cleanupInterval: number;
  enableCompression: boolean;
  maxMessageQueueSize: number;
  backpressureThreshold: number;
}

interface PooledConnection {
  id: string;
  userId: string;
  organizationId: string;
  reply: FastifyReply;
  channels: Set<string>;
  createdAt: Date;
  lastActivity: Date;
  messagesSent: number;
  bytesWritten: number;
  pendingMessages: QueuedMessage[];
  isWritable: boolean;
  metadata: Record<string, unknown>;
}

interface QueuedMessage {
  id: string;
  event?: string;
  data: unknown;
  priority: 'high' | 'normal' | 'low';
  timestamp: Date;
  expiry?: Date;
}

interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  connectionsByOrg: Record<string, number>;
  connectionsByUser: Record<string, number>;
  totalMessagesSent: number;
  totalBytesWritten: number;
  droppedMessages: number;
  averageLatencyMs: number;
}

interface ConnectionPoolEvents {
  'connection:added': (connection: PooledConnection) => void;
  'connection:removed': (connectionId: string, reason: string) => void;
  'connection:error': (connectionId: string, error: Error) => void;
  'message:sent': (connectionId: string, messageId: string) => void;
  'message:dropped': (connectionId: string, messageId: string, reason: string) => void;
  'pool:full': (organizationId: string) => void;
  'pool:backpressure': (connectionId: string) => void;
}

// Default configuration
const DEFAULT_CONFIG: PoolConfig = {
  maxConnectionsPerUser: 5,
  maxConnectionsPerOrg: 1000,
  maxTotalConnections: 10000,
  connectionTimeout: 120000, // 2 minutes
  pingInterval: 30000, // 30 seconds
  cleanupInterval: 60000, // 1 minute
  enableCompression: false,
  maxMessageQueueSize: 100,
  backpressureThreshold: 50,
};

/**
 * SSE Connection Pool Manager
 */
class SSEConnectionPool extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private orgConnections: Map<string, Set<string>> = new Map();
  private channelSubscribers: Map<string, Set<string>> = new Map();
  private config: PoolConfig;
  private pingTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats: {
    totalMessagesSent: number;
    totalBytesWritten: number;
    droppedMessages: number;
    latencies: number[];
  };

  constructor(config?: Partial<PoolConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalMessagesSent: 0,
      totalBytesWritten: 0,
      droppedMessages: 0,
      latencies: [],
    };

    this.startTimers();
  }

  /**
   * Add a new connection to the pool
   */
  addConnection(
    reply: FastifyReply,
    userId: string,
    organizationId: string,
    channels: string[] = ['system'],
    metadata?: Record<string, unknown>
  ): string | null {
    // Check pool limits
    if (!this.canAddConnection(userId, organizationId)) {
      return null;
    }

    const connectionId = this.generateConnectionId();

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      ...(this.config.enableCompression && { 'Content-Encoding': 'gzip' }),
    });

    const connection: PooledConnection = {
      id: connectionId,
      userId,
      organizationId,
      reply,
      channels: new Set(channels),
      createdAt: new Date(),
      lastActivity: new Date(),
      messagesSent: 0,
      bytesWritten: 0,
      pendingMessages: [],
      isWritable: true,
      metadata: metadata || {},
    };

    // Track connection
    this.connections.set(connectionId, connection);
    this.trackUserConnection(userId, connectionId);
    this.trackOrgConnection(organizationId, connectionId);

    // Subscribe to channels
    for (const channel of channels) {
      this.subscribeToChannel(connectionId, channel, organizationId);
    }

    // Handle connection events
    this.setupConnectionHandlers(connection);

    // Send connection confirmation
    this.sendToConnection(connectionId, {
      event: 'connected',
      data: {
        connectionId,
        channels,
        timestamp: new Date().toISOString(),
      },
      priority: 'high',
      timestamp: new Date(),
      id: this.generateMessageId(),
    });

    this.emit('connection:added', connection);
    return connectionId;
  }

  /**
   * Remove a connection from the pool
   */
  removeConnection(connectionId: string, reason = 'closed'): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Unsubscribe from channels
    for (const channel of connection.channels) {
      this.unsubscribeFromChannel(connectionId, channel, connection.organizationId);
    }

    // Remove from tracking
    this.untrackUserConnection(connection.userId, connectionId);
    this.untrackOrgConnection(connection.organizationId, connectionId);

    // Close connection
    try {
      connection.reply.raw.end();
    } catch {
      // Connection may already be closed
    }

    this.connections.delete(connectionId);
    this.emit('connection:removed', connectionId, reason);
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(
    connectionId: string,
    message: QueuedMessage
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    // Check backpressure
    if (connection.pendingMessages.length >= this.config.maxMessageQueueSize) {
      // Drop lowest priority messages
      const dropped = this.dropLowPriorityMessages(connection);
      if (dropped > 0) {
        this.stats.droppedMessages += dropped;
      }
    }

    // Queue message if connection is not writable
    if (!connection.isWritable) {
      if (connection.pendingMessages.length < this.config.maxMessageQueueSize) {
        connection.pendingMessages.push(message);
        return true;
      }
      this.stats.droppedMessages++;
      this.emit('message:dropped', connectionId, message.id, 'queue_full');
      return false;
    }

    // Send message
    return this.writeMessage(connection, message);
  }

  /**
   * Broadcast to a channel
   */
  broadcast(
    organizationId: string,
    channel: string,
    event: string,
    data: unknown,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): number {
    const key = `${organizationId}:${channel}`;
    const subscribers = this.channelSubscribers.get(key);
    if (!subscribers || subscribers.size === 0) return 0;

    const message: QueuedMessage = {
      id: this.generateMessageId(),
      event,
      data,
      priority,
      timestamp: new Date(),
    };

    let sentCount = 0;
    for (const connectionId of subscribers) {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Broadcast to user's connections
   */
  broadcastToUser(
    userId: string,
    event: string,
    data: unknown,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): number {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds || connectionIds.size === 0) return 0;

    const message: QueuedMessage = {
      id: this.generateMessageId(),
      event,
      data,
      priority,
      timestamp: new Date(),
    };

    let sentCount = 0;
    for (const connectionId of connectionIds) {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Broadcast to organization
   */
  broadcastToOrg(
    organizationId: string,
    event: string,
    data: unknown,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): number {
    const connectionIds = this.orgConnections.get(organizationId);
    if (!connectionIds || connectionIds.size === 0) return 0;

    const message: QueuedMessage = {
      id: this.generateMessageId(),
      event,
      data,
      priority,
      timestamp: new Date(),
    };

    let sentCount = 0;
    for (const connectionId of connectionIds) {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Subscribe connection to channel
   */
  subscribeToChannel(
    connectionId: string,
    channel: string,
    organizationId: string
  ): void {
    const key = `${organizationId}:${channel}`;
    if (!this.channelSubscribers.has(key)) {
      this.channelSubscribers.set(key, new Set());
    }
    this.channelSubscribers.get(key)!.add(connectionId);

    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.channels.add(channel);
    }
  }

  /**
   * Unsubscribe connection from channel
   */
  unsubscribeFromChannel(
    connectionId: string,
    channel: string,
    organizationId: string
  ): void {
    const key = `${organizationId}:${channel}`;
    const subscribers = this.channelSubscribers.get(key);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(key);
      }
    }

    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.channels.delete(channel);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const connectionsByOrg: Record<string, number> = {};
    const connectionsByUser: Record<string, number> = {};

    for (const [orgId, connections] of this.orgConnections) {
      connectionsByOrg[orgId] = connections.size;
    }

    for (const [userId, connections] of this.userConnections) {
      connectionsByUser[userId] = connections.size;
    }

    const avgLatency = this.stats.latencies.length > 0
      ? this.stats.latencies.reduce((a, b) => a + b, 0) / this.stats.latencies.length
      : 0;

    return {
      totalConnections: this.connections.size,
      activeConnections: Array.from(this.connections.values()).filter((c) => c.isWritable).length,
      connectionsByOrg,
      connectionsByUser,
      totalMessagesSent: this.stats.totalMessagesSent,
      totalBytesWritten: this.stats.totalBytesWritten,
      droppedMessages: this.stats.droppedMessages,
      averageLatencyMs: avgLatency,
    };
  }

  /**
   * Get connection info
   */
  getConnection(connectionId: string): PooledConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    const connections = this.userConnections.get(userId);
    return connections !== undefined && connections.size > 0;
  }

  /**
   * Get user's connection count
   */
  getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }

  /**
   * Get organization's connection count
   */
  getOrgConnectionCount(organizationId: string): number {
    return this.orgConnections.get(organizationId)?.size || 0;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    // Stop timers
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all connections
    const closePromises: Promise<void>[] = [];
    for (const connectionId of this.connections.keys()) {
      closePromises.push(
        new Promise((resolve) => {
          this.removeConnection(connectionId, 'shutdown');
          resolve();
        })
      );
    }

    await Promise.all(closePromises);
  }

  // ==========================================
  // Private methods
  // ==========================================

  private canAddConnection(userId: string, organizationId: string): boolean {
    // Check total limit
    if (this.connections.size >= this.config.maxTotalConnections) {
      this.emit('pool:full', organizationId);
      return false;
    }

    // Check org limit
    const orgCount = this.orgConnections.get(organizationId)?.size || 0;
    if (orgCount >= this.config.maxConnectionsPerOrg) {
      this.emit('pool:full', organizationId);
      return false;
    }

    // Check user limit
    const userCount = this.userConnections.get(userId)?.size || 0;
    if (userCount >= this.config.maxConnectionsPerUser) {
      return false;
    }

    return true;
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private trackUserConnection(userId: string, connectionId: string): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }

  private untrackUserConnection(userId: string, connectionId: string): void {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  private trackOrgConnection(organizationId: string, connectionId: string): void {
    if (!this.orgConnections.has(organizationId)) {
      this.orgConnections.set(organizationId, new Set());
    }
    this.orgConnections.get(organizationId)!.add(connectionId);
  }

  private untrackOrgConnection(organizationId: string, connectionId: string): void {
    const connections = this.orgConnections.get(organizationId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.orgConnections.delete(organizationId);
      }
    }
  }

  private setupConnectionHandlers(connection: PooledConnection): void {
    const raw = connection.reply.raw;

    raw.on('close', () => {
      this.removeConnection(connection.id, 'client_closed');
    });

    raw.on('error', (error: Error) => {
      this.emit('connection:error', connection.id, error);
      this.removeConnection(connection.id, 'error');
    });

    raw.on('drain', () => {
      connection.isWritable = true;
      this.flushPendingMessages(connection);
    });
  }

  private writeMessage(connection: PooledConnection, message: QueuedMessage): boolean {
    const startTime = Date.now();

    try {
      const formatted = this.formatMessage(message);
      const buffer = Buffer.from(formatted);

      const canWrite = connection.reply.raw.write(buffer);

      if (!canWrite) {
        connection.isWritable = false;
        this.emit('pool:backpressure', connection.id);
      }

      // Update stats
      connection.messagesSent++;
      connection.bytesWritten += buffer.length;
      connection.lastActivity = new Date();
      this.stats.totalMessagesSent++;
      this.stats.totalBytesWritten += buffer.length;

      // Track latency
      const latency = Date.now() - startTime;
      this.stats.latencies.push(latency);
      if (this.stats.latencies.length > 1000) {
        this.stats.latencies.shift();
      }

      this.emit('message:sent', connection.id, message.id);
      return true;
    } catch (error) {
      this.emit('connection:error', connection.id, error as Error);
      this.removeConnection(connection.id, 'write_error');
      return false;
    }
  }

  private formatMessage(message: QueuedMessage): string {
    let formatted = '';

    if (message.id) {
      formatted += `id: ${message.id}\n`;
    }

    if (message.event) {
      formatted += `event: ${message.event}\n`;
    }

    const data = typeof message.data === 'string'
      ? message.data
      : JSON.stringify(message.data);

    const lines = data.split('\n');
    for (const line of lines) {
      formatted += `data: ${line}\n`;
    }

    formatted += '\n';
    return formatted;
  }

  private flushPendingMessages(connection: PooledConnection): void {
    while (connection.pendingMessages.length > 0 && connection.isWritable) {
      const message = connection.pendingMessages.shift()!;

      // Check if message expired
      if (message.expiry && new Date() > message.expiry) {
        this.stats.droppedMessages++;
        continue;
      }

      if (!this.writeMessage(connection, message)) {
        // Put message back if write failed
        connection.pendingMessages.unshift(message);
        break;
      }
    }
  }

  private dropLowPriorityMessages(connection: PooledConnection): number {
    const before = connection.pendingMessages.length;

    // Sort by priority and drop low priority first
    connection.pendingMessages.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Keep only high and some normal priority
    const keepCount = Math.floor(this.config.maxMessageQueueSize * 0.7);
    connection.pendingMessages = connection.pendingMessages.slice(0, keepCount);

    return before - connection.pendingMessages.length;
  }

  private startTimers(): void {
    // Ping timer
    this.pingTimer = setInterval(() => {
      this.sendPings();
    }, this.config.pingInterval);

    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleConnections();
    }, this.config.cleanupInterval);
  }

  private sendPings(): void {
    const pingMessage: QueuedMessage = {
      id: this.generateMessageId(),
      event: 'ping',
      data: { timestamp: new Date().toISOString() },
      priority: 'low',
      timestamp: new Date(),
    };

    for (const [connectionId, connection] of this.connections) {
      if (connection.isWritable) {
        this.writeMessage(connection, pingMessage);
      }
    }
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [connectionId, connection] of this.connections) {
      const age = now - connection.lastActivity.getTime();
      if (age > this.config.connectionTimeout) {
        staleIds.push(connectionId);
      }
    }

    for (const connectionId of staleIds) {
      this.removeConnection(connectionId, 'timeout');
    }
  }
}

// Singleton instance
let pool: SSEConnectionPool | null = null;

/**
 * Get or create the connection pool instance
 */
export function getConnectionPool(config?: Partial<PoolConfig>): SSEConnectionPool {
  if (!pool) {
    pool = new SSEConnectionPool(config);
  }
  return pool;
}

/**
 * Shutdown the connection pool
 */
export async function shutdownPool(): Promise<void> {
  if (pool) {
    await pool.shutdown();
    pool = null;
  }
}

// Export types and classes
export type {
  PoolConfig,
  PooledConnection,
  QueuedMessage,
  PoolStats,
  ConnectionPoolEvents,
};

export { SSEConnectionPool };

export default {
  getConnectionPool,
  shutdownPool,
};
