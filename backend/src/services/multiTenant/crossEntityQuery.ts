/**
 * Cross-Entity Query Service
 * SCALE Tier - Tasks T026-T029
 *
 * Enables authorized cross-entity queries and reporting for executives
 */

import { PrismaClient } from '@prisma/client';
import {
  EntityAnalytics,
  CrossEntityAggregation,
} from '@foundry/shared/types/entity';
import { AppError } from '../../lib/errors/AppError';

export interface CrossEntityQueryConfig {
  prisma: PrismaClient;
}

export interface CrossEntityQueryOptions {
  entityIds: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ComparisonMetric {
  entityId: string;
  entityName: string;
  value: number;
  percentile?: number;
  trend?: number;
}

export class CrossEntityQueryService {
  private prisma: PrismaClient;

  constructor(config: CrossEntityQueryConfig) {
    this.prisma = config.prisma;
  }

  // ==========================================================================
  // T027: Authorized Entity List Retrieval
  // ==========================================================================

  /**
   * Get list of entities user is authorized to query across
   */
  async getAuthorizedEntities(userId: string): Promise<string[]> {
    // Check if super admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role === 'OWNER') {
      // Super admins can query all active entities
      const entities = await this.prisma.entity.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      return entities.map(e => e.id);
    }

    // Get from permissions
    const permissions = await this.prisma.userEntityPermission.findMany({
      where: { userId, canRead: true },
      select: { entityId: true },
    });

    return permissions.map(p => p.entityId);
  }

  /**
   * Validate that user can query the specified entities
   */
  async validateEntityAccess(userId: string, entityIds: string[]): Promise<void> {
    const authorized = await this.getAuthorizedEntities(userId);
    const unauthorized = entityIds.filter(id => !authorized.includes(id));

    if (unauthorized.length > 0) {
      throw new AppError(
        'ACCESS_DENIED',
        `User not authorized to query entities: ${unauthorized.join(', ')}`
      );
    }
  }

  // ==========================================================================
  // T028: Cross-Entity Aggregation Queries
  // ==========================================================================

  /**
   * Get aggregated metrics across multiple entities
   */
  async getAggregatedMetrics(
    options: CrossEntityQueryOptions
  ): Promise<CrossEntityAggregation> {
    const { entityIds, dateFrom, dateTo } = options;

    // Get basic counts per entity
    const entityAnalytics = await Promise.all(
      entityIds.map(id => this.getEntityAnalytics(id, dateFrom, dateTo))
    );

    // Calculate aggregates
    const totalUsers = entityAnalytics.reduce((sum, e) => sum + e.metrics.userCount, 0);
    const totalDataSources = entityAnalytics.reduce(
      (sum, e) => sum + e.metrics.dataSourceCount,
      0
    );
    const totalProcesses = entityAnalytics.reduce(
      (sum, e) => sum + e.metrics.processCount,
      0
    );
    const avgComplianceScore =
      entityAnalytics.reduce((sum, e) => sum + e.metrics.complianceScore, 0) /
      entityAnalytics.length;

    const activeEntities = entityAnalytics.filter(
      e => new Date(e.lastActivityAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    return {
      totalEntities: entityIds.length,
      activeEntities,
      metrics: {
        totalUsers,
        totalDataSources,
        totalProcesses,
        averageComplianceScore: Math.round(avgComplianceScore * 100) / 100,
      },
      byEntity: entityAnalytics,
    };
  }

  /**
   * Get analytics for a single entity
   */
  async getEntityAnalytics(
    entityId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<EntityAnalytics> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, name: true },
    });

    if (!entity) {
      throw new AppError('ENTITY_NOT_FOUND', `Entity ${entityId} not found`);
    }

    // Set entity context for RLS
    await this.prisma.$executeRawUnsafe(`
      SELECT set_config('app.current_entity_id', $1, true);
      SELECT set_config('app.is_super_admin', 'true', true);
    `, entityId);

    // Get metrics (organizationId is used as tenant ID in existing tables)
    const [
      userCount,
      dataSourceCount,
      complianceScore,
      lastActivity,
    ] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: entityId } }),
      this.prisma.dataSource.count({ where: { organizationId: entityId } }),
      this.getComplianceScore(entityId),
      this.getLastActivity(entityId),
    ]);

    // Process count would come from Neo4j in production
    const processCount = 0;

    // Calculate trends (comparing to previous period)
    const previousPeriodDays = dateTo && dateFrom
      ? Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000))
      : 30;

    const trends = await this.calculateTrends(entityId, previousPeriodDays);

    return {
      entityId,
      entityName: entity.name,
      metrics: {
        userCount,
        dataSourceCount,
        processCount,
        activeAlertCount: 0,
        complianceScore,
      },
      trends,
      lastActivityAt: lastActivity,
    };
  }

  /**
   * Get compliance score for entity
   */
  private async getComplianceScore(entityId: string): Promise<number> {
    const rules = await this.prisma.complianceRule.findMany({
      where: { organizationId: entityId, isActive: true },
      select: { passCount: true, failCount: true },
    });

    if (rules.length === 0) return 100;

    const totalPass = rules.reduce((sum, r) => sum + r.passCount, 0);
    const totalFail = rules.reduce((sum, r) => sum + r.failCount, 0);
    const total = totalPass + totalFail;

    if (total === 0) return 100;
    return Math.round((totalPass / total) * 100);
  }

  /**
   * Get last activity timestamp for entity
   */
  private async getLastActivity(entityId: string): Promise<Date> {
    const lastAuditLog = await this.prisma.auditLog.findFirst({
      where: { organizationId: entityId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return lastAuditLog?.createdAt || new Date();
  }

  /**
   * Calculate growth trends
   */
  private async calculateTrends(
    entityId: string,
    periodDays: number
  ): Promise<{ userGrowth: number; dataSourceGrowth: number; processGrowth: number }> {
    const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Users added in period
    const newUsers = await this.prisma.user.count({
      where: {
        organizationId: entityId,
        createdAt: { gte: cutoffDate },
      },
    });

    const totalUsers = await this.prisma.user.count({
      where: { organizationId: entityId },
    });

    // Data sources added in period
    const newDataSources = await this.prisma.dataSource.count({
      where: {
        organizationId: entityId,
        createdAt: { gte: cutoffDate },
      },
    });

    const totalDataSources = await this.prisma.dataSource.count({
      where: { organizationId: entityId },
    });

    return {
      userGrowth: totalUsers > 0 ? Math.round((newUsers / totalUsers) * 100) : 0,
      dataSourceGrowth:
        totalDataSources > 0
          ? Math.round((newDataSources / totalDataSources) * 100)
          : 0,
      processGrowth: 0, // Would come from Neo4j
    };
  }

  /**
   * Compare metric across entities
   */
  async compareMetric(
    entityIds: string[],
    metricName: 'users' | 'dataSources' | 'compliance' | 'activity'
  ): Promise<ComparisonMetric[]> {
    const results = await Promise.all(
      entityIds.map(async entityId => {
        const entity = await this.prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true },
        });

        if (!entity) return null;

        let value = 0;
        switch (metricName) {
          case 'users':
            value = await this.prisma.user.count({
              where: { organizationId: entityId },
            });
            break;
          case 'dataSources':
            value = await this.prisma.dataSource.count({
              where: { organizationId: entityId },
            });
            break;
          case 'compliance':
            value = await this.getComplianceScore(entityId);
            break;
          case 'activity': {
            const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            value = await this.prisma.auditLog.count({
              where: {
                organizationId: entityId,
                createdAt: { gte: lastWeek },
              },
            });
            break;
          }
        }

        return {
          entityId,
          entityName: entity.name,
          value,
        };
      })
    );

    const validResults = results.filter(Boolean) as ComparisonMetric[];

    // Calculate percentiles
    const sortedValues = [...validResults].sort((a, b) => a.value - b.value);
    validResults.forEach(result => {
      const rank =
        sortedValues.findIndex(s => s.entityId === result.entityId) + 1;
      result.percentile = Math.round((rank / validResults.length) * 100);
    });

    return validResults;
  }

  // ==========================================================================
  // T029: Cross-Entity Reporting
  // ==========================================================================

  /**
   * Generate executive summary report across entities
   */
  async generateExecutiveSummary(
    entityIds: string[],
    options?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<{
    generatedAt: Date;
    period: { from: Date; to: Date };
    summary: CrossEntityAggregation;
    highlights: Array<{
      type: 'positive' | 'negative' | 'neutral';
      message: string;
      entityId?: string;
    }>;
    recommendations: string[];
  }> {
    const dateTo = options?.dateTo || new Date();
    const dateFrom =
      options?.dateFrom || new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const summary = await this.getAggregatedMetrics({
      entityIds,
      dateFrom,
      dateTo,
    });

    const highlights = this.generateHighlights(summary);
    const recommendations = this.generateRecommendations(summary);

    return {
      generatedAt: new Date(),
      period: { from: dateFrom, to: dateTo },
      summary,
      highlights,
      recommendations,
    };
  }

  /**
   * Generate highlights from aggregated data
   */
  private generateHighlights(summary: CrossEntityAggregation): Array<{
    type: 'positive' | 'negative' | 'neutral';
    message: string;
    entityId?: string;
  }> {
    const highlights: Array<{
      type: 'positive' | 'negative' | 'neutral';
      message: string;
      entityId?: string;
    }> = [];

    // Find top performer
    if (summary.byEntity.length > 0) {
      const topByCompliance = [...summary.byEntity].sort(
        (a, b) => b.metrics.complianceScore - a.metrics.complianceScore
      )[0];

      if (topByCompliance.metrics.complianceScore >= 90) {
        highlights.push({
          type: 'positive',
          message: `${topByCompliance.entityName} has excellent compliance score of ${topByCompliance.metrics.complianceScore}%`,
          entityId: topByCompliance.entityId,
        });
      }

      // Find entities needing attention
      const lowCompliance = summary.byEntity.filter(
        e => e.metrics.complianceScore < 70
      );
      if (lowCompliance.length > 0) {
        highlights.push({
          type: 'negative',
          message: `${lowCompliance.length} entities have compliance scores below 70%`,
        });
      }

      // Find high growth
      const highGrowth = summary.byEntity.filter(e => e.trends.userGrowth > 20);
      if (highGrowth.length > 0) {
        highlights.push({
          type: 'positive',
          message: `${highGrowth.length} entities showing strong user growth (>20%)`,
        });
      }

      // Inactive entities
      const inactive = summary.totalEntities - summary.activeEntities;
      if (inactive > 0) {
        highlights.push({
          type: 'neutral',
          message: `${inactive} entities have had no activity in the past week`,
        });
      }
    }

    return highlights;
  }

  /**
   * Generate recommendations based on data
   */
  private generateRecommendations(summary: CrossEntityAggregation): string[] {
    const recommendations: string[] = [];

    if (summary.metrics.averageComplianceScore < 80) {
      recommendations.push(
        'Consider implementing automated compliance monitoring across all entities'
      );
    }

    const lowDataSourceEntities = summary.byEntity.filter(
      e => e.metrics.dataSourceCount < 2
    );
    if (lowDataSourceEntities.length > 0) {
      recommendations.push(
        `${lowDataSourceEntities.length} entities have limited data integrations - recommend enabling additional connectors`
      );
    }

    if (summary.activeEntities < summary.totalEntities * 0.8) {
      recommendations.push(
        'Some entities show low activity - consider user engagement initiatives'
      );
    }

    return recommendations;
  }

  /**
   * Export cross-entity report as structured data
   */
  async exportReport(
    entityIds: string[],
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const data = await this.getAggregatedMetrics({ entityIds });

    if (format === 'csv') {
      const headers = [
        'Entity ID',
        'Entity Name',
        'Users',
        'Data Sources',
        'Processes',
        'Compliance Score',
        'User Growth %',
        'Last Activity',
      ];

      const rows = data.byEntity.map(e => [
        e.entityId,
        e.entityName,
        e.metrics.userCount,
        e.metrics.dataSourceCount,
        e.metrics.processCount,
        e.metrics.complianceScore,
        e.trends.userGrowth,
        e.lastActivityAt.toISOString(),
      ]);

      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    return JSON.stringify(data, null, 2);
  }
}
