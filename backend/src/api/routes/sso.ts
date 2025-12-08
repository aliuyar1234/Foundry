// =============================================================================
// SSO API Routes
// SCALE Tier - Task T296-T305
//
// REST API endpoints for enterprise SSO configuration and authentication
// =============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SamlService } from '../../services/sso/samlService';
import { OidcService } from '../../services/sso/oidcService';
import { ScimService } from '../../services/sso/scimService';
import { RoleMappingService } from '../../services/sso/roleMappingService';
import { DirectorySyncService } from '../../services/sso/directorySyncService';
import { requireAuth, requireRole, requireEntityAccess } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const samlService = new SamlService(prisma);
const oidcService = new OidcService(prisma);
const roleMappingService = new RoleMappingService(prisma);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const SamlConfigSchema = z.object({
  idpEntityId: z.string().min(1),
  idpSsoUrl: z.string().url(),
  idpSloUrl: z.string().url().optional(),
  idpCertificate: z.string().min(1),
  spEntityId: z.string().min(1),
  spAcsUrl: z.string().url(),
  spSloUrl: z.string().url().optional(),
  attributeMapping: z.object({
    email: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    displayName: z.string().optional(),
    groups: z.string().optional(),
    roles: z.string().optional(),
  }),
  signRequests: z.boolean().default(false),
  signAssertions: z.boolean().default(true),
  encryptAssertions: z.boolean().default(false),
  allowUnencrypted: z.boolean().default(true),
});

const OidcConfigSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  postLogoutRedirectUri: z.string().url().optional(),
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
  claimMapping: z.object({
    email: z.string().default('email'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    displayName: z.string().optional(),
    groups: z.string().optional(),
    roles: z.string().optional(),
  }),
  pkceEnabled: z.boolean().default(true),
  noncesEnabled: z.boolean().default(true),
});

// -----------------------------------------------------------------------------
// SSO Configuration Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/sso/config:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Get SSO configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SSO configuration
 */
router.get(
  '/config',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;

      const samlConfig = await samlService.getConfiguration(organizationId);
      const oidcConfig = await oidcService.getConfiguration(organizationId);

      res.json({
        success: true,
        data: {
          saml: samlConfig
            ? {
                ...samlConfig,
                idpCertificate: '[REDACTED]',
                spPrivateKey: undefined,
              }
            : null,
          oidc: oidcConfig
            ? {
                ...oidcConfig,
                clientSecret: '[REDACTED]',
              }
            : null,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get SSO configuration',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/saml/config:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Create or update SAML configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SAML configuration saved
 */
router.post(
  '/saml/config',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const config = SamlConfigSchema.parse(req.body);

      const existing = await samlService.getConfiguration(organizationId);

      let result;
      if (existing) {
        result = await samlService.updateConfiguration(existing.id, config);
      } else {
        result = await samlService.createConfiguration(organizationId, {
          ...config,
          organizationId,
          providerType: 'SAML',
          enabled: true,
        });
      }

      res.json({
        success: true,
        data: {
          ...result,
          idpCertificate: '[REDACTED]',
          spPrivateKey: undefined,
        },
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
        error: 'Failed to save SAML configuration',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/saml/metadata:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Get SP metadata XML
 *     responses:
 *       200:
 *         description: SAML SP metadata
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 */
router.get('/saml/metadata', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.org as string;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID required',
      });
    }

    const config = await samlService.getConfiguration(organizationId);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'SAML not configured for this organization',
      });
    }

    const metadata = samlService.generateSpMetadata(config);

    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate metadata',
    });
  }
});

// -----------------------------------------------------------------------------
// SAML Authentication Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/sso/saml/login:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Initiate SAML login
 *     parameters:
 *       - in: query
 *         name: org
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to IdP
 */
router.get('/saml/login', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.org as string;
    const relayState = req.query.redirect as string;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID required',
      });
    }

    const config = await samlService.getConfiguration(organizationId);

    if (!config || !config.enabled) {
      return res.status(404).json({
        success: false,
        error: 'SAML not configured or disabled',
      });
    }

    const redirectUrl = samlService.buildRedirectUrl(config, relayState);
    res.redirect(redirectUrl);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to initiate SAML login',
    });
  }
});

/**
 * @openapi
 * /api/sso/saml/acs:
 *   post:
 *     tags:
 *       - SSO
 *     summary: SAML Assertion Consumer Service
 *     responses:
 *       302:
 *         description: Redirect after authentication
 */
router.post('/saml/acs', async (req: Request, res: Response) => {
  try {
    const samlResponse = req.body.SAMLResponse;
    const relayState = req.body.RelayState;

    if (!samlResponse) {
      return res.status(400).json({
        success: false,
        error: 'SAMLResponse required',
      });
    }

    // Determine organization from RelayState or another mechanism
    // In production, you'd store the organization ID during the auth request
    const organizationId = relayState?.split('|')[0] || '';

    const config = await samlService.getConfiguration(organizationId);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Unknown organization',
      });
    }

    const result = await samlService.parseResponse(samlResponse, config);

    if (!result.success || !result.user) {
      return res.status(401).json({
        success: false,
        error: result.error || 'Authentication failed',
      });
    }

    // Create or update user and generate JWT
    // This would integrate with your existing auth system
    res.json({
      success: true,
      data: {
        user: result.user,
        // token: generateJwt(user),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to process SAML response',
    });
  }
});

// -----------------------------------------------------------------------------
// OIDC Configuration and Authentication Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/sso/oidc/config:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Create or update OIDC configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OIDC configuration saved
 */
router.post(
  '/oidc/config',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const inputConfig = OidcConfigSchema.parse(req.body);

      // Discover additional configuration from issuer
      const discovered = await oidcService.discoverConfiguration(inputConfig.issuer);

      const config = {
        ...inputConfig,
        ...discovered,
        enabled: true,
      };

      const result = await oidcService.createConfiguration(organizationId, {
        ...config,
        organizationId,
        providerType: 'OIDC',
      });

      res.json({
        success: true,
        data: {
          ...result,
          clientSecret: '[REDACTED]',
        },
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
        error: 'Failed to save OIDC configuration',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/oidc/login:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Initiate OIDC login
 *     responses:
 *       302:
 *         description: Redirect to IdP
 */
router.get('/oidc/login', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.org as string;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID required',
      });
    }

    const config = await oidcService.getConfiguration(organizationId);

    if (!config || !config.enabled) {
      return res.status(404).json({
        success: false,
        error: 'OIDC not configured or disabled',
      });
    }

    const { url } = await oidcService.buildAuthorizationUrl(config);
    res.redirect(url);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to initiate OIDC login',
    });
  }
});

/**
 * @openapi
 * /api/sso/oidc/callback:
 *   get:
 *     tags:
 *       - SSO
 *     summary: OIDC callback
 *     responses:
 *       302:
 *         description: Redirect after authentication
 */
router.get('/oidc/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      return res.status(401).json({
        success: false,
        error: `Authentication error: ${error}`,
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Code and state required',
      });
    }

    // Get organization from state
    // In production, decode the state to get organization ID
    const organizationId = ''; // Extract from state

    const config = await oidcService.getConfiguration(organizationId);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Unknown organization',
      });
    }

    const result = await oidcService.handleCallback(config, code, state);

    if (!result.success || !result.user) {
      return res.status(401).json({
        success: false,
        error: result.error || 'Authentication failed',
      });
    }

    res.json({
      success: true,
      data: {
        user: result.user,
        // token: generateJwt(user),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to process OIDC callback',
    });
  }
});

// -----------------------------------------------------------------------------
// SCIM Endpoints
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/sso/scim/v2/Users:
 *   get:
 *     tags:
 *       - SCIM
 *     summary: List users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/scim/v2/Users', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as Request & { entityId: string }).entityId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const scimService = new ScimService(prisma, baseUrl, organizationId);

    const filter = req.query.filter as string;
    const startIndex = parseInt(req.query.startIndex as string) || 1;
    const count = parseInt(req.query.count as string) || 100;

    const result = await scimService.getUsers(filter, startIndex, count);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error',
    });
  }
});

/**
 * @openapi
 * /api/sso/scim/v2/Users/{id}:
 *   get:
 *     tags:
 *       - SCIM
 *     summary: Get user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User details
 */
router.get('/scim/v2/Users/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as Request & { entityId: string }).entityId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const scimService = new ScimService(prisma, baseUrl, organizationId);

    const user = await scimService.getUser(req.params.id);

    if (!user) {
      return res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error',
    });
  }
});

/**
 * @openapi
 * /api/sso/scim/v2/Users:
 *   post:
 *     tags:
 *       - SCIM
 *     summary: Create user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: User created
 */
router.post('/scim/v2/Users', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as Request & { entityId: string }).entityId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const scimService = new ScimService(prisma, baseUrl, organizationId);

    const user = await scimService.createUser(req.body);

    res.status(201).json(user);
  } catch (error) {
    const scimError = error as { status?: string; scimType?: string; detail?: string };

    if (scimError.status) {
      return res.status(parseInt(scimError.status)).json(error);
    }

    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error',
    });
  }
});

// -----------------------------------------------------------------------------
// Role Mapping Endpoints
// -----------------------------------------------------------------------------

const RoleMappingSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sourceType: z.enum(['group', 'role', 'attribute']),
  sourceValue: z.string().min(1),
  sourcePattern: z.string().optional(),
  targetRole: z.string().min(1),
  targetPermissions: z.array(z.string()).optional(),
  priority: z.number().int().min(0).default(10),
  enabled: z.boolean().default(true),
});

/**
 * @openapi
 * /api/sso/role-mappings:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Get role mappings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of role mappings
 */
router.get(
  '/role-mappings',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const mappings = await roleMappingService.getMappings(organizationId);

      res.json({
        success: true,
        data: mappings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get role mappings',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/role-mappings:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Create role mapping
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Role mapping created
 */
router.post(
  '/role-mappings',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const data = RoleMappingSchema.parse(req.body);

      const mapping = await roleMappingService.createMapping(organizationId, {
        ...data,
        organizationId,
      });

      res.status(201).json({
        success: true,
        data: mapping,
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
        error: 'Failed to create role mapping',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/role-mappings/{id}:
 *   put:
 *     tags:
 *       - SSO
 *     summary: Update role mapping
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Role mapping updated
 */
router.put(
  '/role-mappings/:id',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const data = RoleMappingSchema.partial().parse(req.body);
      const mapping = await roleMappingService.updateMapping(req.params.id, data);

      res.json({
        success: true,
        data: mapping,
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
        error: 'Failed to update role mapping',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/role-mappings/{id}:
 *   delete:
 *     tags:
 *       - SSO
 *     summary: Delete role mapping
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Role mapping deleted
 */
router.delete(
  '/role-mappings/:id',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      await roleMappingService.deleteMapping(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete role mapping',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/role-mappings/presets/{preset}:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Create preset role mappings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Preset mappings created
 */
router.post(
  '/role-mappings/presets/:preset',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const preset = req.params.preset as 'azure-ad' | 'okta' | 'google' | 'onelogin';

      const mappings = await roleMappingService.createPresetMappings(organizationId, preset);

      res.status(201).json({
        success: true,
        data: mappings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create preset mappings',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/role-mappings/sync:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Sync all user roles based on mappings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync results
 */
router.post(
  '/role-mappings/sync',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const result = await roleMappingService.syncUserRoles(organizationId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to sync user roles',
      });
    }
  }
);

// -----------------------------------------------------------------------------
// Directory Sync Endpoints
// -----------------------------------------------------------------------------

const DirectorySyncConfigSchema = z.object({
  name: z.string().min(1),
  sourceType: z.enum(['scim', 'ldap', 'azure-ad', 'okta', 'google']),
  sourceConfig: z.record(z.unknown()),
  syncUsers: z.boolean().default(true),
  syncGroups: z.boolean().default(true),
  syncRoles: z.boolean().default(true),
  scheduleEnabled: z.boolean().default(false),
  scheduleInterval: z.number().int().min(5).default(60),
  scheduleCron: z.string().optional(),
  userFilter: z.string().optional(),
  groupFilter: z.string().optional(),
  enabled: z.boolean().default(true),
});

/**
 * @openapi
 * /api/sso/directory-sync:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Get directory sync configurations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of sync configurations
 */
router.get(
  '/directory-sync',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      const configs = await directorySyncService.getConfigs(organizationId);

      res.json({
        success: true,
        data: configs,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get directory sync configurations',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Create directory sync configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Configuration created
 */
router.post(
  '/directory-sync',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const organizationId = (req as Request & { entityId: string }).entityId;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      const data = DirectorySyncConfigSchema.parse(req.body);

      const config = await directorySyncService.createConfig(organizationId, {
        ...data,
        organizationId,
      });

      res.status(201).json({
        success: true,
        data: config,
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
        error: 'Failed to create directory sync configuration',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync/{id}:
 *   put:
 *     tags:
 *       - SSO
 *     summary: Update directory sync configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put(
  '/directory-sync/:id',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      const data = DirectorySyncConfigSchema.partial().parse(req.body);
      const config = await directorySyncService.updateConfig(req.params.id, data);

      res.json({
        success: true,
        data: config,
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
        error: 'Failed to update directory sync configuration',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync/{id}:
 *   delete:
 *     tags:
 *       - SSO
 *     summary: Delete directory sync configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Configuration deleted
 */
router.delete(
  '/directory-sync/:id',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      await directorySyncService.deleteConfig(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete directory sync configuration',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync/{id}/run:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Start a directory sync job
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync job started
 */
router.post(
  '/directory-sync/:id/run',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      const type = (req.query.type as 'full' | 'incremental') || 'incremental';
      const job = await directorySyncService.startSync(req.params.id, type);

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to start directory sync',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync/{id}/jobs:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Get sync jobs for a configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of sync jobs
 */
router.get(
  '/directory-sync/:id/jobs',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      const limit = parseInt(req.query.limit as string) || 10;
      const jobs = await directorySyncService.getJobs(req.params.id, limit);

      res.json({
        success: true,
        data: jobs,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get sync jobs',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync/jobs/{jobId}:
 *   get:
 *     tags:
 *       - SSO
 *     summary: Get sync job details
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job details
 */
router.get(
  '/directory-sync/jobs/:jobId',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      const job = await directorySyncService.getJob(req.params.jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get sync job',
      });
    }
  }
);

/**
 * @openapi
 * /api/sso/directory-sync/jobs/{jobId}/cancel:
 *   post:
 *     tags:
 *       - SSO
 *     summary: Cancel a running sync job
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job cancelled
 */
router.post(
  '/directory-sync/jobs/:jobId/cancel',
  requireAuth,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const directorySyncService = new DirectorySyncService(prisma, baseUrl);

      await directorySyncService.cancelJob(req.params.jobId);

      res.json({
        success: true,
        message: 'Job cancelled',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to cancel sync job',
      });
    }
  }
);

export default router;
