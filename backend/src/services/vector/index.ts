/**
 * Vector Services Index
 * Exports all vector-related services and utilities
 */

// Services
export { QdrantService, getQdrantService } from './qdrant.service.js';
export type { SearchFilter, SearchOptions } from './qdrant.service.js';

export { EmbeddingService, getEmbeddingService } from './embedding.service.js';
export type { EmbeddingOptions, ReindexStatus } from './embedding.service.js';

// Chunking utilities
export {
  chunkText,
  createDocumentChunks,
  generateContentPreview,
  generateChunkHash,
  DEFAULT_CHUNKING_CONFIG,
} from './chunking.js';
export type { ChunkingConfig } from './chunking.js';

// Re-export types from models
export type {
  VectorPoint,
  VectorPayload,
  VectorSearchResult,
  BatchUpsertRequest,
  DocumentChunk,
  SourceDocument,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingMetadata,
} from '../../models/Embedding.js';
