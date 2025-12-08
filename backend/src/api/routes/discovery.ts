/**
 * Discovery API Routes
 * Endpoints for process discovery and analysis
 *
 * SECURITY: All routes require authentication (applied globally in routes/index.ts)
 * Organization context is automatically set from authenticated user's JWT claims
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { z } from 'zod';
import { getOrganizationId } from '../middleware/organization.js';
import { createProcessDiscoveryService } from '../../services/discovery/index.js';
import {
  findProcessById,
  findProcessesByOrganization,
  getProcessFlow,
  updateProcess,
  deleteProcess,
} from '../../graph/models/process.js';
import {
  findPersonsWithMetrics,
  getTopCommunicationPairs,
  getCommunicationsForPerson,
  getOrganizationHierarchy,
} from '../../graph/index.js';
import {
  exportToBpmn,
  exportProcessToBpmn,
  toBpmnString,
} from '../../services/export/bpmnExporter.js';

// Request schemas
const discoverProcessesSchema = z.object({
  sourceId: z.string().uuid().optional(),
  eventTypes: z.array(z.string()).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minCaseCount: z.number().int().min(1).optional(),
  minActivityFrequency: z.number().int().min(1).optional(),
});

const processIdParamSchema = z.object({
  processId: z.string().uuid(),
});

const updateProcessSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['discovered', 'validated', 'documented']).optional(),
  owner: z.string().optional(),
  department: z.string().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const networkQuerySchema = z.object({
  email: z.string().email().optional(),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const bpmnExportSchema = z.object({
  processIds: z.array(z.string().uuid()).optional(),
  includeParticipants: z.boolean().optional(),
  includeDiagram: z.boolean().optional(),
  includeDocumentation: z.boolean().optional(),
  layoutAlgorithm: z.enum(['horizontal', 'vertical', 'hierarchical']).optional(),
});

export default async function discoveryRoutes(fastify: FastifyInstance) {
  const pool = new Pool({ connectionString: process.env.TIMESCALE_URL });
  const discoveryService = createProcessDiscoveryService(pool);

  /**
   * POST /discovery/processes/discover
   * Trigger process discovery from event data
   */
  fastify.post(
    '/processes/discover',
    {
      schema: {
        body: discoverProcessesSchema,
        tags: ['discovery'],
        summary: 'Discover processes from event data',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const body = discoverProcessesSchema.parse(request.body);

      const results = await discoveryService.discoverProcesses(
        {
          organizationId,
          sourceId: body.sourceId,
          eventTypes: body.eventTypes,
          from: body.from ? new Date(body.from) : undefined,
          to: body.to ? new Date(body.to) : undefined,
        },
        {
          minCaseCount: body.minCaseCount,
          minActivityFrequency: body.minActivityFrequency,
          includeMetrics: true,
          saveToDashboard: true,
        }
      );

      return {
        success: true,
        data: results.map(r => ({
          process: r.process,
          stepCount: r.steps.length,
          metrics: r.metrics ? {
            totalCases: r.metrics.totalCases,
            totalEvents: r.metrics.totalEvents,
            uniqueActivities: r.metrics.uniqueActivities,
            traceVariants: r.metrics.traceVariants,
            avgCaseDuration: r.metrics.avgCaseDuration,
            throughput: r.metrics.throughput,
            bottleneckActivities: r.metrics.bottleneckActivities,
          } : null,
        })),
      };
    }
  );

  /**
   * GET /discovery/processes
   * List discovered processes
   */
  fastify.get(
    '/processes',
    {
      schema: {
        querystring: paginationSchema.extend({
          status: z.enum(['discovered', 'validated', 'documented']).optional(),
        }),
        tags: ['discovery'],
        summary: 'List discovered processes',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const query = paginationSchema.extend({
        status: z.enum(['discovered', 'validated', 'documented']).optional(),
      }).parse(request.query);

      const processes = await findProcessesByOrganization(organizationId, {
        status: query.status,
        limit: query.limit || 50,
        offset: query.offset || 0,
      });

      return {
        success: true,
        data: processes,
      };
    }
  );

  /**
   * GET /discovery/processes/:processId
   * Get process details
   */
  fastify.get(
    '/processes/:processId',
    {
      schema: {
        params: processIdParamSchema,
        tags: ['discovery'],
        summary: 'Get process details',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { processId } = processIdParamSchema.parse(request.params);

      const process = await findProcessById(processId);
      if (!process) {
        return reply.status(404).send({
          success: false,
          error: 'Process not found',
        });
      }

      // Check organization access
      const organizationId = getOrganizationId(request);
      if (process.organizationId !== organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      return {
        success: true,
        data: process,
      };
    }
  );

  /**
   * GET /discovery/processes/:processId/flow
   * Get process flow (steps and transitions)
   */
  fastify.get(
    '/processes/:processId/flow',
    {
      schema: {
        params: processIdParamSchema,
        tags: ['discovery'],
        summary: 'Get process flow',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { processId } = processIdParamSchema.parse(request.params);

      const flow = await getProcessFlow(processId);

      if (flow.steps.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Process not found or has no steps',
        });
      }

      return {
        success: true,
        data: {
          steps: flow.steps,
          transitions: flow.transitions,
        },
      };
    }
  );

  /**
   * PATCH /discovery/processes/:processId
   * Update process
   */
  fastify.patch(
    '/processes/:processId',
    {
      schema: {
        params: processIdParamSchema,
        body: updateProcessSchema,
        tags: ['discovery'],
        summary: 'Update process',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { processId } = processIdParamSchema.parse(request.params);
      const updates = updateProcessSchema.parse(request.body);

      const existing = await findProcessById(processId);
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Process not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await updateProcess(processId, updates);

      return {
        success: true,
        data: updated,
      };
    }
  );

  /**
   * DELETE /discovery/processes/:processId
   * Delete process
   */
  fastify.delete(
    '/processes/:processId',
    {
      schema: {
        params: processIdParamSchema,
        tags: ['discovery'],
        summary: 'Delete process',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { processId } = processIdParamSchema.parse(request.params);

      const existing = await findProcessById(processId);
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Process not found',
        });
      }

      if (existing.organizationId !== request.organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      await deleteProcess(processId);

      return {
        success: true,
        message: 'Process deleted',
      };
    }
  );

  /**
   * POST /discovery/processes/:processId/conformance
   * Check conformance against discovered process
   */
  fastify.post(
    '/processes/:processId/conformance',
    {
      schema: {
        params: processIdParamSchema,
        body: discoverProcessesSchema,
        tags: ['discovery'],
        summary: 'Check process conformance',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { processId } = processIdParamSchema.parse(request.params);
      const body = discoverProcessesSchema.parse(request.body);
      const organizationId = getOrganizationId(request);

      const result = await discoveryService.calculateProcessConformance(
        processId,
        {
          organizationId,
          sourceId: body.sourceId,
          eventTypes: body.eventTypes,
          from: body.from ? new Date(body.from) : undefined,
          to: body.to ? new Date(body.to) : undefined,
        }
      );

      return {
        success: true,
        data: result,
      };
    }
  );

  // Network/Graph endpoints

  /**
   * GET /discovery/network/people
   * Get people in the communication network
   */
  fastify.get(
    '/network/people',
    {
      schema: {
        querystring: paginationSchema,
        tags: ['discovery', 'network'],
        summary: 'Get people in communication network',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const query = paginationSchema.parse(request.query);

      const people = await findPersonsWithMetrics(organizationId, {
        limit: query.limit || 50,
      });

      return {
        success: true,
        data: people,
      };
    }
  );

  /**
   * GET /discovery/network/communications
   * Get top communication pairs
   */
  fastify.get(
    '/network/communications',
    {
      schema: {
        querystring: networkQuerySchema,
        tags: ['discovery', 'network'],
        summary: 'Get communication relationships',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const query = networkQuerySchema.parse(request.query);

      let communications;
      if (query.email) {
        communications = await getCommunicationsForPerson(
          organizationId,
          query.email,
          {
            direction: query.direction || 'both',
            limit: query.limit || 50,
          }
        );
      } else {
        communications = await getTopCommunicationPairs(
          organizationId,
          query.limit || 50
        );
      }

      return {
        success: true,
        data: communications,
      };
    }
  );

  /**
   * GET /discovery/network/hierarchy
   * Get organizational hierarchy
   */
  fastify.get(
    '/network/hierarchy',
    {
      schema: {
        querystring: z.object({
          rootEmail: z.string().email().optional(),
        }),
        tags: ['discovery', 'network'],
        summary: 'Get organizational hierarchy',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const query = z.object({
        rootEmail: z.string().email().optional(),
      }).parse(request.query);

      const hierarchy = await getOrganizationHierarchy(
        organizationId,
        query.rootEmail
      );

      return {
        success: true,
        data: hierarchy,
      };
    }
  );

  // BPMN Export endpoints

  /**
   * POST /discovery/export/bpmn
   * Export all or selected processes to BPMN 2.0 format
   */
  fastify.post(
    '/export/bpmn',
    {
      schema: {
        body: bpmnExportSchema,
        tags: ['discovery', 'export'],
        summary: 'Export processes to BPMN 2.0 format',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const body = bpmnExportSchema.parse(request.body);

      const results = await exportToBpmn(pool, {
        organizationId,
        processIds: body.processIds,
        includeParticipants: body.includeParticipants ?? true,
        includeDiagram: body.includeDiagram ?? true,
        includeDocumentation: body.includeDocumentation ?? true,
        layoutAlgorithm: body.layoutAlgorithm ?? 'horizontal',
      });

      return {
        success: true,
        data: {
          processCount: results.length,
          exports: results.map(r => ({
            processId: r.processId,
            processName: r.processName,
            elementCount: r.elementCount,
            diagramIncluded: r.diagramIncluded,
            exportedAt: r.exportedAt,
          })),
        },
      };
    }
  );

  /**
   * GET /discovery/export/bpmn/:processId
   * Export a single process to BPMN 2.0 XML
   */
  fastify.get(
    '/export/bpmn/:processId',
    {
      schema: {
        params: processIdParamSchema,
        querystring: z.object({
          includeParticipants: z.coerce.boolean().optional(),
          includeDiagram: z.coerce.boolean().optional(),
          includeDocumentation: z.coerce.boolean().optional(),
          layoutAlgorithm: z.enum(['horizontal', 'vertical', 'hierarchical']).optional(),
          format: z.enum(['json', 'xml']).optional(),
        }),
        tags: ['discovery', 'export'],
        summary: 'Export single process to BPMN 2.0',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { processId } = processIdParamSchema.parse(request.params);
      const query = z.object({
        includeParticipants: z.coerce.boolean().optional(),
        includeDiagram: z.coerce.boolean().optional(),
        includeDocumentation: z.coerce.boolean().optional(),
        layoutAlgorithm: z.enum(['horizontal', 'vertical', 'hierarchical']).optional(),
        format: z.enum(['json', 'xml']).optional(),
      }).parse(request.query);

      // Verify process exists and belongs to organization
      const process = await findProcessById(processId);
      if (!process) {
        return reply.status(404).send({
          success: false,
          error: 'Process not found',
        });
      }

      if (process.organizationId !== organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const result = await exportProcessToBpmn(pool, organizationId, processId, {
        includeParticipants: query.includeParticipants ?? true,
        includeDiagram: query.includeDiagram ?? true,
        includeDocumentation: query.includeDocumentation ?? true,
        layoutAlgorithm: query.layoutAlgorithm ?? 'horizontal',
      });

      // Return XML directly if requested
      if (query.format === 'xml') {
        const xml = toBpmnString(result);
        reply.header('Content-Type', 'application/xml');
        reply.header('Content-Disposition', `attachment; filename="${result.processName.replace(/[^a-z0-9]/gi, '_')}.bpmn"`);
        return xml;
      }

      return {
        success: true,
        data: result,
      };
    }
  );

  /**
   * GET /discovery/export/bpmn/:processId/download
   * Download BPMN 2.0 XML file
   */
  fastify.get(
    '/export/bpmn/:processId/download',
    {
      schema: {
        params: processIdParamSchema,
        querystring: z.object({
          includeParticipants: z.coerce.boolean().optional(),
          includeDiagram: z.coerce.boolean().optional(),
          layoutAlgorithm: z.enum(['horizontal', 'vertical', 'hierarchical']).optional(),
        }),
        tags: ['discovery', 'export'],
        summary: 'Download BPMN 2.0 XML file',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { processId } = processIdParamSchema.parse(request.params);
      const query = z.object({
        includeParticipants: z.coerce.boolean().optional(),
        includeDiagram: z.coerce.boolean().optional(),
        layoutAlgorithm: z.enum(['horizontal', 'vertical', 'hierarchical']).optional(),
      }).parse(request.query);

      const process = await findProcessById(processId);
      if (!process) {
        return reply.status(404).send({
          success: false,
          error: 'Process not found',
        });
      }

      if (process.organizationId !== organizationId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const result = await exportProcessToBpmn(pool, organizationId, processId, {
        includeParticipants: query.includeParticipants ?? true,
        includeDiagram: query.includeDiagram ?? true,
        includeDocumentation: true,
        layoutAlgorithm: query.layoutAlgorithm ?? 'horizontal',
      });

      const xml = toBpmnString(result);
      const filename = `${result.processName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.bpmn`;

      reply.header('Content-Type', 'application/xml');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return xml;
    }
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await pool.end();
  });
}
