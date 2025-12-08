/**
 * Billing Calculation Tests
 * SCALE Tier - Task T145
 *
 * Unit tests for billing and commission calculations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient, ResellerTier } from '@prisma/client';
import { BillingService } from '../../src/services/whiteLabel/billingService';
import { ResellerService } from '../../src/services/whiteLabel/resellerService';

describe('Billing Service', () => {
  let prisma: PrismaClient;
  let billingService: BillingService;
  let resellerService: ResellerService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    billingService = new BillingService({ prisma });
    resellerService = new ResellerService({ prisma });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Commission Rates', () => {
    it('should return correct commission rates for each tier', () => {
      const rates = billingService.getCommissionRates();

      expect(rates.RESELLER_STARTER).toBe(10);
      expect(rates.RESELLER_PROFESSIONAL).toBe(20);
      expect(rates.RESELLER_ENTERPRISE).toBe(30);
    });
  });

  describe('Invoice Generation', () => {
    let testResellerId: string;

    beforeEach(async () => {
      const reseller = await resellerService.create({
        name: 'Billing Test Reseller',
        contactEmail: 'billing@test.com',
        billingEmail: 'billing@test.com',
        tier: 'RESELLER_PROFESSIONAL' as ResellerTier,
        commissionRate: 20,
      });
      testResellerId = reseller.id;

      // Add test customers
      await resellerService.addCustomer(testResellerId, {
        name: 'Test Customer 1',
        slug: `customer-1-${Date.now()}`,
      });
      await resellerService.addCustomer(testResellerId, {
        name: 'Test Customer 2',
        slug: `customer-2-${Date.now()}`,
      });
    });

    it('should generate invoice for billing period', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const invoice = await billingService.generateInvoice(testResellerId, period);

      expect(invoice).toBeDefined();
      expect(invoice.resellerId).toBe(testResellerId);
      expect(invoice.period.start).toEqual(period.start);
      expect(invoice.period.end).toEqual(period.end);
      expect(invoice.currency).toBe('EUR');
      expect(invoice.status).toBe('draft');
    });

    it('should calculate correct commission amount', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const invoice = await billingService.generateInvoice(testResellerId, period);

      // Commission = subtotal * commissionRate / 100
      const expectedCommission = invoice.subtotal * 0.2; // 20% for PROFESSIONAL tier

      expect(invoice.commissionRate).toBe(20);
      expect(invoice.commissionAmount).toBeCloseTo(expectedCommission, 2);
    });

    it('should calculate net payable correctly', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const invoice = await billingService.generateInvoice(testResellerId, period);

      // Net = subtotal - commission
      const expectedTotal = invoice.subtotal - invoice.commissionAmount;

      expect(invoice.total).toBeCloseTo(expectedTotal, 2);
    });

    it('should set due date 30 days from period end', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const invoice = await billingService.generateInvoice(testResellerId, period);
      const expectedDueDate = new Date(2024, 1, 30); // Feb 30 doesn't exist, will be adjusted

      const dueDate = new Date(invoice.dueDate);
      const daysDiff = Math.round(
        (dueDate.getTime() - period.end.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBe(30);
    });

    it('should throw error for non-existent reseller', async () => {
      await expect(
        billingService.generateInvoice('non-existent-id', {
          start: new Date(),
          end: new Date(),
        })
      ).rejects.toThrow('RESELLER_NOT_FOUND');
    });
  });

  describe('Commission Calculation', () => {
    let testResellerId: string;

    beforeEach(async () => {
      const reseller = await resellerService.create({
        name: 'Commission Test Reseller',
        contactEmail: 'commission@test.com',
        billingEmail: 'commission@test.com',
        tier: 'RESELLER_ENTERPRISE' as ResellerTier,
        commissionRate: 30,
      });
      testResellerId = reseller.id;
    });

    it('should calculate commission for period', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const report = await billingService.calculateCommission(testResellerId, period);

      expect(report).toBeDefined();
      expect(report.resellerId).toBe(testResellerId);
      expect(report.commissionRate).toBe(30);
      expect(report.tier).toBe('RESELLER_ENTERPRISE');
    });

    it('should provide customer breakdown', async () => {
      // Add customers
      await resellerService.addCustomer(testResellerId, {
        name: 'Commission Customer 1',
        slug: `comm-customer-1-${Date.now()}`,
      });

      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const report = await billingService.calculateCommission(testResellerId, period);

      expect(report.customerBreakdown).toBeDefined();
      expect(Array.isArray(report.customerBreakdown)).toBe(true);
    });

    it('should sum customer commissions to total', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const report = await billingService.calculateCommission(testResellerId, period);

      const summedCommission = report.customerBreakdown.reduce(
        (sum, c) => sum + c.commission,
        0
      );

      expect(report.commissionEarned).toBeCloseTo(summedCommission, 2);
    });
  });

  describe('Billing Summary', () => {
    let testResellerId: string;

    beforeEach(async () => {
      const reseller = await resellerService.create({
        name: 'Summary Test Reseller',
        contactEmail: 'summary@test.com',
        billingEmail: 'summary@test.com',
        tier: 'RESELLER_STARTER' as ResellerTier,
      });
      testResellerId = reseller.id;
    });

    it('should generate billing summary', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const summary = await billingService.getBillingSummary(testResellerId, period);

      expect(summary).toBeDefined();
      expect(summary.reseller.id).toBe(testResellerId);
      expect(summary.period.start).toEqual(period.start);
      expect(summary.period.end).toEqual(period.end);
      expect(summary.summary).toHaveProperty('totalRevenue');
      expect(summary.summary).toHaveProperty('totalCommission');
      expect(summary.summary).toHaveProperty('netPayable');
      expect(summary.summary).toHaveProperty('customerCount');
      expect(summary.summary).toHaveProperty('userCount');
    });

    it('should include trend data', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const summary = await billingService.getBillingSummary(testResellerId, period);

      expect(summary.trends).toBeDefined();
      expect(summary.trends).toHaveProperty('revenueChange');
      expect(summary.trends).toHaveProperty('customerChange');
    });

    it('should calculate net payable as revenue minus commission', async () => {
      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const summary = await billingService.getBillingSummary(testResellerId, period);

      const expectedNet = summary.summary.totalRevenue - summary.summary.totalCommission;

      expect(summary.summary.netPayable).toBeCloseTo(expectedNet, 2);
    });
  });

  describe('Usage Aggregation', () => {
    let testResellerId: string;

    beforeEach(async () => {
      const reseller = await resellerService.create({
        name: 'Usage Test Reseller',
        contactEmail: 'usage@test.com',
        billingEmail: 'usage@test.com',
        tier: 'RESELLER_PROFESSIONAL' as ResellerTier,
      });
      testResellerId = reseller.id;
    });

    it('should aggregate usage across customers', async () => {
      // Add multiple customers
      for (let i = 0; i < 3; i++) {
        await resellerService.addCustomer(testResellerId, {
          name: `Usage Customer ${i}`,
          slug: `usage-customer-${i}-${Date.now()}`,
        });
      }

      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const usage = await billingService.getAggregatedUsage(testResellerId, period);

      expect(usage).toBeDefined();
      expect(usage.totalCustomers).toBeGreaterThanOrEqual(3);
      expect(usage).toHaveProperty('totalUsers');
      expect(usage).toHaveProperty('totalProcesses');
      expect(usage).toHaveProperty('totalDataSources');
      expect(usage).toHaveProperty('totalStorage');
      expect(usage).toHaveProperty('totalApiCalls');
    });

    it('should track per-customer usage', async () => {
      const customer = await resellerService.addCustomer(testResellerId, {
        name: 'Single Customer',
        slug: `single-customer-${Date.now()}`,
      });

      const period = {
        start: new Date(2024, 0, 1),
        end: new Date(2024, 0, 31),
      };

      const usage = await billingService.trackUsage(customer.id, period);

      expect(usage).toBeDefined();
      expect(usage.entityId).toBe(customer.id);
      expect(usage.entityName).toBe('Single Customer');
      expect(usage.period).toEqual(period);
      expect(usage.metrics).toBeDefined();
    });
  });

  describe('Tier-based Pricing', () => {
    it('should apply different commission rates by tier', async () => {
      const tiers: ResellerTier[] = [
        'RESELLER_STARTER',
        'RESELLER_PROFESSIONAL',
        'RESELLER_ENTERPRISE',
      ];

      for (const tier of tiers) {
        const reseller = await resellerService.create({
          name: `${tier} Reseller`,
          contactEmail: `${tier.toLowerCase()}@test.com`,
          billingEmail: `${tier.toLowerCase()}@test.com`,
          tier,
        });

        const period = {
          start: new Date(2024, 0, 1),
          end: new Date(2024, 0, 31),
        };

        const report = await billingService.calculateCommission(reseller.id, period);

        const expectedRates = {
          RESELLER_STARTER: 10,
          RESELLER_PROFESSIONAL: 20,
          RESELLER_ENTERPRISE: 30,
        };

        expect(report.commissionRate).toBe(expectedRates[tier]);
      }
    });
  });
});
