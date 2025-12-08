/**
 * Rate Limiting Service
 * SCALE Tier - Tasks T065-T069
 *
 * Sliding window rate limiter using Redis
 */

import { RateLimitTier } from '@prisma/client';

export interface RateLimitServiceConfig {
  redis?: RedisClient;
  windowSizeSeconds?: number;
}

// Redis client interface (compatible with ioredis)
interface RedisClient {
  multi(): RedisPipeline;
  zadd(key: string, score: number, member: string): Promise<number>;
  zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

interface RedisPipeline {
  zremrangebyscore(key: string, min: string | number, max: string | number): this;
  zadd(key: string, score: number, member: string): this;
  zcard(key: string): this;
  expire(key: string, seconds: number): this;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number;
}

// Rate limits per tier (requests per hour)
const TIER_LIMITS: Record<RateLimitTier, number> = {
  FREE: 100,
  STANDARD: 1000,
  PREMIUM: 10000,
};

export class RateLimitService {
  private redis?: RedisClient;
  private windowSizeSeconds: number;
  private inMemoryStore: Map<string, { timestamps: number[]; windowStart: number }>;

  constructor(config: RateLimitServiceConfig = {}) {
    this.redis = config.redis;
    this.windowSizeSeconds = config.windowSizeSeconds || 3600; // 1 hour
    this.inMemoryStore = new Map();
  }

  // ==========================================================================
  // T065-T066: Sliding Window Rate Limiter
  // ==========================================================================

  /**
   * Check if request is within rate limit
   */
  async checkLimit(
    identifier: string,
    tier: RateLimitTier
  ): Promise<RateLimitResult> {
    const limit = TIER_LIMITS[tier];
    const now = Date.now();
    const windowStart = now - this.windowSizeSeconds * 1000;

    if (this.redis) {
      return this.checkLimitRedis(identifier, limit, now, windowStart);
    } else {
      return this.checkLimitInMemory(identifier, limit, now, windowStart);
    }
  }

  /**
   * Record a request against the rate limit
   */
  async recordRequest(identifier: string, tier: RateLimitTier): Promise<RateLimitResult> {
    const limit = TIER_LIMITS[tier];
    const now = Date.now();
    const windowStart = now - this.windowSizeSeconds * 1000;

    if (this.redis) {
      return this.recordRequestRedis(identifier, limit, now, windowStart);
    } else {
      return this.recordRequestInMemory(identifier, limit, now, windowStart);
    }
  }

  // ==========================================================================
  // Redis Implementation (Production)
  // ==========================================================================

  /**
   * Check rate limit using Redis sorted set
   */
  private async checkLimitRedis(
    identifier: string,
    limit: number,
    now: number,
    windowStart: number
  ): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;

    // Remove expired entries and count current
    await this.redis!.zremrangebyscore(key, '-inf', windowStart);
    const count = await this.redis!.zcard(key);

    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(now + this.windowSizeSeconds * 1000);
    const allowed = count < limit;

    return {
      allowed,
      remaining,
      limit,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
    };
  }

  /**
   * Record request using Redis sorted set
   */
  private async recordRequestRedis(
    identifier: string,
    limit: number,
    now: number,
    windowStart: number
  ): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const requestId = `${now}:${Math.random().toString(36).slice(2)}`;

    // Atomic operation: remove old, add new, count
    const pipeline = this.redis!.multi();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zadd(key, now, requestId);
    pipeline.zcard(key);
    pipeline.expire(key, this.windowSizeSeconds);

    const results = await pipeline.exec();
    const count = results[2][1] as number;

    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(now + this.windowSizeSeconds * 1000);
    const allowed = count <= limit;

    return {
      allowed,
      remaining,
      limit,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
    };
  }

  // ==========================================================================
  // In-Memory Implementation (Development/Fallback)
  // ==========================================================================

  /**
   * Check rate limit using in-memory store
   */
  private checkLimitInMemory(
    identifier: string,
    limit: number,
    now: number,
    windowStart: number
  ): RateLimitResult {
    const entry = this.inMemoryStore.get(identifier);

    if (!entry) {
      return {
        allowed: true,
        remaining: limit,
        limit,
        resetAt: new Date(now + this.windowSizeSeconds * 1000),
      };
    }

    // Filter to only timestamps within the window
    const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);
    const count = validTimestamps.length;
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(now + this.windowSizeSeconds * 1000);
    const allowed = count < limit;

    return {
      allowed,
      remaining,
      limit,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
    };
  }

  /**
   * Record request using in-memory store
   */
  private recordRequestInMemory(
    identifier: string,
    limit: number,
    now: number,
    windowStart: number
  ): RateLimitResult {
    let entry = this.inMemoryStore.get(identifier);

    if (!entry) {
      entry = { timestamps: [], windowStart };
      this.inMemoryStore.set(identifier, entry);
    }

    // Remove old timestamps
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    // Add new timestamp
    entry.timestamps.push(now);

    const count = entry.timestamps.length;
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(now + this.windowSizeSeconds * 1000);
    const allowed = count <= limit;

    // Cleanup old entries periodically
    this.cleanupInMemory(windowStart);

    return {
      allowed,
      remaining,
      limit,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
    };
  }

  /**
   * Clean up old in-memory entries
   */
  private cleanupInMemory(windowStart: number): void {
    // Only cleanup occasionally to avoid performance hit
    if (Math.random() > 0.01) return;

    for (const [key, entry] of this.inMemoryStore.entries()) {
      const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);
      if (validTimestamps.length === 0) {
        this.inMemoryStore.delete(key);
      } else {
        entry.timestamps = validTimestamps;
      }
    }
  }

  // ==========================================================================
  // T067: Rate Limits Per Tier
  // ==========================================================================

  /**
   * Get rate limit for a tier
   */
  getLimitForTier(tier: RateLimitTier): number {
    return TIER_LIMITS[tier];
  }

  /**
   * Get all tier limits
   */
  getAllTierLimits(): Record<RateLimitTier, number> {
    return { ...TIER_LIMITS };
  }

  // ==========================================================================
  // T069: 429 Response Headers
  // ==========================================================================

  /**
   * Generate rate limit headers for response
   */
  generateHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
    };

    if (result.retryAfter !== undefined) {
      headers['Retry-After'] = result.retryAfter.toString();
    }

    return headers;
  }

  /**
   * Create rate limit identifier from request context
   */
  createIdentifier(applicationId: string, entityId?: string): string {
    return entityId ? `${applicationId}:${entityId}` : applicationId;
  }
}
