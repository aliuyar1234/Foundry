/**
 * Graph API Routes (T112-T115)
 * Endpoints for knowledge graph enrichment
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getEnrichmentService } from '../../services/graph/enrichment.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Request body types
 */
interface DiscoverRelationshipsBody {
  entityTypes?: string[];
  minConfidence?: number;
  limit?: number;
}

interface EnrichEntityBody {
  entityType: string;
  entityId: string;
  apply?: boolean;
}

interface ApplyEnrichmentBody {
  enrichment: {
    type: string;
    id: string;
    name: string;
    discoveredProperties: Record<string, unknown>;
    discoveredRelationships: Array<{
      sourceType: string;
      sourceId: string;
      sourceName: string;
      targetType: string;
      targetId: string;
      targetName: string;
      relationshipType: string;
      confidence: number;
      evidence: string[];
    }>;
  };
}

/**
 * Register graph enrichment routes
 */
export async function graphRoutes(fastify: FastifyInstance): Promise<void> {
  const enrichmentService = getEnrichmentService();

  /**
   * Discover potential relationships
   * POST /api/v1/graph/discover
   */
  fastify.post(
    '/discover',
    async (
      request: FastifyRequest<{ Body: DiscoverRelationshipsBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
        const { entityTypes, minConfidence, limit } = request.body;

        const relationships = await enrichmentService.discoverRelationships(tenantId, {
          entityTypes,
          minConfidence,
          limit,
        });

        return reply.send({
          success: true,
          data: relationships,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to discover relationships');
        return reply.status(500).send({
          success: false,
          error: 'Failed to discover relationships',
        });
      }
    }
  );

  /**
   * Enrich a specific entity
   * POST /api/v1/graph/enrich
   */
  fastify.post(
    '/enrich',
    async (
      request: FastifyRequest<{ Body: EnrichEntityBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
        const { entityType, entityId, apply = false } = request.body;

        const enrichment = await enrichmentService.enrichEntity(
          entityType,
          entityId,
          tenantId
        );

        if (!enrichment) {
          return reply.status(404).send({
            success: false,
            error: 'Entity not found',
          });
        }

        if (apply) {
          await enrichmentService.applyEnrichment(enrichment);
        }

        return reply.send({
          success: true,
          data: {
            enrichment,
            applied: apply,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to enrich entity');
        return reply.status(500).send({
          success: false,
          error: 'Failed to enrich entity',
        });
      }
    }
  );

  /**
   * Apply enrichment to graph
   * POST /api/v1/graph/apply
   */
  fastify.post(
    '/apply',
    async (
      request: FastifyRequest<{ Body: ApplyEnrichmentBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { enrichment } = request.body;

        await enrichmentService.applyEnrichment({
          ...enrichment,
          enrichmentSource: 'manual',
          confidence: 1.0,
        });

        return reply.send({
          success: true,
          message: 'Enrichment applied successfully',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to apply enrichment');
        return reply.status(500).send({
          success: false,
          error: 'Failed to apply enrichment',
        });
      }
    }
  );

  /**
   * Map expertise for all people
   * POST /api/v1/graph/expertise/map
   */
  fastify.post(
    '/expertise/map',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';

        const mappings = await enrichmentService.mapExpertise(tenantId);

        return reply.send({
          success: true,
          data: mappings,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to map expertise');
        return reply.status(500).send({
          success: false,
          error: 'Failed to map expertise',
        });
      }
    }
  );

  /**
   * Apply expertise mappings
   * POST /api/v1/graph/expertise/apply
   */
  fastify.post(
    '/expertise/apply',
    async (
      request: FastifyRequest<{
        Body: {
          mappings: Array<{
            personId: string;
            personName: string;
            expertise: Array<{
              domain: string;
              level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
              confidence: number;
              evidence: string[];
            }>;
            inferredFrom: string[];
          }>;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { mappings } = request.body;

        await enrichmentService.applyExpertiseMappings(mappings);

        return reply.send({
          success: true,
          message: 'Expertise mappings applied successfully',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to apply expertise mappings');
        return reply.status(500).send({
          success: false,
          error: 'Failed to apply expertise mappings',
        });
      }
    }
  );

  /**
   * Find clusters in the graph
   * GET /api/v1/graph/clusters
   */
  fastify.get(
    '/clusters',
    async (
      request: FastifyRequest<{ Querystring: { minSize?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
        const { minSize } = request.query;

        const clusters = await enrichmentService.findClusters(tenantId, {
          minSize: minSize ? parseInt(minSize, 10) : 3,
        });

        return reply.send({
          success: true,
          data: clusters,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to find clusters');
        return reply.status(500).send({
          success: false,
          error: 'Failed to find clusters',
        });
      }
    }
  );

  /**
   * Get graph statistics
   * GET /api/v1/graph/stats
   */
  fastify.get(
    '/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';

        const stats = await enrichmentService.getGraphStats(tenantId);

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get graph stats');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get graph stats',
        });
      }
    }
  );
}

export default graphRoutes;
