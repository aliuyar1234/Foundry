/**
 * Insights API Routes
 * Endpoints for organizational insights and bus factor analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  InsightService,
  createInsightService,
  InsightType,
  InsightCategory,
  InsightSeverity,
  InsightStatus,
  EntityType,
} from '../../services/insights/insightService.js';
import {
  BusFactorCalculator,
  createBusFactorCalculator,
} from '../../services/analysis/busFactor/scoreCalculator.js';
import {
  RiskExposureQuantifier,
  createRiskExposureQuantifier,
} from '../../services/analysis/busFactor/riskExposure.js';
import {
  KnowledgeDependencyBuilder,
  createKnowledgeDependencyBuilder,
} from '../../services/analysis/busFactor/dependencyBuilder.js';

// Request schemas
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const insightQuerySchema = paginationSchema.extend({
  types: z.string().optional().transform((val) =>
    val ? val.split(',') as InsightType[] : undefined
  ),
  categories: z.string().optional().transform((val) =>
    val ? val.split(',') as InsightCategory[] : undefined
  ),
  severities: z.string().optional().transform((val) =>
    val ? val.split(',') as InsightSeverity[] : undefined
  ),
  statuses: z.string().optional().transform((val) =>
    val ? val.split(',') as InsightStatus[] : undefined
  ),
  entityTypes: z.string().optional().transform((val) =>
    val ? val.split(',') as EntityType[] : undefined
  ),
  entityId: z.string().uuid().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const insightIdParamSchema = z.object({
  insightId: z.string().uuid(),
});

const updateInsightSchema = z.object({
  status: z.enum(['new', 'acknowledged', 'in_progress', 'resolved', 'dismissed']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  resolutionNotes: z.string().max(2000).optional(),
});

const busFactorQuerySchema = z.object({
  lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
  expertiseThreshold: z.coerce.number().min(0).max(100).optional(),
  includeTeamBreakdown: z.coerce.boolean().optional(),
});

const personIdParamSchema = z.object({
  personId: z.string().uuid(),
});

const riskExposureQuerySchema = z.object({
  lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
  avgSalary: z.coerce.number().min(0).optional(),
  hiringCost: z.coerce.number().min(0).optional(),
  revenuePerEmployee: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
});

export default async function insightsRoutes(fastify: FastifyInstance) {
  const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });

  const insightService = createInsightService(pool, prisma);
  const busFactorCalculator = createBusFactorCalculator(pool);
  const riskExposureQuantifier = createRiskExposureQuantifier(pool);
  const knowledgeBuilder = createKnowledgeDependencyBuilder(pool);

  // ==================== INSIGHTS ENDPOINTS ====================

  /**
   * GET /insights
   * List insights with filtering
   */
  fastify.get(
    '/',
    {
      schema: {
        querystring: insightQuerySchema,
        tags: ['insights'],
        summary: 'List organizational insights',
        description: 'Query insights with filters for type, severity, status, etc.',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = insightQuerySchema.parse(request.query);

      const insights = await insightService.queryInsights({
        organizationId,
        types: query.types,
        categories: query.categories,
        severities: query.severities,
        statuses: query.statuses,
        entityTypes: query.entityTypes,
        entityId: query.entityId,
        minScore: query.minScore,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit || 50,
        offset: query.offset || 0,
      });

      return {
        success: true,
        data: insights,
        meta: {
          count: insights.length,
          limit: query.limit || 50,
          offset: query.offset || 0,
        },
      };
    }
  );

  /**
   * GET /insights/summary
   * Get insight summary statistics
   */
  fastify.get(
    '/summary',
    {
      schema: {
        tags: ['insights'],
        summary: 'Get insight summary',
        description: 'Get aggregated statistics about insights',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const summary = await insightService.getInsightSummary(organizationId);

      return {
        success: true,
        data: summary,
      };
    }
  );

  /**
   * GET /insights/urgent
   * Get urgent insights requiring immediate attention
   */
  fastify.get(
    '/urgent',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).optional(),
        }),
        tags: ['insights'],
        summary: 'Get urgent insights',
        description: 'Get critical and high-severity insights that are new or acknowledged',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(50).optional(),
      }).parse(request.query);

      const insights = await insightService.getUrgentInsights(
        organizationId,
        query.limit || 10
      );

      return {
        success: true,
        data: insights,
      };
    }
  );

  /**
   * GET /insights/:insightId
   * Get insight details
   */
  fastify.get(
    '/:insightId',
    {
      schema: {
        params: insightIdParamSchema,
        tags: ['insights'],
        summary: 'Get insight details',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { insightId } = insightIdParamSchema.parse(request.params);

      const insight = await insightService.getInsightById(insightId);

      if (!insight) {
        return reply.status(404).send({
          success: false,
          error: 'Insight not found',
        });
      }

      if (insight.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      return {
        success: true,
        data: insight,
      };
    }
  );

  /**
   * PATCH /insights/:insightId
   * Update insight status
   */
  fastify.patch(
    '/:insightId',
    {
      schema: {
        params: insightIdParamSchema,
        body: updateInsightSchema,
        tags: ['insights'],
        summary: 'Update insight',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { insightId } = insightIdParamSchema.parse(request.params);
      const updates = updateInsightSchema.parse(request.body);
      const userId = request.userId!;

      const existing = await insightService.getInsightById(insightId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Insight not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await insightService.updateInsight(insightId, {
        ...updates,
        acknowledgedBy: updates.status === 'acknowledged' ? userId : undefined,
        resolvedBy: updates.status === 'resolved' || updates.status === 'dismissed' ? userId : undefined,
      });

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * POST /insights/:insightId/acknowledge
   * Acknowledge an insight
   */
  fastify.post(
    '/:insightId/acknowledge',
    {
      schema: {
        params: insightIdParamSchema,
        tags: ['insights'],
        summary: 'Acknowledge insight',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { insightId } = insightIdParamSchema.parse(request.params);
      const userId = request.userId!;

      const existing = await insightService.getInsightById(insightId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Insight not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await insightService.acknowledgeInsight(insightId, userId);

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * POST /insights/:insightId/resolve
   * Resolve an insight
   */
  fastify.post(
    '/:insightId/resolve',
    {
      schema: {
        params: insightIdParamSchema,
        body: z.object({
          notes: z.string().max(2000).optional(),
        }),
        tags: ['insights'],
        summary: 'Resolve insight',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { insightId } = insightIdParamSchema.parse(request.params);
      const { notes } = z.object({
        notes: z.string().max(2000).optional(),
      }).parse(request.body);
      const userId = request.userId!;

      const existing = await insightService.getInsightById(insightId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Insight not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await insightService.resolveInsight(insightId, userId, notes);

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * POST /insights/:insightId/dismiss
   * Dismiss an insight
   */
  fastify.post(
    '/:insightId/dismiss',
    {
      schema: {
        params: insightIdParamSchema,
        body: z.object({
          reason: z.string().max(500).optional(),
        }),
        tags: ['insights'],
        summary: 'Dismiss insight',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { insightId } = insightIdParamSchema.parse(request.params);
      const { reason } = z.object({
        reason: z.string().max(500).optional(),
      }).parse(request.body);
      const userId = request.userId!;

      const existing = await insightService.getInsightById(insightId);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Insight not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await insightService.dismissInsight(insightId, userId, reason);

      return {
        success: true,
        data: updated,
      };
    }
  );

  // ==================== BUS FACTOR ENDPOINTS ====================

  /**
   * GET /insights/bus-factor
   * Get organization bus factor analysis
   */
  fastify.get(
    '/bus-factor',
    {
      schema: {
        querystring: busFactorQuerySchema,
        tags: ['insights', 'bus-factor'],
        summary: 'Get bus factor analysis',
        description: 'Analyze knowledge concentration and single points of failure',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = busFactorQuerySchema.parse(request.query);

      const busFactor = await busFactorCalculator.calculateOrganizationBusFactor({
        organizationId,
        lookbackDays: query.lookbackDays,
        expertiseThreshold: query.expertiseThreshold,
        includeTeamBreakdown: query.includeTeamBreakdown,
      });

      return {
        success: true,
        data: busFactor,
      };
    }
  );

  /**
   * GET /insights/bus-factor/person/:personId
   * Get bus factor analysis for a specific person
   */
  fastify.get(
    '/bus-factor/person/:personId',
    {
      schema: {
        params: personIdParamSchema,
        querystring: z.object({
          lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
        }),
        tags: ['insights', 'bus-factor'],
        summary: 'Get person knowledge profile',
        description: 'Analyze knowledge dependencies for a specific person',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { personId } = personIdParamSchema.parse(request.params);
      const query = z.object({
        lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
      }).parse(request.query);

      const personKnowledge = await knowledgeBuilder.getPersonKnowledge(
        organizationId,
        personId,
        { lookbackDays: query.lookbackDays }
      );

      if (!personKnowledge) {
        return reply.status(404).send({
          success: false,
          error: 'Person not found',
        });
      }

      return {
        success: true,
        data: personKnowledge,
      };
    }
  );

  /**
   * GET /insights/bus-factor/domains
   * Get knowledge domains with bus factor scores
   */
  fastify.get(
    '/bus-factor/domains',
    {
      schema: {
        querystring: busFactorQuerySchema,
        tags: ['insights', 'bus-factor'],
        summary: 'Get domain bus factors',
        description: 'List knowledge domains with their bus factor scores',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = busFactorQuerySchema.parse(request.query);

      const busFactor = await busFactorCalculator.calculateOrganizationBusFactor({
        organizationId,
        lookbackDays: query.lookbackDays,
        expertiseThreshold: query.expertiseThreshold,
      });

      return {
        success: true,
        data: {
          domains: busFactor.domainScores,
          criticalCount: busFactor.criticalDomainsCount,
          highRiskCount: busFactor.highRiskDomainsCount,
        },
      };
    }
  );

  /**
   * GET /insights/bus-factor/single-points-of-failure
   * Get single points of failure
   */
  fastify.get(
    '/bus-factor/single-points-of-failure',
    {
      schema: {
        querystring: z.object({
          lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
        }),
        tags: ['insights', 'bus-factor'],
        summary: 'Get single points of failure',
        description: 'List people who are sole experts in critical knowledge areas',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = z.object({
        lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
      }).parse(request.query);

      const busFactor = await busFactorCalculator.calculateOrganizationBusFactor({
        organizationId,
        lookbackDays: query.lookbackDays,
      });

      return {
        success: true,
        data: busFactor.singlePointsOfFailure,
      };
    }
  );

  // ==================== RISK EXPOSURE ENDPOINTS ====================

  /**
   * GET /insights/risk-exposure
   * Get risk exposure report
   */
  fastify.get(
    '/risk-exposure',
    {
      schema: {
        querystring: riskExposureQuerySchema,
        tags: ['insights', 'risk'],
        summary: 'Get risk exposure report',
        description: 'Quantify business risk from knowledge concentration',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = riskExposureQuerySchema.parse(request.query);

      const report = await riskExposureQuantifier.quantifyRiskExposure({
        organizationId,
        lookbackDays: query.lookbackDays,
        avgSalary: query.avgSalary,
        hiringCost: query.hiringCost,
        revenuePerEmployee: query.revenuePerEmployee,
        currency: query.currency,
      });

      return {
        success: true,
        data: report,
      };
    }
  );

  /**
   * GET /insights/risk-exposure/person/:personId
   * Get risk exposure for a specific person
   */
  fastify.get(
    '/risk-exposure/person/:personId',
    {
      schema: {
        params: personIdParamSchema,
        querystring: riskExposureQuerySchema,
        tags: ['insights', 'risk'],
        summary: 'Get person risk exposure',
        description: 'Quantify risk if a specific person leaves',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { personId } = personIdParamSchema.parse(request.params);
      const query = riskExposureQuerySchema.parse(request.query);

      const risk = await riskExposureQuantifier.quantifyPersonRisk(
        organizationId,
        personId,
        {
          lookbackDays: query.lookbackDays,
          avgSalary: query.avgSalary,
          hiringCost: query.hiringCost,
          revenuePerEmployee: query.revenuePerEmployee,
          currency: query.currency,
        }
      );

      if (!risk) {
        return reply.status(404).send({
          success: false,
          error: 'Person not found or not a significant risk factor',
        });
      }

      return {
        success: true,
        data: risk,
      };
    }
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await pool.end();
    await prisma.$disconnect();
  });
}
