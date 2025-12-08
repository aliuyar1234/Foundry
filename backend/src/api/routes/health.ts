/**
 * Health Check Endpoints (T189)
 * Implements health, readiness, and liveness probes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { neo4jDriver } from '../../graph/connection.js';
import { Redis } from 'ioredis';

// Health check result types
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: ComponentCheck[];
}

interface ComponentCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  responseTime?: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface ReadinessStatus {
  ready: boolean;
  checks: ComponentCheck[];
}

interface LivenessStatus {
  alive: boolean;
  pid: number;
  memoryUsage: NodeJS.MemoryUsage;
}

// Application start time for uptime calculation
const startTime = Date.now();

// Version from package.json (would be injected at build time)
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

// Redis client reference
let redisClient: Redis | null = null;

export function setRedisClient(redis: Redis): void {
  redisClient = redis;
}

export default async function healthRoutes(fastify: FastifyInstance) {
  /**
   * GET /health - Comprehensive health check
   * Returns detailed status of all system components
   */
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
              checks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string', enum: ['pass', 'warn', 'fail'] },
                    responseTime: { type: 'number' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const checks = await runHealthChecks();

      // Determine overall status
      const hasFailures = checks.some((c) => c.status === 'fail');
      const hasWarnings = checks.some((c) => c.status === 'warn');

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (hasFailures) {
        status = 'unhealthy';
      } else if (hasWarnings) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      const healthStatus: HealthStatus = {
        status,
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks,
      };

      // Return 503 if unhealthy, 200 otherwise
      const statusCode = status === 'unhealthy' ? 503 : 200;
      return reply.status(statusCode).send(healthStatus);
    }
  );

  /**
   * GET /ready - Readiness probe
   * Checks if the application is ready to receive traffic
   */
  fastify.get(
    '/ready',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              checks: { type: 'array' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const checks = await runReadinessChecks();
      const ready = checks.every((c) => c.status === 'pass');

      const status: ReadinessStatus = {
        ready,
        checks,
      };

      return reply.status(ready ? 200 : 503).send(status);
    }
  );

  /**
   * GET /live - Liveness probe
   * Checks if the application process is alive
   */
  fastify.get(
    '/live',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              alive: { type: 'boolean' },
              pid: { type: 'number' },
              memoryUsage: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status: LivenessStatus = {
        alive: true,
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
      };

      return reply.send(status);
    }
  );

  /**
   * GET /health/db - Database health check
   */
  fastify.get('/health/db', async (_request: FastifyRequest, reply: FastifyReply) => {
    const postgresCheck = await checkPostgres();
    const neo4jCheck = await checkNeo4j();

    const checks = [postgresCheck, neo4jCheck];
    const allPass = checks.every((c) => c.status === 'pass');

    return reply.status(allPass ? 200 : 503).send({ checks });
  });

  /**
   * GET /health/cache - Cache health check
   */
  fastify.get('/health/cache', async (_request: FastifyRequest, reply: FastifyReply) => {
    const redisCheck = await checkRedis();

    return reply.status(redisCheck.status === 'pass' ? 200 : 503).send({
      checks: [redisCheck],
    });
  });
}

/**
 * Run all health checks
 */
async function runHealthChecks(): Promise<ComponentCheck[]> {
  const checks = await Promise.all([
    checkPostgres(),
    checkNeo4j(),
    checkRedis(),
    checkMemory(),
    checkEventLoop(),
  ]);

  return checks;
}

/**
 * Run readiness checks (subset of health checks)
 */
async function runReadinessChecks(): Promise<ComponentCheck[]> {
  const checks = await Promise.all([
    checkPostgres(),
    checkNeo4j(),
    checkRedis(),
  ]);

  return checks;
}

/**
 * Check PostgreSQL connectivity
 */
async function checkPostgres(): Promise<ComponentCheck> {
  const start = Date.now();

  try {
    // Simple query to verify connection
    await prisma.$queryRaw`SELECT 1`;

    return {
      name: 'postgresql',
      status: 'pass',
      responseTime: Date.now() - start,
      message: 'Connected',
    };
  } catch (error) {
    return {
      name: 'postgresql',
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check Neo4j connectivity
 */
async function checkNeo4j(): Promise<ComponentCheck> {
  const start = Date.now();

  try {
    const session = neo4jDriver.session();
    try {
      await session.run('RETURN 1');
      return {
        name: 'neo4j',
        status: 'pass',
        responseTime: Date.now() - start,
        message: 'Connected',
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    return {
      name: 'neo4j',
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<ComponentCheck> {
  const start = Date.now();

  if (!redisClient) {
    return {
      name: 'redis',
      status: 'warn',
      responseTime: Date.now() - start,
      message: 'Redis client not configured',
    };
  }

  try {
    await redisClient.ping();

    // Get some stats
    const info = await redisClient.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);

    return {
      name: 'redis',
      status: 'pass',
      responseTime: Date.now() - start,
      message: 'Connected',
      details: {
        memoryUsage: memoryMatch ? memoryMatch[1] : 'unknown',
      },
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check memory usage
 */
async function checkMemory(): Promise<ComponentCheck> {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapUsagePercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

  // Warn if heap usage is above 80%, fail if above 95%
  let status: 'pass' | 'warn' | 'fail' = 'pass';
  if (heapUsagePercent > 95) {
    status = 'fail';
  } else if (heapUsagePercent > 80) {
    status = 'warn';
  }

  return {
    name: 'memory',
    status,
    message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
    details: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      external: memoryUsage.external,
    },
  };
}

/**
 * Check event loop health
 */
async function checkEventLoop(): Promise<ComponentCheck> {
  return new Promise((resolve) => {
    const start = Date.now();

    // Use setImmediate to measure event loop lag
    setImmediate(() => {
      const lag = Date.now() - start;

      // Warn if lag is above 100ms, fail if above 500ms
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (lag > 500) {
        status = 'fail';
      } else if (lag > 100) {
        status = 'warn';
      }

      resolve({
        name: 'eventLoop',
        status,
        responseTime: lag,
        message: `Event loop lag: ${lag}ms`,
      });
    });
  });
}

/**
 * Health check result for external monitoring
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const checks = await runHealthChecks();

  const hasFailures = checks.some((c) => c.status === 'fail');
  const hasWarnings = checks.some((c) => c.status === 'warn');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (hasFailures) {
    status = 'unhealthy';
  } else if (hasWarnings) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };
}

// ==========================================
// T250 - Claude API Health Check
// ==========================================

// Claude API configuration
let claudeApiKey: string | null = null;
let claudeApiUrl = 'https://api.anthropic.com/v1';

export function setClaudeApiConfig(apiKey: string, apiUrl?: string): void {
  claudeApiKey = apiKey;
  if (apiUrl) claudeApiUrl = apiUrl;
}

/**
 * Check Claude API connectivity and status
 */
export async function checkClaudeAPI(): Promise<ComponentCheck> {
  const start = Date.now();

  if (!claudeApiKey) {
    return {
      name: 'claude_api',
      status: 'warn',
      responseTime: Date.now() - start,
      message: 'Claude API key not configured',
    };
  }

  try {
    // Use a lightweight API call to check connectivity
    // Note: Using messages endpoint with minimal tokens to verify API access
    const response = await fetch(`${claudeApiUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseTime = Date.now() - start;

    if (response.ok) {
      // Get rate limit info from headers if available
      const rateLimit = response.headers.get('x-ratelimit-limit-tokens');
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining-tokens');

      return {
        name: 'claude_api',
        status: 'pass',
        responseTime,
        message: 'Connected',
        details: {
          model: 'claude-3-haiku-20240307',
          rateLimit: rateLimit ? parseInt(rateLimit) : undefined,
          rateLimitRemaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : undefined,
        },
      };
    }

    // Handle specific error cases
    if (response.status === 401) {
      return {
        name: 'claude_api',
        status: 'fail',
        responseTime,
        message: 'Invalid API key',
      };
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      return {
        name: 'claude_api',
        status: 'warn',
        responseTime,
        message: 'Rate limited',
        details: {
          retryAfter: retryAfter ? parseInt(retryAfter) : undefined,
        },
      };
    }

    if (response.status >= 500) {
      return {
        name: 'claude_api',
        status: 'fail',
        responseTime,
        message: `API error: ${response.status}`,
      };
    }

    // For other errors, consider it a warning
    return {
      name: 'claude_api',
      status: 'warn',
      responseTime,
      message: `Unexpected status: ${response.status}`,
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Connection failed';

    // Check for timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return {
        name: 'claude_api',
        status: 'warn',
        responseTime,
        message: 'Request timeout - API may be slow',
      };
    }

    return {
      name: 'claude_api',
      status: 'fail',
      responseTime,
      message: errorMessage,
    };
  }
}

// ==========================================
// T251 - SSE Connections Health Check
// ==========================================

// SSE Manager reference
interface SSEStats {
  totalClients: number;
  clientsByOrg: Record<string, number>;
  channelSubscriptions: Record<string, number>;
}

type SSEStatsGetter = () => SSEStats;
let getSSEStats: SSEStatsGetter | null = null;

export function setSSEStatsGetter(getter: SSEStatsGetter): void {
  getSSEStats = getter;
}

/**
 * Check SSE connections health
 */
export async function checkSSEConnections(): Promise<ComponentCheck> {
  const start = Date.now();

  if (!getSSEStats) {
    return {
      name: 'sse_connections',
      status: 'warn',
      responseTime: Date.now() - start,
      message: 'SSE manager not configured',
    };
  }

  try {
    const stats = getSSEStats();
    const responseTime = Date.now() - start;

    // Define thresholds
    const MAX_CONNECTIONS_WARNING = 5000;
    const MAX_CONNECTIONS_CRITICAL = 9000;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = `Active connections: ${stats.totalClients}`;

    if (stats.totalClients >= MAX_CONNECTIONS_CRITICAL) {
      status = 'fail';
      message = `Connection limit critical: ${stats.totalClients}/${MAX_CONNECTIONS_CRITICAL}`;
    } else if (stats.totalClients >= MAX_CONNECTIONS_WARNING) {
      status = 'warn';
      message = `High connection count: ${stats.totalClients}`;
    }

    // Calculate channel distribution
    const totalSubscriptions = Object.values(stats.channelSubscriptions).reduce(
      (sum, count) => sum + count,
      0
    );

    const orgsConnected = Object.keys(stats.clientsByOrg).length;

    return {
      name: 'sse_connections',
      status,
      responseTime,
      message,
      details: {
        totalConnections: stats.totalClients,
        organizationsConnected: orgsConnected,
        totalChannelSubscriptions: totalSubscriptions,
        channelBreakdown: stats.channelSubscriptions,
        connectionsByOrg: stats.clientsByOrg,
      },
    };
  } catch (error) {
    return {
      name: 'sse_connections',
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Failed to get SSE stats',
    };
  }
}

/**
 * Check SSE connection memory usage
 */
export async function checkSSEMemory(): Promise<ComponentCheck> {
  const start = Date.now();

  if (!getSSEStats) {
    return {
      name: 'sse_memory',
      status: 'warn',
      responseTime: Date.now() - start,
      message: 'SSE manager not configured',
    };
  }

  try {
    const stats = getSSEStats();

    // Estimate memory per connection (rough estimate)
    const BYTES_PER_CONNECTION = 2048; // ~2KB per connection
    const estimatedMemoryMB = (stats.totalClients * BYTES_PER_CONNECTION) / (1024 * 1024);

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / (1024 * 1024);

    // SSE memory as percentage of heap
    const sseMemoryPercent = (estimatedMemoryMB / heapUsedMB) * 100;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (sseMemoryPercent > 30) {
      status = 'warn';
    } else if (sseMemoryPercent > 50) {
      status = 'fail';
    }

    return {
      name: 'sse_memory',
      status,
      responseTime: Date.now() - start,
      message: `SSE estimated memory: ${estimatedMemoryMB.toFixed(2)}MB`,
      details: {
        estimatedSSEMemoryMB: estimatedMemoryMB,
        heapUsedMB: heapUsedMB,
        sseMemoryPercent: sseMemoryPercent.toFixed(2),
        connectionsCount: stats.totalClients,
      },
    };
  } catch (error) {
    return {
      name: 'sse_memory',
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Failed to check SSE memory',
    };
  }
}

/**
 * Extended health checks including OPERATE tier components
 */
export async function runExtendedHealthChecks(): Promise<ComponentCheck[]> {
  const checks = await Promise.all([
    checkPostgres(),
    checkNeo4j(),
    checkRedis(),
    checkMemory(),
    checkEventLoop(),
    checkClaudeAPI(),
    checkSSEConnections(),
    checkSSEMemory(),
  ]);

  return checks;
}

/**
 * Get extended health status including OPERATE components
 */
export async function getExtendedHealthStatus(): Promise<HealthStatus> {
  const checks = await runExtendedHealthChecks();

  const hasFailures = checks.some((c) => c.status === 'fail');
  const hasWarnings = checks.some((c) => c.status === 'warn');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (hasFailures) {
    status = 'unhealthy';
  } else if (hasWarnings) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };
}
