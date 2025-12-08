/**
 * Domain Router Middleware
 * SCALE Tier - Task T117
 *
 * Routes requests based on custom domain to appropriate white-label configuration
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { DomainService } from '../../services/whiteLabel/domainService';
import { BrandingService, BrandingConfig } from '../../services/whiteLabel/brandingService';

declare global {
  namespace Express {
    interface Request {
      whiteLabelConfig?: {
        id: string;
        resellerId: string;
        name: string;
        branding: BrandingConfig;
        customCss?: string;
        features: Record<string, unknown>;
      };
    }
  }
}

export interface DomainRouterConfig {
  prisma: PrismaClient;
  defaultDomain?: string;
  bypassDomains?: string[];
}

/**
 * Create domain router middleware
 */
export function createDomainRouter(config: DomainRouterConfig) {
  const domainService = new DomainService({ prisma: config.prisma });
  const brandingService = new BrandingService({ prisma: config.prisma });
  const bypassDomains = config.bypassDomains || ['localhost', '127.0.0.1'];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hostname = req.hostname || req.headers.host?.split(':')[0];

      if (!hostname) {
        return next();
      }

      // Skip for bypass domains (localhost, internal domains)
      if (bypassDomains.some(d => hostname.includes(d))) {
        return next();
      }

      // Skip for default domain
      if (config.defaultDomain && hostname === config.defaultDomain) {
        return next();
      }

      // Look up white-label config by domain
      const whiteLabelConfig = await domainService.getConfigByHost(hostname);

      if (whiteLabelConfig) {
        // Attach white-label config to request
        req.whiteLabelConfig = {
          id: whiteLabelConfig.id,
          resellerId: whiteLabelConfig.resellerId,
          name: whiteLabelConfig.name,
          branding: whiteLabelConfig.branding as unknown as BrandingConfig,
          customCss: whiteLabelConfig.customCss || undefined,
          features: whiteLabelConfig.features as Record<string, unknown>,
        };

        // Set response headers for branding
        res.setHeader('X-White-Label', whiteLabelConfig.id);
        res.setHeader('X-White-Label-Name', whiteLabelConfig.name);
      }

      next();
    } catch (error) {
      // Log error but don't fail the request
      console.error('Domain router error:', error);
      next();
    }
  };
}

/**
 * Middleware to inject branding CSS
 */
export function brandingInjector(config: { prisma: PrismaClient }) {
  const brandingService = new BrandingService({ prisma: config.prisma });

  return (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send.bind(res);

    // Override send to inject branding CSS into HTML responses
    res.send = function (body: unknown): Response {
      if (
        req.whiteLabelConfig &&
        typeof body === 'string' &&
        res.get('Content-Type')?.includes('text/html')
      ) {
        // Generate CSS variables from branding
        const cssVars = brandingService.generateCssVariables(req.whiteLabelConfig.branding);
        const customCss = req.whiteLabelConfig.customCss || '';

        // Inject CSS before closing </head> tag
        const cssInjection = `
          <style id="white-label-vars">${cssVars}</style>
          ${customCss ? `<style id="white-label-custom">${customCss}</style>` : ''}
        `;

        body = body.replace('</head>', `${cssInjection}</head>`);
      }

      return originalSend(body);
    };

    next();
  };
}

/**
 * API endpoint middleware to return branding config
 */
export function brandingApiHandler(config: { prisma: PrismaClient }) {
  return async (req: Request, res: Response) => {
    if (req.whiteLabelConfig) {
      return res.json({
        id: req.whiteLabelConfig.id,
        name: req.whiteLabelConfig.name,
        branding: req.whiteLabelConfig.branding,
        features: req.whiteLabelConfig.features,
      });
    }

    // Return default branding
    res.json({
      id: null,
      name: 'Foundry',
      branding: {
        colors: {
          primary: '#3B82F6',
          secondary: '#64748B',
          accent: '#8B5CF6',
          background: '#FFFFFF',
          surface: '#F8FAFC',
          text: '#1E293B',
          textSecondary: '#64748B',
          error: '#EF4444',
          warning: '#F59E0B',
          success: '#10B981',
        },
        fonts: {
          heading: 'Inter',
          body: 'Inter',
          mono: 'JetBrains Mono',
        },
        companyName: 'Foundry',
      },
      features: {},
    });
  };
}

/**
 * Middleware to require white-label context
 */
export function requireWhiteLabel() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.whiteLabelConfig) {
      return res.status(400).json({
        error: 'WHITE_LABEL_REQUIRED',
        message: 'This endpoint requires a white-label context',
      });
    }
    next();
  };
}

/**
 * Middleware to restrict to reseller
 */
export function requireReseller(resellerId?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.whiteLabelConfig) {
      return res.status(400).json({
        error: 'WHITE_LABEL_REQUIRED',
        message: 'This endpoint requires a white-label context',
      });
    }

    if (resellerId && req.whiteLabelConfig.resellerId !== resellerId) {
      return res.status(403).json({
        error: 'RESELLER_MISMATCH',
        message: 'Access denied for this reseller context',
      });
    }

    next();
  };
}
