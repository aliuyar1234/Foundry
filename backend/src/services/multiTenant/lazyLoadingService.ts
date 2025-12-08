/**
 * Lazy Loading Service for Cross-Entity Dashboards
 * T356 - Implement lazy loading for cross-entity dashboards
 *
 * Provides progressive data loading strategies for dashboards
 * that aggregate data across multiple entities.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

export interface LazyLoadingConfig {
  prisma: PrismaClient;
  redis?: Redis;
  defaultBatchSize?: number;
  maxConcurrentLoads?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export interface LoadRequest {
  entityIds: string[];
  dataType: DataType;
  options?: LoadOptions;
}

export interface LoadOptions {
  batchSize?: number;
  priority?: 'high' | 'normal' | 'low';
  includeDetails?: boolean;
  dateRange?: { start: Date; end: Date };
}

export type DataType =
  | 'summary'
  | 'processMetrics'
  | 'userMetrics'
  | 'dataSourceMetrics'
  | 'recentActivity'
  | 'alerts';

export interface LoadResult<T> {
  entityId: string;
  data: T;
  loadedAt: Date;
  fromCache: boolean;
}

export interface DashboardData {
  summary: EntitySummary;
  processMetrics?: ProcessMetrics;
  userMetrics?: UserMetrics;
  dataSourceMetrics?: DataSourceMetrics;
  recentActivity?: ActivityItem[];
  alerts?: AlertItem[];
}

export interface EntitySummary {
  entityId: string;
  entityName: string;
  status: string;
  totalProcesses: number;
  totalUsers: number;
  totalDataSources: number;
  lastActivityAt: Date | null;
}

export interface ProcessMetrics {
  total: number;
  active: number;
  completed: number;
  avgCycleTimeMs: number;
  topProcessTypes: Array<{ type: string; count: number }>;
}

export interface UserMetrics {
  total: number;
  active: number;
  newThisMonth: number;
  roleDistribution: Array<{ role: string; count: number }>;
}

export interface DataSourceMetrics {
  total: number;
  byType: Array<{ type: string; count: number }>;
  syncStatus: { healthy: number; warning: number; error: number };
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  userId: string;
  userName: string;
  timestamp: Date;
}

export interface AlertItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  entityId: string;
  createdAt: Date;
}

export interface LoadProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  currentEntity: string | null;
}

type LoadProgressCallback = (progress: LoadProgress) => void;

/**
 * Lazy Loading Service for cross-entity dashboard data
 */
export class LazyLoadingService {
  private prisma: PrismaClient;
  private redis?: Redis;
  private defaultBatchSize: number;
  private maxConcurrentLoads: number;
  private cacheEnabled: boolean;
  private cacheTTL: number;
  private activeLoads: Map<string, Promise<any>> = new Map();

  constructor(config: LazyLoadingConfig) {
    this.prisma = config.prisma;
    this.redis = config.redis;
    this.defaultBatchSize = config.defaultBatchSize || 5;
    this.maxConcurrentLoads = config.maxConcurrentLoads || 3;
    this.cacheEnabled = config.cacheEnabled ?? true;
    this.cacheTTL = config.cacheTTL || 300; // 5 minutes
  }

  // ==========================================================================
  // Main Loading Methods
  // ==========================================================================

  /**
   * Load dashboard data for multiple entities with lazy loading
   */
  async loadDashboardData(
    entityIds: string[],
    onProgress?: LoadProgressCallback
  ): Promise<Map<string, DashboardData>> {
    const results = new Map<string, DashboardData>();
    const progress: LoadProgress = {
      total: entityIds.length,
      completed: 0,
      failed: 0,
      pending: entityIds.length,
      currentEntity: null,
    };

    // Load in batches
    for (let i = 0; i < entityIds.length; i += this.defaultBatchSize) {
      const batch = entityIds.slice(i, i + this.defaultBatchSize);

      // Load batch concurrently with limited concurrency
      const batchPromises = batch.map(async (entityId) => {
        progress.currentEntity = entityId;
        onProgress?.(progress);

        try {
          const data = await this.loadEntityDashboard(entityId);
          results.set(entityId, data);
          progress.completed++;
        } catch (error) {
          console.error(`Failed to load dashboard for entity ${entityId}:`, error);
          progress.failed++;
        }

        progress.pending--;
        onProgress?.(progress);
      });

      await Promise.all(batchPromises);
    }

    progress.currentEntity = null;
    onProgress?.(progress);

    return results;
  }

  /**
   * Load dashboard data for a single entity
   */
  async loadEntityDashboard(entityId: string): Promise<DashboardData> {
    // Check cache first
    if (this.cacheEnabled && this.redis) {
      const cached = await this.getCachedDashboard(entityId);
      if (cached) return cached;
    }

    // Load summary first (fast)
    const summary = await this.loadEntitySummary(entityId);

    // Return early with just summary for immediate display
    const dashboard: DashboardData = { summary };

    // Cache partial result
    if (this.cacheEnabled && this.redis) {
      await this.cacheDashboard(entityId, dashboard);
    }

    return dashboard;
  }

  /**
   * Load additional dashboard sections on demand
   */
  async loadDashboardSection(
    entityId: string,
    section: Exclude<DataType, 'summary'>
  ): Promise<any> {
    // Check cache
    if (this.cacheEnabled && this.redis) {
      const cached = await this.getCachedSection(entityId, section);
      if (cached) return cached;
    }

    let data: any;

    switch (section) {
      case 'processMetrics':
        data = await this.loadProcessMetrics(entityId);
        break;
      case 'userMetrics':
        data = await this.loadUserMetrics(entityId);
        break;
      case 'dataSourceMetrics':
        data = await this.loadDataSourceMetrics(entityId);
        break;
      case 'recentActivity':
        data = await this.loadRecentActivity(entityId);
        break;
      case 'alerts':
        data = await this.loadAlerts(entityId);
        break;
      default:
        throw new Error(`Unknown section: ${section}`);
    }

    // Cache result
    if (this.cacheEnabled && this.redis) {
      await this.cacheSection(entityId, section, data);
    }

    return data;
  }

  // ==========================================================================
  // Individual Data Loaders
  // ==========================================================================

  /**
   * Load entity summary (lightweight, fast query)
   */
  private async loadEntitySummary(entityId: string): Promise<EntitySummary> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    // Use parallel count queries for efficiency
    const [processCount, userCount, dataSourceCount, lastActivity] = await Promise.all([
      this.prisma.process.count({ where: { entityId } }),
      this.prisma.userEntityPermission.count({ where: { entityId } }),
      this.prisma.dataSource.count({ where: { entityId } }),
      this.prisma.auditLog.findFirst({
        where: { entityId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    return {
      entityId: entity.id,
      entityName: entity.name,
      status: entity.status,
      totalProcesses: processCount,
      totalUsers: userCount,
      totalDataSources: dataSourceCount,
      lastActivityAt: lastActivity?.timestamp || null,
    };
  }

  /**
   * Load process metrics (detailed query)
   */
  private async loadProcessMetrics(entityId: string): Promise<ProcessMetrics> {
    const [total, statusCounts, topTypes] = await Promise.all([
      this.prisma.process.count({ where: { entityId } }),
      this.prisma.process.groupBy({
        by: ['status'],
        where: { entityId },
        _count: { status: true },
      }),
      this.prisma.process.groupBy({
        by: ['type'],
        where: { entityId },
        _count: { type: true },
        orderBy: { _count: { type: 'desc' } },
        take: 5,
      }),
    ]);

    const statusMap = new Map(
      statusCounts.map((s) => [s.status, s._count.status])
    );

    return {
      total,
      active: statusMap.get('ACTIVE') || 0,
      completed: statusMap.get('COMPLETED') || 0,
      avgCycleTimeMs: 0, // Would need additional calculation
      topProcessTypes: topTypes.map((t) => ({
        type: t.type || 'Unknown',
        count: t._count.type,
      })),
    };
  }

  /**
   * Load user metrics
   */
  private async loadUserMetrics(entityId: string): Promise<UserMetrics> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, roleCounts, newUsers, activeUsers] = await Promise.all([
      this.prisma.userEntityPermission.count({ where: { entityId } }),
      this.prisma.userEntityPermission.groupBy({
        by: ['role'],
        where: { entityId },
        _count: { role: true },
      }),
      this.prisma.userEntityPermission.count({
        where: {
          entityId,
          createdAt: { gte: monthStart },
        },
      }),
      this.prisma.userEntityPermission.count({
        where: {
          entityId,
          user: {
            lastLoginAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
      }),
    ]);

    return {
      total,
      active: activeUsers,
      newThisMonth: newUsers,
      roleDistribution: roleCounts.map((r) => ({
        role: r.role,
        count: r._count.role,
      })),
    };
  }

  /**
   * Load data source metrics
   */
  private async loadDataSourceMetrics(entityId: string): Promise<DataSourceMetrics> {
    const [total, typeCounts, healthCounts] = await Promise.all([
      this.prisma.dataSource.count({ where: { entityId } }),
      this.prisma.dataSource.groupBy({
        by: ['type'],
        where: { entityId },
        _count: { type: true },
      }),
      this.prisma.dataSource.groupBy({
        by: ['status'],
        where: { entityId },
        _count: { status: true },
      }),
    ]);

    const healthMap = new Map(
      healthCounts.map((h) => [h.status, h._count.status])
    );

    return {
      total,
      byType: typeCounts.map((t) => ({
        type: t.type,
        count: t._count.type,
      })),
      syncStatus: {
        healthy: healthMap.get('ACTIVE') || 0,
        warning: healthMap.get('WARNING') || 0,
        error: healthMap.get('ERROR') || 0,
      },
    };
  }

  /**
   * Load recent activity
   */
  private async loadRecentActivity(
    entityId: string,
    limit: number = 10
  ): Promise<ActivityItem[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      type: log.action,
      description: log.details ? String((log.details as any).description || log.action) : log.action,
      userId: log.user?.id || 'system',
      userName: log.user?.name || 'System',
      timestamp: log.timestamp,
    }));
  }

  /**
   * Load alerts
   */
  private async loadAlerts(entityId: string, limit: number = 10): Promise<AlertItem[]> {
    // Assuming there's an alerts table or we derive from audit logs
    const criticalLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId,
        action: { in: ['SECURITY_ALERT', 'SYSTEM_ERROR', 'COMPLIANCE_WARNING'] },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return criticalLogs.map((log) => ({
      id: log.id,
      severity: this.determineSeverity(log.action),
      message: log.details ? String((log.details as any).message || log.action) : log.action,
      entityId: log.entityId,
      createdAt: log.timestamp,
    }));
  }

  private determineSeverity(action: string): 'info' | 'warning' | 'critical' {
    if (action.includes('ERROR') || action.includes('SECURITY')) return 'critical';
    if (action.includes('WARNING')) return 'warning';
    return 'info';
  }

  // ==========================================================================
  // Caching Methods
  // ==========================================================================

  private getCacheKey(entityId: string, section?: string): string {
    return section
      ? `dashboard:${entityId}:${section}`
      : `dashboard:${entityId}:full`;
  }

  private async getCachedDashboard(entityId: string): Promise<DashboardData | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(this.getCacheKey(entityId));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore cache errors
    }

    return null;
  }

  private async cacheDashboard(entityId: string, data: DashboardData): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setex(
        this.getCacheKey(entityId),
        this.cacheTTL,
        JSON.stringify(data)
      );
    } catch {
      // Ignore cache errors
    }
  }

  private async getCachedSection(entityId: string, section: string): Promise<any | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(this.getCacheKey(entityId, section));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore cache errors
    }

    return null;
  }

  private async cacheSection(
    entityId: string,
    section: string,
    data: any
  ): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setex(
        this.getCacheKey(entityId, section),
        this.cacheTTL,
        JSON.stringify(data)
      );
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Invalidate cache for entity
   */
  async invalidateCache(entityId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const pattern = `dashboard:${entityId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // Ignore cache errors
    }
  }

  // ==========================================================================
  // Streaming / Real-time Updates
  // ==========================================================================

  /**
   * Create a generator for streaming dashboard updates
   */
  async *streamDashboardData(
    entityIds: string[]
  ): AsyncGenerator<LoadResult<DashboardData>> {
    for (const entityId of entityIds) {
      try {
        const fromCache = await this.getCachedDashboard(entityId);
        if (fromCache) {
          yield {
            entityId,
            data: fromCache,
            loadedAt: new Date(),
            fromCache: true,
          };
          continue;
        }

        const data = await this.loadEntityDashboard(entityId);
        yield {
          entityId,
          data,
          loadedAt: new Date(),
          fromCache: false,
        };
      } catch (error) {
        console.error(`Failed to stream data for entity ${entityId}:`, error);
        // Skip failed entities but continue streaming
      }
    }
  }

  /**
   * Prefetch dashboard data for entities (background loading)
   */
  async prefetchDashboards(entityIds: string[]): Promise<void> {
    // Load in background without blocking
    const loadPromises = entityIds.map(async (entityId) => {
      // Skip if already loading
      if (this.activeLoads.has(entityId)) {
        return;
      }

      const loadPromise = this.loadEntityDashboard(entityId);
      this.activeLoads.set(entityId, loadPromise);

      try {
        await loadPromise;
      } finally {
        this.activeLoads.delete(entityId);
      }
    });

    // Don't await - let prefetch happen in background
    Promise.all(loadPromises).catch(() => {
      // Ignore prefetch errors
    });
  }
}

/**
 * Create lazy loading service instance
 */
export function createLazyLoadingService(
  config: LazyLoadingConfig
): LazyLoadingService {
  return new LazyLoadingService(config);
}

export default LazyLoadingService;
