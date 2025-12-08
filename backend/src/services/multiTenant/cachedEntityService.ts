/**
 * Cached Entity Service
 * T351 - Redis caching for entity queries
 *
 * Wraps EntityService with Redis caching for improved performance.
 * Uses cache-through pattern for reads and invalidation on writes.
 */

import { Entity } from '@prisma/client';
import {
  CreateEntityInput,
  UpdateEntityInput,
  EntityConfiguration,
  EntityWithHierarchy,
  EntityPath,
  ListEntitiesRequest,
  ListEntitiesResponse,
} from '@foundry/shared/types/entity';
import { EntityService, EntityServiceConfig } from './entityService';
import {
  initEntityCache,
  cacheEntity,
  getEntityById,
  getEntityBySlug,
  invalidateEntity,
  cacheEntityList,
  getEntityList,
  cacheEntityChildren,
  getEntityChildren,
  invalidateEntityLists,
  cacheEntityHierarchy,
  getEntityHierarchy,
  cacheEntityPath,
  getEntityPath as getCachedEntityPath,
  cacheDescendantCount,
  getDescendantCount,
  cacheEntityConfig,
  getEntityConfig,
  cacheEffectiveConfig,
  getEffectiveConfig,
  invalidateEntityTree,
  getEntityCacheStats,
  CachedEntity,
  EntityHierarchyCache,
  EntityConfigCache,
} from '../../lib/cache/entityCache';
import { Redis } from 'ioredis';

export interface CachedEntityServiceConfig extends EntityServiceConfig {
  redis: Redis;
  cachePrefix?: string;
  defaultCacheTTL?: number;
}

export class CachedEntityService extends EntityService {
  private cacheEnabled: boolean = false;

  constructor(config: CachedEntityServiceConfig) {
    super(config);

    // Initialize entity cache
    if (config.redis) {
      initEntityCache(config.redis, {
        prefix: config.cachePrefix || 'entity-cache',
        defaultTTL: config.defaultCacheTTL || 300,
      });
      this.cacheEnabled = true;
    }
  }

  /**
   * Convert Entity to CachedEntity format
   */
  private toCachedEntity(entity: Entity): CachedEntity {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
      parentEntityId: entity.parentEntityId,
      configuration: entity.configuration as Record<string, unknown>,
      dataRetentionDays: entity.dataRetentionDays,
      resellerId: entity.resellerId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /**
   * Convert CachedEntity back to Entity-like format
   */
  private fromCachedEntity(cached: CachedEntity): Entity {
    return {
      ...cached,
      createdAt: new Date(cached.createdAt),
      updatedAt: new Date(cached.updatedAt),
    } as Entity;
  }

  // ==========================================================================
  // Cached CRUD Operations
  // ==========================================================================

  /**
   * Create entity (invalidates list caches)
   */
  async create(input: CreateEntityInput): Promise<Entity> {
    const entity = await super.create(input);

    if (this.cacheEnabled) {
      // Cache the new entity
      await cacheEntity(this.toCachedEntity(entity));
      // Invalidate list caches
      await invalidateEntityLists();
    }

    return entity;
  }

  /**
   * Get entity by ID (cached)
   */
  async getById(id: string): Promise<Entity | null> {
    if (this.cacheEnabled) {
      const cached = await getEntityById(id);
      if (cached) {
        return this.fromCachedEntity(cached);
      }
    }

    const entity = await super.getById(id);

    if (entity && this.cacheEnabled) {
      await cacheEntity(this.toCachedEntity(entity));
    }

    return entity;
  }

  /**
   * Get entity by slug (cached)
   */
  async getBySlug(slug: string): Promise<Entity | null> {
    if (this.cacheEnabled) {
      const cached = await getEntityBySlug(slug);
      if (cached) {
        return this.fromCachedEntity(cached);
      }
    }

    const entity = await super.getBySlug(slug);

    if (entity && this.cacheEnabled) {
      await cacheEntity(this.toCachedEntity(entity));
    }

    return entity;
  }

  /**
   * List entities (cached)
   */
  async list(request: ListEntitiesRequest): Promise<ListEntitiesResponse> {
    if (this.cacheEnabled) {
      const cached = await getEntityList({
        parentEntityId: request.parentEntityId,
        status: request.status,
        search: request.search,
        page: request.page,
        pageSize: request.pageSize,
      });

      if (cached) {
        return {
          entities: cached.entities.map((e) => this.fromCachedEntity(e)),
          total: cached.total,
          page: cached.page,
          pageSize: cached.pageSize,
        };
      }
    }

    const result = await super.list(request);

    if (this.cacheEnabled) {
      await cacheEntityList(
        {
          parentEntityId: request.parentEntityId,
          status: request.status,
          search: request.search,
          page: request.page,
          pageSize: request.pageSize,
        },
        {
          entities: result.entities.map((e) => this.toCachedEntity(e)),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        }
      );
    }

    return result;
  }

  /**
   * Update entity (invalidates caches)
   */
  async update(id: string, input: UpdateEntityInput): Promise<Entity> {
    const existing = await super.getById(id);
    const entity = await super.update(id, input);

    if (this.cacheEnabled) {
      // Invalidate old cache
      await invalidateEntity(id, existing?.slug);
      // Cache updated entity
      await cacheEntity(this.toCachedEntity(entity));
      // Invalidate lists
      await invalidateEntityLists();
    }

    return entity;
  }

  /**
   * Archive entity (invalidates caches)
   */
  async archive(id: string): Promise<Entity> {
    const existing = await super.getById(id);
    const entity = await super.archive(id);

    if (this.cacheEnabled) {
      await invalidateEntityTree(id);
    }

    return entity;
  }

  /**
   * Suspend entity (invalidates caches)
   */
  async suspend(id: string): Promise<Entity> {
    const entity = await super.suspend(id);

    if (this.cacheEnabled) {
      await invalidateEntity(id, entity.slug);
      await invalidateEntityLists();
    }

    return entity;
  }

  /**
   * Reactivate entity (invalidates caches)
   */
  async reactivate(id: string): Promise<Entity> {
    const entity = await super.reactivate(id);

    if (this.cacheEnabled) {
      await invalidateEntity(id, entity.slug);
      await invalidateEntityLists();
    }

    return entity;
  }

  // ==========================================================================
  // Cached Hierarchy Operations
  // ==========================================================================

  /**
   * Get hierarchy depth (cached)
   */
  async getHierarchyDepth(entityId: string): Promise<number> {
    if (this.cacheEnabled) {
      const cached = await getEntityHierarchy(entityId);
      if (cached) {
        return cached.depth;
      }
    }

    return super.getHierarchyDepth(entityId);
  }

  /**
   * Get entity with hierarchy (cached)
   */
  async getWithHierarchy(id: string): Promise<EntityWithHierarchy | null> {
    if (this.cacheEnabled) {
      const cached = await getEntityHierarchy(id);
      if (cached) {
        // We need to fetch the full entity data for this
        // The hierarchy cache mainly helps with path/depth info
      }
    }

    const result = await super.getWithHierarchy(id);

    if (result && this.cacheEnabled) {
      const hierarchyCache: EntityHierarchyCache = {
        entityId: id,
        path: await this.getEntityPathArray(id),
        depth: result.depth,
        childCount: result.childCount,
        cachedAt: new Date().toISOString(),
      };
      await cacheEntityHierarchy(id, hierarchyCache);
    }

    return result;
  }

  /**
   * Get descendant count (cached)
   */
  async getDescendantCount(entityId: string): Promise<number> {
    if (this.cacheEnabled) {
      const cached = await getDescendantCount(entityId);
      if (cached !== null) {
        return cached;
      }
    }

    const count = await super.getDescendantCount(entityId);

    if (this.cacheEnabled) {
      await cacheDescendantCount(entityId, count);
    }

    return count;
  }

  /**
   * Get entity path (cached)
   */
  async getEntityPath(entityId: string): Promise<EntityPath> {
    if (this.cacheEnabled) {
      const cached = await getCachedEntityPath(entityId);
      if (cached) {
        return { entityId, path: cached };
      }
    }

    const result = await super.getEntityPath(entityId);

    if (this.cacheEnabled) {
      await cacheEntityPath(entityId, result.path);
    }

    return result;
  }

  /**
   * Helper to get path as array
   */
  private async getEntityPathArray(
    entityId: string
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    const path = await this.getEntityPath(entityId);
    return path.path;
  }

  // ==========================================================================
  // Cached Configuration Operations
  // ==========================================================================

  /**
   * Get entity configuration (cached)
   */
  async getConfiguration(id: string): Promise<EntityConfiguration> {
    if (this.cacheEnabled) {
      const cached = await getEntityConfig(id);
      if (cached) {
        return cached as EntityConfiguration;
      }
    }

    const config = await super.getConfiguration(id);

    if (this.cacheEnabled) {
      await cacheEntityConfig(id, config);
    }

    return config;
  }

  /**
   * Update entity configuration (invalidates caches)
   */
  async updateConfiguration(
    id: string,
    config: Partial<EntityConfiguration>
  ): Promise<EntityConfiguration> {
    const result = await super.updateConfiguration(id, config);

    if (this.cacheEnabled) {
      // Invalidate config caches
      await invalidateEntity(id);
      // Re-cache updated config
      await cacheEntityConfig(id, result);
    }

    return result;
  }

  /**
   * Get effective configuration with inheritance (cached)
   */
  async getEffectiveConfiguration(id: string): Promise<EntityConfiguration> {
    if (this.cacheEnabled) {
      const cached = await getEffectiveConfig(id);
      if (cached) {
        return cached.effectiveConfig as EntityConfiguration;
      }
    }

    const config = await super.getEffectiveConfiguration(id);

    if (this.cacheEnabled) {
      const path = await this.getEntityPath(id);
      const effectiveCache: EntityConfigCache = {
        entityId: id,
        effectiveConfig: config,
        inheritedFrom: path.path.map((p) => p.id),
        cachedAt: new Date().toISOString(),
      };
      await cacheEffectiveConfig(id, effectiveCache);
    }

    return config;
  }

  // ==========================================================================
  // Cache Statistics
  // ==========================================================================

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return getEntityCacheStats();
  }
}

/**
 * Factory function to create cached entity service
 */
export function createCachedEntityService(
  config: CachedEntityServiceConfig
): CachedEntityService {
  return new CachedEntityService(config);
}

export default CachedEntityService;
