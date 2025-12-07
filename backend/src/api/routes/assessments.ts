/**
 * Assessment Routes
 * API endpoints for readiness assessments
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { exportToPDF } from '../../services/export/pdfExporter.js';
import { exportToDOCX } from '../../services/export/docxExporter.js';

const prisma = new PrismaClient();

// Assessment queue
const assessmentQueue = new Queue('assessments', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Validation schemas
const createAssessmentSchema = z.object({
  type: z.enum(['erp', 'ai', 'data_quality', 'process_maturity', 'comprehensive']),
  name: z.string().optional(),
  options: z.object({
    includeRecommendations: z.boolean().optional(),
    detailLevel: z.enum(['summary', 'detailed', 'comprehensive']).optional(),
    focusAreas: z.array(z.string()).optional(),
  }).optional(),
});

const listAssessmentsSchema = z.object({
  types: z.string().optional(),
  statuses: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  sortBy: z.enum(['createdAt', 'completedAt', 'overallScore']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const exportAssessmentSchema = z.object({
  format: z.enum(['pdf', 'docx', 'json']),
  includeRecommendations: z.boolean().optional(),
  includeDetails: z.boolean().optional(),
});

export default async function assessmentRoutes(server: FastifyInstance): Promise<void> {
  /**
   * List assessments
   * GET /organizations/:organizationId/assessments
   */
  server.get(
    '/organizations/:organizationId/assessments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = request.params as { organizationId: string };
      const query = listAssessmentsSchema.parse(request.query);

      const where: Record<string, unknown> = { organizationId };

      if (query.types) {
        where.type = { in: query.types.split(',') };
      }
      if (query.statuses) {
        where.status = { in: query.statuses.split(',') };
      }

      const limit = Math.min(parseInt(query.limit || '20'), 100);
      const offset = parseInt(query.offset || '0');
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';

      const [assessments, total] = await Promise.all([
        prisma.assessment.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
          select: {
            id: true,
            organizationId: true,
            type: true,
            name: true,
            status: true,
            overallScore: true,
            createdAt: true,
            completedAt: true,
            createdBy: true,
          },
        }),
        prisma.assessment.count({ where }),
      ]);

      return reply.send({
        data: assessments,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + assessments.length < total,
        },
      });
    }
  );

  /**
   * Get assessment by ID
   * GET /organizations/:organizationId/assessments/:assessmentId
   */
  server.get(
    '/organizations/:organizationId/assessments/:assessmentId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, assessmentId } = request.params as {
        organizationId: string;
        assessmentId: string;
      };

      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, organizationId },
      });

      if (!assessment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Assessment not found',
        });
      }

      return reply.send({ data: assessment });
    }
  );

  /**
   * Create new assessment
   * POST /organizations/:organizationId/assessments
   */
  server.post(
    '/organizations/:organizationId/assessments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = request.params as { organizationId: string };
      const body = createAssessmentSchema.parse(request.body);

      // Get user from auth context
      const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id || 'system';

      // Generate assessment name
      const typeNames: Record<string, string> = {
        erp: 'ERP Readiness',
        ai: 'AI Readiness',
        data_quality: 'Data Quality',
        process_maturity: 'Process Maturity',
        comprehensive: 'Comprehensive',
      };
      const name = body.name || `${typeNames[body.type]} Assessment - ${new Date().toISOString().split('T')[0]}`;

      // Create assessment record
      const assessment = await prisma.assessment.create({
        data: {
          organizationId,
          type: body.type,
          name,
          status: 'pending',
          createdBy: userId,
          options: body.options as never,
        },
      });

      // Queue assessment job
      await assessmentQueue.add(
        'run-assessment',
        {
          assessmentId: assessment.id,
          organizationId,
          assessmentType: body.type,
          options: body.options,
        },
        {
          jobId: `assessment-${assessment.id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      return reply.code(201).send({
        data: {
          id: assessment.id,
          status: 'pending',
          message: 'Assessment started. Check status for progress.',
        },
      });
    }
  );

  /**
   * Get assessment status
   * GET /organizations/:organizationId/assessments/:assessmentId/status
   */
  server.get(
    '/organizations/:organizationId/assessments/:assessmentId/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, assessmentId } = request.params as {
        organizationId: string;
        assessmentId: string;
      };

      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, organizationId },
        select: {
          id: true,
          status: true,
          overallScore: true,
          error: true,
          createdAt: true,
          completedAt: true,
        },
      });

      if (!assessment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Assessment not found',
        });
      }

      // Get job progress
      const job = await assessmentQueue.getJob(`assessment-${assessmentId}`);
      const progress = job ? await job.progress : undefined;

      return reply.send({
        data: {
          ...assessment,
          progress: typeof progress === 'number' ? progress : undefined,
        },
      });
    }
  );

  /**
   * Delete assessment
   * DELETE /organizations/:organizationId/assessments/:assessmentId
   */
  server.delete(
    '/organizations/:organizationId/assessments/:assessmentId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, assessmentId } = request.params as {
        organizationId: string;
        assessmentId: string;
      };

      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, organizationId },
      });

      if (!assessment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Assessment not found',
        });
      }

      await prisma.assessment.delete({
        where: { id: assessmentId },
      });

      return reply.code(204).send();
    }
  );

  /**
   * Export assessment
   * POST /organizations/:organizationId/assessments/:assessmentId/export
   */
  server.post(
    '/organizations/:organizationId/assessments/:assessmentId/export',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, assessmentId } = request.params as {
        organizationId: string;
        assessmentId: string;
      };
      const body = exportAssessmentSchema.parse(request.body);

      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, organizationId, status: 'completed' },
      });

      if (!assessment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Assessment not found or not completed',
        });
      }

      // Get organization for title
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      // Format assessment as markdown for export
      const markdown = formatAssessmentAsMarkdown(assessment, organization?.name);

      if (body.format === 'json') {
        return reply.send({
          data: {
            assessment: assessment.results,
            recommendations: body.includeRecommendations ? assessment.recommendations : undefined,
          },
        });
      }

      // Create document structure
      const document = {
        id: assessment.id,
        title: assessment.name,
        content: markdown,
        version: '1.0',
        status: 'completed',
        language: 'en',
        createdAt: assessment.createdAt,
        updatedAt: assessment.completedAt || assessment.createdAt,
      };

      let result;
      if (body.format === 'pdf') {
        result = await exportToPDF(document, {
          includeMetadata: true,
        });
      } else {
        result = await exportToDOCX(document, {
          includeMetadata: true,
        });
      }

      return reply
        .header('Content-Type', result.mimeType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.content);
    }
  );

  /**
   * Get assessment summary/statistics
   * GET /organizations/:organizationId/assessments/summary
   */
  server.get(
    '/organizations/:organizationId/assessments/summary',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = request.params as { organizationId: string };

      const [total, byType, byStatus, latest, avgScores] = await Promise.all([
        // Total count
        prisma.assessment.count({ where: { organizationId } }),

        // By type
        prisma.assessment.groupBy({
          by: ['type'],
          where: { organizationId },
          _count: true,
        }),

        // By status
        prisma.assessment.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: true,
        }),

        // Latest completed assessments by type
        prisma.assessment.findMany({
          where: { organizationId, status: 'completed' },
          orderBy: { completedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            name: true,
            overallScore: true,
            completedAt: true,
          },
        }),

        // Average scores by type
        prisma.assessment.groupBy({
          by: ['type'],
          where: { organizationId, status: 'completed' },
          _avg: { overallScore: true },
        }),
      ]);

      return reply.send({
        data: {
          total,
          byType: byType.reduce((acc, t) => {
            acc[t.type] = t._count;
            return acc;
          }, {} as Record<string, number>),
          byStatus: byStatus.reduce((acc, s) => {
            acc[s.status] = s._count;
            return acc;
          }, {} as Record<string, number>),
          latestAssessments: latest,
          averageScores: avgScores.reduce((acc, s) => {
            acc[s.type] = Math.round(s._avg.overallScore || 0);
            return acc;
          }, {} as Record<string, number>),
        },
      });
    }
  );

  /**
   * Compare assessments
   * GET /organizations/:organizationId/assessments/compare
   */
  server.get(
    '/organizations/:organizationId/assessments/compare',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = request.params as { organizationId: string };
      const { ids } = request.query as { ids?: string };

      if (!ids) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Assessment IDs required (comma-separated)',
        });
      }

      const assessmentIds = ids.split(',').map((id) => id.trim());

      const assessments = await prisma.assessment.findMany({
        where: {
          id: { in: assessmentIds },
          organizationId,
          status: 'completed',
        },
        orderBy: { completedAt: 'asc' },
      });

      if (assessments.length < 2) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'At least 2 completed assessments required for comparison',
        });
      }

      // Calculate changes between assessments
      const comparison = {
        assessments: assessments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          overallScore: a.overallScore,
          completedAt: a.completedAt,
        })),
        scoreChange: assessments[assessments.length - 1].overallScore! - assessments[0].overallScore!,
        trend: assessments[assessments.length - 1].overallScore! > assessments[0].overallScore!
          ? 'improving'
          : assessments[assessments.length - 1].overallScore! < assessments[0].overallScore!
          ? 'declining'
          : 'stable',
        timePeriod: {
          from: assessments[0].completedAt,
          to: assessments[assessments.length - 1].completedAt,
        },
      };

      return reply.send({ data: comparison });
    }
  );
}

/**
 * Format assessment as markdown for export
 */
function formatAssessmentAsMarkdown(
  assessment: {
    name: string;
    type: string;
    overallScore: number | null;
    results: unknown;
    recommendations: unknown;
    completedAt: Date | null;
  },
  organizationName?: string
): string {
  const results = assessment.results as Record<string, unknown>;
  const recommendations = assessment.recommendations as Record<string, unknown>;

  let markdown = `# ${assessment.name}\n\n`;

  if (organizationName) {
    markdown += `**Organization:** ${organizationName}\n\n`;
  }

  markdown += `**Assessment Type:** ${assessment.type}\n`;
  markdown += `**Completed:** ${assessment.completedAt?.toISOString().split('T')[0]}\n`;
  markdown += `**Overall Score:** ${assessment.overallScore}%\n\n`;

  markdown += `---\n\n`;

  // Executive Summary
  markdown += `## Executive Summary\n\n`;

  if (results) {
    const readinessLevel = (results as { readinessLevel?: string }).readinessLevel;
    const maturityLevel = (results as { maturityLevel?: number }).maturityLevel;
    const qualityLevel = (results as { qualityLevel?: string }).qualityLevel;

    if (readinessLevel) {
      markdown += `**Readiness Level:** ${readinessLevel.replace(/_/g, ' ').toUpperCase()}\n\n`;
    }
    if (maturityLevel) {
      markdown += `**Maturity Level:** Level ${maturityLevel}\n\n`;
    }
    if (qualityLevel) {
      markdown += `**Quality Level:** ${qualityLevel.toUpperCase()}\n\n`;
    }
  }

  // Category Scores
  markdown += `## Category Scores\n\n`;

  const categoryScores = (results as { categoryScores?: Record<string, { percentage?: number; score?: number }> })?.categoryScores;
  if (categoryScores) {
    markdown += `| Category | Score |\n`;
    markdown += `|----------|-------|\n`;
    Object.entries(categoryScores).forEach(([category, score]) => {
      const displayScore = score.percentage ?? score.score ?? 0;
      markdown += `| ${formatCategoryName(category)} | ${Math.round(displayScore)}% |\n`;
    });
    markdown += `\n`;
  }

  // Key Findings
  markdown += `## Key Findings\n\n`;

  const strengths = (results as { strengths?: string[] })?.strengths;
  if (strengths && strengths.length > 0) {
    markdown += `### Strengths\n\n`;
    strengths.forEach((s) => {
      markdown += `- ${s}\n`;
    });
    markdown += `\n`;
  }

  const weaknesses = (results as { weaknesses?: string[]; gaps?: string[]; criticalGaps?: string[] })?.weaknesses ||
                     (results as { gaps?: string[] })?.gaps;
  const gaps = (results as { criticalGaps?: string[] })?.criticalGaps;

  if (weaknesses && weaknesses.length > 0) {
    markdown += `### Areas for Improvement\n\n`;
    weaknesses.forEach((w) => {
      markdown += `- ${w}\n`;
    });
    markdown += `\n`;
  }

  if (gaps && gaps.length > 0) {
    markdown += `### Critical Gaps\n\n`;
    gaps.forEach((g) => {
      markdown += `- ${g}\n`;
    });
    markdown += `\n`;
  }

  // Recommendations
  if (recommendations) {
    markdown += `## Recommendations\n\n`;

    const strategicRecs = (recommendations as { strategicRecommendations?: Array<{ title: string; description: string; priority: string }> })?.strategicRecommendations;
    if (strategicRecs && strategicRecs.length > 0) {
      markdown += `### Strategic Initiatives\n\n`;
      strategicRecs.forEach((rec, i) => {
        markdown += `${i + 1}. **${rec.title}** (${rec.priority})\n`;
        markdown += `   ${rec.description}\n\n`;
      });
    }

    const quickWins = (recommendations as { quickWins?: Array<{ title: string; description: string }> })?.quickWins;
    if (quickWins && quickWins.length > 0) {
      markdown += `### Quick Wins\n\n`;
      quickWins.forEach((qw) => {
        markdown += `- **${qw.title}:** ${qw.description}\n`;
      });
      markdown += `\n`;
    }
  }

  // Risk Factors
  const riskFactors = (results as { riskFactors?: Array<{ description: string; severity: string; mitigationStrategy: string }> })?.riskFactors;
  if (riskFactors && riskFactors.length > 0) {
    markdown += `## Risk Factors\n\n`;
    markdown += `| Risk | Severity | Mitigation |\n`;
    markdown += `|------|----------|------------|\n`;
    riskFactors.forEach((risk) => {
      markdown += `| ${risk.description} | ${risk.severity} | ${risk.mitigationStrategy} |\n`;
    });
    markdown += `\n`;
  }

  markdown += `---\n\n`;
  markdown += `*Generated by Enterprise AI Foundation Platform*\n`;

  return markdown;
}

function formatCategoryName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
