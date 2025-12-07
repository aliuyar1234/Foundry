/**
 * API Response Caching Middleware (T187)
 * Implements HTTP caching for API responses
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import crypto from 'crypto';

// Cache configuration
interface CacheOptions {
  // TTL in seconds
  ttl: number;
  // Vary headers - used in cache key generation
  varyHeaders?: string[];
  // Cache key prefix
  prefix?: string;
  // Skip caching based on request
  skip?: (request: FastifyRequest) => boolean;
  // Stale-while-revalidate time in seconds
  staleWhileRevalidate?: number;
  // Tags for cache invalidation
  tags?: string[] | ((request: FastifyRequest) => string[]);
}

// Default cache configurations for different endpoint types
const CACHE_PROFILES = {
  // Static or rarely changing data
  static: {
    ttl: 3600, // 1 hour
    staleWhileRevalidate: 86400, // 24 hours
  },
  // Organization structure data
  organization: {
    ttl: 300, // 5 minutes
    staleWhileRevalidate: 600, // 10 minutes
  },
  // Discovery/process data
  discovery: {
    ttl: 180, // 3 minutes
    staleWhileRevalidate: 300, // 5 minutes
  },
  // List endpoints
  list: {
    ttl: 60, // 1 minute
    staleWhileRevalidate: 120, // 2 minutes
  },
  // Real-time data
  realtime: {
    ttl: 10, // 10 seconds
    staleWhileRevalidate: 30, // 30 seconds
  },
  // No cache
  none: {
    ttl: 0,
    staleWhileRevalidate: 0,
  },
};

let redis: Redis | null = null;
const DEFAULT_PREFIX = 'api-cache';

/**
 * Initialize Redis for API caching
 */
export function initApiCache(redisClient: Redis): void {
  redis = redisClient;
}

/**
 * Generate cache key from request
 */
function generateCacheKey(
  request: FastifyRequest,
  options: CacheOptions
): string {
  const prefix = options.prefix || DEFAULT_PREFIX;
  const method = request.method;
  const url = request.url;

  // Include organization ID in key
  const orgId = (request as any).organizationId || 'public';

  // Include specified vary headers
  const varyParts: string[] = [];
  if (options.varyHeaders) {
    for (const header of options.varyHeaders) {
      const value = request.headers[header.toLowerCase()];
      if (value) {
        varyParts.push(`${header}=${Array.isArray(value) ? value.join(',') : value}`);
      }
    }
  }

  // Create hash of vary parts for cleaner keys
  const varyHash = varyParts.length > 0
    ? crypto.createHash('md5').update(varyParts.join('|')).digest('hex').slice(0, 8)
    : '';

  const key = varyHash
    ? `${prefix}:${orgId}:${method}:${url}:${varyHash}`
    : `${prefix}:${orgId}:${method}:${url}`;

  return key;
}

/**
 * Create cache middleware for API responses
 */
export function apiCache(options: CacheOptions) {
  return async function cacheMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Skip caching for non-GET requests
    if (request.method !== 'GET') {
      return;
    }

    // Skip if custom skip function returns true
    if (options.skip && options.skip(request)) {
      return;
    }

    // Skip if TTL is 0
    if (options.ttl <= 0) {
      reply.header('Cache-Control', 'no-store');
      return;
    }

    const cacheKey = generateCacheKey(request, options);

    try {
      // Try to get from cache
      const cached = await getCachedResponse(cacheKey);

      if (cached) {
        // Check if cached response is still fresh
        const age = Math.floor((Date.now() - cached.timestamp) / 1000);
        const isFresh = age < options.ttl;
        const isStale = age < (options.ttl + (options.staleWhileRevalidate || 0));

        if (isFresh || isStale) {
          // Set cache headers
          reply.header('X-Cache', isFresh ? 'HIT' : 'STALE');
          reply.header('Age', age);
          reply.header('Cache-Control', buildCacheControl(options));

          if (!isFresh && isStale) {
            // Trigger background revalidation
            revalidateInBackground(request, cacheKey, options).catch(() => {
              // Silently ignore revalidation errors
            });
          }

          // Return cached response
          reply.header('Content-Type', cached.contentType);
          reply.status(cached.statusCode);
          return reply.send(cached.body);
        }
      }

      // Store original send function
      const originalSend = reply.send.bind(reply);

      // Override send to cache response
      reply.send = function (payload: any) {
        // Only cache successful responses
        const statusCode = reply.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          const contentType = reply.getHeader('Content-Type') as string || 'application/json';

          // Cache the response (non-blocking)
          setCachedResponse(cacheKey, {
            body: payload,
            statusCode,
            contentType,
            timestamp: Date.now(),
            tags: typeof options.tags === 'function' ? options.tags(request) : options.tags,
          }, options.ttl + (options.staleWhileRevalidate || 0)).catch(() => {
            // Silently ignore cache write errors
          });
        }

        // Set cache headers
        reply.header('X-Cache', 'MISS');
        reply.header('Cache-Control', buildCacheControl(options));

        return originalSend(payload);
      };
    } catch (error) {
      // If cache fails, continue without caching
      request.log.error({ error }, 'API cache error');
      reply.header('X-Cache', 'ERROR');
    }
  };
}

/**
 * Build Cache-Control header value
 */
function buildCacheControl(options: CacheOptions): string {
  const directives: string[] = [];

  if (options.ttl > 0) {
    directives.push(`max-age=${options.ttl}`);

    if (options.staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }
  } else {
    directives.push('no-store');
  }

  return directives.join(', ');
}

interface CachedResponse {
  body: any;
  statusCode: number;
  contentType: string;
  timestamp: number;
  tags?: string[];
}

/**
 * Get cached response from Redis
 */
async function getCachedResponse(key: string): Promise<CachedResponse | null> {
  if (!redis) return null;

  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * Set cached response in Redis
 */
async function setCachedResponse(
  key: string,
  response: CachedResponse,
  ttl: number
): Promise<void> {
  if (!redis) return;

  try {
    await redis.setex(key, ttl, JSON.stringify(response));

    // Store tags for invalidation
    if (response.tags && response.tags.length > 0) {
      const tagPipeline = redis.pipeline();
      for (const tag of response.tags) {
        tagPipeline.sadd(`cache-tag:${tag}`, key);
        tagPipeline.expire(`cache-tag:${tag}`, ttl);
      }
      await tagPipeline.exec();
    }
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Revalidate cache in background
 */
async function revalidateInBackground(
  request: FastifyRequest,
  _cacheKey: string,
  _options: CacheOptions
): Promise<void> {
  // Note: This is a simplified version
  // In production, you might want to use a proper job queue
  // to avoid duplicate revalidation requests

  request.log.debug({ url: request.url }, 'Background revalidation triggered');

  // The actual revalidation would happen on the next request
  // This is just a placeholder for more sophisticated implementations
}

/**
 * Invalidate cache by tag
 */
export async function invalidateCacheByTag(tag: string): Promise<number> {
  if (!redis) return 0;

  try {
    const keys = await redis.smembers(`cache-tag:${tag}`);
    if (keys.length === 0) return 0;

    // Delete all cached responses with this tag
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    pipeline.del(`cache-tag:${tag}`);

    await pipeline.exec();
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Invalidate cache by organization
 */
export async function invalidateCacheByOrganization(organizationId: string): Promise<number> {
  if (!redis) return 0;

  try {
    const pattern = `${DEFAULT_PREFIX}:${organizationId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) return 0;

    await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Invalidate cache by URL pattern
 */
export async function invalidateCacheByPattern(pattern: string): Promise<number> {
  if (!redis) return 0;

  try {
    const keys = await redis.keys(`${DEFAULT_PREFIX}:*${pattern}*`);

    if (keys.length === 0) return 0;

    await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Clear all API cache
 */
export async function clearApiCache(): Promise<number> {
  if (!redis) return 0;

  try {
    const keys = await redis.keys(`${DEFAULT_PREFIX}:*`);
    const tagKeys = await redis.keys('cache-tag:*');
    const allKeys = [...keys, ...tagKeys];

    if (allKeys.length === 0) return 0;

    await redis.del(...allKeys);
    return allKeys.length;
  } catch {
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalKeys: number;
  memoryUsage: string;
  hitRate: string;
}> {
  if (!redis) {
    return {
      totalKeys: 0,
      memoryUsage: 'N/A',
      hitRate: 'N/A',
    };
  }

  try {
    const keys = await redis.keys(`${DEFAULT_PREFIX}:*`);

    // Get memory info
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';

    // Get stats info
    const statsInfo = await redis.info('stats');
    const hitsMatch = statsInfo.match(/keyspace_hits:(\d+)/);
    const missesMatch = statsInfo.match(/keyspace_misses:(\d+)/);

    let hitRate = 'N/A';
    if (hitsMatch && missesMatch) {
      const hits = parseInt(hitsMatch[1], 10);
      const misses = parseInt(missesMatch[1], 10);
      const total = hits + misses;
      if (total > 0) {
        hitRate = `${((hits / total) * 100).toFixed(2)}%`;
      }
    }

    return {
      totalKeys: keys.length,
      memoryUsage,
      hitRate,
    };
  } catch {
    return {
      totalKeys: 0,
      memoryUsage: 'N/A',
      hitRate: 'N/A',
    };
  }
}

/**
 * Pre-configured cache middleware factories
 */
export const cacheMiddleware = {
  /**
   * Static content caching (1 hour)
   */
  static: (options?: Partial<CacheOptions>) =>
    apiCache({ ...CACHE_PROFILES.static, ...options }),

  /**
   * Organization data caching (5 minutes)
   */
  organization: (options?: Partial<CacheOptions>) =>
    apiCache({ ...CACHE_PROFILES.organization, ...options }),

  /**
   * Discovery data caching (3 minutes)
   */
  discovery: (options?: Partial<CacheOptions>) =>
    apiCache({ ...CACHE_PROFILES.discovery, ...options }),

  /**
   * List endpoint caching (1 minute)
   */
  list: (options?: Partial<CacheOptions>) =>
    apiCache({ ...CACHE_PROFILES.list, ...options }),

  /**
   * Real-time data caching (10 seconds)
   */
  realtime: (options?: Partial<CacheOptions>) =>
    apiCache({ ...CACHE_PROFILES.realtime, ...options }),

  /**
   * No caching
   */
  none: () => apiCache(CACHE_PROFILES.none),

  /**
   * Custom caching
   */
  custom: (options: CacheOptions) => apiCache(options),
};

export default apiCache;
