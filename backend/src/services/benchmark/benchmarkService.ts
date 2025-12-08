// =============================================================================
// Benchmark Service
// SCALE Tier - Task T219-T225
//
// Main service for cross-company benchmarking with opt-in management
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { AggregatorService, BenchmarkResult, MetricComparison, SegmentCriteria } from './aggregator';
import { AnonymizerService } from './anonymizer';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BenchmarkOptInRequest {
  entityId: string;
  segments: SegmentCriteria[];
  consentDetails: {
    acceptedTerms: boolean;
    acceptedPrivacyPolicy: boolean;
    consentTimestamp: Date;
    consentVersion: string;
    ipAddress?: string;
  };
}

export interface BenchmarkOptInStatus {
  entityId: string;
  optedIn: boolean;
  segments: Array<{
    segmentId: string;
    industry: string;
    companySize: string;
    region: string;
    active: boolean;
    optedInAt: Date;
  }>;
  consentDetails?: {
    consentTimestamp: Date;
    consentVersion: string;
  };
}

export interface BenchmarkDashboard {
  eligibleSegments: Array<{
    id: string;
    name: string;
    participantCount: number;
    lastUpdated: Date;
  }>;
  yourPerformance: MetricComparison[];
  industryTrends: IndustryTrend[];
  recommendations: BenchmarkRecommendation[];
}

export interface IndustryTrend {
  metricName: string;
  direction: 'improving' | 'declining' | 'stable';
  changePercent: number;
  period: string;
}

export interface BenchmarkRecommendation {
  priority: 'high' | 'medium' | 'low';
  metric: string;
  currentValue: number;
  targetValue: number;
  improvement: string;
  impact: string;
}

// -----------------------------------------------------------------------------
// Benchmark Service
// -----------------------------------------------------------------------------

export class BenchmarkService {
  private prisma: PrismaClient;
  private aggregator: AggregatorService;
  private anonymizer: AnonymizerService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.aggregator = new AggregatorService(prisma);
    this.anonymizer = new AnonymizerService(prisma);
  }

  // ---------------------------------------------------------------------------
  // Opt-In Management
  // ---------------------------------------------------------------------------

  async optIn(request: BenchmarkOptInRequest): Promise<BenchmarkOptInStatus> {
    const { entityId, segments, consentDetails } = request;

    // Validate consent
    if (!consentDetails.acceptedTerms || !consentDetails.acceptedPrivacyPolicy) {
      throw new Error('User must accept terms and privacy policy');
    }

    // Store consent record
    await this.prisma.benchmarkConsent.create({
      data: {
        entityId,
        consentTimestamp: consentDetails.consentTimestamp,
        consentVersion: consentDetails.consentVersion,
        termsAccepted: consentDetails.acceptedTerms,
        privacyAccepted: consentDetails.acceptedPrivacyPolicy,
        ipAddress: consentDetails.ipAddress,
      },
    });

    // Create opt-ins for each segment
    for (const criteria of segments) {
      const segmentId = await this.aggregator.getOrCreateSegment(criteria);

      await this.prisma.benchmarkOptIn.upsert({
        where: {
          entityId_segmentId: { entityId, segmentId },
        },
        update: {
          active: true,
          optedInAt: new Date(),
        },
        create: {
          entityId,
          segmentId,
          active: true,
          optedInAt: new Date(),
        },
      });
    }

    // Update entity's benchmark opt-in flag
    await this.prisma.entity.update({
      where: { id: entityId },
      data: { benchmarkOptIn: true },
    });

    return this.getOptInStatus(entityId);
  }

  async optOut(entityId: string): Promise<void> {
    // Deactivate all opt-ins
    await this.prisma.benchmarkOptIn.updateMany({
      where: { entityId },
      data: { active: false },
    });

    // Update entity flag
    await this.prisma.entity.update({
      where: { id: entityId },
      data: { benchmarkOptIn: false },
    });

    // Record opt-out in consent log
    await this.prisma.benchmarkConsent.create({
      data: {
        entityId,
        consentTimestamp: new Date(),
        consentVersion: 'opt-out',
        termsAccepted: false,
        privacyAccepted: false,
        optedOut: true,
      },
    });
  }

  async getOptInStatus(entityId: string): Promise<BenchmarkOptInStatus> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { benchmarkOptIn: true },
    });

    const optIns = await this.prisma.benchmarkOptIn.findMany({
      where: { entityId },
      include: {
        segment: true,
      },
    });

    const latestConsent = await this.prisma.benchmarkConsent.findFirst({
      where: { entityId, optedOut: { not: true } },
      orderBy: { consentTimestamp: 'desc' },
    });

    return {
      entityId,
      optedIn: entity?.benchmarkOptIn ?? false,
      segments: optIns.map((o) => ({
        segmentId: o.segmentId,
        industry: o.segment.industry,
        companySize: o.segment.companySize,
        region: o.segment.region,
        active: o.active,
        optedInAt: o.optedInAt,
      })),
      consentDetails: latestConsent
        ? {
            consentTimestamp: latestConsent.consentTimestamp,
            consentVersion: latestConsent.consentVersion,
          }
        : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Benchmark Data Access
  // ---------------------------------------------------------------------------

  async getBenchmarkForSegment(segmentId: string): Promise<BenchmarkResult | null> {
    // Check if segment has enough participants
    const segment = await this.prisma.benchmarkSegment.findUnique({
      where: { id: segmentId },
      include: {
        _count: {
          select: {
            optIns: { where: { active: true } },
          },
        },
      },
    });

    if (!segment || segment._count.optIns < 10) {
      return null;
    }

    // Try to get cached result
    const cached = await this.prisma.benchmarkResult.findUnique({
      where: { segmentId },
    });

    // If cache is fresh (< 24 hours), return it
    if (
      cached &&
      Date.now() - cached.generatedAt.getTime() < 24 * 60 * 60 * 1000
    ) {
      return {
        segmentId: cached.segmentId,
        industry: segment.industry,
        companySize: segment.companySize,
        region: segment.region,
        processType: segment.processType,
        metrics: cached.metrics as unknown as BenchmarkResult['metrics'],
        comparisons: [],
        participantCount: cached.participantCount,
        generatedAt: cached.generatedAt,
      };
    }

    // Generate fresh data
    return this.aggregator.aggregateSegment(segmentId);
  }

  async getComparisonForEntity(
    entityId: string,
    segmentId: string
  ): Promise<MetricComparison[]> {
    // Verify entity is opted in
    const optIn = await this.prisma.benchmarkOptIn.findUnique({
      where: {
        entityId_segmentId: { entityId, segmentId },
      },
    });

    if (!optIn || !optIn.active) {
      throw new Error('Entity must be opted in to view comparisons');
    }

    return this.aggregator.compareToSegment(entityId, segmentId);
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async getDashboard(entityId: string): Promise<BenchmarkDashboard> {
    // Get entity's opt-ins
    const optIns = await this.prisma.benchmarkOptIn.findMany({
      where: { entityId, active: true },
      include: {
        segment: {
          include: {
            _count: {
              select: {
                optIns: { where: { active: true } },
              },
            },
          },
        },
      },
    });

    // Get eligible segments
    const eligibleSegments = optIns
      .filter((o) => o.segment._count.optIns >= 10)
      .map((o) => ({
        id: o.segmentId,
        name: this.formatSegmentName(o.segment),
        participantCount: o.segment._count.optIns,
        lastUpdated: o.segment.updatedAt,
      }));

    // Get performance comparison for primary segment
    let yourPerformance: MetricComparison[] = [];
    if (eligibleSegments.length > 0) {
      yourPerformance = await this.getComparisonForEntity(
        entityId,
        eligibleSegments[0].id
      );
    }

    // Get industry trends (mock for now, would need historical data)
    const industryTrends = await this.calculateIndustryTrends(
      eligibleSegments[0]?.id
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(yourPerformance);

    return {
      eligibleSegments,
      yourPerformance,
      industryTrends,
      recommendations,
    };
  }

  private formatSegmentName(segment: {
    industry: string;
    companySize: string;
    region: string;
  }): string {
    const parts = [];

    if (segment.industry !== 'ALL') {
      parts.push(segment.industry);
    }

    if (segment.companySize !== 'ALL') {
      parts.push(segment.companySize);
    }

    if (segment.region !== 'ALL') {
      parts.push(segment.region);
    }

    return parts.length > 0 ? parts.join(' / ') : 'Global';
  }

  private async calculateIndustryTrends(
    segmentId?: string
  ): Promise<IndustryTrend[]> {
    if (!segmentId) {
      return [];
    }

    // In production, this would analyze historical benchmark data
    // For now, return placeholder trends
    return [
      {
        metricName: 'Automation Rate',
        direction: 'improving',
        changePercent: 8.5,
        period: 'Last 6 months',
      },
      {
        metricName: 'Cycle Time',
        direction: 'improving',
        changePercent: -12.3,
        period: 'Last 6 months',
      },
      {
        metricName: 'Error Rate',
        direction: 'stable',
        changePercent: 0.5,
        period: 'Last 6 months',
      },
    ];
  }

  private generateRecommendations(
    comparisons: MetricComparison[]
  ): BenchmarkRecommendation[] {
    const recommendations: BenchmarkRecommendation[] = [];

    for (const comparison of comparisons) {
      if (comparison.status === 'below') {
        const targetValue = comparison.benchmarkMedian;
        const improvement = `Improve ${comparison.metricName.toLowerCase()} from ${comparison.yourValue} to ${targetValue}`;

        let priority: 'high' | 'medium' | 'low';
        let impact: string;

        if (Math.abs(comparison.differencePercent) > 30) {
          priority = 'high';
          impact = 'Significant improvement potential';
        } else if (Math.abs(comparison.differencePercent) > 15) {
          priority = 'medium';
          impact = 'Moderate improvement potential';
        } else {
          priority = 'low';
          impact = 'Minor improvement potential';
        }

        recommendations.push({
          priority,
          metric: comparison.metricName,
          currentValue: comparison.yourValue,
          targetValue,
          improvement,
          impact,
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  // ---------------------------------------------------------------------------
  // Available Segments
  // ---------------------------------------------------------------------------

  async getAvailableSegments(): Promise<
    Array<{
      id: string;
      industry: string;
      companySize: string;
      region: string;
      participantCount: number;
      eligible: boolean;
    }>
  > {
    const segments = await this.prisma.benchmarkSegment.findMany({
      include: {
        _count: {
          select: {
            optIns: { where: { active: true } },
          },
        },
      },
    });

    return segments.map((s) => ({
      id: s.id,
      industry: s.industry,
      companySize: s.companySize,
      region: s.region,
      participantCount: s._count.optIns,
      eligible: s._count.optIns >= 10,
    }));
  }

  // ---------------------------------------------------------------------------
  // Data Export (for GDPR compliance)
  // ---------------------------------------------------------------------------

  async exportEntityData(entityId: string): Promise<{
    optIns: unknown[];
    consentRecords: unknown[];
    benchmarkData: unknown[];
  }> {
    const optIns = await this.prisma.benchmarkOptIn.findMany({
      where: { entityId },
    });

    const consentRecords = await this.prisma.benchmarkConsent.findMany({
      where: { entityId },
    });

    return {
      optIns,
      consentRecords,
      benchmarkData: [], // We don't store individual entity data in benchmarks
    };
  }

  async deleteEntityData(entityId: string): Promise<void> {
    // Remove from opt-ins
    await this.prisma.benchmarkOptIn.deleteMany({
      where: { entityId },
    });

    // Keep consent records for audit trail but anonymize
    await this.prisma.benchmarkConsent.updateMany({
      where: { entityId },
      data: {
        ipAddress: null,
        entityId: `deleted_${Date.now()}`,
      },
    });

    // Update entity flag
    await this.prisma.entity.update({
      where: { id: entityId },
      data: { benchmarkOptIn: false },
    });
  }
}
