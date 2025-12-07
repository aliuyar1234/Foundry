/**
 * Data Preparation API Routes
 * Entity record management, duplicate detection, and data export endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import {
  EntityRecordService,
  createEntityRecordService,
  EntityType,
  EntityStatus,
} from '../../services/preparation/entityRecordService.js';
import {
  GoldenRecordMerger,
  createGoldenRecordMerger,
} from '../../services/preparation/goldenRecordMerger.js';
import { calculateDetailedQualityScore } from '../../services/preparation/qualityScorer.js';
import {
  exportToSAPB1,
  exportToOdoo,
  exportToDynamics365,
  ExportFormat,
} from '../../services/preparation/exporters/index.js';
import {
  enrichCompany,
  enrichCompanies,
  previewEnrichment,
  verifyVatId,
  getEnrichmentStats,
  EnrichmentField,
} from '../../services/enrichment/companyEnricher.js';
import {
  AddressValidator,
  createAddressValidator,
} from '../../services/enrichment/addressValidator.js';
import {
  createEnrichmentQueue,
  queueEnrichmentJob,
  getEnrichmentJobStatus,
  getActiveEnrichmentJobs,
  cancelEnrichmentJob,
} from '../../jobs/processors/externalEnrichmentProcessor.js';

// Validation schemas
const entityTypeSchema = z.enum(['person', 'company', 'address', 'product', 'contact']);
const entityStatusSchema = z.enum(['active', 'pending_review', 'duplicate', 'merged', 'deleted', 'golden']);

const queryEntityRecordsSchema = z.object({
  entityTypes: z.array(entityTypeSchema).optional(),
  statuses: z.array(entityStatusSchema).optional(),
  sourceIds: z.array(z.string().uuid()).optional(),
  minQualityScore: z.number().min(0).max(100).optional(),
  maxQualityScore: z.number().min(0).max(100).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'qualityScore']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createEntityRecordSchema = z.object({
  entityType: entityTypeSchema,
  sourceId: z.string().uuid(),
  externalId: z.string().min(1).max(255),
  data: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

const updateEntityRecordSchema = z.object({
  data: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: entityStatusSchema.optional(),
});

const getDuplicatesSchema = z.object({
  entityType: entityTypeSchema.optional(),
  status: z.enum(['pending', 'confirmed', 'rejected', 'merged']).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const mergeRecordsSchema = z.object({
  groupId: z.string().uuid().optional(),
  recordIds: z.array(z.string().uuid()).min(2),
  targetRecordId: z.string().uuid().optional(),
  fieldStrategies: z.record(z.enum([
    'highest_quality',
    'most_recent',
    'most_complete',
    'majority',
    'concatenate',
    'sum',
    'average',
    'min',
    'max',
    'first',
  ])).optional(),
  preview: z.boolean().default(false),
});

const exportDataSchema = z.object({
  format: z.enum(['sap_b1', 'odoo', 'dynamics_365']),
  entityTypes: z.array(entityTypeSchema).optional(),
  statuses: z.array(entityStatusSchema).default(['active', 'golden']),
  includeMetadata: z.boolean().default(false),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export default async function preparationRoutes(fastify: FastifyInstance): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
  const prisma = new PrismaClient();
  const entityRecordService = createEntityRecordService(pool, prisma);
  const goldenRecordMerger = createGoldenRecordMerger(pool, prisma);

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  /**
   * GET /organizations/:organizationId/preparation/entity-records
   * List entity records with filtering
   */
  fastify.get<{
    Params: { organizationId: string };
    Querystring: z.infer<typeof queryEntityRecordsSchema>;
  }>(
    '/organizations/:organizationId/preparation/entity-records',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        querystring: queryEntityRecordsSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const options = queryEntityRecordsSchema.parse(request.query);

      const records = await entityRecordService.queryEntityRecords(organizationId, {
        entityTypes: options.entityTypes as EntityType[],
        statuses: options.statuses as EntityStatus[],
        sourceIds: options.sourceIds,
        minQualityScore: options.minQualityScore,
        maxQualityScore: options.maxQualityScore,
        search: options.search,
        limit: options.limit,
        offset: options.offset,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
      });

      // Get total count for pagination
      const stats = await entityRecordService.getEntityStats(organizationId);

      return reply.send({
        data: records,
        pagination: {
          total: stats.total,
          limit: options.limit,
          offset: options.offset,
          hasMore: options.offset + records.length < stats.total,
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/entity-records/:recordId
   * Get a single entity record by ID
   */
  fastify.get<{
    Params: { organizationId: string; recordId: string };
  }>(
    '/organizations/:organizationId/preparation/entity-records/:recordId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          recordId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { recordId } = request.params;

      const record = await entityRecordService.getEntityRecord(recordId);

      if (!record) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Entity record not found',
        });
      }

      // Calculate detailed quality score
      const qualityDetails = calculateDetailedQualityScore(
        record.data,
        record.entityType
      );

      return reply.send({
        data: {
          ...record,
          qualityDetails,
        },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/entity-records
   * Create a new entity record
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: z.infer<typeof createEntityRecordSchema>;
  }>(
    '/organizations/:organizationId/preparation/entity-records',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: createEntityRecordSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const input = createEntityRecordSchema.parse(request.body);

      const record = await entityRecordService.createEntityRecord(organizationId, {
        entityType: input.entityType,
        sourceId: input.sourceId,
        externalId: input.externalId,
        data: input.data as Record<string, unknown>,
        metadata: input.metadata as Record<string, unknown>,
      });

      return reply.status(201).send({ data: record });
    }
  );

  /**
   * PATCH /organizations/:organizationId/preparation/entity-records/:recordId
   * Update an entity record
   */
  fastify.patch<{
    Params: { organizationId: string; recordId: string };
    Body: z.infer<typeof updateEntityRecordSchema>;
  }>(
    '/organizations/:organizationId/preparation/entity-records/:recordId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          recordId: z.string().uuid(),
        }),
        body: updateEntityRecordSchema,
      },
    },
    async (request, reply) => {
      const { recordId } = request.params;
      const updates = updateEntityRecordSchema.parse(request.body);

      const record = await entityRecordService.updateEntityRecord(recordId, {
        data: updates.data as Record<string, unknown>,
        metadata: updates.metadata as Record<string, unknown>,
      });

      if (updates.status) {
        await entityRecordService.updateStatus(recordId, updates.status);
      }

      return reply.send({ data: record });
    }
  );

  /**
   * DELETE /organizations/:organizationId/preparation/entity-records/:recordId
   * Soft delete an entity record
   */
  fastify.delete<{
    Params: { organizationId: string; recordId: string };
  }>(
    '/organizations/:organizationId/preparation/entity-records/:recordId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          recordId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { recordId } = request.params;

      await entityRecordService.updateStatus(recordId, 'deleted');

      return reply.status(204).send();
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/entity-records/stats
   * Get entity record statistics
   */
  fastify.get<{
    Params: { organizationId: string };
  }>(
    '/organizations/:organizationId/preparation/entity-records/stats',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;

      const stats = await entityRecordService.getEntityStats(organizationId);

      return reply.send({ data: stats });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/duplicates
   * List duplicate groups
   */
  fastify.get<{
    Params: { organizationId: string };
    Querystring: z.infer<typeof getDuplicatesSchema>;
  }>(
    '/organizations/:organizationId/preparation/duplicates',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        querystring: getDuplicatesSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const options = getDuplicatesSchema.parse(request.query);

      // Query duplicate groups from database
      let query = `
        SELECT
          id,
          organization_id,
          entity_type,
          record_ids,
          confidence,
          suggested_golden_record_id,
          matching_fields,
          status,
          created_at,
          updated_at
        FROM duplicate_groups
        WHERE organization_id = $1
      `;
      const params: unknown[] = [organizationId];
      let paramIndex = 2;

      if (options.entityType) {
        query += ` AND entity_type = $${paramIndex}`;
        params.push(options.entityType);
        paramIndex++;
      }

      if (options.status) {
        query += ` AND status = $${paramIndex}`;
        params.push(options.status);
        paramIndex++;
      }

      if (options.minConfidence !== undefined) {
        query += ` AND confidence >= $${paramIndex}`;
        params.push(options.minConfidence);
        paramIndex++;
      }

      query += ` ORDER BY confidence DESC, created_at DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(options.limit, options.offset);

      const result = await pool.query(query, params);

      // Get record details for each group
      const groups = await Promise.all(
        result.rows.map(async (row) => {
          const recordIds = JSON.parse(row.record_ids);
          const records = await Promise.all(
            recordIds.map((id: string) => entityRecordService.getEntityRecord(id))
          );

          return {
            id: row.id,
            organizationId: row.organization_id,
            entityType: row.entity_type,
            confidence: row.confidence,
            suggestedGoldenRecordId: row.suggested_golden_record_id,
            matchingFields: JSON.parse(row.matching_fields),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            records: records.filter(Boolean),
          };
        })
      );

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM duplicate_groups
        WHERE organization_id = $1
        ${options.entityType ? `AND entity_type = '${options.entityType}'` : ''}
        ${options.status ? `AND status = '${options.status}'` : ''}
        ${options.minConfidence !== undefined ? `AND confidence >= ${options.minConfidence}` : ''}
      `;
      const countResult = await pool.query(countQuery, [organizationId]);
      const total = parseInt(countResult.rows[0].total, 10);

      return reply.send({
        data: groups,
        pagination: {
          total,
          limit: options.limit,
          offset: options.offset,
          hasMore: options.offset + groups.length < total,
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/duplicates/:groupId
   * Get a single duplicate group with full details
   */
  fastify.get<{
    Params: { organizationId: string; groupId: string };
  }>(
    '/organizations/:organizationId/preparation/duplicates/:groupId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          groupId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, groupId } = request.params;

      const query = `
        SELECT *
        FROM duplicate_groups
        WHERE id = $1 AND organization_id = $2
      `;
      const result = await pool.query(query, [groupId, organizationId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Duplicate group not found',
        });
      }

      const row = result.rows[0];
      const recordIds = JSON.parse(row.record_ids);
      const records = await Promise.all(
        recordIds.map((id: string) => entityRecordService.getEntityRecord(id))
      );

      // Add quality details to each record
      const recordsWithQuality = records.filter(Boolean).map((record) => ({
        ...record,
        qualityDetails: calculateDetailedQualityScore(record!.data, record!.entityType),
      }));

      return reply.send({
        data: {
          id: row.id,
          organizationId: row.organization_id,
          entityType: row.entity_type,
          confidence: row.confidence,
          suggestedGoldenRecordId: row.suggested_golden_record_id,
          matchingFields: JSON.parse(row.matching_fields),
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          records: recordsWithQuality,
        },
      });
    }
  );

  /**
   * PATCH /organizations/:organizationId/preparation/duplicates/:groupId
   * Update duplicate group status
   */
  fastify.patch<{
    Params: { organizationId: string; groupId: string };
    Body: { status: 'confirmed' | 'rejected' };
  }>(
    '/organizations/:organizationId/preparation/duplicates/:groupId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          groupId: z.string().uuid(),
        }),
        body: z.object({
          status: z.enum(['confirmed', 'rejected']),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId, groupId } = request.params;
      const { status } = request.body;

      const query = `
        UPDATE duplicate_groups
        SET status = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
        RETURNING *
      `;
      const result = await pool.query(query, [status, groupId, organizationId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Duplicate group not found',
        });
      }

      return reply.send({
        data: {
          id: result.rows[0].id,
          status: result.rows[0].status,
          updatedAt: result.rows[0].updated_at,
        },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/merge
   * Merge duplicate records into a golden record
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: z.infer<typeof mergeRecordsSchema>;
  }>(
    '/organizations/:organizationId/preparation/merge',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: mergeRecordsSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const mergeRequest = mergeRecordsSchema.parse(request.body);

      // Get the records to merge
      const records = await Promise.all(
        mergeRequest.recordIds.map((id) => entityRecordService.getEntityRecord(id))
      );

      const validRecords = records.filter(Boolean);
      if (validRecords.length < 2) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'At least 2 valid records are required for merging',
        });
      }

      // Verify all records belong to the same organization and entity type
      const entityTypes = new Set(validRecords.map((r) => r!.entityType));
      if (entityTypes.size > 1) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'All records must be of the same entity type',
        });
      }

      // Check if preview mode
      if (mergeRequest.preview) {
        const preview = await goldenRecordMerger.previewMerge({
          recordIds: mergeRequest.recordIds,
          targetRecordId: mergeRequest.targetRecordId,
          fieldStrategies: mergeRequest.fieldStrategies,
        });

        return reply.send({ data: preview });
      }

      // Perform the actual merge
      const result = await goldenRecordMerger.mergeRecords({
        recordIds: mergeRequest.recordIds,
        targetRecordId: mergeRequest.targetRecordId,
        fieldStrategies: mergeRequest.fieldStrategies,
      });

      // Update duplicate group status if provided
      if (mergeRequest.groupId) {
        await pool.query(
          `UPDATE duplicate_groups SET status = 'merged', updated_at = NOW() WHERE id = $1`,
          [mergeRequest.groupId]
        );
      }

      return reply.send({ data: result });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/merge/:mergeId/undo
   * Undo a merge operation
   */
  fastify.post<{
    Params: { organizationId: string; mergeId: string };
  }>(
    '/organizations/:organizationId/preparation/merge/:mergeId/undo',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          mergeId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { mergeId } = request.params;

      const undone = await goldenRecordMerger.undoMerge(mergeId);

      if (!undone) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Merge operation not found or cannot be undone',
        });
      }

      return reply.send({
        data: { message: 'Merge operation undone successfully' },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/export
   * Export entity records to ERP format
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: z.infer<typeof exportDataSchema>;
  }>(
    '/organizations/:organizationId/preparation/export',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: exportDataSchema,
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const exportOptions = exportDataSchema.parse(request.body);

      // Fetch records to export
      const records = await entityRecordService.queryEntityRecords(organizationId, {
        entityTypes: exportOptions.entityTypes as EntityType[],
        statuses: exportOptions.statuses as EntityStatus[],
        limit: 10000, // Maximum export size
      });

      // Filter by date range if specified
      let filteredRecords = records;
      if (exportOptions.dateFrom || exportOptions.dateTo) {
        const fromDate = exportOptions.dateFrom ? new Date(exportOptions.dateFrom) : new Date(0);
        const toDate = exportOptions.dateTo ? new Date(exportOptions.dateTo) : new Date();

        filteredRecords = records.filter((r) => {
          const recordDate = new Date(r.updatedAt);
          return recordDate >= fromDate && recordDate <= toDate;
        });
      }

      // Export based on format
      let exportResult: {
        format: ExportFormat;
        data: unknown;
        recordCount: number;
        exportedAt: string;
      };

      switch (exportOptions.format) {
        case 'sap_b1':
          exportResult = await exportToSAPB1(filteredRecords, {
            includeMetadata: exportOptions.includeMetadata,
          });
          break;
        case 'odoo':
          exportResult = await exportToOdoo(filteredRecords, {
            includeMetadata: exportOptions.includeMetadata,
          });
          break;
        case 'dynamics_365':
          exportResult = await exportToDynamics365(filteredRecords, {
            includeMetadata: exportOptions.includeMetadata,
          });
          break;
        default:
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Unsupported export format: ${exportOptions.format}`,
          });
      }

      return reply.send({ data: exportResult });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/export/formats
   * Get available export formats
   */
  fastify.get<{
    Params: { organizationId: string };
  }>(
    '/organizations/:organizationId/preparation/export/formats',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
      },
    },
    async (_request, reply) => {
      return reply.send({
        data: [
          {
            id: 'sap_b1',
            name: 'SAP Business One',
            description: 'Export to SAP B1 Data Import format',
            supportedEntityTypes: ['person', 'company', 'address', 'product'],
            fileFormat: 'json',
          },
          {
            id: 'odoo',
            name: 'Odoo',
            description: 'Export to Odoo external ID format',
            supportedEntityTypes: ['person', 'company', 'address', 'product'],
            fileFormat: 'json',
          },
          {
            id: 'dynamics_365',
            name: 'Microsoft Dynamics 365',
            description: 'Export to Dynamics 365 Web API format',
            supportedEntityTypes: ['person', 'company', 'address', 'product'],
            fileFormat: 'json',
          },
        ],
      });
    }
  );

  // ==========================================
  // External Data Enrichment Endpoints (T310-T311)
  // ==========================================

  // Initialize enrichment queue
  const enrichmentQueue = createEnrichmentQueue({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  /**
   * POST /organizations/:organizationId/preparation/enrich
   * Enrich entity records with external data
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      entityIds: string[];
      entityType: 'company' | 'organization' | 'supplier' | 'customer';
      fields?: string[];
      overwriteExisting?: boolean;
      async?: boolean;
    };
  }>(
    '/organizations/:organizationId/preparation/enrich',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: z.object({
          entityIds: z.array(z.string()).min(1).max(1000),
          entityType: z.enum(['company', 'organization', 'supplier', 'customer']),
          fields: z.array(z.string()).optional(),
          overwriteExisting: z.boolean().optional().default(false),
          async: z.boolean().optional().default(false),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { entityIds, entityType, fields, overwriteExisting, async: runAsync } = request.body;

      // For large batches or explicit async, queue the job
      if (runAsync || entityIds.length > 10) {
        const jobId = await queueEnrichmentJob(enrichmentQueue, {
          organizationId,
          jobType: entityIds.length > 1 ? 'bulk_company' : 'company',
          entityIds,
          entityType,
          fields: (fields || ['all']) as EnrichmentField[],
          options: { overwriteExisting },
          requestedBy: (request as any).user?.id || 'api',
        });

        return reply.status(202).send({
          success: true,
          data: {
            jobId,
            status: 'queued',
            message: `Enrichment job queued for ${entityIds.length} entities`,
          },
        });
      }

      // Synchronous enrichment for small batches
      if (entityIds.length === 1) {
        const result = await enrichCompany(organizationId, {
          entityId: entityIds[0],
          entityType,
          fields: (fields || ['all']) as EnrichmentField[],
          overwriteExisting,
        });

        return reply.send({
          success: true,
          data: result,
        });
      }

      // Small batch synchronous
      const results = await enrichCompanies(organizationId, {
        entityIds,
        entityType,
        fields: (fields || ['all']) as EnrichmentField[],
        continueOnError: true,
      });

      return reply.send({
        success: true,
        data: results,
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/enrich/preview
   * Preview enrichment without applying changes
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      entityId: string;
      entityType: 'company' | 'organization' | 'supplier' | 'customer';
      fields?: string[];
    };
  }>(
    '/organizations/:organizationId/preparation/enrich/preview',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: z.object({
          entityId: z.string(),
          entityType: z.enum(['company', 'organization', 'supplier', 'customer']),
          fields: z.array(z.string()).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { entityId, entityType, fields } = request.body;

      const preview = await previewEnrichment(organizationId, {
        entityId,
        entityType,
        fields: (fields || ['all']) as EnrichmentField[],
      });

      return reply.send({
        success: true,
        data: preview,
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/enrich/validate-vat
   * Validate a VAT ID against external registry
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: { vatId: string };
  }>(
    '/organizations/:organizationId/preparation/enrich/validate-vat',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: z.object({
          vatId: z.string().min(4).max(20),
        }),
      },
    },
    async (request, reply) => {
      const { vatId } = request.body;

      const result = await verifyVatId(vatId);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/enrich/validate-address
   * Validate and standardize an address
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      street?: string;
      houseNumber?: string;
      postalCode?: string;
      city?: string;
      country?: string;
      countryCode?: string;
      fullAddress?: string;
    };
  }>(
    '/organizations/:organizationId/preparation/enrich/validate-address',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: z.object({
          street: z.string().optional(),
          houseNumber: z.string().optional(),
          postalCode: z.string().optional(),
          city: z.string().optional(),
          country: z.string().optional(),
          countryCode: z.string().max(2).optional(),
          fullAddress: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const address = request.body;

      const validator = createAddressValidator(address.countryCode);
      const result = await validator.validate(address);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * POST /organizations/:organizationId/preparation/enrich/validate-addresses
   * Batch validate addresses
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      entityIds: string[];
      entityType: 'company' | 'organization' | 'supplier' | 'customer';
      validateOnly?: boolean;
      async?: boolean;
    };
  }>(
    '/organizations/:organizationId/preparation/enrich/validate-addresses',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: z.object({
          entityIds: z.array(z.string()).min(1).max(1000),
          entityType: z.enum(['company', 'organization', 'supplier', 'customer']),
          validateOnly: z.boolean().optional().default(true),
          async: z.boolean().optional().default(false),
        }),
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { entityIds, entityType, validateOnly, async: runAsync } = request.body;

      // Queue for async or large batches
      if (runAsync || entityIds.length > 20) {
        const jobId = await queueEnrichmentJob(enrichmentQueue, {
          organizationId,
          jobType: 'bulk_address',
          entityIds,
          entityType,
          options: { validateOnly },
          requestedBy: (request as any).user?.id || 'api',
        });

        return reply.status(202).send({
          success: true,
          data: {
            jobId,
            status: 'queued',
            message: `Address validation job queued for ${entityIds.length} entities`,
          },
        });
      }

      // Synchronous for small batches
      const validator = createAddressValidator();
      const results = [];

      for (const entityId of entityIds) {
        const entity = await prisma.entityRecord.findFirst({
          where: { id: entityId, organizationId },
        });

        if (entity) {
          const data = entity.data as Record<string, unknown>;
          const result = await validator.validate({
            street: data.street as string,
            houseNumber: data.houseNumber as string,
            postalCode: data.postalCode as string,
            city: data.city as string,
            country: data.country as string,
            countryCode: data.countryCode as string,
          });
          results.push({ entityId, ...result });
        }
      }

      return reply.send({
        success: true,
        data: results,
      });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/enrichment-status
   * Get enrichment status and statistics
   */
  fastify.get<{
    Params: { organizationId: string };
  }>(
    '/organizations/:organizationId/preparation/enrichment-status',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;

      const [stats, activeJobs] = await Promise.all([
        getEnrichmentStats(organizationId),
        getActiveEnrichmentJobs(enrichmentQueue, organizationId),
      ]);

      return reply.send({
        success: true,
        data: {
          statistics: stats,
          activeJobs: activeJobs.map((j) => ({
            jobId: j.jobId,
            status: j.status.status,
            progress: j.status.progress,
            processedCount: j.status.processedCount,
            totalCount: j.status.totalCount,
            estimatedCompletion: j.status.estimatedCompletion,
          })),
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/enrichment-status/:jobId
   * Get status of a specific enrichment job
   */
  fastify.get<{
    Params: { organizationId: string; jobId: string };
  }>(
    '/organizations/:organizationId/preparation/enrichment-status/:jobId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          jobId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { jobId } = request.params;

      const status = getEnrichmentJobStatus(jobId);

      if (!status) {
        return reply.status(404).send({
          success: false,
          error: 'Job not found',
        });
      }

      return reply.send({
        success: true,
        data: status,
      });
    }
  );

  /**
   * DELETE /organizations/:organizationId/preparation/enrichment-status/:jobId
   * Cancel a pending enrichment job
   */
  fastify.delete<{
    Params: { organizationId: string; jobId: string };
  }>(
    '/organizations/:organizationId/preparation/enrichment-status/:jobId',
    {
      schema: {
        params: z.object({
          organizationId: z.string().uuid(),
          jobId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { jobId } = request.params;

      const cancelled = await cancelEnrichmentJob(enrichmentQueue, jobId);

      if (!cancelled) {
        return reply.status(400).send({
          success: false,
          error: 'Job cannot be cancelled (may be already running or completed)',
        });
      }

      return reply.send({
        success: true,
        data: { message: 'Job cancelled successfully' },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/preparation/enrichment-sources
   * Get available enrichment data sources
   */
  fastify.get<{
    Params: { organizationId: string };
  }>(
    '/organizations/:organizationId/preparation/enrichment-sources',
    {
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
      },
    },
    async (_request, reply) => {
      return reply.send({
        success: true,
        data: [
          {
            id: 'firmenbuch_at',
            name: 'Firmenbuch (Austria)',
            country: 'AT',
            dataTypes: ['registration', 'executives', 'capital', 'status'],
            description: 'Austrian company registry',
          },
          {
            id: 'handelsregister_de',
            name: 'Handelsregister (Germany)',
            country: 'DE',
            dataTypes: ['registration', 'executives', 'capital', 'status'],
            description: 'German company registry',
          },
          {
            id: 'zefix_ch',
            name: 'Zefix (Switzerland)',
            country: 'CH',
            dataTypes: ['registration', 'executives', 'capital', 'status'],
            description: 'Swiss company registry',
          },
          {
            id: 'companies_house_uk',
            name: 'Companies House (UK)',
            country: 'GB',
            dataTypes: ['registration', 'executives', 'shareholders', 'status'],
            description: 'UK company registry',
          },
          {
            id: 'open_corporates',
            name: 'OpenCorporates',
            country: 'Global',
            dataTypes: ['registration', 'status'],
            description: 'Global company data aggregator',
          },
        ],
      });
    }
  );
}
