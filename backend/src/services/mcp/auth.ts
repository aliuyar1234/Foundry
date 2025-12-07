/**
 * MCP Authentication Middleware (T048)
 * Validates MCP session tokens and enforces scopes
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { getMcpSessionService, McpSessionService } from './session.service.js';
import { logger } from '../../lib/logger.js';
import type { McpSession, McpScope } from '../../models/McpSession.js';
import { McpErrorCode } from '../../lib/mcp-types.js';

/**
 * Extended request with MCP session
 */
export interface McpAuthenticatedRequest extends FastifyRequest {
  mcpSession: McpSession;
  tenantId: string;
}

/**
 * Authentication options
 */
export interface McpAuthOptions {
  requiredScope?: McpScope;
  requireScopes?: McpScope[];
}

/**
 * Extract session token from request
 */
function extractSessionToken(request: FastifyRequest): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check X-MCP-Session-Token header
  const mcpToken = request.headers['x-mcp-session-token'];
  if (typeof mcpToken === 'string') {
    return mcpToken;
  }

  // Check query parameter (for SSE connections)
  const queryToken = (request.query as Record<string, unknown>)?.sessionToken;
  if (typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
}

/**
 * Create MCP authentication middleware
 */
export function createMcpAuthMiddleware(options: McpAuthOptions = {}) {
  const sessionService = getMcpSessionService();
  const { requiredScope, requireScopes } = options;

  return async function mcpAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const sessionToken = extractSessionToken(request);

    if (!sessionToken) {
      return reply.status(401).send({
        error: {
          code: McpErrorCode.UNAUTHORIZED,
          message: 'Missing MCP session token',
        },
      });
    }

    // Validate session
    const validation = await sessionService.validateSession(
      sessionToken,
      requiredScope
    );

    if (!validation.valid) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 401,
        EXPIRED: 401,
        INVALID_SCOPE: 403,
        RATE_LIMITED: 429,
      };

      const status = statusMap[validation.errorCode || ''] || 401;

      logger.warn(
        { sessionToken: sessionToken.slice(0, 8) + '...', error: validation.error },
        'MCP authentication failed'
      );

      return reply.status(status).send({
        error: {
          code: validation.errorCode === 'RATE_LIMITED'
            ? McpErrorCode.RATE_LIMIT_EXCEEDED
            : validation.errorCode === 'INVALID_SCOPE'
            ? McpErrorCode.FORBIDDEN
            : McpErrorCode.UNAUTHORIZED,
          message: validation.error,
          retryAfter: validation.errorCode === 'RATE_LIMITED' && validation.session
            ? Math.ceil((validation.session.rateLimitResetAt.getTime() - Date.now()) / 1000)
            : undefined,
        },
      });
    }

    // Check multiple required scopes if specified
    if (requireScopes && requireScopes.length > 0) {
      const hasAllScopes = requireScopes.every((scope) =>
        validation.session!.scopes.includes(scope) ||
        validation.session!.scopes.includes('foundry:admin:all')
      );

      if (!hasAllScopes) {
        return reply.status(403).send({
          error: {
            code: McpErrorCode.FORBIDDEN,
            message: `Missing required scopes: ${requireScopes.join(', ')}`,
          },
        });
      }
    }

    // Attach session to request
    (request as McpAuthenticatedRequest).mcpSession = validation.session!;

    // Get tenant ID from user (would need to fetch user details)
    // For now, extract from session or use a default
    (request as McpAuthenticatedRequest).tenantId = validation.session!.userId.split(':')[0] || 'default';

    // Update session activity
    await sessionService.touchSession(sessionToken);
  };
}

/**
 * Register MCP authentication plugin
 */
export async function mcpAuthPlugin(
  fastify: FastifyInstance,
  options: McpAuthOptions = {}
): Promise<void> {
  fastify.addHook('preHandler', createMcpAuthMiddleware(options));
}

/**
 * Scope decorator factory
 */
export function requireScope(scope: McpScope) {
  return createMcpAuthMiddleware({ requiredScope: scope });
}

/**
 * Multiple scopes decorator factory
 */
export function requireScopes(...scopes: McpScope[]) {
  return createMcpAuthMiddleware({ requireScopes: scopes });
}
