/**
 * Rate Limiting Middleware (T184)
 * Implements rate limiting to prevent abuse and ensure fair usage
 */

import { FastifyRequest, FastifyReply, FastifyInstance, HookHandlerDoneFunction } from 'fastify';
import { Redis } from 'ioredis';

// Rate limit configuration
interface RateLimitConfig {
  // Requests per window
  max: number;
  // Time window in seconds
  windowMs: number;
  // Key prefix for Redis
  keyPrefix?: string;
  // Skip rate limiting for certain conditions
  skip?: (request: FastifyRequest) => boolean;
  // Custom key generator
  keyGenerator?: (request: FastifyRequest) => string;
  // Handler when rate limit is exceeded
  onLimitReached?: (request: FastifyRequest, reply: FastifyReply) => void;
}

// Default configurations for different tiers
const RATE_LIMIT_TIERS = {
  // Standard API endpoints
  standard: {
    max: 100,
    windowMs: 60, // 100 requests per minute
  },
  // Read-heavy endpoints (list, search)
  read: {
    max: 200,
    windowMs: 60, // 200 requests per minute
  },
  // Write operations (create, update, delete)
  write: {
    max: 30,
    windowMs: 60, // 30 requests per minute
  },
  // Heavy operations (simulations, assessments, exports)
  heavy: {
    max: 10,
    windowMs: 60, // 10 requests per minute
  },
  // Authentication endpoints
  auth: {
    max: 10,
    windowMs: 300, // 10 requests per 5 minutes
  },
  // Export/download operations
  export: {
    max: 5,
    windowMs: 300, // 5 requests per 5 minutes
  },
};

// Redis client instance
let redisClient: Redis | null = null;

/**
 * Initialize Redis client for rate limiting
 */
export function initRateLimitRedis(redis: Redis): void {
  redisClient = redis;
}

/**
 * Create rate limit middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    max,
    windowMs,
    keyPrefix = 'rl',
    skip,
    keyGenerator,
    onLimitReached,
  } = config;

  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Check if rate limiting should be skipped
    if (skip && skip(request)) {
      return;
    }

    // Generate the rate limit key
    const key = keyGenerator
      ? keyGenerator(request)
      : generateDefaultKey(request, keyPrefix);

    try {
      const result = await checkRateLimit(key, max, windowMs);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', max);
      reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
      reply.header('X-RateLimit-Reset', result.resetTime);
      reply.header('X-RateLimit-Policy', `${max};w=${windowMs}`);

      if (result.limited) {
        // Rate limit exceeded
        reply.header('Retry-After', result.retryAfter);

        if (onLimitReached) {
          onLimitReached(request, reply);
        }

        return reply.status(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
          limit: max,
          windowSeconds: windowMs,
        });
      }
    } catch (error) {
      // If Redis is unavailable, log and allow the request
      request.log.error({ error }, 'Rate limit check failed');
      // Don't block requests if rate limiting fails
    }
  };
}

/**
 * Check rate limit using Redis sliding window
 */
async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{
  limited: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}> {
  if (!redisClient) {
    // If Redis is not available, allow all requests
    return {
      limited: false,
      remaining: max,
      resetTime: Math.floor(Date.now() / 1000) + windowMs,
      retryAfter: 0,
    };
  }

  const now = Date.now();
  const windowStart = now - windowMs * 1000;

  // Use Redis sorted set for sliding window rate limiting
  const multi = redisClient.multi();

  // Remove old entries outside the window
  multi.zremrangebyscore(key, 0, windowStart);

  // Count current requests in window
  multi.zcard(key);

  // Add current request
  multi.zadd(key, now, `${now}-${Math.random()}`);

  // Set expiry on the key
  multi.expire(key, windowMs + 1);

  const results = await multi.exec();

  if (!results) {
    return {
      limited: false,
      remaining: max,
      resetTime: Math.floor(now / 1000) + windowMs,
      retryAfter: 0,
    };
  }

  const currentCount = (results[1][1] as number) || 0;
  const remaining = Math.max(0, max - currentCount - 1);
  const resetTime = Math.floor((now + windowMs * 1000) / 1000);
  const limited = currentCount >= max;
  const retryAfter = limited ? windowMs : 0;

  return {
    limited,
    remaining,
    resetTime,
    retryAfter,
  };
}

/**
 * Generate default rate limit key
 */
function generateDefaultKey(request: FastifyRequest, prefix: string): string {
  // Use organization ID if available, otherwise IP
  const orgId = (request as any).organizationId;
  const userId = (request as any).user?.id;
  const ip = request.ip;

  if (orgId && userId) {
    return `${prefix}:org:${orgId}:user:${userId}`;
  } else if (orgId) {
    return `${prefix}:org:${orgId}:ip:${ip}`;
  } else {
    return `${prefix}:ip:${ip}`;
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  /**
   * Standard API rate limiter
   */
  standard: () =>
    rateLimit({
      ...RATE_LIMIT_TIERS.standard,
      keyPrefix: 'rl:std',
    }),

  /**
   * Read operations rate limiter
   */
  read: () =>
    rateLimit({
      ...RATE_LIMIT_TIERS.read,
      keyPrefix: 'rl:read',
    }),

  /**
   * Write operations rate limiter
   */
  write: () =>
    rateLimit({
      ...RATE_LIMIT_TIERS.write,
      keyPrefix: 'rl:write',
    }),

  /**
   * Heavy operations rate limiter (simulations, assessments)
   */
  heavy: () =>
    rateLimit({
      ...RATE_LIMIT_TIERS.heavy,
      keyPrefix: 'rl:heavy',
    }),

  /**
   * Authentication rate limiter
   */
  auth: () =>
    rateLimit({
      ...RATE_LIMIT_TIERS.auth,
      keyPrefix: 'rl:auth',
      keyGenerator: (request) => `rl:auth:ip:${request.ip}`,
    }),

  /**
   * Export rate limiter
   */
  export: () =>
    rateLimit({
      ...RATE_LIMIT_TIERS.export,
      keyPrefix: 'rl:export',
    }),

  /**
   * Custom rate limiter
   */
  custom: (config: RateLimitConfig) => rateLimit(config),
};

/**
 * Register rate limiting plugin for Fastify
 */
export async function registerRateLimiting(fastify: FastifyInstance): Promise<void> {
  // Initialize Redis client from existing connection
  const redis = (fastify as any).redis;
  if (redis) {
    initRateLimitRedis(redis);
  }

  // Add rate limit info to request
  fastify.decorateRequest('rateLimit', null);

  // Global rate limit hook (can be overridden per route)
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip rate limiting for health checks
    if (request.url === '/health' || request.url === '/ready') {
      return;
    }

    // Apply standard rate limiting globally
    const middleware = rateLimiters.standard();
    await middleware(request, reply);
  });

  fastify.log.info('Rate limiting middleware registered');
}

/**
 * Get current rate limit status for a key
 */
export async function getRateLimitStatus(
  key: string,
  max: number,
  windowMs: number
): Promise<{
  current: number;
  limit: number;
  remaining: number;
  resetTime: number;
}> {
  if (!redisClient) {
    return {
      current: 0,
      limit: max,
      remaining: max,
      resetTime: Math.floor(Date.now() / 1000) + windowMs,
    };
  }

  const now = Date.now();
  const windowStart = now - windowMs * 1000;

  // Remove old entries and count
  await redisClient.zremrangebyscore(key, 0, windowStart);
  const current = await redisClient.zcard(key);

  return {
    current,
    limit: max,
    remaining: Math.max(0, max - current),
    resetTime: Math.floor((now + windowMs * 1000) / 1000),
  };
}

/**
 * Clear rate limit for a specific key (admin use)
 */
export async function clearRateLimit(key: string): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  await redisClient.del(key);
  return true;
}

/**
 * Get all rate limit keys for an organization
 */
export async function getOrganizationRateLimits(
  organizationId: string
): Promise<string[]> {
  if (!redisClient) {
    return [];
  }

  const keys = await redisClient.keys(`rl:*:org:${organizationId}:*`);
  return keys;
}

export default rateLimit;
