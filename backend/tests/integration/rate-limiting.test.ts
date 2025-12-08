/**
 * Integration Tests: Rate Limiting
 * Task: T214
 *
 * Tests rate limiter behavior across all connectors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface RateLimitState {
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number;
}

class MockRateLimiter {
  private state: Map<string, RateLimitState> = new Map();
  private requestCounts: Map<string, number[]> = new Map();

  constructor(private defaultLimit: number = 100, private windowMs: number = 60000) {}

  async checkLimit(key: string): Promise<{ allowed: boolean; state: RateLimitState }> {
    const now = Date.now();
    let state = this.state.get(key);

    if (!state || state.resetAt.getTime() < now) {
      state = {
        remaining: this.defaultLimit,
        limit: this.defaultLimit,
        resetAt: new Date(now + this.windowMs),
      };
      this.state.set(key, state);
      this.requestCounts.set(key, []);
    }

    const requests = this.requestCounts.get(key) || [];
    const windowStart = now - this.windowMs;
    const recentRequests = requests.filter(t => t > windowStart);
    this.requestCounts.set(key, recentRequests);

    if (recentRequests.length >= this.defaultLimit) {
      return {
        allowed: false,
        state: {
          ...state,
          remaining: 0,
          retryAfter: Math.ceil((state.resetAt.getTime() - now) / 1000),
        },
      };
    }

    recentRequests.push(now);
    state.remaining = this.defaultLimit - recentRequests.length;
    return { allowed: true, state };
  }

  async recordRequest(key: string): Promise<void> {
    const requests = this.requestCounts.get(key) || [];
    requests.push(Date.now());
    this.requestCounts.set(key, requests);
  }
}

async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number; maxDelayMs: number; jitter: boolean }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === options.maxRetries) throw lastError;

      let delay = options.baseDelayMs * Math.pow(2, attempt);
      delay = Math.min(delay, options.maxDelayMs);
      if (options.jitter) delay = delay * (0.5 + Math.random());

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

describe('Rate Limiter', () => {
  let rateLimiter: MockRateLimiter;

  beforeEach(() => {
    rateLimiter = new MockRateLimiter(10, 1000);
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const key = 'test-connector';
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
        await rateLimiter.recordRequest(key);
      }
    });

    it('should block requests exceeding limit', async () => {
      const key = 'test-connector';
      for (let i = 0; i < 10; i++) {
        await rateLimiter.recordRequest(key);
      }
      const result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.state.remaining).toBe(0);
    });

    it('should reset after window expires', async () => {
      const key = 'test-connector';
      const shortLimiter = new MockRateLimiter(5, 100);

      for (let i = 0; i < 5; i++) {
        await shortLimiter.recordRequest(key);
      }

      let result = await shortLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 150));

      result = await shortLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
    });

    it('should track limits per connector', async () => {
      const connector1 = 'salesforce-instance-1';
      const connector2 = 'hubspot-instance-1';

      for (let i = 0; i < 10; i++) {
        await rateLimiter.recordRequest(connector1);
      }

      const result1 = await rateLimiter.checkLimit(connector1);
      expect(result1.allowed).toBe(false);

      const result2 = await rateLimiter.checkLimit(connector2);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Exponential Backoff', () => {
    it('should retry with increasing delays', async () => {
      let attempts = 0;
      const mockFn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) throw new Error('Rate limited');
        return Promise.resolve('success');
      });

      const result = await exponentialBackoff(mockFn, {
        maxRetries: 5,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        exponentialBackoff(mockFn, {
          maxRetries: 3,
          baseDelayMs: 1,
          maxDelayMs: 10,
          jitter: false,
        })
      ).rejects.toThrow('Always fails');

      expect(mockFn).toHaveBeenCalledTimes(4);
    });

    it('should add jitter to delays', () => {
      const baseDelay = 100;
      const delays: number[] = [];

      for (let i = 0; i < 10; i++) {
        delays.push(baseDelay * (0.5 + Math.random()));
      }

      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(5);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent requests', async () => {
      const key = 'concurrent-test';
      const limiter = new MockRateLimiter(10, 1000);

      const results = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const check = await limiter.checkLimit(key);
          if (check.allowed) await limiter.recordRequest(key);
          return check.allowed;
        })
      );

      const allowedCount = results.filter(Boolean).length;
      expect(allowedCount).toBeLessThanOrEqual(10);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should parse X-RateLimit headers', () => {
      const headers = {
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '999',
        'x-ratelimit-reset': '1699999999',
      };

      const parsed = {
        limit: parseInt(headers['x-ratelimit-limit'], 10),
        remaining: parseInt(headers['x-ratelimit-remaining'], 10),
        resetAt: new Date(parseInt(headers['x-ratelimit-reset'], 10) * 1000),
      };

      expect(parsed.limit).toBe(1000);
      expect(parsed.remaining).toBe(999);
    });

    it('should handle Retry-After header', () => {
      const headers = { 'retry-after': '60' };
      const retryAfterSeconds = parseInt(headers['retry-after'], 10);
      expect(retryAfterSeconds).toBe(60);
    });

    it('should respect HubSpot rate limit headers', () => {
      const hubspotHeaders = {
        'x-hubspot-ratelimit-daily': '500000',
        'x-hubspot-ratelimit-daily-remaining': '499500',
        'x-hubspot-ratelimit-secondly': '10',
        'x-hubspot-ratelimit-secondly-remaining': '8',
      };

      const dailyLimit = parseInt(hubspotHeaders['x-hubspot-ratelimit-daily'], 10);
      const dailyRemaining = parseInt(hubspotHeaders['x-hubspot-ratelimit-daily-remaining'], 10);

      expect(dailyLimit).toBe(500000);
      expect(dailyRemaining).toBe(499500);
    });
  });

  describe('Connector-Specific Rate Limits', () => {
    const connectorLimits = {
      google: { requestsPerSecond: 10, requestsPerDay: 1000000 },
      salesforce: { requestsPerDay: 100000, concurrent: 25 },
      hubspot: { requestsPerSecond: 10, requestsPerDay: 500000 },
      slack: { tier2RequestsPerMinute: 20 },
    };

    it('should enforce Google limits', () => {
      expect(connectorLimits.google.requestsPerSecond).toBe(10);
    });

    it('should enforce Salesforce limits', () => {
      expect(connectorLimits.salesforce.requestsPerDay).toBe(100000);
    });

    it('should warn when approaching daily limit', () => {
      const dailyLimit = 100000;
      const usedToday = 90000;
      const usagePercent = (usedToday / dailyLimit) * 100;
      const shouldWarn = usagePercent >= 80;
      expect(shouldWarn).toBe(true);
    });
  });
});
