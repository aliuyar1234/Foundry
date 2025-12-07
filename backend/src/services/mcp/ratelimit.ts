/**
 * MCP Rate Limiting (T049)
 * Per-session rate limiting with tool-specific limits
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getMcpSessionService, McpSessionService } from './session.service.js';
import { logger } from '../../lib/logger.js';
import { McpErrorCode, MCP_RATE_LIMITS, FOUNDRY_MCP_TOOLS } from '../../lib/mcp-types.js';
import type { McpAuthenticatedRequest } from './auth.js';

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  remaining: number;
  resetAt: Date;
  limit: number;
  retryAfterSeconds?: number;
}

/**
 * Rate limit headers
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
}

/**
 * Get tool-specific rate limit
 */
export function getToolRateLimit(toolName: string): number {
  const toolLimits = MCP_RATE_LIMITS.TOOL_LIMITS as Record<string, number>;
  return toolLimits[toolName] || MCP_RATE_LIMITS.DEFAULT_BUCKET_SIZE;
}

/**
 * Create rate limit headers
 */
export function createRateLimitHeaders(status: RateLimitStatus): RateLimitHeaders {
  return {
    'X-RateLimit-Limit': status.limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, status.remaining).toString(),
    'X-RateLimit-Reset': Math.ceil(status.resetAt.getTime() / 1000).toString(),
  };
}

/**
 * Rate limit middleware for MCP endpoints
 */
export function createRateLimitMiddleware(toolName?: string) {
  const sessionService = getMcpSessionService();

  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const mcpRequest = request as McpAuthenticatedRequest;
    const session = mcpRequest.mcpSession;

    if (!session) {
      // No session, skip rate limiting (auth middleware will handle)
      return;
    }

    // Check current rate limit status
    const now = new Date();
    let remaining = session.rateLimitBucket;

    // Check if rate limit has reset
    if (session.rateLimitResetAt <= now) {
      // Reset the rate limit
      const updatedSession = await sessionService.resetRateLimit(session.id);
      remaining = updatedSession.rateLimitBucket;
      mcpRequest.mcpSession = updatedSession;
    }

    // Get limit for this tool
    const toolLimit = toolName ? getToolRateLimit(toolName) : MCP_RATE_LIMITS.DEFAULT_BUCKET_SIZE;

    // Create rate limit status
    const status: RateLimitStatus = {
      remaining: remaining - 1,
      resetAt: session.rateLimitResetAt,
      limit: toolLimit,
    };

    // Add rate limit headers
    const headers = createRateLimitHeaders(status);
    reply.headers(headers);

    // Check if rate limited
    if (remaining <= 0) {
      const retryAfter = Math.ceil((session.rateLimitResetAt.getTime() - now.getTime()) / 1000);

      logger.warn(
        { sessionId: session.id, toolName, remaining, resetAt: session.rateLimitResetAt },
        'MCP rate limit exceeded'
      );

      reply.header('Retry-After', retryAfter.toString());

      return reply.status(429).send({
        error: {
          code: McpErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter,
        },
      });
    }

    // Decrement rate limit
    await sessionService.decrementRateLimit(session.id);
  };
}

/**
 * Check rate limit without consuming it
 */
export async function checkRateLimit(sessionId: string): Promise<RateLimitStatus> {
  const sessionService = getMcpSessionService();
  const validation = await sessionService.validateSession(sessionId);

  if (!validation.valid || !validation.session) {
    return {
      remaining: 0,
      resetAt: new Date(),
      limit: 0,
    };
  }

  const session = validation.session;
  const now = new Date();

  return {
    remaining: session.rateLimitBucket,
    resetAt: session.rateLimitResetAt,
    limit: MCP_RATE_LIMITS.DEFAULT_BUCKET_SIZE,
    retryAfterSeconds: session.rateLimitBucket <= 0
      ? Math.ceil((session.rateLimitResetAt.getTime() - now.getTime()) / 1000)
      : undefined,
  };
}

/**
 * Rate limit decorator for specific tools
 */
export function rateLimitTool(toolName: string) {
  return createRateLimitMiddleware(toolName);
}
