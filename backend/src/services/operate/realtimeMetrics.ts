/**
 * Real-Time Metrics Service for OPERATE Tier
 * T028 - Create real-time metrics ingestion service
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { logger } from '../../lib/logger.js';
import { insertWorkloadMetrics, WorkloadMetricRow, insertRoutingDecision, RoutingDecisionRow } from './timescaleClient.js';

// Singleton Redis instance
let redis: Redis | null = null;

/**
 * Get Redis instance for metrics
 */
export function getMetricsRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    redis.on('error', (err) => {
      logger.error({ error: err }, 'Redis metrics connection error');
    });

    logger.info('Redis metrics connection initialized');
  }

  return redis;
}

// =============================================================================
// Real-Time Metrics Event Emitter
// =============================================================================

export const metricsEmitter = new EventEmitter();

export type MetricEventType =
  | 'workload_update'
  | 'routing_decision'
  | 'alert_triggered'
  | 'compliance_check'
  | 'action_executed';

export interface MetricEvent<T = unknown> {
  type: MetricEventType;
  organizationId: string;
  timestamp: Date;
  data: T;
}

/**
 * Emit a metric event
 */
export function emitMetric<T>(event: MetricEvent<T>): void {
  metricsEmitter.emit(event.type, event);
  metricsEmitter.emit('metric', event);

  // Also publish to Redis for cross-instance communication
  const redis = getMetricsRedis();
  redis.publish(`metrics:${event.organizationId}`, JSON.stringify(event)).catch((err) => {
    logger.error({ error: err }, 'Failed to publish metric to Redis');
  });
}

// =============================================================================
// Metric Buffers for Batch Inserts
// =============================================================================

interface MetricBuffer<T> {
  items: T[];
  lastFlush: Date;
}

const workloadBuffer: MetricBuffer<WorkloadMetricRow> = {
  items: [],
  lastFlush: new Date(),
};

const routingBuffer: MetricBuffer<RoutingDecisionRow> = {
  items: [],
  lastFlush: new Date(),
};

const BUFFER_SIZE = 100;
const BUFFER_FLUSH_INTERVAL = 5000; // 5 seconds

/**
 * Add workload metric to buffer
 */
export function bufferWorkloadMetric(metric: WorkloadMetricRow): void {
  workloadBuffer.items.push(metric);

  if (workloadBuffer.items.length >= BUFFER_SIZE) {
    flushWorkloadBuffer();
  }
}

/**
 * Add routing decision to buffer
 */
export function bufferRoutingDecision(decision: RoutingDecisionRow): void {
  routingBuffer.items.push(decision);

  if (routingBuffer.items.length >= BUFFER_SIZE) {
    flushRoutingBuffer();
  }
}

/**
 * Flush workload buffer to TimescaleDB
 */
async function flushWorkloadBuffer(): Promise<void> {
  if (workloadBuffer.items.length === 0) return;

  const items = [...workloadBuffer.items];
  workloadBuffer.items = [];
  workloadBuffer.lastFlush = new Date();

  try {
    await insertWorkloadMetrics(items);
    logger.debug({ count: items.length }, 'Flushed workload metrics to TimescaleDB');
  } catch (error) {
    logger.error({ error, count: items.length }, 'Failed to flush workload metrics');
    // Re-add items to buffer on failure
    workloadBuffer.items.unshift(...items);
  }
}

/**
 * Flush routing buffer to TimescaleDB
 */
async function flushRoutingBuffer(): Promise<void> {
  if (routingBuffer.items.length === 0) return;

  const items = [...routingBuffer.items];
  routingBuffer.items = [];
  routingBuffer.lastFlush = new Date();

  try {
    for (const item of items) {
      await insertRoutingDecision(item);
    }
    logger.debug({ count: items.length }, 'Flushed routing decisions to TimescaleDB');
  } catch (error) {
    logger.error({ error, count: items.length }, 'Failed to flush routing decisions');
    // Re-add items to buffer on failure
    routingBuffer.items.unshift(...items);
  }
}

// Start buffer flush interval
setInterval(() => {
  flushWorkloadBuffer().catch(() => {});
  flushRoutingBuffer().catch(() => {});
}, BUFFER_FLUSH_INTERVAL);

// =============================================================================
// Real-Time Metric Queries (Redis)
// =============================================================================

const METRIC_TTL = 300; // 5 minutes

/**
 * Store current metric value in Redis
 */
export async function setCurrentMetric(
  organizationId: string,
  metricName: string,
  value: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const redis = getMetricsRedis();
  const key = `metric:${organizationId}:${metricName}`;
  const data = JSON.stringify({
    value,
    timestamp: new Date().toISOString(),
    ...metadata,
  });

  await redis.setex(key, METRIC_TTL, data);
}

/**
 * Get current metric value from Redis
 */
export async function getCurrentMetric(
  organizationId: string,
  metricName: string
): Promise<{ value: number; timestamp: Date; [key: string]: unknown } | null> {
  const redis = getMetricsRedis();
  const key = `metric:${organizationId}:${metricName}`;
  const data = await redis.get(key);

  if (!data) return null;

  const parsed = JSON.parse(data);
  return {
    ...parsed,
    timestamp: new Date(parsed.timestamp),
  };
}

/**
 * Get multiple current metrics
 */
export async function getCurrentMetrics(
  organizationId: string,
  metricNames: string[]
): Promise<Map<string, { value: number; timestamp: Date }>> {
  const redis = getMetricsRedis();
  const keys = metricNames.map(name => `metric:${organizationId}:${name}`);
  const values = await redis.mget(...keys);

  const result = new Map<string, { value: number; timestamp: Date }>();
  metricNames.forEach((name, index) => {
    if (values[index]) {
      const parsed = JSON.parse(values[index]!);
      result.set(name, {
        value: parsed.value,
        timestamp: new Date(parsed.timestamp),
      });
    }
  });

  return result;
}

// =============================================================================
// Workload Score Cache
// =============================================================================

/**
 * Update cached workload score for a person
 */
export async function updateWorkloadScore(
  organizationId: string,
  personId: string,
  score: number,
  burnoutRisk: number
): Promise<void> {
  const redis = getMetricsRedis();
  const key = `workload:${organizationId}:${personId}`;
  const data = JSON.stringify({
    workloadScore: score,
    burnoutRisk,
    timestamp: new Date().toISOString(),
  });

  await redis.setex(key, METRIC_TTL, data);

  // Also update in sorted set for ranking
  await redis.zadd(`workload:${organizationId}:ranking`, score, personId);
  await redis.zadd(`burnout:${organizationId}:ranking`, burnoutRisk, personId);
}

/**
 * Get cached workload score for a person
 */
export async function getWorkloadScore(
  organizationId: string,
  personId: string
): Promise<{ workloadScore: number; burnoutRisk: number; timestamp: Date } | null> {
  const redis = getMetricsRedis();
  const key = `workload:${organizationId}:${personId}`;
  const data = await redis.get(key);

  if (!data) return null;

  const parsed = JSON.parse(data);
  return {
    workloadScore: parsed.workloadScore,
    burnoutRisk: parsed.burnoutRisk,
    timestamp: new Date(parsed.timestamp),
  };
}

/**
 * Get top N people by workload score
 */
export async function getHighestWorkload(
  organizationId: string,
  limit: number = 10
): Promise<Array<{ personId: string; score: number }>> {
  const redis = getMetricsRedis();
  const results = await redis.zrevrange(
    `workload:${organizationId}:ranking`,
    0,
    limit - 1,
    'WITHSCORES'
  );

  const items: Array<{ personId: string; score: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    items.push({
      personId: results[i],
      score: parseFloat(results[i + 1]),
    });
  }

  return items;
}

/**
 * Get people with high burnout risk
 */
export async function getHighBurnoutRisk(
  organizationId: string,
  threshold: number = 70
): Promise<Array<{ personId: string; risk: number }>> {
  const redis = getMetricsRedis();
  const results = await redis.zrangebyscore(
    `burnout:${organizationId}:ranking`,
    threshold,
    100,
    'WITHSCORES'
  );

  const items: Array<{ personId: string; risk: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    items.push({
      personId: results[i],
      risk: parseFloat(results[i + 1]),
    });
  }

  return items.sort((a, b) => b.risk - a.risk);
}

// =============================================================================
// Pub/Sub for Real-Time Updates
// =============================================================================

/**
 * Subscribe to metric updates for an organization
 */
export function subscribeToMetrics(
  organizationId: string,
  callback: (event: MetricEvent) => void
): () => void {
  const redis = getMetricsRedis();
  const channel = `metrics:${organizationId}`;

  const subscriber = redis.duplicate();

  subscriber.subscribe(channel, (err) => {
    if (err) {
      logger.error({ error: err, channel }, 'Failed to subscribe to metrics channel');
    }
  });

  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        const event = JSON.parse(message) as MetricEvent;
        event.timestamp = new Date(event.timestamp);
        callback(event);
      } catch (error) {
        logger.error({ error, message }, 'Failed to parse metric event');
      }
    }
  });

  // Return unsubscribe function
  return () => {
    subscriber.unsubscribe(channel);
    subscriber.quit();
  };
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Flush all buffers and close connections
 */
export async function closeMetricsService(): Promise<void> {
  await flushWorkloadBuffer();
  await flushRoutingBuffer();

  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis metrics connection closed');
  }
}

export default {
  getMetricsRedis,
  emitMetric,
  bufferWorkloadMetric,
  bufferRoutingDecision,
  setCurrentMetric,
  getCurrentMetric,
  getCurrentMetrics,
  updateWorkloadScore,
  getWorkloadScore,
  getHighestWorkload,
  getHighBurnoutRisk,
  subscribeToMetrics,
  closeMetricsService,
  metricsEmitter,
};
