/**
 * White-Label API Routes
 * SCALE Tier - Tasks T123-T131
 *
 * REST API for reseller and white-label management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ResellerService } from '../../services/whiteLabel/resellerService';
import { BrandingService } from '../../services/whiteLabel/brandingService';
import { DomainService } from '../../services/whiteLabel/domainService';
import { BillingService } from '../../services/whiteLabel/billingService';
import { AppError } from '../../lib/errors/AppError';

const router = Router();

// Initialize services (in production, use dependency injection)
let resellerService: ResellerService;
let brandingService: BrandingService;
let domainService: DomainService;
let billingService: BillingService;

export function initializeWhiteLabelRoutes(prisma: PrismaClient): Router {
  resellerService = new ResellerService({ prisma });
  brandingService = new BrandingService({ prisma });
  domainService = new DomainService({ prisma });
  billingService = new BillingService({ prisma });

  return router;
}

// Error handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// ==========================================================================
// T124-T125: Reseller Management
// ==========================================================================

/**
 * @openapi
 * /api/resellers:
 *   get:
 *     summary: List all resellers
 *     tags: [Resellers]
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: tier
 *         schema:
 *           type: string
 *           enum: [RESELLER_STARTER, RESELLER_PROFESSIONAL, RESELLER_ENTERPRISE]
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of resellers
 */
router.get(
  '/resellers',
  asyncHandler(async (req: Request, res: Response) => {
    const { isActive, tier, skip, take } = req.query;

    const result = await resellerService.list({
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      tier: tier as 'RESELLER_STARTER' | 'RESELLER_PROFESSIONAL' | 'RESELLER_ENTERPRISE',
      skip: skip ? parseInt(skip as string) : undefined,
      take: take ? parseInt(take as string) : undefined,
    });

    res.json(result);
  })
);

/**
 * @openapi
 * /api/resellers:
 *   post:
 *     summary: Create a new reseller
 *     tags: [Resellers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, contactEmail, billingEmail, tier]
 *             properties:
 *               name:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *               billingEmail:
 *                 type: string
 *               tier:
 *                 type: string
 *                 enum: [RESELLER_STARTER, RESELLER_PROFESSIONAL, RESELLER_ENTERPRISE]
 *               commissionRate:
 *                 type: number
 *     responses:
 *       201:
 *         description: Reseller created
 */
router.post(
  '/resellers',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, contactEmail, billingEmail, tier, commissionRate } = req.body;

    const reseller = await resellerService.create({
      name,
      contactEmail,
      billingEmail,
      tier,
      commissionRate,
    });

    res.status(201).json(reseller);
  })
);

/**
 * @openapi
 * /api/resellers/{id}:
 *   get:
 *     summary: Get reseller by ID
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reseller details
 *       404:
 *         description: Reseller not found
 */
router.get(
  '/resellers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const reseller = await resellerService.getByIdWithDetails(req.params.id);

    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller not found');
    }

    res.json(reseller);
  })
);

/**
 * @openapi
 * /api/resellers/{id}:
 *   put:
 *     summary: Update reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *               billingEmail:
 *                 type: string
 *               tier:
 *                 type: string
 *               commissionRate:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated reseller
 */
router.put(
  '/resellers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const reseller = await resellerService.update(req.params.id, req.body);
    res.json(reseller);
  })
);

/**
 * @openapi
 * /api/resellers/{id}:
 *   delete:
 *     summary: Delete reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Reseller deleted
 */
router.delete(
  '/resellers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    await resellerService.delete(req.params.id);
    res.status(204).send();
  })
);

// ==========================================================================
// T126-T127: Customer Management
// ==========================================================================

/**
 * @openapi
 * /api/resellers/{id}/customers:
 *   get:
 *     summary: List customers for reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, SUSPENDED, ARCHIVED]
 *     responses:
 *       200:
 *         description: List of customers
 */
router.get(
  '/resellers/:id/customers',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, skip, take } = req.query;

    const result = await resellerService.listCustomers(req.params.id, {
      status: status as 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
      skip: skip ? parseInt(skip as string) : undefined,
      take: take ? parseInt(take as string) : undefined,
    });

    res.json(result);
  })
);

/**
 * @openapi
 * /api/resellers/{id}/customers:
 *   post:
 *     summary: Add customer to reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               configuration:
 *                 type: object
 *     responses:
 *       201:
 *         description: Customer created
 */
router.post(
  '/resellers/:id/customers',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, configuration } = req.body;

    const customer = await resellerService.addCustomer(req.params.id, {
      name,
      slug,
      configuration,
    });

    res.status(201).json(customer);
  })
);

/**
 * @openapi
 * /api/resellers/{id}/customers/{customerId}:
 *   delete:
 *     summary: Remove customer from reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Customer removed
 */
router.delete(
  '/resellers/:id/customers/:customerId',
  asyncHandler(async (req: Request, res: Response) => {
    await resellerService.removeCustomer(req.params.id, req.params.customerId);
    res.status(204).send();
  })
);

// ==========================================================================
// T128-T129: White-Label Config Management
// ==========================================================================

/**
 * @openapi
 * /api/white-label/config:
 *   get:
 *     summary: Get current branding config
 *     tags: [WhiteLabel]
 *     responses:
 *       200:
 *         description: Branding configuration
 */
router.get(
  '/white-label/config',
  asyncHandler(async (req: Request, res: Response) => {
    // Check if request has white-label context
    if (req.whiteLabelConfig) {
      const config = await brandingService.getById(req.whiteLabelConfig.id);
      if (config) {
        return res.json({
          id: config.id,
          name: config.name,
          branding: config.branding,
          customCss: config.customCss,
          features: config.features,
        });
      }
    }

    // Return default config
    res.json({
      id: null,
      name: 'Foundry',
      branding: {
        colors: {
          primary: '#3B82F6',
          secondary: '#64748B',
        },
      },
      features: {},
    });
  })
);

/**
 * @openapi
 * /api/white-label/config:
 *   put:
 *     summary: Update branding config
 *     tags: [WhiteLabel]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               branding:
 *                 type: object
 *               customCss:
 *                 type: string
 *               features:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated config
 */
router.put(
  '/white-label/config',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.whiteLabelConfig) {
      throw new AppError('NO_WHITE_LABEL_CONTEXT', 'No white-label context available');
    }

    const config = await brandingService.update(req.whiteLabelConfig.id, req.body);
    res.json(config);
  })
);

/**
 * @openapi
 * /api/white-label/config/{resellerId}:
 *   post:
 *     summary: Create branding config for reseller
 *     tags: [WhiteLabel]
 *     parameters:
 *       - in: path
 *         name: resellerId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, branding]
 *             properties:
 *               name:
 *                 type: string
 *               branding:
 *                 type: object
 *               customCss:
 *                 type: string
 *               customDomain:
 *                 type: string
 *               features:
 *                 type: object
 *     responses:
 *       201:
 *         description: Config created
 */
router.post(
  '/white-label/config/:resellerId',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, branding, customCss, customDomain, features } = req.body;

    const config = await brandingService.create({
      resellerId: req.params.resellerId,
      name,
      branding,
      customCss,
      customDomain,
      features,
    });

    res.status(201).json(config);
  })
);

/**
 * @openapi
 * /api/white-label/config/{id}/logo:
 *   post:
 *     summary: Upload logo
 *     tags: [WhiteLabel]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [logo, logoDark, favicon]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo uploaded
 */
router.post(
  '/white-label/config/:id/logo',
  asyncHandler(async (req: Request, res: Response) => {
    const type = (req.query.type as 'logo' | 'logoDark' | 'favicon') || 'logo';

    // In production, use multer or similar for file upload handling
    // For now, assume file is in req.body.file
    const file = (req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;

    if (!file) {
      throw new AppError('NO_FILE', 'No file uploaded');
    }

    const result = await brandingService.uploadLogo(req.params.id, file, type);
    res.json(result);
  })
);

// ==========================================================================
// T130: Domain Verification
// ==========================================================================

/**
 * @openapi
 * /api/white-label/domain/configure:
 *   post:
 *     summary: Configure custom domain
 *     tags: [WhiteLabel]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [configId, domain]
 *             properties:
 *               configId:
 *                 type: string
 *               domain:
 *                 type: string
 *     responses:
 *       200:
 *         description: Domain setup instructions
 */
router.post(
  '/white-label/domain/configure',
  asyncHandler(async (req: Request, res: Response) => {
    const { configId, domain } = req.body;

    const instructions = await domainService.configureDomain(configId, domain);
    res.json(instructions);
  })
);

/**
 * @openapi
 * /api/white-label/domain/verify:
 *   post:
 *     summary: Verify domain ownership
 *     tags: [WhiteLabel]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [configId]
 *             properties:
 *               configId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification result
 */
router.post(
  '/white-label/domain/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const { configId } = req.body;

    const result = await domainService.verifyDomain(configId);
    res.json(result);
  })
);

/**
 * @openapi
 * /api/white-label/domain/status:
 *   get:
 *     summary: Check domain DNS status
 *     tags: [WhiteLabel]
 *     parameters:
 *       - in: query
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: DNS status
 */
router.get(
  '/white-label/domain/status',
  asyncHandler(async (req: Request, res: Response) => {
    const domain = req.query.domain as string;

    if (!domain) {
      throw new AppError('DOMAIN_REQUIRED', 'Domain parameter is required');
    }

    const status = await domainService.checkDomainStatus(domain);
    res.json(status);
  })
);

/**
 * @openapi
 * /api/white-label/domain/ssl:
 *   post:
 *     summary: Request SSL certificate
 *     tags: [WhiteLabel]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [configId]
 *             properties:
 *               configId:
 *                 type: string
 *     responses:
 *       200:
 *         description: SSL request status
 */
router.post(
  '/white-label/domain/ssl',
  asyncHandler(async (req: Request, res: Response) => {
    const { configId } = req.body;

    const result = await domainService.requestSslCertificate(configId);
    res.json(result);
  })
);

// ==========================================================================
// T131: Billing Reports
// ==========================================================================

/**
 * @openapi
 * /api/resellers/{id}/billing:
 *   get:
 *     summary: Get billing report for reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Billing report
 */
router.get(
  '/resellers/:id/billing',
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    // Default to current month
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getFullYear(), end.getMonth(), 1);

    const summary = await billingService.getBillingSummary(req.params.id, {
      start,
      end,
    });

    res.json(summary);
  })
);

/**
 * @openapi
 * /api/resellers/{id}/invoice:
 *   get:
 *     summary: Generate invoice for reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Invoice
 */
router.get(
  '/resellers/:id/invoice',
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new AppError('DATE_REQUIRED', 'Start date and end date are required');
    }

    const invoice = await billingService.generateInvoice(req.params.id, {
      start: new Date(startDate as string),
      end: new Date(endDate as string),
    });

    res.json(invoice);
  })
);

/**
 * @openapi
 * /api/resellers/{id}/commission:
 *   get:
 *     summary: Get commission report for reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Commission report
 */
router.get(
  '/resellers/:id/commission',
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getFullYear(), end.getMonth(), 1);

    const report = await billingService.calculateCommission(req.params.id, {
      start,
      end,
    });

    res.json(report);
  })
);

/**
 * @openapi
 * /api/resellers/{id}/usage:
 *   get:
 *     summary: Get usage metrics for reseller
 *     tags: [Resellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Usage metrics
 */
router.get(
  '/resellers/:id/usage',
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getFullYear(), end.getMonth(), 1);

    const usage = await billingService.getAggregatedUsage(req.params.id, {
      start,
      end,
    });

    res.json(usage);
  })
);

export default router;
