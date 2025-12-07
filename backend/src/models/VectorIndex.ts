/**
 * VectorIndex TypeScript Model Types (T019)
 * Represents a collection of embeddings for a specific content type
 */

import { IndexStatus, SourceType } from '@prisma/client';

export { IndexStatus, SourceType };

/**
 * VectorIndex entity
 */
export interface VectorIndex {
  id: string;
  name: string;
  embeddingModel: string;
  dimensions: number;
  documentCount: number;
  status: IndexStatus;
  lastUpdatedAt: Date;
  createdAt: Date;
}

/**
 * Create VectorIndex input
 */
export interface CreateVectorIndexInput {
  name: string;
  embeddingModel: string;
  dimensions: number;
}

/**
 * Update VectorIndex input
 */
export interface UpdateVectorIndexInput {
  documentCount?: number;
  status?: IndexStatus;
}

/**
 * VectorIndex with embeddings count
 */
export interface VectorIndexWithStats extends VectorIndex {
  embeddingsCount: number;
  avgChunksPerDocument: number;
}

/**
 * Supported embedding models
 */
export const EMBEDDING_MODELS = {
  OPENAI_SMALL: 'text-embedding-3-small',
  OPENAI_LARGE: 'text-embedding-3-large',
} as const;

export type EmbeddingModel = (typeof EMBEDDING_MODELS)[keyof typeof EMBEDDING_MODELS];

/**
 * Embedding dimensions by model
 */
export const MODEL_DIMENSIONS: Record<EmbeddingModel, number> = {
  [EMBEDDING_MODELS.OPENAI_SMALL]: 1536,
  [EMBEDDING_MODELS.OPENAI_LARGE]: 3072,
};

/**
 * Default embedding configuration
 */
export const DEFAULT_EMBEDDING_CONFIG = {
  model: EMBEDDING_MODELS.OPENAI_SMALL,
  dimensions: MODEL_DIMENSIONS[EMBEDDING_MODELS.OPENAI_SMALL],
};

/**
 * VectorIndex state transition rules
 */
export const INDEX_STATUS_TRANSITIONS: Record<IndexStatus, IndexStatus[]> = {
  CREATING: ['ACTIVE', 'ERROR'],
  ACTIVE: ['REINDEXING', 'ERROR'],
  REINDEXING: ['ACTIVE', 'ERROR'],
  ERROR: ['CREATING', 'ACTIVE'],
};

/**
 * Check if status transition is valid
 */
export function isValidStatusTransition(from: IndexStatus, to: IndexStatus): boolean {
  return INDEX_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
