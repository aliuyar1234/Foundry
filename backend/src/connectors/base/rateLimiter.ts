/**
 * Rate Limiter Service
 * Task: T004
 *
 * Implements rate limiting with exponential backoff for API connectors.
 * Supports per-connector and per-endpoint rate limits.
 */

import { Redis } from 'ioredis';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RateLimitState {
  remainingRequests: number;
  resetAt: Date;
  isLimited: boolean;
  retryAfterMs?: number;
}

export interface RateLimitTier {
  tier: 'FREE' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

export const DEFAULT_RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  FREE: {
    tier: 'FREE',
    requestsPerHour: 100,
    requestsPerDay: 1000,
    burstLimit: 10,
  },
  STANDARD: {
    tier: 'STANDARD',
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    burstLimit: 50,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    requestsPerHour: 10000,
    requestsPerDay: 100000,
    burstLimit: 200,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    requestsPerHour: 50000,
    requestsPerDay: 500000,
    burstLimit: 500,
  },
};

export class RateLimiter {
  private redis: Redis | null;
  private localState: Map<string, { count: number; resetAt: number }> = new Map();
  private config: RateLimitConfig;
  private keyPrefix: string;

  constructor(
    redis: Redis | null,
    config: RateLimitConfig,
    keyPrefix: string = 'ratelimit'
  ) {
    this.redis = redis;
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      maxRetries: config.maxRetries ?? 5,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 60000,
    };
    this.keyPrefix = keyPrefix;
  }

  /**
   * Check if a request is allowed under the rate limit
   */
  async checkLimit(identifier: string): Promise<RateLimitState> {
    const key = `${this.keyPrefix}:${identifier}`;

    if (this.redis) {
      return this.checkRedisLimit(key);
    }
    return this.checkLocalLimit(key);
  }

  /**
   * Record a request against the rate limit
   */
  async recordRequest(identifier: string): Promise<RateLimitState> {
    const key = `${this.keyPrefix}:${identifier}`;

    if (this.redis) {
      return this.recordRedisRequest(key);
    }
    return this.recordLocalRequest(key);
  }

  /**
   * Wait for rate limit to reset with exponential backoff
   */
  async waitForReset(
    identifier: string,
    attempt: number = 0
  ): Promise<boolean> {
    const state = await this.checkLimit(identifier);

    if (!state.isLimited) {
      return true;
    }

    if (attempt >= (this.config.maxRetries ?? 5)) {
      return false;
    }

    const delay = this.calculateBackoff(attempt, state.retryAfterMs);
    await this.sleep(delay);

    return this.waitForReset(identifier, attempt + 1);
  }

  /**
   * Execute a function with rate limiting and automatic retry
   */
  async executeWithLimit<T>(
    identifier: string,
    fn: () => Promise<T>,
    onRateLimited?: (state: RateLimitState, attempt: number) => void
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      const state = await this.checkLimit(identifier);

      if (state.isLimited) {
        if (attempt >= (this.config.maxRetries ?? 5)) {
          throw new RateLimitError(
            `Rate limit exceeded after ${attempt} retries`,
            state
          );
        }

        onRateLimited?.(state, attempt);
        const delay = this.calculateBackoff(attempt, state.retryAfterMs);
        await this.sleep(delay);
        attempt++;
        continue;
      }

      try {
        await this.recordRequest(identifier);
        return await fn();
      } catch (error) {
        // Check if error is a rate limit response from the API
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          if (attempt >= (this.config.maxRetries ?? 5)) {
            throw error;
          }
          await this.sleep(retryAfter || this.calculateBackoff(attempt));
          attempt++;
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:${identifier}`;

    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.localState.delete(key);
    }
  }

  /**
   * Get current rate limit state without consuming a request
   */
  async getState(identifier: string): Promise<RateLimitState> {
    return this.checkLimit(identifier);
  }

  // Private methods

  private async checkRedisLimit(key: string): Promise<RateLimitState> {
    if (!this.redis) {
      return this.checkLocalLimit(key);
    }

    const multi = this.redis.multi();
    multi.get(key);
    multi.ttl(key);
    const results = await multi.exec();

    const count = results?.[0]?.[1] ? parseInt(results[0][1] as string, 10) : 0;
    const ttl = results?.[1]?.[1] as number;
    const resetAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date();

    const remaining = Math.max(0, this.config.maxRequests - count);
    const isLimited = remaining <= 0;

    return {
      remainingRequests: remaining,
      resetAt,
      isLimited,
      retryAfterMs: isLimited ? ttl * 1000 : undefined,
    };
  }

  private async recordRedisRequest(key: string): Promise<RateLimitState> {
    if (!this.redis) {
      return this.recordLocalRequest(key);
    }

    const windowSeconds = Math.ceil(this.config.windowMs / 1000);

    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, windowSeconds);
    const results = await multi.exec();

    const count = results?.[0]?.[1] as number;
    const remaining = Math.max(0, this.config.maxRequests - count);
    const isLimited = count > this.config.maxRequests;
    const resetAt = new Date(Date.now() + this.config.windowMs);

    return {
      remainingRequests: remaining,
      resetAt,
      isLimited,
      retryAfterMs: isLimited ? this.config.windowMs : undefined,
    };
  }

  private checkLocalLimit(key: string): RateLimitState {
    const now = Date.now();
    const state = this.localState.get(key);

    if (!state || state.resetAt <= now) {
      return {
        remainingRequests: this.config.maxRequests,
        resetAt: new Date(now + this.config.windowMs),
        isLimited: false,
      };
    }

    const remaining = Math.max(0, this.config.maxRequests - state.count);
    const isLimited = remaining <= 0;

    return {
      remainingRequests: remaining,
      resetAt: new Date(state.resetAt),
      isLimited,
      retryAfterMs: isLimited ? state.resetAt - now : undefined,
    };
  }

  private recordLocalRequest(key: string): RateLimitState {
    const now = Date.now();
    let state = this.localState.get(key);

    if (!state || state.resetAt <= now) {
      state = {
        count: 1,
        resetAt: now + this.config.windowMs,
      };
    } else {
      state.count++;
    }

    this.localState.set(key, state);

    const remaining = Math.max(0, this.config.maxRequests - state.count);
    const isLimited = state.count > this.config.maxRequests;

    return {
      remainingRequests: remaining,
      resetAt: new Date(state.resetAt),
      isLimited,
      retryAfterMs: isLimited ? state.resetAt - now : undefined,
    };
  }

  private calculateBackoff(attempt: number, suggestedDelay?: number): number {
    if (suggestedDelay && suggestedDelay > 0) {
      return Math.min(suggestedDelay, this.config.maxDelayMs ?? 60000);
    }

    // Exponential backoff with jitter
    const baseDelay = this.config.baseDelayMs ?? 1000;
    const maxDelay = this.config.maxDelayMs ?? 60000;
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;

    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429')
      );
    }
    if (typeof error === 'object' && error !== null) {
      const status = (error as Record<string, unknown>).status;
      return status === 429;
    }
    return false;
  }

  private extractRetryAfter(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
      const retryAfter = (error as Record<string, unknown>).retryAfter;
      if (typeof retryAfter === 'number') {
        return retryAfter * 1000;
      }
      if (typeof retryAfter === 'string') {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
    }
    return undefined;
  }
}

/**
 * Custom error for rate limit exceeded scenarios
 */
export class RateLimitError extends Error {
  public state: RateLimitState;

  constructor(message: string, state: RateLimitState) {
    super(message);
    this.name = 'RateLimitError';
    this.state = state;
  }
}

/**
 * Create a rate limiter for a specific connector type
 */
export function createConnectorRateLimiter(
  redis: Redis | null,
  connectorType: string,
  tier: RateLimitTier = DEFAULT_RATE_LIMIT_TIERS.STANDARD
): RateLimiter {
  return new RateLimiter(
    redis,
    {
      maxRequests: tier.requestsPerHour,
      windowMs: 60 * 60 * 1000, // 1 hour
    },
    `connector:${connectorType}`
  );
}

/**
 * Create rate limiters for different time windows
 */
export function createMultiWindowRateLimiter(
  redis: Redis | null,
  prefix: string,
  tier: RateLimitTier
): {
  hourly: RateLimiter;
  daily: RateLimiter;
  burst: RateLimiter;
} {
  return {
    hourly: new RateLimiter(
      redis,
      { maxRequests: tier.requestsPerHour, windowMs: 60 * 60 * 1000 },
      `${prefix}:hourly`
    ),
    daily: new RateLimiter(
      redis,
      { maxRequests: tier.requestsPerDay, windowMs: 24 * 60 * 60 * 1000 },
      `${prefix}:daily`
    ),
    burst: new RateLimiter(
      redis,
      { maxRequests: tier.burstLimit, windowMs: 1000 },
      `${prefix}:burst`
    ),
  };
}
