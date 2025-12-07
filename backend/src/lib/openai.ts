/**
 * OpenAI API Client
 * Provides embedding generation capabilities
 */

import OpenAI from 'openai';
import { logger } from './logger.js';

// Singleton instance
let openaiClient: OpenAI | null = null;

/**
 * Get OpenAI client instance (singleton)
 */
export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    openaiClient = new OpenAI({
      apiKey,
    });

    logger.info('OpenAI client initialized');
  }

  return openaiClient;
}

/**
 * Available embedding models
 */
export const EMBEDDING_MODELS = {
  SMALL: 'text-embedding-3-small',
  LARGE: 'text-embedding-3-large',
} as const;

/**
 * Embedding model dimensions
 */
export const EMBEDDING_DIMENSIONS = {
  [EMBEDDING_MODELS.SMALL]: 1536,
  [EMBEDDING_MODELS.LARGE]: 3072,
} as const;

/**
 * Default embedding configuration
 */
export const DEFAULT_EMBEDDING_CONFIG = {
  model: EMBEDDING_MODELS.SMALL,
  dimensions: EMBEDDING_DIMENSIONS[EMBEDDING_MODELS.SMALL],
};

/**
 * Generate embeddings for a single text
 */
export async function generateEmbedding(
  text: string,
  options: {
    model?: string;
  } = {}
): Promise<number[]> {
  const client = getOpenAIClient();
  const model = options.model || DEFAULT_EMBEDDING_CONFIG.model;

  try {
    const response = await client.embeddings.create({
      model,
      input: text,
    });

    logger.debug({
      model,
      inputLength: text.length,
      totalTokens: response.usage.total_tokens,
    }, 'Embedding generated');

    return response.data[0].embedding;
  } catch (error) {
    logger.error({ error, textLength: text.length }, 'Embedding generation failed');
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  options: {
    model?: string;
  } = {}
): Promise<number[][]> {
  const client = getOpenAIClient();
  const model = options.model || DEFAULT_EMBEDDING_CONFIG.model;

  // OpenAI supports up to 2048 texts per batch
  const MAX_BATCH_SIZE = 100; // Use smaller batches for reliability
  const embeddings: number[][] = [];

  try {
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);

      const response = await client.embeddings.create({
        model,
        input: batch,
      });

      // Sort by index to maintain order
      const sortedData = response.data.sort((a, b) => a.index - b.index);
      embeddings.push(...sortedData.map(d => d.embedding));

      logger.debug({
        model,
        batchSize: batch.length,
        batchIndex: Math.floor(i / MAX_BATCH_SIZE),
        totalBatches: Math.ceil(texts.length / MAX_BATCH_SIZE),
        totalTokens: response.usage.total_tokens,
      }, 'Embedding batch generated');
    }

    return embeddings;
  } catch (error) {
    logger.error({ error, textsCount: texts.length }, 'Batch embedding generation failed');
    throw error;
  }
}

/**
 * Estimate token count for text (rough approximation)
 * OpenAI uses ~4 characters per token on average
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if OpenAI API is accessible
 */
export async function checkOpenAIHealth(): Promise<boolean> {
  try {
    const client = getOpenAIClient();
    // Simple health check - list models
    await client.models.list();
    return true;
  } catch (error) {
    logger.error({ error }, 'OpenAI health check failed');
    return false;
  }
}

export { OpenAI };
