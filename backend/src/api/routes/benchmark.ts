// =============================================================================
// Benchmark API Routes
// SCALE Tier - Task T226-T235
//
// REST API endpoints for cross-company benchmarking
// =============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { BenchmarkService } from '../../services/benchmark/benchmarkService';
import { requireAuth, requireEntityAccess } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const benchmarkService = new BenchmarkService(prisma);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const OptInSchema = z.object({
  segments: z.array(
    z.object({
      industry: z.string().optional(),
      companySize: z.string().optional(),
      region: z.string().optional(),
      processType: z.string().optional(),
    })
  ),
  consent: z.object({
    acceptedTerms: z.boolean(),
    acceptedPrivacyPolicy: z.boolean(),
  }),
});

// -----------------------------------------------------------------------------
// Opt-In Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/benchmark/opt-in:
 *   post:
 *     tags:
 *       - Benchmarking
 *     summary: Opt in to cross-company benchmarking
 *     description: |
 *       Opt your organization into anonymous cross-company benchmarking.
 *       This enables comparison of your process metrics against industry peers.
 *
 *       Privacy guarantees:
 *       - Minimum 10 participants per segment (k-anonymity)
 *       - Only aggregated data is shared (no raw values)
 *       - Company identifiers are never exposed
 *       - GDPR compliant with full data export/deletion rights
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - segments
 *               - consent
 *             properties:
 *               segments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     industry:
 *                       type: string
 *                     companySize:
 *                       type: string
 *                     region:
 *                       type: string
 *               consent:
 *                 type: object
 *                 required:
 *                   - acceptedTerms
 *                   - acceptedPrivacyPolicy
 *                 properties:
 *                   acceptedTerms:
 *                     type: boolean
 *                   acceptedPrivacyPolicy:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Successfully opted in
 *       400:
 *         description: Invalid request or consent not given
 */
router.post(
  '/opt-in',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const { segments, consent } = OptInSchema.parse(req.body);
      const entityId = (req as Request & { entityId: string }).entityId;

      const result = await benchmarkService.optIn({
        entityId,
        segments,
        consentDetails: {
          acceptedTerms: consent.acceptedTerms,
          acceptedPrivacyPolicy: consent.acceptedPrivacyPolicy,
          consentTimestamp: new Date(),
          consentVersion: '1.0',
          ipAddress: req.ip,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          errors: error.errors.map((e) => e.message),
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to opt in to benchmarking',
      });
    }
  }
);

/**
 * @openapi
 * /api/benchmark/opt-out:
 *   post:
 *     tags:
 *       - Benchmarking
 *     summary: Opt out of cross-company benchmarking
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully opted out
 */
router.post(
  '/opt-out',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const entityId = (req as Request & { entityId: string }).entityId;

      await benchmarkService.optOut(entityId);

      res.json({
        success: true,
        message: 'Successfully opted out of benchmarking',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to opt out',
      });
    }
  }
);

/**
 * @openapi
 * /api/benchmark/status:
 *   get:
 *     tags:
 *       - Benchmarking
 *     summary: Get current opt-in status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opt-in status
 */
router.get(
  '/status',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const entityId = (req as Request & { entityId: string }).entityId;

      const status = await benchmarkService.getOptInStatus(entityId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get opt-in status',
      });
    }
  }
);

// -----------------------------------------------------------------------------
// Benchmark Data Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/benchmark/segments:
 *   get:
 *     tags:
 *       - Benchmarking
 *     summary: Get available benchmark segments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available segments
 */
router.get(
  '/segments',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const segments = await benchmarkService.getAvailableSegments();

      res.json({
        success: true,
        data: segments,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get segments',
      });
    }
  }
);

/**
 * @openapi
 * /api/benchmark/segments/{segmentId}:
 *   get:
 *     tags:
 *       - Benchmarking
 *     summary: Get benchmark data for a segment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: segmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Benchmark data
 *       404:
 *         description: Segment not found or insufficient participants
 */
router.get(
  '/segments/:segmentId',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const { segmentId } = req.params;

      const benchmark = await benchmarkService.getBenchmarkForSegment(segmentId);

      if (!benchmark) {
        return res.status(404).json({
          success: false,
          error: 'Segment not found or has insufficient participants (minimum 10)',
        });
      }

      res.json({
        success: true,
        data: benchmark,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get benchmark data',
      });
    }
  }
);

/**
 * @openapi
 * /api/benchmark/compare/{segmentId}:
 *   get:
 *     tags:
 *       - Benchmarking
 *     summary: Compare your organization to a segment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: segmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comparison results
 *       403:
 *         description: Organization not opted in
 */
router.get(
  '/compare/:segmentId',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const { segmentId } = req.params;
      const entityId = (req as Request & { entityId: string }).entityId;

      const comparisons = await benchmarkService.getComparisonForEntity(
        entityId,
        segmentId
      );

      res.json({
        success: true,
        data: comparisons,
      });
    } catch (error) {
      if ((error as Error).message.includes('opted in')) {
        return res.status(403).json({
          success: false,
          error: 'Organization must be opted in to view comparisons',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get comparison data',
      });
    }
  }
);

/**
 * @openapi
 * /api/benchmark/dashboard:
 *   get:
 *     tags:
 *       - Benchmarking
 *     summary: Get benchmark dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 */
router.get(
  '/dashboard',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const entityId = (req as Request & { entityId: string }).entityId;

      const dashboard = await benchmarkService.getDashboard(entityId);

      res.json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard',
      });
    }
  }
);

// -----------------------------------------------------------------------------
// GDPR Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/benchmark/data-export:
 *   get:
 *     tags:
 *       - Benchmarking
 *     summary: Export all benchmark data for entity (GDPR)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data export
 */
router.get(
  '/data-export',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const entityId = (req as Request & { entityId: string }).entityId;

      const data = await benchmarkService.exportEntityData(entityId);

      res.json({
        success: true,
        data,
        message:
          'This export contains all benchmark-related data for your organization.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to export data',
      });
    }
  }
);

/**
 * @openapi
 * /api/benchmark/data-deletion:
 *   delete:
 *     tags:
 *       - Benchmarking
 *     summary: Delete all benchmark data for entity (GDPR)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data deleted
 */
router.delete(
  '/data-deletion',
  requireAuth,
  requireEntityAccess,
  async (req: Request, res: Response) => {
    try {
      const entityId = (req as Request & { entityId: string }).entityId;

      await benchmarkService.deleteEntityData(entityId);

      res.json({
        success: true,
        message: 'All benchmark data for your organization has been deleted.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete data',
      });
    }
  }
);

export default router;
