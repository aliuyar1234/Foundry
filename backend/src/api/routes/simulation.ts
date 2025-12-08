/**
 * Simulation API Routes (T172-T175)
 * Routes for what-if simulation and impact analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  PersonnelSimulator,
  ProcessSimulator,
  OrgStructureSimulator,
  ImpactQuantifier,
  MitigationRecommender,
} from '../../services/simulation';
import { simulationJobOptions, type SimulationJobData } from '../../jobs/processors/simulationProcessor';
import { auditService } from '../../services/audit/auditService';
import { getRedis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';

// Initialize job queue
const simulationQueue = new Queue<SimulationJobData>('simulation', {
  connection: getRedis(),
});

// Validation schemas
const PersonnelChangeSchema = z.object({
  type: z.enum(['departure', 'absence', 'role_change', 'team_transfer']),
  personId: z.string(),
  targetRoleId: z.string().optional(),
  targetTeamId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  probability: z.number().min(0).max(100).optional(),
});

const ProcessChangeSchema = z.object({
  type: z.enum(['modification', 'elimination', 'automation', 'merger', 'split']),
  processId: z.string(),
  targetProcessId: z.string().optional(),
  modifications: z.object({
    addSteps: z.array(z.object({
      name: z.string(),
      duration: z.number().optional(),
      assignedTo: z.string().optional(),
      requiredSkills: z.array(z.string()).optional(),
    })).optional(),
    removeSteps: z.array(z.string()).optional(),
    modifySteps: z.array(z.object({
      id: z.string().optional(),
      name: z.string(),
      duration: z.number().optional(),
      assignedTo: z.string().optional(),
      requiredSkills: z.array(z.string()).optional(),
    })).optional(),
    changeOwner: z.string().optional(),
    changeFrequency: z.number().optional(),
  }).optional(),
  automationLevel: z.number().min(0).max(100).optional(),
});

const OrgStructureChangeSchema = z.object({
  type: z.enum(['team_merge', 'team_split', 'reporting_change', 'department_restructure', 'role_consolidation']),
  sourceTeamId: z.string().optional(),
  targetTeamId: z.string().optional(),
  sourceDepartmentId: z.string().optional(),
  targetDepartmentId: z.string().optional(),
  affectedPersonIds: z.array(z.string()).optional(),
  newManagerId: z.string().optional(),
  newStructure: z.object({
    name: z.string(),
    teams: z.array(z.string()).optional(),
    manager: z.string().optional(),
  }).optional(),
});

const CreateSimulationSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['personnel', 'process', 'organization', 'combined']),
  changes: z.object({
    personnel: z.array(PersonnelChangeSchema).optional(),
    process: z.array(ProcessChangeSchema).optional(),
    organization: z.array(OrgStructureChangeSchema).optional(),
  }),
  options: z.object({
    includeMitigation: z.boolean().default(true),
    includeFinancials: z.boolean().default(true),
    scenario: z.enum(['optimistic', 'realistic', 'pessimistic']).default('realistic'),
  }).optional(),
  runAsync: z.boolean().default(true),
});

const SimulationQuerySchema = z.object({
  types: z.string().optional(),
  statuses: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z.enum(['createdAt', 'completedAt', 'overallScore']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function simulationRoutes(fastify: FastifyInstance) {
  /**
   * GET /organizations/:organizationId/simulation
   * List all simulations for an organization
   */
  fastify.get(
    '/organizations/:organizationId/simulation',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string };
        Querystring: z.infer<typeof SimulationQuerySchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = request.params;
      const query = SimulationQuerySchema.parse(request.query);

      const where: Record<string, unknown> = { organizationId };

      if (query.types) {
        where.type = { in: query.types.split(',') };
      }

      if (query.statuses) {
        where.status = { in: query.statuses.split(',') };
      }

      const [simulations, total] = await Promise.all([
        prisma.simulation.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            status: true,
            overallScore: true,
            impactLevel: true,
            createdAt: true,
            completedAt: true,
            createdBy: true,
          },
          orderBy: { [query.sortBy]: query.sortOrder },
          take: query.limit,
          skip: query.offset,
        }),
        prisma.simulation.count({ where }),
      ]);

      return reply.send({
        data: simulations,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + simulations.length < total,
        },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/simulation/personnel
   * Run personnel change simulation (T172)
   */
  fastify.post(
    '/organizations/:organizationId/simulation/personnel',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string };
        Body: z.infer<typeof CreateSimulationSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = request.params;
      const body = CreateSimulationSchema.parse(request.body);
      const userId = (request as unknown as { user: { id: string } }).user?.id || 'system';

      if (!body.changes.personnel || body.changes.personnel.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Personnel changes are required for personnel simulation',
        });
      }

      const simulationId = uuidv4();

      // Create simulation record
      await prisma.simulation.create({
        data: {
          id: simulationId,
          organizationId,
          name: body.name,
          description: body.description,
          type: 'personnel',
          status: body.runAsync ? 'pending' : 'processing',
          changes: body.changes as unknown as Record<string, unknown>,
          options: body.options as unknown as Record<string, unknown>,
          createdBy: userId,
        },
      });

      if (body.runAsync) {
        // Queue job for async processing
        await simulationQueue.add(
          'personnel-simulation',
          {
            organizationId,
            simulationId,
            type: 'personnel',
            userId,
            name: body.name,
            changes: body.changes,
            options: body.options,
          },
          { ...simulationJobOptions, jobId: simulationId }
        );

        await auditService.log({
          organizationId,
          userId,
          action: 'simulation.created',
          resourceType: 'simulation',
          resourceId: simulationId,
          details: { type: 'personnel', name: body.name, async: true },
        });

        return reply.status(202).send({
          data: {
            id: simulationId,
            status: 'pending',
            message: 'Personnel simulation queued for processing',
          },
        });
      }

      // Run synchronously
      const simulator = new PersonnelSimulator(organizationId);
      const quantifier = new ImpactQuantifier();

      const impacts = await simulator.simulateChanges(body.changes.personnel);
      const quantifiedImpacts = impacts.map((i) => quantifier.quantifyPersonnelImpact(i));
      const aggregated = quantifiedImpacts.length > 1
        ? quantifier.aggregateImpacts(quantifiedImpacts)
        : quantifiedImpacts[0];

      let mitigation;
      if (body.options?.includeMitigation && aggregated) {
        const recommender = new MitigationRecommender();
        mitigation = recommender.generateMitigationPlan(aggregated);
      }

      // Update simulation record
      await prisma.simulation.update({
        where: { id: simulationId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          results: {
            impacts,
            quantified: aggregated,
            mitigation,
          } as unknown as Record<string, unknown>,
          overallScore: aggregated?.summary.overallScore,
          impactLevel: aggregated?.summary.impactLevel,
        },
      });

      await auditService.log({
        organizationId,
        userId,
        action: 'simulation.completed',
        resourceType: 'simulation',
        resourceId: simulationId,
        details: { type: 'personnel', name: body.name, async: false },
      });

      return reply.send({
        data: {
          id: simulationId,
          status: 'completed',
          summary: aggregated?.summary,
          impacts,
          quantified: aggregated,
          mitigation,
        },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/simulation/process
   * Run process change simulation (T173)
   */
  fastify.post(
    '/organizations/:organizationId/simulation/process',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string };
        Body: z.infer<typeof CreateSimulationSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = request.params;
      const body = CreateSimulationSchema.parse(request.body);
      const userId = (request as unknown as { user: { id: string } }).user?.id || 'system';

      if (!body.changes.process || body.changes.process.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Process changes are required for process simulation',
        });
      }

      const simulationId = uuidv4();

      // Create simulation record
      await prisma.simulation.create({
        data: {
          id: simulationId,
          organizationId,
          name: body.name,
          description: body.description,
          type: 'process',
          status: body.runAsync ? 'pending' : 'processing',
          changes: body.changes as unknown as Record<string, unknown>,
          options: body.options as unknown as Record<string, unknown>,
          createdBy: userId,
        },
      });

      if (body.runAsync) {
        await simulationQueue.add(
          'process-simulation',
          {
            organizationId,
            simulationId,
            type: 'process',
            userId,
            name: body.name,
            changes: body.changes,
            options: body.options,
          },
          { ...simulationJobOptions, jobId: simulationId }
        );

        await auditService.log({
          organizationId,
          userId,
          action: 'simulation.created',
          resourceType: 'simulation',
          resourceId: simulationId,
          details: { type: 'process', name: body.name, async: true },
        });

        return reply.status(202).send({
          data: {
            id: simulationId,
            status: 'pending',
            message: 'Process simulation queued for processing',
          },
        });
      }

      // Run synchronously
      const simulator = new ProcessSimulator(organizationId);
      const quantifier = new ImpactQuantifier();

      const impacts = [];
      for (const change of body.changes.process) {
        const impact = await simulator.simulateChange(change);
        impacts.push(impact);
      }

      const quantifiedImpacts = impacts.map((i) => quantifier.quantifyProcessImpact(i));
      const aggregated = quantifiedImpacts.length > 1
        ? quantifier.aggregateImpacts(quantifiedImpacts)
        : quantifiedImpacts[0];

      let mitigation;
      if (body.options?.includeMitigation && aggregated) {
        const recommender = new MitigationRecommender();
        mitigation = recommender.generateMitigationPlan(aggregated);
      }

      await prisma.simulation.update({
        where: { id: simulationId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          results: {
            impacts,
            quantified: aggregated,
            mitigation,
          } as unknown as Record<string, unknown>,
          overallScore: aggregated?.summary.overallScore,
          impactLevel: aggregated?.summary.impactLevel,
        },
      });

      await auditService.log({
        organizationId,
        userId,
        action: 'simulation.completed',
        resourceType: 'simulation',
        resourceId: simulationId,
        details: { type: 'process', name: body.name, async: false },
      });

      return reply.send({
        data: {
          id: simulationId,
          status: 'completed',
          summary: aggregated?.summary,
          impacts,
          quantified: aggregated,
          mitigation,
        },
      });
    }
  );

  /**
   * POST /organizations/:organizationId/simulation/organization
   * Run organization structure simulation (T174)
   */
  fastify.post(
    '/organizations/:organizationId/simulation/organization',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string };
        Body: z.infer<typeof CreateSimulationSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = request.params;
      const body = CreateSimulationSchema.parse(request.body);
      const userId = (request as unknown as { user: { id: string } }).user?.id || 'system';

      if (!body.changes.organization || body.changes.organization.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Organization changes are required for organization simulation',
        });
      }

      const simulationId = uuidv4();

      // Create simulation record
      await prisma.simulation.create({
        data: {
          id: simulationId,
          organizationId,
          name: body.name,
          description: body.description,
          type: 'organization',
          status: body.runAsync ? 'pending' : 'processing',
          changes: body.changes as unknown as Record<string, unknown>,
          options: body.options as unknown as Record<string, unknown>,
          createdBy: userId,
        },
      });

      if (body.runAsync) {
        await simulationQueue.add(
          'org-simulation',
          {
            organizationId,
            simulationId,
            type: 'organization',
            userId,
            name: body.name,
            changes: body.changes,
            options: body.options,
          },
          { ...simulationJobOptions, jobId: simulationId }
        );

        await auditService.log({
          organizationId,
          userId,
          action: 'simulation.created',
          resourceType: 'simulation',
          resourceId: simulationId,
          details: { type: 'organization', name: body.name, async: true },
        });

        return reply.status(202).send({
          data: {
            id: simulationId,
            status: 'pending',
            message: 'Organization simulation queued for processing',
          },
        });
      }

      // Run synchronously
      const simulator = new OrgStructureSimulator(organizationId);
      const quantifier = new ImpactQuantifier();

      const impacts = [];
      for (const change of body.changes.organization) {
        const impact = await simulator.simulateChange(change);
        impacts.push(impact);
      }

      const quantifiedImpacts = impacts.map((i) => quantifier.quantifyOrgStructureImpact(i));
      const aggregated = quantifiedImpacts.length > 1
        ? quantifier.aggregateImpacts(quantifiedImpacts)
        : quantifiedImpacts[0];

      let mitigation;
      if (body.options?.includeMitigation && aggregated) {
        const recommender = new MitigationRecommender();
        mitigation = recommender.generateMitigationPlan(aggregated);
      }

      await prisma.simulation.update({
        where: { id: simulationId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          results: {
            impacts,
            quantified: aggregated,
            mitigation,
          } as unknown as Record<string, unknown>,
          overallScore: aggregated?.summary.overallScore,
          impactLevel: aggregated?.summary.impactLevel,
        },
      });

      await auditService.log({
        organizationId,
        userId,
        action: 'simulation.completed',
        resourceType: 'simulation',
        resourceId: simulationId,
        details: { type: 'organization', name: body.name, async: false },
      });

      return reply.send({
        data: {
          id: simulationId,
          status: 'completed',
          summary: aggregated?.summary,
          impacts,
          quantified: aggregated,
          mitigation,
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/simulation/:simulationId/results
   * Get simulation results (T175)
   */
  fastify.get(
    '/organizations/:organizationId/simulation/:simulationId/results',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string; simulationId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId, simulationId } = request.params;

      const simulation = await prisma.simulation.findFirst({
        where: {
          id: simulationId,
          organizationId,
        },
      });

      if (!simulation) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Simulation not found',
        });
      }

      return reply.send({
        data: {
          id: simulation.id,
          name: simulation.name,
          description: simulation.description,
          type: simulation.type,
          status: simulation.status,
          progress: simulation.progress,
          statusMessage: simulation.statusMessage,
          overallScore: simulation.overallScore,
          impactLevel: simulation.impactLevel,
          changes: simulation.changes,
          options: simulation.options,
          results: simulation.results,
          createdAt: simulation.createdAt,
          completedAt: simulation.completedAt,
          createdBy: simulation.createdBy,
        },
      });
    }
  );

  /**
   * GET /organizations/:organizationId/simulation/:simulationId/status
   * Get simulation status (for polling)
   */
  fastify.get(
    '/organizations/:organizationId/simulation/:simulationId/status',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string; simulationId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId, simulationId } = request.params;

      const simulation = await prisma.simulation.findFirst({
        where: {
          id: simulationId,
          organizationId,
        },
        select: {
          id: true,
          status: true,
          progress: true,
          statusMessage: true,
          overallScore: true,
          impactLevel: true,
          completedAt: true,
          error: true,
        },
      });

      if (!simulation) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Simulation not found',
        });
      }

      return reply.send({ data: simulation });
    }
  );

  /**
   * DELETE /organizations/:organizationId/simulation/:simulationId
   * Delete a simulation
   */
  fastify.delete(
    '/organizations/:organizationId/simulation/:simulationId',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string; simulationId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId, simulationId } = request.params;
      const userId = (request as unknown as { user: { id: string } }).user?.id || 'system';

      const simulation = await prisma.simulation.findFirst({
        where: {
          id: simulationId,
          organizationId,
        },
      });

      if (!simulation) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Simulation not found',
        });
      }

      // Cancel job if pending/processing
      if (simulation.status === 'pending' || simulation.status === 'processing') {
        const job = await simulationQueue.getJob(simulationId);
        if (job) {
          await job.remove();
        }
      }

      await prisma.simulation.delete({
        where: { id: simulationId },
      });

      await auditService.log({
        organizationId,
        userId,
        action: 'simulation.deleted',
        resourceType: 'simulation',
        resourceId: simulationId,
        details: { name: simulation.name, type: simulation.type },
      });

      return reply.status(204).send();
    }
  );

  /**
   * POST /organizations/:organizationId/simulation/:simulationId/export
   * Export simulation results
   */
  fastify.post(
    '/organizations/:organizationId/simulation/:simulationId/export',
    async (
      request: FastifyRequest<{
        Params: { organizationId: string; simulationId: string };
        Body: { format: 'pdf' | 'docx' | 'json' };
      }>,
      reply: FastifyReply
    ) => {
      const { organizationId, simulationId } = request.params;
      const { format } = request.body;

      const simulation = await prisma.simulation.findFirst({
        where: {
          id: simulationId,
          organizationId,
        },
      });

      if (!simulation) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Simulation not found',
        });
      }

      if (simulation.status !== 'completed') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot export incomplete simulation',
        });
      }

      if (format === 'json') {
        return reply.send({
          data: {
            simulation: {
              id: simulation.id,
              name: simulation.name,
              type: simulation.type,
              completedAt: simulation.completedAt,
            },
            results: simulation.results,
          },
        });
      }

      // For PDF/DOCX, generate markdown first
      const markdown = generateSimulationMarkdown(simulation);

      // TODO: Use pdfExporter or docxExporter to convert
      // For now, return markdown
      return reply.send({
        data: {
          format,
          content: markdown,
          message: 'Export generated successfully',
        },
      });
    }
  );
}

/**
 * Generate markdown report from simulation results
 */
function generateSimulationMarkdown(simulation: {
  name: string;
  type: string;
  completedAt: Date | null;
  results: unknown;
  overallScore: number | null;
  impactLevel: string | null;
}): string {
  const results = simulation.results as {
    quantified?: {
      summary?: {
        keyTakeaway?: string;
      };
      financial?: {
        netFinancialImpact?: {
          fiveYear?: number;
        };
        roi?: {
          paybackMonths?: number;
        };
      };
      risk?: {
        topRisks?: Array<{ risk: string; score: number }>;
      };
    };
    mitigation?: {
      overallStrategy?: {
        approach?: string;
        rationale?: string;
      };
      riskMitigations?: Array<{ riskDescription: string; strategies: Array<{ strategy: string }> }>;
    };
  };

  let md = `# Simulation Report: ${simulation.name}\n\n`;
  md += `**Type:** ${simulation.type}\n`;
  md += `**Completed:** ${simulation.completedAt?.toISOString()}\n`;
  md += `**Overall Score:** ${simulation.overallScore ?? 'N/A'}\n`;
  md += `**Impact Level:** ${simulation.impactLevel ?? 'N/A'}\n\n`;

  if (results?.quantified?.summary) {
    md += `## Executive Summary\n\n`;
    md += `${results.quantified.summary.keyTakeaway}\n\n`;
  }

  if (results?.quantified?.financial) {
    md += `## Financial Impact\n\n`;
    md += `- **5-Year Net Impact:** €${results.quantified.financial.netFinancialImpact?.fiveYear?.toLocaleString() ?? 'N/A'}\n`;
    md += `- **Payback Period:** ${results.quantified.financial.roi?.paybackMonths ?? 'N/A'} months\n\n`;
  }

  if (results?.quantified?.risk?.topRisks) {
    md += `## Top Risks\n\n`;
    for (const risk of results.quantified.risk.topRisks.slice(0, 5)) {
      md += `- **${risk.risk}** (Score: ${risk.score})\n`;
    }
    md += '\n';
  }

  if (results?.mitigation) {
    md += `## Mitigation Strategy\n\n`;
    md += `**Approach:** ${results.mitigation.overallStrategy?.approach}\n\n`;
    md += `${results.mitigation.overallStrategy?.rationale}\n\n`;

    if (results.mitigation.riskMitigations) {
      md += `### Recommended Actions\n\n`;
      for (const mit of results.mitigation.riskMitigations.slice(0, 5)) {
        md += `#### ${mit.riskDescription}\n`;
        for (const strategy of mit.strategies) {
          md += `- ${strategy.strategy}\n`;
        }
        md += '\n';
      }
    }
  }

  return md;
}

export default simulationRoutes;
