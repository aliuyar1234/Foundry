/**
 * Domain Service
 * SCALE Tier - Tasks T114-T118
 *
 * Manages custom domain configuration and verification
 */

import { PrismaClient, WhiteLabelConfig } from '@prisma/client';
import { AppError } from '../../lib/errors/AppError';
import dns from 'dns';
import { promisify } from 'util';
import crypto from 'crypto';

const resolveTxt = promisify(dns.resolveTxt);
const resolveCname = promisify(dns.resolveCname);

export interface DomainServiceConfig {
  prisma: PrismaClient;
  expectedCname?: string;
  verificationPrefix?: string;
}

export interface DomainVerificationResult {
  domain: string;
  isVerified: boolean;
  cnameStatus: 'pending' | 'configured' | 'incorrect';
  txtStatus: 'pending' | 'verified' | 'incorrect';
  expectedCname: string;
  expectedTxtRecord: string;
  actualCname?: string;
  actualTxtRecord?: string;
  lastCheckedAt: Date;
  errors?: string[];
}

export interface DomainSetupInstructions {
  domain: string;
  verificationToken: string;
  cnameRecord: {
    host: string;
    value: string;
  };
  txtRecord: {
    host: string;
    value: string;
  };
  instructions: string[];
}

export interface SslCertificateStatus {
  domain: string;
  status: 'pending' | 'provisioning' | 'active' | 'failed' | 'expired';
  issuer?: string;
  expiresAt?: Date;
  lastRenewalAt?: Date;
  autoRenew: boolean;
}

export class DomainService {
  private prisma: PrismaClient;
  private expectedCname: string;
  private verificationPrefix: string;

  constructor(config: DomainServiceConfig) {
    this.prisma = config.prisma;
    this.expectedCname = config.expectedCname || 'app.foundry.cloud';
    this.verificationPrefix = config.verificationPrefix || '_foundry-verification';
  }

  // ==========================================================================
  // T114-T115: Domain Configuration
  // ==========================================================================

  /**
   * Configure custom domain for white-label config
   */
  async configureDomain(
    configId: string,
    domain: string
  ): Promise<DomainSetupInstructions> {
    // Validate domain format
    this.validateDomainFormat(domain);

    // Check config exists
    const config = await this.prisma.whiteLabelConfig.findUnique({
      where: { id: configId },
    });

    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    // Check domain not already in use
    const existingDomain = await this.prisma.whiteLabelConfig.findUnique({
      where: { customDomain: domain },
    });

    if (existingDomain && existingDomain.id !== configId) {
      throw new AppError('DOMAIN_IN_USE', 'This domain is already configured for another account');
    }

    // Generate verification token
    const verificationToken = this.generateVerificationToken(configId, domain);

    // Update config with pending domain
    await this.prisma.whiteLabelConfig.update({
      where: { id: configId },
      data: {
        customDomain: domain,
        features: {
          ...(config.features as object),
          domainVerificationToken: verificationToken,
          domainVerified: false,
        },
      },
    });

    // Return setup instructions
    return this.generateSetupInstructions(domain, verificationToken);
  }

  /**
   * Remove custom domain
   */
  async removeDomain(configId: string): Promise<void> {
    const config = await this.prisma.whiteLabelConfig.findUnique({
      where: { id: configId },
    });

    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    await this.prisma.whiteLabelConfig.update({
      where: { id: configId },
      data: {
        customDomain: null,
        features: {
          ...(config.features as object),
          domainVerificationToken: null,
          domainVerified: false,
        },
      },
    });
  }

  /**
   * Generate domain setup instructions
   */
  generateSetupInstructions(
    domain: string,
    verificationToken: string
  ): DomainSetupInstructions {
    return {
      domain,
      verificationToken,
      cnameRecord: {
        host: domain,
        value: this.expectedCname,
      },
      txtRecord: {
        host: `${this.verificationPrefix}.${domain}`,
        value: verificationToken,
      },
      instructions: [
        `1. Add a CNAME record pointing "${domain}" to "${this.expectedCname}"`,
        `2. Add a TXT record at "${this.verificationPrefix}.${domain}" with value "${verificationToken}"`,
        '3. Wait for DNS propagation (typically 5-30 minutes)',
        '4. Click "Verify Domain" to complete the setup',
        'Note: DNS changes may take up to 48 hours to propagate globally',
      ],
    };
  }

  // ==========================================================================
  // T116: Domain Verification (DNS)
  // ==========================================================================

  /**
   * Verify domain ownership via DNS
   */
  async verifyDomain(configId: string): Promise<DomainVerificationResult> {
    const config = await this.prisma.whiteLabelConfig.findUnique({
      where: { id: configId },
    });

    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    if (!config.customDomain) {
      throw new AppError('NO_DOMAIN', 'No custom domain configured');
    }

    const domain = config.customDomain;
    const features = config.features as Record<string, unknown>;
    const expectedToken = features.domainVerificationToken as string;

    if (!expectedToken) {
      throw new AppError('NO_TOKEN', 'Verification token not found. Reconfigure domain.');
    }

    const result: DomainVerificationResult = {
      domain,
      isVerified: false,
      cnameStatus: 'pending',
      txtStatus: 'pending',
      expectedCname: this.expectedCname,
      expectedTxtRecord: expectedToken,
      lastCheckedAt: new Date(),
      errors: [],
    };

    // Check CNAME record
    try {
      const cnameRecords = await resolveCname(domain);
      if (cnameRecords && cnameRecords.length > 0) {
        result.actualCname = cnameRecords[0];
        if (cnameRecords[0].toLowerCase() === this.expectedCname.toLowerCase()) {
          result.cnameStatus = 'configured';
        } else {
          result.cnameStatus = 'incorrect';
          result.errors!.push(`CNAME points to ${cnameRecords[0]} instead of ${this.expectedCname}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOTFOUND') {
        result.errors!.push(`CNAME lookup failed: ${(error as Error).message}`);
      }
    }

    // Check TXT verification record
    const txtHost = `${this.verificationPrefix}.${domain}`;
    try {
      const txtRecords = await resolveTxt(txtHost);
      if (txtRecords && txtRecords.length > 0) {
        // TXT records are returned as arrays of strings
        const flatRecords = txtRecords.flat();
        const matchingRecord = flatRecords.find(r => r === expectedToken);

        if (matchingRecord) {
          result.actualTxtRecord = matchingRecord;
          result.txtStatus = 'verified';
        } else {
          result.actualTxtRecord = flatRecords[0];
          result.txtStatus = 'incorrect';
          result.errors!.push('TXT record found but token does not match');
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOTFOUND') {
        result.errors!.push(`TXT lookup failed: ${(error as Error).message}`);
      }
    }

    // Domain is verified if both CNAME and TXT are correct
    result.isVerified = result.cnameStatus === 'configured' && result.txtStatus === 'verified';

    // Update config with verification status
    await this.prisma.whiteLabelConfig.update({
      where: { id: configId },
      data: {
        features: {
          ...features,
          domainVerified: result.isVerified,
          domainLastCheckedAt: result.lastCheckedAt.toISOString(),
        },
      },
    });

    return result;
  }

  /**
   * Check domain DNS status without updating
   */
  async checkDomainStatus(domain: string): Promise<{
    hasCname: boolean;
    cnameValue?: string;
    hasTxt: boolean;
    txtValues?: string[];
  }> {
    const result = {
      hasCname: false,
      cnameValue: undefined as string | undefined,
      hasTxt: false,
      txtValues: undefined as string[] | undefined,
    };

    try {
      const cnameRecords = await resolveCname(domain);
      if (cnameRecords && cnameRecords.length > 0) {
        result.hasCname = true;
        result.cnameValue = cnameRecords[0];
      }
    } catch {
      // Domain might use A record instead of CNAME
    }

    try {
      const txtHost = `${this.verificationPrefix}.${domain}`;
      const txtRecords = await resolveTxt(txtHost);
      if (txtRecords && txtRecords.length > 0) {
        result.hasTxt = true;
        result.txtValues = txtRecords.flat();
      }
    } catch {
      // TXT record not found
    }

    return result;
  }

  // ==========================================================================
  // T117: Domain Routing
  // ==========================================================================

  /**
   * Get white-label config by hostname
   */
  async getConfigByHost(hostname: string): Promise<WhiteLabelConfig | null> {
    // Normalize hostname (remove port, lowercase)
    const normalizedHost = hostname.toLowerCase().split(':')[0];

    // Try exact match first
    const config = await this.prisma.whiteLabelConfig.findUnique({
      where: { customDomain: normalizedHost },
    });

    if (config) {
      // Check if domain is verified
      const features = config.features as Record<string, unknown>;
      if (!features.domainVerified) {
        return null; // Don't route to unverified domains
      }
      return config;
    }

    return null;
  }

  /**
   * Get reseller ID for domain
   */
  async getResellerByDomain(domain: string): Promise<string | null> {
    const config = await this.getConfigByHost(domain);
    return config?.resellerId || null;
  }

  // ==========================================================================
  // T118: SSL Certificate Management (Integration)
  // ==========================================================================

  /**
   * Get SSL certificate status for domain
   * Note: Actual implementation would integrate with Let's Encrypt or similar
   */
  async getSslStatus(domain: string): Promise<SslCertificateStatus> {
    const config = await this.prisma.whiteLabelConfig.findUnique({
      where: { customDomain: domain },
    });

    if (!config) {
      throw new AppError('DOMAIN_NOT_FOUND', 'Domain configuration not found');
    }

    const features = config.features as Record<string, unknown>;

    // In production, this would check actual certificate status
    // For now, return status from config
    return {
      domain,
      status: features.domainVerified ? 'active' : 'pending',
      issuer: features.domainVerified ? "Let's Encrypt" : undefined,
      expiresAt: features.sslExpiresAt ? new Date(features.sslExpiresAt as string) : undefined,
      lastRenewalAt: features.sslLastRenewalAt
        ? new Date(features.sslLastRenewalAt as string)
        : undefined,
      autoRenew: true,
    };
  }

  /**
   * Request SSL certificate for domain
   * Note: Actual implementation would integrate with Let's Encrypt/ACME
   */
  async requestSslCertificate(configId: string): Promise<{ status: string; message: string }> {
    const config = await this.prisma.whiteLabelConfig.findUnique({
      where: { id: configId },
    });

    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    if (!config.customDomain) {
      throw new AppError('NO_DOMAIN', 'No custom domain configured');
    }

    const features = config.features as Record<string, unknown>;
    if (!features.domainVerified) {
      throw new AppError(
        'DOMAIN_NOT_VERIFIED',
        'Domain must be verified before requesting SSL certificate'
      );
    }

    // In production, this would trigger ACME certificate request
    // For now, mark as provisioning
    await this.prisma.whiteLabelConfig.update({
      where: { id: configId },
      data: {
        features: {
          ...features,
          sslStatus: 'provisioning',
          sslRequestedAt: new Date().toISOString(),
        },
      },
    });

    return {
      status: 'provisioning',
      message: 'SSL certificate request initiated. This typically takes 1-5 minutes.',
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Validate domain format
   */
  private validateDomainFormat(domain: string): void {
    // Remove protocol if present
    let cleanDomain = domain.replace(/^https?:\/\//, '');
    // Remove trailing slash and path
    cleanDomain = cleanDomain.split('/')[0];
    // Remove port
    cleanDomain = cleanDomain.split(':')[0];

    // Basic domain validation regex
    const domainRegex =
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

    if (!domainRegex.test(cleanDomain)) {
      throw new AppError('INVALID_DOMAIN', 'Invalid domain format');
    }

    // Check for reserved/blocked domains
    const blockedDomains = ['localhost', 'foundry.cloud', 'foundry.io'];
    const rootDomain = cleanDomain.split('.').slice(-2).join('.');

    if (blockedDomains.some(bd => cleanDomain === bd || rootDomain === bd)) {
      throw new AppError('BLOCKED_DOMAIN', 'This domain cannot be used');
    }
  }

  /**
   * Generate verification token
   */
  private generateVerificationToken(configId: string, domain: string): string {
    const data = `${configId}:${domain}:${Date.now()}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return `foundry-verify=${hash.slice(0, 32)}`;
  }
}
