/**
 * Branding Application Tests
 * SCALE Tier - Task T143
 *
 * Integration tests for white-label branding functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, ResellerTier } from '@prisma/client';
import { BrandingService, BrandingConfig } from '../../src/services/whiteLabel/brandingService';
import { ResellerService } from '../../src/services/whiteLabel/resellerService';

describe('Branding Service', () => {
  let prisma: PrismaClient;
  let brandingService: BrandingService;
  let resellerService: ResellerService;
  let testResellerId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    brandingService = new BrandingService({ prisma });
    resellerService = new ResellerService({ prisma });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test reseller
    const reseller = await resellerService.create({
      name: 'Test Reseller',
      contactEmail: 'contact@test.com',
      billingEmail: 'billing@test.com',
      tier: 'RESELLER_STARTER' as ResellerTier,
    });
    testResellerId = reseller.id;
  });

  describe('Branding Configuration', () => {
    it('should create branding configuration with valid colors', async () => {
      const branding: BrandingConfig = {
        colors: {
          primary: '#3B82F6',
          secondary: '#64748B',
          accent: '#8B5CF6',
        },
        fonts: {
          heading: 'Inter',
          body: 'Inter',
        },
        companyName: 'Test Company',
      };

      const config = await brandingService.create({
        resellerId: testResellerId,
        name: 'Test Config',
        branding,
      });

      expect(config).toBeDefined();
      expect(config.name).toBe('Test Config');
      expect(config.branding).toMatchObject(branding);
    });

    it('should reject invalid hex colors', async () => {
      const branding: BrandingConfig = {
        colors: {
          primary: 'not-a-color',
          secondary: '#64748B',
        },
      };

      await expect(
        brandingService.create({
          resellerId: testResellerId,
          name: 'Invalid Config',
          branding,
        })
      ).rejects.toThrow('Invalid color format');
    });

    it('should require primary and secondary colors', async () => {
      const branding = {
        colors: {
          primary: '#3B82F6',
          // missing secondary
        },
      } as BrandingConfig;

      await expect(
        brandingService.create({
          resellerId: testResellerId,
          name: 'Missing Colors',
          branding,
        })
      ).rejects.toThrow('Secondary color is required');
    });

    it('should update branding configuration', async () => {
      const config = await brandingService.create({
        resellerId: testResellerId,
        name: 'Update Test',
        branding: {
          colors: {
            primary: '#3B82F6',
            secondary: '#64748B',
          },
        },
      });

      const updated = await brandingService.update(config.id, {
        branding: {
          colors: {
            primary: '#FF0000',
          },
        },
      });

      expect((updated.branding as { colors: { primary: string } }).colors.primary).toBe('#FF0000');
    });
  });

  describe('Custom CSS', () => {
    it('should accept valid custom CSS', async () => {
      const config = await brandingService.create({
        resellerId: testResellerId,
        name: 'CSS Test',
        branding: {
          colors: {
            primary: '#3B82F6',
            secondary: '#64748B',
          },
        },
        customCss: '.custom-class { color: var(--color-primary); }',
      });

      expect(config.customCss).toContain('.custom-class');
    });

    it('should reject dangerous CSS patterns', async () => {
      await expect(
        brandingService.create({
          resellerId: testResellerId,
          name: 'Dangerous CSS',
          branding: {
            colors: {
              primary: '#3B82F6',
              secondary: '#64748B',
            },
          },
          customCss: '@import url("https://malicious.com/styles.css");',
        })
      ).rejects.toThrow('unsafe patterns');
    });

    it('should reject CSS with javascript:', async () => {
      await expect(
        brandingService.create({
          resellerId: testResellerId,
          name: 'XSS CSS',
          branding: {
            colors: {
              primary: '#3B82F6',
              secondary: '#64748B',
            },
          },
          customCss: 'body { background: url("javascript:alert(1)"); }',
        })
      ).rejects.toThrow('unsafe patterns');
    });

    it('should enforce CSS size limit', async () => {
      const largeCss = '.test { color: red; }'.repeat(10000);

      await expect(
        brandingService.create({
          resellerId: testResellerId,
          name: 'Large CSS',
          branding: {
            colors: {
              primary: '#3B82F6',
              secondary: '#64748B',
            },
          },
          customCss: largeCss,
        })
      ).rejects.toThrow('exceeds maximum size');
    });
  });

  describe('CSS Variable Generation', () => {
    it('should generate correct CSS variables', () => {
      const branding: BrandingConfig = {
        colors: {
          primary: '#3B82F6',
          secondary: '#64748B',
          textSecondary: '#9CA3AF',
        },
        fonts: {
          heading: 'Inter',
          body: 'Roboto',
        },
      };

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('--color-primary: #3B82F6');
      expect(css).toContain('--color-secondary: #64748B');
      expect(css).toContain('--color-text-secondary: #9CA3AF');
      expect(css).toContain('--font-heading: Inter');
      expect(css).toContain('--font-body: Roboto');
    });

    it('should convert camelCase to kebab-case', () => {
      const branding: BrandingConfig = {
        colors: {
          primary: '#000',
          secondary: '#000',
          textSecondary: '#000',
        },
      };

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('--color-text-secondary');
      expect(css).not.toContain('--color-textSecondary');
    });
  });

  describe('Custom Domain', () => {
    it('should enforce unique custom domains', async () => {
      await brandingService.create({
        resellerId: testResellerId,
        name: 'First Config',
        branding: {
          colors: {
            primary: '#3B82F6',
            secondary: '#64748B',
          },
        },
        customDomain: 'app.example.com',
      });

      // Create another reseller
      const reseller2 = await resellerService.create({
        name: 'Second Reseller',
        contactEmail: 'contact2@test.com',
        billingEmail: 'billing2@test.com',
        tier: 'RESELLER_STARTER' as ResellerTier,
      });

      await expect(
        brandingService.create({
          resellerId: reseller2.id,
          name: 'Second Config',
          branding: {
            colors: {
              primary: '#3B82F6',
              secondary: '#64748B',
            },
          },
          customDomain: 'app.example.com',
        })
      ).rejects.toThrow('already in use');
    });
  });

  describe('Branding Retrieval', () => {
    it('should get branding by custom domain', async () => {
      const domain = `test-${Date.now()}.example.com`;
      const config = await brandingService.create({
        resellerId: testResellerId,
        name: 'Domain Test',
        branding: {
          colors: {
            primary: '#3B82F6',
            secondary: '#64748B',
          },
          companyName: 'Domain Test Co',
        },
        customDomain: domain,
      });

      const retrieved = await brandingService.getByDomain(domain);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(config.id);
    });

    it('should list branding configs by reseller', async () => {
      await brandingService.create({
        resellerId: testResellerId,
        name: 'Config 1',
        branding: {
          colors: { primary: '#3B82F6', secondary: '#64748B' },
        },
      });

      await brandingService.create({
        resellerId: testResellerId,
        name: 'Config 2',
        branding: {
          colors: { primary: '#FF0000', secondary: '#00FF00' },
        },
      });

      const configs = await brandingService.listByReseller(testResellerId);

      expect(configs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
