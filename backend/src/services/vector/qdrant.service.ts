/**
 * Qdrant Vector Operations Service (T021, T024, T025)
 * Handles vector storage, retrieval, and management in Qdrant
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getQdrantClient,
  QDRANT_COLLECTIONS,
  VECTOR_CONFIG,
} from '../../lib/qdrant.js';
import { logger } from '../../lib/logger.js';
import type {
  VectorPoint,
  VectorPayload,
  VectorSearchResult,
  BatchUpsertRequest,
} from '../../models/Embedding.js';
import { SourceType } from '../../models/Embedding.js';

/**
 * Search filter options
 */
export interface SearchFilter {
  tenantId: string;
  sourceTypes?: SourceType[];
  authorId?: string;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Search options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  scoreThreshold?: number;
  filter?: SearchFilter;
}

/**
 * Default search options
 */
const DEFAULT_SEARCH_OPTIONS: Required<Omit<SearchOptions, 'filter'>> = {
  limit: 10,
  offset: 0,
  scoreThreshold: 0.5,
};

/**
 * QdrantService - Vector database operations
 */
export class QdrantService {
  private client = getQdrantClient();

  /**
   * Upsert a single vector point
   */
  async upsertVector(
    collectionName: string,
    point: VectorPoint
  ): Promise<void> {
    try {
      await this.client.upsert(collectionName, {
        wait: true,
        points: [
          {
            id: point.id,
            vector: point.vector,
            payload: point.payload as Record<string, unknown>,
          },
        ],
      });

      logger.debug(
        { collectionName, pointId: point.id },
        'Vector point upserted'
      );
    } catch (error) {
      logger.error(
        { collectionName, pointId: point.id, error },
        'Failed to upsert vector point'
      );
      throw error;
    }
  }

  /**
   * Batch upsert multiple vector points (T024)
   */
  async upsertVectorsBatch(request: BatchUpsertRequest): Promise<void> {
    const { collectionName, points } = request;
    const BATCH_SIZE = 100;

    try {
      // Process in batches
      for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);

        await this.client.upsert(collectionName, {
          wait: true,
          points: batch.map((p) => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload as Record<string, unknown>,
          })),
        });

        logger.debug(
          {
            collectionName,
            batchIndex: Math.floor(i / BATCH_SIZE),
            batchSize: batch.length,
            totalPoints: points.length,
          },
          'Vector batch upserted'
        );
      }

      logger.info(
        { collectionName, totalPoints: points.length },
        'Batch upsert complete'
      );
    } catch (error) {
      logger.error(
        { collectionName, pointsCount: points.length, error },
        'Failed to batch upsert vectors'
      );
      throw error;
    }
  }

  /**
   * Delete vectors by source document ID (T025)
   */
  async deleteBySourceId(
    collectionName: string,
    sourceId: string,
    tenantId: string
  ): Promise<number> {
    try {
      // First, find all points for this source
      const scrollResult = await this.client.scroll(collectionName, {
        filter: {
          must: [
            { key: 'source_id', match: { value: sourceId } },
            { key: 'tenant_id', match: { value: tenantId } },
          ],
        },
        limit: 10000,
        with_payload: false,
        with_vector: false,
      });

      const pointIds = scrollResult.points.map((p) => p.id as string);

      if (pointIds.length === 0) {
        logger.debug(
          { collectionName, sourceId, tenantId },
          'No vectors found for source'
        );
        return 0;
      }

      // Delete the points
      await this.client.delete(collectionName, {
        wait: true,
        points: pointIds,
      });

      logger.info(
        { collectionName, sourceId, tenantId, deletedCount: pointIds.length },
        'Vectors deleted by source ID'
      );

      return pointIds.length;
    } catch (error) {
      logger.error(
        { collectionName, sourceId, tenantId, error },
        'Failed to delete vectors by source ID'
      );
      throw error;
    }
  }

  /**
   * Search vectors by similarity
   */
  async search(
    collectionName: string,
    queryVector: number[],
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { limit, offset, scoreThreshold, filter } = {
      ...DEFAULT_SEARCH_OPTIONS,
      ...options,
    };

    try {
      // Build Qdrant filter
      const qdrantFilter = this.buildFilter(filter);

      const searchResult = await this.client.search(collectionName, {
        vector: queryVector,
        limit: limit + offset, // Offset is handled client-side
        score_threshold: scoreThreshold,
        filter: qdrantFilter,
        with_payload: true,
      });

      // Apply offset
      const results = searchResult.slice(offset).map((result) => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload as VectorPayload,
      }));

      logger.debug(
        {
          collectionName,
          resultsCount: results.length,
          topScore: results[0]?.score,
        },
        'Vector search complete'
      );

      return results;
    } catch (error) {
      logger.error({ collectionName, error }, 'Vector search failed');
      throw error;
    }
  }

  /**
   * Search in both document and communication collections
   */
  async searchAll(
    queryVector: number[],
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const [documentResults, communicationResults] = await Promise.all([
      this.search(QDRANT_COLLECTIONS.DOCUMENTS, queryVector, options),
      this.search(QDRANT_COLLECTIONS.COMMUNICATIONS, queryVector, options),
    ]);

    // Merge and sort by score
    const allResults = [...documentResults, ...communicationResults].sort(
      (a, b) => b.score - a.score
    );

    // Apply limit
    const limit = options.limit ?? DEFAULT_SEARCH_OPTIONS.limit;
    return allResults.slice(0, limit);
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(collectionName: string): Promise<{
    vectorCount: number;
    status: string;
  }> {
    try {
      const info = await this.client.getCollection(collectionName);

      return {
        vectorCount: info.points_count ?? 0,
        status: info.status,
      };
    } catch (error) {
      logger.error({ collectionName, error }, 'Failed to get collection info');
      throw error;
    }
  }

  /**
   * Count vectors for a tenant
   */
  async countVectorsByTenant(
    collectionName: string,
    tenantId: string
  ): Promise<number> {
    try {
      const countResult = await this.client.count(collectionName, {
        filter: {
          must: [{ key: 'tenant_id', match: { value: tenantId } }],
        },
        exact: true,
      });

      return countResult.count;
    } catch (error) {
      logger.error(
        { collectionName, tenantId, error },
        'Failed to count vectors'
      );
      throw error;
    }
  }

  /**
   * Build Qdrant filter from search filter options
   */
  private buildFilter(filter?: SearchFilter): Record<string, unknown> | undefined {
    if (!filter) {
      return undefined;
    }

    const must: Record<string, unknown>[] = [];

    // Tenant filter (required)
    must.push({ key: 'tenant_id', match: { value: filter.tenantId } });

    // Source type filter
    if (filter.sourceTypes && filter.sourceTypes.length > 0) {
      must.push({
        key: 'source_type',
        match: { any: filter.sourceTypes },
      });
    }

    // Author filter
    if (filter.authorId) {
      must.push({ key: 'author_id', match: { value: filter.authorId } });
    }

    // Category filter
    if (filter.category) {
      must.push({ key: 'category', match: { value: filter.category } });
    }

    // Date range filter
    if (filter.dateFrom || filter.dateTo) {
      const range: Record<string, string> = {};
      if (filter.dateFrom) {
        range.gte = filter.dateFrom.toISOString();
      }
      if (filter.dateTo) {
        range.lte = filter.dateTo.toISOString();
      }
      must.push({ key: 'created_at', range });
    }

    return must.length > 0 ? { must } : undefined;
  }

  /**
   * Generate a unique vector ID
   */
  static generateVectorId(): string {
    return uuidv4();
  }
}

// Singleton instance
let qdrantServiceInstance: QdrantService | null = null;

export function getQdrantService(): QdrantService {
  if (!qdrantServiceInstance) {
    qdrantServiceInstance = new QdrantService();
  }
  return qdrantServiceInstance;
}
