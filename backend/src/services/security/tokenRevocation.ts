/**
 * Token Revocation Service
 * Manages JWT token blacklisting and session invalidation
 * Addresses HIGH security gap: stolen JWTs remaining valid until expiry
 */

import { getRedis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';

// Key prefixes for Redis
const REVOKED_TOKEN_PREFIX = 'revoked:token:';
const REVOKED_USER_PREFIX = 'revoked:user:';
const REVOKED_ORG_PREFIX = 'revoked:org:';
const ACTIVE_SESSION_PREFIX = 'session:active:';
const REVOCATION_FAILURE_KEY = 'metrics:revocation_check_failures';

// Default TTL for revoked tokens (should match max JWT lifetime)
const DEFAULT_REVOCATION_TTL = 24 * 60 * 60; // 24 hours

// Security policy configuration
// FAIL_CLOSED: Reject requests when Redis is unavailable (more secure, less available)
// FAIL_OPEN: Allow requests when Redis is unavailable (less secure, more available)
const REVOCATION_FAIL_POLICY = (process.env.REVOCATION_FAIL_POLICY || 'FAIL_CLOSED').toUpperCase();
const FAIL_CLOSED = REVOCATION_FAIL_POLICY === 'FAIL_CLOSED';

export interface TokenRevocationOptions {
  /** TTL in seconds for the revocation entry */
  ttlSeconds?: number;
  /** Reason for revocation */
  reason?: string;
  /** Actor who performed the revocation */
  revokedBy?: string;
}

export interface SessionInfo {
  userId: string;
  organizationId: string;
  tokenJti: string;
  issuedAt: number;
  expiresAt: number;
  userAgent?: string;
  ipAddress?: string;
  lastActivity?: number;
}

/**
 * Token Revocation Service
 * Provides centralized token/session management
 */
export class TokenRevocationService {
  private log = logger.child({ service: 'TokenRevocationService' });

  /**
   * Revoke a specific token by its JTI (JWT ID)
   */
  async revokeToken(
    jti: string,
    expiresAt: number,
    options: TokenRevocationOptions = {}
  ): Promise<void> {
    const redis = getRedis();
    const key = `${REVOKED_TOKEN_PREFIX}${jti}`;

    // Calculate TTL - revocation only needs to persist until token would have expired
    const now = Math.floor(Date.now() / 1000);
    const ttl = options.ttlSeconds || Math.max(expiresAt - now, 60);

    const revocationData = JSON.stringify({
      revokedAt: now,
      reason: options.reason || 'manual_revocation',
      revokedBy: options.revokedBy || 'system',
    });

    await redis.setex(key, ttl, revocationData);

    this.log.info({ jti, ttl, reason: options.reason }, 'Token revoked');
  }

  /**
   * Check if a token is revoked
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${REVOKED_TOKEN_PREFIX}${jti}`;
    const exists = await redis.exists(key);
    return exists === 1;
  }

  /**
   * Revoke all tokens for a specific user
   * Used for: password change, account compromise, user logout all sessions
   */
  async revokeAllUserTokens(
    userId: string,
    options: TokenRevocationOptions = {}
  ): Promise<void> {
    const redis = getRedis();
    const key = `${REVOKED_USER_PREFIX}${userId}`;
    const now = Math.floor(Date.now() / 1000);
    const ttl = options.ttlSeconds || DEFAULT_REVOCATION_TTL;

    const revocationData = JSON.stringify({
      revokedAt: now,
      reason: options.reason || 'user_tokens_revoked',
      revokedBy: options.revokedBy || 'system',
    });

    await redis.setex(key, ttl, revocationData);

    // Also clear active sessions
    await this.clearUserSessions(userId);

    this.log.info({ userId, ttl, reason: options.reason }, 'All user tokens revoked');
  }

  /**
   * Check if all tokens for a user are revoked (issued before revocation time)
   */
  async areUserTokensRevoked(userId: string, tokenIssuedAt: number): Promise<boolean> {
    const redis = getRedis();
    const key = `${REVOKED_USER_PREFIX}${userId}`;
    const data = await redis.get(key);

    if (!data) return false;

    try {
      const revocation = JSON.parse(data);
      // Token is revoked if it was issued before the revocation timestamp
      return tokenIssuedAt < revocation.revokedAt;
    } catch {
      return false;
    }
  }

  /**
   * Revoke all tokens for an organization
   * Used for: security incidents, organization-wide session reset
   */
  async revokeAllOrganizationTokens(
    organizationId: string,
    options: TokenRevocationOptions = {}
  ): Promise<void> {
    const redis = getRedis();
    const key = `${REVOKED_ORG_PREFIX}${organizationId}`;
    const now = Math.floor(Date.now() / 1000);
    const ttl = options.ttlSeconds || DEFAULT_REVOCATION_TTL;

    const revocationData = JSON.stringify({
      revokedAt: now,
      reason: options.reason || 'organization_tokens_revoked',
      revokedBy: options.revokedBy || 'system',
    });

    await redis.setex(key, ttl, revocationData);

    this.log.warn({ organizationId, ttl, reason: options.reason }, 'All organization tokens revoked');
  }

  /**
   * Check if organization-wide revocation affects a token
   */
  async areOrganizationTokensRevoked(
    organizationId: string,
    tokenIssuedAt: number
  ): Promise<boolean> {
    const redis = getRedis();
    const key = `${REVOKED_ORG_PREFIX}${organizationId}`;
    const data = await redis.get(key);

    if (!data) return false;

    try {
      const revocation = JSON.parse(data);
      return tokenIssuedAt < revocation.revokedAt;
    } catch {
      return false;
    }
  }

  /**
   * Comprehensive token validation
   * Checks all revocation mechanisms
   *
   * Security Policy:
   * - FAIL_CLOSED (default): Redis outage = requests rejected (secure)
   * - FAIL_OPEN: Redis outage = requests allowed (available but insecure)
   *
   * Set via REVOCATION_FAIL_POLICY environment variable
   */
  async isTokenValid(
    jti: string,
    userId: string,
    organizationId: string,
    issuedAt: number
  ): Promise<{ valid: boolean; reason?: string; redisError?: boolean }> {
    try {
      // Check specific token revocation
      if (await this.isTokenRevoked(jti)) {
        return { valid: false, reason: 'token_revoked' };
      }

      // Check user-wide revocation
      if (await this.areUserTokensRevoked(userId, issuedAt)) {
        return { valid: false, reason: 'user_tokens_revoked' };
      }

      // Check organization-wide revocation
      if (await this.areOrganizationTokensRevoked(organizationId, issuedAt)) {
        return { valid: false, reason: 'organization_tokens_revoked' };
      }

      return { valid: true };
    } catch (error) {
      // Redis connection failure - apply configured security policy
      this.log.error(
        { error, userId, jti, policy: REVOCATION_FAIL_POLICY },
        'Token revocation check failed - Redis unavailable'
      );

      // Track failure metrics for alerting
      await this.trackRevocationFailure();

      if (FAIL_CLOSED) {
        // Security-first: reject request when we can't verify revocation status
        return {
          valid: false,
          reason: 'revocation_check_unavailable',
          redisError: true
        };
      } else {
        // Availability-first: allow request but flag the issue
        this.log.warn(
          { userId, jti },
          'FAIL_OPEN: Allowing request despite revocation check failure'
        );
        return { valid: true, redisError: true };
      }
    }
  }

  /**
   * Track revocation check failures for alerting/monitoring
   */
  private async trackRevocationFailure(): Promise<void> {
    try {
      const redis = getRedis();
      // Increment failure counter with 1-hour TTL for monitoring
      await redis.incr(REVOCATION_FAILURE_KEY);
      await redis.expire(REVOCATION_FAILURE_KEY, 3600);
    } catch {
      // If we can't even track the failure, just log it
      this.log.error('Failed to track revocation check failure metric');
    }
  }

  /**
   * Get current revocation failure count (for health checks/alerting)
   */
  async getRevocationFailureCount(): Promise<number> {
    try {
      const redis = getRedis();
      const count = await redis.get(REVOCATION_FAILURE_KEY);
      return count ? parseInt(count, 10) : 0;
    } catch {
      return -1; // Indicates Redis unavailable
    }
  }

  /**
   * Register an active session
   */
  async registerSession(session: SessionInfo): Promise<void> {
    const redis = getRedis();
    const userSessionsKey = `${ACTIVE_SESSION_PREFIX}${session.userId}`;
    const sessionData = JSON.stringify({
      ...session,
      lastActivity: Date.now(),
    });

    // Calculate TTL based on token expiry time
    const now = Math.floor(Date.now() / 1000);
    const tokenTtl = Math.max(session.expiresAt - now, 60);

    await redis.hset(userSessionsKey, session.tokenJti, sessionData);

    // Use token-based TTL to keep session list aligned with actual token lifetime
    // Previously used DEFAULT_REVOCATION_TTL (24h) which caused drift for long-lived tokens
    await redis.expire(userSessionsKey, tokenTtl);
  }

  /**
   * Update session last activity
   */
  async updateSessionActivity(userId: string, jti: string): Promise<void> {
    const redis = getRedis();
    const userSessionsKey = `${ACTIVE_SESSION_PREFIX}${userId}`;
    const sessionData = await redis.hget(userSessionsKey, jti);

    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        session.lastActivity = Date.now();
        await redis.hset(userSessionsKey, jti, JSON.stringify(session));
      } catch {
        // Ignore parse errors
      }
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const redis = getRedis();
    const userSessionsKey = `${ACTIVE_SESSION_PREFIX}${userId}`;
    const sessions = await redis.hgetall(userSessionsKey);

    const result: SessionInfo[] = [];
    for (const [_jti, data] of Object.entries(sessions)) {
      try {
        result.push(JSON.parse(data));
      } catch {
        // Skip invalid entries
      }
    }

    return result.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }

  /**
   * Clear all sessions for a user
   */
  async clearUserSessions(userId: string): Promise<number> {
    const redis = getRedis();
    const userSessionsKey = `${ACTIVE_SESSION_PREFIX}${userId}`;

    // Get count before deletion
    const sessions = await redis.hgetall(userSessionsKey);
    const count = Object.keys(sessions).length;

    await redis.del(userSessionsKey);

    return count;
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(
    userId: string,
    jti: string,
    options: TokenRevocationOptions = {}
  ): Promise<boolean> {
    const redis = getRedis();
    const userSessionsKey = `${ACTIVE_SESSION_PREFIX}${userId}`;

    // Get session info for TTL calculation
    const sessionData = await redis.hget(userSessionsKey, jti);
    if (!sessionData) return false;

    try {
      const session: SessionInfo = JSON.parse(sessionData);

      // Remove from active sessions
      await redis.hdel(userSessionsKey, jti);

      // Add to revoked tokens
      await this.revokeToken(jti, session.expiresAt, options);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired revocation entries (maintenance task)
   */
  async cleanup(): Promise<{ tokensRemoved: number; sessionsRemoved: number }> {
    // Redis TTL handles this automatically, but we can do additional cleanup
    // This is mainly for logging/monitoring
    this.log.info('Token revocation cleanup completed');
    return { tokensRemoved: 0, sessionsRemoved: 0 };
  }
}

// Singleton instance
export const tokenRevocationService = new TokenRevocationService();

export default tokenRevocationService;
