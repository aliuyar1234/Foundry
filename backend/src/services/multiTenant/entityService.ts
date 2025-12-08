/**
 * Entity Service
 * SCALE Tier - Tasks T021-T025
 *
 * CRUD operations and management for multi-tenant entities
 */

import { PrismaClient, Entity, TenantStatus } from '@prisma/client';
import {
  CreateEntityInput,
  UpdateEntityInput,
  EntityConfiguration,
  EntityWithHierarchy,
  EntityPath,
  ListEntitiesRequest,
  ListEntitiesResponse,
} from '@foundry/shared/types/entity';
import { generateSlug } from '../../lib/utils/slugify';
import { AppError } from '../../lib/errors/AppError';

export interface EntityServiceConfig {
  prisma: PrismaClient;
  maxHierarchyDepth?: number;
}

export class EntityService {
  private prisma: PrismaClient;
  private maxHierarchyDepth: number;

  constructor(config: EntityServiceConfig) {
    this.prisma = config.prisma;
    this.maxHierarchyDepth = config.maxHierarchyDepth || 5;
  }

  // ==========================================================================
  // T021: CRUD Operations
  // ==========================================================================

  /**
   * Create a new entity
   */
  async create(input: CreateEntityInput): Promise<Entity> {
    const slug = input.slug || generateSlug(input.name);

    // Check slug uniqueness
    const existing = await this.prisma.entity.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new AppError('ENTITY_SLUG_EXISTS', `Entity with slug '${slug}' already exists`);
    }

    // T022: Validate hierarchy if parent specified
    if (input.parentEntityId) {
      await this.validateHierarchy(input.parentEntityId);
    }

    const entity = await this.prisma.entity.create({
      data: {
        name: input.name,
        slug,
        parentEntityId: input.parentEntityId || null,
        configuration: input.configuration || {},
        dataRetentionDays: input.dataRetentionDays || 730,
        resellerId: input.resellerId || null,
        status: 'ACTIVE',
      },
    });

    return entity;
  }

  /**
   * Get entity by ID
   */
  async getById(id: string): Promise<Entity | null> {
    return this.prisma.entity.findUnique({
      where: { id },
    });
  }

  /**
   * Get entity by slug
   */
  async getBySlug(slug: string): Promise<Entity | null> {
    return this.prisma.entity.findUnique({
      where: { slug },
    });
  }

  /**
   * List entities with filtering
   */
  async list(request: ListEntitiesRequest): Promise<ListEntitiesResponse> {
    const {
      parentEntityId,
      status,
      search,
      includeChildren = false,
      page = 1,
      pageSize = 20,
    } = request;

    const where: any = {};

    if (parentEntityId !== undefined) {
      where.parentEntityId = parentEntityId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [entities, total] = await Promise.all([
      this.prisma.entity.findMany({
        where,
        include: includeChildren ? { children: true } : undefined,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.entity.count({ where }),
    ]);

    return {
      entities,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Update entity
   */
  async update(id: string, input: UpdateEntityInput): Promise<Entity> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new AppError('ENTITY_NOT_FOUND', `Entity with ID '${id}' not found`);
    }

    // T023: Merge configuration if provided
    const configuration = input.configuration
      ? this.mergeConfiguration(
          existing.configuration as EntityConfiguration,
          input.configuration
        )
      : existing.configuration;

    return this.prisma.entity.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        configuration,
        status: input.status ?? existing.status,
        dataRetentionDays: input.dataRetentionDays ?? existing.dataRetentionDays,
      },
    });
  }

  /**
   * Archive entity (soft delete)
   */
  async archive(id: string): Promise<Entity> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new AppError('ENTITY_NOT_FOUND', `Entity with ID '${id}' not found`);
    }

    // Check for active children
    const childCount = await this.prisma.entity.count({
      where: {
        parentEntityId: id,
        status: 'ACTIVE',
      },
    });

    if (childCount > 0) {
      throw new AppError(
        'ENTITY_HAS_CHILDREN',
        `Cannot archive entity with ${childCount} active children`
      );
    }

    return this.prisma.entity.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  /**
   * Suspend entity
   */
  async suspend(id: string): Promise<Entity> {
    return this.prisma.entity.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
  }

  /**
   * Reactivate entity
   */
  async reactivate(id: string): Promise<Entity> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new AppError('ENTITY_NOT_FOUND', `Entity with ID '${id}' not found`);
    }

    // If parent is suspended/archived, cannot reactivate
    if (existing.parentEntityId) {
      const parent = await this.getById(existing.parentEntityId);
      if (parent && parent.status !== 'ACTIVE') {
        throw new AppError(
          'PARENT_NOT_ACTIVE',
          `Cannot reactivate entity while parent is ${parent.status.toLowerCase()}`
        );
      }
    }

    return this.prisma.entity.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  // ==========================================================================
  // T022: Hierarchy Validation
  // ==========================================================================

  /**
   * Validate hierarchy doesn't exceed max depth
   */
  async validateHierarchy(parentEntityId: string): Promise<void> {
    const depth = await this.getHierarchyDepth(parentEntityId);

    if (depth >= this.maxHierarchyDepth) {
      throw new AppError(
        'HIERARCHY_TOO_DEEP',
        `Entity hierarchy cannot exceed ${this.maxHierarchyDepth} levels`
      );
    }
  }

  /**
   * Get depth of entity in hierarchy
   */
  async getHierarchyDepth(entityId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = entityId;

    while (currentId && depth < this.maxHierarchyDepth + 1) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: currentId },
        select: { parentEntityId: true },
      });

      if (!entity) break;
      currentId = entity.parentEntityId;
      depth++;
    }

    return depth;
  }

  /**
   * Get entity with full hierarchy
   */
  async getWithHierarchy(id: string): Promise<EntityWithHierarchy | null> {
    const entity = await this.prisma.entity.findUnique({
      where: { id },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true,
              },
            },
          },
        },
      },
    });

    if (!entity) return null;

    const depth = await this.getHierarchyDepth(id);
    const childCount = await this.getDescendantCount(id);

    return {
      ...entity,
      configuration: entity.configuration as EntityConfiguration,
      status: entity.status as TenantStatus,
      children: await this.buildHierarchyTree(entity.children as any[], depth + 1),
      childCount,
      depth,
    };
  }

  /**
   * Build hierarchy tree recursively
   */
  private async buildHierarchyTree(
    entities: any[],
    currentDepth: number
  ): Promise<EntityWithHierarchy[]> {
    return Promise.all(
      entities.map(async (entity) => {
        const childCount = await this.getDescendantCount(entity.id);
        return {
          ...entity,
          configuration: entity.configuration as EntityConfiguration,
          status: entity.status as TenantStatus,
          children: entity.children
            ? await this.buildHierarchyTree(entity.children, currentDepth + 1)
            : [],
          childCount,
          depth: currentDepth,
        };
      })
    );
  }

  /**
   * Count all descendants of an entity
   */
  async getDescendantCount(entityId: string): Promise<number> {
    // Using recursive CTE would be more efficient in production
    const children = await this.prisma.entity.findMany({
      where: { parentEntityId: entityId },
      select: { id: true },
    });

    let count = children.length;
    for (const child of children) {
      count += await this.getDescendantCount(child.id);
    }

    return count;
  }

  /**
   * Get path from root to entity
   */
  async getEntityPath(entityId: string): Promise<EntityPath> {
    const path: Array<{ id: string; name: string; slug: string }> = [];
    let currentId: string | null = entityId;

    while (currentId) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, slug: true, parentEntityId: true },
      });

      if (!entity) break;

      path.unshift({
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
      });

      currentId = entity.parentEntityId;
    }

    return {
      entityId,
      path,
    };
  }

  // ==========================================================================
  // T023: Configuration Management
  // ==========================================================================

  /**
   * Get entity configuration
   */
  async getConfiguration(id: string): Promise<EntityConfiguration> {
    const entity = await this.getById(id);
    if (!entity) {
      throw new AppError('ENTITY_NOT_FOUND', `Entity with ID '${id}' not found`);
    }

    return entity.configuration as EntityConfiguration;
  }

  /**
   * Update entity configuration (partial update)
   */
  async updateConfiguration(
    id: string,
    config: Partial<EntityConfiguration>
  ): Promise<EntityConfiguration> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new AppError('ENTITY_NOT_FOUND', `Entity with ID '${id}' not found`);
    }

    const merged = this.mergeConfiguration(
      existing.configuration as EntityConfiguration,
      config
    );

    await this.prisma.entity.update({
      where: { id },
      data: { configuration: merged },
    });

    return merged;
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfiguration(
    existing: EntityConfiguration,
    updates: Partial<EntityConfiguration>
  ): EntityConfiguration {
    return {
      branding: { ...existing.branding, ...updates.branding },
      features: { ...existing.features, ...updates.features },
      integrations: { ...existing.integrations, ...updates.integrations },
      limits: { ...existing.limits, ...updates.limits },
      localization: { ...existing.localization, ...updates.localization },
      security: {
        ...existing.security,
        ...updates.security,
        passwordPolicy: {
          ...existing.security?.passwordPolicy,
          ...updates.security?.passwordPolicy,
        },
      },
    };
  }

  /**
   * Get effective configuration (inherited from parent if not set)
   */
  async getEffectiveConfiguration(id: string): Promise<EntityConfiguration> {
    const path = await this.getEntityPath(id);
    let config: EntityConfiguration = {};

    // Traverse from root to entity, merging configurations
    for (const node of path.path) {
      const entity = await this.getById(node.id);
      if (entity) {
        config = this.mergeConfiguration(
          config,
          entity.configuration as EntityConfiguration
        );
      }
    }

    return config;
  }
}
