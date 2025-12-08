/**
 * Domain Routing Tests
 * SCALE Tier - Task T144
 *
 * Integration tests for custom domain routing and verification
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient, ResellerTier } from '@prisma/client';
import { DomainService } from '../../src/services/whiteLabel/domainService';
import { BrandingService } from '../../src/services/whiteLabel/brandingService';
import { ResellerService } from '../../src/services/whiteLabel/resellerService';
import dns from 'dns';

// Mock DNS module
vi.mock('dns', () => ({
  resolveTxt: vi.fn(),
  resolveCname: vi.fn(),
}));

describe('Domain Service', () => {
  let prisma: PrismaClient;
  let domainService: DomainService;
  let brandingService: BrandingService;
  let resellerService: ResellerService;
  let testResellerId: string;
  let testConfigId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    domainService = new DomainService({
      prisma,
      expectedCname: 'app.foundry.cloud',
      verificationPrefix: '_foundry-verification',
    });
    brandingService = new BrandingService({ prisma });
    resellerService = new ResellerService({ prisma });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset DNS mocks
    vi.clearAllMocks();

    // Create test reseller and config
    const reseller = await resellerService.create({
      name: 'Domain Test Reseller',
      contactEmail: 'contact@test.com',
      billingEmail: 'billing@test.com',
      tier: 'RESELLER_STARTER' as ResellerTier,
    });
    testResellerId = reseller.id;

    const config = await brandingService.create({
      resellerId: testResellerId,
      name: 'Domain Test Config',
      branding: {
        colors: {
          primary: '#3B82F6',
          secondary: '#64748B',
        },
      },
    });
    testConfigId = config.id;
  });

  describe('Domain Configuration', () => {
    it('should configure a valid domain', async () => {
      const instructions = await domainService.configureDomain(
        testConfigId,
        'app.testcompany.com'
      );

      expect(instructions).toBeDefined();
      expect(instructions.domain).toBe('app.testcompany.com');
      expect(instructions.verificationToken).toMatch(/^foundry-verify=/);
      expect(instructions.cnameRecord.value).toBe('app.foundry.cloud');
      expect(instructions.txtRecord.host).toBe('_foundry-verification.app.testcompany.com');
      expect(instructions.instructions.length).toBeGreaterThan(0);
    });

    it('should reject invalid domain format', async () => {
      await expect(
        domainService.configureDomain(testConfigId, 'not-a-valid-domain')
      ).rejects.toThrow('Invalid domain format');
    });

    it('should reject blocked domains', async () => {
      await expect(
        domainService.configureDomain(testConfigId, 'app.foundry.cloud')
      ).rejects.toThrow('cannot be used');
    });

    it('should reject localhost', async () => {
      await expect(
        domainService.configureDomain(testConfigId, 'localhost')
      ).rejects.toThrow();
    });

    it('should reject domains already in use', async () => {
      const domain = `unique-${Date.now()}.example.com`;

      // Configure for first config
      await domainService.configureDomain(testConfigId, domain);

      // Create another config and try to use same domain
      const config2 = await brandingService.create({
        resellerId: testResellerId,
        name: 'Another Config',
        branding: {
          colors: {
            primary: '#3B82F6',
            secondary: '#64748B',
          },
        },
      });

      await expect(
        domainService.configureDomain(config2.id, domain)
      ).rejects.toThrow('already configured');
    });
  });

  describe('Domain Verification', () => {
    it('should verify domain with correct DNS records', async () => {
      const domain = 'verified.example.com';
      const instructions = await domainService.configureDomain(testConfigId, domain);

      // Mock DNS responses
      const resolveCname = vi.mocked(dns.resolveCname);
      const resolveTxt = vi.mocked(dns.resolveTxt);

      resolveCname.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, ['app.foundry.cloud']);
        }
        return {} as dns.Resolver;
      });

      resolveTxt.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, [[instructions.verificationToken]]);
        }
        return {} as dns.Resolver;
      });

      const result = await domainService.verifyDomain(testConfigId);

      expect(result.isVerified).toBe(true);
      expect(result.cnameStatus).toBe('configured');
      expect(result.txtStatus).toBe('verified');
    });

    it('should fail verification with missing CNAME', async () => {
      const domain = 'missing-cname.example.com';
      await domainService.configureDomain(testConfigId, domain);

      // Mock DNS responses - CNAME not found
      const resolveCname = vi.mocked(dns.resolveCname);
      const resolveTxt = vi.mocked(dns.resolveTxt);

      resolveCname.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          error.code = 'ENOTFOUND';
          callback(error, []);
        }
        return {} as dns.Resolver;
      });

      resolveTxt.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, [['foundry-verify=test']]);
        }
        return {} as dns.Resolver;
      });

      const result = await domainService.verifyDomain(testConfigId);

      expect(result.isVerified).toBe(false);
      expect(result.cnameStatus).toBe('pending');
    });

    it('should fail verification with incorrect CNAME', async () => {
      const domain = 'wrong-cname.example.com';
      await domainService.configureDomain(testConfigId, domain);

      const resolveCname = vi.mocked(dns.resolveCname);
      const resolveTxt = vi.mocked(dns.resolveTxt);

      resolveCname.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, ['wrong.target.com']);
        }
        return {} as dns.Resolver;
      });

      resolveTxt.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, []);
        }
        return {} as dns.Resolver;
      });

      const result = await domainService.verifyDomain(testConfigId);

      expect(result.isVerified).toBe(false);
      expect(result.cnameStatus).toBe('incorrect');
      expect(result.errors).toContain(expect.stringContaining('wrong.target.com'));
    });

    it('should fail verification with incorrect TXT record', async () => {
      const domain = 'wrong-txt.example.com';
      await domainService.configureDomain(testConfigId, domain);

      const resolveCname = vi.mocked(dns.resolveCname);
      const resolveTxt = vi.mocked(dns.resolveTxt);

      resolveCname.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, ['app.foundry.cloud']);
        }
        return {} as dns.Resolver;
      });

      resolveTxt.mockImplementation((hostname, callback) => {
        if (typeof callback === 'function') {
          callback(null, [['wrong-token']]);
        }
        return {} as dns.Resolver;
      });

      const result = await domainService.verifyDomain(testConfigId);

      expect(result.isVerified).toBe(false);
      expect(result.txtStatus).toBe('incorrect');
    });
  });

  describe('Domain Routing', () => {
    it('should route verified domain to config', async () => {
      const domain = `routed-${Date.now()}.example.com`;
      await domainService.configureDomain(testConfigId, domain);

      // Mark as verified (simulate successful verification)
      const config = await prisma.whiteLabelConfig.findUnique({
        where: { id: testConfigId },
      });

      await prisma.whiteLabelConfig.update({
        where: { id: testConfigId },
        data: {
          features: {
            ...(config?.features as object),
            domainVerified: true,
          },
        },
      });

      const foundConfig = await domainService.getConfigByHost(domain);

      expect(foundConfig).toBeDefined();
      expect(foundConfig?.id).toBe(testConfigId);
    });

    it('should not route unverified domain', async () => {
      const domain = `unverified-${Date.now()}.example.com`;
      await domainService.configureDomain(testConfigId, domain);

      // Domain is not verified
      const foundConfig = await domainService.getConfigByHost(domain);

      expect(foundConfig).toBeNull();
    });

    it('should handle hostname with port', async () => {
      const domain = `port-${Date.now()}.example.com`;
      await domainService.configureDomain(testConfigId, domain);

      // Mark as verified
      const config = await prisma.whiteLabelConfig.findUnique({
        where: { id: testConfigId },
      });

      await prisma.whiteLabelConfig.update({
        where: { id: testConfigId },
        data: {
          features: {
            ...(config?.features as object),
            domainVerified: true,
          },
        },
      });

      const foundConfig = await domainService.getConfigByHost(`${domain}:8080`);

      expect(foundConfig).toBeDefined();
    });

    it('should be case-insensitive', async () => {
      const domain = `case-${Date.now()}.example.com`;
      await domainService.configureDomain(testConfigId, domain);

      // Mark as verified
      const config = await prisma.whiteLabelConfig.findUnique({
        where: { id: testConfigId },
      });

      await prisma.whiteLabelConfig.update({
        where: { id: testConfigId },
        data: {
          features: {
            ...(config?.features as object),
            domainVerified: true,
          },
        },
      });

      const foundConfig = await domainService.getConfigByHost(domain.toUpperCase());

      expect(foundConfig).toBeDefined();
    });
  });

  describe('Domain Removal', () => {
    it('should remove domain configuration', async () => {
      const domain = `remove-${Date.now()}.example.com`;
      await domainService.configureDomain(testConfigId, domain);

      await domainService.removeDomain(testConfigId);

      const config = await prisma.whiteLabelConfig.findUnique({
        where: { id: testConfigId },
      });

      expect(config?.customDomain).toBeNull();
    });
  });

  describe('Setup Instructions', () => {
    it('should generate correct setup instructions', () => {
      const instructions = domainService.generateSetupInstructions(
        'app.company.com',
        'foundry-verify=abc123'
      );

      expect(instructions.cnameRecord.host).toBe('app.company.com');
      expect(instructions.cnameRecord.value).toBe('app.foundry.cloud');
      expect(instructions.txtRecord.host).toBe('_foundry-verification.app.company.com');
      expect(instructions.txtRecord.value).toBe('foundry-verify=abc123');
      expect(instructions.instructions.length).toBe(5);
    });
  });
});
