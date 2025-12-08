/**
 * MCP API Routes for Session Management (T059)
 * Endpoints for creating and managing MCP sessions
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMcpSessionService } from '../../services/mcp/session.service.js';
import { getMcpAuditService } from '../../services/mcp/audit.js';
import { logger } from '../../lib/logger.js';
import { MCP_SCOPES, MCP_SCOPE_GROUPS, isValidScope } from '../../models/McpSession.js';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const createSessionSchema = {
  type: 'object',
  required: ['clientName'],
  properties: {
    clientName: { type: 'string', minLength: 1, maxLength: 200 },
    clientVersion: { type: 'string', maxLength: 50 },
    scopes: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
    ttlSeconds: { type: 'integer', minimum: 60, maximum: 86400 }, // 1 min to 24 hours
  },
  additionalProperties: false,
} as const;

const sessionIdParamSchema = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
  },
} as const;

const auditQuerySchema = {
  type: 'object',
  properties: {
    startDate: { type: 'string', format: 'date-time' },
    endDate: { type: 'string', format: 'date-time' },
    limit: { type: 'string', pattern: '^[0-9]+$' },
    offset: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

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
   * Requires: aiAssistant.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/sessions',
    {
      schema: { body: createSessionSchema },
      preHandler: [requirePermission('aiAssistant', 'create')],
    },
    async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
      try {
        const { clientName, clientVersion, scopes, ttlSeconds } = request.body;
        const userId = (request as any).userId;
        const ipAddress = request.ip || request.headers['x-forwarded-for'] as string || 'unknown';

        // Schema validation handles clientName required check

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
   * Requires: aiAssistant.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/sessions',
    { preHandler: [requirePermission('aiAssistant', 'read')] },
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
   * Requires: aiAssistant.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/sessions/:sessionId',
    {
      schema: { params: sessionIdParamSchema },
      preHandler: [requirePermission('aiAssistant', 'read')],
    },
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
   * Requires: aiAssistant.read permission (VIEWER role minimum - users can revoke their own)
   */
  fastify.delete(
    '/sessions/:sessionId',
    {
      schema: { params: sessionIdParamSchema },
      preHandler: [requirePermission('aiAssistant', 'read')],
    },
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
   * Requires: aiAssistant.read permission (VIEWER role minimum)
   */
  fastify.get('/scopes', { preHandler: [requirePermission('aiAssistant', 'read')] }, async (request, reply) => {
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
   * Requires: auditLog.read permission (ADMIN role minimum)
   */
  fastify.get(
    '/audit',
    {
      schema: { querystring: auditQuerySchema },
      preHandler: [requirePermission('auditLog', 'read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;
        const tenantId = getOrganizationId(request);
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
   * Requires: auditLog.read permission (ADMIN role minimum)
   */
  fastify.get(
    '/audit/stats',
    {
      schema: { querystring: auditQuerySchema },
      preHandler: [requirePermission('auditLog', 'read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);
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
