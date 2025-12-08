/**
 * BMD Upload Routes
 * Task: T155
 *
 * API endpoints for uploading BMD NTCS and CSV files.
 * Handles multipart file uploads, validates files, and triggers import jobs.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { organizationContext, getOrganizationId } from '../middleware/organization.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateParams, getValidatedParams } from '../middleware/validation.js';
import { addJob, QueueNames } from '../../jobs/queue.js';
import { JobStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// Validation schemas
const dataSourceIdSchema = z.object({
  dataSourceId: z.string().uuid(),
});

const uploadQuerySchema = z.object({
  fiscalYear: z.coerce.number().int().min(1900).max(2100).optional(),
});

// Austrian error messages
const AUSTRIAN_MESSAGES = {
  NO_FILE: 'Keine Datei hochgeladen',
  INVALID_FILE_TYPE: 'Ungültiger Dateityp. Nur NTCS und CSV Dateien sind erlaubt',
  FILE_TOO_LARGE: 'Datei zu groß. Maximum ist 50MB',
  UPLOAD_FAILED: 'Datei-Upload fehlgeschlagen',
  DATA_SOURCE_NOT_FOUND: 'Datenquelle nicht gefunden',
  INVALID_DATA_SOURCE_TYPE: 'Ungültiger Datenquellentyp. Nur BMD wird unterstützt',
  IMPORT_JOB_CREATED: 'Import-Job erfolgreich erstellt',
};

// File upload configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/csv',
  'application/octet-stream',
  'application/x-ntcs',
];
const ALLOWED_EXTENSIONS = ['.ntcs', '.csv', '.txt'];

/**
 * Validate file upload
 */
function validateFile(file: {
  filename: string;
  mimetype: string;
  file: NodeJS.ReadableStream;
}): { valid: boolean; error?: string; fileType?: 'ntcs' | 'csv' } {
  // Check filename extension
  const ext = path.extname(file.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `${AUSTRIAN_MESSAGES.INVALID_FILE_TYPE}: ${ext}`,
    };
  }

  // Determine file type
  let fileType: 'ntcs' | 'csv';
  if (ext === '.ntcs' || ext === '.txt') {
    fileType = 'ntcs';
  } else if (ext === '.csv') {
    fileType = 'csv';
  } else {
    return {
      valid: false,
      error: AUSTRIAN_MESSAGES.INVALID_FILE_TYPE,
    };
  }

  return { valid: true, fileType };
}

/**
 * Save uploaded file to temporary location
 */
async function saveUploadedFile(
  file: NodeJS.ReadableStream,
  fileName: string
): Promise<{ filePath: string; size: number }> {
  const tempDir = os.tmpdir();
  const uniqueFileName = `${randomUUID()}-${fileName}`;
  const filePath = path.join(tempDir, uniqueFileName);

  let size = 0;
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    file.on('data', (chunk: Buffer) => {
      size += chunk.length;

      // Check file size limit
      if (size > MAX_FILE_SIZE) {
        file.destroy();
        reject(new Error(AUSTRIAN_MESSAGES.FILE_TOO_LARGE));
        return;
      }

      chunks.push(chunk);
    });

    file.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(filePath, buffer);
        resolve({ filePath, size });
      } catch (error) {
        reject(error);
      }
    });

    file.on('error', (error) => {
      reject(error);
    });
  });
}

export async function bmdUploadRoutes(fastify: FastifyInstance) {
  // Apply authentication and organization context to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', organizationContext);

  /**
   * POST /api/v1/connectors/bmd/:dataSourceId/upload
   * Upload BMD NTCS or CSV file for import
   */
  fastify.post(
    '/:dataSourceId/upload',
    {
      preHandler: [
        requirePermission('dataSource', 'write'),
        validateParams(dataSourceIdSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { dataSourceId } = getValidatedParams<z.infer<typeof dataSourceIdSchema>>(request);
      const authRequest = request as AuthenticatedRequest;
      const userId = authRequest.user?.id;

      try {
        // Get fiscal year from query params if provided
        const queryParams = request.query as Record<string, string>;
        const fiscalYear = queryParams.fiscalYear ? parseInt(queryParams.fiscalYear, 10) : undefined;

        // Check if data source exists and is BMD type
        const dataSource = await prisma.dataSource.findFirst({
          where: {
            id: dataSourceId,
            organizationId,
          },
        });

        if (!dataSource) {
          return reply.status(404).send({
            error: 'NOT_FOUND',
            message: AUSTRIAN_MESSAGES.DATA_SOURCE_NOT_FOUND,
          });
        }

        if (dataSource.type !== 'BMD') {
          return reply.status(400).send({
            error: 'INVALID_TYPE',
            message: AUSTRIAN_MESSAGES.INVALID_DATA_SOURCE_TYPE,
          });
        }

        // Handle multipart file upload
        const data = await request.file({
          limits: {
            fileSize: MAX_FILE_SIZE,
          },
        });

        if (!data) {
          return reply.status(400).send({
            error: 'NO_FILE',
            message: AUSTRIAN_MESSAGES.NO_FILE,
          });
        }

        // Validate file
        const validation = validateFile({
          filename: data.filename,
          mimetype: data.mimetype,
          file: data.file,
        });

        if (!validation.valid || !validation.fileType) {
          return reply.status(400).send({
            error: 'INVALID_FILE',
            message: validation.error || AUSTRIAN_MESSAGES.INVALID_FILE_TYPE,
          });
        }

        // Save uploaded file to temporary location
        let filePath: string;
        let fileSize: number;

        try {
          const saved = await saveUploadedFile(data.file, data.filename);
          filePath = saved.filePath;
          fileSize = saved.size;
        } catch (error) {
          fastify.log.error('File save failed', error);
          return reply.status(500).send({
            error: 'UPLOAD_FAILED',
            message: AUSTRIAN_MESSAGES.UPLOAD_FAILED,
          });
        }

        // Create import job record
        const importJob = await prisma.syncJob.create({
          data: {
            dataSourceId,
            organizationId,
            status: JobStatus.PENDING,
            metadata: {
              fileName: data.filename,
              fileSize,
              fileType: validation.fileType,
              fiscalYear,
              uploadedBy: userId,
              uploadedAt: new Date().toISOString(),
            },
          },
        });

        // Queue import job
        await addJob(
          QueueNames.BMD_IMPORT || 'bmd-import',
          'bmd-import',
          {
            importJobId: importJob.id,
            organizationId,
            dataSourceId,
            filePath,
            fileName: data.filename,
            fileType: validation.fileType,
            fiscalYear,
            userId,
          },
          {
            priority: 5,
            jobId: importJob.id,
          }
        );

        return reply.status(202).send({
          success: true,
          message: AUSTRIAN_MESSAGES.IMPORT_JOB_CREATED,
          importJob: {
            id: importJob.id,
            status: importJob.status,
            fileName: data.filename,
            fileSize,
            fileType: validation.fileType,
            fiscalYear,
            createdAt: importJob.createdAt,
          },
        });
      } catch (error) {
        fastify.log.error('BMD upload error', error);

        return reply.status(500).send({
          error: 'INTERNAL_ERROR',
          message: AUSTRIAN_MESSAGES.UPLOAD_FAILED,
        });
      }
    }
  );

  /**
   * GET /api/v1/connectors/bmd/:dataSourceId/imports
   * Get import job history for a data source
   */
  fastify.get(
    '/:dataSourceId/imports',
    {
      preHandler: [
        requirePermission('dataSource', 'read'),
        validateParams(dataSourceIdSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { dataSourceId } = getValidatedParams<z.infer<typeof dataSourceIdSchema>>(request);

      // Check if data source exists
      const dataSource = await prisma.dataSource.findFirst({
        where: {
          id: dataSourceId,
          organizationId,
        },
      });

      if (!dataSource) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: AUSTRIAN_MESSAGES.DATA_SOURCE_NOT_FOUND,
        });
      }

      // Get import jobs
      const imports = await prisma.syncJob.findMany({
        where: {
          dataSourceId,
          organizationId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      });

      return reply.send({
        imports: imports.map(job => ({
          id: job.id,
          status: job.status,
          fileName: (job.metadata as Record<string, unknown>)?.fileName,
          fileSize: (job.metadata as Record<string, unknown>)?.fileSize,
          fileType: (job.metadata as Record<string, unknown>)?.fileType,
          fiscalYear: (job.metadata as Record<string, unknown>)?.fiscalYear,
          eventsCount: job.eventsCount,
          errorMessage: job.errorMessage,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        })),
      });
    }
  );

  /**
   * GET /api/v1/connectors/bmd/:dataSourceId/imports/:importId
   * Get import job details
   */
  fastify.get(
    '/:dataSourceId/imports/:importId',
    {
      preHandler: [
        requirePermission('dataSource', 'read'),
        validateParams(z.object({
          dataSourceId: z.string().uuid(),
          importId: z.string().uuid(),
        })),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = getOrganizationId(request);
      const { dataSourceId, importId } = getValidatedParams<{
        dataSourceId: string;
        importId: string;
      }>(request);

      // Get import job
      const importJob = await prisma.syncJob.findFirst({
        where: {
          id: importId,
          dataSourceId,
          organizationId,
        },
      });

      if (!importJob) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Import-Job nicht gefunden',
        });
      }

      return reply.send({
        id: importJob.id,
        status: importJob.status,
        metadata: importJob.metadata,
        eventsCount: importJob.eventsCount,
        errorMessage: importJob.errorMessage,
        createdAt: importJob.createdAt,
        startedAt: importJob.startedAt,
        completedAt: importJob.completedAt,
      });
    }
  );
}
