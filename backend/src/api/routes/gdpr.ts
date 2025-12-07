/**
 * GDPR Routes (T181, T182)
 * API endpoints for GDPR data export and deletion
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { neo4jDriver } from '../../graph/connection.js';
import { auditService } from '../../services/audit/auditService.js';
import { requirePermission } from '../middleware/permissions.js';

// Schema definitions
const exportRequestSchema = z.object({
  subjectId: z.string().uuid(),
  subjectType: z.enum(['user', 'person']),
  includeRelatedData: z.boolean().default(true),
  format: z.enum(['json', 'csv']).default('json'),
});

const deletionRequestSchema = z.object({
  subjectId: z.string().uuid(),
  subjectType: z.enum(['user', 'person']),
  cascadeDelete: z.boolean().default(false),
  retainAuditLogs: z.boolean().default(true),
  reason: z.string().min(10).max(500),
});

// Types
interface GDPRExportData {
  subject: {
    id: string;
    type: string;
    exportedAt: string;
  };
  personalData: Record<string, unknown>;
  activityData: Record<string, unknown>[];
  relatedData: Record<string, unknown>[];
  metadata: {
    dataCategories: string[];
    retentionPeriods: Record<string, string>;
    processingPurposes: string[];
  };
}

interface DeletionResult {
  success: boolean;
  subjectId: string;
  deletedRecords: {
    category: string;
    count: number;
  }[];
  retainedRecords: {
    category: string;
    count: number;
    reason: string;
  }[];
  completedAt: string;
  auditReference: string;
}

export default async function gdprRoutes(fastify: FastifyInstance) {
  /**
   * POST /gdpr/export - Export all data for a data subject (T181)
   * GDPR Article 20 - Right to data portability
   */
  fastify.post(
    '/gdpr/export',
    {
      preHandler: [requirePermission('gdpr:export')],
      schema: {
        body: {
          type: 'object',
          required: ['subjectId', 'subjectType'],
          properties: {
            subjectId: { type: 'string', format: 'uuid' },
            subjectType: { type: 'string', enum: ['user', 'person'] },
            includeRelatedData: { type: 'boolean' },
            format: { type: 'string', enum: ['json', 'csv'] },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = exportRequestSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: validation.error.errors,
        });
      }

      const { subjectId, subjectType, includeRelatedData, format } = validation.data;
      const organizationId = (request as any).organizationId;
      const requesterId = (request as any).user?.id;

      try {
        const exportData = await exportSubjectData(
          organizationId,
          subjectId,
          subjectType,
          includeRelatedData
        );

        // Log the export request
        await auditService.log({
          organizationId,
          userId: requesterId,
          action: 'gdpr.data_exported',
          resourceType: subjectType,
          resourceId: subjectId,
          details: {
            includeRelatedData,
            format,
            dataCategories: exportData.metadata.dataCategories,
          },
        });

        if (format === 'csv') {
          const csvContent = convertToCSV(exportData);
          reply.header('Content-Type', 'text/csv');
          reply.header('Content-Disposition', `attachment; filename="gdpr-export-${subjectId}.csv"`);
          return reply.send(csvContent);
        }

        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="gdpr-export-${subjectId}.json"`);
        return reply.send(exportData);
      } catch (error) {
        fastify.log.error(error, 'GDPR export failed');
        return reply.status(500).send({
          error: 'Export failed',
          message: 'Unable to complete data export',
        });
      }
    }
  );

  /**
   * POST /gdpr/delete - Delete all data for a data subject (T182)
   * GDPR Article 17 - Right to erasure ("right to be forgotten")
   */
  fastify.post(
    '/gdpr/delete',
    {
      preHandler: [requirePermission('gdpr:delete')],
      schema: {
        body: {
          type: 'object',
          required: ['subjectId', 'subjectType', 'reason'],
          properties: {
            subjectId: { type: 'string', format: 'uuid' },
            subjectType: { type: 'string', enum: ['user', 'person'] },
            cascadeDelete: { type: 'boolean' },
            retainAuditLogs: { type: 'boolean' },
            reason: { type: 'string', minLength: 10, maxLength: 500 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = deletionRequestSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: validation.error.errors,
        });
      }

      const { subjectId, subjectType, cascadeDelete, retainAuditLogs, reason } = validation.data;
      const organizationId = (request as any).organizationId;
      const requesterId = (request as any).user?.id;

      try {
        // Create audit reference before deletion
        const auditReference = `GDPR-DEL-${Date.now()}-${subjectId.slice(0, 8)}`;

        // Log deletion request before processing
        await auditService.log({
          organizationId,
          userId: requesterId,
          action: 'gdpr.deletion_requested',
          resourceType: subjectType,
          resourceId: subjectId,
          details: {
            auditReference,
            cascadeDelete,
            retainAuditLogs,
            reason,
          },
        });

        const result = await deleteSubjectData(
          organizationId,
          subjectId,
          subjectType,
          cascadeDelete,
          retainAuditLogs,
          auditReference
        );

        // Log deletion completion
        await auditService.log({
          organizationId,
          userId: requesterId,
          action: 'gdpr.deletion_completed',
          resourceType: subjectType,
          resourceId: subjectId,
          details: {
            auditReference,
            deletedRecords: result.deletedRecords,
            retainedRecords: result.retainedRecords,
          },
        });

        return reply.send(result);
      } catch (error) {
        fastify.log.error(error, 'GDPR deletion failed');
        return reply.status(500).send({
          error: 'Deletion failed',
          message: 'Unable to complete data deletion',
        });
      }
    }
  );

  /**
   * GET /gdpr/status/:requestId - Check status of a GDPR request
   */
  fastify.get(
    '/gdpr/status/:requestId',
    {
      preHandler: [requirePermission('gdpr:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { requestId } = request.params as { requestId: string };
      const organizationId = (request as any).organizationId;

      try {
        // Find audit logs for this request
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            organizationId,
            action: {
              startsWith: 'gdpr.',
            },
            details: {
              path: ['auditReference'],
              equals: requestId,
            },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (auditLogs.length === 0) {
          return reply.status(404).send({
            error: 'Request not found',
            message: 'No GDPR request found with this reference',
          });
        }

        const status = determineRequestStatus(auditLogs);
        return reply.send(status);
      } catch (error) {
        fastify.log.error(error, 'GDPR status check failed');
        return reply.status(500).send({
          error: 'Status check failed',
        });
      }
    }
  );

  /**
   * GET /gdpr/data-categories - List all data categories collected
   */
  fastify.get(
    '/gdpr/data-categories',
    {
      preHandler: [requirePermission('gdpr:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        categories: [
          {
            name: 'Identity Data',
            description: 'Name, email, employee ID',
            retentionPeriod: '3 years after account deletion',
            legalBasis: 'Contract performance',
          },
          {
            name: 'Contact Data',
            description: 'Email addresses, phone numbers',
            retentionPeriod: '3 years after account deletion',
            legalBasis: 'Contract performance',
          },
          {
            name: 'Professional Data',
            description: 'Job title, department, team membership',
            retentionPeriod: '3 years after account deletion',
            legalBasis: 'Contract performance',
          },
          {
            name: 'Communication Metadata',
            description: 'Email timestamps, meeting participants (no content)',
            retentionPeriod: '2 years',
            legalBasis: 'Legitimate interest',
          },
          {
            name: 'Process Participation',
            description: 'Involvement in business processes',
            retentionPeriod: '2 years',
            legalBasis: 'Legitimate interest',
          },
          {
            name: 'Audit Logs',
            description: 'System access and action logs',
            retentionPeriod: '7 years',
            legalBasis: 'Legal obligation',
          },
        ],
      });
    }
  );
}

/**
 * Export all data for a subject
 */
async function exportSubjectData(
  organizationId: string,
  subjectId: string,
  subjectType: string,
  includeRelatedData: boolean
): Promise<GDPRExportData> {
  const exportData: GDPRExportData = {
    subject: {
      id: subjectId,
      type: subjectType,
      exportedAt: new Date().toISOString(),
    },
    personalData: {},
    activityData: [],
    relatedData: [],
    metadata: {
      dataCategories: [],
      retentionPeriods: {},
      processingPurposes: [],
    },
  };

  if (subjectType === 'user') {
    // Export user data from PostgreSQL
    const user = await prisma.user.findFirst({
      where: {
        id: subjectId,
        organizationId,
      },
      include: {
        organization: {
          select: { name: true },
        },
      },
    });

    if (user) {
      exportData.personalData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationName: user.organization.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      exportData.metadata.dataCategories.push('Identity Data', 'Contact Data', 'Professional Data');
    }

    // Export audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        userId: subjectId,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    exportData.activityData = auditLogs.map((log) => ({
      timestamp: log.createdAt,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
    }));

    if (auditLogs.length > 0) {
      exportData.metadata.dataCategories.push('Audit Logs');
    }
  } else if (subjectType === 'person') {
    // Export person data from Neo4j
    const session = neo4jDriver.session();
    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        OPTIONAL MATCH (p)-[r:PARTICIPATES_IN]->(proc:Process)
        OPTIONAL MATCH (p)-[comm:COMMUNICATES_WITH]->(other:Person)
        OPTIONAL MATCH (p)-[reports:REPORTS_TO]->(manager:Person)
        RETURN p,
               collect(DISTINCT proc.name) as processes,
               collect(DISTINCT other.email) as communicationPartners,
               manager.email as manager
        `,
        { personId: subjectId, organizationId }
      );

      if (result.records.length > 0) {
        const record = result.records[0];
        const person = record.get('p').properties;

        exportData.personalData = {
          id: person.id,
          email: person.email,
          name: person.name,
          title: person.title,
          department: person.department,
          team: person.team,
        };

        if (includeRelatedData) {
          exportData.relatedData = [
            {
              type: 'Process Participation',
              data: record.get('processes'),
            },
            {
              type: 'Communication Network',
              data: record.get('communicationPartners'),
            },
            {
              type: 'Reporting Structure',
              data: { manager: record.get('manager') },
            },
          ];
        }

        exportData.metadata.dataCategories.push(
          'Identity Data',
          'Professional Data',
          'Process Participation',
          'Communication Metadata'
        );
      }
    } finally {
      await session.close();
    }
  }

  // Set retention periods
  exportData.metadata.retentionPeriods = {
    'Identity Data': '3 years after account deletion',
    'Professional Data': '3 years after account deletion',
    'Communication Metadata': '2 years',
    'Process Participation': '2 years',
    'Audit Logs': '7 years',
  };

  // Set processing purposes
  exportData.metadata.processingPurposes = [
    'Organizational analysis and process optimization',
    'Knowledge management and succession planning',
    'Compliance and audit requirements',
    'System security and access management',
  ];

  return exportData;
}

/**
 * Delete all data for a subject with cascade support
 */
async function deleteSubjectData(
  organizationId: string,
  subjectId: string,
  subjectType: string,
  cascadeDelete: boolean,
  retainAuditLogs: boolean,
  auditReference: string
): Promise<DeletionResult> {
  const deletedRecords: DeletionResult['deletedRecords'] = [];
  const retainedRecords: DeletionResult['retainedRecords'] = [];

  if (subjectType === 'user') {
    // Delete user data from PostgreSQL
    await prisma.$transaction(async (tx) => {
      // Delete user's sessions, tokens, etc. (cascade)
      if (cascadeDelete) {
        // Delete user's data sources
        const deletedDataSources = await tx.dataSource.deleteMany({
          where: {
            organizationId,
            createdById: subjectId,
          },
        });
        if (deletedDataSources.count > 0) {
          deletedRecords.push({ category: 'Data Sources', count: deletedDataSources.count });
        }

        // Delete user's SOPs
        const deletedSOPs = await tx.sOP.deleteMany({
          where: {
            organizationId,
            generatedById: subjectId,
          },
        });
        if (deletedSOPs.count > 0) {
          deletedRecords.push({ category: 'SOPs', count: deletedSOPs.count });
        }

        // Delete user's assessments
        const deletedAssessments = await tx.assessment.deleteMany({
          where: {
            organizationId,
            createdById: subjectId,
          },
        });
        if (deletedAssessments.count > 0) {
          deletedRecords.push({ category: 'Assessments', count: deletedAssessments.count });
        }
      }

      // Handle audit logs
      if (!retainAuditLogs) {
        const deletedLogs = await tx.auditLog.deleteMany({
          where: {
            organizationId,
            userId: subjectId,
            // Don't delete GDPR-related logs
            NOT: {
              action: {
                startsWith: 'gdpr.',
              },
            },
          },
        });
        if (deletedLogs.count > 0) {
          deletedRecords.push({ category: 'Audit Logs', count: deletedLogs.count });
        }
      } else {
        const retainedLogCount = await tx.auditLog.count({
          where: {
            organizationId,
            userId: subjectId,
          },
        });
        if (retainedLogCount > 0) {
          retainedRecords.push({
            category: 'Audit Logs',
            count: retainedLogCount,
            reason: 'Legal retention requirement (7 years)',
          });
        }
      }

      // Anonymize user record instead of hard delete (for referential integrity)
      await tx.user.update({
        where: { id: subjectId },
        data: {
          email: `deleted-${auditReference}@anonymized.local`,
          name: 'Deleted User',
          deletedAt: new Date(),
        },
      });
      deletedRecords.push({ category: 'User Profile', count: 1 });
    });
  } else if (subjectType === 'person') {
    // Delete person data from Neo4j
    const session = neo4jDriver.session();
    try {
      // Delete relationships first
      const relationshipResult = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        OPTIONAL MATCH (p)-[r]-()
        WITH p, count(r) as relCount
        MATCH (p)-[r]-()
        DELETE r
        RETURN relCount
        `,
        { personId: subjectId, organizationId }
      );

      const relCount = relationshipResult.records[0]?.get('relCount')?.toNumber() || 0;
      if (relCount > 0) {
        deletedRecords.push({ category: 'Relationships', count: relCount });
      }

      // Delete or anonymize the person node
      if (cascadeDelete) {
        await session.run(
          `
          MATCH (p:Person {id: $personId, organizationId: $organizationId})
          DELETE p
          `,
          { personId: subjectId, organizationId }
        );
        deletedRecords.push({ category: 'Person Node', count: 1 });
      } else {
        // Anonymize instead of delete
        await session.run(
          `
          MATCH (p:Person {id: $personId, organizationId: $organizationId})
          SET p.email = $anonymizedEmail,
              p.name = 'Anonymized Person',
              p.title = null,
              p.deletedAt = datetime()
          `,
          {
            personId: subjectId,
            organizationId,
            anonymizedEmail: `deleted-${auditReference}@anonymized.local`,
          }
        );
        deletedRecords.push({ category: 'Person Node (Anonymized)', count: 1 });
      }

      // Delete from TimescaleDB events
      // Note: This would require a TimescaleDB connection
      // await deleteTimescaleEvents(organizationId, subjectId);
    } finally {
      await session.close();
    }
  }

  return {
    success: true,
    subjectId,
    deletedRecords,
    retainedRecords,
    completedAt: new Date().toISOString(),
    auditReference,
  };
}

/**
 * Convert export data to CSV format
 */
function convertToCSV(data: GDPRExportData): string {
  const lines: string[] = [];

  // Header
  lines.push('Category,Field,Value');

  // Subject info
  lines.push(`Subject,ID,${data.subject.id}`);
  lines.push(`Subject,Type,${data.subject.type}`);
  lines.push(`Subject,Exported At,${data.subject.exportedAt}`);

  // Personal data
  for (const [key, value] of Object.entries(data.personalData)) {
    lines.push(`Personal Data,${key},"${String(value).replace(/"/g, '""')}"`);
  }

  // Activity data (summarized)
  lines.push(`Activity Data,Total Records,${data.activityData.length}`);

  // Related data
  for (const related of data.relatedData) {
    lines.push(`Related Data,${related.type},"${JSON.stringify(related.data).replace(/"/g, '""')}"`);
  }

  // Metadata
  for (const category of data.metadata.dataCategories) {
    const retention = data.metadata.retentionPeriods[category] || 'Not specified';
    lines.push(`Metadata,${category} Retention,${retention}`);
  }

  return lines.join('\n');
}

/**
 * Determine request status from audit logs
 */
function determineRequestStatus(auditLogs: any[]) {
  const actions = auditLogs.map((log) => log.action);

  if (actions.includes('gdpr.deletion_completed')) {
    return {
      status: 'completed',
      type: 'deletion',
      requestedAt: auditLogs[0].createdAt,
      completedAt: auditLogs.find((l) => l.action === 'gdpr.deletion_completed')?.createdAt,
    };
  }

  if (actions.includes('gdpr.data_exported')) {
    return {
      status: 'completed',
      type: 'export',
      requestedAt: auditLogs[0].createdAt,
      completedAt: auditLogs.find((l) => l.action === 'gdpr.data_exported')?.createdAt,
    };
  }

  if (actions.includes('gdpr.deletion_requested')) {
    return {
      status: 'processing',
      type: 'deletion',
      requestedAt: auditLogs[0].createdAt,
    };
  }

  return {
    status: 'unknown',
    logs: auditLogs,
  };
}
