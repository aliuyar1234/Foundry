/**
 * DATEV Cost Center Extractor
 * Task: T134
 *
 * Extracts cost centers (Kostenstellen) and cost objects (Kostenträger).
 * Handles German cost accounting structures.
 */

import { ExtractedEvent } from '../../base/connector';
import { DatevClient } from '../datevClient';

export interface CostCenter {
  id: string;
  number: string;
  name: string;
  nameDe: string;
  description?: string;
  parentNumber?: string;
  departmentCode?: string;
  managerName?: string;
  budgetAmount?: number;
  currency: string;
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;
  createdAt: string;
  modifiedAt: string;
}

export interface CostObject {
  id: string;
  number: string;
  name: string;
  nameDe: string;
  description?: string;
  type: 'project' | 'product' | 'order' | 'contract' | 'other';
  status: 'active' | 'completed' | 'cancelled';
  costCenterNumber?: string;
  budgetAmount?: number;
  actualAmount?: number;
  currency: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  modifiedAt: string;
}

export interface CostAllocation {
  id: string;
  sourceType: 'cost_center' | 'cost_object';
  sourceNumber: string;
  targetType: 'cost_center' | 'cost_object';
  targetNumber: string;
  allocationKey: string;
  percentage: number;
  fixedAmount?: number;
  period: string;
  createdAt: string;
}

export interface CostCenterReport {
  costCenter: CostCenter;
  actualCosts: number;
  budgetAmount: number;
  variance: number;
  variancePercent: number;
  byAccount: Record<string, {
    accountNumber: string;
    accountName: string;
    actualAmount: number;
    budgetAmount: number;
  }>;
  byMonth: Record<string, number>;
}

export interface CostExtractionOptions {
  organizationId: string;
  dateFrom?: Date;
  dateTo?: Date;
  includeCostObjects?: boolean;
  includeAllocations?: boolean;
}

export interface CostExtractionResult {
  events: ExtractedEvent[];
  costCenters: CostCenter[];
  costObjects: CostObject[];
  allocations: CostAllocation[];
  summary: {
    totalCostCenters: number;
    totalCostObjects: number;
    totalAllocations: number;
    totalBudget: number;
    totalActual: number;
  };
}

export class DatevCostCenterExtractor {
  private client: DatevClient;
  private costCenterCache: Map<string, CostCenter> = new Map();
  private costObjectCache: Map<string, CostObject> = new Map();

  constructor(client: DatevClient) {
    this.client = client;
  }

  /**
   * Extract all cost data
   */
  async extractCostData(
    options: CostExtractionOptions
  ): Promise<CostExtractionResult> {
    const events: ExtractedEvent[] = [];
    const costCenters: CostCenter[] = [];
    const costObjects: CostObject[] = [];
    const allocations: CostAllocation[] = [];
    let totalBudget = 0;
    let totalActual = 0;

    try {
      // Extract cost centers
      const centers = await this.getCostCenters();
      for (const center of centers) {
        costCenters.push(center);
        this.costCenterCache.set(center.number, center);
        events.push(this.createCostCenterEvent(center, options.organizationId));
        totalBudget += center.budgetAmount || 0;
      }

      // Extract cost objects if requested
      if (options.includeCostObjects) {
        const objects = await this.getCostObjects();
        for (const obj of objects) {
          costObjects.push(obj);
          this.costObjectCache.set(obj.number, obj);
          events.push(this.createCostObjectEvent(obj, options.organizationId));
          totalActual += obj.actualAmount || 0;
        }
      }

      // Extract allocations if requested
      if (options.includeAllocations) {
        const allocs = await this.getCostAllocations(options);
        for (const alloc of allocs) {
          allocations.push(alloc);
          events.push(this.createAllocationEvent(alloc, options.organizationId));
        }
      }

      // Calculate actual costs from journal entries
      if (options.dateFrom && options.dateTo) {
        const actualCosts = await this.calculateActualCosts(options);
        totalActual = Object.values(actualCosts).reduce((sum, c) => sum + c, 0);
      }
    } catch (error) {
      console.warn('Failed to extract cost data:', error);
    }

    return {
      events,
      costCenters,
      costObjects,
      allocations,
      summary: {
        totalCostCenters: costCenters.length,
        totalCostObjects: costObjects.length,
        totalAllocations: allocations.length,
        totalBudget,
        totalActual,
      },
    };
  }

  /**
   * Get cost centers from DATEV
   */
  async getCostCenters(): Promise<CostCenter[]> {
    try {
      const result = await (this.client as any).request<{
        costCenters: CostCenter[];
      }>('/accounting/v1/cost-centers');

      return result.costCenters || [];
    } catch (error) {
      console.warn('Failed to get cost centers:', error);
      return [];
    }
  }

  /**
   * Get cost objects from DATEV
   */
  async getCostObjects(): Promise<CostObject[]> {
    try {
      const result = await (this.client as any).request<{
        costObjects: CostObject[];
      }>('/accounting/v1/cost-objects');

      return result.costObjects || [];
    } catch (error) {
      console.warn('Failed to get cost objects:', error);
      return [];
    }
  }

  /**
   * Get cost allocations
   */
  async getCostAllocations(
    options: CostExtractionOptions
  ): Promise<CostAllocation[]> {
    try {
      const params = new URLSearchParams();
      if (options.dateFrom) {
        params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
      }
      if (options.dateTo) {
        params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
      }

      const result = await (this.client as any).request<{
        allocations: CostAllocation[];
      }>(`/accounting/v1/cost-allocations?${params.toString()}`);

      return result.allocations || [];
    } catch (error) {
      console.warn('Failed to get cost allocations:', error);
      return [];
    }
  }

  /**
   * Calculate actual costs by cost center
   */
  async calculateActualCosts(
    options: CostExtractionOptions
  ): Promise<Record<string, number>> {
    const costsByCostCenter: Record<string, number> = {};

    try {
      const entries = await this.client.getAllJournalEntries({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      for (const entry of entries) {
        if (entry.costCenter) {
          costsByCostCenter[entry.costCenter] =
            (costsByCostCenter[entry.costCenter] || 0) + Math.abs(entry.amount);
        }
      }
    } catch (error) {
      console.warn('Failed to calculate actual costs:', error);
    }

    return costsByCostCenter;
  }

  /**
   * Generate cost center report
   */
  async generateCostCenterReport(
    costCenterNumber: string,
    options: {
      organizationId: string;
      dateFrom: Date;
      dateTo: Date;
    }
  ): Promise<CostCenterReport | null> {
    const costCenter = this.costCenterCache.get(costCenterNumber);
    if (!costCenter) {
      return null;
    }

    const byAccount: Record<string, {
      accountNumber: string;
      accountName: string;
      actualAmount: number;
      budgetAmount: number;
    }> = {};
    const byMonth: Record<string, number> = {};
    let totalActual = 0;

    try {
      const entries = await this.client.getAllJournalEntries({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      for (const entry of entries) {
        if (entry.costCenter !== costCenterNumber) continue;

        // By account
        const accountKey = entry.accountNumber;
        if (!byAccount[accountKey]) {
          byAccount[accountKey] = {
            accountNumber: entry.accountNumber,
            accountName: '', // Would need to look up
            actualAmount: 0,
            budgetAmount: 0,
          };
        }
        byAccount[accountKey].actualAmount += Math.abs(entry.amount);

        // By month
        const month = entry.date.substring(0, 7);
        byMonth[month] = (byMonth[month] || 0) + Math.abs(entry.amount);

        totalActual += Math.abs(entry.amount);
      }
    } catch (error) {
      console.warn('Failed to generate cost center report:', error);
    }

    const budgetAmount = costCenter.budgetAmount || 0;
    const variance = budgetAmount - totalActual;

    return {
      costCenter,
      actualCosts: totalActual,
      budgetAmount,
      variance,
      variancePercent: budgetAmount > 0 ? (variance / budgetAmount) * 100 : 0,
      byAccount,
      byMonth,
    };
  }

  /**
   * Get cost center hierarchy
   */
  getCostCenterHierarchy(): Array<{
    costCenter: CostCenter;
    children: CostCenter[];
    level: number;
  }> {
    const hierarchy: Array<{
      costCenter: CostCenter;
      children: CostCenter[];
      level: number;
    }> = [];

    const costCenters = Array.from(this.costCenterCache.values());
    const processed = new Set<string>();

    // Find root cost centers (no parent)
    const roots = costCenters.filter((cc) => !cc.parentNumber);

    const processChildren = (parent: CostCenter, level: number) => {
      if (processed.has(parent.number)) return;
      processed.add(parent.number);

      const children = costCenters.filter(
        (cc) => cc.parentNumber === parent.number
      );

      hierarchy.push({
        costCenter: parent,
        children,
        level,
      });

      for (const child of children) {
        processChildren(child, level + 1);
      }
    };

    for (const root of roots) {
      processChildren(root, 0);
    }

    return hierarchy;
  }

  /**
   * Create cost center event
   */
  private createCostCenterEvent(
    costCenter: CostCenter,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'accounting.cost_center',
      timestamp: new Date(costCenter.modifiedAt),
      actorId: undefined,
      targetId: `datev:kst:${costCenter.number}`,
      metadata: {
        source: 'datev',
        organizationId,
        costCenterId: costCenter.id,
        number: costCenter.number,
        name: costCenter.name,
        nameDe: costCenter.nameDe,
        description: costCenter.description,
        parentNumber: costCenter.parentNumber,
        departmentCode: costCenter.departmentCode,
        budgetAmount: costCenter.budgetAmount,
        currency: costCenter.currency,
        isActive: costCenter.isActive,
        createdAt: costCenter.createdAt,
        modifiedAt: costCenter.modifiedAt,
      },
    };
  }

  /**
   * Create cost object event
   */
  private createCostObjectEvent(
    costObject: CostObject,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'accounting.cost_object',
      timestamp: new Date(costObject.modifiedAt),
      actorId: undefined,
      targetId: `datev:ktr:${costObject.number}`,
      metadata: {
        source: 'datev',
        organizationId,
        costObjectId: costObject.id,
        number: costObject.number,
        name: costObject.name,
        nameDe: costObject.nameDe,
        description: costObject.description,
        objectType: costObject.type,
        status: costObject.status,
        costCenterNumber: costObject.costCenterNumber,
        budgetAmount: costObject.budgetAmount,
        actualAmount: costObject.actualAmount,
        currency: costObject.currency,
        startDate: costObject.startDate,
        endDate: costObject.endDate,
        isActive: costObject.isActive,
        createdAt: costObject.createdAt,
        modifiedAt: costObject.modifiedAt,
      },
    };
  }

  /**
   * Create allocation event
   */
  private createAllocationEvent(
    allocation: CostAllocation,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'accounting.cost_allocation',
      timestamp: new Date(allocation.createdAt),
      actorId: undefined,
      targetId: `datev:alloc:${allocation.id}`,
      metadata: {
        source: 'datev',
        organizationId,
        allocationId: allocation.id,
        sourceType: allocation.sourceType,
        sourceNumber: allocation.sourceNumber,
        targetType: allocation.targetType,
        targetNumber: allocation.targetNumber,
        allocationKey: allocation.allocationKey,
        percentage: allocation.percentage,
        fixedAmount: allocation.fixedAmount,
        period: allocation.period,
        createdAt: allocation.createdAt,
      },
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.costCenterCache.clear();
    this.costObjectCache.clear();
  }
}

/**
 * Create cost center extractor
 */
export function createCostCenterExtractor(client: DatevClient): DatevCostCenterExtractor {
  return new DatevCostCenterExtractor(client);
}
