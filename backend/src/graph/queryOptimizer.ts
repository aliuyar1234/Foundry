/**
 * Neo4j Query Optimizer
 * T355 - Optimize Neo4j queries for entity-scoped operations
 *
 * Provides optimized Cypher queries and patterns for multi-tenant
 * entity-scoped graph operations.
 */

import { Driver, Session, QueryResult } from 'neo4j-driver';

export interface Neo4jQueryOptimizerConfig {
  driver: Driver;
  database?: string;
  enableQueryLogging?: boolean;
  slowQueryThresholdMs?: number;
}

export interface QueryTiming {
  query: string;
  parameters: Record<string, any>;
  durationMs: number;
  timestamp: Date;
}

export interface QueryStats {
  totalQueries: number;
  avgDurationMs: number;
  slowQueries: number;
  entityScoped: number;
}

/**
 * Neo4j Query Optimizer for entity-scoped operations
 */
export class Neo4jQueryOptimizer {
  private driver: Driver;
  private database?: string;
  private enableQueryLogging: boolean;
  private slowQueryThresholdMs: number;
  private queryTimings: QueryTiming[] = [];
  private maxTimingHistory = 1000;
  private entityScopedCount = 0;

  constructor(config: Neo4jQueryOptimizerConfig) {
    this.driver = config.driver;
    this.database = config.database;
    this.enableQueryLogging = config.enableQueryLogging ?? false;
    this.slowQueryThresholdMs = config.slowQueryThresholdMs ?? 100;
  }

  /**
   * Get a session for the configured database
   */
  private getSession(): Session {
    return this.driver.session({
      database: this.database,
      defaultAccessMode: 'READ',
    });
  }

  /**
   * Get a write session for the configured database
   */
  private getWriteSession(): Session {
    return this.driver.session({
      database: this.database,
      defaultAccessMode: 'WRITE',
    });
  }

  /**
   * Execute query with timing and logging
   */
  async executeWithTiming<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    isEntityScoped: boolean = false
  ): Promise<T> {
    const start = Date.now();

    try {
      const result = await queryFn();
      const duration = Date.now() - start;

      if (this.enableQueryLogging) {
        this.logQueryTiming(queryName, {}, duration);
      }

      if (isEntityScoped) {
        this.entityScopedCount++;
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logQueryTiming(`${queryName} (ERROR)`, {}, duration);
      throw error;
    }
  }

  /**
   * Log query timing
   */
  private logQueryTiming(
    query: string,
    parameters: Record<string, any>,
    durationMs: number
  ): void {
    this.queryTimings.push({
      query,
      parameters,
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
        `[SLOW NEO4J QUERY] ${query}: ${durationMs}ms (threshold: ${this.slowQueryThresholdMs}ms)`
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
      entityScoped: this.entityScopedCount,
    };
  }

  /**
   * Reset query statistics
   */
  resetQueryStats(): void {
    this.queryTimings = [];
    this.entityScopedCount = 0;
  }

  // ==========================================================================
  // Entity-Scoped Node Operations
  // ==========================================================================

  /**
   * Find nodes by entity with optimized query pattern
   * Uses entityId index for efficient filtering
   */
  async findNodesByEntity(
    entityId: string,
    nodeLabel: string,
    options?: {
      limit?: number;
      skip?: number;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
      properties?: Record<string, any>;
    }
  ): Promise<any[]> {
    const session = this.getSession();
    const {
      limit = 100,
      skip = 0,
      orderBy = 'createdAt',
      orderDirection = 'DESC',
      properties = {},
    } = options || {};

    try {
      return await this.executeWithTiming(
        'findNodesByEntity',
        async () => {
          // Build property filter clause
          const propFilters = Object.entries(properties)
            .map(([key, _], index) => `n.${key} = $prop${index}`)
            .join(' AND ');

          const propParams = Object.fromEntries(
            Object.entries(properties).map(([_, value], index) => [`prop${index}`, value])
          );

          const query = `
            MATCH (n:${nodeLabel})
            WHERE n.entityId = $entityId
            ${propFilters ? `AND ${propFilters}` : ''}
            RETURN n
            ORDER BY n.${orderBy} ${orderDirection}
            SKIP $skip
            LIMIT $limit
          `;

          const result = await session.run(query, {
            entityId,
            skip: Number(skip),
            limit: Number(limit),
            ...propParams,
          });

          return result.records.map((record) => record.get('n').properties);
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Count nodes by entity with index hint
   */
  async countNodesByEntity(
    entityId: string,
    nodeLabel: string,
    properties?: Record<string, any>
  ): Promise<number> {
    const session = this.getSession();

    try {
      return await this.executeWithTiming(
        'countNodesByEntity',
        async () => {
          const propFilters = properties
            ? Object.entries(properties)
                .map(([key, _], index) => `n.${key} = $prop${index}`)
                .join(' AND ')
            : '';

          const propParams = properties
            ? Object.fromEntries(
                Object.entries(properties).map(([_, value], index) => [`prop${index}`, value])
              )
            : {};

          const query = `
            MATCH (n:${nodeLabel})
            WHERE n.entityId = $entityId
            ${propFilters ? `AND ${propFilters}` : ''}
            RETURN count(n) as count
          `;

          const result = await session.run(query, {
            entityId,
            ...propParams,
          });

          return result.records[0]?.get('count')?.toNumber() || 0;
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Optimized Relationship Queries
  // ==========================================================================

  /**
   * Find relationships between nodes within same entity
   * Uses composite index on entityId + relationship type
   */
  async findRelationshipsInEntity(
    entityId: string,
    sourceLabel: string,
    relationType: string,
    targetLabel: string,
    options?: {
      limit?: number;
      skip?: number;
      direction?: 'OUT' | 'IN' | 'BOTH';
    }
  ): Promise<Array<{ source: any; relationship: any; target: any }>> {
    const session = this.getSession();
    const { limit = 100, skip = 0, direction = 'OUT' } = options || {};

    try {
      return await this.executeWithTiming(
        'findRelationshipsInEntity',
        async () => {
          let relPattern: string;
          switch (direction) {
            case 'IN':
              relPattern = `<-[r:${relationType}]-`;
              break;
            case 'BOTH':
              relPattern = `-[r:${relationType}]-`;
              break;
            default:
              relPattern = `-[r:${relationType}]->`;
          }

          const query = `
            MATCH (source:${sourceLabel})${relPattern}(target:${targetLabel})
            WHERE source.entityId = $entityId AND target.entityId = $entityId
            RETURN source, r, target
            SKIP $skip
            LIMIT $limit
          `;

          const result = await session.run(query, {
            entityId,
            skip: Number(skip),
            limit: Number(limit),
          });

          return result.records.map((record) => ({
            source: record.get('source').properties,
            relationship: record.get('r').properties,
            target: record.get('target').properties,
          }));
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Find shortest path between two nodes in same entity
   */
  async findShortestPathInEntity(
    entityId: string,
    startNodeId: string,
    endNodeId: string,
    options?: {
      maxDepth?: number;
      relationshipTypes?: string[];
    }
  ): Promise<any[] | null> {
    const session = this.getSession();
    const { maxDepth = 10, relationshipTypes = [] } = options || {};

    try {
      return await this.executeWithTiming(
        'findShortestPathInEntity',
        async () => {
          const relTypeFilter =
            relationshipTypes.length > 0
              ? `:${relationshipTypes.join('|')}`
              : '';

          const query = `
            MATCH (start), (end)
            WHERE start.id = $startNodeId AND start.entityId = $entityId
              AND end.id = $endNodeId AND end.entityId = $entityId
            MATCH p = shortestPath((start)-[${relTypeFilter}*..${maxDepth}]-(end))
            WHERE ALL(node IN nodes(p) WHERE node.entityId = $entityId)
            RETURN p
          `;

          const result = await session.run(query, {
            entityId,
            startNodeId,
            endNodeId,
          });

          if (result.records.length === 0) return null;

          const path = result.records[0].get('p');
          return path.segments.map((segment: any) => ({
            start: segment.start.properties,
            relationship: segment.relationship.properties,
            end: segment.end.properties,
          }));
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Optimized Aggregation Queries
  // ==========================================================================

  /**
   * Get aggregated metrics for entity
   */
  async getEntityMetrics(
    entityId: string,
    nodeLabels: string[]
  ): Promise<Record<string, number>> {
    const session = this.getSession();

    try {
      return await this.executeWithTiming(
        'getEntityMetrics',
        async () => {
          const metrics: Record<string, number> = {};

          // Use UNION for multiple label counts in single query
          const countQueries = nodeLabels.map(
            (label, index) => `
            MATCH (n${index}:${label})
            WHERE n${index}.entityId = $entityId
            RETURN '${label}' as label, count(n${index}) as count
          `
          );

          const query = countQueries.join(' UNION ALL ');

          const result = await session.run(query, { entityId });

          for (const record of result.records) {
            const label = record.get('label');
            const count = record.get('count').toNumber();
            metrics[label] = count;
          }

          return metrics;
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Get relationship statistics for entity
   */
  async getEntityRelationshipStats(
    entityId: string
  ): Promise<Array<{ type: string; count: number }>> {
    const session = this.getSession();

    try {
      return await this.executeWithTiming(
        'getEntityRelationshipStats',
        async () => {
          const query = `
            MATCH (n)-[r]-(m)
            WHERE n.entityId = $entityId AND m.entityId = $entityId
            RETURN type(r) as type, count(r) / 2 as count
            ORDER BY count DESC
          `;

          const result = await session.run(query, { entityId });

          return result.records.map((record) => ({
            type: record.get('type'),
            count: record.get('count').toNumber(),
          }));
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Cross-Entity Query Protection
  // ==========================================================================

  /**
   * Validate that all node IDs belong to the specified entity
   */
  async validateEntityOwnership(
    entityId: string,
    nodeIds: string[]
  ): Promise<{ valid: boolean; invalidIds: string[] }> {
    const session = this.getSession();

    try {
      return await this.executeWithTiming(
        'validateEntityOwnership',
        async () => {
          const query = `
            UNWIND $nodeIds as nodeId
            MATCH (n)
            WHERE n.id = nodeId
            RETURN n.id as id, n.entityId as entityId
          `;

          const result = await session.run(query, { nodeIds });

          const invalidIds: string[] = [];
          for (const record of result.records) {
            const nodeEntityId = record.get('entityId');
            if (nodeEntityId !== entityId) {
              invalidIds.push(record.get('id'));
            }
          }

          return {
            valid: invalidIds.length === 0,
            invalidIds,
          };
        },
        true
      );
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Index Management
  // ==========================================================================

  /**
   * Ensure entity indexes exist for all node types
   */
  async ensureEntityIndexes(nodeLabels: string[]): Promise<void> {
    const session = this.getWriteSession();

    try {
      await this.executeWithTiming('ensureEntityIndexes', async () => {
        for (const label of nodeLabels) {
          // Create entityId index if not exists
          const indexName = `idx_${label.toLowerCase()}_entityId`;

          try {
            await session.run(`
              CREATE INDEX ${indexName} IF NOT EXISTS
              FOR (n:${label})
              ON (n.entityId)
            `);
          } catch (error: any) {
            // Index might already exist with different name
            if (!error.message?.includes('already exists')) {
              throw error;
            }
          }

          // Create composite index for common query patterns
          const compositeIndexName = `idx_${label.toLowerCase()}_entity_created`;

          try {
            await session.run(`
              CREATE INDEX ${compositeIndexName} IF NOT EXISTS
              FOR (n:${label})
              ON (n.entityId, n.createdAt)
            `);
          } catch (error: any) {
            if (!error.message?.includes('already exists')) {
              throw error;
            }
          }
        }
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<Array<{ name: string; state: string; populationPercent: number }>> {
    const session = this.getSession();

    try {
      return await this.executeWithTiming('getIndexStats', async () => {
        const result = await session.run(`
          SHOW INDEXES
          YIELD name, state, populationPercent
          RETURN name, state, populationPercent
          ORDER BY name
        `);

        return result.records.map((record) => ({
          name: record.get('name'),
          state: record.get('state'),
          populationPercent: record.get('populationPercent'),
        }));
      });
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Query Plan Analysis
  // ==========================================================================

  /**
   * Explain query execution plan
   */
  async explainQuery(
    query: string,
    parameters: Record<string, any> = {}
  ): Promise<any> {
    const session = this.getSession();

    try {
      const result = await session.run(`EXPLAIN ${query}`, parameters);
      return result.summary.plan;
    } finally {
      await session.close();
    }
  }

  /**
   * Profile query execution
   */
  async profileQuery(
    query: string,
    parameters: Record<string, any> = {}
  ): Promise<{ plan: any; dbHits: number; rows: number }> {
    const session = this.getSession();

    try {
      const result = await session.run(`PROFILE ${query}`, parameters);
      const profile = result.summary.profile;

      return {
        plan: profile,
        dbHits: profile?.dbHits || 0,
        rows: profile?.rows || 0,
      };
    } finally {
      await session.close();
    }
  }
}

/**
 * Create Neo4j query optimizer instance
 */
export function createNeo4jQueryOptimizer(
  config: Neo4jQueryOptimizerConfig
): Neo4jQueryOptimizer {
  return new Neo4jQueryOptimizer(config);
}

export default Neo4jQueryOptimizer;
