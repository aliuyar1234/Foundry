// =============================================================================
// Licensing API Routes
// SCALE Tier - Task T181-T185
//
// REST API endpoints for license management
// =============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LicenseService } from '../../services/licensing/licenseService';
import { OfflineModeService } from '../../services/licensing/offlineModeService';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../../lib/prisma.js';

const router = Router();
const licenseService = new LicenseService(prisma);
const offlineModeService = new OfflineModeService(prisma, licenseService);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const ActivateLicenseSchema = z.object({
  licenseKey: z.string().min(1, 'License key is required'),
});

const CacheAiResponseSchema = z.object({
  prompt: z.string().min(1),
  response: z.string().min(1),
  model: z.string().min(1),
  ttlHours: z.number().optional(),
});

// -----------------------------------------------------------------------------
// License Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/license/status:
 *   get:
 *     tags:
 *       - Licensing
 *     summary: Get current license status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: License status
 */
router.get(
  '/status',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const info = await licenseService.getLicenseInfo();

      res.json({
        success: true,
        data: {
          status: info.status,
          type: info.license?.type,
          organization: info.license?.organizationName,
          expiresAt: info.license?.expiresAt,
          daysRemaining: info.daysRemaining,
          features: info.license?.features,
          usage: info.usage,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get license status',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/activate:
 *   post:
 *     tags:
 *       - Licensing
 *     summary: Activate a new license
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - licenseKey
 *             properties:
 *               licenseKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: License activated
 *       400:
 *         description: Invalid license
 */
router.post(
  '/activate',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const { licenseKey } = ActivateLicenseSchema.parse(req.body);

      const result = await licenseService.activateLicense(licenseKey);

      if (!result.valid) {
        return res.status(400).json({
          success: false,
          errors: result.errors,
        });
      }

      res.json({
        success: true,
        data: {
          type: result.license?.type,
          organization: result.license?.organizationName,
          expiresAt: result.license?.expiresAt,
          features: result.license?.features,
        },
        warnings: result.warnings,
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
        error: 'Failed to activate license',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/validate:
 *   post:
 *     tags:
 *       - Licensing
 *     summary: Validate the current license
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post(
  '/validate',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const result = await licenseService.validateLicense();

      res.json({
        success: true,
        data: {
          valid: result.valid,
          daysRemaining: result.daysRemaining,
          warnings: result.warnings,
          errors: result.errors,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to validate license',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/features/{feature}:
 *   get:
 *     tags:
 *       - Licensing
 *     summary: Check if a specific feature is enabled
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: feature
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Feature status
 */
router.get(
  '/features/:feature',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { feature } = req.params;

      const hasFeature = await licenseService.hasFeature(
        feature as keyof typeof import('../../services/licensing/licenseService').LicenseFeatures
      );

      res.json({
        success: true,
        data: {
          feature,
          enabled: hasFeature,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to check feature',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/hardware-fingerprint:
 *   get:
 *     tags:
 *       - Licensing
 *     summary: Get the hardware fingerprint of this installation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hardware fingerprint
 */
router.get(
  '/hardware-fingerprint',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (_req: Request, res: Response) => {
    try {
      const fingerprint = await licenseService.getHardwareFingerprint();

      res.json({
        success: true,
        data: {
          fingerprint,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get hardware fingerprint',
      });
    }
  }
);

// -----------------------------------------------------------------------------
// Offline Mode Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/license/offline/status:
 *   get:
 *     tags:
 *       - Offline Mode
 *     summary: Get offline mode status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offline status
 */
router.get(
  '/offline/status',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const status = await offlineModeService.getStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get offline status',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/offline/sync-package:
 *   post:
 *     tags:
 *       - Offline Mode
 *     summary: Create a sync package for offline transfer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [full, incremental]
 *     responses:
 *       200:
 *         description: Sync package created
 */
router.post(
  '/offline/sync-package',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const type = (req.body.type as 'full' | 'incremental') || 'incremental';
      const pkg = await offlineModeService.createSyncPackage(type);

      res.json({
        success: true,
        data: pkg,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create sync package',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/offline/import:
 *   post:
 *     tags:
 *       - Offline Mode
 *     summary: Import a sync package
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Import result
 */
router.post(
  '/offline/import',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const result = await offlineModeService.importSyncPackage(req.body);

      res.json({
        success: result.success,
        data: {
          imported: result.imported,
          errors: result.errors,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to import sync package',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/offline/ai-cache:
 *   post:
 *     tags:
 *       - Offline Mode
 *     summary: Cache an AI response for offline use
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *               - response
 *               - model
 *             properties:
 *               prompt:
 *                 type: string
 *               response:
 *                 type: string
 *               model:
 *                 type: string
 *               ttlHours:
 *                 type: number
 *     responses:
 *       200:
 *         description: Response cached
 */
router.post(
  '/offline/ai-cache',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { prompt, response, model, ttlHours } = CacheAiResponseSchema.parse(
        req.body
      );

      await offlineModeService.cacheAiResponse(prompt, response, model, ttlHours);

      res.json({
        success: true,
        message: 'Response cached successfully',
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
        error: 'Failed to cache AI response',
      });
    }
  }
);

/**
 * @openapi
 * /api/license/offline/ai-cache/cleanup:
 *   post:
 *     tags:
 *       - Offline Mode
 *     summary: Clean up expired AI cache entries
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup result
 */
router.post(
  '/offline/ai-cache/cleanup',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (_req: Request, res: Response) => {
    try {
      const deletedCount = await offlineModeService.cleanupExpiredCache();

      res.json({
        success: true,
        data: {
          deleted: deletedCount,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup cache',
      });
    }
  }
);

export default router;
