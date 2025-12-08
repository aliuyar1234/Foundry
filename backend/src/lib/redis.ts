/**
 * Redis Client Singleton
 * Provides a centralized Redis connection for caching, rate limiting, and token management
 */

import Redis from 'ioredis';
import { logger } from './logger.js';

// Singleton Redis client
let redisClient: Redis | null = null;

// Connection state tracking for health metrics
let connectionState: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';
let lastError: string | null = null;
let errorCount = 0;
let reconnectCount = 0;

const redisLogger = logger.child({ service: 'Redis' });

/**
 * Get or create the Redis client singleton
 */
export function getRedis(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    connectionState = 'connecting';

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // Connection pool settings
      lazyConnect: false,
      keepAlive: 30000,
      connectTimeout: 10000,
      // Retry strategy
      retryStrategy: (times: number) => {
        reconnectCount++;
        if (times > 10) {
          redisLogger.error(
            { reconnectAttempts: times, totalReconnects: reconnectCount },
            'Redis connection failed after 10 retries - giving up'
          );
          connectionState = 'error';
          return null;
        }
        const delay = Math.min(times * 200, 2000);
        redisLogger.warn(
          { reconnectAttempt: times, delayMs: delay },
          'Redis reconnecting'
        );
        return delay;
      },
    });

    redisClient.on('error', (error) => {
      errorCount++;
      lastError = error.message;
      connectionState = 'error';
      redisLogger.error(
        { error: error.message, errorCount, connectionState },
        'Redis connection error'
      );
    });

    redisClient.on('connect', () => {
      connectionState = 'connected';
      redisLogger.info(
        { connectionState, reconnectCount },
        'Redis connected'
      );
    });

    redisClient.on('ready', () => {
      connectionState = 'connected';
      redisLogger.info({ connectionState }, 'Redis ready');
    });

    redisClient.on('close', () => {
      connectionState = 'disconnected';
      redisLogger.warn({ connectionState }, 'Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      connectionState = 'connecting';
      redisLogger.info({ connectionState }, 'Redis reconnecting');
    });
  }

  return redisClient;
}

/**
 * Close the Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Check if Redis is connected and healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get Redis health metrics for monitoring/alerting
 */
export function getRedisHealthMetrics(): {
  connectionState: string;
  lastError: string | null;
  errorCount: number;
  reconnectCount: number;
  isHealthy: boolean;
} {
  return {
    connectionState,
    lastError,
    errorCount,
    reconnectCount,
    isHealthy: connectionState === 'connected',
  };
}

/**
 * Reset error counters (e.g., after successful recovery)
 */
export function resetRedisMetrics(): void {
  errorCount = 0;
  reconnectCount = 0;
  lastError = null;
  redisLogger.info('Redis metrics reset');
}

export { Redis };
export default getRedis;
