/**
 * Graph API Routes (T112-T115)
 * Endpoints for knowledge graph enrichment
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getEnrichmentService } from '../../services/graph/enrichment.service.js';
import { logger } from '../../lib/logger.js';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const discoverRelationshipsSchema = {
  type: 'object',
  properties: {
    entityTypes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 100 },
      maxItems: 20,
    },
    minConfidence: { type: 'number', minimum: 0, maximum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
  },
  additionalProperties: false,
} as const;

const enrichEntitySchema = {
  type: 'object',
  required: ['entityType', 'entityId'],
  properties: {
    entityType: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
    entityId: { type: 'string', minLength: 1, maxLength: 100 },
    apply: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

const applyEnrichmentSchema = {
  type: 'object',
  required: ['enrichment'],
  properties: {
    enrichment: {
      type: 'object',
      required: ['type', 'id', 'name'],
      properties: {
        type: { type: 'string', minLength: 1, maxLength: 100 },
        id: { type: 'string', minLength: 1, maxLength: 100 },
        name: { type: 'string', minLength: 1, maxLength: 500 },
        discoveredProperties: { type: 'object', additionalProperties: true },
        discoveredRelationships: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: ['sourceType', 'sourceId', 'targetType', 'targetId', 'relationshipType'],
            properties: {
              sourceType: { type: 'string', minLength: 1, maxLength: 100 },
              sourceId: { type: 'string', minLength: 1, maxLength: 100 },
              sourceName: { type: 'string', maxLength: 500 },
              targetType: { type: 'string', minLength: 1, maxLength: 100 },
              targetId: { type: 'string', minLength: 1, maxLength: 100 },
              targetName: { type: 'string', maxLength: 500 },
              relationshipType: { type: 'string', minLength: 1, maxLength: 100 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              evidence: { type: 'array', items: { type: 'string', maxLength: 1000 }, maxItems: 50 },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const applyExpertiseSchema = {
  type: 'object',
  required: ['mappings'],
  properties: {
    mappings: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        required: ['personId', 'personName', 'expertise'],
        properties: {
          personId: { type: 'string', minLength: 1, maxLength: 100 },
          personName: { type: 'string', minLength: 1, maxLength: 500 },
          expertise: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              required: ['domain', 'level', 'confidence'],
              properties: {
                domain: { type: 'string', minLength: 1, maxLength: 200 },
                level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'expert'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                evidence: { type: 'array', items: { type: 'string', maxLength: 1000 }, maxItems: 20 },
              },
              additionalProperties: false,
            },
          },
          inferredFrom: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

const clustersQuerySchema = {
  type: 'object',
  properties: {
    minSize: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

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
   * Requires: discovery.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/discover',
    {
      schema: { body: discoverRelationshipsSchema },
      preHandler: [requirePermission('discovery', 'create')],
    },
    async (
      request: FastifyRequest<{ Body: DiscoverRelationshipsBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
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
   * Requires: entityRecord.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/enrich',
    {
      schema: { body: enrichEntitySchema },
      preHandler: [requirePermission('entityRecord', 'update')],
    },
    async (
      request: FastifyRequest<{ Body: EnrichEntityBody }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
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
   * Requires: entityRecord.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/apply',
    {
      schema: { body: applyEnrichmentSchema },
      preHandler: [requirePermission('entityRecord', 'update')],
    },
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
   * Requires: discovery.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/expertise/map',
    { preHandler: [requirePermission('discovery', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);

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
   * Requires: entityRecord.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/expertise/apply',
    {
      schema: { body: applyExpertiseSchema },
      preHandler: [requirePermission('entityRecord', 'update')],
    },
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
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/clusters',
    {
      schema: { querystring: clustersQuerySchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Querystring: { minSize?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
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
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/stats',
    { preHandler: [requirePermission('discovery', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);

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
