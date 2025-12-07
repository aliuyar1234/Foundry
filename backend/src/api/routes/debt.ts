/**
 * Debt Score API Routes
 * REST endpoints for organizational debt scoring
 * T259-T262 - Debt API implementation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import {
  calculateOrgDebtScore,
  getDebtScoreHistory,
  getLatestDebtScore,
  compareDebtScores,
  calculateProcessDebt,
  calculateKnowledgeDebt,
  calculateDataDebt,
  calculateTechnicalDebt,
  calculateCommunicationDebt,
  calculateFixROI,
} from '../../services/analysis/debt/index.js';
import { DebtCalculationOptions } from '../../models/OrgDebtScore.js';

// Validation schemas
const getDebtScoreSchema = z.object({
  organizationId: z.string().uuid(),
});

const calculateDebtSchema = z.object({
  organizationId: z.string().uuid(),
  lookbackDays: z.number().min(7).max(365).optional(),
  includeRecommendations: z.boolean().optional(),
  includeCostEstimate: z.boolean().optional(),
  customWeights: z.object({
    process: z.number().min(0).max(1).optional(),
    knowledge: z.number().min(0).max(1).optional(),
    data: z.number().min(0).max(1).optional(),
    technical: z.number().min(0).max(1).optional(),
    communication: z.number().min(0).max(1).optional(),
  }).optional(),
  costParameters: z.object({
    avgSalary: z.number().positive().optional(),
    avgHourlyRate: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
  }).optional(),
});

const getHistorySchema = z.object({
  organizationId: z.string().uuid(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

const compareSchema = z.object({
  organizationIds: z.array(z.string().uuid()).min(2).max(10),
});

const dimensionSchema = z.object({
  organizationId: z.string().uuid(),
  lookbackDays: z.number().min(7).max(365).optional(),
});

const roiSchema = z.object({
  organizationId: z.string().uuid(),
  issueId: z.string(),
  estimatedFixCost: z.number().positive(),
});

export default async function debtRoutes(fastify: FastifyInstance): Promise<void> {
  const pool: Pool = fastify.pg;
  const debtQueue: Queue = fastify.queues?.DEBT_SCORE;

  // ============================================================
  // T259: Get latest debt score
  // ============================================================

  /**
   * GET /debt/:organizationId
   * Get the latest organizational debt score
   */
  fastify.get(
    '/:organizationId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            organizationId: { type: 'string', format: 'uuid' },
          },
          required: ['organizationId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organizationId: { type: 'string' },
              calculatedAt: { type: 'string' },
              overallScore: { type: 'number' },
              overallGrade: { type: 'string' },
              overallTrend: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({
          error: 'No debt score found',
          message: 'No debt score has been calculated for this organization yet',
        });
      }

      return score;
    }
  );

  /**
   * GET /debt/:organizationId/summary
   * Get a summary of the debt score with key metrics
   */
  fastify.get(
    '/:organizationId/summary',
    async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({
          error: 'No debt score found',
        });
      }

      return {
        overallScore: score.overallScore,
        overallGrade: score.overallGrade,
        overallTrend: score.overallTrend,
        calculatedAt: score.calculatedAt,
        dimensionScores: {
          process: score.dimensions.process.score,
          knowledge: score.dimensions.knowledge.score,
          data: score.dimensions.data.score,
          technical: score.dimensions.technical.score,
          communication: score.dimensions.communication.score,
        },
        estimatedAnnualCost: score.estimatedAnnualCost.totalAnnualCost,
        topRecommendationsCount: score.topRecommendations.length,
        benchmarkComparison: score.benchmarkComparison,
      };
    }
  );

  // ============================================================
  // T260: Calculate new debt score
  // ============================================================

  /**
   * POST /debt/calculate
   * Trigger a new debt score calculation
   */
  fastify.post(
    '/calculate',
    async (request: FastifyRequest<{ Body: z.infer<typeof calculateDebtSchema> }>, reply: FastifyReply) => {
      const options = calculateDebtSchema.parse(request.body);

      // For async processing via queue
      if (debtQueue) {
        const job = await debtQueue.add('calculate-debt', {
          organizationId: options.organizationId,
          options,
          triggeredBy: 'manual',
          triggeredByUserId: (request as any).user?.id,
        });

        return reply.status(202).send({
          message: 'Debt score calculation queued',
          jobId: job.id,
        });
      }

      // Sync calculation
      const calculationOptions: DebtCalculationOptions = {
        organizationId: options.organizationId,
        includeRecommendations: options.includeRecommendations ?? true,
        includeCostEstimate: options.includeCostEstimate ?? true,
        lookbackDays: options.lookbackDays ?? 90,
        customWeights: options.customWeights,
        costParameters: options.costParameters,
      };

      const score = await calculateOrgDebtScore(pool, calculationOptions);

      return reply.status(201).send(score);
    }
  );

  /**
   * POST /debt/calculate/sync
   * Calculate debt score synchronously (for small orgs or testing)
   */
  fastify.post(
    '/calculate/sync',
    async (request: FastifyRequest<{ Body: z.infer<typeof calculateDebtSchema> }>, reply: FastifyReply) => {
      const options = calculateDebtSchema.parse(request.body);

      const calculationOptions: DebtCalculationOptions = {
        organizationId: options.organizationId,
        includeRecommendations: options.includeRecommendations ?? true,
        includeCostEstimate: options.includeCostEstimate ?? true,
        lookbackDays: options.lookbackDays ?? 90,
        customWeights: options.customWeights,
        costParameters: options.costParameters,
      };

      const score = await calculateOrgDebtScore(pool, calculationOptions);

      return reply.status(201).send(score);
    }
  );

  // ============================================================
  // T261: Get debt score history
  // ============================================================

  /**
   * GET /debt/:organizationId/history
   * Get historical debt scores for trend analysis
   */
  fastify.get(
    '/:organizationId/history',
    async (
      request: FastifyRequest<{ Params: { organizationId: string }; Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      const { organizationId, limit } = getHistorySchema.parse({
        organizationId: request.params.organizationId,
        limit: request.query.limit,
      });

      const history = await getDebtScoreHistory(pool, organizationId, limit ?? 12);

      return {
        organizationId,
        history,
        count: history.length,
      };
    }
  );

  /**
   * GET /debt/:organizationId/trend
   * Get trend analysis for debt score
   */
  fastify.get(
    '/:organizationId/trend',
    async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);

      const history = await getDebtScoreHistory(pool, organizationId, 6);

      if (history.length < 2) {
        return {
          trend: 'insufficient_data',
          message: 'Need at least 2 data points for trend analysis',
        };
      }

      const latest = history[0].overallScore;
      const oldest = history[history.length - 1].overallScore;
      const change = latest - oldest;
      const percentChange = (change / oldest) * 100;

      return {
        currentScore: latest,
        periodStart: history[history.length - 1].date,
        periodEnd: history[0].date,
        change,
        percentChange: Math.round(percentChange * 10) / 10,
        trend: change < -5 ? 'improving' : change > 5 ? 'degrading' : 'stable',
        dimensionTrends: Object.entries(history[0].dimensionScores).map(([dim, score]) => ({
          dimension: dim,
          current: score,
          previous: history[history.length - 1].dimensionScores[dim as keyof typeof history[0]['dimensionScores']],
          change: score - history[history.length - 1].dimensionScores[dim as keyof typeof history[0]['dimensionScores']],
        })),
      };
    }
  );

  // ============================================================
  // T262: Dimension-specific endpoints
  // ============================================================

  /**
   * GET /debt/:organizationId/dimensions
   * Get all dimension scores
   */
  fastify.get(
    '/:organizationId/dimensions',
    async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({ error: 'No debt score found' });
      }

      return {
        organizationId,
        dimensions: Object.entries(score.dimensions).map(([name, dim]) => ({
          name,
          score: dim.score,
          weight: dim.weight,
          trend: dim.trend,
          subDimensionCount: dim.subDimensions.length,
          issueCount: dim.topIssues.length,
          recommendationCount: dim.recommendations.length,
        })),
      };
    }
  );

  /**
   * GET /debt/:organizationId/dimensions/:dimension
   * Get detailed information for a specific dimension
   */
  fastify.get(
    '/:organizationId/dimensions/:dimension',
    async (
      request: FastifyRequest<{ Params: { organizationId: string; dimension: string } }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);
      const { dimension } = request.params;

      const validDimensions = ['process', 'knowledge', 'data', 'technical', 'communication'];
      if (!validDimensions.includes(dimension)) {
        return reply.status(400).send({
          error: 'Invalid dimension',
          validDimensions,
        });
      }

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({ error: 'No debt score found' });
      }

      const dimensionData = score.dimensions[dimension as keyof typeof score.dimensions];

      return {
        organizationId,
        dimension,
        ...dimensionData,
      };
    }
  );

  /**
   * POST /debt/dimensions/process/calculate
   * Calculate only process debt
   */
  fastify.post(
    '/dimensions/process/calculate',
    async (request: FastifyRequest<{ Body: z.infer<typeof dimensionSchema> }>, reply: FastifyReply) => {
      const { organizationId, lookbackDays } = dimensionSchema.parse(request.body);
      const result = await calculateProcessDebt(pool, { organizationId, lookbackDays });
      return result;
    }
  );

  /**
   * POST /debt/dimensions/knowledge/calculate
   * Calculate only knowledge debt
   */
  fastify.post(
    '/dimensions/knowledge/calculate',
    async (request: FastifyRequest<{ Body: z.infer<typeof dimensionSchema> }>, reply: FastifyReply) => {
      const { organizationId, lookbackDays } = dimensionSchema.parse(request.body);
      const result = await calculateKnowledgeDebt(pool, { organizationId, lookbackDays });
      return result;
    }
  );

  /**
   * POST /debt/dimensions/data/calculate
   * Calculate only data debt
   */
  fastify.post(
    '/dimensions/data/calculate',
    async (request: FastifyRequest<{ Body: z.infer<typeof dimensionSchema> }>, reply: FastifyReply) => {
      const { organizationId, lookbackDays } = dimensionSchema.parse(request.body);
      const result = await calculateDataDebt(pool, { organizationId, lookbackDays });
      return result;
    }
  );

  /**
   * POST /debt/dimensions/technical/calculate
   * Calculate only technical debt
   */
  fastify.post(
    '/dimensions/technical/calculate',
    async (request: FastifyRequest<{ Body: z.infer<typeof dimensionSchema> }>, reply: FastifyReply) => {
      const { organizationId, lookbackDays } = dimensionSchema.parse(request.body);
      const result = await calculateTechnicalDebt(pool, { organizationId, lookbackDays });
      return result;
    }
  );

  /**
   * POST /debt/dimensions/communication/calculate
   * Calculate only communication debt
   */
  fastify.post(
    '/dimensions/communication/calculate',
    async (request: FastifyRequest<{ Body: z.infer<typeof dimensionSchema> }>, reply: FastifyReply) => {
      const { organizationId, lookbackDays } = dimensionSchema.parse(request.body);
      const result = await calculateCommunicationDebt(pool, { organizationId, lookbackDays });
      return result;
    }
  );

  // ============================================================
  // Additional endpoints
  // ============================================================

  /**
   * GET /debt/:organizationId/recommendations
   * Get prioritized recommendations
   */
  fastify.get(
    '/:organizationId/recommendations',
    async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({ error: 'No debt score found' });
      }

      return {
        organizationId,
        recommendations: score.topRecommendations,
        totalCount: score.topRecommendations.length,
      };
    }
  );

  /**
   * GET /debt/:organizationId/cost
   * Get cost estimate breakdown
   */
  fastify.get(
    '/:organizationId/cost',
    async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({ error: 'No debt score found' });
      }

      return {
        organizationId,
        ...score.estimatedAnnualCost,
      };
    }
  );

  /**
   * POST /debt/roi
   * Calculate ROI for fixing a specific issue
   */
  fastify.post(
    '/roi',
    async (request: FastifyRequest<{ Body: z.infer<typeof roiSchema> }>, reply: FastifyReply) => {
      const { organizationId, issueId, estimatedFixCost } = roiSchema.parse(request.body);

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({ error: 'No debt score found' });
      }

      const roi = calculateFixROI(issueId, estimatedFixCost, score.dimensions);

      if (!roi) {
        return reply.status(404).send({
          error: 'Issue not found',
          message: `Could not find issue with ID: ${issueId}`,
        });
      }

      return {
        issueId,
        estimatedFixCost,
        ...roi,
      };
    }
  );

  /**
   * POST /debt/compare
   * Compare debt scores across organizations
   */
  fastify.post(
    '/compare',
    async (request: FastifyRequest<{ Body: z.infer<typeof compareSchema> }>, reply: FastifyReply) => {
      const { organizationIds } = compareSchema.parse(request.body);

      const scores = await compareDebtScores(pool, organizationIds);

      const comparison = Array.from(scores.entries()).map(([orgId, score]) => ({
        organizationId: orgId,
        overallScore: score.overallScore,
        overallGrade: score.overallGrade,
        dimensions: {
          process: score.dimensions.process.score,
          knowledge: score.dimensions.knowledge.score,
          data: score.dimensions.data.score,
          technical: score.dimensions.technical.score,
          communication: score.dimensions.communication.score,
        },
        estimatedAnnualCost: score.estimatedAnnualCost.totalAnnualCost,
      }));

      return {
        organizations: comparison,
        count: comparison.length,
        averageScore: Math.round(
          comparison.reduce((sum, c) => sum + c.overallScore, 0) / comparison.length
        ),
      };
    }
  );

  /**
   * GET /debt/:organizationId/issues
   * Get all issues across dimensions
   */
  fastify.get(
    '/:organizationId/issues',
    async (
      request: FastifyRequest<{ Params: { organizationId: string }; Querystring: { severity?: string } }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = getDebtScoreSchema.parse(request.params);
      const { severity } = request.query;

      const score = await getLatestDebtScore(pool, organizationId);

      if (!score) {
        return reply.status(404).send({ error: 'No debt score found' });
      }

      let allIssues = Object.entries(score.dimensions).flatMap(([dimension, data]) =>
        data.topIssues.map((issue) => ({
          ...issue,
          dimension,
        }))
      );

      if (severity) {
        allIssues = allIssues.filter((issue) => issue.severity === severity);
      }

      // Sort by severity
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return {
        organizationId,
        issues: allIssues,
        count: allIssues.length,
        bySeverity: {
          critical: allIssues.filter((i) => i.severity === 'critical').length,
          high: allIssues.filter((i) => i.severity === 'high').length,
          medium: allIssues.filter((i) => i.severity === 'medium').length,
          low: allIssues.filter((i) => i.severity === 'low').length,
        },
      };
    }
  );
}
