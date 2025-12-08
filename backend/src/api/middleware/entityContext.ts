/**
 * Entity Context Middleware
 * SCALE Tier - Tasks T013-T016
 *
 * Implements multi-tenant context for Row-Level Security (RLS)
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { EntityContext } from '@foundry/shared/types/entity';

// Extend Fastify request with entity context
declare module 'fastify' {
  interface FastifyRequest {
    entityContext?: EntityContext;
  }
}

interface EntityContextConfig {
  prisma: PrismaClient;
  headerName?: string;
  queryParam?: string;
  allowEntitySwitching?: boolean;
}

/**
 * T013: Create entityContext middleware
 * Sets up the entity context from JWT claims or headers
 */
export function createEntityContextMiddleware(config: EntityContextConfig) {
  const {
    prisma,
    headerName = 'X-Entity-ID',
    queryParam = 'entityId',
    allowEntitySwitching = true,
  } = config;

  return async function entityContextMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // T014: Extract entity selection from JWT/headers
      const entityId = extractEntityId(request, headerName, queryParam);
      const userId = extractUserId(request);

      if (!userId) {
        // No authenticated user, skip entity context
        return;
      }

      // Get user's default entity if no entity specified
      const targetEntityId = entityId || await getDefaultEntityId(prisma, userId);

      if (!targetEntityId) {
        // User has no entities assigned
        request.entityContext = createEmptyContext(userId);
        return;
      }

      // Verify entity exists and user has access
      const entity = await prisma.entity.findUnique({
        where: { id: targetEntityId },
      });

      if (!entity) {
        reply.code(404).send({ error: 'Entity not found' });
        return;
      }

      if (entity.status !== 'ACTIVE') {
        reply.code(403).send({ error: `Entity is ${entity.status.toLowerCase()}` });
        return;
      }

      // Check user permissions for this entity
      const permissions = await getUserEntityPermissions(prisma, userId, targetEntityId);
      const isSuperAdmin = await checkSuperAdmin(prisma, userId);

      if (!isSuperAdmin && !permissions.canRead) {
        reply.code(403).send({ error: 'Access denied to this entity' });
        return;
      }

      // Get all authorized entities for cross-entity queries
      const authorizedEntityIds = await getAuthorizedEntityIds(prisma, userId);

      // T015: Set RLS context in database connection
      await setDatabaseContext(prisma, targetEntityId, userId, isSuperAdmin);

      // Build entity context
      request.entityContext = {
        entityId: targetEntityId,
        entity: {
          id: entity.id,
          name: entity.name,
          slug: entity.slug,
          parentEntityId: entity.parentEntityId,
          configuration: entity.configuration as any,
          status: entity.status as any,
          dataRetentionDays: entity.dataRetentionDays,
          resellerId: entity.resellerId,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
        },
        userId,
        isSuperAdmin,
        authorizedEntityIds,
        permissions,
      };
    } catch (error) {
      request.log.error({ error }, 'Failed to establish entity context');
      reply.code(500).send({ error: 'Failed to establish entity context' });
    }
  };
}

/**
 * T014: Extract entity ID from request
 */
function extractEntityId(
  request: FastifyRequest,
  headerName: string,
  queryParam: string
): string | null {
  // Priority: Header > Query param > JWT claim
  const fromHeader = request.headers[headerName.toLowerCase()] as string;
  if (fromHeader) {
    return fromHeader;
  }

  const query = request.query as Record<string, string>;
  if (query[queryParam]) {
    return query[queryParam];
  }

  // Try to get from JWT claims
  const user = (request as any).user;
  if (user?.entityId) {
    return user.entityId;
  }

  return null;
}

/**
 * Extract user ID from authenticated request
 */
function extractUserId(request: FastifyRequest): string | null {
  const user = (request as any).user;
  return user?.id || user?.sub || null;
}

/**
 * Get user's default entity
 */
async function getDefaultEntityId(
  prisma: PrismaClient,
  userId: string
): Promise<string | null> {
  // Find first entity user has access to
  const permission = await prisma.userEntityPermission.findFirst({
    where: { userId, canRead: true },
    orderBy: { grantedAt: 'asc' },
  });

  return permission?.entityId || null;
}

/**
 * Get user's permissions for a specific entity
 */
async function getUserEntityPermissions(
  prisma: PrismaClient,
  userId: string,
  entityId: string
): Promise<{ canRead: boolean; canWrite: boolean; canAdmin: boolean }> {
  const permission = await prisma.userEntityPermission.findUnique({
    where: { userId_entityId: { userId, entityId } },
  });

  if (!permission) {
    return { canRead: false, canWrite: false, canAdmin: false };
  }

  return {
    canRead: permission.canRead,
    canWrite: permission.canWrite,
    canAdmin: permission.canAdmin,
  };
}

/**
 * Check if user is a super admin
 */
async function checkSuperAdmin(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user?.role === 'OWNER';
}

/**
 * Get all entity IDs the user has read access to
 */
async function getAuthorizedEntityIds(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  const permissions = await prisma.userEntityPermission.findMany({
    where: { userId, canRead: true },
    select: { entityId: true },
  });

  return permissions.map(p => p.entityId);
}

/**
 * T015: Set RLS context in database connection
 */
async function setDatabaseContext(
  prisma: PrismaClient,
  entityId: string,
  userId: string,
  isSuperAdmin: boolean
): Promise<void> {
  // Execute raw SQL to set session context for RLS
  await prisma.$executeRawUnsafe(`
    SELECT set_config('app.current_entity_id', $1, true);
    SELECT set_config('app.current_user_id', $2, true);
    SELECT set_config('app.is_super_admin', $3, true);
  `, entityId, userId, isSuperAdmin.toString());
}

/**
 * Create empty context for unauthenticated users
 */
function createEmptyContext(userId: string): EntityContext {
  return {
    entityId: '',
    entity: null as any,
    userId,
    isSuperAdmin: false,
    authorizedEntityIds: [],
    permissions: {
      canRead: false,
      canWrite: false,
      canAdmin: false,
    },
  };
}

/**
 * T016: Entity permission checker middleware
 * Use this to require specific permissions for routes
 */
export function requireEntityPermission(permission: 'read' | 'write' | 'admin') {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = request.entityContext;

    if (!ctx) {
      reply.code(401).send({ error: 'Entity context not established' });
      return;
    }

    if (ctx.isSuperAdmin) {
      return; // Super admins bypass permission checks
    }

    const hasPermission =
      (permission === 'read' && ctx.permissions.canRead) ||
      (permission === 'write' && ctx.permissions.canWrite) ||
      (permission === 'admin' && ctx.permissions.canAdmin);

    if (!hasPermission) {
      reply.code(403).send({
        error: `Insufficient permissions. Required: ${permission}`
      });
    }
  };
}

/**
 * Require access to specific entity (not just current context)
 */
export function requireEntityAccess(permission: 'read' | 'write' | 'admin') {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = request.entityContext;
    const params = request.params as Record<string, string>;
    const targetEntityId = params.entityId || params.id;

    if (!ctx) {
      reply.code(401).send({ error: 'Entity context not established' });
      return;
    }

    if (!targetEntityId) {
      reply.code(400).send({ error: 'Entity ID required' });
      return;
    }

    if (ctx.isSuperAdmin) {
      return; // Super admins bypass permission checks
    }

    // Check if user has access to the target entity
    const hasAccess = ctx.authorizedEntityIds.includes(targetEntityId);
    if (!hasAccess) {
      reply.code(403).send({
        error: 'Access denied to this entity'
      });
    }
  };
}

/**
 * Helper to get current entity ID from request
 */
export function getCurrentEntityId(request: FastifyRequest): string {
  const ctx = request.entityContext;
  if (!ctx?.entityId) {
    throw new Error('Entity context not established');
  }
  return ctx.entityId;
}

/**
 * Helper to check if user can access multiple entities
 */
export function canAccessMultipleEntities(request: FastifyRequest): boolean {
  const ctx = request.entityContext;
  return ctx ? ctx.authorizedEntityIds.length > 1 || ctx.isSuperAdmin : false;
}
