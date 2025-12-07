/**
 * Prediction API Routes (T123-T126)
 * Endpoints for predictive analytics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPredictionService } from '../../services/prediction/prediction.service.js';
import { logger } from '../../lib/logger.js';
import type { PredictionModelType, ModelConfig } from '../../models/Prediction.js';

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
   */
  fastify.post(
    '/models',
    async (request: FastifyRequest<{ Body: CreateModelBody }>, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/models',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/models/:id',
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
   */
  fastify.post(
    '/models/:id/train',
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
   */
  fastify.post(
    '/predict',
    async (request: FastifyRequest<{ Body: PredictBody }>, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/process/:processId',
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
   */
  fastify.get(
    '/health/:processId',
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/anomalies/:processId',
    async (
      request: FastifyRequest<{ Params: { processId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
   */
  fastify.get(
    '/forecast/:processId',
    async (
      request: FastifyRequest<{
        Params: { processId: string };
        Querystring: ForecastQuery;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantId = (request as any).tenantId || 'default';
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
