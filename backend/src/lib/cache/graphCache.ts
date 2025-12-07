/**
 * Graph Query Cache (T185)
 * Redis caching layer for Neo4j graph queries
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';

// Cache configuration
interface CacheConfig {
  // Default TTL in seconds
  defaultTTL: number;
  // Key prefix
  prefix: string;
  // Enable compression for large values
  enableCompression: boolean;
  // Maximum value size (bytes) before compression
  compressionThreshold: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 300, // 5 minutes
  prefix: 'graph',
  enableCompression: true,
  compressionThreshold: 1024, // 1KB
};

// TTL configuration for different query types
const QUERY_TTL: Record<string, number> = {
  // Organization structure - rarely changes
  'org-structure': 3600, // 1 hour

  // Person data - moderate change frequency
  person: 600, // 10 minutes
  'person-list': 300, // 5 minutes

  // Process data - changes with discovery runs
  process: 600, // 10 minutes
  'process-list': 300, // 5 minutes
  'process-metrics': 300, // 5 minutes

  // Network/communication data - changes with sync
  network: 180, // 3 minutes
  communication: 180, // 3 minutes

  // Discovery results - changes infrequently
  discovery: 900, // 15 minutes
  insights: 600, // 10 minutes

  // Bus factor analysis - computationally expensive
  'bus-factor': 1800, // 30 minutes

  // Default
  default: 300, // 5 minutes
};

let redis: Redis | null = null;
let config: CacheConfig = DEFAULT_CONFIG;

/**
 * Initialize the graph cache with Redis client
 */
export function initGraphCache(redisClient: Redis, cacheConfig?: Partial<CacheConfig>): void {
  redis = redisClient;
  config = { ...DEFAULT_CONFIG, ...cacheConfig };
}

/**
 * Generate cache key from query and parameters
 */
function generateCacheKey(
  organizationId: string,
  queryType: string,
  params: Record<string, unknown> = {}
): string {
  // Create a stable hash of the parameters
  const paramHash = crypto
    .createHash('md5')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .slice(0, 12);

  return `${config.prefix}:${organizationId}:${queryType}:${paramHash}`;
}

/**
 * Get cached query result
 */
export async function getCached<T>(
  organizationId: string,
  queryType: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  if (!redis) return null;

  const key = generateCacheKey(organizationId, queryType, params);

  try {
    const cached = await redis.get(key);
    if (!cached) return null;

    // Check if compressed
    if (cached.startsWith('__compressed:')) {
      const compressed = Buffer.from(cached.slice(13), 'base64');
      const { promisify } = await import('util');
      const zlib = await import('zlib');
      const gunzip = promisify(zlib.gunzip);
      const decompressed = await gunzip(compressed);
      return JSON.parse(decompressed.toString());
    }

    return JSON.parse(cached);
  } catch (error) {
    // Log error but don't throw - cache miss is acceptable
    console.error('Graph cache get error:', error);
    return null;
  }
}

/**
 * Set cached query result
 */
export async function setCached<T>(
  organizationId: string,
  queryType: string,
  params: Record<string, unknown>,
  data: T,
  customTTL?: number
): Promise<void> {
  if (!redis) return;

  const key = generateCacheKey(organizationId, queryType, params);
  const ttl = customTTL ?? QUERY_TTL[queryType] ?? QUERY_TTL.default;

  try {
    let value = JSON.stringify(data);

    // Compress if enabled and value is large
    if (config.enableCompression && value.length > config.compressionThreshold) {
      const { promisify } = await import('util');
      const zlib = await import('zlib');
      const gzip = promisify(zlib.gzip);
      const compressed = await gzip(Buffer.from(value));
      value = '__compressed:' + compressed.toString('base64');
    }

    await redis.setex(key, ttl, value);
  } catch (error) {
    // Log error but don't throw - cache write failure is acceptable
    console.error('Graph cache set error:', error);
  }
}

/**
 * Invalidate cache for specific query type
 */
export async function invalidateCache(
  organizationId: string,
  queryType?: string
): Promise<number> {
  if (!redis) return 0;

  try {
    const pattern = queryType
      ? `${config.prefix}:${organizationId}:${queryType}:*`
      : `${config.prefix}:${organizationId}:*`;

    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;

    const deleted = await redis.del(...keys);
    return deleted;
  } catch (error) {
    console.error('Graph cache invalidate error:', error);
    return 0;
  }
}

/**
 * Invalidate all cache for organization
 */
export async function invalidateOrganizationCache(organizationId: string): Promise<number> {
  return invalidateCache(organizationId);
}

/**
 * Cache-through pattern for graph queries
 */
export async function cacheThrough<T>(
  organizationId: string,
  queryType: string,
  params: Record<string, unknown>,
  queryFn: () => Promise<T>,
  customTTL?: number
): Promise<T> {
  // Try cache first
  const cached = await getCached<T>(organizationId, queryType, params);
  if (cached !== null) {
    return cached;
  }

  // Execute query
  const result = await queryFn();

  // Cache result (non-blocking)
  setCached(organizationId, queryType, params, result, customTTL).catch(() => {
    // Silently ignore cache write failures
  });

  return result;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(organizationId?: string): Promise<{
  totalKeys: number;
  keysByType: Record<string, number>;
  memoryUsage: string;
}> {
  if (!redis) {
    return {
      totalKeys: 0,
      keysByType: {},
      memoryUsage: 'N/A',
    };
  }

  try {
    const pattern = organizationId
      ? `${config.prefix}:${organizationId}:*`
      : `${config.prefix}:*`;

    const keys = await redis.keys(pattern);

    // Count keys by type
    const keysByType: Record<string, number> = {};
    for (const key of keys) {
      const parts = key.split(':');
      const type = parts[2] || 'unknown';
      keysByType[type] = (keysByType[type] || 0) + 1;
    }

    // Get memory usage
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';

    return {
      totalKeys: keys.length,
      keysByType,
      memoryUsage,
    };
  } catch (error) {
    console.error('Graph cache stats error:', error);
    return {
      totalKeys: 0,
      keysByType: {},
      memoryUsage: 'N/A',
    };
  }
}

/**
 * Warm cache with common queries
 */
export async function warmCache(
  organizationId: string,
  queryFunctions: Record<string, () => Promise<unknown>>
): Promise<void> {
  const promises = Object.entries(queryFunctions).map(async ([queryType, queryFn]) => {
    try {
      const result = await queryFn();
      await setCached(organizationId, queryType, {}, result);
    } catch (error) {
      console.error(`Cache warm failed for ${queryType}:`, error);
    }
  });

  await Promise.allSettled(promises);
}

/**
 * Create a cached version of a query function
 */
export function createCachedQuery<P extends Record<string, unknown>, R>(
  queryType: string,
  queryFn: (organizationId: string, params: P) => Promise<R>,
  customTTL?: number
): (organizationId: string, params: P) => Promise<R> {
  return async (organizationId: string, params: P): Promise<R> => {
    return cacheThrough(organizationId, queryType, params, () => queryFn(organizationId, params), customTTL);
  };
}

// Pre-configured cached query helpers
export const cachedQueries = {
  /**
   * Get person with caching
   */
  getPerson: createCachedQuery<{ personId: string }, unknown>(
    'person',
    async (organizationId, { personId }) => {
      // This would call the actual Neo4j query
      // Placeholder - actual implementation would use neo4jDriver
      return { id: personId, organizationId };
    }
  ),

  /**
   * Get process with caching
   */
  getProcess: createCachedQuery<{ processId: string }, unknown>(
    'process',
    async (organizationId, { processId }) => {
      return { id: processId, organizationId };
    }
  ),

  /**
   * Get organization network with caching
   */
  getNetwork: createCachedQuery<{ depth?: number }, unknown>(
    'network',
    async (organizationId, params) => {
      return { organizationId, ...params };
    }
  ),

  /**
   * Get bus factor analysis with caching
   */
  getBusFactor: createCachedQuery<Record<string, unknown>, unknown>(
    'bus-factor',
    async (organizationId) => {
      return { organizationId };
    }
  ),
};

export default {
  initGraphCache,
  getCached,
  setCached,
  invalidateCache,
  invalidateOrganizationCache,
  cacheThrough,
  getCacheStats,
  warmCache,
  createCachedQuery,
  cachedQueries,
};
