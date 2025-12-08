/**
 * Entity Cache Service
 * T351 - Redis caching for entity queries
 *
 * Provides high-performance caching for entity-related queries
 * to reduce database load and improve response times.
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';

// Types
export interface EntityCacheConfig {
  prefix: string;
  defaultTTL: number;
  enableCompression: boolean;
  compressionThreshold: number;
}

export interface CachedEntity {
  id: string;
  name: string;
  slug: string;
  status: string;
  parentEntityId: string | null;
  configuration: Record<string, unknown>;
  dataRetentionDays: number;
  resellerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntityHierarchyCache {
  entityId: string;
  path: Array<{ id: string; name: string; slug: string }>;
  depth: number;
  childCount: number;
  cachedAt: string;
}

export interface EntityConfigCache {
  entityId: string;
  effectiveConfig: Record<string, unknown>;
  inheritedFrom: string[];
  cachedAt: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  avgLatencyMs: number;
}

// Configuration
const DEFAULT_CONFIG: EntityCacheConfig = {
  prefix: 'entity-cache',
  defaultTTL: 300, // 5 minutes
  enableCompression: true,
  compressionThreshold: 4096,
};

// TTL configurations for different cache types
const CACHE_TTL: Record<string, number> = {
  // Single entity - moderate TTL
  entity: 300, // 5 minutes
  'entity-by-slug': 300, // 5 minutes

  // Entity lists - shorter TTL
  'entity-list': 60, // 1 minute
  'entity-children': 120, // 2 minutes

  // Hierarchy data - longer TTL (changes less frequently)
  hierarchy: 600, // 10 minutes
  'entity-path': 600, // 10 minutes
  'descendant-count': 300, // 5 minutes

  // Configuration - moderate TTL
  config: 300, // 5 minutes
  'effective-config': 300, // 5 minutes

  // Cross-entity data
  'user-entities': 180, // 3 minutes
  'cross-entity-stats': 120, // 2 minutes

  // Default
  default: 180, // 3 minutes
};

// State
let redis: Redis | null = null;
let config: EntityCacheConfig = DEFAULT_CONFIG;
let stats = { hits: 0, misses: 0, totalLatencyMs: 0, operations: 0 };

/**
 * Initialize the entity cache
 */
export function initEntityCache(
  redisClient: Redis,
  cacheConfig?: Partial<EntityCacheConfig>
): void {
  redis = redisClient;
  config = { ...DEFAULT_CONFIG, ...cacheConfig };
  stats = { hits: 0, misses: 0, totalLatencyMs: 0, operations: 0 };
}

/**
 * Generate cache key
 */
function generateKey(keyType: string, ...parts: string[]): string {
  return `${config.prefix}:${keyType}:${parts.join(':')}`;
}

/**
 * Generate hash for complex query parameters
 */
function hashParams(params: Record<string, unknown>): string {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .slice(0, 12);
}

/**
 * Compress data if needed
 */
async function compress(data: string): Promise<string> {
  if (!config.enableCompression || data.length < config.compressionThreshold) {
    return data;
  }

  const { promisify } = await import('util');
  const zlib = await import('zlib');
  const gzip = promisify(zlib.gzip);
  const compressed = await gzip(Buffer.from(data));
  return `__gzip:${compressed.toString('base64')}`;
}

/**
 * Decompress data if needed
 */
async function decompress(data: string): Promise<string> {
  if (!data.startsWith('__gzip:')) {
    return data;
  }

  const { promisify } = await import('util');
  const zlib = await import('zlib');
  const gunzip = promisify(zlib.gunzip);
  const compressed = Buffer.from(data.slice(7), 'base64');
  const decompressed = await gunzip(compressed);
  return decompressed.toString();
}

/**
 * Track operation timing
 */
function trackTiming(startTime: number, isHit: boolean): void {
  const latency = Date.now() - startTime;
  stats.totalLatencyMs += latency;
  stats.operations++;
  if (isHit) {
    stats.hits++;
  } else {
    stats.misses++;
  }
}

/**
 * Generic get from cache
 */
async function get<T>(key: string): Promise<T | null> {
  if (!redis) return null;

  const startTime = Date.now();

  try {
    const cached = await redis.get(key);
    if (!cached) {
      trackTiming(startTime, false);
      return null;
    }

    trackTiming(startTime, true);
    const decompressed = await decompress(cached);
    return JSON.parse(decompressed);
  } catch (error) {
    console.error('Entity cache get error:', error);
    trackTiming(startTime, false);
    return null;
  }
}

/**
 * Generic set to cache
 */
async function set<T>(key: string, data: T, ttl: number): Promise<void> {
  if (!redis) return;

  try {
    const serialized = JSON.stringify(data);
    const compressed = await compress(serialized);
    await redis.setex(key, ttl, compressed);
  } catch (error) {
    console.error('Entity cache set error:', error);
  }
}

/**
 * Delete from cache
 */
async function del(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Entity cache delete error:', error);
  }
}

// ==========================================
// Entity CRUD Caching
// ==========================================

/**
 * Cache single entity
 */
export async function cacheEntity(entity: CachedEntity): Promise<void> {
  const keyById = generateKey('entity', entity.id);
  const keyBySlug = generateKey('entity-by-slug', entity.slug);

  await Promise.all([
    set(keyById, entity, CACHE_TTL.entity),
    set(keyBySlug, entity, CACHE_TTL['entity-by-slug']),
  ]);
}

/**
 * Get cached entity by ID
 */
export async function getEntityById(id: string): Promise<CachedEntity | null> {
  const key = generateKey('entity', id);
  return get(key);
}

/**
 * Get cached entity by slug
 */
export async function getEntityBySlug(slug: string): Promise<CachedEntity | null> {
  const key = generateKey('entity-by-slug', slug);
  return get(key);
}

/**
 * Invalidate entity cache
 */
export async function invalidateEntity(id: string, slug?: string): Promise<void> {
  const keys = [generateKey('entity', id)];
  if (slug) {
    keys.push(generateKey('entity-by-slug', slug));
  }

  // Also invalidate related caches
  keys.push(
    generateKey('hierarchy', id),
    generateKey('entity-path', id),
    generateKey('config', id),
    generateKey('effective-config', id),
    generateKey('descendant-count', id)
  );

  if (redis) {
    await redis.del(...keys);
  }
}

// ==========================================
// Entity List Caching
// ==========================================

/**
 * Cache entity list
 */
export async function cacheEntityList(
  params: {
    parentEntityId?: string | null;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
  result: {
    entities: CachedEntity[];
    total: number;
    page: number;
    pageSize: number;
  }
): Promise<void> {
  const paramsHash = hashParams(params);
  const key = generateKey('entity-list', paramsHash);
  await set(key, result, CACHE_TTL['entity-list']);
}

/**
 * Get cached entity list
 */
export async function getEntityList(
  params: {
    parentEntityId?: string | null;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{
  entities: CachedEntity[];
  total: number;
  page: number;
  pageSize: number;
} | null> {
  const paramsHash = hashParams(params);
  const key = generateKey('entity-list', paramsHash);
  return get(key);
}

/**
 * Cache entity children
 */
export async function cacheEntityChildren(
  parentId: string,
  children: CachedEntity[]
): Promise<void> {
  const key = generateKey('entity-children', parentId);
  await set(key, children, CACHE_TTL['entity-children']);
}

/**
 * Get cached entity children
 */
export async function getEntityChildren(parentId: string): Promise<CachedEntity[] | null> {
  const key = generateKey('entity-children', parentId);
  return get(key);
}

/**
 * Invalidate entity list caches
 */
export async function invalidateEntityLists(): Promise<void> {
  if (!redis) return;

  try {
    const pattern = `${config.prefix}:entity-list:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    const childrenPattern = `${config.prefix}:entity-children:*`;
    const childrenKeys = await redis.keys(childrenPattern);
    if (childrenKeys.length > 0) {
      await redis.del(...childrenKeys);
    }
  } catch (error) {
    console.error('Entity list cache invalidation error:', error);
  }
}

// ==========================================
// Hierarchy Caching
// ==========================================

/**
 * Cache entity hierarchy
 */
export async function cacheEntityHierarchy(
  entityId: string,
  hierarchy: EntityHierarchyCache
): Promise<void> {
  const key = generateKey('hierarchy', entityId);
  await set(key, hierarchy, CACHE_TTL.hierarchy);
}

/**
 * Get cached entity hierarchy
 */
export async function getEntityHierarchy(
  entityId: string
): Promise<EntityHierarchyCache | null> {
  const key = generateKey('hierarchy', entityId);
  return get(key);
}

/**
 * Cache entity path
 */
export async function cacheEntityPath(
  entityId: string,
  path: Array<{ id: string; name: string; slug: string }>
): Promise<void> {
  const key = generateKey('entity-path', entityId);
  await set(key, { path, cachedAt: new Date().toISOString() }, CACHE_TTL['entity-path']);
}

/**
 * Get cached entity path
 */
export async function getEntityPath(
  entityId: string
): Promise<Array<{ id: string; name: string; slug: string }> | null> {
  const key = generateKey('entity-path', entityId);
  const result = await get<{ path: Array<{ id: string; name: string; slug: string }> }>(key);
  return result?.path || null;
}

/**
 * Cache descendant count
 */
export async function cacheDescendantCount(
  entityId: string,
  count: number
): Promise<void> {
  const key = generateKey('descendant-count', entityId);
  await set(key, { count, cachedAt: new Date().toISOString() }, CACHE_TTL['descendant-count']);
}

/**
 * Get cached descendant count
 */
export async function getDescendantCount(entityId: string): Promise<number | null> {
  const key = generateKey('descendant-count', entityId);
  const result = await get<{ count: number }>(key);
  return result?.count ?? null;
}

// ==========================================
// Configuration Caching
// ==========================================

/**
 * Cache entity configuration
 */
export async function cacheEntityConfig(
  entityId: string,
  config: Record<string, unknown>
): Promise<void> {
  const key = generateKey('config', entityId);
  await set(key, { config, cachedAt: new Date().toISOString() }, CACHE_TTL.config);
}

/**
 * Get cached entity configuration
 */
export async function getEntityConfig(
  entityId: string
): Promise<Record<string, unknown> | null> {
  const key = generateKey('config', entityId);
  const result = await get<{ config: Record<string, unknown> }>(key);
  return result?.config || null;
}

/**
 * Cache effective configuration (with inheritance)
 */
export async function cacheEffectiveConfig(
  entityId: string,
  effectiveConfig: EntityConfigCache
): Promise<void> {
  const key = generateKey('effective-config', entityId);
  await set(key, effectiveConfig, CACHE_TTL['effective-config']);
}

/**
 * Get cached effective configuration
 */
export async function getEffectiveConfig(
  entityId: string
): Promise<EntityConfigCache | null> {
  const key = generateKey('effective-config', entityId);
  return get(key);
}

// ==========================================
// Cross-Entity Caching
// ==========================================

/**
 * Cache user's accessible entities
 */
export async function cacheUserEntities(
  userId: string,
  entities: Array<{ id: string; name: string; role: string }>
): Promise<void> {
  const key = generateKey('user-entities', userId);
  await set(key, entities, CACHE_TTL['user-entities']);
}

/**
 * Get cached user's accessible entities
 */
export async function getUserEntities(
  userId: string
): Promise<Array<{ id: string; name: string; role: string }> | null> {
  const key = generateKey('user-entities', userId);
  return get(key);
}

/**
 * Invalidate user entities cache
 */
export async function invalidateUserEntities(userId: string): Promise<void> {
  const key = generateKey('user-entities', userId);
  await del(key);
}

/**
 * Cache cross-entity statistics
 */
export async function cacheCrossEntityStats(
  userId: string,
  entityIds: string[],
  stats: Record<string, unknown>
): Promise<void> {
  const entitiesHash = hashParams({ entityIds: entityIds.sort() });
  const key = generateKey('cross-entity-stats', userId, entitiesHash);
  await set(key, stats, CACHE_TTL['cross-entity-stats']);
}

/**
 * Get cached cross-entity statistics
 */
export async function getCrossEntityStats(
  userId: string,
  entityIds: string[]
): Promise<Record<string, unknown> | null> {
  const entitiesHash = hashParams({ entityIds: entityIds.sort() });
  const key = generateKey('cross-entity-stats', userId, entitiesHash);
  return get(key);
}

// ==========================================
// Cache Management
// ==========================================

/**
 * Invalidate all caches for an entity and its relatives
 */
export async function invalidateEntityTree(entityId: string): Promise<void> {
  // Invalidate the entity itself
  await invalidateEntity(entityId);

  // Invalidate all list caches
  await invalidateEntityLists();

  // Invalidate parent hierarchy caches if needed
  if (!redis) return;

  try {
    // Get all hierarchy keys and invalidate them
    const hierarchyPattern = `${config.prefix}:hierarchy:*`;
    const hierarchyKeys = await redis.keys(hierarchyPattern);
    if (hierarchyKeys.length > 0) {
      await redis.del(...hierarchyKeys);
    }
  } catch (error) {
    console.error('Entity tree invalidation error:', error);
  }
}

/**
 * Clear all entity cache
 */
export async function clearAllEntityCache(): Promise<number> {
  if (!redis) return 0;

  try {
    const pattern = `${config.prefix}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (error) {
    console.error('Clear entity cache error:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export function getEntityCacheStats(): CacheStats {
  const hitRate =
    stats.hits + stats.misses > 0
      ? stats.hits / (stats.hits + stats.misses)
      : 0;

  const avgLatencyMs =
    stats.operations > 0 ? stats.totalLatencyMs / stats.operations : 0;

  return {
    hits: stats.hits,
    misses: stats.misses,
    hitRate,
    avgLatencyMs,
  };
}

/**
 * Reset statistics
 */
export function resetEntityCacheStats(): void {
  stats = { hits: 0, misses: 0, totalLatencyMs: 0, operations: 0 };
}

/**
 * Cache-through helper for entity operations
 */
export async function entityCacheThrough<T>(
  keyType: string,
  keyParts: string[],
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const key = generateKey(keyType, ...keyParts);
  const cached = await get<T>(key);

  if (cached !== null) {
    return cached;
  }

  const result = await fetchFn();
  const cacheTTL = ttl ?? CACHE_TTL[keyType] ?? CACHE_TTL.default;

  // Non-blocking cache write
  set(key, result, cacheTTL).catch(() => {});

  return result;
}

// Export types and default export
export type { CacheStats };

export default {
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
  getEntityPath,
  cacheDescendantCount,
  getDescendantCount,
  cacheEntityConfig,
  getEntityConfig,
  cacheEffectiveConfig,
  getEffectiveConfig,
  cacheUserEntities,
  getUserEntities,
  invalidateUserEntities,
  cacheCrossEntityStats,
  getCrossEntityStats,
  invalidateEntityTree,
  clearAllEntityCache,
  getEntityCacheStats,
  resetEntityCacheStats,
  entityCacheThrough,
};
