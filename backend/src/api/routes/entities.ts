/**
 * Entity Management API Routes
 * SCALE Tier - Tasks T033-T039
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EntityService } from '../../services/multiTenant/entityService';
import { EntitySwitcherService } from '../../services/multiTenant/entitySwitcher';
import { CrossEntityQueryService } from '../../services/multiTenant/crossEntityQuery';
import { EntityIsolationService } from '../../services/multiTenant/entityIsolation';
import {
  requireEntityPermission,
  requireEntityAccess,
  getCurrentEntityId,
} from '../middleware/entityContext';
import {
  CreateEntityInput,
  UpdateEntityInput,
  ListEntitiesRequest,
  TenantStatus,
} from '@foundry/shared/types/entity';

// Request type definitions
interface ListEntitiesQuery {
  parentEntityId?: string;
  status?: TenantStatus;
  search?: string;
  includeChildren?: boolean;
  page?: number;
  pageSize?: number;
}

interface EntityParams {
  id: string;
}

interface CreateEntityBody extends CreateEntityInput {}
interface UpdateEntityBody extends UpdateEntityInput {}

export async function entityRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;

  // Initialize services
  const entityService = new EntityService({ prisma });
  const switcherService = new EntitySwitcherService({ prisma });
  const queryService = new CrossEntityQueryService({ prisma });
  const isolationService = new EntityIsolationService({ prisma });

  // ==========================================================================
  // T033: GET /entities - List entities
  // ==========================================================================
  fastify.get<{ Querystring: ListEntitiesQuery }>(
    '/entities',
    {
      preHandler: [requireEntityPermission('read')],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            parentEntityId: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] },
            search: { type: 'string' },
            includeChildren: { type: 'boolean' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const { parentEntityId, status, search, includeChildren, page, pageSize } =
        request.query;

      const result = await entityService.list({
        parentEntityId,
        status,
        search,
        includeChildren,
        page,
        pageSize,
      });

      return result;
    }
  );

  // ==========================================================================
  // T034: POST /entities - Create entity
  // ==========================================================================
  fastify.post<{ Body: CreateEntityBody }>(
    '/entities',
    {
      preHandler: [requireEntityPermission('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
            parentEntityId: { type: 'string' },
            configuration: { type: 'object' },
            dataRetentionDays: { type: 'integer', minimum: 30, maximum: 3650 },
            resellerId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const entity = await entityService.create(request.body);
      reply.code(201);
      return entity;
    }
  );

  // ==========================================================================
  // T035: GET /entities/:id - Get entity by ID
  // ==========================================================================
  fastify.get<{ Params: EntityParams }>(
    '/entities/:id',
    {
      preHandler: [requireEntityAccess('read')],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const entity = await entityService.getById(request.params.id);

      if (!entity) {
        reply.code(404);
        return { error: 'Entity not found' };
      }

      return entity;
    }
  );

  // ==========================================================================
  // T036: PUT /entities/:id - Update entity
  // ==========================================================================
  fastify.put<{ Params: EntityParams; Body: UpdateEntityBody }>(
    '/entities/:id',
    {
      preHandler: [requireEntityAccess('admin')],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            configuration: { type: 'object' },
            status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] },
            dataRetentionDays: { type: 'integer', minimum: 30, maximum: 3650 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const entity = await entityService.update(request.params.id, request.body);
        return entity;
      } catch (error: any) {
        if (error.code === 'ENTITY_NOT_FOUND') {
          reply.code(404);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  // ==========================================================================
  // T037: DELETE /entities/:id - Archive entity
  // ==========================================================================
  fastify.delete<{ Params: EntityParams }>(
    '/entities/:id',
    {
      preHandler: [requireEntityAccess('admin')],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const entity = await entityService.archive(request.params.id);
        return entity;
      } catch (error: any) {
        if (error.code === 'ENTITY_NOT_FOUND') {
          reply.code(404);
          return { error: error.message };
        }
        if (error.code === 'ENTITY_HAS_CHILDREN') {
          reply.code(400);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  // ==========================================================================
  // T038: GET /entities/:id/hierarchy - Get entity hierarchy
  // ==========================================================================
  fastify.get<{ Params: EntityParams }>(
    '/entities/:id/hierarchy',
    {
      preHandler: [requireEntityAccess('read')],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const hierarchy = await entityService.getWithHierarchy(request.params.id);

      if (!hierarchy) {
        reply.code(404);
        return { error: 'Entity not found' };
      }

      const path = await entityService.getEntityPath(request.params.id);

      return {
        entity: hierarchy,
        path,
      };
    }
  );

  // ==========================================================================
  // T039: GET /entities/:id/analytics - Cross-entity analytics
  // ==========================================================================
  fastify.get<{ Params: EntityParams; Querystring: { entityIds?: string } }>(
    '/entities/:id/analytics',
    {
      preHandler: [requireEntityAccess('read')],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            entityIds: {
              type: 'string',
              description: 'Comma-separated entity IDs for cross-entity analytics',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user?.id;
      if (!userId) {
        reply.code(401);
        return { error: 'Authentication required' };
      }

      // Parse entity IDs (either from query or just current entity)
      let entityIds: string[];
      if (request.query.entityIds) {
        entityIds = request.query.entityIds.split(',').map(id => id.trim());
      } else {
        entityIds = [request.params.id];
      }

      // Validate access to all requested entities
      await queryService.validateEntityAccess(userId, entityIds);

      // Get aggregated analytics
      const analytics = await queryService.getAggregatedMetrics({ entityIds });

      return analytics;
    }
  );

  // ==========================================================================
  // Additional Routes
  // ==========================================================================

  /**
   * POST /entities/:id/suspend - Suspend entity
   */
  fastify.post<{ Params: EntityParams }>(
    '/entities/:id/suspend',
    {
      preHandler: [requireEntityAccess('admin')],
    },
    async (request, reply) => {
      const entity = await entityService.suspend(request.params.id);
      return entity;
    }
  );

  /**
   * POST /entities/:id/reactivate - Reactivate entity
   */
  fastify.post<{ Params: EntityParams }>(
    '/entities/:id/reactivate',
    {
      preHandler: [requireEntityAccess('admin')],
    },
    async (request, reply) => {
      try {
        const entity = await entityService.reactivate(request.params.id);
        return entity;
      } catch (error: any) {
        if (error.code === 'PARENT_NOT_ACTIVE') {
          reply.code(400);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  /**
   * GET /entities/:id/configuration - Get entity configuration
   */
  fastify.get<{ Params: EntityParams }>(
    '/entities/:id/configuration',
    {
      preHandler: [requireEntityAccess('read')],
    },
    async (request, reply) => {
      const config = await entityService.getConfiguration(request.params.id);
      return config;
    }
  );

  /**
   * PATCH /entities/:id/configuration - Update entity configuration
   */
  fastify.patch<{ Params: EntityParams; Body: Record<string, unknown> }>(
    '/entities/:id/configuration',
    {
      preHandler: [requireEntityAccess('admin')],
    },
    async (request, reply) => {
      const config = await entityService.updateConfiguration(
        request.params.id,
        request.body as any
      );
      return config;
    }
  );

  /**
   * GET /entities/:id/effective-configuration - Get effective (inherited) configuration
   */
  fastify.get<{ Params: EntityParams }>(
    '/entities/:id/effective-configuration',
    {
      preHandler: [requireEntityAccess('read')],
    },
    async (request, reply) => {
      const config = await entityService.getEffectiveConfiguration(request.params.id);
      return config;
    }
  );

  /**
   * POST /entities/switch - Switch current entity context
   */
  fastify.post<{ Body: { targetEntityId: string } }>(
    '/entities/switch',
    {
      schema: {
        body: {
          type: 'object',
          required: ['targetEntityId'],
          properties: {
            targetEntityId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user?.id;
      if (!userId) {
        reply.code(401);
        return { error: 'Authentication required' };
      }

      const result = await switcherService.switchEntity(
        userId,
        request.body.targetEntityId
      );
      return result;
    }
  );

  /**
   * GET /entities/accessible - Get entities user can access
   */
  fastify.get('/entities/accessible', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const entities = await switcherService.getAccessibleEntities(userId);
    return { entities };
  });

  /**
   * GET /entities/current - Get current entity context
   */
  fastify.get('/entities/current', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const entity = await switcherService.getCurrentEntity(userId);
    if (!entity) {
      reply.code(404);
      return { error: 'No entity context established' };
    }

    const context = await switcherService.buildEntityContext(userId, entity);
    return { entity, context };
  });

  /**
   * GET /entities/:id/isolation-verification - Verify data isolation
   */
  fastify.get<{ Params: EntityParams }>(
    '/entities/:id/isolation-verification',
    {
      preHandler: [requireEntityAccess('admin')],
    },
    async (request, reply) => {
      const report = await isolationService.verifyIsolation(request.params.id);
      return report;
    }
  );
}
