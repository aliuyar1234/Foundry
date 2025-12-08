/**
 * AI Context Cache Service
 * T243 - Redis caching for AI assistant context
 *
 * Provides fast caching for conversation context, retrieved documents,
 * and embeddings to improve AI assistant response times
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';

// Types
interface ContextCacheConfig {
  prefix: string;
  defaultTTL: number;
  maxContextSize: number; // Maximum cached context size in bytes
  enableCompression: boolean;
  compressionThreshold: number;
}

interface CachedContext {
  id: string;
  userId: string;
  sessionId: string;
  context: ConversationContext;
  retrievedDocs: RetrievedDocument[];
  timestamp: string;
  version: number;
}

interface ConversationContext {
  messages: ConversationMessage[];
  systemPrompt?: string;
  metadata: Record<string, unknown>;
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface RetrievedDocument {
  id: string;
  content: string;
  source: string;
  relevanceScore: number;
  metadata: Record<string, unknown>;
}

interface EmbeddingCache {
  text: string;
  embedding: number[];
  model: string;
  dimensions: number;
  timestamp: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: string;
  avgLatencyMs: number;
}

// Configuration
const DEFAULT_CONFIG: ContextCacheConfig = {
  prefix: 'ai-context',
  defaultTTL: 3600, // 1 hour
  maxContextSize: 1024 * 1024, // 1MB
  enableCompression: true,
  compressionThreshold: 4096, // 4KB
};

// TTL configurations
const CACHE_TTL: Record<string, number> = {
  // Session context - moderate TTL
  session: 3600, // 1 hour
  'session-messages': 1800, // 30 minutes

  // Retrieved documents - longer TTL as content doesn't change
  'retrieved-docs': 7200, // 2 hours
  'doc-embeddings': 86400, // 24 hours

  // Query embeddings - shorter TTL
  'query-embedding': 1800, // 30 minutes

  // Conversation history
  history: 7200, // 2 hours

  // System prompts and templates
  'system-prompt': 3600, // 1 hour
  template: 3600, // 1 hour

  // User preferences and settings
  preferences: 3600, // 1 hour

  // Semantic search results
  'search-results': 600, // 10 minutes

  // Default
  default: 1800, // 30 minutes
};

// State
let redis: Redis | null = null;
let config: ContextCacheConfig = DEFAULT_CONFIG;
let stats = { hits: 0, misses: 0, totalLatencyMs: 0, operations: 0 };

/**
 * Initialize the context cache
 */
export function initContextCache(
  redisClient: Redis,
  cacheConfig?: Partial<ContextCacheConfig>
): void {
  redis = redisClient;
  config = { ...DEFAULT_CONFIG, ...cacheConfig };
  stats = { hits: 0, misses: 0, totalLatencyMs: 0, operations: 0 };
}

/**
 * Generate cache key
 */
function generateKey(
  keyType: string,
  ...parts: (string | Record<string, unknown>)[]
): string {
  const keyParts = parts.map((part) => {
    if (typeof part === 'string') return part;
    return crypto
      .createHash('md5')
      .update(JSON.stringify(part, Object.keys(part).sort()))
      .digest('hex')
      .slice(0, 12);
  });

  return `${config.prefix}:${keyType}:${keyParts.join(':')}`;
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
    console.error('Context cache get error:', error);
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

    // Check size limit
    if (serialized.length > config.maxContextSize) {
      console.warn(`Context cache: data exceeds max size (${serialized.length} > ${config.maxContextSize})`);
      return;
    }

    const compressed = await compress(serialized);
    await redis.setex(key, ttl, compressed);
  } catch (error) {
    console.error('Context cache set error:', error);
  }
}

// ==========================================
// Session Context Functions
// ==========================================

/**
 * Cache session context
 */
export async function cacheSessionContext(
  userId: string,
  sessionId: string,
  context: CachedContext
): Promise<void> {
  const key = generateKey('session', userId, sessionId);
  await set(key, context, CACHE_TTL.session);
}

/**
 * Get cached session context
 */
export async function getSessionContext(
  userId: string,
  sessionId: string
): Promise<CachedContext | null> {
  const key = generateKey('session', userId, sessionId);
  return get(key);
}

/**
 * Update session messages
 */
export async function updateSessionMessages(
  userId: string,
  sessionId: string,
  messages: ConversationMessage[]
): Promise<void> {
  const key = generateKey('session-messages', userId, sessionId);
  await set(key, messages, CACHE_TTL['session-messages']);
}

/**
 * Get session messages
 */
export async function getSessionMessages(
  userId: string,
  sessionId: string
): Promise<ConversationMessage[] | null> {
  const key = generateKey('session-messages', userId, sessionId);
  return get(key);
}

/**
 * Append message to session
 */
export async function appendMessage(
  userId: string,
  sessionId: string,
  message: ConversationMessage
): Promise<void> {
  const messages = await getSessionMessages(userId, sessionId) || [];
  messages.push(message);

  // Trim if too long (keep last N messages)
  const maxMessages = 100;
  if (messages.length > maxMessages) {
    messages.splice(0, messages.length - maxMessages);
  }

  await updateSessionMessages(userId, sessionId, messages);
}

/**
 * Invalidate session cache
 */
export async function invalidateSession(
  userId: string,
  sessionId: string
): Promise<void> {
  if (!redis) return;

  const patterns = [
    generateKey('session', userId, sessionId),
    generateKey('session-messages', userId, sessionId),
  ];

  for (const pattern of patterns) {
    await redis.del(pattern);
  }
}

// ==========================================
// Retrieved Documents Functions
// ==========================================

/**
 * Cache retrieved documents for a query
 */
export async function cacheRetrievedDocs(
  query: string,
  docs: RetrievedDocument[],
  filters?: Record<string, unknown>
): Promise<void> {
  const key = generateKey('retrieved-docs', { query, filters });
  await set(key, docs, CACHE_TTL['retrieved-docs']);
}

/**
 * Get cached retrieved documents
 */
export async function getRetrievedDocs(
  query: string,
  filters?: Record<string, unknown>
): Promise<RetrievedDocument[] | null> {
  const key = generateKey('retrieved-docs', { query, filters });
  return get(key);
}

// ==========================================
// Embedding Cache Functions
// ==========================================

/**
 * Cache text embedding
 */
export async function cacheEmbedding(
  text: string,
  embedding: number[],
  model: string
): Promise<void> {
  const textHash = crypto.createHash('md5').update(text).digest('hex');
  const key = generateKey('doc-embeddings', model, textHash);

  const cached: EmbeddingCache = {
    text,
    embedding,
    model,
    dimensions: embedding.length,
    timestamp: new Date().toISOString(),
  };

  await set(key, cached, CACHE_TTL['doc-embeddings']);
}

/**
 * Get cached embedding
 */
export async function getEmbedding(
  text: string,
  model: string
): Promise<number[] | null> {
  const textHash = crypto.createHash('md5').update(text).digest('hex');
  const key = generateKey('doc-embeddings', model, textHash);

  const cached = await get<EmbeddingCache>(key);
  return cached?.embedding || null;
}

/**
 * Batch get embeddings
 */
export async function batchGetEmbeddings(
  texts: string[],
  model: string
): Promise<Map<string, number[] | null>> {
  const results = new Map<string, number[] | null>();

  if (!redis || texts.length === 0) {
    texts.forEach((text) => results.set(text, null));
    return results;
  }

  const keys = texts.map((text) => {
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    return generateKey('doc-embeddings', model, textHash);
  });

  try {
    const values = await redis.mget(...keys);

    for (let i = 0; i < texts.length; i++) {
      const value = values[i];
      if (value) {
        const decompressed = await decompress(value);
        const cached: EmbeddingCache = JSON.parse(decompressed);
        results.set(texts[i], cached.embedding);
      } else {
        results.set(texts[i], null);
      }
    }
  } catch (error) {
    console.error('Batch embedding get error:', error);
    texts.forEach((text) => results.set(text, null));
  }

  return results;
}

// ==========================================
// Search Results Cache
// ==========================================

/**
 * Cache semantic search results
 */
export async function cacheSearchResults(
  query: string,
  results: unknown[],
  options?: Record<string, unknown>
): Promise<void> {
  const key = generateKey('search-results', { query, options });
  await set(key, results, CACHE_TTL['search-results']);
}

/**
 * Get cached search results
 */
export async function getSearchResults(
  query: string,
  options?: Record<string, unknown>
): Promise<unknown[] | null> {
  const key = generateKey('search-results', { query, options });
  return get(key);
}

// ==========================================
// User Preferences
// ==========================================

/**
 * Cache user AI preferences
 */
export async function cacheUserPreferences(
  userId: string,
  preferences: Record<string, unknown>
): Promise<void> {
  const key = generateKey('preferences', userId);
  await set(key, preferences, CACHE_TTL.preferences);
}

/**
 * Get cached user preferences
 */
export async function getUserPreferences(
  userId: string
): Promise<Record<string, unknown> | null> {
  const key = generateKey('preferences', userId);
  return get(key);
}

// ==========================================
// System Prompts & Templates
// ==========================================

/**
 * Cache system prompt
 */
export async function cacheSystemPrompt(
  promptId: string,
  prompt: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const key = generateKey('system-prompt', promptId);
  await set(key, { prompt, metadata }, CACHE_TTL['system-prompt']);
}

/**
 * Get cached system prompt
 */
export async function getSystemPrompt(
  promptId: string
): Promise<{ prompt: string; metadata?: Record<string, unknown> } | null> {
  const key = generateKey('system-prompt', promptId);
  return get(key);
}

/**
 * Cache response template
 */
export async function cacheTemplate(
  templateId: string,
  template: string,
  variables?: string[]
): Promise<void> {
  const key = generateKey('template', templateId);
  await set(key, { template, variables }, CACHE_TTL.template);
}

/**
 * Get cached template
 */
export async function getTemplate(
  templateId: string
): Promise<{ template: string; variables?: string[] } | null> {
  const key = generateKey('template', templateId);
  return get(key);
}

// ==========================================
// Cache Management
// ==========================================

/**
 * Invalidate all cache for user
 */
export async function invalidateUserCache(userId: string): Promise<number> {
  if (!redis) return 0;

  try {
    const pattern = `${config.prefix}:*:${userId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (error) {
    console.error('User cache invalidate error:', error);
    return 0;
  }
}

/**
 * Clear all context cache
 */
export async function clearAll(): Promise<number> {
  if (!redis) return 0;

  try {
    const pattern = `${config.prefix}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (error) {
    console.error('Clear all cache error:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const hitRate = stats.hits + stats.misses > 0
    ? stats.hits / (stats.hits + stats.misses)
    : 0;

  const avgLatencyMs = stats.operations > 0
    ? stats.totalLatencyMs / stats.operations
    : 0;

  if (!redis) {
    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      totalKeys: 0,
      memoryUsage: 'N/A',
      avgLatencyMs,
    };
  }

  try {
    const pattern = `${config.prefix}:*`;
    const keys = await redis.keys(pattern);

    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';

    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      totalKeys: keys.length,
      memoryUsage,
      avgLatencyMs,
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      totalKeys: 0,
      memoryUsage: 'N/A',
      avgLatencyMs,
    };
  }
}

/**
 * Reset statistics
 */
export function resetStats(): void {
  stats = { hits: 0, misses: 0, totalLatencyMs: 0, operations: 0 };
}

/**
 * Cache-through helper
 */
export async function cacheThrough<T>(
  keyType: string,
  keyParts: (string | Record<string, unknown>)[],
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

// Export types
export type {
  ContextCacheConfig,
  CachedContext,
  ConversationContext,
  ConversationMessage,
  RetrievedDocument,
  EmbeddingCache,
  CacheStats,
};

export default {
  initContextCache,
  cacheSessionContext,
  getSessionContext,
  updateSessionMessages,
  getSessionMessages,
  appendMessage,
  invalidateSession,
  cacheRetrievedDocs,
  getRetrievedDocs,
  cacheEmbedding,
  getEmbedding,
  batchGetEmbeddings,
  cacheSearchResults,
  getSearchResults,
  cacheUserPreferences,
  getUserPreferences,
  cacheSystemPrompt,
  getSystemPrompt,
  cacheTemplate,
  getTemplate,
  invalidateUserCache,
  clearAll,
  getCacheStats,
  resetStats,
  cacheThrough,
};
