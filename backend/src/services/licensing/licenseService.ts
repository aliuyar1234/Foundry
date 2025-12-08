// =============================================================================
// License Service
// SCALE Tier - Task T171-T175
//
// Enterprise license management for on-premise deployments
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export const LicenseTypeSchema = z.enum([
  'TRIAL',
  'STANDARD',
  'PROFESSIONAL',
  'ENTERPRISE',
  'UNLIMITED',
]);

export type LicenseType = z.infer<typeof LicenseTypeSchema>;

export interface LicenseFeatures {
  maxUsers: number;
  maxEntities: number;
  maxProcesses: number;
  aiInsights: boolean;
  processDiscovery: boolean;
  complianceMonitoring: boolean;
  crossCompanyIntelligence: boolean;
  whiteLabel: boolean;
  partnerApi: boolean;
  ssoIntegration: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  offlineMode: boolean;
}

export interface License {
  id: string;
  type: LicenseType;
  organizationId: string;
  organizationName: string;
  issuedAt: Date;
  expiresAt: Date;
  features: LicenseFeatures;
  signature: string;
  hardwareFingerprint?: string;
  activatedAt?: Date;
  lastValidatedAt?: Date;
}

export interface LicenseValidationResult {
  valid: boolean;
  license?: License;
  errors: string[];
  warnings: string[];
  daysRemaining?: number;
}

// -----------------------------------------------------------------------------
// License Feature Definitions
// -----------------------------------------------------------------------------

const LICENSE_FEATURES: Record<LicenseType, LicenseFeatures> = {
  TRIAL: {
    maxUsers: 5,
    maxEntities: 1,
    maxProcesses: 10,
    aiInsights: true,
    processDiscovery: true,
    complianceMonitoring: false,
    crossCompanyIntelligence: false,
    whiteLabel: false,
    partnerApi: false,
    ssoIntegration: false,
    prioritySupport: false,
    customIntegrations: false,
    offlineMode: false,
  },
  STANDARD: {
    maxUsers: 25,
    maxEntities: 3,
    maxProcesses: 50,
    aiInsights: true,
    processDiscovery: true,
    complianceMonitoring: true,
    crossCompanyIntelligence: false,
    whiteLabel: false,
    partnerApi: false,
    ssoIntegration: false,
    prioritySupport: false,
    customIntegrations: false,
    offlineMode: false,
  },
  PROFESSIONAL: {
    maxUsers: 100,
    maxEntities: 10,
    maxProcesses: 200,
    aiInsights: true,
    processDiscovery: true,
    complianceMonitoring: true,
    crossCompanyIntelligence: true,
    whiteLabel: false,
    partnerApi: true,
    ssoIntegration: true,
    prioritySupport: true,
    customIntegrations: false,
    offlineMode: true,
  },
  ENTERPRISE: {
    maxUsers: 500,
    maxEntities: 50,
    maxProcesses: 1000,
    aiInsights: true,
    processDiscovery: true,
    complianceMonitoring: true,
    crossCompanyIntelligence: true,
    whiteLabel: true,
    partnerApi: true,
    ssoIntegration: true,
    prioritySupport: true,
    customIntegrations: true,
    offlineMode: true,
  },
  UNLIMITED: {
    maxUsers: -1, // Unlimited
    maxEntities: -1,
    maxProcesses: -1,
    aiInsights: true,
    processDiscovery: true,
    complianceMonitoring: true,
    crossCompanyIntelligence: true,
    whiteLabel: true,
    partnerApi: true,
    ssoIntegration: true,
    prioritySupport: true,
    customIntegrations: true,
    offlineMode: true,
  },
};

// -----------------------------------------------------------------------------
// License Service
// -----------------------------------------------------------------------------

export class LicenseService {
  private prisma: PrismaClient;
  private publicKey: string;
  private cachedLicense: License | null = null;
  private lastValidation: Date | null = null;
  private validationInterval = 24 * 60 * 60 * 1000; // 24 hours

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    // In production, this would be loaded from environment
    this.publicKey = process.env.LICENSE_PUBLIC_KEY || '';
  }

  // ---------------------------------------------------------------------------
  // License Validation
  // ---------------------------------------------------------------------------

  async validateLicense(licenseKey?: string): Promise<LicenseValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get license from storage or parameter
      const license = licenseKey
        ? this.parseLicenseKey(licenseKey)
        : await this.getStoredLicense();

      if (!license) {
        return {
          valid: false,
          errors: ['No license found. Please activate a license.'],
          warnings: [],
        };
      }

      // Verify signature
      if (!this.verifySignature(license)) {
        return {
          valid: false,
          errors: ['Invalid license signature. License may be tampered.'],
          warnings: [],
        };
      }

      // Check expiration
      const now = new Date();
      if (license.expiresAt < now) {
        return {
          valid: false,
          license,
          errors: ['License has expired.'],
          warnings: [],
        };
      }

      // Check hardware fingerprint (if bound)
      if (license.hardwareFingerprint) {
        const currentFingerprint = await this.getHardwareFingerprint();
        if (license.hardwareFingerprint !== currentFingerprint) {
          return {
            valid: false,
            license,
            errors: ['License is bound to different hardware.'],
            warnings: [],
          };
        }
      }

      // Calculate days remaining
      const daysRemaining = Math.ceil(
        (license.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Add warnings for approaching expiration
      if (daysRemaining <= 7) {
        warnings.push(`License expires in ${daysRemaining} days!`);
      } else if (daysRemaining <= 30) {
        warnings.push(`License expires in ${daysRemaining} days.`);
      }

      // Update last validated timestamp
      await this.updateLastValidated(license.id);

      this.cachedLicense = license;
      this.lastValidation = new Date();

      return {
        valid: true,
        license,
        errors: [],
        warnings,
        daysRemaining,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`License validation error: ${(error as Error).message}`],
        warnings: [],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // License Activation
  // ---------------------------------------------------------------------------

  async activateLicense(licenseKey: string): Promise<LicenseValidationResult> {
    // Parse and validate the license
    const validation = await this.validateLicense(licenseKey);

    if (!validation.valid) {
      return validation;
    }

    const license = validation.license!;

    // Bind to hardware fingerprint
    const fingerprint = await this.getHardwareFingerprint();
    license.hardwareFingerprint = fingerprint;
    license.activatedAt = new Date();

    // Store the license
    await this.storeLicense(license);

    // Try to register with license server (if online)
    try {
      await this.registerWithServer(license);
    } catch {
      validation.warnings.push(
        'Could not connect to license server. Offline mode activated.'
      );
    }

    return validation;
  }

  // ---------------------------------------------------------------------------
  // License Key Parsing
  // ---------------------------------------------------------------------------

  private parseLicenseKey(licenseKey: string): License | null {
    try {
      // License key format: BASE64(JSON_PAYLOAD).SIGNATURE
      const [encodedPayload, signature] = licenseKey.split('.');

      if (!encodedPayload || !signature) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64').toString('utf-8')
      );

      return {
        id: payload.id,
        type: payload.type as LicenseType,
        organizationId: payload.orgId,
        organizationName: payload.orgName,
        issuedAt: new Date(payload.iat),
        expiresAt: new Date(payload.exp),
        features: LICENSE_FEATURES[payload.type as LicenseType],
        signature,
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Signature Verification
  // ---------------------------------------------------------------------------

  private verifySignature(license: License): boolean {
    try {
      const payload = {
        id: license.id,
        type: license.type,
        orgId: license.organizationId,
        orgName: license.organizationName,
        iat: license.issuedAt.toISOString(),
        exp: license.expiresAt.toISOString(),
      };

      const dataToVerify = Buffer.from(JSON.stringify(payload)).toString(
        'base64'
      );

      // If no public key configured, skip verification (development mode)
      if (!this.publicKey) {
        console.warn('License public key not configured. Skipping verification.');
        return true;
      }

      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(dataToVerify);
      return verify.verify(this.publicKey, license.signature, 'base64');
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Hardware Fingerprint
  // ---------------------------------------------------------------------------

  async getHardwareFingerprint(): Promise<string> {
    // Collect hardware identifiers
    const os = await import('os');

    const components = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || 'unknown',
      Object.values(os.networkInterfaces())
        .flat()
        .filter((i): i is NonNullable<typeof i> => i !== undefined)
        .find((i) => !i.internal && i.family === 'IPv4')?.mac || 'unknown',
    ];

    // Create stable hash
    const hash = crypto.createHash('sha256');
    hash.update(components.join(':'));
    return hash.digest('hex').substring(0, 32);
  }

  // ---------------------------------------------------------------------------
  // License Storage
  // ---------------------------------------------------------------------------

  private async getStoredLicense(): Promise<License | null> {
    // Check cache first
    if (
      this.cachedLicense &&
      this.lastValidation &&
      Date.now() - this.lastValidation.getTime() < this.validationInterval
    ) {
      return this.cachedLicense;
    }

    try {
      const stored = await this.prisma.systemConfig.findUnique({
        where: { key: 'license' },
      });

      if (!stored) {
        return null;
      }

      return JSON.parse(stored.value as string);
    } catch {
      return null;
    }
  }

  private async storeLicense(license: License): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key: 'license' },
      update: {
        value: JSON.stringify(license),
        updatedAt: new Date(),
      },
      create: {
        key: 'license',
        value: JSON.stringify(license),
      },
    });

    this.cachedLicense = license;
    this.lastValidation = new Date();
  }

  private async updateLastValidated(licenseId: string): Promise<void> {
    try {
      const license = await this.getStoredLicense();
      if (license) {
        license.lastValidatedAt = new Date();
        await this.storeLicense(license);
      }
    } catch {
      // Non-critical, ignore errors
    }
  }

  // ---------------------------------------------------------------------------
  // License Server Communication
  // ---------------------------------------------------------------------------

  private async registerWithServer(license: License): Promise<void> {
    const licenseServerUrl = process.env.LICENSE_SERVER_URL;

    if (!licenseServerUrl) {
      return;
    }

    const response = await fetch(`${licenseServerUrl}/api/licenses/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        licenseId: license.id,
        hardwareFingerprint: license.hardwareFingerprint,
        activatedAt: license.activatedAt?.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to register with license server');
    }
  }

  // ---------------------------------------------------------------------------
  // Feature Checking
  // ---------------------------------------------------------------------------

  async hasFeature(feature: keyof LicenseFeatures): Promise<boolean> {
    const validation = await this.validateLicense();

    if (!validation.valid || !validation.license) {
      return false;
    }

    const value = validation.license.features[feature];
    return typeof value === 'boolean' ? value : value !== 0;
  }

  async getFeatureLimit(
    feature: 'maxUsers' | 'maxEntities' | 'maxProcesses'
  ): Promise<number> {
    const validation = await this.validateLicense();

    if (!validation.valid || !validation.license) {
      return 0;
    }

    return validation.license.features[feature];
  }

  async checkLimit(
    feature: 'maxUsers' | 'maxEntities' | 'maxProcesses',
    currentCount: number
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const limit = await this.getFeatureLimit(feature);

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, limit: -1, current: currentCount };
    }

    return {
      allowed: currentCount < limit,
      limit,
      current: currentCount,
    };
  }

  // ---------------------------------------------------------------------------
  // License Info
  // ---------------------------------------------------------------------------

  async getLicenseInfo(): Promise<{
    status: 'active' | 'expired' | 'missing' | 'invalid';
    license?: License;
    daysRemaining?: number;
    usage?: {
      users: { current: number; limit: number };
      entities: { current: number; limit: number };
      processes: { current: number; limit: number };
    };
  }> {
    const validation = await this.validateLicense();

    if (!validation.valid) {
      const status = validation.errors.some((e) => e.includes('expired'))
        ? 'expired'
        : validation.errors.some((e) => e.includes('No license'))
        ? 'missing'
        : 'invalid';

      return { status, license: validation.license };
    }

    // Get current usage
    const [userCount, entityCount, processCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.entity.count(),
      this.prisma.process.count(),
    ]);

    return {
      status: 'active',
      license: validation.license,
      daysRemaining: validation.daysRemaining,
      usage: {
        users: {
          current: userCount,
          limit: validation.license!.features.maxUsers,
        },
        entities: {
          current: entityCount,
          limit: validation.license!.features.maxEntities,
        },
        processes: {
          current: processCount,
          limit: validation.license!.features.maxProcesses,
        },
      },
    };
  }
}
