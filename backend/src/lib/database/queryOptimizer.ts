/**
 * Query Optimizer for RLS-enabled databases
 * T352 - Database query optimization for RLS policies
 *
 * Provides optimized query patterns for Row-Level Security environments
 * to minimize performance impact while maintaining security.
 */

import { PrismaClient, Prisma } from '@prisma/client';

export interface QueryOptimizerConfig {
  prisma: PrismaClient;
  enableQueryLogging?: boolean;
  slowQueryThresholdMs?: number;
}

export interface OptimizedQueryOptions {
  entityId: string;
  userId?: string;
  includeChildren?: boolean;
  batchSize?: number;
}

export interface QueryStats {
  totalQueries: number;
  avgDurationMs: number;
  slowQueries: number;
  cacheHits: number;
  cacheMisses: number;
}

interface QueryTiming {
  query: string;
  durationMs: number;
  timestamp: Date;
}

/**
 * Query Optimizer for RLS-enabled multi-tenant databases
 */
export class QueryOptimizer {
  private prisma: PrismaClient;
  private enableQueryLogging: boolean;
  private slowQueryThresholdMs: number;
  private queryTimings: QueryTiming[] = [];
  private maxTimingHistory = 1000;

  constructor(config: QueryOptimizerConfig) {
    this.prisma = config.prisma;
    this.enableQueryLogging = config.enableQueryLogging ?? false;
    this.slowQueryThresholdMs = config.slowQueryThresholdMs ?? 100;
  }

  /**
   * Set entity context for RLS before executing queries
   * This should be called at the start of each request
   */
  async setEntityContext(entityId: string): Promise<void> {
    await this.prisma.$executeRaw`SELECT set_config('app.current_entity_id', ${entityId}, true)`;
  }

  /**
   * Clear entity context after request
   */
  async clearEntityContext(): Promise<void> {
    await this.prisma.$executeRaw`SELECT set_config('app.current_entity_id', '', true)`;
  }

  /**
   * Execute query with timing and logging
   */
  async executeWithTiming<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();

    try {
      const result = await queryFn();
      const duration = Date.now() - start;

      if (this.enableQueryLogging) {
        this.logQueryTiming(queryName, duration);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logQueryTiming(`${queryName} (ERROR)`, duration);
      throw error;
    }
  }

  /**
   * Log query timing
   */
  private logQueryTiming(query: string, durationMs: number): void {
    this.queryTimings.push({
      query,
      durationMs,
      timestamp: new Date(),
    });

    // Trim old timings
    if (this.queryTimings.length > this.maxTimingHistory) {
      this.queryTimings = this.queryTimings.slice(-this.maxTimingHistory);
    }

    // Log slow queries
    if (durationMs > this.slowQueryThresholdMs) {
      console.warn(
        `[SLOW QUERY] ${query}: ${durationMs}ms (threshold: ${this.slowQueryThresholdMs}ms)`
      );
    }
  }

  /**
   * Get query statistics
   */
  getQueryStats(): QueryStats {
    const totalQueries = this.queryTimings.length;
    const avgDurationMs =
      totalQueries > 0
        ? this.queryTimings.reduce((sum, t) => sum + t.durationMs, 0) / totalQueries
        : 0;
    const slowQueries = this.queryTimings.filter(
      (t) => t.durationMs > this.slowQueryThresholdMs
    ).length;

    return {
      totalQueries,
      avgDurationMs,
      slowQueries,
      cacheHits: 0, // Updated by cache layer
      cacheMisses: 0,
    };
  }

  /**
   * Reset query statistics
   */
  resetQueryStats(): void {
    this.queryTimings = [];
  }

  // ==========================================================================
  // Optimized Entity Queries
  // ==========================================================================

  /**
   * Optimized query for entity list with RLS
   * Uses explicit entityId filter for better query planning
   */
  async findEntitiesOptimized(options: {
    entityId?: string;
    parentEntityId?: string | null;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    orderBy?: { field: string; direction: 'asc' | 'desc' };
  }): Promise<{ entities: any[]; total: number }> {
    const {
      entityId,
      parentEntityId,
      status,
      search,
      page = 1,
      pageSize = 20,
      orderBy = { field: 'name', direction: 'asc' as const },
    } = options;

    // Build optimized where clause
    const where: Prisma.EntityWhereInput = {};

    // Explicit entity filter (helps RLS performance)
    if (entityId) {
      where.id = entityId;
    }

    if (parentEntityId !== undefined) {
      where.parentEntityId = parentEntityId;
    }

    if (status) {
      where.status = status as any;
    }

    if (search) {
      // Use indexed search pattern
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { startsWith: search.toLowerCase() } },
      ];
    }

    return this.executeWithTiming('findEntitiesOptimized', async () => {
      const [entities, total] = await Promise.all([
        this.prisma.entity.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { [orderBy.field]: orderBy.direction },
          // Select only needed fields for performance
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            parentEntityId: true,
            configuration: true,
            dataRetentionDays: true,
            resellerId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.entity.count({ where }),
      ]);

      return { entities, total };
    });
  }

  /**
   * Optimized batch entity lookup
   * Uses IN clause with proper batching for large sets
   */
  async findEntitiesByIds(
    ids: string[],
    batchSize: number = 100
  ): Promise<any[]> {
    if (ids.length === 0) return [];

    return this.executeWithTiming('findEntitiesByIds', async () => {
      const results: any[] = [];

      // Process in batches to avoid query size limits
      for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize);

        const batchResults = await this.prisma.entity.findMany({
          where: { id: { in: batchIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            parentEntityId: true,
            configuration: true,
            dataRetentionDays: true,
            resellerId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        results.push(...batchResults);
      }

      return results;
    });
  }

  /**
   * Optimized entity hierarchy query using recursive CTE
   * Much faster than recursive application-level queries
   */
  async findEntityHierarchy(entityId: string): Promise<{
    path: Array<{ id: string; name: string; slug: string; depth: number }>;
    descendants: Array<{ id: string; name: string; slug: string; depth: number }>;
  }> {
    return this.executeWithTiming('findEntityHierarchy', async () => {
      // Get ancestors using recursive CTE
      const ancestors = await this.prisma.$queryRaw<
        Array<{ id: string; name: string; slug: string; depth: number }>
      >`
        WITH RECURSIVE ancestors AS (
          SELECT id, name, slug, parent_entity_id, 0 as depth
          FROM entities
          WHERE id = ${entityId}

          UNION ALL

          SELECT e.id, e.name, e.slug, e.parent_entity_id, a.depth - 1
          FROM entities e
          INNER JOIN ancestors a ON e.id = a.parent_entity_id
          WHERE a.depth > -10
        )
        SELECT id, name, slug, depth
        FROM ancestors
        ORDER BY depth ASC
      `;

      // Get descendants using recursive CTE
      const descendants = await this.prisma.$queryRaw<
        Array<{ id: string; name: string; slug: string; depth: number }>
      >`
        WITH RECURSIVE descendants AS (
          SELECT id, name, slug, parent_entity_id, 0 as depth
          FROM entities
          WHERE id = ${entityId}

          UNION ALL

          SELECT e.id, e.name, e.slug, e.parent_entity_id, d.depth + 1
          FROM entities e
          INNER JOIN descendants d ON e.parent_entity_id = d.id
          WHERE d.depth < 10
        )
        SELECT id, name, slug, depth
        FROM descendants
        WHERE depth > 0
        ORDER BY depth ASC
      `;

      return {
        path: ancestors,
        descendants,
      };
    });
  }

  /**
   * Optimized count query for entity descendants
   */
  async countEntityDescendants(entityId: string): Promise<number> {
    return this.executeWithTiming('countEntityDescendants', async () => {
      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        WITH RECURSIVE descendants AS (
          SELECT id, parent_entity_id
          FROM entities
          WHERE parent_entity_id = ${entityId}

          UNION ALL

          SELECT e.id, e.parent_entity_id
          FROM entities e
          INNER JOIN descendants d ON e.parent_entity_id = d.id
        )
        SELECT COUNT(*) as count FROM descendants
      `;

      return Number(result[0].count);
    });
  }

  // ==========================================================================
  // Optimized Cross-Entity Queries
  // ==========================================================================

  /**
   * Optimized query for user's accessible entities
   * Uses proper indexes and limits
   */
  async findUserAccessibleEntities(
    userId: string,
    options?: { limit?: number; includeInactive?: boolean }
  ): Promise<Array<{ entityId: string; role: string; entityName: string }>> {
    const { limit = 100, includeInactive = false } = options || {};

    return this.executeWithTiming('findUserAccessibleEntities', async () => {
      const statusFilter = includeInactive
        ? {}
        : { entity: { status: 'ACTIVE' as const } };

      const permissions = await this.prisma.userEntityPermission.findMany({
        where: {
          userId,
          ...statusFilter,
        },
        select: {
          entityId: true,
          role: true,
          entity: {
            select: { name: true },
          },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return permissions.map((p) => ({
        entityId: p.entityId,
        role: p.role,
        entityName: p.entity.name,
      }));
    });
  }

  /**
   * Optimized cross-entity aggregation query
   * Uses parallel queries for each entity to leverage RLS indexes
   */
  async aggregateCrossEntityMetrics(
    entityIds: string[],
    metricType: 'processes' | 'users' | 'dataSources'
  ): Promise<Map<string, number>> {
    return this.executeWithTiming('aggregateCrossEntityMetrics', async () => {
      const results = new Map<string, number>();

      // Use parallel queries - each leverages entity-specific indexes
      const countPromises = entityIds.map(async (entityId) => {
        let count = 0;

        switch (metricType) {
          case 'processes':
            count = await this.prisma.process.count({
              where: { entityId },
            });
            break;
          case 'users':
            count = await this.prisma.userEntityPermission.count({
              where: { entityId },
            });
            break;
          case 'dataSources':
            count = await this.prisma.dataSource.count({
              where: { entityId },
            });
            break;
        }

        results.set(entityId, count);
      });

      await Promise.all(countPromises);

      return results;
    });
  }

  // ==========================================================================
  // Query Plan Analysis
  // ==========================================================================

  /**
   * Analyze query plan for optimization
   */
  async analyzeQueryPlan(query: string): Promise<any[]> {
    return this.executeWithTiming('analyzeQueryPlan', async () => {
      const result = await this.prisma.$queryRawUnsafe(`EXPLAIN ANALYZE ${query}`);
      return result as any[];
    });
  }

  /**
   * Get index usage statistics
   */
  async getIndexStats(tableName: string): Promise<any[]> {
    return this.executeWithTiming('getIndexStats', async () => {
      const result = await this.prisma.$queryRaw`
        SELECT
          indexrelname as index_name,
          idx_scan as index_scans,
          idx_tup_read as rows_read,
          idx_tup_fetch as rows_fetched
        FROM pg_stat_user_indexes
        WHERE relname = ${tableName}
        ORDER BY idx_scan DESC
      `;
      return result as any[];
    });
  }

  /**
   * Get table statistics
   */
  async getTableStats(tableName: string): Promise<any> {
    return this.executeWithTiming('getTableStats', async () => {
      const result = await this.prisma.$queryRaw`
        SELECT
          relname as table_name,
          n_live_tup as row_count,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        WHERE relname = ${tableName}
      `;
      return (result as any[])[0];
    });
  }

  // ==========================================================================
  // Connection Pool Management
  // ==========================================================================

  /**
   * Get connection pool statistics
   */
  async getConnectionPoolStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
  }> {
    return this.executeWithTiming('getConnectionPoolStats', async () => {
      const result = await this.prisma.$queryRaw`
        SELECT
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting_requests
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;

      const stats = (result as any[])[0];
      return {
        activeConnections: Number(stats.active_connections),
        idleConnections: Number(stats.idle_connections),
        waitingRequests: Number(stats.waiting_requests),
      };
    });
  }

  /**
   * Check for long-running queries
   */
  async getLongRunningQueries(thresholdMs: number = 5000): Promise<any[]> {
    return this.executeWithTiming('getLongRunningQueries', async () => {
      const result = await this.prisma.$queryRaw`
        SELECT
          pid,
          now() - pg_stat_activity.query_start AS duration,
          query,
          state
        FROM pg_stat_activity
        WHERE (now() - pg_stat_activity.query_start) > interval '${thresholdMs} milliseconds'
          AND state != 'idle'
          AND datname = current_database()
        ORDER BY duration DESC
      `;
      return result as any[];
    });
  }
}

/**
 * Create query optimizer instance
 */
export function createQueryOptimizer(
  config: QueryOptimizerConfig
): QueryOptimizer {
  return new QueryOptimizer(config);
}

export default QueryOptimizer;
