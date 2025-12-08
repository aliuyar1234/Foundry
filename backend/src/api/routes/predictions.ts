/**
 * Prediction API Routes (T123-T126)
 * Endpoints for predictive analytics
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * SECURITY: RBAC permission checks applied per-endpoint
 * SECURITY: Input validation via Fastify JSON Schema
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPredictionService } from '../../services/prediction/prediction.service.js';
import { logger } from '../../lib/logger.js';
import type { PredictionModelType, ModelConfig } from '../../models/Prediction.js';
import { getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';

// =============================================================================
// Validation Schemas (Fastify JSON Schema)
// =============================================================================

const modelTypeEnum = ['BOTTLENECK', 'DELAY', 'OUTCOME', 'RESOURCE', 'HEALTH', 'ANOMALY'];

const createModelSchema = {
  type: 'object',
  required: ['name', 'description', 'type', 'config'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    type: { type: 'string', enum: modelTypeEnum },
    config: { type: 'object', additionalProperties: true },
  },
  additionalProperties: false,
} as const;

const predictSchema = {
  type: 'object',
  required: ['modelId', 'processId'],
  properties: {
    modelId: { type: 'string', minLength: 1, maxLength: 100 },
    processId: { type: 'string', minLength: 1, maxLength: 100 },
    instanceId: { type: 'string', maxLength: 100 },
    context: { type: 'object', additionalProperties: true },
  },
  additionalProperties: false,
} as const;

const idParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const processIdParamSchema = {
  type: 'object',
  required: ['processId'],
  properties: {
    processId: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const limitQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

const forecastQuerySchema = {
  type: 'object',
  required: ['metric'],
  properties: {
    metric: { type: 'string', minLength: 1, maxLength: 100 },
    horizonDays: { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;

// =============================================================================
// Request body types (for TypeScript)
// =============================================================================

/**
 * Request body types
 */
interface CreateModelBody {
  name: string;
  description: string;
  type: PredictionModelType;
  config: ModelConfig;
}

interface PredictBody {
  modelId: string;
  processId: string;
  instanceId?: string;
  context?: Record<string, unknown>;
}

interface ForecastQuery {
  metric: string;
  horizonDays?: string;
}

/**
 * Register prediction routes
 */
export async function predictionRoutes(fastify: FastifyInstance): Promise<void> {
  const predictionService = getPredictionService();

  /**
   * Create a prediction model
   * POST /api/v1/predictions/models
   * Requires: process.create permission (ANALYST role minimum)
   */
  fastify.post(
    '/models',
    {
      schema: { body: createModelSchema },
      preHandler: [requirePermission('process', 'create')],
    },
    async (request: FastifyRequest<{ Body: CreateModelBody }>, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);
        const { name, description, type, config } = request.body;

        const model = await predictionService.createModel({
          tenantId,
          name,
          description,
          type,
          config,
        });

        return reply.status(201).send({
          success: true,
          data: model,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create prediction model');
        return reply.status(500).send({
          success: false,
          error: 'Failed to create prediction model',
        });
      }
    }
  );

  /**
   * List prediction models
   * GET /api/v1/predictions/models
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/models',
    { preHandler: [requirePermission('process', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);
        const models = await predictionService.listModels(tenantId);

        return reply.send({
          success: true,
          data: models,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list prediction models');
        return reply.status(500).send({
          success: false,
          error: 'Failed to list prediction models',
        });
      }
    }
  );

  /**
   * Get prediction model by ID
   * GET /api/v1/predictions/models/:id
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/models/:id',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const model = await predictionService.getModel(id);

        if (!model) {
          return reply.status(404).send({
            success: false,
            error: 'Model not found',
          });
        }

        return reply.send({
          success: true,
          data: model,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get prediction model');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get prediction model',
        });
      }
    }
  );

  /**
   * Train a prediction model
   * POST /api/v1/predictions/models/:id/train
   * Requires: process.update permission (ANALYST role minimum)
   */
  fastify.post(
    '/models/:id/train',
    {
      schema: { params: idParamSchema },
      preHandler: [requirePermission('process', 'update')],
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const model = await predictionService.trainModel(id);

        if (!model) {
          return reply.status(404).send({
            success: false,
            error: 'Model not found',
          });
        }

        return reply.send({
          success: true,
          data: model,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to train prediction model');
        return reply.status(500).send({
          success: false,
          error: 'Failed to train prediction model',
        });
      }
    }
  );

  /**
   * Generate prediction
   * POST /api/v1/predictions/predict
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.post(
    '/predict',
    {
      schema: { body: predictSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (request: FastifyRequest<{ Body: PredictBody }>, reply: FastifyReply) => {
      try {
        const tenantId = getOrganizationId(request);
        const { modelId, processId, instanceId, context } = request.body;

        const prediction = await predictionService.predict({
          modelId,
          processId,
          instanceId,
          tenantId,
          context,
        });

        return reply.send({
          success: true,
          data: prediction,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate prediction');
        return reply.status(500).send({
          success: false,
          error: 'Failed to generate prediction',
        });
      }
    }
  );

  /**
   * Get predictions for a process
   * GET /api/v1/predictions/process/:processId
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/process/:processId',
    {
      schema: { params: processIdParamSchema, querystring: limitQuerySchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{
        Params: { processId: string };
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { processId } = request.params;
        const { limit } = request.query;

        const predictions = await predictionService.getPredictions(processId, {
          limit: limit ? parseInt(limit, 10) : 10,
        });

        return reply.send({
          success: true,
          data: predictions,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get predictions');
        return reply.status(500).send({
          success: false,
          error: 'Failed to get predictions',
        });
      }
    }
  );

  /**
   * Get process health score
   * GET /api/v1/predictions/health/:processId
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/health/:processId',
    {
      schema: { params: processIdParamSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { processId } = request.params;

        const health = await predictionService.calculateHealthScore(processId, tenantId);

        return reply.send({
          success: true,
          data: health,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to calculate health score');
        return reply.status(500).send({
          success: false,
          error: 'Failed to calculate health score',
        });
      }
    }
  );

  /**
   * Detect anomalies for a process
   * GET /api/v1/predictions/anomalies/:processId
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/anomalies/:processId',
    {
      schema: { params: processIdParamSchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { processId } = request.params;

        const anomalies = await predictionService.detectAnomalies(processId, tenantId);

        return reply.send({
          success: true,
          data: anomalies,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to detect anomalies');
        return reply.status(500).send({
          success: false,
          error: 'Failed to detect anomalies',
        });
      }
    }
  );

  /**
   * Generate forecast for a process metric
   * GET /api/v1/predictions/forecast/:processId
   * Requires: process.read permission (VIEWER role minimum)
   */
  fastify.get(
    '/forecast/:processId',
    {
      schema: { params: processIdParamSchema, querystring: forecastQuerySchema },
      preHandler: [requirePermission('process', 'read')],
    },
    async (
      request: FastifyRequest<{
        Params: { processId: string };
        Querystring: ForecastQuery;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = getOrganizationId(request);
        const { processId } = request.params;
        const { metric, horizonDays } = request.query;

        if (!metric) {
          return reply.status(400).send({
            success: false,
            error: 'Metric parameter is required',
          });
        }

        const forecast = await predictionService.forecast(
          processId,
          tenantId,
          metric,
          horizonDays ? parseInt(horizonDays, 10) : 30
        );

        return reply.send({
          success: true,
          data: forecast,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate forecast');
        return reply.status(500).send({
          success: false,
          error: 'Failed to generate forecast',
        });
      }
    }
  );
}

export default predictionRoutes;
