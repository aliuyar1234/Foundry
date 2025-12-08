/**
 * Connector Health Check Service
 * Task: T007
 *
 * Monitors and reports health status for all connector instances.
 * Supports scheduled health checks, alerting, and status aggregation.
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { HealthCheckResult, IDataConnector } from '../../connectors/base/connector';

export interface ConnectorHealth {
  connectorType: string;
  instanceId: string;
  organizationId: string;
  health: HealthCheckResult;
  lastCheck: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  uptimePercent?: number;
  averageLatencyMs?: number;
}

export interface HealthCheckConfig {
  intervalMs?: number; // Default: 60000 (1 minute)
  timeoutMs?: number; // Default: 30000 (30 seconds)
  failureThreshold?: number; // Failures before alert, default: 3
  successThreshold?: number; // Successes to clear alert, default: 2
  retentionHours?: number; // History retention, default: 24
}

export interface HealthCheckEvent {
  type: 'healthy' | 'unhealthy' | 'degraded' | 'recovered' | 'check_complete';
  connector: {
    type: string;
    instanceId: string;
    organizationId: string;
  };
  health: HealthCheckResult;
  previousHealth?: HealthCheckResult;
  timestamp: Date;
}

export type HealthCheckEventHandler = (event: HealthCheckEvent) => void;

interface HealthHistory {
  timestamp: Date;
  healthy: boolean;
  latencyMs?: number;
  status: string;
}

export class HealthCheckService extends EventEmitter {
  private redis: Redis | null;
  private connectors: Map<string, IDataConnector> = new Map();
  private healthStates: Map<string, ConnectorHealth> = new Map();
  private healthHistory: Map<string, HealthHistory[]> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: Required<HealthCheckConfig>;
  private keyPrefix: string;

  constructor(
    redis: Redis | null,
    config: HealthCheckConfig = {}
  ) {
    super();
    this.redis = redis;
    this.keyPrefix = 'connector:health';
    this.config = {
      intervalMs: config.intervalMs || 60000,
      timeoutMs: config.timeoutMs || 30000,
      failureThreshold: config.failureThreshold || 3,
      successThreshold: config.successThreshold || 2,
      retentionHours: config.retentionHours || 24,
    };
  }

  /**
   * Register a connector for health monitoring
   */
  registerConnector(connector: IDataConnector): void {
    const key = this.getKey(connector.type, connector.dataSourceId);
    this.connectors.set(key, connector);

    // Initialize health state
    if (!this.healthStates.has(key)) {
      this.healthStates.set(key, {
        connectorType: connector.type,
        instanceId: connector.dataSourceId,
        organizationId: connector.organizationId,
        health: {
          healthy: false,
          status: 'disconnected',
        },
        lastCheck: new Date(0),
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      });
    }
  }

  /**
   * Unregister a connector from health monitoring
   */
  unregisterConnector(connectorType: string, instanceId: string): void {
    const key = this.getKey(connectorType, instanceId);
    this.connectors.delete(key);
    this.stopMonitoring(connectorType, instanceId);
  }

  /**
   * Start continuous health monitoring for a connector
   */
  startMonitoring(
    connectorType: string,
    instanceId: string,
    intervalMs?: number
  ): void {
    const key = this.getKey(connectorType, instanceId);

    // Clear existing interval if any
    this.stopMonitoring(connectorType, instanceId);

    const interval = setInterval(
      () => this.checkHealth(connectorType, instanceId),
      intervalMs || this.config.intervalMs
    );

    this.checkIntervals.set(key, interval);

    // Run initial check
    this.checkHealth(connectorType, instanceId);
  }

  /**
   * Stop continuous health monitoring for a connector
   */
  stopMonitoring(connectorType: string, instanceId: string): void {
    const key = this.getKey(connectorType, instanceId);
    const interval = this.checkIntervals.get(key);

    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(key);
    }
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
  }

  /**
   * Perform a health check for a specific connector
   */
  async checkHealth(
    connectorType: string,
    instanceId: string
  ): Promise<HealthCheckResult> {
    const key = this.getKey(connectorType, instanceId);
    const connector = this.connectors.get(key);

    if (!connector) {
      return {
        healthy: false,
        status: 'error',
        error: 'Connector not registered',
      };
    }

    const previousHealth = this.healthStates.get(key)?.health;
    let result: HealthCheckResult;

    try {
      // Run health check with timeout
      result = await this.withTimeout(
        connector.healthCheck(),
        this.config.timeoutMs
      );
    } catch (error) {
      result = {
        healthy: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }

    // Update state
    await this.updateHealthState(key, connector, result);

    // Record history
    this.recordHistory(key, result);

    // Emit events
    this.emitHealthEvent(connector, result, previousHealth);

    return result;
  }

  /**
   * Check health for all registered connectors
   */
  async checkAllHealth(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();

    const checks = Array.from(this.connectors.entries()).map(
      async ([key, connector]) => {
        const result = await this.checkHealth(
          connector.type,
          connector.dataSourceId
        );
        results.set(key, result);
      }
    );

    await Promise.all(checks);
    return results;
  }

  /**
   * Get current health status for a connector
   */
  getHealth(connectorType: string, instanceId: string): ConnectorHealth | null {
    const key = this.getKey(connectorType, instanceId);
    return this.healthStates.get(key) || null;
  }

  /**
   * Get health status for all connectors
   */
  getAllHealth(): ConnectorHealth[] {
    return Array.from(this.healthStates.values());
  }

  /**
   * Get health status for connectors in an organization
   */
  getOrganizationHealth(organizationId: string): ConnectorHealth[] {
    return Array.from(this.healthStates.values()).filter(
      (h) => h.organizationId === organizationId
    );
  }

  /**
   * Get unhealthy connectors
   */
  getUnhealthyConnectors(): ConnectorHealth[] {
    return Array.from(this.healthStates.values()).filter(
      (h) => !h.health.healthy
    );
  }

  /**
   * Get health history for a connector
   */
  getHealthHistory(
    connectorType: string,
    instanceId: string,
    limitHours?: number
  ): HealthHistory[] {
    const key = this.getKey(connectorType, instanceId);
    const history = this.healthHistory.get(key) || [];

    if (limitHours) {
      const cutoff = new Date(Date.now() - limitHours * 60 * 60 * 1000);
      return history.filter((h) => new Date(h.timestamp) > cutoff);
    }

    return history;
  }

  /**
   * Calculate uptime percentage
   */
  calculateUptime(
    connectorType: string,
    instanceId: string,
    hoursBack: number = 24
  ): number {
    const history = this.getHealthHistory(connectorType, instanceId, hoursBack);

    if (history.length === 0) {
      return 0;
    }

    const healthyCount = history.filter((h) => h.healthy).length;
    return (healthyCount / history.length) * 100;
  }

  /**
   * Calculate average latency
   */
  calculateAverageLatency(
    connectorType: string,
    instanceId: string,
    hoursBack: number = 24
  ): number | null {
    const history = this.getHealthHistory(connectorType, instanceId, hoursBack);
    const withLatency = history.filter((h) => h.latencyMs !== undefined);

    if (withLatency.length === 0) {
      return null;
    }

    const sum = withLatency.reduce((acc, h) => acc + (h.latencyMs || 0), 0);
    return sum / withLatency.length;
  }

  /**
   * Get aggregated health summary
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    disconnected: number;
    averageLatencyMs: number | null;
    overallStatus: 'healthy' | 'degraded' | 'critical';
  } {
    const states = Array.from(this.healthStates.values());
    const total = states.length;

    const healthy = states.filter((s) => s.health.status === 'connected').length;
    const degraded = states.filter((s) => s.health.status === 'degraded').length;
    const unhealthy = states.filter((s) => s.health.status === 'error').length;
    const disconnected = states.filter(
      (s) => s.health.status === 'disconnected'
    ).length;

    const latencies = states
      .filter((s) => s.averageLatencyMs !== undefined)
      .map((s) => s.averageLatencyMs!);

    const averageLatencyMs =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : null;

    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (unhealthy + disconnected > total * 0.5) {
      overallStatus = 'critical';
    } else if (unhealthy + disconnected + degraded > 0) {
      overallStatus = 'degraded';
    }

    return {
      total,
      healthy,
      degraded,
      unhealthy,
      disconnected,
      averageLatencyMs,
      overallStatus,
    };
  }

  /**
   * Subscribe to health events
   */
  onHealthEvent(handler: HealthCheckEventHandler): () => void {
    this.on('health', handler);
    return () => this.off('health', handler);
  }

  // Private methods

  private getKey(connectorType: string, instanceId: string): string {
    return `${connectorType}:${instanceId}`;
  }

  private async updateHealthState(
    key: string,
    connector: IDataConnector,
    result: HealthCheckResult
  ): Promise<void> {
    const existing = this.healthStates.get(key);
    const now = new Date();

    let consecutiveFailures = existing?.consecutiveFailures || 0;
    let consecutiveSuccesses = existing?.consecutiveSuccesses || 0;

    if (result.healthy) {
      consecutiveSuccesses++;
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      consecutiveSuccesses = 0;
    }

    const uptimePercent = this.calculateUptime(
      connector.type,
      connector.dataSourceId
    );
    const averageLatencyMs = this.calculateAverageLatency(
      connector.type,
      connector.dataSourceId
    );

    const health: ConnectorHealth = {
      connectorType: connector.type,
      instanceId: connector.dataSourceId,
      organizationId: connector.organizationId,
      health: result,
      lastCheck: now,
      consecutiveFailures,
      consecutiveSuccesses,
      uptimePercent,
      averageLatencyMs: averageLatencyMs || undefined,
    };

    this.healthStates.set(key, health);

    // Persist to Redis if available
    if (this.redis) {
      await this.redis.set(
        `${this.keyPrefix}:${key}`,
        JSON.stringify(health),
        'EX',
        this.config.retentionHours * 3600
      );
    }
  }

  private recordHistory(key: string, result: HealthCheckResult): void {
    let history = this.healthHistory.get(key) || [];

    history.push({
      timestamp: new Date(),
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      status: result.status,
    });

    // Trim old entries
    const cutoff = new Date(
      Date.now() - this.config.retentionHours * 60 * 60 * 1000
    );
    history = history.filter((h) => new Date(h.timestamp) > cutoff);

    this.healthHistory.set(key, history);
  }

  private emitHealthEvent(
    connector: IDataConnector,
    health: HealthCheckResult,
    previousHealth?: HealthCheckResult
  ): void {
    const connectorInfo = {
      type: connector.type,
      instanceId: connector.dataSourceId,
      organizationId: connector.organizationId,
    };

    // Determine event type
    let eventType: HealthCheckEvent['type'] = 'check_complete';

    if (previousHealth) {
      if (!previousHealth.healthy && health.healthy) {
        eventType = 'recovered';
      } else if (previousHealth.healthy && !health.healthy) {
        eventType = 'unhealthy';
      } else if (health.status === 'degraded' && previousHealth.status !== 'degraded') {
        eventType = 'degraded';
      } else if (health.healthy) {
        eventType = 'healthy';
      }
    }

    const event: HealthCheckEvent = {
      type: eventType,
      connector: connectorInfo,
      health,
      previousHealth,
      timestamp: new Date(),
    };

    this.emit('health', event);

    // Emit specific event types
    if (eventType !== 'check_complete') {
      this.emit(eventType, event);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}

/**
 * Singleton instance
 */
let healthCheckServiceInstance: HealthCheckService | null = null;

export function getHealthCheckService(
  redis?: Redis | null,
  config?: HealthCheckConfig
): HealthCheckService {
  if (!healthCheckServiceInstance) {
    healthCheckServiceInstance = new HealthCheckService(redis || null, config);
  }
  return healthCheckServiceInstance;
}
