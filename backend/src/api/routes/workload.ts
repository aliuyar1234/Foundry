/**
 * Workload Management API Routes
 * T221-T226 - Endpoints for workload analysis, burnout prediction, and team management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

// Service imports
import {
  calculateWorkloadScore,
  calculateTeamWorkload,
  identifyWorkloadImbalances,
} from '../../services/workload/workloadAnalyzer.js';
import {
  predictBurnout,
  predictTeamBurnout,
  getBurnoutHistory,
  getAtRiskPeople,
} from '../../services/workload/burnoutPredictor.js';
import {
  calculateBurnoutScore,
  calculateTeamBurnoutScore,
  getBurnoutScoreTrend,
} from '../../services/workload/burnoutScorer.js';
import {
  checkForWarnings,
  checkTeamWarnings,
  acknowledgeWarning,
  resolveWarning,
  getWarningHistory,
} from '../../services/workload/earlyWarning.js';
import {
  analyzeDistribution,
  getMemberTaskMetrics,
  getAssignmentSuggestions,
} from '../../services/workload/taskDistribution.js';
import {
  generateRedistributionPlan,
  suggestForPerson,
  applySuggestion,
} from '../../services/workload/redistributionSuggester.js';
import {
  optimizeTeamWorkload,
  getQuickSuggestions,
  simulateMoves,
} from '../../services/workload/balancingOptimizer.js';
import {
  forecastPersonWorkload,
  forecastTeamWorkload,
} from '../../services/workload/workloadForecaster.js';
import {
  createCapacityPlan,
  analyzeScenario,
  getCapacityForecast,
} from '../../services/workload/capacityPlanner.js';
import {
  analyzeCalendar,
  getAvailability,
  findCommonAvailability,
  getMeetingStats,
} from '../../services/workload/calendarIntegration.js';
import {
  analyzeMeetings,
  analyzeTeamMeetings,
  getMeetingOptimizations,
} from '../../services/workload/meetingAnalyzer.js';
import {
  getPersonAvailability,
  setStatus,
  getTeamAvailability,
  getSchedulingSuggestions,
} from '../../services/workload/availabilityTracker.js';
import {
  getManagerNotifications,
  markAsRead,
  markAsActioned,
  dismissNotification,
  getManagerPreferences,
  updateManagerPreferences,
} from '../../services/workload/managerNotifier.js';
import {
  schedulePersonMetrics,
  scheduleTeamMetrics,
  scheduleBurnoutAnalysis,
  getProcessorStats,
  getQueueStatus,
} from '../../services/workload/workloadMetricsProcessor.js';

// =============================================================================
// Request Schemas
// =============================================================================

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const periodSchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(365).optional(),
});

const personIdParamSchema = z.object({
  personId: z.string().uuid(),
});

const teamIdParamSchema = z.object({
  teamId: z.string().uuid(),
});

const warningIdParamSchema = z.object({
  warningId: z.string(),
});

const notificationIdParamSchema = z.object({
  notificationId: z.string(),
});

const workloadQuerySchema = periodSchema.extend({
  includeBreakdown: z.coerce.boolean().optional(),
  includeHistory: z.coerce.boolean().optional(),
});

const burnoutQuerySchema = periodSchema.extend({
  includeFactors: z.coerce.boolean().optional(),
  includeRecommendations: z.coerce.boolean().optional(),
});

const forecastQuerySchema = z.object({
  forecastDays: z.coerce.number().int().min(7).max(90).optional(),
  includeRisks: z.coerce.boolean().optional(),
});

const redistributionQuerySchema = z.object({
  maxSuggestions: z.coerce.number().int().min(1).max(50).optional(),
  respectSkills: z.coerce.boolean().optional(),
  respectDeadlines: z.coerce.boolean().optional(),
});

const optimizationConfigSchema = z.object({
  algorithm: z.enum(['greedy', 'genetic', 'simulated_annealing', 'linear_programming']).optional(),
  targetLoadPercent: z.coerce.number().min(50).max(100).optional(),
  maxIterations: z.coerce.number().int().min(10).max(1000).optional(),
});

const schedulingRequestSchema = z.object({
  attendeeIds: z.array(z.string().uuid()),
  duration: z.coerce.number().int().min(15).max(480),
  withinDays: z.coerce.number().int().min(1).max(30).optional(),
  maxSuggestions: z.coerce.number().int().min(1).max(10).optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(['available', 'busy', 'in_meeting', 'focusing', 'away', 'out_of_office', 'offline']),
  until: z.string().datetime().optional(),
  customMessage: z.string().max(100).optional(),
});

const capacityScenarioSchema = z.object({
  changes: z.array(z.object({
    type: z.enum(['add_member', 'remove_member', 'adjust_hours', 'add_project', 'remove_project']),
    personId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    value: z.number().optional(),
  })),
});

// =============================================================================
// Routes
// =============================================================================

export default async function workloadRoutes(fastify: FastifyInstance) {
  const prisma = new PrismaClient();

  // ==================== PERSON WORKLOAD ENDPOINTS ====================

  /**
   * GET /workload/person/:personId
   * Get workload analysis for a specific person
   */
  fastify.get(
    '/person/:personId',
    {
      schema: {
        params: personIdParamSchema,
        querystring: workloadQuerySchema,
        tags: ['workload'],
        summary: 'Get person workload',
        description: 'Analyze workload metrics for a specific person',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = workloadQuerySchema.parse(request.query);

      const workload = await calculateWorkloadScore(personId, {
        periodDays: query.periodDays || 30,
      });

      return {
        success: true,
        data: workload,
      };
    }
  );

  /**
   * GET /workload/person/:personId/burnout
   * Get burnout risk analysis for a person
   */
  fastify.get(
    '/person/:personId/burnout',
    {
      schema: {
        params: personIdParamSchema,
        querystring: burnoutQuerySchema,
        tags: ['workload', 'burnout'],
        summary: 'Get burnout risk',
        description: 'Analyze burnout risk factors and predictions',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = burnoutQuerySchema.parse(request.query);

      const [prediction, score] = await Promise.all([
        predictBurnout(personId, { periodDays: query.periodDays }),
        calculateBurnoutScore(personId, {
          includeRecommendations: query.includeRecommendations,
        }),
      ]);

      return {
        success: true,
        data: {
          prediction,
          score,
        },
      };
    }
  );

  /**
   * GET /workload/person/:personId/burnout/history
   * Get burnout risk history
   */
  fastify.get(
    '/person/:personId/burnout/history',
    {
      schema: {
        params: personIdParamSchema,
        querystring: periodSchema,
        tags: ['workload', 'burnout'],
        summary: 'Get burnout history',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = periodSchema.parse(request.query);

      const history = await getBurnoutHistory(personId, {
        periodDays: query.periodDays || 90,
      });

      return {
        success: true,
        data: history,
      };
    }
  );

  /**
   * GET /workload/person/:personId/burnout/trend
   * Get burnout score trend
   */
  fastify.get(
    '/person/:personId/burnout/trend',
    {
      schema: {
        params: personIdParamSchema,
        querystring: z.object({
          periodDays: z.coerce.number().int().min(7).max(365).optional(),
          dataPoints: z.coerce.number().int().min(5).max(30).optional(),
        }),
        tags: ['workload', 'burnout'],
        summary: 'Get burnout trend',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = z.object({
        periodDays: z.coerce.number().int().min(7).max(365).optional(),
        dataPoints: z.coerce.number().int().min(5).max(30).optional(),
      }).parse(request.query);

      const trend = await getBurnoutScoreTrend(personId, {
        periodDays: query.periodDays || 90,
        dataPoints: query.dataPoints || 12,
      });

      return {
        success: true,
        data: trend,
      };
    }
  );

  /**
   * GET /workload/person/:personId/warnings
   * Get early warnings for a person
   */
  fastify.get(
    '/person/:personId/warnings',
    {
      schema: {
        params: personIdParamSchema,
        tags: ['workload', 'warnings'],
        summary: 'Get person warnings',
        description: 'Check for early warning signals',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);

      const warnings = await checkForWarnings(personId);

      return {
        success: true,
        data: warnings,
      };
    }
  );

  /**
   * GET /workload/person/:personId/forecast
   * Get workload forecast for a person
   */
  fastify.get(
    '/person/:personId/forecast',
    {
      schema: {
        params: personIdParamSchema,
        querystring: forecastQuerySchema,
        tags: ['workload', 'forecast'],
        summary: 'Get workload forecast',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = forecastQuerySchema.parse(request.query);

      const forecast = await forecastPersonWorkload(personId, {
        forecastDays: query.forecastDays || 30,
      });

      return {
        success: true,
        data: forecast,
      };
    }
  );

  /**
   * GET /workload/person/:personId/redistribution
   * Get task redistribution suggestions for an overloaded person
   */
  fastify.get(
    '/person/:personId/redistribution',
    {
      schema: {
        params: personIdParamSchema,
        querystring: z.object({
          targetLoad: z.coerce.number().min(50).max(100).optional(),
        }),
        tags: ['workload', 'redistribution'],
        summary: 'Get redistribution suggestions',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = z.object({
        targetLoad: z.coerce.number().min(50).max(100).optional(),
      }).parse(request.query);

      const suggestions = await suggestForPerson(personId, {
        targetLoad: query.targetLoad || 85,
      });

      return {
        success: true,
        data: suggestions,
      };
    }
  );

  // ==================== TEAM WORKLOAD ENDPOINTS ====================

  /**
   * GET /workload/team/:teamId
   * Get team workload overview
   */
  fastify.get(
    '/team/:teamId',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: workloadQuerySchema,
        tags: ['workload', 'team'],
        summary: 'Get team workload',
        description: 'Analyze workload across the team',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = workloadQuerySchema.parse(request.query);

      const teamWorkload = await calculateTeamWorkload(teamId, {
        periodDays: query.periodDays || 30,
      });

      return {
        success: true,
        data: teamWorkload,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/burnout
   * Get team burnout analysis
   */
  fastify.get(
    '/team/:teamId/burnout',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: burnoutQuerySchema,
        tags: ['workload', 'team', 'burnout'],
        summary: 'Get team burnout analysis',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);

      const [prediction, score] = await Promise.all([
        predictTeamBurnout(teamId),
        calculateTeamBurnoutScore(teamId),
      ]);

      return {
        success: true,
        data: {
          prediction,
          score,
        },
      };
    }
  );

  /**
   * GET /workload/team/:teamId/at-risk
   * Get team members at risk of burnout
   */
  fastify.get(
    '/team/:teamId/at-risk',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: z.object({
          threshold: z.coerce.number().min(0).max(100).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        }),
        tags: ['workload', 'team', 'burnout'],
        summary: 'Get at-risk team members',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = z.object({
        threshold: z.coerce.number().min(0).max(100).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      }).parse(request.query);

      const atRisk = await getAtRiskPeople(teamId, {
        threshold: query.threshold || 70,
        limit: query.limit || 10,
      });

      return {
        success: true,
        data: atRisk,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/warnings
   * Get team early warnings
   */
  fastify.get(
    '/team/:teamId/warnings',
    {
      schema: {
        params: teamIdParamSchema,
        tags: ['workload', 'team', 'warnings'],
        summary: 'Get team warnings',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);

      const warnings = await checkTeamWarnings(teamId);

      return {
        success: true,
        data: warnings,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/distribution
   * Get task distribution analysis
   */
  fastify.get(
    '/team/:teamId/distribution',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: periodSchema,
        tags: ['workload', 'team', 'distribution'],
        summary: 'Get task distribution',
        description: 'Analyze how tasks are distributed across the team',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = periodSchema.parse(request.query);

      const distribution = await analyzeDistribution(teamId, {
        periodDays: query.periodDays || 30,
      });

      return {
        success: true,
        data: distribution,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/imbalances
   * Get workload imbalances
   */
  fastify.get(
    '/team/:teamId/imbalances',
    {
      schema: {
        params: teamIdParamSchema,
        tags: ['workload', 'team'],
        summary: 'Get workload imbalances',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);

      const imbalances = await identifyWorkloadImbalances(teamId);

      return {
        success: true,
        data: imbalances,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/redistribution
   * Get redistribution plan for the team
   */
  fastify.get(
    '/team/:teamId/redistribution',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: redistributionQuerySchema,
        tags: ['workload', 'team', 'redistribution'],
        summary: 'Get redistribution plan',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = redistributionQuerySchema.parse(request.query);

      const plan = await generateRedistributionPlan(teamId, {
        maxSuggestions: query.maxSuggestions || 20,
        constraints: {
          respectSkills: query.respectSkills ?? true,
          respectDeadlines: query.respectDeadlines ?? true,
        },
      });

      return {
        success: true,
        data: plan,
      };
    }
  );

  /**
   * POST /workload/team/:teamId/redistribute
   * Apply a redistribution suggestion
   */
  fastify.post(
    '/team/:teamId/redistribute',
    {
      schema: {
        params: teamIdParamSchema,
        body: z.object({
          suggestionId: z.string(),
          suggestion: z.object({
            taskId: z.string(),
            targetAssignee: z.string().uuid(),
          }),
        }),
        tags: ['workload', 'team', 'redistribution'],
        summary: 'Apply redistribution',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = z.object({
        suggestionId: z.string(),
        suggestion: z.object({
          taskId: z.string(),
          targetAssignee: z.string().uuid(),
        }),
      }).parse(request.body);

      const result = await applySuggestion(body.suggestionId, body.suggestion as any);

      return {
        success: result.success,
        data: result,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/optimize
   * Get optimization recommendations
   */
  fastify.get(
    '/team/:teamId/optimize',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: optimizationConfigSchema,
        tags: ['workload', 'team', 'optimization'],
        summary: 'Get optimization recommendations',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const config = optimizationConfigSchema.parse(request.query);

      const optimization = await optimizeTeamWorkload(teamId, config);

      return {
        success: true,
        data: optimization,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/optimize/quick
   * Get quick optimization suggestions
   */
  fastify.get(
    '/team/:teamId/optimize/quick',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(20).optional(),
        }),
        tags: ['workload', 'team', 'optimization'],
        summary: 'Get quick suggestions',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(20).optional(),
      }).parse(request.query);

      const suggestions = await getQuickSuggestions(teamId, query.limit || 5);

      return {
        success: true,
        data: suggestions,
      };
    }
  );

  /**
   * POST /workload/team/:teamId/optimize/simulate
   * Simulate proposed task moves
   */
  fastify.post(
    '/team/:teamId/optimize/simulate',
    {
      schema: {
        params: teamIdParamSchema,
        body: z.object({
          moves: z.array(z.object({
            taskId: z.string(),
            toPersonId: z.string().uuid(),
          })),
        }),
        tags: ['workload', 'team', 'optimization'],
        summary: 'Simulate moves',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const body = z.object({
        moves: z.array(z.object({
          taskId: z.string(),
          toPersonId: z.string().uuid(),
        })),
      }).parse(request.body);

      const simulation = await simulateMoves(teamId, body.moves);

      return {
        success: true,
        data: simulation,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/forecast
   * Get team workload forecast
   */
  fastify.get(
    '/team/:teamId/forecast',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: forecastQuerySchema,
        tags: ['workload', 'team', 'forecast'],
        summary: 'Get team forecast',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = forecastQuerySchema.parse(request.query);

      const forecast = await forecastTeamWorkload(teamId, {
        forecastDays: query.forecastDays || 30,
      });

      return {
        success: true,
        data: forecast,
      };
    }
  );

  // ==================== CAPACITY PLANNING ENDPOINTS ====================

  /**
   * GET /workload/team/:teamId/capacity
   * Get capacity plan
   */
  fastify.get(
    '/team/:teamId/capacity',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: z.object({
          planningDays: z.coerce.number().int().min(7).max(90).optional(),
        }),
        tags: ['workload', 'team', 'capacity'],
        summary: 'Get capacity plan',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = z.object({
        planningDays: z.coerce.number().int().min(7).max(90).optional(),
      }).parse(request.query);

      const plan = await createCapacityPlan(teamId, {
        planningDays: query.planningDays || 30,
      });

      return {
        success: true,
        data: plan,
      };
    }
  );

  /**
   * POST /workload/team/:teamId/capacity/scenario
   * Analyze a capacity scenario
   */
  fastify.post(
    '/team/:teamId/capacity/scenario',
    {
      schema: {
        params: teamIdParamSchema,
        body: capacityScenarioSchema,
        tags: ['workload', 'team', 'capacity'],
        summary: 'Analyze capacity scenario',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const scenario = capacityScenarioSchema.parse(request.body);

      const analysis = await analyzeScenario(teamId, scenario.changes as any);

      return {
        success: true,
        data: analysis,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/capacity/forecast
   * Get capacity forecast
   */
  fastify.get(
    '/team/:teamId/capacity/forecast',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: z.object({
          forecastDays: z.coerce.number().int().min(7).max(180).optional(),
        }),
        tags: ['workload', 'team', 'capacity'],
        summary: 'Get capacity forecast',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = z.object({
        forecastDays: z.coerce.number().int().min(7).max(180).optional(),
      }).parse(request.query);

      const forecast = await getCapacityForecast(teamId, {
        forecastDays: query.forecastDays || 60,
      });

      return {
        success: true,
        data: forecast,
      };
    }
  );

  // ==================== CALENDAR & MEETING ENDPOINTS ====================

  /**
   * GET /workload/person/:personId/calendar
   * Get calendar analysis
   */
  fastify.get(
    '/person/:personId/calendar',
    {
      schema: {
        params: personIdParamSchema,
        tags: ['workload', 'calendar'],
        summary: 'Get calendar analysis',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);

      const analysis = await analyzeCalendar(personId);

      return {
        success: true,
        data: analysis,
      };
    }
  );

  /**
   * GET /workload/person/:personId/meetings
   * Get meeting analysis
   */
  fastify.get(
    '/person/:personId/meetings',
    {
      schema: {
        params: personIdParamSchema,
        querystring: periodSchema,
        tags: ['workload', 'meetings'],
        summary: 'Get meeting analysis',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = periodSchema.parse(request.query);

      const analysis = await analyzeMeetings(personId, {
        periodDays: query.periodDays || 30,
      });

      return {
        success: true,
        data: analysis,
      };
    }
  );

  /**
   * GET /workload/person/:personId/meetings/stats
   * Get meeting statistics
   */
  fastify.get(
    '/person/:personId/meetings/stats',
    {
      schema: {
        params: personIdParamSchema,
        querystring: periodSchema,
        tags: ['workload', 'meetings'],
        summary: 'Get meeting stats',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const query = periodSchema.parse(request.query);

      const stats = await getMeetingStats(personId, {
        periodDays: query.periodDays || 30,
      });

      return {
        success: true,
        data: stats,
      };
    }
  );

  /**
   * GET /workload/person/:personId/meetings/optimize
   * Get meeting optimization suggestions
   */
  fastify.get(
    '/person/:personId/meetings/optimize',
    {
      schema: {
        params: personIdParamSchema,
        tags: ['workload', 'meetings'],
        summary: 'Get meeting optimizations',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);

      const optimizations = await getMeetingOptimizations(personId);

      return {
        success: true,
        data: optimizations,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/meetings
   * Get team meeting analysis
   */
  fastify.get(
    '/team/:teamId/meetings',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: periodSchema,
        tags: ['workload', 'team', 'meetings'],
        summary: 'Get team meeting analysis',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = periodSchema.parse(request.query);

      const analysis = await analyzeTeamMeetings(teamId, {
        periodDays: query.periodDays || 30,
      });

      return {
        success: true,
        data: analysis,
      };
    }
  );

  // ==================== AVAILABILITY ENDPOINTS ====================

  /**
   * GET /workload/person/:personId/availability
   * Get person availability
   */
  fastify.get(
    '/person/:personId/availability',
    {
      schema: {
        params: personIdParamSchema,
        tags: ['workload', 'availability'],
        summary: 'Get person availability',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);

      const availability = await getPersonAvailability(personId);

      return {
        success: true,
        data: availability,
      };
    }
  );

  /**
   * PUT /workload/person/:personId/availability/status
   * Update availability status
   */
  fastify.put(
    '/person/:personId/availability/status',
    {
      schema: {
        params: personIdParamSchema,
        body: statusUpdateSchema,
        tags: ['workload', 'availability'],
        summary: 'Update availability status',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { personId } = personIdParamSchema.parse(request.params);
      const body = statusUpdateSchema.parse(request.body);

      const updated = await setStatus(personId, body.status, {
        until: body.until ? new Date(body.until) : undefined,
        customMessage: body.customMessage,
      });

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * GET /workload/team/:teamId/availability
   * Get team availability overview
   */
  fastify.get(
    '/team/:teamId/availability',
    {
      schema: {
        params: teamIdParamSchema,
        querystring: z.object({
          includeSchedules: z.coerce.boolean().optional(),
          futureHours: z.coerce.number().int().min(1).max(48).optional(),
        }),
        tags: ['workload', 'team', 'availability'],
        summary: 'Get team availability',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = z.object({
        includeSchedules: z.coerce.boolean().optional(),
        futureHours: z.coerce.number().int().min(1).max(48).optional(),
      }).parse(request.query);

      const availability = await getTeamAvailability(teamId, {
        includeSchedules: query.includeSchedules ?? true,
        futureHours: query.futureHours || 8,
      });

      return {
        success: true,
        data: availability,
      };
    }
  );

  /**
   * POST /workload/scheduling/suggestions
   * Get scheduling suggestions for a meeting
   */
  fastify.post(
    '/scheduling/suggestions',
    {
      schema: {
        body: schedulingRequestSchema,
        tags: ['workload', 'scheduling'],
        summary: 'Get scheduling suggestions',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = schedulingRequestSchema.parse(request.body);

      const within = body.withinDays
        ? {
            start: new Date(),
            end: new Date(Date.now() + body.withinDays * 24 * 60 * 60 * 1000),
          }
        : undefined;

      const suggestions = await getSchedulingSuggestions(body.attendeeIds, {
        duration: body.duration,
        within,
        maxSuggestions: body.maxSuggestions || 5,
      });

      return {
        success: true,
        data: suggestions,
      };
    }
  );

  /**
   * POST /workload/scheduling/common-availability
   * Find common availability across people
   */
  fastify.post(
    '/scheduling/common-availability',
    {
      schema: {
        body: z.object({
          personIds: z.array(z.string().uuid()).min(2),
          minDuration: z.coerce.number().int().min(15).max(480).optional(),
          withinDays: z.coerce.number().int().min(1).max(14).optional(),
        }),
        tags: ['workload', 'scheduling'],
        summary: 'Find common availability',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = z.object({
        personIds: z.array(z.string().uuid()).min(2),
        minDuration: z.coerce.number().int().min(15).max(480).optional(),
        withinDays: z.coerce.number().int().min(1).max(14).optional(),
      }).parse(request.body);

      const start = new Date();
      const end = new Date(Date.now() + (body.withinDays || 7) * 24 * 60 * 60 * 1000);

      const slots = await findCommonAvailability(body.personIds, start, end, {
        minDuration: body.minDuration || 30,
      });

      return {
        success: true,
        data: slots,
      };
    }
  );

  // ==================== WARNING MANAGEMENT ENDPOINTS ====================

  /**
   * POST /workload/warnings/:warningId/acknowledge
   * Acknowledge a warning
   */
  fastify.post(
    '/warnings/:warningId/acknowledge',
    {
      schema: {
        params: warningIdParamSchema,
        tags: ['workload', 'warnings'],
        summary: 'Acknowledge warning',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { warningId } = warningIdParamSchema.parse(request.params);
      const userId = request.userId!;

      const warning = await acknowledgeWarning(warningId, userId);

      return {
        success: true,
        data: warning,
      };
    }
  );

  /**
   * POST /workload/warnings/:warningId/resolve
   * Resolve a warning
   */
  fastify.post(
    '/warnings/:warningId/resolve',
    {
      schema: {
        params: warningIdParamSchema,
        body: z.object({
          resolution: z.string().max(500).optional(),
        }),
        tags: ['workload', 'warnings'],
        summary: 'Resolve warning',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { warningId } = warningIdParamSchema.parse(request.params);
      const body = z.object({
        resolution: z.string().max(500).optional(),
      }).parse(request.body);

      const warning = await resolveWarning(warningId, body.resolution || 'Resolved');

      return {
        success: true,
        data: warning,
      };
    }
  );

  /**
   * GET /workload/warnings/history
   * Get warning history
   */
  fastify.get(
    '/warnings/history',
    {
      schema: {
        querystring: z.object({
          personId: z.string().uuid().optional(),
          days: z.coerce.number().int().min(1).max(365).optional(),
          includeResolved: z.coerce.boolean().optional(),
        }),
        tags: ['workload', 'warnings'],
        summary: 'Get warning history',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = z.object({
        personId: z.string().uuid().optional(),
        days: z.coerce.number().int().min(1).max(365).optional(),
        includeResolved: z.coerce.boolean().optional(),
      }).parse(request.query);

      if (!query.personId) {
        return reply.status(400).send({
          success: false,
          error: 'personId is required',
        });
      }

      const history = await getWarningHistory(query.personId, {
        days: query.days || 30,
        includeResolved: query.includeResolved ?? false,
      });

      return {
        success: true,
        data: history,
      };
    }
  );

  // ==================== NOTIFICATION ENDPOINTS ====================

  /**
   * GET /workload/notifications
   * Get manager notifications
   */
  fastify.get(
    '/notifications',
    {
      schema: {
        querystring: paginationSchema.extend({
          status: z.string().optional(),
          types: z.string().optional(),
        }),
        tags: ['workload', 'notifications'],
        summary: 'Get notifications',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId!;
      const query = paginationSchema.extend({
        status: z.string().optional(),
        types: z.string().optional(),
      }).parse(request.query);

      const notifications = await getManagerNotifications(userId, {
        status: query.status?.split(',') as any,
        types: query.types?.split(',') as any,
        limit: query.limit || 50,
        offset: query.offset || 0,
      });

      return {
        success: true,
        data: notifications,
      };
    }
  );

  /**
   * POST /workload/notifications/:notificationId/read
   * Mark notification as read
   */
  fastify.post(
    '/notifications/:notificationId/read',
    {
      schema: {
        params: notificationIdParamSchema,
        tags: ['workload', 'notifications'],
        summary: 'Mark as read',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notificationId } = notificationIdParamSchema.parse(request.params);

      const notification = await markAsRead(notificationId);

      return {
        success: true,
        data: notification,
      };
    }
  );

  /**
   * POST /workload/notifications/:notificationId/action
   * Mark notification as actioned
   */
  fastify.post(
    '/notifications/:notificationId/action',
    {
      schema: {
        params: notificationIdParamSchema,
        body: z.object({
          actionId: z.string(),
        }),
        tags: ['workload', 'notifications'],
        summary: 'Mark as actioned',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notificationId } = notificationIdParamSchema.parse(request.params);
      const body = z.object({
        actionId: z.string(),
      }).parse(request.body);

      const notification = await markAsActioned(notificationId, body.actionId);

      return {
        success: true,
        data: notification,
      };
    }
  );

  /**
   * POST /workload/notifications/:notificationId/dismiss
   * Dismiss notification
   */
  fastify.post(
    '/notifications/:notificationId/dismiss',
    {
      schema: {
        params: notificationIdParamSchema,
        tags: ['workload', 'notifications'],
        summary: 'Dismiss notification',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notificationId } = notificationIdParamSchema.parse(request.params);

      const notification = await dismissNotification(notificationId);

      return {
        success: true,
        data: notification,
      };
    }
  );

  /**
   * GET /workload/notifications/preferences
   * Get notification preferences
   */
  fastify.get(
    '/notifications/preferences',
    {
      schema: {
        tags: ['workload', 'notifications'],
        summary: 'Get notification preferences',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId!;

      const preferences = await getManagerPreferences(userId);

      return {
        success: true,
        data: preferences,
      };
    }
  );

  /**
   * PUT /workload/notifications/preferences
   * Update notification preferences
   */
  fastify.put(
    '/notifications/preferences',
    {
      schema: {
        body: z.object({
          enabledTypes: z.array(z.string()).optional(),
          minimumPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          digestFrequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']).optional(),
        }),
        tags: ['workload', 'notifications'],
        summary: 'Update notification preferences',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId!;
      const body = z.object({
        enabledTypes: z.array(z.string()).optional(),
        minimumPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        digestFrequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']).optional(),
      }).parse(request.body);

      const preferences = await updateManagerPreferences(userId, body as any);

      return {
        success: true,
        data: preferences,
      };
    }
  );

  // ==================== JOB MANAGEMENT ENDPOINTS ====================

  /**
   * POST /workload/jobs/collect-metrics
   * Trigger metrics collection
   */
  fastify.post(
    '/jobs/collect-metrics',
    {
      schema: {
        body: z.object({
          personId: z.string().uuid().optional(),
          teamId: z.string().uuid().optional(),
        }),
        tags: ['workload', 'jobs'],
        summary: 'Trigger metrics collection',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = z.object({
        personId: z.string().uuid().optional(),
        teamId: z.string().uuid().optional(),
      }).parse(request.body);

      let jobId: string;

      if (body.personId) {
        jobId = await schedulePersonMetrics(body.personId);
      } else if (body.teamId) {
        jobId = await scheduleTeamMetrics(body.teamId);
      } else {
        return reply.status(400).send({
          success: false,
          error: 'Either personId or teamId is required',
        });
      }

      return {
        success: true,
        data: { jobId },
      };
    }
  );

  /**
   * POST /workload/jobs/analyze-burnout
   * Trigger burnout analysis
   */
  fastify.post(
    '/jobs/analyze-burnout',
    {
      schema: {
        body: z.object({
          personId: z.string().uuid(),
          notifyManager: z.boolean().optional(),
        }),
        tags: ['workload', 'jobs'],
        summary: 'Trigger burnout analysis',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = z.object({
        personId: z.string().uuid(),
        notifyManager: z.boolean().optional(),
      }).parse(request.body);

      const jobId = await scheduleBurnoutAnalysis(body.personId, {
        notifyManager: body.notifyManager ?? true,
      });

      return {
        success: true,
        data: { jobId },
      };
    }
  );

  /**
   * GET /workload/jobs/status
   * Get job processor status
   */
  fastify.get(
    '/jobs/status',
    {
      schema: {
        tags: ['workload', 'jobs'],
        summary: 'Get job status',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [stats, queueStatus] = await Promise.all([
        getProcessorStats(),
        getQueueStatus(),
      ]);

      return {
        success: true,
        data: {
          stats,
          queue: queueStatus,
        },
      };
    }
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}
