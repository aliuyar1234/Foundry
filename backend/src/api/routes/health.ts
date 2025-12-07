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
