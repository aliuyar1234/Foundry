/**
 * Billing Service
 * SCALE Tier - Tasks T119-T122
 *
 * Manages reseller billing and commission tracking
 */

import { PrismaClient, ResellerAccount, ResellerTier, Entity } from '@prisma/client';
import { AppError } from '../../lib/errors/AppError';

export interface BillingServiceConfig {
  prisma: PrismaClient;
}

export interface UsageMetrics {
  entityId: string;
  entityName: string;
  period: { start: Date; end: Date };
  metrics: {
    activeUsers: number;
    processesDiscovered: number;
    dataSourcesConnected: number;
    storageUsedMb: number;
    apiCallsMade: number;
  };
}

export interface BillingLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  entityId?: string;
  entityName?: string;
}

export interface Invoice {
  id: string;
  resellerId: string;
  resellerName: string;
  period: { start: Date; end: Date };
  lineItems: BillingLineItem[];
  subtotal: number;
  commissionRate: number;
  commissionAmount: number;
  total: number;
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue';
  dueDate: Date;
  generatedAt: Date;
}

export interface CommissionReport {
  resellerId: string;
  resellerName: string;
  tier: ResellerTier;
  period: { start: Date; end: Date };
  totalRevenue: number;
  commissionRate: number;
  commissionEarned: number;
  customerBreakdown: {
    entityId: string;
    entityName: string;
    revenue: number;
    commission: number;
  }[];
}

// Pricing per tier (monthly)
const BASE_PRICING: Record<string, number> = {
  perUser: 10,
  perProcess: 0.5,
  perDataSource: 25,
  perGbStorage: 1,
  apiCallsIncluded: 10000,
  perExtraApiCall: 0.001,
};

export class BillingService {
  private prisma: PrismaClient;

  constructor(config: BillingServiceConfig) {
    this.prisma = config.prisma;
  }

  // ==========================================================================
  // T119-T120: Usage Tracking
  // ==========================================================================

  /**
   * Track usage for an entity
   */
  async trackUsage(
    entityId: string,
    period: { start: Date; end: Date }
  ): Promise<UsageMetrics> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      throw new AppError('ENTITY_NOT_FOUND', 'Entity not found');
    }

    // In a real implementation, these would query actual usage data
    // For now, we'll simulate with placeholder queries
    const [userCount, processCount, dataSourceCount] = await Promise.all([
      this.countActiveUsers(entityId, period),
      this.countProcesses(entityId, period),
      this.countDataSources(entityId),
    ]);

    return {
      entityId,
      entityName: entity.name,
      period,
      metrics: {
        activeUsers: userCount,
        processesDiscovered: processCount,
        dataSourcesConnected: dataSourceCount,
        storageUsedMb: 0, // Would come from storage service
        apiCallsMade: 0, // Would come from API audit logs
      },
    };
  }

  /**
   * Get usage for all customers of a reseller
   */
  async getResellerUsage(
    resellerId: string,
    period: { start: Date; end: Date }
  ): Promise<UsageMetrics[]> {
    const customers = await this.prisma.entity.findMany({
      where: { resellerId },
    });

    const usagePromises = customers.map(customer =>
      this.trackUsage(customer.id, period)
    );

    return Promise.all(usagePromises);
  }

  /**
   * Get aggregated usage metrics for reseller
   */
  async getAggregatedUsage(
    resellerId: string,
    period: { start: Date; end: Date }
  ): Promise<{
    totalCustomers: number;
    totalUsers: number;
    totalProcesses: number;
    totalDataSources: number;
    totalStorage: number;
    totalApiCalls: number;
  }> {
    const usage = await this.getResellerUsage(resellerId, period);

    return {
      totalCustomers: usage.length,
      totalUsers: usage.reduce((sum, u) => sum + u.metrics.activeUsers, 0),
      totalProcesses: usage.reduce((sum, u) => sum + u.metrics.processesDiscovered, 0),
      totalDataSources: usage.reduce((sum, u) => sum + u.metrics.dataSourcesConnected, 0),
      totalStorage: usage.reduce((sum, u) => sum + u.metrics.storageUsedMb, 0),
      totalApiCalls: usage.reduce((sum, u) => sum + u.metrics.apiCallsMade, 0),
    };
  }

  // ==========================================================================
  // T121: Invoice Generation
  // ==========================================================================

  /**
   * Generate invoice for reseller
   */
  async generateInvoice(
    resellerId: string,
    period: { start: Date; end: Date }
  ): Promise<Invoice> {
    const reseller = await this.prisma.resellerAccount.findUnique({
      where: { id: resellerId },
    });

    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller account not found');
    }

    // Get usage for all customers
    const customerUsage = await this.getResellerUsage(resellerId, period);

    // Generate line items
    const lineItems: BillingLineItem[] = [];

    for (const usage of customerUsage) {
      // Per-user charges
      if (usage.metrics.activeUsers > 0) {
        lineItems.push({
          description: `Active Users - ${usage.entityName}`,
          quantity: usage.metrics.activeUsers,
          unitPrice: BASE_PRICING.perUser,
          total: usage.metrics.activeUsers * BASE_PRICING.perUser,
          entityId: usage.entityId,
          entityName: usage.entityName,
        });
      }

      // Per-process charges
      if (usage.metrics.processesDiscovered > 0) {
        lineItems.push({
          description: `Processes Discovered - ${usage.entityName}`,
          quantity: usage.metrics.processesDiscovered,
          unitPrice: BASE_PRICING.perProcess,
          total: usage.metrics.processesDiscovered * BASE_PRICING.perProcess,
          entityId: usage.entityId,
          entityName: usage.entityName,
        });
      }

      // Data source charges
      if (usage.metrics.dataSourcesConnected > 0) {
        lineItems.push({
          description: `Data Sources - ${usage.entityName}`,
          quantity: usage.metrics.dataSourcesConnected,
          unitPrice: BASE_PRICING.perDataSource,
          total: usage.metrics.dataSourcesConnected * BASE_PRICING.perDataSource,
          entityId: usage.entityId,
          entityName: usage.entityName,
        });
      }

      // Storage charges
      if (usage.metrics.storageUsedMb > 1024) {
        const storageGb = Math.ceil(usage.metrics.storageUsedMb / 1024);
        lineItems.push({
          description: `Storage (GB) - ${usage.entityName}`,
          quantity: storageGb,
          unitPrice: BASE_PRICING.perGbStorage,
          total: storageGb * BASE_PRICING.perGbStorage,
          entityId: usage.entityId,
          entityName: usage.entityName,
        });
      }

      // API overage charges
      if (usage.metrics.apiCallsMade > BASE_PRICING.apiCallsIncluded) {
        const overageCount = usage.metrics.apiCallsMade - BASE_PRICING.apiCallsIncluded;
        lineItems.push({
          description: `API Overage Calls - ${usage.entityName}`,
          quantity: overageCount,
          unitPrice: BASE_PRICING.perExtraApiCall,
          total: overageCount * BASE_PRICING.perExtraApiCall,
          entityId: usage.entityId,
          entityName: usage.entityName,
        });
      }
    }

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const commissionAmount = subtotal * (reseller.commissionRate / 100);
    const total = subtotal - commissionAmount;

    // Due date is 30 days from end of period
    const dueDate = new Date(period.end);
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice: Invoice = {
      id: `INV-${resellerId.slice(0, 8)}-${Date.now()}`,
      resellerId,
      resellerName: reseller.name,
      period,
      lineItems,
      subtotal,
      commissionRate: reseller.commissionRate,
      commissionAmount,
      total,
      currency: 'EUR',
      status: 'draft',
      dueDate,
      generatedAt: new Date(),
    };

    return invoice;
  }

  /**
   * Generate invoice preview (doesn't persist)
   */
  async previewInvoice(
    resellerId: string,
    period: { start: Date; end: Date }
  ): Promise<Invoice> {
    return this.generateInvoice(resellerId, period);
  }

  // ==========================================================================
  // T122: Commission Calculation
  // ==========================================================================

  /**
   * Calculate commission for reseller
   */
  async calculateCommission(
    resellerId: string,
    period: { start: Date; end: Date }
  ): Promise<CommissionReport> {
    const reseller = await this.prisma.resellerAccount.findUnique({
      where: { id: resellerId },
    });

    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller account not found');
    }

    const invoice = await this.generateInvoice(resellerId, period);

    // Group by customer
    const customerBreakdown = this.groupLineItemsByCustomer(
      invoice.lineItems,
      reseller.commissionRate
    );

    return {
      resellerId,
      resellerName: reseller.name,
      tier: reseller.tier,
      period,
      totalRevenue: invoice.subtotal,
      commissionRate: reseller.commissionRate,
      commissionEarned: invoice.commissionAmount,
      customerBreakdown,
    };
  }

  /**
   * Get commission history for reseller
   */
  async getCommissionHistory(
    resellerId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<CommissionReport[]> {
    // In a real implementation, this would query stored invoice/commission records
    // For now, we'll generate reports for the last few months

    const endDate = options?.endDate || new Date();
    const startDate = options?.startDate || new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const limit = options?.limit || 3;

    const reports: CommissionReport[] = [];
    const currentDate = new Date(endDate);

    for (let i = 0; i < limit; i++) {
      const periodEnd = new Date(currentDate);
      const periodStart = new Date(currentDate);
      periodStart.setMonth(periodStart.getMonth() - 1);

      if (periodStart < startDate) break;

      try {
        const report = await this.calculateCommission(resellerId, {
          start: periodStart,
          end: periodEnd,
        });
        reports.push(report);
      } catch {
        // Skip periods with errors
      }

      currentDate.setMonth(currentDate.getMonth() - 1);
    }

    return reports;
  }

  /**
   * Get commission rates by tier
   */
  getCommissionRates(): Record<ResellerTier, number> {
    return {
      RESELLER_STARTER: 10,
      RESELLER_PROFESSIONAL: 20,
      RESELLER_ENTERPRISE: 30,
    };
  }

  // ==========================================================================
  // Billing Reports
  // ==========================================================================

  /**
   * Generate billing summary report
   */
  async getBillingSummary(
    resellerId: string,
    period: { start: Date; end: Date }
  ): Promise<{
    reseller: { id: string; name: string; tier: ResellerTier };
    period: { start: Date; end: Date };
    summary: {
      totalRevenue: number;
      totalCommission: number;
      netPayable: number;
      customerCount: number;
      userCount: number;
    };
    trends: {
      revenueChange: number;
      customerChange: number;
    };
  }> {
    const reseller = await this.prisma.resellerAccount.findUnique({
      where: { id: resellerId },
    });

    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller account not found');
    }

    const invoice = await this.generateInvoice(resellerId, period);
    const aggregatedUsage = await this.getAggregatedUsage(resellerId, period);

    // Calculate previous period for trends
    const periodLength = period.end.getTime() - period.start.getTime();
    const previousPeriod = {
      start: new Date(period.start.getTime() - periodLength),
      end: new Date(period.start.getTime()),
    };

    let previousInvoice: Invoice | null = null;
    let previousUsage = { totalCustomers: 0 };

    try {
      previousInvoice = await this.generateInvoice(resellerId, previousPeriod);
      previousUsage = await this.getAggregatedUsage(resellerId, previousPeriod);
    } catch {
      // Previous period may not have data
    }

    const revenueChange = previousInvoice
      ? ((invoice.subtotal - previousInvoice.subtotal) / previousInvoice.subtotal) * 100
      : 0;

    const customerChange = previousUsage.totalCustomers
      ? ((aggregatedUsage.totalCustomers - previousUsage.totalCustomers) /
          previousUsage.totalCustomers) *
        100
      : 0;

    return {
      reseller: {
        id: reseller.id,
        name: reseller.name,
        tier: reseller.tier,
      },
      period,
      summary: {
        totalRevenue: invoice.subtotal,
        totalCommission: invoice.commissionAmount,
        netPayable: invoice.total,
        customerCount: aggregatedUsage.totalCustomers,
        userCount: aggregatedUsage.totalUsers,
      },
      trends: {
        revenueChange,
        customerChange,
      },
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Count active users for entity in period
   */
  private async countActiveUsers(
    entityId: string,
    period: { start: Date; end: Date }
  ): Promise<number> {
    // In production, would query user activity logs
    // For now, return placeholder based on entity permissions
    const permissions = await this.prisma.userEntityPermission.count({
      where: { entityId },
    });
    return permissions;
  }

  /**
   * Count processes for entity in period
   */
  private async countProcesses(
    entityId: string,
    period: { start: Date; end: Date }
  ): Promise<number> {
    // In production, would query process discovery data
    // For now, return placeholder
    return 0;
  }

  /**
   * Count data sources for entity
   */
  private async countDataSources(entityId: string): Promise<number> {
    // In production, would query data sources with entity filter
    return 0;
  }

  /**
   * Group line items by customer
   */
  private groupLineItemsByCustomer(
    lineItems: BillingLineItem[],
    commissionRate: number
  ): { entityId: string; entityName: string; revenue: number; commission: number }[] {
    const grouped = new Map<string, { entityName: string; revenue: number }>();

    for (const item of lineItems) {
      if (!item.entityId) continue;

      const existing = grouped.get(item.entityId);
      if (existing) {
        existing.revenue += item.total;
      } else {
        grouped.set(item.entityId, {
          entityName: item.entityName || 'Unknown',
          revenue: item.total,
        });
      }
    }

    return Array.from(grouped.entries()).map(([entityId, data]) => ({
      entityId,
      entityName: data.entityName,
      revenue: data.revenue,
      commission: data.revenue * (commissionRate / 100),
    }));
  }
}
