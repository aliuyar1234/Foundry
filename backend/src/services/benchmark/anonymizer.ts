// =============================================================================
// Anonymizer Service
// SCALE Tier - Task T205-T209
//
// Data anonymization service for cross-company benchmarking
// Implements k-anonymity and GDPR-compliant data stripping
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AnonymizedDataset {
  segmentId: string;
  industry: string;
  companySize: string;
  region: string;
  metrics: AnonymizedMetric[];
  participantCount: number;
  generatedAt: Date;
}

export interface AnonymizedMetric {
  metricType: string;
  aggregationType: 'avg' | 'median' | 'p25' | 'p75' | 'min' | 'max' | 'stddev';
  value: number;
  unit: string;
  sampleSize: number;
}

export interface RawMetricData {
  entityId: string;
  metricType: string;
  value: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AnonymizationConfig {
  minParticipants: number; // k-anonymity threshold (default: 10)
  stripIdentifiers: boolean;
  aggregateOnly: boolean;
  allowedMetrics: string[];
}

export interface IdentifierPattern {
  pattern: RegExp;
  replacement: string;
  description: string;
}

// -----------------------------------------------------------------------------
// Anonymizer Service
// -----------------------------------------------------------------------------

export class AnonymizerService {
  private prisma: PrismaClient;
  private minParticipants: number;

  // Patterns for identifying PII/company identifiers
  private readonly identifierPatterns: IdentifierPattern[] = [
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: '[EMAIL_REDACTED]',
      description: 'Email addresses',
    },
    {
      pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      replacement: '[PHONE_REDACTED]',
      description: 'Phone numbers',
    },
    {
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      replacement: '[IP_REDACTED]',
      description: 'IP addresses',
    },
    {
      pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
      replacement: '[UUID_REDACTED]',
      description: 'UUIDs',
    },
    {
      pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
      replacement: '[NAME_REDACTED]',
      description: 'Personal names (basic)',
    },
  ];

  constructor(prisma: PrismaClient, minParticipants: number = 10) {
    this.prisma = prisma;
    this.minParticipants = minParticipants;
  }

  // ---------------------------------------------------------------------------
  // K-Anonymity Validation
  // ---------------------------------------------------------------------------

  async validateKAnonymity(
    segmentId: string,
    entityIds: string[]
  ): Promise<{ valid: boolean; participantCount: number; required: number }> {
    const participantCount = new Set(entityIds).size;

    return {
      valid: participantCount >= this.minParticipants,
      participantCount,
      required: this.minParticipants,
    };
  }

  async getEligibleSegments(): Promise<
    Array<{ segmentId: string; participantCount: number }>
  > {
    // Get segments that meet k-anonymity threshold
    const segments = await this.prisma.$queryRaw<
      Array<{ segmentId: string; count: bigint }>
    >`
      SELECT
        segment_id as "segmentId",
        COUNT(DISTINCT entity_id) as count
      FROM benchmark_opt_ins
      WHERE active = true
      GROUP BY segment_id
      HAVING COUNT(DISTINCT entity_id) >= ${this.minParticipants}
    `;

    return segments.map((s) => ({
      segmentId: s.segmentId,
      participantCount: Number(s.count),
    }));
  }

  // ---------------------------------------------------------------------------
  // Data Anonymization
  // ---------------------------------------------------------------------------

  anonymizeMetrics(
    rawData: RawMetricData[],
    config: AnonymizationConfig
  ): AnonymizedMetric[] {
    // Validate k-anonymity
    const uniqueEntities = new Set(rawData.map((d) => d.entityId));
    if (uniqueEntities.size < config.minParticipants) {
      throw new Error(
        `Insufficient participants: ${uniqueEntities.size} < ${config.minParticipants}`
      );
    }

    // Filter to allowed metrics
    const filteredData = rawData.filter((d) =>
      config.allowedMetrics.includes(d.metricType)
    );

    // Group by metric type
    const groupedByType = new Map<string, number[]>();
    for (const item of filteredData) {
      if (!groupedByType.has(item.metricType)) {
        groupedByType.set(item.metricType, []);
      }
      groupedByType.get(item.metricType)!.push(item.value);
    }

    // Calculate aggregations
    const result: AnonymizedMetric[] = [];

    for (const [metricType, values] of groupedByType) {
      if (values.length < config.minParticipants) {
        continue; // Skip metrics with insufficient data
      }

      const sorted = [...values].sort((a, b) => a - b);

      result.push(
        {
          metricType,
          aggregationType: 'avg',
          value: this.calculateMean(values),
          unit: this.getMetricUnit(metricType),
          sampleSize: values.length,
        },
        {
          metricType,
          aggregationType: 'median',
          value: this.calculateMedian(sorted),
          unit: this.getMetricUnit(metricType),
          sampleSize: values.length,
        },
        {
          metricType,
          aggregationType: 'p25',
          value: this.calculatePercentile(sorted, 25),
          unit: this.getMetricUnit(metricType),
          sampleSize: values.length,
        },
        {
          metricType,
          aggregationType: 'p75',
          value: this.calculatePercentile(sorted, 75),
          unit: this.getMetricUnit(metricType),
          sampleSize: values.length,
        },
        {
          metricType,
          aggregationType: 'stddev',
          value: this.calculateStdDev(values),
          unit: this.getMetricUnit(metricType),
          sampleSize: values.length,
        }
      );
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Identifier Stripping
  // ---------------------------------------------------------------------------

  stripIdentifiers(text: string): string {
    let result = text;

    for (const { pattern, replacement } of this.identifierPatterns) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  stripIdentifiersFromObject<T extends Record<string, unknown>>(
    obj: T,
    sensitiveFields: string[]
  ): T {
    const result = { ...obj };

    for (const field of sensitiveFields) {
      if (field in result) {
        delete result[field];
      }
    }

    // Recursively process string values
    for (const key of Object.keys(result)) {
      const value = result[key];

      if (typeof value === 'string') {
        (result as Record<string, unknown>)[key] = this.stripIdentifiers(value);
      } else if (typeof value === 'object' && value !== null) {
        (result as Record<string, unknown>)[key] = this.stripIdentifiersFromObject(
          value as Record<string, unknown>,
          sensitiveFields
        );
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Pseudonymization (reversible with key)
  // ---------------------------------------------------------------------------

  pseudonymize(identifier: string, salt: string): string {
    const hash = crypto
      .createHmac('sha256', salt)
      .update(identifier)
      .digest('hex');

    return hash.substring(0, 16);
  }

  // ---------------------------------------------------------------------------
  // Statistical Helpers
  // ---------------------------------------------------------------------------

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round((sum / values.length) * 100) / 100;
  }

  private calculateMedian(sortedValues: number[]): number {
    const mid = Math.floor(sortedValues.length / 2);

    if (sortedValues.length % 2 === 0) {
      return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
    }

    return sortedValues[mid];
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower];
    }

    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = this.calculateMean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff =
      squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);

    return Math.round(Math.sqrt(avgSquaredDiff) * 100) / 100;
  }

  private getMetricUnit(metricType: string): string {
    const units: Record<string, string> = {
      cycle_time: 'hours',
      processing_time: 'hours',
      wait_time: 'hours',
      variant_count: 'count',
      automation_rate: 'percent',
      error_rate: 'percent',
      throughput: 'cases/day',
      cost_per_case: 'currency',
    };

    return units[metricType] || 'value';
  }

  // ---------------------------------------------------------------------------
  // Validation Tests
  // ---------------------------------------------------------------------------

  async validateAnonymization(data: AnonymizedDataset): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check k-anonymity
    if (data.participantCount < this.minParticipants) {
      issues.push(
        `K-anonymity violation: ${data.participantCount} < ${this.minParticipants}`
      );
    }

    // Check for any remaining identifiers in metric names
    for (const metric of data.metrics) {
      for (const { pattern, description } of this.identifierPatterns) {
        if (pattern.test(metric.metricType)) {
          issues.push(`Identifier found in metric type: ${description}`);
        }
      }
    }

    // Ensure no raw values (only aggregations)
    for (const metric of data.metrics) {
      if (!['avg', 'median', 'p25', 'p75', 'min', 'max', 'stddev'].includes(metric.aggregationType)) {
        issues.push(`Non-aggregated value found: ${metric.aggregationType}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // ---------------------------------------------------------------------------
  // Create Anonymized Dataset
  // ---------------------------------------------------------------------------

  async createAnonymizedDataset(
    segmentId: string,
    rawData: RawMetricData[]
  ): Promise<AnonymizedDataset | null> {
    const config: AnonymizationConfig = {
      minParticipants: this.minParticipants,
      stripIdentifiers: true,
      aggregateOnly: true,
      allowedMetrics: [
        'cycle_time',
        'processing_time',
        'wait_time',
        'variant_count',
        'automation_rate',
        'error_rate',
        'throughput',
        'cost_per_case',
      ],
    };

    // Validate k-anonymity
    const validation = await this.validateKAnonymity(
      segmentId,
      rawData.map((d) => d.entityId)
    );

    if (!validation.valid) {
      console.warn(
        `Segment ${segmentId} does not meet k-anonymity: ${validation.participantCount} < ${validation.required}`
      );
      return null;
    }

    // Get segment metadata
    const segment = await this.prisma.benchmarkSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      return null;
    }

    // Anonymize metrics
    const anonymizedMetrics = this.anonymizeMetrics(rawData, config);

    const dataset: AnonymizedDataset = {
      segmentId,
      industry: segment.industry,
      companySize: segment.companySize,
      region: segment.region,
      metrics: anonymizedMetrics,
      participantCount: validation.participantCount,
      generatedAt: new Date(),
    };

    // Validate the result
    const resultValidation = await this.validateAnonymization(dataset);

    if (!resultValidation.valid) {
      console.error('Anonymization validation failed:', resultValidation.issues);
      return null;
    }

    return dataset;
  }
}
