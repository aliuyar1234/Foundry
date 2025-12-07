/**
 * DataSource Routes
 * API endpoints for data source management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DataSourceType, DataSourceStatus } from '@prisma/client';
import { prisma } from '../../server.js';
import { createDataSourceService } from '../../services/dataSources/dataSourceService.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { organizationContext, getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateBody, validateQuery, validateParams, getValidatedBody, getValidatedQuery, getValidatedParams } from '../middleware/validation.js';
import { addJob, QueueNames } from '../../jobs/queue.js';

// Validation schemas
const createDataSourceSchema = z.object({
  type: z.nativeEnum(DataSourceType),
  name: z.string().min(1).max(100),
  config: z.record(z.unknown()).optional(),
  syncSchedule: z.string().optional(),
});

const updateDataSourceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  syncSchedule: z.string().nullable().optional(),
  status: z.nativeEnum(DataSourceStatus).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'type', 'status', 'createdAt', 'lastSyncAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  type: z.nativeEnum(DataSourceType).optional(),
  status: z.nativeEnum(DataSourceStatus).optional(),
  search: z.string().optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

export async function dataSourceRoutes(fastify: FastifyInstance) {
  const dataSourceService = createDataSourceService(prisma);

  // Apply authentication and organization context to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', organizationContext);

  /**
   * GET /data-sources - List data sources
   */
  fastify.get(
    '/',
    {
      preHandler: [
        requirePermission('dataSource', 'read'),
        validateQuery(listQuerySchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const query = getValidatedQuery<z.infer<typeof listQuerySchema>>(request);

      const result = await dataSourceService.list(organizationId, {
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        filters: {
          type: query.type,
          status: query.status,
          search: query.search,
        },
      });

      return reply.send(result);
    }
  );

  /**
   * GET /data-sources/:id - Get a data source
   */
  fastify.get(
    '/:id',
    {
      preHandler: [
        requirePermission('dataSource', 'read'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

      const dataSource = await dataSourceService.getWithJobs(id, organizationId);

      if (!dataSource) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Data source not found',
        });
      }

      return reply.send({ data: dataSource });
    }
  );

  /**
   * POST /data-sources - Create a data source
   */
  fastify.post(
    '/',
    {
      preHandler: [
        requirePermission('dataSource', 'create'),
        validateBody(createDataSourceSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const user = (request as AuthenticatedRequest).user;
      const body = getValidatedBody<z.infer<typeof createDataSourceSchema>>(request);

      const dataSource = await dataSourceService.create(
        {
          ...body,
          organizationId,
        },
        user.id
      );

      return reply.code(201).send({ data: dataSource });
    }
  );

  /**
   * PATCH /data-sources/:id - Update a data source
   */
  fastify.patch(
    '/:id',
    {
      preHandler: [
        requirePermission('dataSource', 'update'),
        validateParams(idParamSchema),
        validateBody(updateDataSourceSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const user = (request as AuthenticatedRequest).user;
      const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);
      const body = getValidatedBody<z.infer<typeof updateDataSourceSchema>>(request);

      const dataSource = await dataSourceService.update(
        id,
        organizationId,
        body,
        user.id
      );

      if (!dataSource) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Data source not found',
        });
      }

      return reply.send({ data: dataSource });
    }
  );

  /**
   * DELETE /data-sources/:id - Delete a data source
   */
  fastify.delete(
    '/:id',
    {
      preHandler: [
        requirePermission('dataSource', 'delete'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const user = (request as AuthenticatedRequest).user;
      const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

      const deleted = await dataSourceService.delete(id, organizationId, user.id);

      if (!deleted) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Data source not found',
        });
      }

      return reply.code(204).send();
    }
  );

  /**
   * POST /data-sources/:id/sync - Trigger a sync job
   */
  fastify.post(
    '/:id/sync',
    {
      preHandler: [
        requirePermission('dataSource', 'update'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

      const dataSource = await dataSourceService.getById(id, organizationId);

      if (!dataSource) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Data source not found',
        });
      }

      if (dataSource.status !== DataSourceStatus.CONNECTED) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Data source must be connected to trigger sync',
        });
      }

      // Create sync job
      const syncJob = await prisma.syncJob.create({
        data: {
          dataSourceId: id,
          status: 'PENDING',
        },
      });

      // Queue the sync job based on data source type
      const queueName = dataSource.type === 'M365' ? QueueNames.M365_SYNC : QueueNames.M365_SYNC;

      await addJob(queueName, 'sync', {
        dataSourceId: id,
        syncJobId: syncJob.id,
        organizationId,
      });

      return reply.code(202).send({
        data: {
          jobId: syncJob.id,
          status: 'PENDING',
          message: 'Sync job queued',
        },
      });
    }
  );

  /**
   * GET /data-sources/:id/jobs - Get sync jobs for a data source
   */
  fastify.get(
    '/:id/jobs',
    {
      preHandler: [
        requirePermission('dataSource', 'read'),
        validateParams(idParamSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { id } = getValidatedParams<z.infer<typeof idParamSchema>>(request);

      const dataSource = await dataSourceService.getById(id, organizationId);

      if (!dataSource) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Data source not found',
        });
      }

      const jobs = await prisma.syncJob.findMany({
        where: { dataSourceId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return reply.send({ data: jobs });
    }
  );
}
