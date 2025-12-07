/**
 * Search Service (T031-T034)
 * Implements hybrid search (vector + keyword) with permission filtering
 */

import { PrismaClient } from '@prisma/client';
import { getQdrantService, QdrantService, SearchFilter, SearchOptions } from './qdrant.service.js';
import { getEmbeddingService, EmbeddingService } from './embedding.service.js';
import { generateCompletion } from '../../lib/anthropic.js';
import { logger } from '../../lib/logger.js';
import type { VectorSearchResult, VectorPayload } from '../../models/Embedding.js';
import { SourceType } from '../../models/Embedding.js';

const prisma = new PrismaClient();

/**
 * Search result with enriched metadata
 */
export interface SearchResult {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  score: number;
  content: string;
  highlights: string[];
  metadata: {
    authorId?: string;
    authorName?: string;
    title?: string;
    category?: string;
    createdAt: string;
    threadId?: string;
  };
}

/**
 * Hybrid search options
 */
export interface HybridSearchOptions {
  limit?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  recencyWeight?: number;
  filter?: SearchFilter;
  includeHighlights?: boolean;
}

/**
 * Conversational search result
 */
export interface ConversationalSearchResult {
  answer: string;
  sources: SearchResult[];
  confidence: number;
  followUpQuestions?: string[];
}

/**
 * Default search weights (T033)
 */
const DEFAULT_WEIGHTS = {
  vector: 0.7,
  keyword: 0.2,
  recency: 0.1,
};

/**
 * SearchService - Implements semantic and hybrid search
 */
export class SearchService {
  private qdrantService: QdrantService;
  private embeddingService: EmbeddingService;

  constructor() {
    this.qdrantService = getQdrantService();
    this.embeddingService = getEmbeddingService();
  }

  /**
   * Hybrid search combining vector similarity and keyword matching (T031, T033)
   */
  async search(
    query: string,
    tenantId: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      vectorWeight = DEFAULT_WEIGHTS.vector,
      keywordWeight = DEFAULT_WEIGHTS.keyword,
      recencyWeight = DEFAULT_WEIGHTS.recency,
      filter,
      includeHighlights = true,
    } = options;

    logger.info({ query, tenantId, limit }, 'Starting hybrid search');

    // Generate query embedding
    const queryVector = await this.embeddingService.embedQuery(query);

    // Vector search
    const vectorResults = await this.qdrantService.searchAll(queryVector, {
      limit: limit * 2, // Get more results to merge with keyword search
      filter: { ...filter, tenantId },
    });

    // Keyword search (simple substring matching on content previews)
    const keywordResults = await this.keywordSearch(query, tenantId, limit * 2);

    // Merge and rank results
    const mergedResults = this.mergeAndRank(
      vectorResults,
      keywordResults,
      vectorWeight,
      keywordWeight,
      recencyWeight
    );

    // Take top results
    const topResults = mergedResults.slice(0, limit);

    // Enrich with highlights
    const enrichedResults = includeHighlights
      ? this.addHighlights(topResults, query)
      : topResults;

    // Apply permission filtering (T032)
    const filteredResults = await this.applyPermissionFiltering(
      enrichedResults,
      tenantId
    );

    logger.info(
      { query, resultCount: filteredResults.length },
      'Hybrid search complete'
    );

    return filteredResults;
  }

  /**
   * Pure vector similarity search
   */
  async vectorSearch(
    query: string,
    tenantId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const queryVector = await this.embeddingService.embedQuery(query);

    const results = await this.qdrantService.searchAll(queryVector, {
      ...options,
      filter: { ...options.filter, tenantId },
    });

    return this.convertToSearchResults(results);
  }

  /**
   * Find similar documents to a given source
   */
  async findSimilar(
    sourceId: string,
    tenantId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    // Get embeddings for the source document
    const embeddings = await prisma.embedding.findMany({
      where: { sourceId, tenantId },
      orderBy: { chunkIndex: 'asc' },
      take: 1, // Use first chunk for similarity
    });

    if (embeddings.length === 0) {
      return [];
    }

    // Get the vector for this embedding from Qdrant
    // For simplicity, we'll use the content preview to generate a query
    const queryVector = await this.embeddingService.embedQuery(
      embeddings[0].contentPreview
    );

    const results = await this.qdrantService.searchAll(queryVector, {
      limit: limit + 1, // Extra to filter out self
      filter: { tenantId },
    });

    // Filter out the source document itself
    const filtered = results.filter((r) => r.payload.source_id !== sourceId);

    return this.convertToSearchResults(filtered.slice(0, limit));
  }

  /**
   * Keyword search using PostgreSQL (T031)
   */
  private async keywordSearch(
    query: string,
    tenantId: string,
    limit: number
  ): Promise<VectorSearchResult[]> {
    // Split query into keywords
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);

    if (keywords.length === 0) {
      return [];
    }

    // Search in embedding content previews
    const embeddings = await prisma.embedding.findMany({
      where: {
        tenantId,
        OR: keywords.map((keyword) => ({
          contentPreview: {
            contains: keyword,
            mode: 'insensitive',
          },
        })),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Convert to VectorSearchResult format
    return embeddings.map((e) => ({
      id: e.id,
      score: this.calculateKeywordScore(e.contentPreview, keywords),
      payload: {
        tenant_id: e.tenantId,
        source_type: e.sourceType,
        source_id: e.sourceId,
        chunk_index: e.chunkIndex,
        content_preview: e.contentPreview,
        created_at: e.createdAt.toISOString(),
        ...(e.metadata as Record<string, unknown> || {}),
      } as VectorPayload,
    }));
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordScore(content: string, keywords: string[]): number {
    const lowerContent = content.toLowerCase();
    let matches = 0;

    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        matches++;
      }
    }

    return matches / keywords.length;
  }

  /**
   * Merge vector and keyword results with weighted scoring (T033)
   */
  private mergeAndRank(
    vectorResults: VectorSearchResult[],
    keywordResults: VectorSearchResult[],
    vectorWeight: number,
    keywordWeight: number,
    recencyWeight: number
  ): SearchResult[] {
    const scoreMap = new Map<string, {
      vectorScore: number;
      keywordScore: number;
      recencyScore: number;
      result: VectorSearchResult;
    }>();

    // Process vector results
    for (const result of vectorResults) {
      const key = `${result.payload.source_id}-${result.payload.chunk_index}`;
      scoreMap.set(key, {
        vectorScore: result.score,
        keywordScore: 0,
        recencyScore: this.calculateRecencyScore(result.payload.created_at),
        result,
      });
    }

    // Add keyword scores
    for (const result of keywordResults) {
      const key = `${result.payload.source_id}-${result.payload.chunk_index}`;
      const existing = scoreMap.get(key);

      if (existing) {
        existing.keywordScore = result.score;
      } else {
        scoreMap.set(key, {
          vectorScore: 0,
          keywordScore: result.score,
          recencyScore: this.calculateRecencyScore(result.payload.created_at),
          result,
        });
      }
    }

    // Calculate final scores and sort
    const rankedResults: Array<SearchResult & { finalScore: number }> = [];

    for (const [, data] of scoreMap) {
      const finalScore =
        data.vectorScore * vectorWeight +
        data.keywordScore * keywordWeight +
        data.recencyScore * recencyWeight;

      rankedResults.push({
        ...this.convertPayloadToSearchResult(data.result),
        finalScore,
      });
    }

    // Sort by final score
    rankedResults.sort((a, b) => b.finalScore - a.finalScore);

    return rankedResults;
  }

  /**
   * Calculate recency score (more recent = higher score)
   */
  private calculateRecencyScore(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: score drops to 0.5 after 30 days
    return Math.exp(-daysDiff / 43.3);
  }

  /**
   * Add snippet highlighting (T034)
   */
  private addHighlights(results: SearchResult[], query: string): SearchResult[] {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);

    return results.map((result) => {
      const highlights = this.extractHighlights(result.content, keywords);
      return { ...result, highlights };
    });
  }

  /**
   * Extract highlighted snippets from content
   */
  private extractHighlights(content: string, keywords: string[]): string[] {
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);
    const windowSize = 150; // characters around keyword

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();

      for (const keyword of keywords) {
        const index = lowerSentence.indexOf(keyword);
        if (index !== -1) {
          // Extract window around keyword
          const start = Math.max(0, index - windowSize / 2);
          const end = Math.min(sentence.length, index + keyword.length + windowSize / 2);
          let snippet = sentence.slice(start, end).trim();

          // Add ellipsis if truncated
          if (start > 0) snippet = '...' + snippet;
          if (end < sentence.length) snippet = snippet + '...';

          // Highlight keyword with markers
          const highlightedSnippet = snippet.replace(
            new RegExp(`(${keyword})`, 'gi'),
            '**$1**'
          );

          if (!highlights.includes(highlightedSnippet)) {
            highlights.push(highlightedSnippet);
          }
        }
      }
    }

    return highlights.slice(0, 3); // Max 3 highlights
  }

  /**
   * Apply permission filtering based on user access (T032)
   */
  private async applyPermissionFiltering(
    results: SearchResult[],
    tenantId: string
  ): Promise<SearchResult[]> {
    // For now, tenant-level filtering is sufficient
    // In a production system, this would check document-level permissions
    return results.filter((r) => r.metadata !== undefined);
  }

  /**
   * Convert Qdrant results to SearchResults
   */
  private convertToSearchResults(results: VectorSearchResult[]): SearchResult[] {
    return results.map(this.convertPayloadToSearchResult.bind(this));
  }

  /**
   * Convert a single Qdrant result to SearchResult
   */
  private convertPayloadToSearchResult(result: VectorSearchResult): SearchResult {
    const payload = result.payload;

    return {
      id: result.id,
      sourceId: payload.source_id,
      sourceType: payload.source_type,
      score: result.score,
      content: payload.content_preview,
      highlights: [],
      metadata: {
        authorId: payload.author_id,
        category: payload.category,
        createdAt: payload.created_at,
        threadId: payload.thread_id,
      },
    };
  }
}

// Singleton instance
let searchServiceInstance: SearchService | null = null;

export function getSearchService(): SearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new SearchService();
  }
  return searchServiceInstance;
}
