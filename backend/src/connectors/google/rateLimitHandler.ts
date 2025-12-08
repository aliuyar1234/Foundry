/**
 * Google API Rate Limit Handler
 * Task: T033
 *
 * Handles Google API rate limits with exponential backoff.
 * Supports per-API and per-user quotas.
 */

import { Redis } from 'ioredis';
import { RateLimiter, createConnectorRateLimiter, RateLimitState } from '../base/rateLimiter';
import { RateLimitCallbacks } from '../base/connector';

// Google API rate limits by service
// https://developers.google.com/gmail/api/reference/quota
// https://developers.google.com/calendar/api/guides/quota
// https://developers.google.com/drive/api/guides/limits
export const GOOGLE_API_LIMITS = {
  gmail: {
    quotaUnitsPerDay: 1000000000, // 1 billion units per day
    queriesPerSecondPerUser: 250,
    batchRequestsPerSecond: 50,
    messagesPerRequest: 100,
  },
  calendar: {
    queriesPerSecondPerUser: 500,
    queriesPerDayPerProject: 1000000,
  },
  drive: {
    queriesPerSecondPerUser: 1000,
    queriesPerDayPerProject: 1000000000,
    uploadBytesPerDay: 750 * 1024 * 1024 * 1024, // 750 GB
  },
  admin: {
    queriesPerSecondPerUser: 500,
    queriesPerDayPerProject: 150000,
  },
};

export interface GoogleRateLimitConfig {
  redis?: Redis | null;
  instanceId: string;
  userEmail?: string;
  defaultDelayMs?: number;
  maxRetries?: number;
}

export interface RateLimitStatus {
  service: string;
  isLimited: boolean;
  remaining: number;
  limit: number;
  resetAt?: Date;
  windowType: string;
}

export class GoogleRateLimitHandler {
  private config: GoogleRateLimitConfig;
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private userLimiters: Map<string, RateLimiter> = new Map();
  private currentLimits: Map<string, RateLimitStatus> = new Map();
  private retryAfterMs: Map<string, number> = new Map();

  constructor(config: GoogleRateLimitConfig) {
    this.config = config;

    // Initialize service-specific rate limiters
    this.initializeRateLimiters();
  }

  /**
   * Initialize rate limiters for each Google service
   */
  private initializeRateLimiters(): void {
    if (this.config.redis) {
      // Gmail rate limiter
      this.rateLimiters.set(
        'gmail',
        createConnectorRateLimiter(
          this.config.redis,
          'google_workspace_gmail',
          'standard'
        )
      );

      // Calendar rate limiter
      this.rateLimiters.set(
        'calendar',
        createConnectorRateLimiter(
          this.config.redis,
          'google_workspace_calendar',
          'standard'
        )
      );

      // Drive rate limiter
      this.rateLimiters.set(
        'drive',
        createConnectorRateLimiter(
          this.config.redis,
          'google_workspace_drive',
          'standard'
        )
      );

      // Admin SDK rate limiter
      this.rateLimiters.set(
        'admin',
        createConnectorRateLimiter(
          this.config.redis,
          'google_workspace_admin',
          'standard'
        )
      );
    }
  }

  /**
   * Check if request should be allowed
   */
  async checkLimit(service: string): Promise<RateLimitState> {
    const limiter = this.rateLimiters.get(service);
    if (!limiter) {
      return {
        allowed: true,
        remaining: Infinity,
        limit: Infinity,
        resetAt: 0,
        retryAfter: 0,
      };
    }

    return limiter.checkLimit(
      `${this.config.instanceId}:${service}`
    );
  }

  /**
   * Record a request
   */
  async recordRequest(service: string): Promise<void> {
    const limiter = this.rateLimiters.get(service);
    if (limiter) {
      await limiter.recordRequest(
        `${this.config.instanceId}:${service}`
      );
    }
  }

  /**
   * Execute API call with rate limiting
   */
  async executeWithLimit<T>(
    service: string,
    apiCall: () => Promise<T>,
    callbacks?: RateLimitCallbacks
  ): Promise<T> {
    const limiter = this.rateLimiters.get(service);

    if (!limiter) {
      return apiCall();
    }

    return limiter.executeWithLimit(
      `${this.config.instanceId}:${service}`,
      apiCall,
      (state) => {
        if (callbacks?.onRateLimitHit) {
          callbacks.onRateLimitHit(state.retryAfter);
        }
      }
    );
  }

  /**
   * Handle rate limit response from Google API
   */
  async handleRateLimitResponse(
    service: string,
    retryAfterSeconds?: number,
    quotaUser?: string
  ): Promise<void> {
    const retryMs = (retryAfterSeconds || 60) * 1000;
    this.retryAfterMs.set(service, Date.now() + retryMs);

    // Update current limits status
    this.currentLimits.set(service, {
      service,
      isLimited: true,
      remaining: 0,
      limit: this.getServiceLimit(service),
      resetAt: new Date(Date.now() + retryMs),
      windowType: 'second',
    });

    // If user-specific, track that too
    if (quotaUser) {
      const userKey = `${service}:${quotaUser}`;
      this.retryAfterMs.set(userKey, Date.now() + retryMs);
    }
  }

  /**
   * Check if service is currently rate limited
   */
  isRateLimited(service: string): boolean {
    const retryUntil = this.retryAfterMs.get(service);
    if (retryUntil && retryUntil > Date.now()) {
      return true;
    }
    return false;
  }

  /**
   * Get time until rate limit resets
   */
  getRetryAfterMs(service: string): number {
    const retryUntil = this.retryAfterMs.get(service);
    if (retryUntil) {
      const remaining = retryUntil - Date.now();
      return remaining > 0 ? remaining : 0;
    }
    return 0;
  }

  /**
   * Wait for rate limit to reset
   */
  async waitForReset(service: string): Promise<void> {
    const retryMs = this.getRetryAfterMs(service);
    if (retryMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    this.retryAfterMs.delete(service);
    this.currentLimits.delete(service);
  }

  /**
   * Get current rate limit status for all services
   */
  getRateLimitStatus(): RateLimitStatus[] {
    return Array.from(this.currentLimits.values());
  }

  /**
   * Parse rate limit headers from Google API response
   */
  parseRateLimitHeaders(headers: Record<string, string>): {
    quotaRemaining?: number;
    quotaLimit?: number;
    retryAfter?: number;
  } {
    return {
      quotaRemaining: headers['x-ratelimit-remaining']
        ? parseInt(headers['x-ratelimit-remaining'])
        : undefined,
      quotaLimit: headers['x-ratelimit-limit']
        ? parseInt(headers['x-ratelimit-limit'])
        : undefined,
      retryAfter: headers['retry-after']
        ? parseInt(headers['retry-after'])
        : undefined,
    };
  }

  /**
   * Check if error is a rate limit error
   */
  isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('quota exceeded') ||
        message.includes('too many requests') ||
        message.includes('429') ||
        message.includes('403') && message.includes('quota')
      );
    }
    return false;
  }

  /**
   * Get service-specific limit
   */
  private getServiceLimit(service: string): number {
    switch (service) {
      case 'gmail':
        return GOOGLE_API_LIMITS.gmail.queriesPerSecondPerUser;
      case 'calendar':
        return GOOGLE_API_LIMITS.calendar.queriesPerSecondPerUser;
      case 'drive':
        return GOOGLE_API_LIMITS.drive.queriesPerSecondPerUser;
      case 'admin':
        return GOOGLE_API_LIMITS.admin.queriesPerSecondPerUser;
      default:
        return 100;
    }
  }

  /**
   * Calculate optimal batch size based on current limits
   */
  getOptimalBatchSize(service: string): number {
    const status = this.currentLimits.get(service);

    if (status?.isLimited) {
      return 1; // Minimal batch when limited
    }

    switch (service) {
      case 'gmail':
        return Math.min(50, GOOGLE_API_LIMITS.gmail.messagesPerRequest);
      case 'calendar':
        return 100;
      case 'drive':
        return 100;
      default:
        return 50;
    }
  }

  /**
   * Calculate delay between requests
   */
  getRequestDelayMs(service: string): number {
    const status = this.currentLimits.get(service);

    if (status?.isLimited) {
      return this.config.defaultDelayMs || 1000;
    }

    // Calculate based on service limits
    const limit = this.getServiceLimit(service);
    return Math.ceil(1000 / limit); // Distribute evenly across second
  }

  /**
   * Clear all rate limit state
   */
  clearState(): void {
    this.retryAfterMs.clear();
    this.currentLimits.clear();
  }
}

/**
 * Create Google rate limit handler
 */
export function createGoogleRateLimitHandler(
  config: GoogleRateLimitConfig
): GoogleRateLimitHandler {
  return new GoogleRateLimitHandler(config);
}
