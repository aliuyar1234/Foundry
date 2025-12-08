/**
 * Database Connection Pool Configuration
 * T354 - Database connection pooling configuration
 *
 * Provides optimized connection pooling settings for PostgreSQL, Neo4j, and Redis
 * to handle enterprise-scale workloads efficiently.
 */

import { PrismaClient } from '@prisma/client';

// ==========================================================================
// PostgreSQL Connection Pool Configuration
// ==========================================================================

export interface PostgresPoolConfig {
  // Maximum number of connections in the pool
  maxConnections: number;
  // Minimum number of idle connections
  minConnections: number;
  // Connection timeout in milliseconds
  connectionTimeout: number;
  // Idle timeout - close connections idle longer than this (ms)
  idleTimeout: number;
  // Maximum lifetime of a connection (ms)
  maxLifetime: number;
  // Statement timeout (ms)
  statementTimeout: number;
  // Enable connection logging
  enableLogging: boolean;
}

const DEFAULT_POSTGRES_CONFIG: PostgresPoolConfig = {
  maxConnections: 20,
  minConnections: 5,
  connectionTimeout: 10000, // 10 seconds
  idleTimeout: 600000, // 10 minutes
  maxLifetime: 1800000, // 30 minutes
  statementTimeout: 30000, // 30 seconds
  enableLogging: false,
};

/**
 * Get PostgreSQL connection string with pool parameters
 */
export function getPostgresConnectionString(
  baseUrl: string,
  config: Partial<PostgresPoolConfig> = {}
): string {
  const poolConfig = { ...DEFAULT_POSTGRES_CONFIG, ...config };

  // Parse base URL and add connection parameters
  const url = new URL(baseUrl);

  // Add pool-related query parameters
  url.searchParams.set('connection_limit', String(poolConfig.maxConnections));
  url.searchParams.set('pool_timeout', String(poolConfig.connectionTimeout / 1000));
  url.searchParams.set('connect_timeout', String(poolConfig.connectionTimeout / 1000));
  url.searchParams.set('statement_timeout', String(poolConfig.statementTimeout));

  return url.toString();
}

/**
 * Create Prisma client with optimized connection settings
 */
export function createOptimizedPrismaClient(
  config: Partial<PostgresPoolConfig> = {}
): PrismaClient {
  const poolConfig = { ...DEFAULT_POSTGRES_CONFIG, ...config };

  const prisma = new PrismaClient({
    log: poolConfig.enableLogging
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  return prisma;
}

/**
 * Get recommended pool sizes based on environment
 */
export function getRecommendedPoolSize(
  environment: 'development' | 'staging' | 'production',
  expectedConcurrency: number = 100
): PostgresPoolConfig {
  const baseConfig = { ...DEFAULT_POSTGRES_CONFIG };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        maxConnections: 5,
        minConnections: 1,
        enableLogging: true,
      };

    case 'staging':
      return {
        ...baseConfig,
        maxConnections: 10,
        minConnections: 2,
        enableLogging: false,
      };

    case 'production':
      // Calculate based on expected concurrency
      // Rule of thumb: connections = cores * 2 + spindle_count
      // For cloud: ~1 connection per 5-10 concurrent requests
      const maxConnections = Math.min(
        100,
        Math.max(10, Math.ceil(expectedConcurrency / 5))
      );

      return {
        ...baseConfig,
        maxConnections,
        minConnections: Math.ceil(maxConnections / 4),
        connectionTimeout: 5000, // Faster timeout in production
        statementTimeout: 60000, // Allow longer queries
        enableLogging: false,
      };

    default:
      return baseConfig;
  }
}

// ==========================================================================
// Neo4j Connection Pool Configuration
// ==========================================================================

export interface Neo4jPoolConfig {
  // Maximum number of connections in the pool
  maxConnectionPoolSize: number;
  // Connection acquisition timeout (ms)
  connectionAcquisitionTimeout: number;
  // Maximum connection lifetime (ms)
  maxConnectionLifetime: number;
  // Connection liveness check timeout (ms)
  connectionLivenessCheckTimeout: number;
  // Encryption mode
  encrypted: boolean;
  // Trust strategy for certificates
  trust: 'TRUST_ALL_CERTIFICATES' | 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES';
}

const DEFAULT_NEO4J_CONFIG: Neo4jPoolConfig = {
  maxConnectionPoolSize: 50,
  connectionAcquisitionTimeout: 60000, // 1 minute
  maxConnectionLifetime: 3600000, // 1 hour
  connectionLivenessCheckTimeout: 60000, // 1 minute
  encrypted: true,
  trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
};

/**
 * Get Neo4j driver configuration
 */
export function getNeo4jDriverConfig(
  config: Partial<Neo4jPoolConfig> = {}
): Neo4jPoolConfig {
  return { ...DEFAULT_NEO4J_CONFIG, ...config };
}

/**
 * Get recommended Neo4j pool size based on environment
 */
export function getRecommendedNeo4jPoolSize(
  environment: 'development' | 'staging' | 'production',
  expectedConcurrency: number = 100
): Neo4jPoolConfig {
  const baseConfig = { ...DEFAULT_NEO4J_CONFIG };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        maxConnectionPoolSize: 10,
        encrypted: false,
        trust: 'TRUST_ALL_CERTIFICATES',
      };

    case 'staging':
      return {
        ...baseConfig,
        maxConnectionPoolSize: 25,
      };

    case 'production':
      return {
        ...baseConfig,
        maxConnectionPoolSize: Math.min(100, Math.max(25, expectedConcurrency / 2)),
        connectionAcquisitionTimeout: 30000, // Faster timeout
      };

    default:
      return baseConfig;
  }
}

// ==========================================================================
// Redis Connection Pool Configuration
// ==========================================================================

export interface RedisPoolConfig {
  // Maximum number of connections
  maxRetriesPerRequest: number;
  // Enable offline queue
  enableOfflineQueue: boolean;
  // Connection timeout (ms)
  connectTimeout: number;
  // Command timeout (ms)
  commandTimeout: number;
  // Keep alive interval (ms)
  keepAlive: number;
  // Enable TLS
  tls: boolean;
  // Retry strategy
  retryStrategy: (times: number) => number | null;
}

const DEFAULT_REDIS_CONFIG: RedisPoolConfig = {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  keepAlive: 30000,
  tls: false,
  retryStrategy: (times: number) => {
    if (times > 10) return null; // Stop retrying after 10 attempts
    return Math.min(times * 100, 3000); // Exponential backoff, max 3s
  },
};

/**
 * Get Redis client configuration
 */
export function getRedisConfig(
  config: Partial<RedisPoolConfig> = {}
): RedisPoolConfig {
  return { ...DEFAULT_REDIS_CONFIG, ...config };
}

/**
 * Get recommended Redis configuration based on environment
 */
export function getRecommendedRedisConfig(
  environment: 'development' | 'staging' | 'production'
): RedisPoolConfig {
  const baseConfig = { ...DEFAULT_REDIS_CONFIG };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        maxRetriesPerRequest: 1,
        tls: false,
      };

    case 'staging':
      return {
        ...baseConfig,
        tls: true,
      };

    case 'production':
      return {
        ...baseConfig,
        maxRetriesPerRequest: 5,
        enableOfflineQueue: false, // Fail fast in production
        connectTimeout: 5000,
        commandTimeout: 3000,
        tls: true,
        retryStrategy: (times: number) => {
          if (times > 5) return null;
          return Math.min(times * 50, 2000);
        },
      };

    default:
      return baseConfig;
  }
}

// ==========================================================================
// Connection Health Monitoring
// ==========================================================================

export interface ConnectionHealthStatus {
  postgres: {
    connected: boolean;
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
    lastCheck: Date;
  };
  neo4j: {
    connected: boolean;
    serverInfo: string | null;
    lastCheck: Date;
  };
  redis: {
    connected: boolean;
    latencyMs: number | null;
    lastCheck: Date;
  };
}

/**
 * Create health checker for database connections
 */
export function createConnectionHealthChecker(
  prisma: PrismaClient,
  neo4jDriver?: any,
  redisClient?: any
) {
  return {
    /**
     * Check PostgreSQL connection health
     */
    async checkPostgres(): Promise<ConnectionHealthStatus['postgres']> {
      try {
        const result = await prisma.$queryRaw<any[]>`
          SELECT
            count(*) FILTER (WHERE state = 'active') as active,
            count(*) FILTER (WHERE state = 'idle') as idle,
            count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
          FROM pg_stat_activity
          WHERE datname = current_database()
        `;

        const stats = result[0];
        return {
          connected: true,
          activeConnections: Number(stats.active),
          idleConnections: Number(stats.idle),
          waitingRequests: Number(stats.waiting),
          lastCheck: new Date(),
        };
      } catch {
        return {
          connected: false,
          activeConnections: 0,
          idleConnections: 0,
          waitingRequests: 0,
          lastCheck: new Date(),
        };
      }
    },

    /**
     * Check Neo4j connection health
     */
    async checkNeo4j(): Promise<ConnectionHealthStatus['neo4j']> {
      if (!neo4jDriver) {
        return {
          connected: false,
          serverInfo: null,
          lastCheck: new Date(),
        };
      }

      try {
        const serverInfo = await neo4jDriver.getServerInfo();
        return {
          connected: true,
          serverInfo: serverInfo ? `${serverInfo.address}` : null,
          lastCheck: new Date(),
        };
      } catch {
        return {
          connected: false,
          serverInfo: null,
          lastCheck: new Date(),
        };
      }
    },

    /**
     * Check Redis connection health
     */
    async checkRedis(): Promise<ConnectionHealthStatus['redis']> {
      if (!redisClient) {
        return {
          connected: false,
          latencyMs: null,
          lastCheck: new Date(),
        };
      }

      try {
        const start = Date.now();
        await redisClient.ping();
        const latency = Date.now() - start;

        return {
          connected: true,
          latencyMs: latency,
          lastCheck: new Date(),
        };
      } catch {
        return {
          connected: false,
          latencyMs: null,
          lastCheck: new Date(),
        };
      }
    },

    /**
     * Check all connections
     */
    async checkAll(): Promise<ConnectionHealthStatus> {
      const [postgres, neo4j, redis] = await Promise.all([
        this.checkPostgres(),
        this.checkNeo4j(),
        this.checkRedis(),
      ]);

      return { postgres, neo4j, redis };
    },
  };
}

// ==========================================================================
// Connection Pool Metrics
// ==========================================================================

export interface PoolMetrics {
  timestamp: Date;
  postgres: {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingQueries: number;
  };
  neo4j: {
    inUseConnections: number;
    idleConnections: number;
  };
  redis: {
    commandsProcessed: number;
    connectedClients: number;
    usedMemory: string;
  };
}

/**
 * Collect connection pool metrics
 */
export async function collectPoolMetrics(
  prisma: PrismaClient,
  neo4jDriver?: any,
  redisClient?: any
): Promise<PoolMetrics> {
  const metrics: PoolMetrics = {
    timestamp: new Date(),
    postgres: {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingQueries: 0,
    },
    neo4j: {
      inUseConnections: 0,
      idleConnections: 0,
    },
    redis: {
      commandsProcessed: 0,
      connectedClients: 0,
      usedMemory: '0',
    },
  };

  // Collect PostgreSQL metrics
  try {
    const pgStats = await prisma.$queryRaw<any[]>`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    if (pgStats[0]) {
      metrics.postgres = {
        totalConnections: Number(pgStats[0].total),
        activeConnections: Number(pgStats[0].active),
        idleConnections: Number(pgStats[0].idle),
        waitingQueries: Number(pgStats[0].waiting),
      };
    }
  } catch {
    // Keep defaults on error
  }

  // Collect Redis metrics
  if (redisClient) {
    try {
      const info = await redisClient.info();
      const commandsMatch = info.match(/total_commands_processed:(\d+)/);
      const clientsMatch = info.match(/connected_clients:(\d+)/);
      const memoryMatch = info.match(/used_memory_human:(\S+)/);

      metrics.redis = {
        commandsProcessed: commandsMatch ? parseInt(commandsMatch[1], 10) : 0,
        connectedClients: clientsMatch ? parseInt(clientsMatch[1], 10) : 0,
        usedMemory: memoryMatch ? memoryMatch[1] : '0',
      };
    } catch {
      // Keep defaults on error
    }
  }

  return metrics;
}

export default {
  getPostgresConnectionString,
  createOptimizedPrismaClient,
  getRecommendedPoolSize,
  getNeo4jDriverConfig,
  getRecommendedNeo4jPoolSize,
  getRedisConfig,
  getRecommendedRedisConfig,
  createConnectionHealthChecker,
  collectPoolMetrics,
};
