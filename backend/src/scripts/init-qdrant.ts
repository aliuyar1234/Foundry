/**
 * Qdrant Collections Initialization Script (T017)
 * Creates vector collections for document and communication embeddings
 */

import { getQdrantClient, QDRANT_COLLECTIONS, VECTOR_CONFIG } from '../lib/qdrant.js';
import { logger } from '../lib/logger.js';

interface QdrantCollection {
  name: string;
  payloadSchema: Record<string, string>;
}

const COLLECTIONS: QdrantCollection[] = [
  {
    name: QDRANT_COLLECTIONS.DOCUMENTS,
    payloadSchema: {
      tenant_id: 'keyword',
      source_type: 'keyword',
      source_id: 'keyword',
      chunk_index: 'integer',
      created_at: 'datetime',
      author_id: 'keyword',
      category: 'keyword',
      language: 'keyword',
    },
  },
  {
    name: QDRANT_COLLECTIONS.COMMUNICATIONS,
    payloadSchema: {
      tenant_id: 'keyword',
      source_type: 'keyword',
      source_id: 'keyword',
      participants: 'keyword',
      thread_id: 'keyword',
      sent_at: 'datetime',
    },
  },
];

async function createCollection(
  client: ReturnType<typeof getQdrantClient>,
  collection: QdrantCollection
): Promise<void> {
  const { name, payloadSchema } = collection;

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === name);

    if (exists) {
      logger.info({ collectionName: name }, 'Collection already exists, skipping creation');
      return;
    }

    // Create collection with vector configuration
    await client.createCollection(name, {
      vectors: {
        size: VECTOR_CONFIG.size,
        distance: VECTOR_CONFIG.distance,
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    logger.info({ collectionName: name }, 'Collection created');

    // Create payload indexes for efficient filtering
    for (const [fieldName, fieldType] of Object.entries(payloadSchema)) {
      try {
        await client.createPayloadIndex(name, {
          field_name: fieldName,
          field_schema: fieldType as 'keyword' | 'integer' | 'float' | 'geo' | 'datetime' | 'text',
        });
        logger.debug({ collectionName: name, fieldName, fieldType }, 'Payload index created');
      } catch (indexError) {
        logger.warn(
          { collectionName: name, fieldName, error: indexError },
          'Failed to create payload index (may already exist)'
        );
      }
    }

    logger.info({ collectionName: name }, 'Collection setup complete');
  } catch (error) {
    logger.error({ collectionName: name, error }, 'Failed to create collection');
    throw error;
  }
}

export async function initializeQdrantCollections(): Promise<void> {
  logger.info('Starting Qdrant collections initialization');

  const client = getQdrantClient();

  for (const collection of COLLECTIONS) {
    await createCollection(client, collection);
  }

  logger.info('Qdrant collections initialization complete');
}

// Main entry point when run directly
async function main(): Promise<void> {
  try {
    await initializeQdrantCollections();
    logger.info('Qdrant initialization script completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Qdrant initialization failed');
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
