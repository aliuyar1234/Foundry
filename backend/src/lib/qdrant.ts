/**
 * Qdrant Vector Database Client
 * Provides vector storage and similarity search capabilities
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from './logger.js';

// Singleton instance
let qdrantClient: QdrantClient | null = null;

/**
 * Get Qdrant client instance (singleton)
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';

    qdrantClient = new QdrantClient({
      url,
      timeout: 30000, // 30 second timeout
    });

    logger.info({ url }, 'Qdrant client initialized');
  }

  return qdrantClient;
}

/**
 * Check Qdrant connection health
 */
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    const response = await client.api('service').healthz();
    return response.status === 200;
  } catch (error) {
    logger.error({ error }, 'Qdrant health check failed');
    return false;
  }
}

/**
 * Qdrant collection names
 */
export const QDRANT_COLLECTIONS = {
  DOCUMENTS: 'documents_index',
  COMMUNICATIONS: 'communications_index',
} as const;

/**
 * Default vector configuration
 */
export const VECTOR_CONFIG = {
  size: 1536, // OpenAI text-embedding-3-small dimensions
  distance: 'Cosine' as const,
};

/**
 * Initialize Qdrant collections if they don't exist
 */
export async function initializeQdrantCollections(): Promise<void> {
  const client = getQdrantClient();

  for (const collectionName of Object.values(QDRANT_COLLECTIONS)) {
    try {
      // Check if collection exists
      const collections = await client.getCollections();
      const exists = collections.collections.some(c => c.name === collectionName);

      if (!exists) {
        await client.createCollection(collectionName, {
          vectors: {
            size: VECTOR_CONFIG.size,
            distance: VECTOR_CONFIG.distance,
          },
        });
        logger.info({ collectionName }, 'Qdrant collection created');
      } else {
        logger.debug({ collectionName }, 'Qdrant collection already exists');
      }
    } catch (error) {
      logger.error({ error, collectionName }, 'Failed to initialize Qdrant collection');
      throw error;
    }
  }
}

/**
 * Close Qdrant connection (for graceful shutdown)
 */
export function closeQdrantConnection(): void {
  qdrantClient = null;
  logger.info('Qdrant connection closed');
}

export { QdrantClient };
