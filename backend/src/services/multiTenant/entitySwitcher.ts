/**
 * Entity Switcher Service
 * SCALE Tier - Task T025
 *
 * Handles entity switching for users with multi-entity access
 */

import { PrismaClient, Entity } from '@prisma/client';
import { EntityContext, SwitchEntityResponse } from '@foundry/shared/types/entity';
import { AppError } from '../../lib/errors/AppError';

export interface EntitySwitcherConfig {
  prisma: PrismaClient;
  sessionStore?: SessionStore;
}

export interface SessionStore {
  get(userId: string): Promise<{ entityId: string } | null>;
  set(userId: string, data: { entityId: string }): Promise<void>;
  delete(userId: string): Promise<void>;
}

// In-memory session store for development
class InMemorySessionStore implements SessionStore {
  private store = new Map<string, { entityId: string }>();

  async get(userId: string) {
    return this.store.get(userId) || null;
  }

  async set(userId: string, data: { entityId: string }) {
    this.store.set(userId, data);
  }

  async delete(userId: string) {
    this.store.delete(userId);
  }
}

export class EntitySwitcherService {
  private prisma: PrismaClient;
  private sessionStore: SessionStore;

  constructor(config: EntitySwitcherConfig) {
    this.prisma = config.prisma;
    this.sessionStore = config.sessionStore || new InMemorySessionStore();
  }

  /**
   * Get user's current entity context
   */
  async getCurrentEntity(userId: string): Promise<Entity | null> {
    const session = await this.sessionStore.get(userId);

    if (!session?.entityId) {
      // Get default entity for user
      return this.getDefaultEntity(userId);
    }

    return this.prisma.entity.findUnique({
      where: { id: session.entityId },
    });
  }

  /**
   * Get user's default entity (first entity they have access to)
   */
  async getDefaultEntity(userId: string): Promise<Entity | null> {
    const permission = await this.prisma.userEntityPermission.findFirst({
      where: { userId, canRead: true },
      orderBy: { grantedAt: 'asc' },
      include: { entity: true },
    });

    return permission?.entity || null;
  }

  /**
   * Get all entities user can access
   */
  async getAccessibleEntities(userId: string): Promise<Entity[]> {
    // Check if user is super admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role === 'OWNER') {
      // Super admins can access all entities
      return this.prisma.entity.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      });
    }

    // Get entities from permissions
    const permissions = await this.prisma.userEntityPermission.findMany({
      where: { userId, canRead: true },
      include: {
        entity: true,
      },
    });

    return permissions
      .map(p => p.entity)
      .filter(e => e.status === 'ACTIVE');
  }

  /**
   * Switch user's current entity context
   */
  async switchEntity(
    userId: string,
    targetEntityId: string
  ): Promise<SwitchEntityResponse> {
    // Verify entity exists and is active
    const entity = await this.prisma.entity.findUnique({
      where: { id: targetEntityId },
    });

    if (!entity) {
      throw new AppError('ENTITY_NOT_FOUND', 'Entity not found');
    }

    if (entity.status !== 'ACTIVE') {
      throw new AppError(
        'ENTITY_NOT_ACTIVE',
        `Entity is ${entity.status.toLowerCase()}`
      );
    }

    // Verify user has access
    const hasAccess = await this.checkEntityAccess(userId, targetEntityId);
    if (!hasAccess) {
      throw new AppError('ACCESS_DENIED', 'You do not have access to this entity');
    }

    // Update session
    await this.sessionStore.set(userId, { entityId: targetEntityId });

    // Build new context
    const context = await this.buildEntityContext(userId, entity);

    return {
      success: true,
      entity: entity as any,
      context,
    };
  }

  /**
   * Check if user has access to entity
   */
  async checkEntityAccess(userId: string, entityId: string): Promise<boolean> {
    // Check if super admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role === 'OWNER') {
      return true;
    }

    // Check permissions
    const permission = await this.prisma.userEntityPermission.findUnique({
      where: { userId_entityId: { userId, entityId } },
    });

    return permission?.canRead ?? false;
  }

  /**
   * Build full entity context for user
   */
  async buildEntityContext(userId: string, entity: Entity): Promise<EntityContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isSuperAdmin = user?.role === 'OWNER';

    // Get permissions for current entity
    const permission = await this.prisma.userEntityPermission.findUnique({
      where: { userId_entityId: { userId, entityId: entity.id } },
    });

    // Get all authorized entity IDs
    const permissions = await this.prisma.userEntityPermission.findMany({
      where: { userId, canRead: true },
      select: { entityId: true },
    });
    const authorizedEntityIds = permissions.map(p => p.entityId);

    return {
      entityId: entity.id,
      entity: entity as any,
      userId,
      isSuperAdmin,
      authorizedEntityIds,
      permissions: {
        canRead: isSuperAdmin || (permission?.canRead ?? false),
        canWrite: isSuperAdmin || (permission?.canWrite ?? false),
        canAdmin: isSuperAdmin || (permission?.canAdmin ?? false),
      },
    };
  }

  /**
   * Clear user's entity session
   */
  async clearEntitySession(userId: string): Promise<void> {
    await this.sessionStore.delete(userId);
  }

  /**
   * Get recently accessed entities for user
   */
  async getRecentEntities(userId: string, limit = 5): Promise<Entity[]> {
    // In a real implementation, this would track access history
    // For now, return accessible entities
    const accessible = await this.getAccessibleEntities(userId);
    return accessible.slice(0, limit);
  }

  /**
   * Grant user access to entity
   */
  async grantAccess(
    userId: string,
    entityId: string,
    permissions: {
      canRead?: boolean;
      canWrite?: boolean;
      canAdmin?: boolean;
    },
    grantedBy: string
  ): Promise<void> {
    await this.prisma.userEntityPermission.upsert({
      where: { userId_entityId: { userId, entityId } },
      create: {
        userId,
        entityId,
        canRead: permissions.canRead ?? true,
        canWrite: permissions.canWrite ?? false,
        canAdmin: permissions.canAdmin ?? false,
        grantedBy,
      },
      update: {
        canRead: permissions.canRead,
        canWrite: permissions.canWrite,
        canAdmin: permissions.canAdmin,
        grantedBy,
      },
    });
  }

  /**
   * Revoke user's access to entity
   */
  async revokeAccess(userId: string, entityId: string): Promise<void> {
    await this.prisma.userEntityPermission.delete({
      where: { userId_entityId: { userId, entityId } },
    });

    // If user's current entity is revoked, clear session
    const session = await this.sessionStore.get(userId);
    if (session?.entityId === entityId) {
      await this.sessionStore.delete(userId);
    }
  }

  /**
   * Get users with access to entity
   */
  async getEntityUsers(entityId: string): Promise<
    Array<{
      userId: string;
      canRead: boolean;
      canWrite: boolean;
      canAdmin: boolean;
      grantedAt: Date;
    }>
  > {
    const permissions = await this.prisma.userEntityPermission.findMany({
      where: { entityId },
    });

    return permissions.map(p => ({
      userId: p.userId,
      canRead: p.canRead,
      canWrite: p.canWrite,
      canAdmin: p.canAdmin,
      grantedAt: p.grantedAt,
    }));
  }
}
