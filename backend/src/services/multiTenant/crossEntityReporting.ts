/**
 * Cross-Entity Reporting Service
 * SCALE Tier - Task T029
 *
 * Advanced reporting capabilities across multiple entities
 */

import { PrismaClient } from '@prisma/client';
import { CrossEntityQueryService } from './crossEntityQuery';

export interface CrossEntityReportingConfig {
  prisma: PrismaClient;
}

export interface ReportSchedule {
  id: string;
  name: string;
  entityIds: string[];
  reportType: ReportType;
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  lastRunAt?: Date;
  nextRunAt: Date;
  isActive: boolean;
}

export type ReportType =
  | 'executive_summary'
  | 'compliance_overview'
  | 'activity_report'
  | 'growth_analysis'
  | 'benchmark_comparison';

export interface ReportOutput {
  reportId: string;
  reportType: ReportType;
  generatedAt: Date;
  entityIds: string[];
  data: Record<string, unknown>;
  format: 'json' | 'html' | 'pdf';
}

export class CrossEntityReportingService {
  private prisma: PrismaClient;
  private queryService: CrossEntityQueryService;

  constructor(config: CrossEntityReportingConfig) {
    this.prisma = config.prisma;
    this.queryService = new CrossEntityQueryService({ prisma: config.prisma });
  }

  /**
   * Generate a report based on type
   */
  async generateReport(
    entityIds: string[],
    reportType: ReportType,
    options?: {
      dateFrom?: Date;
      dateTo?: Date;
      format?: 'json' | 'html' | 'pdf';
    }
  ): Promise<ReportOutput> {
    const reportId = `report_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const format = options?.format || 'json';

    let data: Record<string, unknown>;

    switch (reportType) {
      case 'executive_summary':
        data = await this.generateExecutiveSummaryReport(entityIds, options);
        break;
      case 'compliance_overview':
        data = await this.generateComplianceReport(entityIds, options);
        break;
      case 'activity_report':
        data = await this.generateActivityReport(entityIds, options);
        break;
      case 'growth_analysis':
        data = await this.generateGrowthReport(entityIds, options);
        break;
      case 'benchmark_comparison':
        data = await this.generateBenchmarkReport(entityIds, options);
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    return {
      reportId,
      reportType,
      generatedAt: new Date(),
      entityIds,
      data,
      format,
    };
  }

  /**
   * Executive summary report
   */
  private async generateExecutiveSummaryReport(
    entityIds: string[],
    options?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<Record<string, unknown>> {
    const summary = await this.queryService.generateExecutiveSummary(
      entityIds,
      options
    );

    return {
      title: 'Executive Summary Report',
      ...summary,
    };
  }

  /**
   * Compliance overview report
   */
  private async generateComplianceReport(
    entityIds: string[],
    options?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<Record<string, unknown>> {
    const complianceData = await Promise.all(
      entityIds.map(async entityId => {
        const entity = await this.prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true },
        });

        const rules = await this.prisma.complianceRule.findMany({
          where: { organizationId: entityId, isActive: true },
          select: {
            id: true,
            name: true,
            framework: true,
            severity: true,
            passCount: true,
            failCount: true,
          },
        });

        const violations = await this.prisma.complianceViolation.findMany({
          where: {
            organizationId: entityId,
            status: 'open',
          },
          select: {
            id: true,
            severity: true,
            description: true,
            detectedAt: true,
          },
        });

        const totalChecks = rules.reduce(
          (sum, r) => sum + r.passCount + r.failCount,
          0
        );
        const totalPass = rules.reduce((sum, r) => sum + r.passCount, 0);
        const score = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 100;

        return {
          entityId,
          entityName: entity?.name || entityId,
          score,
          ruleCount: rules.length,
          openViolations: violations.length,
          criticalViolations: violations.filter(v => v.severity === 'critical').length,
          byFramework: this.groupByKey(rules, 'framework'),
          recentViolations: violations.slice(0, 5),
        };
      })
    );

    const avgScore =
      complianceData.reduce((sum, c) => sum + c.score, 0) / complianceData.length;

    return {
      title: 'Compliance Overview Report',
      generatedAt: new Date(),
      summary: {
        averageComplianceScore: Math.round(avgScore),
        totalEntities: entityIds.length,
        entitiesAtRisk: complianceData.filter(c => c.score < 70).length,
        totalOpenViolations: complianceData.reduce(
          (sum, c) => sum + c.openViolations,
          0
        ),
      },
      byEntity: complianceData,
    };
  }

  /**
   * Activity report
   */
  private async generateActivityReport(
    entityIds: string[],
    options?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<Record<string, unknown>> {
    const dateFrom =
      options?.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = options?.dateTo || new Date();

    const activityData = await Promise.all(
      entityIds.map(async entityId => {
        const entity = await this.prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true },
        });

        const logs = await this.prisma.auditLog.findMany({
          where: {
            organizationId: entityId,
            createdAt: { gte: dateFrom, lte: dateTo },
          },
          select: {
            action: true,
            resourceType: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Group by day
        const byDay = logs.reduce(
          (acc, log) => {
            const day = log.createdAt.toISOString().split('T')[0];
            acc[day] = (acc[day] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        // Group by action
        const byAction = this.groupByKey(logs, 'action');

        return {
          entityId,
          entityName: entity?.name || entityId,
          totalActions: logs.length,
          uniqueDays: Object.keys(byDay).length,
          avgActionsPerDay:
            Object.keys(byDay).length > 0
              ? Math.round(logs.length / Object.keys(byDay).length)
              : 0,
          byDay,
          byAction,
        };
      })
    );

    return {
      title: 'Activity Report',
      period: { from: dateFrom, to: dateTo },
      generatedAt: new Date(),
      summary: {
        totalActions: activityData.reduce((sum, a) => sum + a.totalActions, 0),
        mostActiveEntity: [...activityData].sort(
          (a, b) => b.totalActions - a.totalActions
        )[0]?.entityName,
        leastActiveEntity: [...activityData].sort(
          (a, b) => a.totalActions - b.totalActions
        )[0]?.entityName,
      },
      byEntity: activityData,
    };
  }

  /**
   * Growth analysis report
   */
  private async generateGrowthReport(
    entityIds: string[],
    options?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<Record<string, unknown>> {
    const dateFrom =
      options?.dateFrom || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dateTo = options?.dateTo || new Date();

    const growthData = await Promise.all(
      entityIds.map(async entityId => {
        const entity = await this.prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true, createdAt: true },
        });

        // User growth
        const usersAtStart = await this.prisma.user.count({
          where: {
            organizationId: entityId,
            createdAt: { lt: dateFrom },
          },
        });

        const usersAtEnd = await this.prisma.user.count({
          where: {
            organizationId: entityId,
            createdAt: { lte: dateTo },
          },
        });

        const userGrowth =
          usersAtStart > 0
            ? Math.round(((usersAtEnd - usersAtStart) / usersAtStart) * 100)
            : usersAtEnd > 0
              ? 100
              : 0;

        // Data source growth
        const dsAtStart = await this.prisma.dataSource.count({
          where: {
            organizationId: entityId,
            createdAt: { lt: dateFrom },
          },
        });

        const dsAtEnd = await this.prisma.dataSource.count({
          where: {
            organizationId: entityId,
            createdAt: { lte: dateTo },
          },
        });

        const dsGrowth =
          dsAtStart > 0
            ? Math.round(((dsAtEnd - dsAtStart) / dsAtStart) * 100)
            : dsAtEnd > 0
              ? 100
              : 0;

        return {
          entityId,
          entityName: entity?.name || entityId,
          entityAge: entity
            ? Math.floor(
                (Date.now() - entity.createdAt.getTime()) / (24 * 60 * 60 * 1000)
              )
            : 0,
          users: {
            start: usersAtStart,
            end: usersAtEnd,
            growth: userGrowth,
          },
          dataSources: {
            start: dsAtStart,
            end: dsAtEnd,
            growth: dsGrowth,
          },
        };
      })
    );

    return {
      title: 'Growth Analysis Report',
      period: { from: dateFrom, to: dateTo },
      generatedAt: new Date(),
      summary: {
        avgUserGrowth:
          Math.round(
            growthData.reduce((sum, g) => sum + g.users.growth, 0) /
              growthData.length
          ) || 0,
        avgDataSourceGrowth:
          Math.round(
            growthData.reduce((sum, g) => sum + g.dataSources.growth, 0) /
              growthData.length
          ) || 0,
        fastestGrowing: [...growthData].sort(
          (a, b) => b.users.growth - a.users.growth
        )[0]?.entityName,
      },
      byEntity: growthData,
    };
  }

  /**
   * Benchmark comparison report
   */
  private async generateBenchmarkReport(
    entityIds: string[],
    _options?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<Record<string, unknown>> {
    const metrics = ['users', 'dataSources', 'compliance', 'activity'] as const;

    const benchmarks = await Promise.all(
      metrics.map(async metric => {
        const comparison = await this.queryService.compareMetric(entityIds, metric);
        return {
          metric,
          data: comparison,
          avg: Math.round(
            comparison.reduce((sum, c) => sum + c.value, 0) / comparison.length
          ),
          max: Math.max(...comparison.map(c => c.value)),
          min: Math.min(...comparison.map(c => c.value)),
        };
      })
    );

    return {
      title: 'Benchmark Comparison Report',
      generatedAt: new Date(),
      entityCount: entityIds.length,
      benchmarks,
    };
  }

  /**
   * Helper to group array by key
   */
  private groupByKey<T extends Record<string, unknown>>(
    arr: T[],
    key: keyof T
  ): Record<string, number> {
    return arr.reduce(
      (acc, item) => {
        const value = String(item[key]);
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Convert report to HTML format
   */
  formatAsHtml(report: ReportOutput): string {
    const { reportType, generatedAt, data } = report;

    return `
<!DOCTYPE html>
<html>
<head>
  <title>${data.title || reportType}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4a5568; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .summary { background: #f0f4f8; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 24px; font-weight: bold; color: #2d3748; }
    .metric-label { font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <h1>${data.title || reportType}</h1>
  <p>Generated: ${generatedAt.toISOString()}</p>
  <div class="summary">
    <h2>Summary</h2>
    ${this.renderSummaryHtml(data.summary as Record<string, unknown>)}
  </div>
  <h2>Details</h2>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>
    `.trim();
  }

  /**
   * Render summary as HTML
   */
  private renderSummaryHtml(summary: Record<string, unknown>): string {
    if (!summary) return '';

    return Object.entries(summary)
      .map(
        ([key, value]) => `
        <div class="metric">
          <div class="metric-value">${value}</div>
          <div class="metric-label">${this.formatLabel(key)}</div>
        </div>
      `
      )
      .join('');
  }

  /**
   * Format camelCase to Title Case
   */
  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}
