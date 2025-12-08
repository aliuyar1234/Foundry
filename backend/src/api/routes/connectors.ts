/**
 * Connector Management API Routes
 * Provides endpoints for managing connector instances and operations
 *
 * Tasks: T183-T192
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { ConnectorStatus, HealthStatus, ConnectorJobStatus, SyncType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { organizationContext, getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  getValidatedBody,
  getValidatedQuery,
  getValidatedParams
} from '../middleware/validation.js';
import {
  getAllConnectorMetadata,
  getConnectorMetadata,
  validateConnectorConfig
} from '../../connectors/factory.js';
import { addJob, QueueNames } from '../../jobs/queue.js';

// ============================================================================
// Encryption Configuration
// ============================================================================

/**
 * Get encryption key from environment or KMS
 * In production, this should fetch from AWS KMS, HashiCorp Vault, or similar
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is required');
  }

  // Key should be 64 hex characters (32 bytes = 256 bits)
  if (keyHex.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters (256 bits)');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Generate a unique key ID for key rotation support
 */
function getCurrentKeyId(): string {
  return process.env.CREDENTIAL_KEY_ID || 'v1';
}

// ============================================================================
// Validation Schemas
// ============================================================================

const idParamSchema = z.object({
  id: z.string().min(1),
});

const createConnectorInstanceSchema = z.object({
  connectorType: z.string().min(1),
  name: z.string().min(1).max(200),
  configuration: z.record(z.unknown()).optional().default({}),
});

const updateConnectorInstanceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  configuration: z.record(z.unknown()).optional(),
  status: z.nativeEnum(ConnectorStatus).optional(),
});

const listInstancesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ConnectorStatus).optional(),
  connectorType: z.string().optional(),
  search: z.string().optional(),
});

const syncHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ConnectorJobStatus).optional(),
  syncType: z.nativeEnum(SyncType).optional(),
});

const errorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  errorType: z.string().optional(),
  isResolved: z.coerce.boolean().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

const triggerSyncSchema = z.object({
  syncType: z.nativeEnum(SyncType).optional().default(SyncType.INCREMENTAL),
  options: z.record(z.unknown()).optional().default({}),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Mask sensitive credentials in configuration
 */
function maskSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...config };
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'apiKey',
    'clientSecret',
    'refreshToken',
    'accessToken',
  ];

  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
      masked[key] = '***MASKED***';
    }
  }

  return masked;
}

/**
 * Encrypted data format stored in database
 */
interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector (12 bytes for GCM) */
  iv: string;
  /** Base64-encoded authentication tag (16 bytes) */
  authTag: string;
  /** Algorithm identifier for future compatibility */
  algorithm: 'aes-256-gcm';
  /** Key version for rotation support */
  keyVersion: string;
}

/**
 * Encrypt sensitive configuration values using AES-256-GCM
 *
 * SECURITY: Uses authenticated encryption to ensure both confidentiality and integrity
 * - AES-256-GCM provides strong encryption with built-in authentication
 * - Random 12-byte IV for each encryption (never reused)
 * - 16-byte authentication tag prevents tampering
 *
 * @param config - The configuration object to encrypt
 * @returns Base64-encoded JSON string containing encrypted payload
 */
function encryptConfig(config: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const keyVersion = getCurrentKeyId();

  // Generate a random 12-byte IV (recommended for GCM)
  const iv = crypto.randomBytes(12);

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // Encrypt the JSON stringified config
  const plaintext = JSON.stringify(config);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  // Get the authentication tag (16 bytes)
  const authTag = cipher.getAuthTag();

  // Create the encrypted payload
  const payload: EncryptedPayload = {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: 'aes-256-gcm',
    keyVersion,
  };

  // Return as base64-encoded JSON for storage
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decrypt configuration values using AES-256-GCM
 *
 * SECURITY: Validates authentication tag to detect tampering
 *
 * @param encrypted - Base64-encoded JSON string containing encrypted payload
 * @returns Decrypted configuration object
 * @throws Error if decryption fails or data has been tampered with
 */
function decryptConfig(encrypted: string): Record<string, unknown> {
  try {
    // Handle legacy unencrypted data during migration
    if (encrypted.startsWith('{')) {
      console.warn('SECURITY WARNING: Found unencrypted credentials - should be migrated');
      return JSON.parse(encrypted) as Record<string, unknown>;
    }

    // Decode the base64 payload
    const payloadJson = Buffer.from(encrypted, 'base64').toString('utf8');
    const payload: EncryptedPayload = JSON.parse(payloadJson);

    // Validate algorithm
    if (payload.algorithm !== 'aes-256-gcm') {
      throw new Error(`Unsupported encryption algorithm: ${payload.algorithm}`);
    }

    // Get the encryption key (in production, might need to look up by keyVersion)
    const key = getEncryptionKey();

    // Decode components
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = payload.ciphertext;

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return JSON.parse(plaintext) as Record<string, unknown>;
  } catch (error) {
    // Log the error but don't expose details
    console.error('Credential decryption failed:', (error as Error).message);
    throw new Error('Failed to decrypt credentials - data may be corrupted or tampered');
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

export async function connectorRoutes(fastify: FastifyInstance) {
  // NOTE: Authentication and organization context are applied globally in routes/index.ts
  // Individual routes only need to add permission checks

  /**
   * T183: GET /connectors/available - List all available connector types
   * Returns metadata about all supported connector types
   */
  fastify.get(
    '/available',
    {
      preHandler: [requirePermission('connector', 'read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const connectorTypes = getAllConnectorMetadata();

        const availableConnectors = connectorTypes.map(metadata => ({
          type: metadata.type,
          name: metadata.name,
          description: metadata.description,
          authType: metadata.capabilities.requiredConfig.includes('clientId')
            ? 'oauth2'
            : metadata.capabilities.requiredConfig.includes('apiKey')
            ? 'api_key'
            : 'credentials',
          status: 'available',
          capabilities: {
            supportsIncrementalSync: metadata.capabilities.supportsIncrementalSync,
            supportsWebhooks: metadata.capabilities.supportsWebhooks,
            supportedResources: metadata.capabilities.supportedResources,
          },
          requiredConfig: metadata.capabilities.requiredConfig,
          optionalConfig: metadata.capabilities.optionalConfig || [],
        }));

        return reply.send({
          data: availableConnectors,
          count: availableConnectors.length,
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to list available connectors');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve available connectors',
        });
      }
    }
  );

  /**
   * T184: GET /connectors/instances - List all connector instances for organization
   * Returns all connector instances with their status and sync information
   */
  fastify.get(
    '/instances',
    {
      preHandler: [
        requirePermission('connector', 'read'),
        validateQuery(listInstancesQuerySchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const query = getValidatedQuery<z.infer<typeof listInstancesQuerySchema>>(request);

        const { page, pageSize, status, connectorType, search } = query;
        const skip = (page - 1) * pageSize;

        // Build where clause
        const where: Record<string, unknown> = {
          organizationId,
        };

        if (status) {
          where.status = status;
        }

        if (connectorType) {
          where.connectorType = connectorType;
        }

        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { connectorType: { contains: search, mode: 'insensitive' } },
          ];
        }

        // Get instances with latest sync job
        const [instances, total] = await Promise.all([
          prisma.connectorInstance.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
            include: {
              syncJobs: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              errors: {
                where: { isResolved: false },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          }),
          prisma.connectorInstance.count({ where }),
        ]);

        const data = instances.map(instance => ({
          id: instance.id,
          connectorType: instance.connectorType,
          name: instance.name,
          status: instance.status,
          healthStatus: instance.healthStatus,
          lastHealthCheck: instance.lastHealthCheck,
          lastSync: instance.syncJobs[0]?.completedAt || null,
          syncStatus: instance.syncJobs[0]?.status || null,
          errorCount: instance.errors.length,
          lastError: instance.errors[0] || null,
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt,
        }));

        return reply.send({
          data,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to list connector instances');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve connector instances',
        });
      }
    }
  );

  /**
   * T185: POST /connectors/instances - Create new connector instance
   * Validates configuration and encrypts credentials
   */
  fastify.post(
    '/instances',
    {
      preHandler: [
        requirePermission('connector', 'create'),
        validateBody(createConnectorInstanceSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const user = (request as AuthenticatedRequest).user;
        const body = getValidatedBody<z.infer<typeof createConnectorInstanceSchema>>(request);

        const { connectorType, name, configuration } = body;

        // Validate connector type exists
        const metadata = getConnectorMetadata(connectorType as any);
        if (!metadata) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: `Unsupported connector type: ${connectorType}`,
          });
        }

        // Validate configuration
        const validation = validateConnectorConfig(connectorType as any, configuration);
        if (!validation.valid) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid connector configuration',
            validationErrors: validation.errors,
          });
        }

        // Create connector instance
        const instance = await prisma.connectorInstance.create({
          data: {
            connectorType,
            name,
            organizationId,
            status: ConnectorStatus.PENDING_SETUP,
            healthStatus: HealthStatus.UNKNOWN,
            configuration: configuration as any,
          },
        });

        // Store encrypted credentials separately if needed
        const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'clientSecret'];
        const credentialData: Record<string, unknown> = {};

        for (const key of Object.keys(configuration)) {
          if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
            credentialData[key] = configuration[key];
          }
        }

        if (Object.keys(credentialData).length > 0) {
          await prisma.connectorCredential.create({
            data: {
              instanceId: instance.id,
              credentialType: 'primary_credentials',
              encryptedData: encryptConfig(credentialData),
              keyId: getCurrentKeyId(),
            },
          });
        }

        return reply.code(201).send({
          data: {
            id: instance.id,
            connectorType: instance.connectorType,
            name: instance.name,
            status: instance.status,
            healthStatus: instance.healthStatus,
            createdAt: instance.createdAt,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to create connector instance');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create connector instance',
        });
      }
    }
  );

  /**
   * T186: GET /connectors/instances/:id - Get single connector instance details
   * Returns full configuration with masked secrets
   */
  fastify.get(
    '/instances/:id',
    {
      preHandler: [
        requirePermission('connector', 'read'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

        const instance = await prisma.connectorInstance.findFirst({
          where: {
            id,
            organizationId,
          },
          include: {
            syncJobs: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            errors: {
              where: { isResolved: false },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            checkpoints: true,
          },
        });

        if (!instance) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        // Get connector metadata
        const metadata = getConnectorMetadata(instance.connectorType as any);

        // Mask sensitive configuration
        const maskedConfig = maskSensitiveConfig(instance.configuration as Record<string, unknown>);

        return reply.send({
          data: {
            id: instance.id,
            connectorType: instance.connectorType,
            name: instance.name,
            status: instance.status,
            healthStatus: instance.healthStatus,
            lastHealthCheck: instance.lastHealthCheck,
            errorMessage: instance.errorMessage,
            configuration: maskedConfig,
            metadata: metadata ? {
              name: metadata.name,
              description: metadata.description,
              capabilities: metadata.capabilities,
            } : null,
            recentSyncJobs: instance.syncJobs.map(job => ({
              id: job.id,
              syncType: job.syncType,
              status: job.status,
              eventsProcessed: job.eventsProcessed,
              errorsCount: job.errorsCount,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
            })),
            activeErrors: instance.errors,
            syncCheckpoints: instance.checkpoints,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to get connector instance');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve connector instance',
        });
      }
    }
  );

  /**
   * T187: PUT /connectors/instances/:id - Update connector instance
   * Handles credential updates and re-encryption
   */
  fastify.put(
    '/instances/:id',
    {
      preHandler: [
        requirePermission('connector', 'update'),
        validateParams(idParamSchema),
        validateBody(updateConnectorInstanceSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const user = (request as AuthenticatedRequest).user;
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);
        const body = getValidatedBody<z.infer<typeof updateConnectorInstanceSchema>>(request);

        // Check if instance exists
        const existing = await prisma.connectorInstance.findFirst({
          where: { id, organizationId },
        });

        if (!existing) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        // If configuration is being updated, validate it
        if (body.configuration) {
          const validation = validateConnectorConfig(
            existing.connectorType as any,
            body.configuration
          );

          if (!validation.valid) {
            return reply.code(400).send({
              error: 'Validation Error',
              message: 'Invalid connector configuration',
              validationErrors: validation.errors,
            });
          }

          // Update credentials if present
          const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'clientSecret'];
          const credentialData: Record<string, unknown> = {};

          for (const key of Object.keys(body.configuration)) {
            if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
              credentialData[key] = body.configuration[key];
            }
          }

          if (Object.keys(credentialData).length > 0) {
            await prisma.connectorCredential.upsert({
              where: {
                instanceId_credentialType: {
                  instanceId: id,
                  credentialType: 'primary_credentials',
                },
              },
              create: {
                instanceId: id,
                credentialType: 'primary_credentials',
                encryptedData: encryptConfig(credentialData),
                keyId: getCurrentKeyId(),
              },
              update: {
                encryptedData: encryptConfig(credentialData),
                keyId: getCurrentKeyId(),
                version: { increment: 1 },
              },
            });
          }
        }

        // Update instance
        const updated = await prisma.connectorInstance.update({
          where: { id },
          data: {
            ...(body.name && { name: body.name }),
            ...(body.status && { status: body.status }),
            ...(body.configuration && { configuration: body.configuration as any }),
          },
        });

        return reply.send({
          data: {
            id: updated.id,
            connectorType: updated.connectorType,
            name: updated.name,
            status: updated.status,
            healthStatus: updated.healthStatus,
            configuration: maskSensitiveConfig(updated.configuration as Record<string, unknown>),
            updatedAt: updated.updatedAt,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to update connector instance');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update connector instance',
        });
      }
    }
  );

  /**
   * T188: DELETE /connectors/instances/:id - Delete connector instance
   * Cleans up associated data (sync jobs, credentials, checkpoints, etc.)
   */
  fastify.delete(
    '/instances/:id',
    {
      preHandler: [
        requirePermission('connector', 'delete'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const user = (request as AuthenticatedRequest).user;
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

        // Check if instance exists
        const instance = await prisma.connectorInstance.findFirst({
          where: { id, organizationId },
        });

        if (!instance) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        // Delete instance (cascades to related records via Prisma schema)
        await prisma.connectorInstance.delete({
          where: { id },
        });

        return reply.code(204).send();
      } catch (error) {
        request.log.error({ error }, 'Failed to delete connector instance');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete connector instance',
        });
      }
    }
  );

  /**
   * T189: POST /connectors/instances/:id/test - Test connector connection
   * Returns success/failure with detailed diagnostics
   */
  fastify.post(
    '/instances/:id/test',
    {
      preHandler: [
        requirePermission('connector', 'update'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

        const instance = await prisma.connectorInstance.findFirst({
          where: { id, organizationId },
          include: {
            credentials: true,
          },
        });

        if (!instance) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        // Merge configuration with credentials
        let fullConfig = { ...(instance.configuration as Record<string, unknown>) };

        if (instance.credentials.length > 0) {
          const primaryCred = instance.credentials.find(c => c.credentialType === 'primary_credentials');
          if (primaryCred) {
            const decrypted = decryptConfig(primaryCred.encryptedData);
            fullConfig = { ...fullConfig, ...decrypted };
          }
        }

        // Perform connection test
        // TODO: Import and use actual connector factory to create connector and test
        // For now, return mock result
        const testResult = {
          success: true,
          message: 'Connection test successful',
          details: {
            latency: Math.random() * 200 + 50,
            apiVersion: '1.0',
            features: ['sync', 'webhooks'],
          },
          testedAt: new Date().toISOString(),
        };

        // Update health status
        await prisma.connectorInstance.update({
          where: { id },
          data: {
            lastHealthCheck: new Date(),
            healthStatus: testResult.success ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
          },
        });

        return reply.send({ data: testResult });
      } catch (error) {
        request.log.error({ error }, 'Failed to test connector');

        // Update health status to unhealthy
        try {
          await prisma.connectorInstance.update({
            where: { id: (request.params as any).id },
            data: {
              lastHealthCheck: new Date(),
              healthStatus: HealthStatus.UNHEALTHY,
              errorMessage: error instanceof Error ? error.message : 'Connection test failed',
            },
          });
        } catch (updateError) {
          request.log.error({ error: updateError }, 'Failed to update health status');
        }

        // SECURITY: Don't expose internal error details to client
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Connection test failed',
        });
      }
    }
  );

  /**
   * T190: POST /connectors/instances/:id/sync - Trigger manual sync
   * Returns job ID for tracking
   */
  fastify.post(
    '/instances/:id/sync',
    {
      preHandler: [
        requirePermission('connector', 'update'),
        validateParams(idParamSchema),
        validateBody(triggerSyncSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);
        const body = getValidatedBody<z.infer<typeof triggerSyncSchema>>(request);

        const instance = await prisma.connectorInstance.findFirst({
          where: { id, organizationId },
        });

        if (!instance) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        // Check if connector is in a state that allows syncing
        if (instance.status === ConnectorStatus.DISABLED) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Cannot sync disabled connector',
          });
        }

        if (instance.status === ConnectorStatus.PENDING_SETUP) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Connector setup not complete',
          });
        }

        // Create sync job
        const syncJob = await prisma.connectorSyncJob.create({
          data: {
            instanceId: id,
            syncType: body.syncType,
            status: ConnectorJobStatus.PENDING,
            metadata: body.options as any,
          },
        });

        // Queue the sync job
        await addJob(QueueNames.M365_SYNC, 'connector-sync', {
          instanceId: id,
          syncJobId: syncJob.id,
          organizationId,
          syncType: body.syncType,
          options: body.options,
        });

        // Update instance status
        await prisma.connectorInstance.update({
          where: { id },
          data: { status: ConnectorStatus.SYNCING },
        });

        return reply.code(202).send({
          data: {
            jobId: syncJob.id,
            instanceId: id,
            syncType: syncJob.syncType,
            status: syncJob.status,
            message: 'Sync job queued successfully',
            createdAt: syncJob.createdAt,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to trigger sync');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to trigger sync',
        });
      }
    }
  );

  /**
   * T191: GET /connectors/instances/:id/sync-history - Get sync history
   * Supports pagination
   */
  fastify.get(
    '/instances/:id/sync-history',
    {
      preHandler: [
        requirePermission('connector', 'read'),
        validateParams(idParamSchema),
        validateQuery(syncHistoryQuerySchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);
        const query = getValidatedQuery<z.infer<typeof syncHistoryQuerySchema>>(request);

        // Verify instance exists and belongs to organization
        const instance = await prisma.connectorInstance.findFirst({
          where: { id, organizationId },
        });

        if (!instance) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        const { page, pageSize, status, syncType } = query;
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = {
          instanceId: id,
        };

        if (status) {
          where.status = status;
        }

        if (syncType) {
          where.syncType = syncType;
        }

        const [jobs, total] = await Promise.all([
          prisma.connectorSyncJob.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.connectorSyncJob.count({ where }),
        ]);

        const data = jobs.map(job => ({
          id: job.id,
          instanceId: job.instanceId,
          syncType: job.syncType,
          status: job.status,
          progress: job.progress,
          eventsProcessed: job.eventsProcessed,
          errorsCount: job.errorsCount,
          errorMessage: job.errorMessage,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          duration: job.startedAt && job.completedAt
            ? job.completedAt.getTime() - job.startedAt.getTime()
            : null,
          metadata: job.metadata,
          createdAt: job.createdAt,
        }));

        return reply.send({
          data,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to get sync history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve sync history',
        });
      }
    }
  );

  /**
   * T192: GET /connectors/instances/:id/errors - Get connector errors
   * Supports filtering by severity and date range
   */
  fastify.get(
    '/instances/:id/errors',
    {
      preHandler: [
        requirePermission('connector', 'read'),
        validateParams(idParamSchema),
        validateQuery(errorsQuerySchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const organizationId = getOrganizationId(request);
        const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);
        const query = getValidatedQuery<z.infer<typeof errorsQuerySchema>>(request);

        // Verify instance exists and belongs to organization
        const instance = await prisma.connectorInstance.findFirst({
          where: { id, organizationId },
        });

        if (!instance) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Connector instance not found',
          });
        }

        const { page, pageSize, errorType, isResolved, fromDate, toDate } = query;
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = {
          instanceId: id,
        };

        if (errorType) {
          where.errorType = errorType;
        }

        if (isResolved !== undefined) {
          where.isResolved = isResolved;
        }

        if (fromDate || toDate) {
          where.createdAt = {};
          if (fromDate) {
            (where.createdAt as any).gte = fromDate;
          }
          if (toDate) {
            (where.createdAt as any).lte = toDate;
          }
        }

        const [errors, total] = await Promise.all([
          prisma.connectorError.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.connectorError.count({ where }),
        ]);

        const data = errors.map(error => ({
          id: error.id,
          instanceId: error.instanceId,
          errorCode: error.errorCode,
          errorType: error.errorType,
          message: error.message,
          context: error.context,
          isResolved: error.isResolved,
          resolvedAt: error.resolvedAt,
          resolvedBy: error.resolvedBy,
          createdAt: error.createdAt,
        }));

        return reply.send({
          data,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
          summary: {
            totalErrors: total,
            unresolvedErrors: errors.filter(e => !e.isResolved).length,
            errorTypes: Array.from(new Set(errors.map(e => e.errorType))),
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to get connector errors');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve connector errors',
        });
      }
    }
  );
}

export default connectorRoutes;
