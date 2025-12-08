/**
 * Partner Application Service
 * SCALE Tier - Tasks T055-T057
 *
 * Manages partner application registration and credentials
 */

import { PrismaClient, PartnerApplication, RateLimitTier } from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../../lib/errors/AppError';

export interface PartnerServiceConfig {
  prisma: PrismaClient;
}

export interface CreatePartnerAppInput {
  name: string;
  description?: string;
  redirectUris: string[];
  scopes: string[];
  rateLimitTier?: RateLimitTier;
  webhookUrl?: string;
  ownerId: string;
}

export interface UpdatePartnerAppInput {
  name?: string;
  description?: string;
  redirectUris?: string[];
  scopes?: string[];
  rateLimitTier?: RateLimitTier;
  webhookUrl?: string;
  isActive?: boolean;
}

export interface PartnerAppWithSecret extends PartnerApplication {
  clientSecret?: string;
}

// Available scopes for partner API
export const PARTNER_SCOPES = [
  'read:processes',
  'write:processes',
  'read:insights',
  'write:insights',
  'read:data_sources',
  'read:users',
  'read:analytics',
  'webhooks:receive',
] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];

export class PartnerService {
  private prisma: PrismaClient;

  constructor(config: PartnerServiceConfig) {
    this.prisma = config.prisma;
  }

  // ==========================================================================
  // T055-T056: Partner App Registration
  // ==========================================================================

  /**
   * Register a new partner application
   */
  async register(input: CreatePartnerAppInput): Promise<PartnerAppWithSecret> {
    // Validate scopes
    this.validateScopes(input.scopes);

    // T057: Validate redirect URIs
    this.validateRedirectUris(input.redirectUris);

    // Generate client credentials
    const clientId = this.generateClientId();
    const clientSecret = this.generateClientSecret();
    const clientSecretHash = await this.hashSecret(clientSecret);
    const webhookSecret = input.webhookUrl ? this.generateWebhookSecret() : null;

    const app = await this.prisma.partnerApplication.create({
      data: {
        name: input.name,
        description: input.description,
        clientId,
        clientSecretHash,
        redirectUris: input.redirectUris,
        scopes: input.scopes,
        rateLimitTier: input.rateLimitTier || 'STANDARD',
        webhookUrl: input.webhookUrl,
        webhookSecret,
        ownerId: input.ownerId,
      },
    });

    // Return with plain secret (only time it's visible)
    return {
      ...app,
      clientSecret,
    };
  }

  /**
   * Get partner application by ID
   */
  async getById(id: string): Promise<PartnerApplication | null> {
    return this.prisma.partnerApplication.findUnique({
      where: { id },
    });
  }

  /**
   * Get partner application by client ID
   */
  async getByClientId(clientId: string): Promise<PartnerApplication | null> {
    return this.prisma.partnerApplication.findUnique({
      where: { clientId },
    });
  }

  /**
   * List partner applications for an owner
   */
  async listByOwner(ownerId: string): Promise<PartnerApplication[]> {
    return this.prisma.partnerApplication.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update partner application
   */
  async update(id: string, input: UpdatePartnerAppInput): Promise<PartnerApplication> {
    if (input.scopes) {
      this.validateScopes(input.scopes);
    }

    if (input.redirectUris) {
      this.validateRedirectUris(input.redirectUris);
    }

    return this.prisma.partnerApplication.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        redirectUris: input.redirectUris,
        scopes: input.scopes,
        rateLimitTier: input.rateLimitTier,
        webhookUrl: input.webhookUrl,
        isActive: input.isActive,
      },
    });
  }

  /**
   * Deactivate partner application
   */
  async deactivate(id: string): Promise<PartnerApplication> {
    return this.prisma.partnerApplication.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Rotate client secret
   */
  async rotateSecret(id: string): Promise<PartnerAppWithSecret> {
    const clientSecret = this.generateClientSecret();
    const clientSecretHash = await this.hashSecret(clientSecret);

    const app = await this.prisma.partnerApplication.update({
      where: { id },
      data: { clientSecretHash },
    });

    return {
      ...app,
      clientSecret,
    };
  }

  /**
   * Rotate webhook secret
   */
  async rotateWebhookSecret(id: string): Promise<{ webhookSecret: string }> {
    const webhookSecret = this.generateWebhookSecret();

    await this.prisma.partnerApplication.update({
      where: { id },
      data: { webhookSecret },
    });

    return { webhookSecret };
  }

  /**
   * Validate client credentials
   */
  async validateCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<PartnerApplication | null> {
    const app = await this.getByClientId(clientId);
    if (!app) return null;

    const isValid = await this.verifySecret(clientSecret, app.clientSecretHash);
    if (!isValid) return null;

    if (!app.isActive) {
      throw new AppError('APP_INACTIVE', 'Partner application is inactive');
    }

    return app;
  }

  // ==========================================================================
  // T057: Redirect URI Validation
  // ==========================================================================

  /**
   * Validate redirect URIs
   */
  validateRedirectUris(uris: string[]): void {
    if (uris.length === 0) {
      throw new AppError('INVALID_REDIRECT_URI', 'At least one redirect URI is required');
    }

    for (const uri of uris) {
      if (!this.isValidRedirectUri(uri)) {
        throw new AppError(
          'INVALID_REDIRECT_URI',
          `Invalid redirect URI: ${uri}. Must be HTTPS or localhost.`
        );
      }
    }
  }

  /**
   * Check if redirect URI is valid
   */
  private isValidRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);

      // Allow localhost for development
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return true;
      }

      // Require HTTPS for production
      if (url.protocol !== 'https:') {
        return false;
      }

      // Block certain patterns
      if (url.pathname.includes('..') || url.pathname.includes('//')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a URI matches any registered redirect URIs
   */
  matchRedirectUri(registeredUris: string[], requestedUri: string): boolean {
    const requested = new URL(requestedUri);

    for (const registered of registeredUris) {
      const reg = new URL(registered);

      // Exact match
      if (registered === requestedUri) return true;

      // Match with trailing slash difference
      if (
        reg.protocol === requested.protocol &&
        reg.host === requested.host &&
        (reg.pathname === requested.pathname ||
          reg.pathname === requested.pathname + '/' ||
          reg.pathname + '/' === requested.pathname)
      ) {
        return true;
      }
    }

    return false;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Validate requested scopes
   */
  private validateScopes(scopes: string[]): void {
    const invalid = scopes.filter(s => !PARTNER_SCOPES.includes(s as PartnerScope));
    if (invalid.length > 0) {
      throw new AppError(
        'INVALID_SCOPES',
        `Invalid scopes: ${invalid.join(', ')}. Valid scopes: ${PARTNER_SCOPES.join(', ')}`
      );
    }
  }

  /**
   * Generate client ID (URL-safe)
   */
  private generateClientId(): string {
    return `fnd_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate client secret (high entropy)
   */
  private generateClientSecret(): string {
    return `fnd_secret_${crypto.randomBytes(32).toString('base64url')}`;
  }

  /**
   * Generate webhook secret
   */
  private generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  }

  /**
   * Hash secret for storage
   */
  private async hashSecret(secret: string): Promise<string> {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Verify secret against hash
   */
  private async verifySecret(secret: string, hash: string): Promise<boolean> {
    const inputHash = await this.hashSecret(secret);
    return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(hash));
  }

  /**
   * Get rate limit for tier
   */
  getRateLimitForTier(tier: RateLimitTier): number {
    const limits: Record<RateLimitTier, number> = {
      FREE: 100,
      STANDARD: 1000,
      PREMIUM: 10000,
    };
    return limits[tier];
  }
}
