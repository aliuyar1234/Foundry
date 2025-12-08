/**
 * Search API Routes (T036, T037)
 * Endpoints for semantic search and conversational search
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSearchService } from '../../services/vector/search.service.js';
import { getConversationService } from '../../services/vector/conversation.service.js';
import { logger } from '../../lib/logger.js';
import { SourceType } from '../../models/Embedding.js';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const searchBodySchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 10000 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
    sourceTypes: {
      type: 'array',
      items: { type: 'string', enum: ['document', 'email', 'message', 'meeting'] },
      maxItems: 4,
    },
    category: { type: 'string', maxLength: 100 },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    vectorWeight: { type: 'number', minimum: 0, maximum: 1 },
    keywordWeight: { type: 'number', minimum: 0, maximum: 1 },
    recencyWeight: { type: 'number', minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
} as const;

const conversationStartSchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 10000 },
  },
  additionalProperties: false,
} as const;

const conversationContinueSchema = {
  type: 'object',
  required: ['conversationId', 'query'],
  properties: {
    conversationId: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
    query: { type: 'string', minLength: 1, maxLength: 10000 },
  },
  additionalProperties: false,
} as const;

const similarBodySchema = {
  type: 'object',
  required: ['sourceId'],
  properties: {
    sourceId: { type: 'string', minLength: 1, maxLength: 100 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 5 },
  },
  additionalProperties: false,
} as const;

const conversationIdParamSchema = {
  type: 'object',
  required: ['conversationId'],
  properties: {
    conversationId: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

interface SearchBody {
  query: string;
  limit?: number;
  sourceTypes?: SourceType[];
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  vectorWeight?: number;
  keywordWeight?: number;
  recencyWeight?: number;
}

interface ConversationStartBody {
  query: string;
}

interface ConversationContinueBody {
  conversationId: string;
  query: string;
}

interface SimilarBody {
  sourceId: string;
  limit?: number;
}

/**
 * Register search routes
 */
export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const searchService = getSearchService();
  const conversationService = getConversationService();

  /**
   * Semantic search (T036)
   * POST /api/v1/search
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.post(
    '/',
    {
      schema: { body: searchBodySchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Body: SearchBody }>,
      reply: FastifyReply
    ) => {
      try {
        const {
          query,
          limit = 10,
          sourceTypes,
          category,
          dateFrom,
          dateTo,
          vectorWeight,
          keywordWeight,
          recencyWeight,
        } = request.body;
        const tenantId = getOrganizationId(request);

        // Schema validation handles required check

        const results = await searchService.search(query, tenantId, {
          limit,
          vectorWeight,
          keywordWeight,
          recencyWeight,
          filter: {
            tenantId,
            sourceTypes,
            category,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
          },
        });

        return reply.send({
          success: true,
          data: {
            query,
            results,
            count: results.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Search failed');
        return reply.status(500).send({
          success: false,
          error: 'Search failed',
        });
      }
    }
  );

  /**
   * Start conversational search (T037)
   * POST /api/v1/search/conversation
   * Requires: discovery.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/conversation',
    {
      schema: { body: conversationStartSchema },
      preHandler: [requirePermission('discovery', 'create')],
    },
    async (
      request: FastifyRequest<{ Body: ConversationStartBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { query } = request.body;
        const tenantId = getOrganizationId(request);
        const userId = (request as any).userId || 'anonymous';

        // Schema validation handles required check

        const response = await conversationService.startConversation(
          tenantId,
          userId,
          query
        );

        return reply.send({
          success: true,
          data: response,
        });
      } catch (error) {
        logger.error({ error }, 'Conversational search failed');
        return reply.status(500).send({
          success: false,
          error: 'Conversational search failed',
        });
      }
    }
  );

  /**
   * Continue conversational search (T037)
   * POST /api/v1/search/conversation/continue
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.post(
    '/conversation/continue',
    {
      schema: { body: conversationContinueSchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Body: ConversationContinueBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { conversationId, query } = request.body;

        // Schema validation handles required check

        const response = await conversationService.continueConversation(
          conversationId,
          query
        );

        return reply.send({
          success: true,
          data: response,
        });
      } catch (error) {
        logger.error({ error }, 'Continue conversation failed');

        if ((error as Error).message?.includes('not found')) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found',
          });
        }

        return reply.status(500).send({
          success: false,
          error: 'Continue conversation failed',
        });
      }
    }
  );

  /**
   * Get conversation history
   * GET /api/v1/search/conversation/:conversationId
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/conversation/:conversationId',
    {
      schema: { params: conversationIdParamSchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { conversationId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { conversationId } = request.params;

        const history = await conversationService.getConversationHistory(
          conversationId
        );

        if (!history) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found',
          });
        }

        return reply.send({
          success: true,
          data: {
            conversationId,
            messages: history,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Get conversation history failed');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get conversation history',
        });
      }
    }
  );

  /**
   * Delete conversation
   * DELETE /api/v1/search/conversation/:conversationId
   * Requires: discovery.read permission (VIEWER role minimum - users can delete their own)
   */
  fastify.delete(
    '/conversation/:conversationId',
    {
      schema: { params: conversationIdParamSchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { conversationId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { conversationId } = request.params;

        await conversationService.deleteConversation(conversationId);

        return reply.send({
          success: true,
          message: 'Conversation deleted',
        });
      } catch (error) {
        logger.error({ error }, 'Delete conversation failed');
        return reply.status(500).send({
          success: false,
          error: 'Failed to delete conversation',
        });
      }
    }
  );

  /**
   * Find similar documents (T036)
   * POST /api/v1/search/similar
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.post(
    '/similar',
    {
      schema: { body: similarBodySchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Body: SimilarBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceId, limit = 5 } = request.body;
        const tenantId = getOrganizationId(request);

        // Schema validation handles required check

        const results = await searchService.findSimilar(
          sourceId,
          tenantId,
          limit
        );

        return reply.send({
          success: true,
          data: {
            sourceId,
            similarDocuments: results,
            count: results.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Find similar failed');
        return reply.status(500).send({
          success: false,
          error: 'Find similar failed',
        });
      }
    }
  );

  /**
   * Vector-only search (for advanced users)
   * POST /api/v1/search/vector
   * Requires: discovery.read permission (VIEWER role minimum)
   */
  fastify.post(
    '/vector',
    {
      schema: { body: searchBodySchema },
      preHandler: [requirePermission('discovery', 'read')],
    },
    async (
      request: FastifyRequest<{ Body: SearchBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { query, limit = 10, sourceTypes, category, dateFrom, dateTo } =
          request.body;
        const tenantId = getOrganizationId(request);

        // Schema validation handles required check

        const results = await searchService.vectorSearch(query, tenantId, {
          limit,
          filter: {
            tenantId,
            sourceTypes,
            category,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
          },
        });

        return reply.send({
          success: true,
          data: {
            query,
            results,
            count: results.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Vector search failed');
        return reply.status(500).send({
          success: false,
          error: 'Vector search failed',
        });
      }
    }
  );
}

export default searchRoutes;
