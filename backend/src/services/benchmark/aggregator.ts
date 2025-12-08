// =============================================================================
// Aggregator Service
// SCALE Tier - Task T210-T218
//
// Metric aggregation service for cross-company benchmarking
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { AnonymizerService, AnonymizedMetric, RawMetricData } from './anonymizer';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BenchmarkResult {
  segmentId: string;
  industry: string;
  companySize: string;
  region: string;
  processType: string;
  metrics: ProcessMetrics;
  comparisons: MetricComparison[];
  participantCount: number;
  generatedAt: Date;
}

export interface ProcessMetrics {
  cycleTime: AggregatedMetric;
  processingTime: AggregatedMetric;
  waitTime: AggregatedMetric;
  variantCount: AggregatedMetric;
  automationRate: AggregatedMetric;
  errorRate: AggregatedMetric;
  throughput: AggregatedMetric;
  costPerCase: AggregatedMetric;
}

export interface AggregatedMetric {
  avg: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  stddev: number;
  sampleSize: number;
  unit: string;
}

export interface MetricComparison {
  metricName: string;
  yourValue: number;
  benchmarkAvg: number;
  benchmarkMedian: number;
  percentile: number;
  status: 'above' | 'at' | 'below';
  difference: number;
  differencePercent: number;
}

export interface SegmentCriteria {
  industry?: string;
  companySize?: string;
  region?: string;
  processType?: string;
}

// -----------------------------------------------------------------------------
// Aggregator Service
// -----------------------------------------------------------------------------

export class AggregatorService {
  private prisma: PrismaClient;
  private anonymizer: AnonymizerService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.anonymizer = new AnonymizerService(prisma);
  }

  // ---------------------------------------------------------------------------
  // Segment Management
  // ---------------------------------------------------------------------------

  async getOrCreateSegment(criteria: SegmentCriteria): Promise<string> {
    const { industry, companySize, region, processType } = criteria;

    // Try to find existing segment
    const existing = await this.prisma.benchmarkSegment.findFirst({
      where: {
        industry: industry || 'ALL',
        companySize: companySize || 'ALL',
        region: region || 'ALL',
        processType: processType || 'ALL',
      },
    });

    if (existing) {
      return existing.id;
    }

    // Create new segment
    const segment = await this.prisma.benchmarkSegment.create({
      data: {
        industry: industry || 'ALL',
        companySize: companySize || 'ALL',
        region: region || 'ALL',
        processType: processType || 'ALL',
      },
    });

    return segment.id;
  }

  // ---------------------------------------------------------------------------
  // Data Collection
  // ---------------------------------------------------------------------------

  async collectSegmentData(segmentId: string): Promise<RawMetricData[]> {
    // Get opted-in entities for this segment
    const optIns = await this.prisma.benchmarkOptIn.findMany({
      where: {
        segmentId,
        active: true,
      },
      select: {
        entityId: true,
      },
    });

    const entityIds = optIns.map((o) => o.entityId);

    if (entityIds.length === 0) {
      return [];
    }

    // Collect metrics from processes
    const processes = await this.prisma.process.findMany({
      where: {
        entityId: { in: entityIds },
      },
      select: {
        entityId: true,
        cycleTimeAvg: true,
        processingTimeAvg: true,
        waitTimeAvg: true,
        variantCount: true,
        automationRate: true,
        errorRate: true,
        throughput: true,
        costPerCase: true,
        updatedAt: true,
      },
    });

    // Transform to raw metric data
    const rawData: RawMetricData[] = [];

    for (const process of processes) {
      if (process.cycleTimeAvg !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'cycle_time',
          value: process.cycleTimeAvg,
          timestamp: process.updatedAt,
        });
      }

      if (process.processingTimeAvg !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'processing_time',
          value: process.processingTimeAvg,
          timestamp: process.updatedAt,
        });
      }

      if (process.waitTimeAvg !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'wait_time',
          value: process.waitTimeAvg,
          timestamp: process.updatedAt,
        });
      }

      if (process.variantCount !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'variant_count',
          value: process.variantCount,
          timestamp: process.updatedAt,
        });
      }

      if (process.automationRate !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'automation_rate',
          value: process.automationRate,
          timestamp: process.updatedAt,
        });
      }

      if (process.errorRate !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'error_rate',
          value: process.errorRate,
          timestamp: process.updatedAt,
        });
      }

      if (process.throughput !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'throughput',
          value: process.throughput,
          timestamp: process.updatedAt,
        });
      }

      if (process.costPerCase !== null) {
        rawData.push({
          entityId: process.entityId,
          metricType: 'cost_per_case',
          value: process.costPerCase,
          timestamp: process.updatedAt,
        });
      }
    }

    return rawData;
  }

  // ---------------------------------------------------------------------------
  // Aggregation
  // ---------------------------------------------------------------------------

  async aggregateSegment(segmentId: string): Promise<BenchmarkResult | null> {
    const rawData = await this.collectSegmentData(segmentId);

    if (rawData.length === 0) {
      return null;
    }

    // Create anonymized dataset
    const anonymized = await this.anonymizer.createAnonymizedDataset(
      segmentId,
      rawData
    );

    if (!anonymized) {
      return null;
    }

    // Transform to benchmark result
    const metrics = this.transformToProcessMetrics(anonymized.metrics);

    return {
      segmentId: anonymized.segmentId,
      industry: anonymized.industry,
      companySize: anonymized.companySize,
      region: anonymized.region,
      processType: 'ALL',
      metrics,
      comparisons: [],
      participantCount: anonymized.participantCount,
      generatedAt: anonymized.generatedAt,
    };
  }

  private transformToProcessMetrics(
    anonymizedMetrics: AnonymizedMetric[]
  ): ProcessMetrics {
    const getMetric = (type: string): AggregatedMetric => {
      const metrics = anonymizedMetrics.filter((m) => m.metricType === type);

      const getValue = (aggType: string): number => {
        const metric = metrics.find((m) => m.aggregationType === aggType);
        return metric?.value ?? 0;
      };

      return {
        avg: getValue('avg'),
        median: getValue('median'),
        p25: getValue('p25'),
        p75: getValue('p75'),
        min: getValue('min'),
        max: getValue('max'),
        stddev: getValue('stddev'),
        sampleSize: metrics[0]?.sampleSize ?? 0,
        unit: metrics[0]?.unit ?? 'value',
      };
    };

    return {
      cycleTime: getMetric('cycle_time'),
      processingTime: getMetric('processing_time'),
      waitTime: getMetric('wait_time'),
      variantCount: getMetric('variant_count'),
      automationRate: getMetric('automation_rate'),
      errorRate: getMetric('error_rate'),
      throughput: getMetric('throughput'),
      costPerCase: getMetric('cost_per_case'),
    };
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  async compareToSegment(
    entityId: string,
    segmentId: string
  ): Promise<MetricComparison[]> {
    // Get entity's own metrics
    const entityProcesses = await this.prisma.process.findMany({
      where: { entityId },
      select: {
        cycleTimeAvg: true,
        processingTimeAvg: true,
        waitTimeAvg: true,
        variantCount: true,
        automationRate: true,
        errorRate: true,
        throughput: true,
        costPerCase: true,
      },
    });

    // Calculate entity averages
    const entityMetrics = this.calculateEntityAverages(entityProcesses);

    // Get benchmark data
    const benchmark = await this.aggregateSegment(segmentId);

    if (!benchmark) {
      return [];
    }

    // Compare each metric
    const comparisons: MetricComparison[] = [];

    const metricPairs: Array<{
      name: string;
      yourValue: number;
      benchmark: AggregatedMetric;
      lowerIsBetter: boolean;
    }> = [
      {
        name: 'Cycle Time',
        yourValue: entityMetrics.cycleTime,
        benchmark: benchmark.metrics.cycleTime,
        lowerIsBetter: true,
      },
      {
        name: 'Processing Time',
        yourValue: entityMetrics.processingTime,
        benchmark: benchmark.metrics.processingTime,
        lowerIsBetter: true,
      },
      {
        name: 'Wait Time',
        yourValue: entityMetrics.waitTime,
        benchmark: benchmark.metrics.waitTime,
        lowerIsBetter: true,
      },
      {
        name: 'Variant Count',
        yourValue: entityMetrics.variantCount,
        benchmark: benchmark.metrics.variantCount,
        lowerIsBetter: true,
      },
      {
        name: 'Automation Rate',
        yourValue: entityMetrics.automationRate,
        benchmark: benchmark.metrics.automationRate,
        lowerIsBetter: false,
      },
      {
        name: 'Error Rate',
        yourValue: entityMetrics.errorRate,
        benchmark: benchmark.metrics.errorRate,
        lowerIsBetter: true,
      },
      {
        name: 'Throughput',
        yourValue: entityMetrics.throughput,
        benchmark: benchmark.metrics.throughput,
        lowerIsBetter: false,
      },
      {
        name: 'Cost Per Case',
        yourValue: entityMetrics.costPerCase,
        benchmark: benchmark.metrics.costPerCase,
        lowerIsBetter: true,
      },
    ];

    for (const { name, yourValue, benchmark: bm, lowerIsBetter } of metricPairs) {
      if (yourValue === 0 || bm.sampleSize === 0) {
        continue;
      }

      const difference = yourValue - bm.avg;
      const differencePercent =
        bm.avg !== 0 ? (difference / bm.avg) * 100 : 0;

      // Calculate percentile position
      const percentile = this.calculatePercentilePosition(
        yourValue,
        bm.p25,
        bm.median,
        bm.p75
      );

      // Determine status based on whether lower is better
      let status: 'above' | 'at' | 'below';
      if (lowerIsBetter) {
        if (yourValue < bm.median * 0.9) status = 'above'; // Better than benchmark
        else if (yourValue > bm.median * 1.1) status = 'below'; // Worse than benchmark
        else status = 'at';
      } else {
        if (yourValue > bm.median * 1.1) status = 'above'; // Better than benchmark
        else if (yourValue < bm.median * 0.9) status = 'below'; // Worse than benchmark
        else status = 'at';
      }

      comparisons.push({
        metricName: name,
        yourValue,
        benchmarkAvg: bm.avg,
        benchmarkMedian: bm.median,
        percentile,
        status,
        difference,
        differencePercent: Math.round(differencePercent * 10) / 10,
      });
    }

    return comparisons;
  }

  private calculateEntityAverages(
    processes: Array<{
      cycleTimeAvg: number | null;
      processingTimeAvg: number | null;
      waitTimeAvg: number | null;
      variantCount: number | null;
      automationRate: number | null;
      errorRate: number | null;
      throughput: number | null;
      costPerCase: number | null;
    }>
  ): Record<string, number> {
    const avg = (values: (number | null)[]): number => {
      const valid = values.filter((v): v is number => v !== null);
      if (valid.length === 0) return 0;
      return valid.reduce((a, b) => a + b, 0) / valid.length;
    };

    return {
      cycleTime: avg(processes.map((p) => p.cycleTimeAvg)),
      processingTime: avg(processes.map((p) => p.processingTimeAvg)),
      waitTime: avg(processes.map((p) => p.waitTimeAvg)),
      variantCount: avg(processes.map((p) => p.variantCount)),
      automationRate: avg(processes.map((p) => p.automationRate)),
      errorRate: avg(processes.map((p) => p.errorRate)),
      throughput: avg(processes.map((p) => p.throughput)),
      costPerCase: avg(processes.map((p) => p.costPerCase)),
    };
  }

  private calculatePercentilePosition(
    value: number,
    p25: number,
    median: number,
    p75: number
  ): number {
    if (value <= p25) {
      return Math.round((value / p25) * 25);
    } else if (value <= median) {
      return 25 + Math.round(((value - p25) / (median - p25)) * 25);
    } else if (value <= p75) {
      return 50 + Math.round(((value - median) / (p75 - median)) * 25);
    } else {
      return Math.min(99, 75 + Math.round(((value - p75) / p75) * 25));
    }
  }

  // ---------------------------------------------------------------------------
  // Store Benchmark
  // ---------------------------------------------------------------------------

  async storeBenchmarkResult(result: BenchmarkResult): Promise<void> {
    await this.prisma.benchmarkResult.upsert({
      where: { segmentId: result.segmentId },
      update: {
        metrics: result.metrics as unknown as Record<string, unknown>,
        participantCount: result.participantCount,
        generatedAt: result.generatedAt,
      },
      create: {
        segmentId: result.segmentId,
        metrics: result.metrics as unknown as Record<string, unknown>,
        participantCount: result.participantCount,
        generatedAt: result.generatedAt,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Scheduled Aggregation Job
  // ---------------------------------------------------------------------------

  async runAggregationJob(): Promise<{
    processed: number;
    failed: number;
    skipped: number;
  }> {
    const eligibleSegments = await this.anonymizer.getEligibleSegments();

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const { segmentId, participantCount } of eligibleSegments) {
      try {
        if (participantCount < 10) {
          skipped++;
          continue;
        }

        const result = await this.aggregateSegment(segmentId);

        if (result) {
          await this.storeBenchmarkResult(result);
          processed++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Failed to aggregate segment ${segmentId}:`, error);
        failed++;
      }
    }

    return { processed, failed, skipped };
  }
}
