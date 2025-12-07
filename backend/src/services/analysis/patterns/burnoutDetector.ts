/**
 * Burnout Pattern Detector
 * Analyzes communication and work patterns to identify potential employee burnout indicators
 *
 * Burnout indicators analyzed:
 * - Extended working hours (emails/meetings outside business hours)
 * - Increased response time delays
 * - Escalating workload (volume trends)
 * - Decreasing response quality (shorter messages)
 * - Weekend/holiday work patterns
 * - Sentiment degradation over time
 */

import { Pool } from 'pg';
import { runQuery } from '../../../graph/connection.js';

export interface BurnoutIndicator {
  type: BurnoutIndicatorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
  dataPoints: number;
  trend: 'stable' | 'increasing' | 'decreasing';
}

export type BurnoutIndicatorType =
  | 'extended_hours'
  | 'response_delay'
  | 'workload_spike'
  | 'weekend_work'
  | 'after_hours_activity'
  | 'communication_volume_change'
  | 'response_brevity';

export interface BurnoutRiskAssessment {
  personId: string;
  email: string;
  displayName?: string;
  department?: string;
  overallRiskScore: number; // 0-100
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  indicators: BurnoutIndicator[];
  recommendedActions: string[];
  analysisWindow: {
    from: Date;
    to: Date;
  };
  confidence: number; // 0-1
  analyzedAt: Date;
}

export interface BurnoutDetectionOptions {
  organizationId: string;
  personIds?: string[]; // If empty, analyze all
  lookbackDays?: number;
  baselineDays?: number; // Days to use for baseline comparison
  businessHoursStart?: number; // Hour of day (0-23)
  businessHoursEnd?: number;
  includeWeekends?: boolean;
  minDataPoints?: number;
}

interface WorkPatternMetrics {
  personId: string;
  totalEmails: number;
  afterHoursEmails: number;
  weekendEmails: number;
  avgResponseTimeMs: number;
  avgMessageLength: number;
  emailsByHour: Map<number, number>;
  emailsByDayOfWeek: Map<number, number>;
  volumeByWeek: Map<string, number>;
}

interface BaselineMetrics {
  avgAfterHoursRate: number;
  avgWeekendRate: number;
  avgResponseTime: number;
  avgMessageLength: number;
  avgWeeklyVolume: number;
}

const SEVERITY_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
};

const BUSINESS_HOURS_DEFAULT = {
  start: 8, // 8 AM
  end: 18, // 6 PM
};

export class BurnoutDetector {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Detect burnout patterns for specified persons or entire organization
   */
  async detectBurnoutPatterns(
    options: BurnoutDetectionOptions
  ): Promise<BurnoutRiskAssessment[]> {
    const {
      organizationId,
      personIds,
      lookbackDays = 30,
      baselineDays = 90,
      businessHoursStart = BUSINESS_HOURS_DEFAULT.start,
      businessHoursEnd = BUSINESS_HOURS_DEFAULT.end,
      minDataPoints = 20,
    } = options;

    // Get persons to analyze
    const persons = await this.getPersonsToAnalyze(organizationId, personIds);

    if (persons.length === 0) {
      return [];
    }

    const assessments: BurnoutRiskAssessment[] = [];
    const now = new Date();
    const lookbackFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const baselineFrom = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);

    for (const person of persons) {
      // Get current period metrics
      const currentMetrics = await this.getWorkPatternMetrics(
        organizationId,
        person.id,
        lookbackFrom,
        now,
        businessHoursStart,
        businessHoursEnd
      );

      // Skip if insufficient data
      if (currentMetrics.totalEmails < minDataPoints) {
        continue;
      }

      // Get baseline metrics
      const baselineMetrics = await this.getBaselineMetrics(
        organizationId,
        person.id,
        baselineFrom,
        lookbackFrom,
        businessHoursStart,
        businessHoursEnd
      );

      // Analyze indicators
      const indicators = this.analyzeIndicators(
        currentMetrics,
        baselineMetrics,
        businessHoursStart,
        businessHoursEnd
      );

      // Calculate overall risk score
      const overallRiskScore = this.calculateOverallRiskScore(indicators);
      const riskLevel = this.determineRiskLevel(overallRiskScore);

      // Generate recommendations
      const recommendedActions = this.generateRecommendations(indicators, riskLevel);

      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(
        currentMetrics.totalEmails,
        baselineMetrics.avgWeeklyVolume > 0 ? lookbackDays : 0,
        minDataPoints
      );

      assessments.push({
        personId: person.id,
        email: person.email,
        displayName: person.displayName,
        department: person.department,
        overallRiskScore,
        riskLevel,
        indicators,
        recommendedActions,
        analysisWindow: {
          from: lookbackFrom,
          to: now,
        },
        confidence,
        analyzedAt: now,
      });
    }

    // Sort by risk score descending
    assessments.sort((a, b) => b.overallRiskScore - a.overallRiskScore);

    return assessments;
  }

  /**
   * Get high-risk individuals requiring immediate attention
   */
  async getHighRiskIndividuals(
    organizationId: string,
    options?: Partial<BurnoutDetectionOptions>
  ): Promise<BurnoutRiskAssessment[]> {
    const assessments = await this.detectBurnoutPatterns({
      organizationId,
      ...options,
    });

    return assessments.filter(
      (a) => a.riskLevel === 'high' || a.riskLevel === 'critical'
    );
  }

  /**
   * Get persons from Neo4j knowledge graph
   */
  private async getPersonsToAnalyze(
    organizationId: string,
    personIds?: string[]
  ): Promise<Array<{ id: string; email: string; displayName?: string; department?: string }>> {
    let query: string;
    let params: Record<string, unknown>;

    if (personIds && personIds.length > 0) {
      query = `
        MATCH (p:Person {organizationId: $organizationId})
        WHERE p.id IN $personIds
        RETURN p.id as id, p.email as email, p.displayName as displayName, p.department as department
      `;
      params = { organizationId, personIds };
    } else {
      query = `
        MATCH (p:Person {organizationId: $organizationId})
        RETURN p.id as id, p.email as email, p.displayName as displayName, p.department as department
      `;
      params = { organizationId };
    }

    const results = await runQuery<{
      id: string;
      email: string;
      displayName?: string;
      department?: string;
    }>(query, params);

    return results;
  }

  /**
   * Get work pattern metrics from event data
   */
  private async getWorkPatternMetrics(
    organizationId: string,
    personId: string,
    from: Date,
    to: Date,
    businessHoursStart: number,
    businessHoursEnd: number
  ): Promise<WorkPatternMetrics> {
    // Query events from TimescaleDB
    const query = `
      SELECT
        timestamp,
        event_type,
        metadata,
        EXTRACT(HOUR FROM timestamp) as hour,
        EXTRACT(DOW FROM timestamp) as day_of_week,
        DATE_TRUNC('week', timestamp) as week_start
      FROM events
      WHERE organization_id = $1
        AND actor_id = $2
        AND timestamp >= $3
        AND timestamp <= $4
        AND event_type IN ('email_sent', 'email_received', 'meeting_attended', 'message_sent')
      ORDER BY timestamp ASC
    `;

    const result = await this.pool.query(query, [organizationId, personId, from, to]);

    const metrics: WorkPatternMetrics = {
      personId,
      totalEmails: 0,
      afterHoursEmails: 0,
      weekendEmails: 0,
      avgResponseTimeMs: 0,
      avgMessageLength: 0,
      emailsByHour: new Map(),
      emailsByDayOfWeek: new Map(),
      volumeByWeek: new Map(),
    };

    let totalResponseTime = 0;
    let responseCount = 0;
    let totalMessageLength = 0;
    let messageCount = 0;

    for (const row of result.rows) {
      metrics.totalEmails++;

      const hour = parseInt(row.hour);
      const dayOfWeek = parseInt(row.day_of_week);
      const weekStart = row.week_start.toISOString().split('T')[0];

      // Track by hour
      metrics.emailsByHour.set(hour, (metrics.emailsByHour.get(hour) || 0) + 1);

      // Track by day of week
      metrics.emailsByDayOfWeek.set(
        dayOfWeek,
        (metrics.emailsByDayOfWeek.get(dayOfWeek) || 0) + 1
      );

      // Track by week
      metrics.volumeByWeek.set(weekStart, (metrics.volumeByWeek.get(weekStart) || 0) + 1);

      // After hours check
      if (hour < businessHoursStart || hour >= businessHoursEnd) {
        metrics.afterHoursEmails++;
      }

      // Weekend check (0 = Sunday, 6 = Saturday)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        metrics.weekendEmails++;
      }

      // Response time from metadata
      const metadata = row.metadata as Record<string, unknown> | null;
      if (metadata?.responseTimeMs) {
        totalResponseTime += metadata.responseTimeMs as number;
        responseCount++;
      }

      // Message length from metadata
      if (metadata?.bodyLength) {
        totalMessageLength += metadata.bodyLength as number;
        messageCount++;
      }
    }

    metrics.avgResponseTimeMs = responseCount > 0 ? totalResponseTime / responseCount : 0;
    metrics.avgMessageLength = messageCount > 0 ? totalMessageLength / messageCount : 0;

    return metrics;
  }

  /**
   * Get baseline metrics for comparison
   */
  private async getBaselineMetrics(
    organizationId: string,
    personId: string,
    from: Date,
    to: Date,
    businessHoursStart: number,
    businessHoursEnd: number
  ): Promise<BaselineMetrics> {
    const metrics = await this.getWorkPatternMetrics(
      organizationId,
      personId,
      from,
      to,
      businessHoursStart,
      businessHoursEnd
    );

    const weekCount = metrics.volumeByWeek.size || 1;
    const totalWeeklyVolume = Array.from(metrics.volumeByWeek.values()).reduce(
      (sum, v) => sum + v,
      0
    );

    return {
      avgAfterHoursRate:
        metrics.totalEmails > 0 ? metrics.afterHoursEmails / metrics.totalEmails : 0,
      avgWeekendRate:
        metrics.totalEmails > 0 ? metrics.weekendEmails / metrics.totalEmails : 0,
      avgResponseTime: metrics.avgResponseTimeMs,
      avgMessageLength: metrics.avgMessageLength,
      avgWeeklyVolume: totalWeeklyVolume / weekCount,
    };
  }

  /**
   * Analyze all burnout indicators
   */
  private analyzeIndicators(
    current: WorkPatternMetrics,
    baseline: BaselineMetrics,
    businessHoursStart: number,
    businessHoursEnd: number
  ): BurnoutIndicator[] {
    const indicators: BurnoutIndicator[] = [];

    // 1. Extended Hours Indicator
    const afterHoursRate = current.totalEmails > 0
      ? current.afterHoursEmails / current.totalEmails
      : 0;
    const afterHoursIncrease = baseline.avgAfterHoursRate > 0
      ? (afterHoursRate - baseline.avgAfterHoursRate) / baseline.avgAfterHoursRate
      : afterHoursRate;

    if (afterHoursRate > 0.15 || afterHoursIncrease > 0.2) {
      const score = Math.min(100, afterHoursRate * 200 + afterHoursIncrease * 50);
      indicators.push({
        type: 'extended_hours',
        severity: this.scoresToSeverity(score),
        score,
        description: `${Math.round(afterHoursRate * 100)}% of communications occur outside business hours (${businessHoursStart}:00-${businessHoursEnd}:00)`,
        dataPoints: current.afterHoursEmails,
        trend: afterHoursIncrease > 0.1 ? 'increasing' : afterHoursIncrease < -0.1 ? 'decreasing' : 'stable',
      });
    }

    // 2. Weekend Work Indicator
    const weekendRate = current.totalEmails > 0
      ? current.weekendEmails / current.totalEmails
      : 0;
    const weekendIncrease = baseline.avgWeekendRate > 0
      ? (weekendRate - baseline.avgWeekendRate) / baseline.avgWeekendRate
      : weekendRate;

    if (weekendRate > 0.1 || weekendIncrease > 0.3) {
      const score = Math.min(100, weekendRate * 300 + weekendIncrease * 40);
      indicators.push({
        type: 'weekend_work',
        severity: this.scoresToSeverity(score),
        score,
        description: `${Math.round(weekendRate * 100)}% of communications occur on weekends`,
        dataPoints: current.weekendEmails,
        trend: weekendIncrease > 0.1 ? 'increasing' : weekendIncrease < -0.1 ? 'decreasing' : 'stable',
      });
    }

    // 3. Response Delay Indicator
    if (baseline.avgResponseTime > 0 && current.avgResponseTimeMs > 0) {
      const responseTimeIncrease =
        (current.avgResponseTimeMs - baseline.avgResponseTime) / baseline.avgResponseTime;

      if (responseTimeIncrease > 0.3) {
        const score = Math.min(100, responseTimeIncrease * 100);
        indicators.push({
          type: 'response_delay',
          severity: this.scoresToSeverity(score),
          score,
          description: `Response times have increased by ${Math.round(responseTimeIncrease * 100)}% compared to baseline`,
          dataPoints: current.totalEmails,
          trend: 'increasing',
        });
      }
    }

    // 4. Workload Spike Indicator
    const weeks = Array.from(current.volumeByWeek.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    if (weeks.length >= 2 && baseline.avgWeeklyVolume > 0) {
      const recentWeeks = weeks.slice(-2);
      const recentAvg =
        recentWeeks.reduce((sum, [_, v]) => sum + v, 0) / recentWeeks.length;
      const volumeIncrease = (recentAvg - baseline.avgWeeklyVolume) / baseline.avgWeeklyVolume;

      if (volumeIncrease > 0.4) {
        const score = Math.min(100, volumeIncrease * 80);
        indicators.push({
          type: 'workload_spike',
          severity: this.scoresToSeverity(score),
          score,
          description: `Weekly communication volume is ${Math.round(volumeIncrease * 100)}% higher than baseline average`,
          dataPoints: current.totalEmails,
          trend: 'increasing',
        });
      }
    }

    // 5. Response Brevity Indicator (shorter messages may indicate stress)
    if (baseline.avgMessageLength > 0 && current.avgMessageLength > 0) {
      const lengthDecrease =
        (baseline.avgMessageLength - current.avgMessageLength) / baseline.avgMessageLength;

      if (lengthDecrease > 0.3) {
        const score = Math.min(100, lengthDecrease * 100);
        indicators.push({
          type: 'response_brevity',
          severity: this.scoresToSeverity(score),
          score,
          description: `Average message length has decreased by ${Math.round(lengthDecrease * 100)}%`,
          dataPoints: current.totalEmails,
          trend: 'decreasing',
        });
      }
    }

    // 6. After Hours Activity Pattern (late night specifically)
    const lateNightHours = [22, 23, 0, 1, 2, 3, 4, 5];
    let lateNightCount = 0;
    for (const hour of lateNightHours) {
      lateNightCount += current.emailsByHour.get(hour) || 0;
    }
    const lateNightRate = current.totalEmails > 0 ? lateNightCount / current.totalEmails : 0;

    if (lateNightRate > 0.05) {
      const score = Math.min(100, lateNightRate * 500);
      indicators.push({
        type: 'after_hours_activity',
        severity: this.scoresToSeverity(score),
        score,
        description: `${Math.round(lateNightRate * 100)}% of communications occur late at night (10 PM - 5 AM)`,
        dataPoints: lateNightCount,
        trend: 'stable',
      });
    }

    return indicators;
  }

  /**
   * Calculate overall risk score from individual indicators
   */
  private calculateOverallRiskScore(indicators: BurnoutIndicator[]): number {
    if (indicators.length === 0) {
      return 0;
    }

    // Weighted average with severity multiplier
    const weights: Record<BurnoutIndicatorType, number> = {
      extended_hours: 1.2,
      weekend_work: 1.3,
      response_delay: 1.0,
      workload_spike: 1.5,
      response_brevity: 0.8,
      after_hours_activity: 1.4,
      communication_volume_change: 1.0,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const indicator of indicators) {
      const weight = weights[indicator.type] || 1.0;
      weightedSum += indicator.score * weight;
      totalWeight += weight;
    }

    const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Boost score if multiple indicators present
    const indicatorCountBoost = Math.min(20, (indicators.length - 1) * 5);

    // Boost for critical/high severity indicators
    const criticalCount = indicators.filter(
      (i) => i.severity === 'critical' || i.severity === 'high'
    ).length;
    const severityBoost = criticalCount * 10;

    return Math.min(100, baseScore + indicatorCountBoost + severityBoost);
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'low' | 'moderate' | 'high' | 'critical' {
    if (score >= SEVERITY_THRESHOLDS.critical) return 'critical';
    if (score >= SEVERITY_THRESHOLDS.high) return 'high';
    if (score >= SEVERITY_THRESHOLDS.medium) return 'moderate';
    return 'low';
  }

  /**
   * Convert score to severity
   */
  private scoresToSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= SEVERITY_THRESHOLDS.critical) return 'critical';
    if (score >= SEVERITY_THRESHOLDS.high) return 'high';
    if (score >= SEVERITY_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate recommended actions based on indicators
   */
  private generateRecommendations(
    indicators: BurnoutIndicator[],
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];

    for (const indicator of indicators) {
      switch (indicator.type) {
        case 'extended_hours':
          recommendations.push(
            'Consider reviewing workload distribution and delegation opportunities'
          );
          if (indicator.severity === 'high' || indicator.severity === 'critical') {
            recommendations.push(
              'Recommend scheduling a private check-in to discuss work-life balance'
            );
          }
          break;

        case 'weekend_work':
          recommendations.push(
            'Evaluate if weekend work is due to deadline pressure or workload issues'
          );
          recommendations.push(
            'Consider implementing clearer boundaries for after-hours communication'
          );
          break;

        case 'response_delay':
          recommendations.push(
            'Review current project load and prioritization'
          );
          recommendations.push(
            'Consider if additional support or resources are needed'
          );
          break;

        case 'workload_spike':
          recommendations.push(
            'Assess if workload increase is temporary or structural'
          );
          recommendations.push(
            'Consider redistributing tasks or bringing in additional support'
          );
          break;

        case 'response_brevity':
          recommendations.push(
            'Monitor for signs of disengagement or frustration'
          );
          break;

        case 'after_hours_activity':
          recommendations.push(
            'Late night work patterns may indicate overwhelm or difficulty disconnecting'
          );
          recommendations.push(
            'Consider discussing time management and boundary setting'
          );
          break;
      }
    }

    // Add general recommendations based on risk level
    if (riskLevel === 'critical') {
      recommendations.unshift(
        'URGENT: Immediate management attention recommended'
      );
      recommendations.push(
        'Consider temporary workload reduction or time off'
      );
    } else if (riskLevel === 'high') {
      recommendations.unshift(
        'Schedule a check-in meeting within the next week'
      );
    }

    // Remove duplicates
    return [...new Set(recommendations)];
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(
    dataPoints: number,
    comparisonDays: number,
    minDataPoints: number
  ): number {
    // More data points = higher confidence
    const dataPointScore = Math.min(1, dataPoints / (minDataPoints * 5));

    // Baseline comparison availability
    const baselineScore = comparisonDays > 0 ? 0.3 : 0;

    // Minimum threshold
    const minimumMet = dataPoints >= minDataPoints ? 0.2 : 0;

    return Math.min(1, dataPointScore * 0.5 + baselineScore + minimumMet);
  }
}

// Factory function
let burnoutDetectorInstance: BurnoutDetector | null = null;

export function createBurnoutDetector(pool: Pool): BurnoutDetector {
  if (!burnoutDetectorInstance) {
    burnoutDetectorInstance = new BurnoutDetector(pool);
  }
  return burnoutDetectorInstance;
}

export function resetBurnoutDetector(): void {
  burnoutDetectorInstance = null;
}
