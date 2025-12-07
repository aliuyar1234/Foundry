/**
 * MCP API Routes for Session Management (T059)
 * Endpoints for creating and managing MCP sessions
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMcpSessionService } from '../../services/mcp/session.service.js';
import { getMcpAuditService } from '../../services/mcp/audit.js';
import { logger } from '../../lib/logger.js';
import { MCP_SCOPES, MCP_SCOPE_GROUPS, isValidScope } from '../../models/McpSession.js';

/**
 * Request body types
 */
interface CreateSessionBody {
  clientName: string;
  clientVersion?: string;
  scopes?: string[];
  ttlSeconds?: number;
}

interface RevokeSessionBody {
  sessionId: string;
}

/**
 * Register MCP session management routes
 */
export async function mcpRoutes(fastify: FastifyInstance): Promise<void> {
  const sessionService = getMcpSessionService();
  const auditService = getMcpAuditService();

  /**
   * Create a new MCP session
   * POST /api/v1/mcp/sessions
   */
  fastify.post(
    '/sessions',
    async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
      try {
        const { clientName, clientVersion, scopes, ttlSeconds } = request.body;
        const userId = (request as any).userId;
        const ipAddress = request.ip || request.headers['x-forwarded-for'] as string || 'unknown';

        if (!clientName) {
          return reply.status(400).send({
            success: false,
            error: 'clientName is required',
          });
        }

        // Validate scopes
        const requestedScopes = scopes || MCP_SCOPE_GROUPS.STANDARD;
        const invalidScopes = requestedScopes.filter((s) => !isValidScope(s));

        if (invalidScopes.length > 0) {
          return reply.status(400).send({
            success: false,
            error: `Invalid scopes: ${invalidScopes.join(', ')}`,
            validScopes: Object.values(MCP_SCOPES),
          });
        }

        // Create session
        const session = await sessionService.createSession({
          userId,
          clientName,
          clientVersion,
          ipAddress,
          scopes: requestedScopes,
          ttlSeconds,
        });

        logger.info(
          { sessionId: session.id, userId, clientName },
          'MCP session created via API'
        );

        return reply.status(201).send({
          success: true,
          data: {
            sessionId: session.id,
            expiresAt: session.expiresAt,
            scopes: session.scopes,
            rateLimitBucket: session.rateLimitBucket,
            rateLimitResetAt: session.rateLimitResetAt,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create MCP session');
        return reply.status(500).send({
          success: false,
          error: 'Failed to create session',
        });
      }
    }
  );

  /**
   * List sessions for current user
   * GET /api/v1/mcp/sessions
   */
  fastify.get(
    '/sessions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;

        const sessions = await sessionService.getSessionsForUser(userId);

        return reply.send({
          success: true,
          data: sessions.map((s) => ({
            id: s.id,
            clientName: s.clientName,
            clientVersion: s.clientVersion,
            scopes: s.scopes,
            lastActivityAt: s.lastActivityAt,
            expiresAt: s.expiresAt,
            createdAt: s.createdAt,
          })),
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list MCP sessions');
        return reply.status(500).send({
          success: false,
          error: 'Failed to list sessions',
        });
      }
    }
  );

  /**
   * Get session details
   * GET /api/v1/mcp/sessions/:sessionId
   */
  fastify.get(
    '/sessions/:sessionId',
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { sessionId } = request.params;
        const userId = (request as any).userId;

        const validation = await sessionService.validateSession(sessionId);

        if (!validation.valid || !validation.session) {
          return reply.status(404).send({
            success: false,
            error: validation.error || 'Session not found',
          });
        }

        // Verify ownership
        if (validation.session.userId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Access denied',
          });
        }

        return reply.send({
          success: true,
          data: {
            id: validation.session.id,
            clientName: validation.session.clientName,
            clientVersion: validation.session.clientVersion,
            ipAddress: validation.session.ipAddress,
            scopes: validation.session.scopes,
            rateLimitBucket: validation.session.rateLimitBucket,
            rateLimitResetAt: validation.session.rateLimitResetAt,
            lastActivityAt: validation.session.lastActivityAt,
            expiresAt: validation.session.expiresAt,
            createdAt: validation.session.createdAt,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get MCP session');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get session',
        });
      }
    }
  );

  /**
   * Revoke a session
   * DELETE /api/v1/mcp/sessions/:sessionId
   */
  fastify.delete(
    '/sessions/:sessionId',
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { sessionId } = request.params;
        const userId = (request as any).userId;

        // Verify ownership before deletion
        const validation = await sessionService.validateSession(sessionId);

        if (validation.session && validation.session.userId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Access denied',
          });
        }

        await sessionService.deleteSession(sessionId);

        logger.info({ sessionId, userId }, 'MCP session revoked via API');

        return reply.send({
          success: true,
          message: 'Session revoked',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to revoke MCP session');
        return reply.status(500).send({
          success: false,
          error: 'Failed to revoke session',
        });
      }
    }
  );

  /**
   * Get available scopes
   * GET /api/v1/mcp/scopes
   */
  fastify.get('/scopes', async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        scopes: MCP_SCOPES,
        scopeGroups: MCP_SCOPE_GROUPS,
      },
    });
  });

  /**
   * Get audit logs for user
   * GET /api/v1/mcp/audit
   */
  fastify.get(
    '/audit',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;
        const tenantId = (request as any).tenantId || 'default';
        const query = request.query as Record<string, string>;

        const { logs, total } = await auditService.queryLogs(
          {
            userId,
            tenantId,
            startDate: query.startDate ? new Date(query.startDate) : undefined,
            endDate: query.endDate ? new Date(query.endDate) : undefined,
          },
          {
            limit: parseInt(query.limit || '50', 10),
            offset: parseInt(query.offset || '0', 10),
          }
        );

        return reply.send({
          success: true,
          data: {
            logs,
            total,
            limit: parseInt(query.limit || '50', 10),
            offset: parseInt(query.offset || '0', 10),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get MCP audit logs');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get audit logs',
        });
      }
    }
  );

  /**
   * Get audit statistics
   * GET /api/v1/mcp/audit/stats
   */
  fastify.get(
    '/audit/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
        const query = request.query as Record<string, string>;

        const stats = await auditService.getStats(tenantId, {
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
        });

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get MCP audit stats');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get audit stats',
        });
      }
    }
  );
}

export default mcpRoutes;
