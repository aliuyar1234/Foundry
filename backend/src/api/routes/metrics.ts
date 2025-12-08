/**
 * Prometheus Metrics Export Endpoint
 * T363 - Add Prometheus metrics export endpoint
 *
 * Exposes application metrics in Prometheus format for monitoring.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
const register = new Registry();

// Add default Node.js metrics
collectDefaultMetrics({ register, prefix: 'foundry_' });

// ==========================================================================
// HTTP Request Metrics
// ==========================================================================

export const httpRequestsTotal = new Counter({
  name: 'foundry_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code', 'entity_id'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'foundry_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestSize = new Summary({
  name: 'foundry_http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'path'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register],
});

export const httpResponseSize = new Summary({
  name: 'foundry_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'path'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register],
});

// ==========================================================================
// Entity Metrics
// ==========================================================================

export const entitiesTotal = new Gauge({
  name: 'foundry_entities_total',
  help: 'Total number of entities',
  labelNames: ['status'],
  registers: [register],
});

export const entityUsersTotal = new Gauge({
  name: 'foundry_entity_users_total',
  help: 'Total number of users per entity',
  labelNames: ['entity_id'],
  registers: [register],
});

export const entityProcessesTotal = new Gauge({
  name: 'foundry_entity_processes_total',
  help: 'Total number of processes per entity',
  labelNames: ['entity_id', 'status'],
  registers: [register],
});

export const entityDataSourcesTotal = new Gauge({
  name: 'foundry_entity_data_sources_total',
  help: 'Total number of data sources per entity',
  labelNames: ['entity_id', 'type', 'status'],
  registers: [register],
});

// ==========================================================================
// Authentication Metrics
// ==========================================================================

export const authAttemptsTotal = new Counter({
  name: 'foundry_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['method', 'status', 'entity_id'],
  registers: [register],
});

export const authDuration = new Histogram({
  name: 'foundry_auth_duration_seconds',
  help: 'Authentication duration in seconds',
  labelNames: ['method'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const activeSessionsTotal = new Gauge({
  name: 'foundry_active_sessions_total',
  help: 'Total number of active sessions',
  labelNames: ['entity_id'],
  registers: [register],
});

// ==========================================================================
// Partner API Metrics
// ==========================================================================

export const partnerApiRequestsTotal = new Counter({
  name: 'foundry_partner_api_requests_total',
  help: 'Total number of partner API requests',
  labelNames: ['partner_id', 'endpoint', 'status_code', 'tier'],
  registers: [register],
});

export const partnerApiLatency = new Histogram({
  name: 'foundry_partner_api_latency_seconds',
  help: 'Partner API request latency in seconds',
  labelNames: ['partner_id', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

export const partnerApiRateLimitHits = new Counter({
  name: 'foundry_partner_api_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['partner_id', 'tier'],
  registers: [register],
});

// ==========================================================================
// Webhook Metrics
// ==========================================================================

export const webhookEventsTotal = new Counter({
  name: 'foundry_webhook_events_total',
  help: 'Total number of webhook events',
  labelNames: ['event_type', 'entity_id'],
  registers: [register],
});

export const webhookDeliveriesTotal = new Counter({
  name: 'foundry_webhook_deliveries_total',
  help: 'Total number of webhook delivery attempts',
  labelNames: ['subscription_id', 'status'],
  registers: [register],
});

export const webhookDeliveryLatency = new Histogram({
  name: 'foundry_webhook_delivery_latency_seconds',
  help: 'Webhook delivery latency in seconds',
  labelNames: ['subscription_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const webhookQueueSize = new Gauge({
  name: 'foundry_webhook_queue_size',
  help: 'Current webhook queue size',
  registers: [register],
});

// ==========================================================================
// Database Metrics
// ==========================================================================

export const dbQueryDuration = new Histogram({
  name: 'foundry_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const dbConnectionPoolSize = new Gauge({
  name: 'foundry_db_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['state'],
  registers: [register],
});

export const dbQueryErrors = new Counter({
  name: 'foundry_db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'error_type'],
  registers: [register],
});

// ==========================================================================
// Cache Metrics
// ==========================================================================

export const cacheOperationsTotal = new Counter({
  name: 'foundry_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result'],
  registers: [register],
});

export const cacheHitRate = new Gauge({
  name: 'foundry_cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheLatency = new Histogram({
  name: 'foundry_cache_latency_seconds',
  help: 'Cache operation latency in seconds',
  labelNames: ['operation', 'cache_type'],
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
  registers: [register],
});

// ==========================================================================
// Job Queue Metrics
// ==========================================================================

export const jobsTotal = new Counter({
  name: 'foundry_jobs_total',
  help: 'Total number of jobs processed',
  labelNames: ['queue', 'status'],
  registers: [register],
});

export const jobDuration = new Histogram({
  name: 'foundry_job_duration_seconds',
  help: 'Job processing duration in seconds',
  labelNames: ['queue', 'job_type'],
  buckets: [0.1, 1, 5, 10, 30, 60, 300],
  registers: [register],
});

export const jobQueueSize = new Gauge({
  name: 'foundry_job_queue_size',
  help: 'Current job queue size',
  labelNames: ['queue', 'state'],
  registers: [register],
});

// ==========================================================================
// Business Metrics
// ==========================================================================

export const processesDiscovered = new Counter({
  name: 'foundry_processes_discovered_total',
  help: 'Total number of processes discovered',
  labelNames: ['entity_id', 'source_type'],
  registers: [register],
});

export const insightsGenerated = new Counter({
  name: 'foundry_insights_generated_total',
  help: 'Total number of insights generated',
  labelNames: ['entity_id', 'insight_type'],
  registers: [register],
});

export const dataSourceSyncs = new Counter({
  name: 'foundry_data_source_syncs_total',
  help: 'Total number of data source sync operations',
  labelNames: ['entity_id', 'source_type', 'status'],
  registers: [register],
});

// ==========================================================================
// Route Handler
// ==========================================================================

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /metrics
   * Returns Prometheus-formatted metrics
   */
  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'Prometheus metrics endpoint',
        tags: ['Monitoring'],
        response: {
          200: {
            description: 'Prometheus metrics',
            type: 'string',
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await register.metrics();
        reply
          .header('Content-Type', register.contentType)
          .send(metrics);
      } catch (error) {
        request.log.error({ error }, 'Failed to collect metrics');
        reply.status(500).send({ error: 'Failed to collect metrics' });
      }
    }
  );

  /**
   * GET /metrics/json
   * Returns metrics in JSON format (for debugging)
   */
  fastify.get(
    '/metrics/json',
    {
      schema: {
        description: 'Metrics in JSON format',
        tags: ['Monitoring'],
        response: {
          200: {
            description: 'Metrics as JSON',
            type: 'object',
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await register.getMetricsAsJSON();
        reply.send(metrics);
      } catch (error) {
        request.log.error({ error }, 'Failed to collect metrics');
        reply.status(500).send({ error: 'Failed to collect metrics' });
      }
    }
  );

  /**
   * GET /metrics/health
   * Returns metrics system health
   */
  fastify.get(
    '/metrics/health',
    {
      schema: {
        description: 'Metrics system health',
        tags: ['Monitoring'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const metricsCount = (await register.getMetricsAsJSON()).length;

      reply.send({
        status: 'healthy',
        metricsCount,
        registry: 'prom-client',
        timestamp: new Date().toISOString(),
      });
    }
  );
}

// ==========================================================================
// Metric Recording Helpers
// ==========================================================================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  requestSize?: number,
  responseSize?: number,
  entityId?: string
): void {
  httpRequestsTotal.inc({
    method,
    path: normalizePath(path),
    status_code: String(statusCode),
    entity_id: entityId || 'unknown',
  });

  httpRequestDuration.observe(
    { method, path: normalizePath(path), status_code: String(statusCode) },
    durationMs / 1000
  );

  if (requestSize) {
    httpRequestSize.observe({ method, path: normalizePath(path) }, requestSize);
  }

  if (responseSize) {
    httpResponseSize.observe({ method, path: normalizePath(path) }, responseSize);
  }
}

/**
 * Record authentication metrics
 */
export function recordAuthAttempt(
  method: 'saml' | 'oidc' | 'local',
  status: 'success' | 'failure',
  durationMs: number,
  entityId?: string
): void {
  authAttemptsTotal.inc({
    method,
    status,
    entity_id: entityId || 'unknown',
  });

  authDuration.observe({ method }, durationMs / 1000);
}

/**
 * Record partner API request metrics
 */
export function recordPartnerApiRequest(
  partnerId: string,
  endpoint: string,
  statusCode: number,
  durationMs: number,
  tier: string
): void {
  partnerApiRequestsTotal.inc({
    partner_id: partnerId,
    endpoint: normalizePath(endpoint),
    status_code: String(statusCode),
    tier,
  });

  partnerApiLatency.observe(
    { partner_id: partnerId, endpoint: normalizePath(endpoint) },
    durationMs / 1000
  );

  if (statusCode === 429) {
    partnerApiRateLimitHits.inc({ partner_id: partnerId, tier });
  }
}

/**
 * Record webhook metrics
 */
export function recordWebhookDelivery(
  subscriptionId: string,
  status: 'success' | 'failure' | 'retry',
  durationMs: number
): void {
  webhookDeliveriesTotal.inc({ subscription_id: subscriptionId, status });
  webhookDeliveryLatency.observe({ subscription_id: subscriptionId }, durationMs / 1000);
}

/**
 * Record database query metrics
 */
export function recordDbQuery(
  operation: string,
  table: string,
  durationMs: number,
  error?: boolean,
  errorType?: string
): void {
  dbQueryDuration.observe({ operation, table }, durationMs / 1000);

  if (error) {
    dbQueryErrors.inc({
      operation,
      error_type: errorType || 'unknown',
    });
  }
}

/**
 * Record cache metrics
 */
export function recordCacheOperation(
  operation: 'get' | 'set' | 'del',
  result: 'hit' | 'miss' | 'success' | 'error',
  durationMs: number,
  cacheType: string = 'redis'
): void {
  cacheOperationsTotal.inc({ operation, result });
  cacheLatency.observe({ operation, cache_type: cacheType }, durationMs / 1000);
}

/**
 * Update cache hit rate gauge
 */
export function updateCacheHitRate(cacheType: string, hitRate: number): void {
  cacheHitRate.set({ cache_type: cacheType }, hitRate);
}

/**
 * Record job metrics
 */
export function recordJob(
  queue: string,
  jobType: string,
  status: 'completed' | 'failed',
  durationMs: number
): void {
  jobsTotal.inc({ queue, status });
  jobDuration.observe({ queue, job_type: jobType }, durationMs / 1000);
}

/**
 * Update job queue size gauge
 */
export function updateJobQueueSize(
  queue: string,
  waiting: number,
  active: number,
  completed: number,
  failed: number
): void {
  jobQueueSize.set({ queue, state: 'waiting' }, waiting);
  jobQueueSize.set({ queue, state: 'active' }, active);
  jobQueueSize.set({ queue, state: 'completed' }, completed);
  jobQueueSize.set({ queue, state: 'failed' }, failed);
}

// ==========================================================================
// Helpers
// ==========================================================================

/**
 * Normalize path for consistent metric labels
 * Replaces IDs with placeholders
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\?.*/g, ''); // Remove query string
}

// Export registry for testing
export { register };

export default metricsRoutes;
