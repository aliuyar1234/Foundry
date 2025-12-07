/**
 * Network Analysis API Routes
 * Endpoints for organizational network analysis, influence, communities
 * T239-T243 - Network analysis API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import {
  buildCommunicationNetwork,
  buildEgoNetwork,
  getDepartmentNetwork,
} from '../../services/analysis/network/networkBuilder.js';
import {
  calculateAllCentralityMetrics,
  storeCentralityMetrics,
} from '../../services/analysis/network/centrality.js';
import {
  calculateInfluenceScores,
  getTopInfluencers,
  getPersonInfluenceScore,
  getInfluenceHierarchyGap,
} from '../../services/analysis/network/influenceScorer.js';
import {
  detectCommunities,
  getPersonCommunity,
  findCommunityBridges,
} from '../../services/analysis/network/communityDetection.js';
import {
  compareHierarchies,
  getHierarchyDiscrepancies,
  getShadowLeaders,
  getUnderLeveragedLeaders,
} from '../../services/analysis/network/hierarchyComparison.js';
import {
  detectHiddenInfluencers,
  getHiddenInfluencersByType,
  getDepartmentHiddenInfluencers,
  analyzeHiddenInfluenceRisk,
  HiddenInfluenceType,
} from '../../services/analysis/network/hiddenInfluencers.js';
import {
  analyzePatterns,
  getPersonPattern,
  getDepartmentPatterns,
} from '../../services/analysis/network/patternAnalyzer.js';
import { addJob, QueueNames } from '../../jobs/queue.js';
import { NetworkAnalysisJobData, NetworkAnalysisType } from '../../jobs/processors/networkAnalysisProcessor.js';

// Request schemas
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const networkQuerySchema = z.object({
  minCommunications: z.coerce.number().int().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const emailParamSchema = z.object({
  email: z.string().email(),
});

const egoNetworkQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(3).optional(),
});

const communityQuerySchema = z.object({
  minCommunitySize: z.coerce.number().int().min(2).optional(),
  maxIterations: z.coerce.number().int().min(5).max(50).optional(),
});

const hiddenInfluencerQuerySchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  type: z.string().optional(),
});

const patternQuerySchema = z.object({
  timeframeDays: z.coerce.number().int().min(7).max(365).optional(),
});

const analysisJobSchema = z.object({
  analysisTypes: z.array(z.enum([
    'network', 'centrality', 'influence', 'community',
    'hierarchy', 'hidden-influencers', 'patterns', 'full',
  ])),
  options: z.object({
    minCommunications: z.number().int().min(1).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    minCommunitySize: z.number().int().min(2).optional(),
    maxIterations: z.number().int().optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    timeframeDays: z.number().int().optional(),
  }).optional(),
});

export default async function networkRoutes(fastify: FastifyInstance) {
  const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
  const prisma = new PrismaClient();

  // ==================== NETWORK OVERVIEW ENDPOINTS ====================

  /**
   * GET /network
   * Get communication network overview
   */
  fastify.get(
    '/',
    {
      schema: {
        querystring: networkQuerySchema,
        tags: ['network'],
        summary: 'Get communication network',
        description: 'Get the organizational communication network with nodes and edges',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = networkQuerySchema.parse(request.query);

      const network = await buildCommunicationNetwork({
        organizationId,
        minCommunications: query.minCommunications,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      });

      return {
        success: true,
        data: network,
      };
    }
  );

  /**
   * GET /network/stats
   * Get network statistics summary
   */
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['network'],
        summary: 'Get network statistics',
        description: 'Get aggregate statistics about the communication network',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const network = await buildCommunicationNetwork({ organizationId });

      return {
        success: true,
        data: network.stats,
      };
    }
  );

  /**
   * GET /network/departments
   * Get inter-departmental communication network
   */
  fastify.get(
    '/departments',
    {
      schema: {
        tags: ['network'],
        summary: 'Get department network',
        description: 'Get communication patterns between departments',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const deptNetwork = await getDepartmentNetwork(organizationId);

      return {
        success: true,
        data: deptNetwork,
      };
    }
  );

  /**
   * GET /network/person/:email
   * Get ego network for a specific person
   */
  fastify.get(
    '/person/:email',
    {
      schema: {
        params: emailParamSchema,
        querystring: egoNetworkQuerySchema,
        tags: ['network'],
        summary: 'Get person ego network',
        description: 'Get the communication network centered on a specific person',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { email } = emailParamSchema.parse(request.params);
      const query = egoNetworkQuerySchema.parse(request.query);

      const egoNetwork = await buildEgoNetwork(
        organizationId,
        email,
        query.depth || 1
      );

      return {
        success: true,
        data: egoNetwork,
      };
    }
  );

  // ==================== CENTRALITY ENDPOINTS ====================

  /**
   * GET /network/centrality
   * Get centrality metrics for all persons
   */
  fastify.get(
    '/centrality',
    {
      schema: {
        querystring: paginationSchema,
        tags: ['network', 'centrality'],
        summary: 'Get centrality metrics',
        description: 'Get degree, betweenness, closeness, and PageRank centrality for all persons',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = paginationSchema.parse(request.query);

      const centrality = await calculateAllCentralityMetrics(organizationId);

      const offset = query.offset || 0;
      const limit = query.limit || 50;
      const paged = centrality.persons.slice(offset, offset + limit);

      return {
        success: true,
        data: {
          persons: paged,
          stats: centrality.stats,
        },
        meta: {
          total: centrality.persons.length,
          limit,
          offset,
        },
      };
    }
  );

  /**
   * POST /network/centrality/calculate
   * Recalculate and store centrality metrics
   */
  fastify.post(
    '/centrality/calculate',
    {
      schema: {
        tags: ['network', 'centrality'],
        summary: 'Recalculate centrality metrics',
        description: 'Trigger recalculation of all centrality metrics',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const centrality = await calculateAllCentralityMetrics(organizationId);
      await storeCentralityMetrics(organizationId, centrality);

      return {
        success: true,
        data: {
          calculated: centrality.persons.length,
          stats: centrality.stats,
        },
      };
    }
  );

  // ==================== INFLUENCE ENDPOINTS ====================

  /**
   * GET /network/influence
   * Get influence scores for all persons
   */
  fastify.get(
    '/influence',
    {
      schema: {
        querystring: paginationSchema,
        tags: ['network', 'influence'],
        summary: 'Get influence scores',
        description: 'Get composite influence scores for all persons',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = paginationSchema.parse(request.query);

      const influence = await calculateInfluenceScores(organizationId);

      const offset = query.offset || 0;
      const limit = query.limit || 50;
      const paged = influence.influencers.slice(offset, offset + limit);

      return {
        success: true,
        data: {
          influencers: paged,
          stats: influence.stats,
        },
        meta: {
          total: influence.influencers.length,
          limit,
          offset,
        },
      };
    }
  );

  /**
   * GET /network/influence/top
   * Get top influencers
   */
  fastify.get(
    '/influence/top',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).optional(),
        }),
        tags: ['network', 'influence'],
        summary: 'Get top influencers',
        description: 'Get the top N most influential people',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(50).optional(),
      }).parse(request.query);

      const topInfluencers = await getTopInfluencers(
        organizationId,
        query.limit || 20
      );

      return {
        success: true,
        data: topInfluencers,
      };
    }
  );

  /**
   * GET /network/influence/person/:email
   * Get influence score for a specific person
   */
  fastify.get(
    '/influence/person/:email',
    {
      schema: {
        params: emailParamSchema,
        tags: ['network', 'influence'],
        summary: 'Get person influence score',
        description: 'Get detailed influence score for a specific person',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { email } = emailParamSchema.parse(request.params);

      const influence = await getPersonInfluenceScore(organizationId, email);

      if (!influence) {
        return reply.status(404).send({
          success: false,
          error: 'Person not found',
        });
      }

      return {
        success: true,
        data: influence,
      };
    }
  );

  /**
   * GET /network/influence/hierarchy-gap
   * Get influence vs hierarchy position gap analysis
   */
  fastify.get(
    '/influence/hierarchy-gap',
    {
      schema: {
        querystring: paginationSchema,
        tags: ['network', 'influence'],
        summary: 'Get influence-hierarchy gaps',
        description: 'Compare influence scores with formal hierarchy positions',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = paginationSchema.parse(request.query);

      const gaps = await getInfluenceHierarchyGap(organizationId);

      const offset = query.offset || 0;
      const limit = query.limit || 50;
      const paged = gaps.slice(offset, offset + limit);

      return {
        success: true,
        data: paged,
        meta: {
          total: gaps.length,
          limit,
          offset,
        },
      };
    }
  );

  // ==================== COMMUNITY ENDPOINTS ====================

  /**
   * GET /network/communities
   * Detect and get communities
   */
  fastify.get(
    '/communities',
    {
      schema: {
        querystring: communityQuerySchema,
        tags: ['network', 'community'],
        summary: 'Get communities',
        description: 'Detect communities using Louvain algorithm',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = communityQuerySchema.parse(request.query);

      const communities = await detectCommunities(organizationId, {
        minCommunitySize: query.minCommunitySize,
        maxIterations: query.maxIterations,
      });

      return {
        success: true,
        data: communities,
      };
    }
  );

  /**
   * GET /network/communities/person/:email
   * Get community for a specific person
   */
  fastify.get(
    '/communities/person/:email',
    {
      schema: {
        params: emailParamSchema,
        tags: ['network', 'community'],
        summary: 'Get person community',
        description: 'Get the community a person belongs to',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { email } = emailParamSchema.parse(request.params);

      const community = await getPersonCommunity(organizationId, email);

      if (!community) {
        return reply.status(404).send({
          success: false,
          error: 'Person not found or not assigned to a community',
        });
      }

      return {
        success: true,
        data: community,
      };
    }
  );

  /**
   * GET /network/communities/bridges
   * Get people who bridge communities
   */
  fastify.get(
    '/communities/bridges',
    {
      schema: {
        tags: ['network', 'community'],
        summary: 'Get community bridges',
        description: 'Get people who connect multiple communities',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const bridges = await findCommunityBridges(organizationId);

      return {
        success: true,
        data: bridges,
      };
    }
  );

  // ==================== HIERARCHY ENDPOINTS ====================

  /**
   * GET /network/hierarchy
   * Compare formal vs informal hierarchy
   */
  fastify.get(
    '/hierarchy',
    {
      schema: {
        tags: ['network', 'hierarchy'],
        summary: 'Get hierarchy comparison',
        description: 'Compare formal organizational hierarchy with actual influence patterns',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const comparison = await compareHierarchies(organizationId);

      return {
        success: true,
        data: comparison,
      };
    }
  );

  /**
   * GET /network/hierarchy/discrepancies
   * Get people with significant hierarchy discrepancies
   */
  fastify.get(
    '/hierarchy/discrepancies',
    {
      schema: {
        querystring: z.object({
          minDiscrepancy: z.coerce.number().int().min(1).max(5).optional(),
        }),
        tags: ['network', 'hierarchy'],
        summary: 'Get hierarchy discrepancies',
        description: 'Get people whose influence differs significantly from their formal position',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = z.object({
        minDiscrepancy: z.coerce.number().int().min(1).max(5).optional(),
      }).parse(request.query);

      const discrepancies = await getHierarchyDiscrepancies(
        organizationId,
        query.minDiscrepancy || 2
      );

      return {
        success: true,
        data: discrepancies,
      };
    }
  );

  /**
   * GET /network/hierarchy/shadow-leaders
   * Get shadow leaders (high influence without formal authority)
   */
  fastify.get(
    '/hierarchy/shadow-leaders',
    {
      schema: {
        tags: ['network', 'hierarchy'],
        summary: 'Get shadow leaders',
        description: 'Get people with high influence but low formal authority',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const shadowLeaders = await getShadowLeaders(organizationId);

      return {
        success: true,
        data: shadowLeaders,
      };
    }
  );

  /**
   * GET /network/hierarchy/under-leveraged
   * Get under-leveraged leaders
   */
  fastify.get(
    '/hierarchy/under-leveraged',
    {
      schema: {
        tags: ['network', 'hierarchy'],
        summary: 'Get under-leveraged leaders',
        description: 'Get formal leaders with lower than expected influence',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const underLeveraged = await getUnderLeveragedLeaders(organizationId);

      return {
        success: true,
        data: underLeveraged,
      };
    }
  );

  // ==================== HIDDEN INFLUENCER ENDPOINTS ====================

  /**
   * GET /network/hidden-influencers
   * Detect hidden influencers
   */
  fastify.get(
    '/hidden-influencers',
    {
      schema: {
        querystring: hiddenInfluencerQuerySchema,
        tags: ['network', 'hidden-influencers'],
        summary: 'Get hidden influencers',
        description: 'Detect people with disproportionate influence relative to their position',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = hiddenInfluencerQuerySchema.parse(request.query);

      let result;
      if (query.type) {
        result = {
          hiddenInfluencers: await getHiddenInfluencersByType(
            organizationId,
            query.type as HiddenInfluenceType
          ),
          stats: null,
        };
      } else {
        result = await detectHiddenInfluencers(organizationId, {
          minConfidence: query.minConfidence,
        });
      }

      return {
        success: true,
        data: result,
      };
    }
  );

  /**
   * GET /network/hidden-influencers/risk
   * Get hidden influence risk analysis
   */
  fastify.get(
    '/hidden-influencers/risk',
    {
      schema: {
        tags: ['network', 'hidden-influencers'],
        summary: 'Get hidden influence risk',
        description: 'Analyze key person dependency risk from hidden influencers',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const risk = await analyzeHiddenInfluenceRisk(organizationId);

      return {
        success: true,
        data: risk,
      };
    }
  );

  /**
   * GET /network/hidden-influencers/department/:department
   * Get hidden influencers in a department
   */
  fastify.get(
    '/hidden-influencers/department/:department',
    {
      schema: {
        params: z.object({
          department: z.string(),
        }),
        tags: ['network', 'hidden-influencers'],
        summary: 'Get department hidden influencers',
        description: 'Get hidden influencers within a specific department',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { department } = z.object({
        department: z.string(),
      }).parse(request.params);

      const influencers = await getDepartmentHiddenInfluencers(
        organizationId,
        department
      );

      return {
        success: true,
        data: influencers,
      };
    }
  );

  // ==================== PATTERN ANALYSIS ENDPOINTS ====================

  /**
   * GET /network/patterns
   * Analyze communication patterns
   */
  fastify.get(
    '/patterns',
    {
      schema: {
        querystring: patternQuerySchema,
        tags: ['network', 'patterns'],
        summary: 'Get communication patterns',
        description: 'Analyze temporal and behavioral communication patterns',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const query = patternQuerySchema.parse(request.query);

      const patterns = await analyzePatterns(organizationId, {
        timeframeDays: query.timeframeDays,
      });

      return {
        success: true,
        data: patterns,
      };
    }
  );

  /**
   * GET /network/patterns/person/:email
   * Get communication pattern for a specific person
   */
  fastify.get(
    '/patterns/person/:email',
    {
      schema: {
        params: emailParamSchema,
        tags: ['network', 'patterns'],
        summary: 'Get person communication pattern',
        description: 'Get detailed communication pattern for a specific person',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const { email } = emailParamSchema.parse(request.params);

      const pattern = await getPersonPattern(organizationId, email);

      if (!pattern) {
        return reply.status(404).send({
          success: false,
          error: 'Person not found',
        });
      }

      return {
        success: true,
        data: pattern,
      };
    }
  );

  /**
   * GET /network/patterns/departments
   * Get department-level pattern summaries
   */
  fastify.get(
    '/patterns/departments',
    {
      schema: {
        tags: ['network', 'patterns'],
        summary: 'Get department patterns',
        description: 'Get communication pattern summaries by department',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;

      const deptPatterns = await getDepartmentPatterns(organizationId);

      return {
        success: true,
        data: deptPatterns,
      };
    }
  );

  // ==================== ANALYSIS JOB ENDPOINTS ====================

  /**
   * POST /network/analyze
   * Trigger a network analysis job
   */
  fastify.post(
    '/analyze',
    {
      schema: {
        body: analysisJobSchema,
        tags: ['network', 'jobs'],
        summary: 'Trigger network analysis',
        description: 'Start a background job to run comprehensive network analysis',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.organizationId!;
      const body = analysisJobSchema.parse(request.body);

      const jobData: NetworkAnalysisJobData = {
        organizationId,
        analysisTypes: body.analysisTypes as NetworkAnalysisType[],
        options: body.options,
        triggeredBy: 'manual',
      };

      const job = await addJob(
        QueueNames.NETWORK_ANALYSIS,
        'network-analysis',
        jobData
      );

      return {
        success: true,
        data: {
          jobId: job.id,
          status: 'queued',
          analysisTypes: body.analysisTypes,
        },
      };
    }
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await pool.end();
    await prisma.$disconnect();
  });
}
