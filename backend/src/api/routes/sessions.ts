/**
 * Session Management Routes
 * Provides endpoints for session listing, logout, and token revocation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { tokenRevocationService } from '../../services/security/tokenRevocation.js';
import { auditService, AuditActions } from '../../services/audit/auditService.js';
import { rateLimiters } from '../middleware/rateLimit.js';

// Validation schemas
const revokeSessionSchema = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: { type: 'string', minLength: 1, maxLength: 200 },
    reason: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

const revokeAllSessionsSchema = {
  type: 'object',
  properties: {
    reason: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

const revokeUserSessionsSchema = {
  type: 'object',
  required: ['userId'],
  properties: {
    userId: { type: 'string', minLength: 1, maxLength: 100 },
    reason: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

const revokeOrgSessionsSchema = {
  type: 'object',
  properties: {
    reason: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

export default async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', authenticate);

  /**
   * GET /sessions
   * List current user's active sessions
   */
  fastify.get(
    '/',
    {
      preHandler: [rateLimiters.read()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as AuthenticatedRequest;

      try {
        const sessions = await tokenRevocationService.getUserSessions(user.id);

        // Mark current session
        const sessionsWithCurrent = sessions.map((session) => ({
          ...session,
          isCurrent: session.tokenJti === user.jti,
        }));

        return reply.send({
          sessions: sessionsWithCurrent,
          count: sessions.length,
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch sessions');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve sessions',
        });
      }
    }
  );

  /**
   * POST /sessions/logout
   * Logout current session (revoke current token)
   */
  fastify.post(
    '/logout',
    {
      preHandler: [rateLimiters.write()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as AuthenticatedRequest;

      if (!user.jti || !user.iat) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Token missing required claims for revocation',
        });
      }

      try {
        // Calculate token expiry (default 24h from issued)
        const expiresAt = user.iat + 24 * 60 * 60;

        await tokenRevocationService.revokeToken(user.jti, expiresAt, {
          reason: 'user_logout',
          revokedBy: user.id,
        });

        await auditService.logSecurityAction(AuditActions.SESSION_REVOKE, {
          organizationId: user.organizationId,
          userId: user.id,
          resourceType: 'session',
          resourceId: user.jti,
          details: { method: 'manual_logout' },
          ipAddress: request.ip,
          severity: 'low',
        });

        return reply.send({
          success: true,
          message: 'Successfully logged out',
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to logout');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to logout',
        });
      }
    }
  );

  /**
   * POST /sessions/revoke
   * Revoke a specific session
   */
  fastify.post(
    '/revoke',
    {
      schema: { body: revokeSessionSchema },
      preHandler: [rateLimiters.write()],
    },
    async (
      request: FastifyRequest<{ Body: { sessionId: string; reason?: string } }>,
      reply: FastifyReply
    ) => {
      const { user } = request as AuthenticatedRequest;
      const { sessionId, reason } = request.body;

      try {
        const success = await tokenRevocationService.revokeSession(user.id, sessionId, {
          reason: reason || 'user_revoked',
          revokedBy: user.id,
        });

        if (!success) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Session not found',
          });
        }

        await auditService.logSecurityAction(AuditActions.SESSION_REVOKE, {
          organizationId: user.organizationId,
          userId: user.id,
          resourceType: 'session',
          resourceId: sessionId,
          details: { reason },
          ipAddress: request.ip,
          severity: 'medium',
        });

        return reply.send({
          success: true,
          message: 'Session revoked',
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to revoke session');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to revoke session',
        });
      }
    }
  );

  /**
   * POST /sessions/revoke-all
   * Revoke all sessions for current user (except current)
   */
  fastify.post(
    '/revoke-all',
    {
      schema: { body: revokeAllSessionsSchema },
      preHandler: [rateLimiters.write()],
    },
    async (
      request: FastifyRequest<{ Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      const { user } = request as AuthenticatedRequest;
      const { reason } = request.body;

      try {
        await tokenRevocationService.revokeAllUserTokens(user.id, {
          reason: reason || 'user_revoked_all',
          revokedBy: user.id,
        });

        await auditService.logSecurityAction(AuditActions.SESSION_REVOKE_ALL, {
          organizationId: user.organizationId,
          userId: user.id,
          resourceType: 'user',
          resourceId: user.id,
          details: { reason },
          ipAddress: request.ip,
          severity: 'medium',
        });

        return reply.send({
          success: true,
          message: 'All sessions revoked. Please login again.',
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to revoke all sessions');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to revoke sessions',
        });
      }
    }
  );

  /**
   * POST /sessions/admin/revoke-user
   * Admin: Revoke all sessions for a specific user
   */
  fastify.post(
    '/admin/revoke-user',
    {
      schema: { body: revokeUserSessionsSchema },
      preHandler: [requirePermission('user', 'delete'), rateLimiters.write()],
    },
    async (
      request: FastifyRequest<{ Body: { userId: string; reason?: string } }>,
      reply: FastifyReply
    ) => {
      const { user } = request as AuthenticatedRequest;
      const { userId, reason } = request.body;

      try {
        await tokenRevocationService.revokeAllUserTokens(userId, {
          reason: reason || 'admin_revoked',
          revokedBy: user.id,
        });

        await auditService.logSecurityAction(AuditActions.USER_TOKENS_REVOKE, {
          organizationId: user.organizationId,
          userId: user.id,
          resourceType: 'user',
          resourceId: userId,
          details: { reason, targetUserId: userId, adminAction: true },
          ipAddress: request.ip,
          severity: 'high',
        });

        return reply.send({
          success: true,
          message: `All sessions for user ${userId} revoked`,
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to revoke user sessions');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to revoke user sessions',
        });
      }
    }
  );

  /**
   * POST /sessions/admin/revoke-organization
   * Admin: Revoke all sessions for the organization (security incident response)
   */
  fastify.post(
    '/admin/revoke-organization',
    {
      schema: { body: revokeOrgSessionsSchema },
      preHandler: [requirePermission('organization', 'delete'), rateLimiters.heavy()],
    },
    async (
      request: FastifyRequest<{ Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      const { user } = request as AuthenticatedRequest;
      const { reason } = request.body;

      try {
        await tokenRevocationService.revokeAllOrganizationTokens(user.organizationId, {
          reason: reason || 'security_incident',
          revokedBy: user.id,
        });

        await auditService.logSecurityAction(AuditActions.ORG_TOKENS_REVOKE, {
          organizationId: user.organizationId,
          userId: user.id,
          resourceType: 'organization',
          resourceId: user.organizationId,
          details: { reason, securityIncident: true },
          ipAddress: request.ip,
          severity: 'critical',
        });

        return reply.send({
          success: true,
          message: 'All organization sessions revoked. All users must login again.',
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to revoke organization sessions');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to revoke organization sessions',
        });
      }
    }
  );
}
