/**
 * Embedding TypeScript Model Types (T020)
 * Vector representation of a document chunk
 */

import { SourceType } from '@prisma/client';

export { SourceType };

/**
 * Embedding entity (PostgreSQL record)
 */
export interface Embedding {
  id: string;
  vectorIndexId: string;
  sourceType: SourceType;
  sourceId: string;
  chunkIndex: number;
  chunkHash: string;
  contentPreview: string;
  metadata: EmbeddingMetadata | null;
  tenantId: string;
  createdAt: Date;
}

/**
 * Embedding metadata (filterable attributes)
 */
export interface EmbeddingMetadata {
  authorId?: string;
  category?: string;
  language?: string;
  participants?: string[];
  threadId?: string;
  sentAt?: string;
  title?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Create Embedding input
 */
export interface CreateEmbeddingInput {
  vectorIndexId: string;
  sourceType: SourceType;
  sourceId: string;
  chunkIndex: number;
  chunkHash: string;
  contentPreview: string;
  metadata?: EmbeddingMetadata;
  tenantId: string;
}

/**
 * Vector point for Qdrant storage
 */
export interface VectorPoint {
  id: string;
  vector: number[];
  payload: VectorPayload;
}

/**
 * Vector payload (Qdrant metadata)
 */
export interface VectorPayload {
  tenant_id: string;
  source_type: SourceType;
  source_id: string;
  chunk_index: number;
  content_preview: string;
  created_at: string;
  author_id?: string;
  category?: string;
  language?: string;
  participants?: string[];
  thread_id?: string;
  sent_at?: string;
}

/**
 * Search result from vector store
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  payload: VectorPayload;
}

/**
 * Batch upsert request
 */
export interface BatchUpsertRequest {
  points: VectorPoint[];
  collectionName: string;
}

/**
 * Document chunk for embedding
 */
export interface DocumentChunk {
  content: string;
  index: number;
  metadata: EmbeddingMetadata;
}

/**
 * Source document for indexing
 */
export interface SourceDocument {
  id: string;
  type: SourceType;
  content: string;
  tenantId: string;
  metadata: EmbeddingMetadata;
}

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  embeddingId: string;
  chunkIndex: number;
  vectorId: string;
  success: boolean;
  error?: string;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  sourceId: string;
  sourceType: SourceType;
  totalChunks: number;
  successfulChunks: number;
  failedChunks: number;
  results: EmbeddingResult[];
}
