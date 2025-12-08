/**
 * Routing Cache Service
 * T242 - Redis caching for routing decisions
 *
 * Provides fast caching for routing decisions, rules, and related data
 * to reduce latency and database load
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';

// Types
interface RoutingCacheConfig {
  prefix: string;
  defaultTTL: number;
  enableCompression: boolean;
  compressionThreshold: number;
  maxCacheSize: number;
}

interface CachedRoutingDecision {
  decisionId: string;
  taskId: string;
  selectedRoute: string;
  confidence: number;
  factors: Record<string, number>;
  timestamp: string;
  ttl: number;
}

interface CachedRoutingRule {
  ruleId: string;
  name: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  version: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: string;
  keysByType: Record<string, number>;
}

// Configuration
const DEFAULT_CONFIG: RoutingCacheConfig = {
  prefix: 'routing',
  defaultTTL: 300, // 5 minutes
  enableCompression: true,
  compressionThreshold: 2048, // 2KB
  maxCacheSize: 10000,
};

// TTL configurations for different data types
const CACHE_TTL: Record<string, number> = {
  // Routing decisions - short TTL as they may change
  decision: 300, // 5 minutes
  'decision-batch': 180, // 3 minutes

  // Rules - longer TTL as they change infrequently
  rule: 1800, // 30 minutes
  'rule-set': 1800, // 30 minutes
  'rule-compiled': 3600, // 1 hour

  // Metrics and stats
  metrics: 60, // 1 minute
  'team-metrics': 120, // 2 minutes
  'person-metrics': 120, // 2 minutes

  // Route templates
  template: 3600, // 1 hour
  'template-list': 1800, // 30 minutes

  // Capacity and availability
  capacity: 60, // 1 minute
  availability: 30, // 30 seconds

  // History and audit
  history: 600, // 10 minutes

  // Default
  default: 300, // 5 minutes
};

// State
let redis: Redis | null = null;
let config: RoutingCacheConfig = DEFAULT_CONFIG;
let stats = { hits: 0, misses: 0 };

/**
 * Initialize the routing cache
 */
export function initRoutingCache(
  redisClient: Redis,
  cacheConfig?: Partial<RoutingCacheConfig>
): void {
  redis = redisClient;
  config = { ...DEFAULT_CONFIG, ...cacheConfig };
  stats = { hits: 0, misses: 0 };
}

/**
 * Generate cache key
 */
function generateKey(
  organizationId: string,
  dataType: string,
  identifier: string | Record<string, unknown>
): string {
  const idPart =
    typeof identifier === 'string'
      ? identifier
      : crypto
          .createHash('md5')
          .update(JSON.stringify(identifier, Object.keys(identifier).sort()))
          .digest('hex')
          .slice(0, 12);

  return `${config.prefix}:${organizationId}:${dataType}:${idPart}`;
}

/**
 * Compress data if needed
 */
async function maybeCompress(data: string): Promise<string> {
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
async function maybeDecompress(data: string): Promise<string> {
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
 * Get cached value
 */
export async function get<T>(
  organizationId: string,
  dataType: string,
  identifier: string | Record<string, unknown>
): Promise<T | null> {
  if (!redis) return null;

  const key = generateKey(organizationId, dataType, identifier);

  try {
    const cached = await redis.get(key);
    if (!cached) {
      stats.misses++;
      return null;
    }

    stats.hits++;
    const decompressed = await maybeDecompress(cached);
    return JSON.parse(decompressed);
  } catch (error) {
    console.error('Routing cache get error:', error);
    stats.misses++;
    return null;
  }
}

/**
 * Set cached value
 */
export async function set<T>(
  organizationId: string,
  dataType: string,
  identifier: string | Record<string, unknown>,
  data: T,
  customTTL?: number
): Promise<void> {
  if (!redis) return;

  const key = generateKey(organizationId, dataType, identifier);
  const ttl = customTTL ?? CACHE_TTL[dataType] ?? CACHE_TTL.default;

  try {
    const serialized = JSON.stringify(data);
    const compressed = await maybeCompress(serialized);
    await redis.setex(key, ttl, compressed);
  } catch (error) {
    console.error('Routing cache set error:', error);
  }
}

/**
 * Delete cached value
 */
export async function del(
  organizationId: string,
  dataType: string,
  identifier: string | Record<string, unknown>
): Promise<boolean> {
  if (!redis) return false;

  const key = generateKey(organizationId, dataType, identifier);

  try {
    const deleted = await redis.del(key);
    return deleted > 0;
  } catch (error) {
    console.error('Routing cache delete error:', error);
    return false;
  }
}

/**
 * Invalidate cache by pattern
 */
export async function invalidate(
  organizationId: string,
  dataType?: string
): Promise<number> {
  if (!redis) return 0;

  const pattern = dataType
    ? `${config.prefix}:${organizationId}:${dataType}:*`
    : `${config.prefix}:${organizationId}:*`;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (error) {
    console.error('Routing cache invalidate error:', error);
    return 0;
  }
}

// ==========================================
// Routing-specific cache functions
// ==========================================

/**
 * Cache a routing decision
 */
export async function cacheDecision(
  organizationId: string,
  decision: CachedRoutingDecision
): Promise<void> {
  await set(organizationId, 'decision', decision.taskId, decision);
}

/**
 * Get cached routing decision
 */
export async function getDecision(
  organizationId: string,
  taskId: string
): Promise<CachedRoutingDecision | null> {
  return get(organizationId, 'decision', taskId);
}

/**
 * Cache routing rules
 */
export async function cacheRules(
  organizationId: string,
  rules: CachedRoutingRule[]
): Promise<void> {
  await set(organizationId, 'rule-set', 'all', rules);

  // Also cache individual rules
  for (const rule of rules) {
    await set(organizationId, 'rule', rule.ruleId, rule);
  }
}

/**
 * Get cached routing rules
 */
export async function getRules(
  organizationId: string
): Promise<CachedRoutingRule[] | null> {
  return get(organizationId, 'rule-set', 'all');
}

/**
 * Get single cached rule
 */
export async function getRule(
  organizationId: string,
  ruleId: string
): Promise<CachedRoutingRule | null> {
  return get(organizationId, 'rule', ruleId);
}

/**
 * Invalidate rules cache (when rules are updated)
 */
export async function invalidateRules(organizationId: string): Promise<void> {
  await invalidate(organizationId, 'rule');
  await invalidate(organizationId, 'rule-set');
  await invalidate(organizationId, 'rule-compiled');
}

/**
 * Cache team capacity data
 */
export async function cacheTeamCapacity(
  organizationId: string,
  teamId: string,
  capacity: Record<string, unknown>
): Promise<void> {
  await set(organizationId, 'capacity', `team:${teamId}`, capacity, 60);
}

/**
 * Get cached team capacity
 */
export async function getTeamCapacity(
  organizationId: string,
  teamId: string
): Promise<Record<string, unknown> | null> {
  return get(organizationId, 'capacity', `team:${teamId}`);
}

/**
 * Cache person availability
 */
export async function cachePersonAvailability(
  organizationId: string,
  personId: string,
  availability: Record<string, unknown>
): Promise<void> {
  await set(organizationId, 'availability', `person:${personId}`, availability, 30);
}

/**
 * Get cached person availability
 */
export async function getPersonAvailability(
  organizationId: string,
  personId: string
): Promise<Record<string, unknown> | null> {
  return get(organizationId, 'availability', `person:${personId}`);
}

/**
 * Cache routing metrics
 */
export async function cacheMetrics(
  organizationId: string,
  metrics: Record<string, unknown>,
  scope = 'global'
): Promise<void> {
  await set(organizationId, 'metrics', scope, metrics, 60);
}

/**
 * Get cached routing metrics
 */
export async function getMetrics(
  organizationId: string,
  scope = 'global'
): Promise<Record<string, unknown> | null> {
  return get(organizationId, 'metrics', scope);
}

/**
 * Cache-through pattern for routing queries
 */
export async function cacheThrough<T>(
  organizationId: string,
  dataType: string,
  identifier: string | Record<string, unknown>,
  queryFn: () => Promise<T>,
  customTTL?: number
): Promise<T> {
  // Try cache first
  const cached = await get<T>(organizationId, dataType, identifier);
  if (cached !== null) {
    return cached;
  }

  // Execute query
  const result = await queryFn();

  // Cache result (non-blocking)
  set(organizationId, dataType, identifier, result, customTTL).catch(() => {
    // Silently ignore cache write failures
  });

  return result;
}

/**
 * Batch get multiple values
 */
export async function mget<T>(
  organizationId: string,
  dataType: string,
  identifiers: string[]
): Promise<Map<string, T | null>> {
  const results = new Map<string, T | null>();

  if (!redis || identifiers.length === 0) {
    identifiers.forEach((id) => results.set(id, null));
    return results;
  }

  const keys = identifiers.map((id) => generateKey(organizationId, dataType, id));

  try {
    const values = await redis.mget(...keys);

    for (let i = 0; i < identifiers.length; i++) {
      const value = values[i];
      if (value) {
        stats.hits++;
        const decompressed = await maybeDecompress(value);
        results.set(identifiers[i], JSON.parse(decompressed));
      } else {
        stats.misses++;
        results.set(identifiers[i], null);
      }
    }
  } catch (error) {
    console.error('Routing cache mget error:', error);
    identifiers.forEach((id) => results.set(id, null));
  }

  return results;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(organizationId?: string): Promise<CacheStats> {
  const hitRate = stats.hits + stats.misses > 0
    ? stats.hits / (stats.hits + stats.misses)
    : 0;

  if (!redis) {
    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      totalKeys: 0,
      memoryUsage: 'N/A',
      keysByType: {},
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

    // Get memory info
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';

    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      totalKeys: keys.length,
      memoryUsage,
      keysByType,
    };
  } catch (error) {
    console.error('Routing cache stats error:', error);
    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      totalKeys: 0,
      memoryUsage: 'N/A',
      keysByType: {},
    };
  }
}

/**
 * Reset statistics
 */
export function resetStats(): void {
  stats = { hits: 0, misses: 0 };
}

/**
 * Warm cache with routing data
 */
export async function warmCache(
  organizationId: string,
  warmFunctions: Record<string, () => Promise<unknown>>
): Promise<void> {
  const promises = Object.entries(warmFunctions).map(async ([dataType, fn]) => {
    try {
      const data = await fn();
      await set(organizationId, dataType, 'warmed', data);
    } catch (error) {
      console.error(`Cache warm failed for ${dataType}:`, error);
    }
  });

  await Promise.allSettled(promises);
}

// Export types
export type {
  RoutingCacheConfig,
  CachedRoutingDecision,
  CachedRoutingRule,
  CacheStats,
};

export default {
  initRoutingCache,
  get,
  set,
  del,
  invalidate,
  cacheDecision,
  getDecision,
  cacheRules,
  getRules,
  getRule,
  invalidateRules,
  cacheTeamCapacity,
  getTeamCapacity,
  cachePersonAvailability,
  getPersonAvailability,
  cacheMetrics,
  getMetrics,
  cacheThrough,
  mget,
  getCacheStats,
  resetStats,
  warmCache,
};
