/**
 * MCP Session Management Service (T047)
 * Handles session creation, validation, and expiration
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger.js';
import type {
  McpSession,
  CreateMcpSessionInput,
  UpdateMcpSessionInput,
  SessionValidationResult,
} from '../../models/McpSession.js';
import { MCP_SESSION_DEFAULTS, hasScope, McpScope } from '../../models/McpSession.js';

const prisma = new PrismaClient();

// Redis key prefixes
const SESSION_PREFIX = 'mcp:session:';
const SESSION_INDEX_PREFIX = 'mcp:sessions:user:';

/**
 * MCP Session Service
 */
export class McpSessionService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  /**
   * Create a new MCP session
   */
  async createSession(input: CreateMcpSessionInput): Promise<McpSession> {
    const {
      userId,
      clientName,
      clientVersion,
      ipAddress,
      scopes,
      ttlSeconds = MCP_SESSION_DEFAULTS.TTL_SECONDS,
    } = input;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const rateLimitResetAt = new Date(
      now.getTime() + MCP_SESSION_DEFAULTS.RATE_LIMIT_RESET_INTERVAL_MS
    );

    const sessionId = uuidv4();

    // Create session in PostgreSQL for persistence
    const session = await prisma.mcpSession.create({
      data: {
        id: sessionId,
        userId,
        clientName,
        clientVersion,
        ipAddress,
        scopes,
        rateLimitBucket: MCP_SESSION_DEFAULTS.RATE_LIMIT_BUCKET,
        rateLimitResetAt,
        lastActivityAt: now,
        expiresAt,
      },
    });

    // Cache in Redis for fast access
    const sessionData: McpSession = {
      id: session.id,
      userId: session.userId,
      clientName: session.clientName,
      clientVersion: session.clientVersion ?? undefined,
      ipAddress: session.ipAddress,
      scopes: session.scopes,
      rateLimitBucket: session.rateLimitBucket,
      rateLimitResetAt: session.rateLimitResetAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };

    await this.cacheSession(sessionData, ttlSeconds);

    logger.info(
      { sessionId, userId, clientName, scopes },
      'MCP session created'
    );

    return sessionData;
  }

  /**
   * Validate a session
   */
  async validateSession(
    sessionId: string,
    requiredScope?: McpScope
  ): Promise<SessionValidationResult> {
    // Try Redis cache first
    let session = await this.getSessionFromCache(sessionId);

    // Fall back to database if not in cache
    if (!session) {
      const dbSession = await prisma.mcpSession.findUnique({
        where: { id: sessionId },
      });

      if (!dbSession) {
        return {
          valid: false,
          error: 'Session not found',
          errorCode: 'NOT_FOUND',
        };
      }

      session = {
        id: dbSession.id,
        userId: dbSession.userId,
        clientName: dbSession.clientName,
        clientVersion: dbSession.clientVersion ?? undefined,
        ipAddress: dbSession.ipAddress,
        scopes: dbSession.scopes,
        rateLimitBucket: dbSession.rateLimitBucket,
        rateLimitResetAt: dbSession.rateLimitResetAt,
        lastActivityAt: dbSession.lastActivityAt,
        expiresAt: dbSession.expiresAt,
        createdAt: dbSession.createdAt,
      };

      // Re-cache for future requests
      const ttl = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
      if (ttl > 0) {
        await this.cacheSession(session, ttl);
      }
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      await this.deleteSession(sessionId);
      return {
        valid: false,
        error: 'Session expired',
        errorCode: 'EXPIRED',
      };
    }

    // Check scope if required
    if (requiredScope && !hasScope(session, requiredScope)) {
      return {
        valid: false,
        session,
        error: `Missing required scope: ${requiredScope}`,
        errorCode: 'INVALID_SCOPE',
      };
    }

    // Check rate limit
    if (session.rateLimitBucket <= 0) {
      const now = new Date();
      if (session.rateLimitResetAt > now) {
        return {
          valid: false,
          session,
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMITED',
        };
      }
      // Reset rate limit if time has passed
      session = await this.resetRateLimit(sessionId);
    }

    return { valid: true, session };
  }

  /**
   * Update session activity
   */
  async touchSession(sessionId: string): Promise<void> {
    const now = new Date();

    // Update in database
    await prisma.mcpSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: now },
    });

    // Update in cache
    const cached = await this.getSessionFromCache(sessionId);
    if (cached) {
      cached.lastActivityAt = now;
      const ttl = Math.max(0, Math.floor((cached.expiresAt.getTime() - Date.now()) / 1000));
      if (ttl > 0) {
        await this.cacheSession(cached, ttl);
      }
    }
  }

  /**
   * Decrement rate limit bucket
   */
  async decrementRateLimit(sessionId: string): Promise<number> {
    // Use Redis atomic decrement for accuracy
    const key = `${SESSION_PREFIX}${sessionId}:ratelimit`;
    const newValue = await this.redis.decr(key);

    // Also update the main session object
    const cached = await this.getSessionFromCache(sessionId);
    if (cached) {
      cached.rateLimitBucket = newValue;
      const ttl = Math.max(0, Math.floor((cached.expiresAt.getTime() - Date.now()) / 1000));
      if (ttl > 0) {
        await this.cacheSession(cached, ttl);
      }
    }

    return newValue;
  }

  /**
   * Reset rate limit
   */
  async resetRateLimit(sessionId: string): Promise<McpSession> {
    const now = new Date();
    const rateLimitResetAt = new Date(
      now.getTime() + MCP_SESSION_DEFAULTS.RATE_LIMIT_RESET_INTERVAL_MS
    );

    const updated = await prisma.mcpSession.update({
      where: { id: sessionId },
      data: {
        rateLimitBucket: MCP_SESSION_DEFAULTS.RATE_LIMIT_BUCKET,
        rateLimitResetAt,
      },
    });

    const session: McpSession = {
      id: updated.id,
      userId: updated.userId,
      clientName: updated.clientName,
      clientVersion: updated.clientVersion ?? undefined,
      ipAddress: updated.ipAddress,
      scopes: updated.scopes,
      rateLimitBucket: updated.rateLimitBucket,
      rateLimitResetAt: updated.rateLimitResetAt,
      lastActivityAt: updated.lastActivityAt,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
    };

    // Update cache
    const ttl = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    if (ttl > 0) {
      await this.cacheSession(session, ttl);
    }

    // Reset rate limit counter
    const rateLimitKey = `${SESSION_PREFIX}${sessionId}:ratelimit`;
    await this.redis.set(
      rateLimitKey,
      MCP_SESSION_DEFAULTS.RATE_LIMIT_BUCKET,
      'EX',
      ttl
    );

    return session;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await Promise.all([
      prisma.mcpSession.delete({ where: { id: sessionId } }).catch(() => {}),
      this.redis.del(`${SESSION_PREFIX}${sessionId}`),
      this.redis.del(`${SESSION_PREFIX}${sessionId}:ratelimit`),
    ]);

    logger.info({ sessionId }, 'MCP session deleted');
  }

  /**
   * Get sessions for a user
   */
  async getSessionsForUser(userId: string): Promise<McpSession[]> {
    const sessions = await prisma.mcpSession.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      clientName: s.clientName,
      clientVersion: s.clientVersion ?? undefined,
      ipAddress: s.ipAddress,
      scopes: s.scopes,
      rateLimitBucket: s.rateLimitBucket,
      rateLimitResetAt: s.rateLimitResetAt,
      lastActivityAt: s.lastActivityAt,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.mcpSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    logger.info({ count: result.count }, 'Cleaned up expired MCP sessions');
    return result.count;
  }

  /**
   * Cache session in Redis
   */
  private async cacheSession(session: McpSession, ttlSeconds: number): Promise<void> {
    const key = `${SESSION_PREFIX}${session.id}`;
    await this.redis.setex(key, ttlSeconds, JSON.stringify(session));

    // Also set rate limit counter
    const rateLimitKey = `${SESSION_PREFIX}${session.id}:ratelimit`;
    await this.redis.setex(rateLimitKey, ttlSeconds, session.rateLimitBucket.toString());
  }

  /**
   * Get session from Redis cache
   */
  private async getSessionFromCache(sessionId: string): Promise<McpSession | null> {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    const session = JSON.parse(data) as McpSession;

    // Convert date strings back to Date objects
    session.rateLimitResetAt = new Date(session.rateLimitResetAt);
    session.lastActivityAt = new Date(session.lastActivityAt);
    session.expiresAt = new Date(session.expiresAt);
    session.createdAt = new Date(session.createdAt);

    return session;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let sessionServiceInstance: McpSessionService | null = null;

export function getMcpSessionService(): McpSessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new McpSessionService();
  }
  return sessionServiceInstance;
}
