/**
 * Search API Routes (T036, T037)
 * Endpoints for semantic search and conversational search
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSearchService } from '../../services/vector/search.service.js';
import { getConversationService } from '../../services/vector/conversation.service.js';
import { logger } from '../../lib/logger.js';
import { SourceType } from '../../models/Embedding.js';

/**
 * Request body types
 */
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
   */
  fastify.post(
    '/',
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
        const tenantId = (request as any).tenantId || 'default';

        if (!query || query.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Query is required',
          });
        }

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
   */
  fastify.post(
    '/conversation',
    async (
      request: FastifyRequest<{ Body: ConversationStartBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { query } = request.body;
        const tenantId = (request as any).tenantId || 'default';
        const userId = (request as any).userId || 'anonymous';

        if (!query || query.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Query is required',
          });
        }

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
   */
  fastify.post(
    '/conversation/continue',
    async (
      request: FastifyRequest<{ Body: ConversationContinueBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { conversationId, query } = request.body;

        if (!conversationId || !query) {
          return reply.status(400).send({
            success: false,
            error: 'conversationId and query are required',
          });
        }

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
   */
  fastify.get(
    '/conversation/:conversationId',
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
   */
  fastify.delete(
    '/conversation/:conversationId',
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
   */
  fastify.post(
    '/similar',
    async (
      request: FastifyRequest<{ Body: SimilarBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { sourceId, limit = 5 } = request.body;
        const tenantId = (request as any).tenantId || 'default';

        if (!sourceId) {
          return reply.status(400).send({
            success: false,
            error: 'sourceId is required',
          });
        }

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
   */
  fastify.post(
    '/vector',
    async (
      request: FastifyRequest<{ Body: SearchBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { query, limit = 10, sourceTypes, category, dateFrom, dateTo } =
          request.body;
        const tenantId = (request as any).tenantId || 'default';

        if (!query) {
          return reply.status(400).send({
            success: false,
            error: 'Query is required',
          });
        }

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
