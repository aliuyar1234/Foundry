/**
 * Admin Routes (T190)
 * Job queue admin dashboard and system administration endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue, QueueEvents } from 'bullmq';
import { requirePermission } from '../middleware/permissions.js';
import { getCacheStats, clearApiCache } from '../middleware/cache.js';
import { getCacheStats as getGraphCacheStats, invalidateOrganizationCache } from '../../lib/cache/graphCache.js';
import { getRetentionPolicySummary } from '../../jobs/processors/retentionProcessor.js';
import { getAggregateStatus } from '../../jobs/processors/aggregateRefresh.js';
import { logger } from '../../lib/logger.js';

// Queue registry
const queues: Map<string, Queue> = new Map();

/**
 * Register a queue for admin monitoring
 */
export function registerQueue(name: string, queue: Queue): void {
  queues.set(name, queue);
}

export default async function adminRoutes(fastify: FastifyInstance) {
  /**
   * GET /admin/queues - List all job queues and their status
   */
  fastify.get(
    '/admin/queues',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const queueStatuses = await Promise.all(
        Array.from(queues.entries()).map(async ([name, queue]) => {
          try {
            const [waiting, active, completed, failed, delayed] = await Promise.all([
              queue.getWaitingCount(),
              queue.getActiveCount(),
              queue.getCompletedCount(),
              queue.getFailedCount(),
              queue.getDelayedCount(),
            ]);

            return {
              name,
              status: 'active',
              counts: {
                waiting,
                active,
                completed,
                failed,
                delayed,
              },
            };
          } catch (error) {
            logger.error({ error, queueName: name }, 'Failed to get queue status');
            return {
              name,
              status: 'error',
              error: 'Failed to retrieve queue status',
            };
          }
        })
      );

      return reply.send({
        queues: queueStatuses,
        totalQueues: queues.size,
      });
    }
  );

  /**
   * GET /admin/queues/:name - Get detailed queue information
   */
  fastify.get(
    '/admin/queues/:name',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const queue = queues.get(name);

      if (!queue) {
        return reply.status(404).send({
          error: 'Queue not found',
          availableQueues: Array.from(queues.keys()),
        });
      }

      try {
        const [
          waitingJobs,
          activeJobs,
          failedJobs,
          delayedJobs,
          isPaused,
        ] = await Promise.all([
          queue.getJobs(['waiting'], 0, 10),
          queue.getJobs(['active'], 0, 10),
          queue.getJobs(['failed'], 0, 10),
          queue.getJobs(['delayed'], 0, 10),
          queue.isPaused(),
        ]);

        const formatJob = (job: any) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          progress: job.progress,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
        });

        return reply.send({
          name,
          isPaused,
          jobs: {
            waiting: waitingJobs.map(formatJob),
            active: activeJobs.map(formatJob),
            failed: failedJobs.map(formatJob),
            delayed: delayedJobs.map(formatJob),
          },
        });
      } catch (error) {
        logger.error({ error, queueName: name }, 'Failed to get queue details');
        return reply.status(500).send({
          error: 'Failed to get queue details',
        });
      }
    }
  );

  /**
   * POST /admin/queues/:name/pause - Pause a queue
   */
  fastify.post(
    '/admin/queues/:name/pause',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const queue = queues.get(name);

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      await queue.pause();
      return reply.send({ success: true, message: `Queue ${name} paused` });
    }
  );

  /**
   * POST /admin/queues/:name/resume - Resume a queue
   */
  fastify.post(
    '/admin/queues/:name/resume',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const queue = queues.get(name);

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      await queue.resume();
      return reply.send({ success: true, message: `Queue ${name} resumed` });
    }
  );

  /**
   * POST /admin/queues/:name/retry/:jobId - Retry a failed job
   */
  fastify.post(
    '/admin/queues/:name/retry/:jobId',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, jobId } = request.params as { name: string; jobId: string };
      const queue = queues.get(name);

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      await job.retry();
      return reply.send({ success: true, message: `Job ${jobId} retried` });
    }
  );

  /**
   * DELETE /admin/queues/:name/jobs/:jobId - Remove a job
   */
  fastify.delete(
    '/admin/queues/:name/jobs/:jobId',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, jobId } = request.params as { name: string; jobId: string };
      const queue = queues.get(name);

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      await job.remove();
      return reply.send({ success: true, message: `Job ${jobId} removed` });
    }
  );

  /**
   * POST /admin/queues/:name/clean - Clean completed/failed jobs
   */
  fastify.post(
    '/admin/queues/:name/clean',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const { grace = 3600000, status = 'completed' } = request.body as {
        grace?: number;
        status?: 'completed' | 'failed';
      };

      const queue = queues.get(name);

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      const cleaned = await queue.clean(grace, 1000, status);
      return reply.send({
        success: true,
        cleaned: cleaned.length,
        message: `Cleaned ${cleaned.length} ${status} jobs from ${name}`,
      });
    }
  );

  /**
   * GET /admin/cache - Get cache statistics
   */
  fastify.get(
    '/admin/cache',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const [apiStats, graphStats] = await Promise.all([
        getCacheStats(),
        getGraphCacheStats(),
      ]);

      return reply.send({
        api: apiStats,
        graph: graphStats,
      });
    }
  );

  /**
   * POST /admin/cache/clear - Clear all caches
   */
  fastify.post(
    '/admin/cache/clear',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { type = 'all' } = request.body as { type?: 'api' | 'graph' | 'all' };

      const results: Record<string, number> = {};

      if (type === 'api' || type === 'all') {
        results.api = await clearApiCache();
      }

      if (type === 'graph' || type === 'all') {
        // Graph cache requires organization ID
        results.graph = 0; // Would need to iterate all orgs
      }

      return reply.send({
        success: true,
        cleared: results,
      });
    }
  );

  /**
   * POST /admin/cache/invalidate/:organizationId - Invalidate cache for organization
   */
  fastify.post(
    '/admin/cache/invalidate/:organizationId',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = request.params as { organizationId: string };

      const cleared = await invalidateOrganizationCache(organizationId);

      return reply.send({
        success: true,
        organizationId,
        keysCleared: cleared,
      });
    }
  );

  /**
   * GET /admin/retention - Get retention policy information
   */
  fastify.get(
    '/admin/retention',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const summary = getRetentionPolicySummary();
      return reply.send(summary);
    }
  );

  /**
   * GET /admin/aggregates - Get TimescaleDB aggregate status
   */
  fastify.get(
    '/admin/aggregates',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status = await getAggregateStatus();
      return reply.send(status);
    }
  );

  /**
   * GET /admin/system - Get system information
   */
  fastify.get(
    '/admin/system',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      return reply.send({
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        process: {
          pid: process.pid,
          uptime: Math.floor(process.uptime()),
          memory: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        },
        env: process.env.NODE_ENV || 'development',
      });
    }
  );

  /**
   * POST /admin/gc - Trigger garbage collection (if exposed)
   */
  fastify.post(
    '/admin/gc',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (global.gc) {
        const before = process.memoryUsage().heapUsed;
        global.gc();
        const after = process.memoryUsage().heapUsed;

        return reply.send({
          success: true,
          freed: Math.round((before - after) / 1024 / 1024),
          unit: 'MB',
        });
      }

      return reply.status(400).send({
        success: false,
        message: 'Garbage collection not exposed. Run node with --expose-gc flag.',
      });
    }
  );

  /**
   * GET /admin/logs - Get recent application logs
   */
  fastify.get(
    '/admin/logs',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { level = 'info', limit = 100 } = request.query as {
        level?: string;
        limit?: number;
      };

      // Note: This is a placeholder - actual implementation would
      // depend on log storage (file, database, external service)
      return reply.send({
        message: 'Log retrieval depends on logging configuration',
        requestedLevel: level,
        requestedLimit: limit,
        suggestion: 'Configure log aggregation service for production',
      });
    }
  );

  /**
   * GET /admin/metrics - Get application metrics
   */
  fastify.get(
    '/admin/metrics',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Queue metrics
      const queueMetrics = await Promise.all(
        Array.from(queues.entries()).map(async ([name, queue]) => {
          const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
          ]);
          return { name, waiting, active, completed, failed };
        })
      );

      // Cache metrics
      const cacheMetrics = await getCacheStats();

      // Memory metrics
      const memory = process.memoryUsage();

      return reply.send({
        timestamp: new Date().toISOString(),
        queues: queueMetrics,
        cache: cacheMetrics,
        memory: {
          heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
          rssMB: Math.round(memory.rss / 1024 / 1024),
        },
        uptime: Math.floor(process.uptime()),
      });
    }
  );
}
