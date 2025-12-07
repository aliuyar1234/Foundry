/**
 * Graph Enrichment Job (T116)
 * Background job for knowledge graph enrichment
 */

import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { getEnrichmentService } from '../services/graph/enrichment.service.js';
import { getRedisConnection } from '../lib/redis.js';

interface EnrichmentJobData {
  tenantId: string;
  type: 'discover' | 'enrich' | 'expertise' | 'clusters';
  entityType?: string;
  entityId?: string;
  options?: Record<string, unknown>;
}

const QUEUE_NAME = 'graph-enrichment';

// Create queue
export const enrichmentQueue = new Queue<EnrichmentJobData>(QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

// Create worker
export const enrichmentWorker = new Worker<EnrichmentJobData>(
  QUEUE_NAME,
  async (job: Job<EnrichmentJobData>) => {
    const { tenantId, type, entityType, entityId, options } = job.data;

    logger.info({ jobId: job.id, type, tenantId }, 'Processing enrichment job');

    try {
      const enrichmentService = getEnrichmentService();

      switch (type) {
        case 'discover': {
          const relationships = await enrichmentService.discoverRelationships(
            tenantId,
            options as { entityTypes?: string[]; minConfidence?: number; limit?: number }
          );
          return { type: 'discover', discovered: relationships.length };
        }

        case 'enrich': {
          if (!entityType || !entityId) {
            throw new Error('entityType and entityId required for enrich');
          }
          const enrichment = await enrichmentService.enrichEntity(
            entityType,
            entityId,
            tenantId
          );
          if (enrichment) {
            await enrichmentService.applyEnrichment(enrichment);
          }
          return {
            type: 'enrich',
            properties: Object.keys(enrichment?.discoveredProperties || {}).length,
            relationships: enrichment?.discoveredRelationships.length || 0,
          };
        }

        case 'expertise': {
          const mappings = await enrichmentService.mapExpertise(tenantId);
          await enrichmentService.applyExpertiseMappings(mappings);
          return { type: 'expertise', mappings: mappings.length };
        }

        case 'clusters': {
          const clusters = await enrichmentService.findClusters(tenantId, options);
          return { type: 'clusters', found: clusters.length };
        }

        default:
          throw new Error(`Unknown enrichment type: ${type}`);
      }
    } catch (error) {
      logger.error({ error, type, jobId: job.id }, 'Enrichment job failed');
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
);

// Event handlers
enrichmentWorker.on('completed', (job, result) => {
  logger.debug({ jobId: job.id, result }, 'Enrichment job completed');
});

enrichmentWorker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, 'Enrichment job failed');
});

/**
 * Queue a relationship discovery job
 */
export async function queueDiscovery(
  tenantId: string,
  options?: { entityTypes?: string[]; minConfidence?: number; limit?: number }
): Promise<string> {
  const job = await enrichmentQueue.add('discover', {
    tenantId,
    type: 'discover',
    options,
  });
  return job.id || '';
}

/**
 * Queue an entity enrichment job
 */
export async function queueEnrichment(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<string> {
  const job = await enrichmentQueue.add('enrich', {
    tenantId,
    type: 'enrich',
    entityType,
    entityId,
  });
  return job.id || '';
}

/**
 * Queue an expertise mapping job
 */
export async function queueExpertiseMapping(tenantId: string): Promise<string> {
  const job = await enrichmentQueue.add('expertise', {
    tenantId,
    type: 'expertise',
  });
  return job.id || '';
}

/**
 * Queue a cluster detection job
 */
export async function queueClusterDetection(
  tenantId: string,
  minSize?: number
): Promise<string> {
  const job = await enrichmentQueue.add('clusters', {
    tenantId,
    type: 'clusters',
    options: { minSize },
  });
  return job.id || '';
}

/**
 * Schedule periodic enrichment for a tenant
 */
export async function schedulePeriodicEnrichment(tenantId: string): Promise<void> {
  // Schedule daily discovery
  await enrichmentQueue.add(
    'periodic-discover',
    { tenantId, type: 'discover' },
    {
      repeat: {
        pattern: '0 2 * * *', // 2 AM daily
      },
    }
  );

  // Schedule weekly expertise mapping
  await enrichmentQueue.add(
    'periodic-expertise',
    { tenantId, type: 'expertise' },
    {
      repeat: {
        pattern: '0 3 * * 0', // 3 AM every Sunday
      },
    }
  );
}

export default enrichmentQueue;
