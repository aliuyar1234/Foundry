/**
 * Process Degradation Detector
 * Analyzes process performance trends to identify degrading processes before failure
 *
 * Degradation indicators analyzed:
 * - Increasing cycle times
 * - Growing error/rework rates
 * - Bottleneck severity changes
 * - Decreasing throughput
 * - Rising variance in completion times
 * - Step skip frequency changes
 */

import { Pool } from 'pg';
import { runQuery } from '../../../graph/connection.js';

export interface DegradationIndicator {
  type: DegradationIndicatorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
  currentValue: number;
  baselineValue: number;
  changePercent: number;
  trend: 'stable' | 'degrading' | 'improving';
}

export type DegradationIndicatorType =
  | 'cycle_time_increase'
  | 'throughput_decrease'
  | 'error_rate_increase'
  | 'variance_increase'
  | 'bottleneck_worsening'
  | 'step_skip_increase'
  | 'rework_rate_increase';

export interface ProcessDegradationAssessment {
  processId: string;
  processName: string;
  organizationId: string;
  overallHealthScore: number; // 0-100, higher is healthier
  degradationLevel: 'healthy' | 'warning' | 'degrading' | 'critical';
  indicators: DegradationIndicator[];
  predictedFailureRisk: number; // 0-1 probability
  estimatedTimeToFailure?: {
    value: number;
    unit: 'days' | 'weeks' | 'months';
    confidence: number;
  };
  recommendedActions: string[];
  analysisWindow: {
    from: Date;
    to: Date;
  };
  confidence: number;
  analyzedAt: Date;
}

export interface DegradationDetectionOptions {
  organizationId: string;
  processIds?: string[]; // If empty, analyze all
  lookbackDays?: number;
  baselineDays?: number;
  minCaseCount?: number;
  sensitivityLevel?: 'low' | 'medium' | 'high';
}

interface ProcessMetricsWindow {
  processId: string;
  caseCount: number;
  avgCycleTime: number;
  medianCycleTime: number;
  p95CycleTime: number;
  cycleTimeVariance: number;
  throughputPerDay: number;
  errorRate: number;
  reworkRate: number;
  stepSkipRate: number;
  avgStepDuration: Map<string, number>;
  bottleneckSteps: string[];
}

const DEGRADATION_THRESHOLDS = {
  low: {
    cycleTimeIncrease: 0.1, // 10%
    throughputDecrease: 0.1,
    errorRateIncrease: 0.15,
    varianceIncrease: 0.2,
  },
  medium: {
    cycleTimeIncrease: 0.2,
    throughputDecrease: 0.15,
    errorRateIncrease: 0.2,
    varianceIncrease: 0.3,
  },
  high: {
    cycleTimeIncrease: 0.15,
    throughputDecrease: 0.12,
    errorRateIncrease: 0.18,
    varianceIncrease: 0.25,
  },
};

export class DegradationDetector {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Detect process degradation patterns
   */
  async detectDegradation(
    options: DegradationDetectionOptions
  ): Promise<ProcessDegradationAssessment[]> {
    const {
      organizationId,
      processIds,
      lookbackDays = 14,
      baselineDays = 60,
      minCaseCount = 10,
      sensitivityLevel = 'medium',
    } = options;

    // Get processes to analyze
    const processes = await this.getProcessesToAnalyze(organizationId, processIds);

    if (processes.length === 0) {
      return [];
    }

    const assessments: ProcessDegradationAssessment[] = [];
    const now = new Date();
    const lookbackFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const baselineFrom = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);

    const thresholds = DEGRADATION_THRESHOLDS[sensitivityLevel];

    for (const process of processes) {
      // Get current metrics
      const currentMetrics = await this.getProcessMetrics(
        organizationId,
        process.id,
        lookbackFrom,
        now
      );

      // Skip if insufficient data
      if (currentMetrics.caseCount < minCaseCount) {
        continue;
      }

      // Get baseline metrics
      const baselineMetrics = await this.getProcessMetrics(
        organizationId,
        process.id,
        baselineFrom,
        lookbackFrom
      );

      // Analyze indicators
      const indicators = this.analyzeIndicators(
        currentMetrics,
        baselineMetrics,
        thresholds
      );

      // Calculate health score (inverse of degradation)
      const healthScore = this.calculateHealthScore(indicators);
      const degradationLevel = this.determineDegradationLevel(healthScore);

      // Predict failure risk
      const { failureRisk, timeToFailure } = this.predictFailure(
        indicators,
        currentMetrics,
        baselineMetrics
      );

      // Generate recommendations
      const recommendedActions = this.generateRecommendations(indicators, degradationLevel);

      // Calculate confidence
      const confidence = this.calculateConfidence(
        currentMetrics.caseCount,
        baselineMetrics.caseCount,
        minCaseCount
      );

      assessments.push({
        processId: process.id,
        processName: process.name,
        organizationId,
        overallHealthScore: healthScore,
        degradationLevel,
        indicators,
        predictedFailureRisk: failureRisk,
        estimatedTimeToFailure: timeToFailure,
        recommendedActions,
        analysisWindow: {
          from: lookbackFrom,
          to: now,
        },
        confidence,
        analyzedAt: now,
      });
    }

    // Sort by health score ascending (worst first)
    assessments.sort((a, b) => a.overallHealthScore - b.overallHealthScore);

    return assessments;
  }

  /**
   * Get processes approaching failure
   */
  async getCriticalProcesses(
    organizationId: string,
    options?: Partial<DegradationDetectionOptions>
  ): Promise<ProcessDegradationAssessment[]> {
    const assessments = await this.detectDegradation({
      organizationId,
      ...options,
    });

    return assessments.filter(
      (a) => a.degradationLevel === 'degrading' || a.degradationLevel === 'critical'
    );
  }

  /**
   * Get processes from Neo4j
   */
  private async getProcessesToAnalyze(
    organizationId: string,
    processIds?: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    let query: string;
    let params: Record<string, unknown>;

    if (processIds && processIds.length > 0) {
      query = `
        MATCH (p:Process {organizationId: $organizationId})
        WHERE p.id IN $processIds
        RETURN p.id as id, p.name as name
      `;
      params = { organizationId, processIds };
    } else {
      query = `
        MATCH (p:Process {organizationId: $organizationId})
        RETURN p.id as id, p.name as name
      `;
      params = { organizationId };
    }

    const results = await runQuery<{ id: string; name: string }>(query, params);
    return results;
  }

  /**
   * Get process metrics from event data
   */
  private async getProcessMetrics(
    organizationId: string,
    processId: string,
    from: Date,
    to: Date
  ): Promise<ProcessMetricsWindow> {
    // Query case-level metrics from TimescaleDB
    const caseQuery = `
      WITH cases AS (
        SELECT
          metadata->>'caseId' as case_id,
          MIN(timestamp) as start_time,
          MAX(timestamp) as end_time,
          COUNT(*) as event_count,
          COUNT(DISTINCT event_type) as unique_activities,
          BOOL_OR(event_type LIKE '%error%' OR event_type LIKE '%fail%') as has_error,
          BOOL_OR(event_type LIKE '%rework%' OR event_type LIKE '%retry%') as has_rework
        FROM events
        WHERE organization_id = $1
          AND metadata->>'processId' = $2
          AND timestamp >= $3
          AND timestamp <= $4
        GROUP BY metadata->>'caseId'
        HAVING COUNT(*) >= 2
      )
      SELECT
        COUNT(*) as case_count,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_cycle_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (end_time - start_time))) as median_cycle_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (end_time - start_time))) as p95_cycle_time,
        VARIANCE(EXTRACT(EPOCH FROM (end_time - start_time))) as cycle_time_variance,
        COUNT(*)::FLOAT / NULLIF(EXTRACT(EPOCH FROM ($4::timestamp - $3::timestamp)) / 86400, 0) as throughput_per_day,
        AVG(CASE WHEN has_error THEN 1 ELSE 0 END) as error_rate,
        AVG(CASE WHEN has_rework THEN 1 ELSE 0 END) as rework_rate
      FROM cases
    `;

    const caseResult = await this.pool.query(caseQuery, [
      organizationId,
      processId,
      from,
      to,
    ]);

    const caseData = caseResult.rows[0] || {};

    // Query step-level metrics
    const stepQuery = `
      SELECT
        event_type as step,
        AVG(
          EXTRACT(EPOCH FROM (
            LEAD(timestamp) OVER (PARTITION BY metadata->>'caseId' ORDER BY timestamp) - timestamp
          ))
        ) as avg_duration
      FROM events
      WHERE organization_id = $1
        AND metadata->>'processId' = $2
        AND timestamp >= $3
        AND timestamp <= $4
      GROUP BY event_type
      HAVING COUNT(*) >= 3
    `;

    const stepResult = await this.pool.query(stepQuery, [
      organizationId,
      processId,
      from,
      to,
    ]);

    const avgStepDuration = new Map<string, number>();
    const bottleneckSteps: string[] = [];
    let avgDuration = 0;
    let stepCount = 0;

    for (const row of stepResult.rows) {
      if (row.avg_duration) {
        avgStepDuration.set(row.step, parseFloat(row.avg_duration));
        avgDuration += parseFloat(row.avg_duration);
        stepCount++;
      }
    }

    // Identify bottlenecks (steps with >1.5x average duration)
    const avgStepDur = stepCount > 0 ? avgDuration / stepCount : 0;
    for (const [step, duration] of avgStepDuration) {
      if (duration > avgStepDur * 1.5) {
        bottleneckSteps.push(step);
      }
    }

    // Query step skip rate
    const skipQuery = `
      WITH expected_steps AS (
        SELECT DISTINCT event_type as step
        FROM events
        WHERE organization_id = $1
          AND metadata->>'processId' = $2
          AND timestamp >= $3
          AND timestamp <= $4
      ),
      case_steps AS (
        SELECT
          metadata->>'caseId' as case_id,
          ARRAY_AGG(DISTINCT event_type) as steps
        FROM events
        WHERE organization_id = $1
          AND metadata->>'processId' = $2
          AND timestamp >= $3
          AND timestamp <= $4
        GROUP BY metadata->>'caseId'
      )
      SELECT
        AVG(
          1.0 - (array_length(steps, 1)::FLOAT / NULLIF((SELECT COUNT(*) FROM expected_steps), 0))
        ) as skip_rate
      FROM case_steps
    `;

    const skipResult = await this.pool.query(skipQuery, [
      organizationId,
      processId,
      from,
      to,
    ]);

    return {
      processId,
      caseCount: parseInt(caseData.case_count) || 0,
      avgCycleTime: parseFloat(caseData.avg_cycle_time) || 0,
      medianCycleTime: parseFloat(caseData.median_cycle_time) || 0,
      p95CycleTime: parseFloat(caseData.p95_cycle_time) || 0,
      cycleTimeVariance: parseFloat(caseData.cycle_time_variance) || 0,
      throughputPerDay: parseFloat(caseData.throughput_per_day) || 0,
      errorRate: parseFloat(caseData.error_rate) || 0,
      reworkRate: parseFloat(caseData.rework_rate) || 0,
      stepSkipRate: parseFloat(skipResult.rows[0]?.skip_rate) || 0,
      avgStepDuration,
      bottleneckSteps,
    };
  }

  /**
   * Analyze degradation indicators
   */
  private analyzeIndicators(
    current: ProcessMetricsWindow,
    baseline: ProcessMetricsWindow,
    thresholds: typeof DEGRADATION_THRESHOLDS.medium
  ): DegradationIndicator[] {
    const indicators: DegradationIndicator[] = [];

    // 1. Cycle Time Increase
    if (baseline.avgCycleTime > 0) {
      const cycleTimeChange =
        (current.avgCycleTime - baseline.avgCycleTime) / baseline.avgCycleTime;

      if (cycleTimeChange > thresholds.cycleTimeIncrease) {
        const score = Math.min(100, cycleTimeChange * 200);
        indicators.push({
          type: 'cycle_time_increase',
          severity: this.scoreToSeverity(score),
          score,
          description: `Average cycle time has increased by ${Math.round(cycleTimeChange * 100)}%`,
          currentValue: current.avgCycleTime,
          baselineValue: baseline.avgCycleTime,
          changePercent: cycleTimeChange * 100,
          trend: 'degrading',
        });
      }
    }

    // 2. Throughput Decrease
    if (baseline.throughputPerDay > 0) {
      const throughputChange =
        (baseline.throughputPerDay - current.throughputPerDay) / baseline.throughputPerDay;

      if (throughputChange > thresholds.throughputDecrease) {
        const score = Math.min(100, throughputChange * 200);
        indicators.push({
          type: 'throughput_decrease',
          severity: this.scoreToSeverity(score),
          score,
          description: `Daily throughput has decreased by ${Math.round(throughputChange * 100)}%`,
          currentValue: current.throughputPerDay,
          baselineValue: baseline.throughputPerDay,
          changePercent: -throughputChange * 100,
          trend: 'degrading',
        });
      }
    }

    // 3. Error Rate Increase
    if (current.errorRate > 0) {
      const errorChange = baseline.errorRate > 0
        ? (current.errorRate - baseline.errorRate) / baseline.errorRate
        : current.errorRate;

      if (errorChange > thresholds.errorRateIncrease || current.errorRate > 0.1) {
        const score = Math.min(100, current.errorRate * 300 + errorChange * 50);
        indicators.push({
          type: 'error_rate_increase',
          severity: this.scoreToSeverity(score),
          score,
          description: `Error rate is ${Math.round(current.errorRate * 100)}% (${errorChange > 0 ? '+' : ''}${Math.round(errorChange * 100)}% vs baseline)`,
          currentValue: current.errorRate,
          baselineValue: baseline.errorRate,
          changePercent: errorChange * 100,
          trend: errorChange > 0 ? 'degrading' : 'stable',
        });
      }
    }

    // 4. Variance Increase (process becoming less predictable)
    if (baseline.cycleTimeVariance > 0) {
      const varianceChange =
        (current.cycleTimeVariance - baseline.cycleTimeVariance) / baseline.cycleTimeVariance;

      if (varianceChange > thresholds.varianceIncrease) {
        const score = Math.min(100, varianceChange * 150);
        indicators.push({
          type: 'variance_increase',
          severity: this.scoreToSeverity(score),
          score,
          description: `Cycle time variance has increased by ${Math.round(varianceChange * 100)}%`,
          currentValue: current.cycleTimeVariance,
          baselineValue: baseline.cycleTimeVariance,
          changePercent: varianceChange * 100,
          trend: 'degrading',
        });
      }
    }

    // 5. Bottleneck Worsening
    const newBottlenecks = current.bottleneckSteps.filter(
      (s) => !baseline.bottleneckSteps.includes(s)
    );
    if (newBottlenecks.length > 0) {
      const score = Math.min(100, newBottlenecks.length * 30);
      indicators.push({
        type: 'bottleneck_worsening',
        severity: this.scoreToSeverity(score),
        score,
        description: `${newBottlenecks.length} new bottleneck(s) identified: ${newBottlenecks.join(', ')}`,
        currentValue: current.bottleneckSteps.length,
        baselineValue: baseline.bottleneckSteps.length,
        changePercent:
          ((current.bottleneckSteps.length - baseline.bottleneckSteps.length) /
            Math.max(1, baseline.bottleneckSteps.length)) *
          100,
        trend: 'degrading',
      });
    }

    // 6. Step Skip Increase
    if (current.stepSkipRate > baseline.stepSkipRate) {
      const skipChange =
        baseline.stepSkipRate > 0
          ? (current.stepSkipRate - baseline.stepSkipRate) / baseline.stepSkipRate
          : current.stepSkipRate;

      if (skipChange > 0.2 || current.stepSkipRate > 0.15) {
        const score = Math.min(100, current.stepSkipRate * 200 + skipChange * 50);
        indicators.push({
          type: 'step_skip_increase',
          severity: this.scoreToSeverity(score),
          score,
          description: `Process step skip rate is ${Math.round(current.stepSkipRate * 100)}%`,
          currentValue: current.stepSkipRate,
          baselineValue: baseline.stepSkipRate,
          changePercent: skipChange * 100,
          trend: 'degrading',
        });
      }
    }

    // 7. Rework Rate Increase
    if (current.reworkRate > baseline.reworkRate) {
      const reworkChange =
        baseline.reworkRate > 0
          ? (current.reworkRate - baseline.reworkRate) / baseline.reworkRate
          : current.reworkRate;

      if (reworkChange > 0.2 || current.reworkRate > 0.1) {
        const score = Math.min(100, current.reworkRate * 300 + reworkChange * 50);
        indicators.push({
          type: 'rework_rate_increase',
          severity: this.scoreToSeverity(score),
          score,
          description: `Rework rate is ${Math.round(current.reworkRate * 100)}%`,
          currentValue: current.reworkRate,
          baselineValue: baseline.reworkRate,
          changePercent: reworkChange * 100,
          trend: 'degrading',
        });
      }
    }

    return indicators;
  }

  /**
   * Calculate overall health score
   */
  private calculateHealthScore(indicators: DegradationIndicator[]): number {
    if (indicators.length === 0) {
      return 100; // No degradation indicators = healthy
    }

    // Calculate degradation score and invert
    const weights: Record<DegradationIndicatorType, number> = {
      cycle_time_increase: 1.2,
      throughput_decrease: 1.3,
      error_rate_increase: 1.5,
      variance_increase: 0.8,
      bottleneck_worsening: 1.1,
      step_skip_increase: 1.0,
      rework_rate_increase: 1.2,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const indicator of indicators) {
      const weight = weights[indicator.type] || 1.0;
      weightedSum += indicator.score * weight;
      totalWeight += weight;
    }

    const degradationScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Add penalty for multiple indicators
    const indicatorPenalty = Math.min(20, (indicators.length - 1) * 5);

    return Math.max(0, 100 - degradationScore - indicatorPenalty);
  }

  /**
   * Determine degradation level from health score
   */
  private determineDegradationLevel(
    healthScore: number
  ): 'healthy' | 'warning' | 'degrading' | 'critical' {
    if (healthScore >= 80) return 'healthy';
    if (healthScore >= 60) return 'warning';
    if (healthScore >= 40) return 'degrading';
    return 'critical';
  }

  /**
   * Convert score to severity
   */
  private scoreToSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Predict failure probability and time
   */
  private predictFailure(
    indicators: DegradationIndicator[],
    current: ProcessMetricsWindow,
    baseline: ProcessMetricsWindow
  ): {
    failureRisk: number;
    timeToFailure?: { value: number; unit: 'days' | 'weeks' | 'months'; confidence: number };
  } {
    if (indicators.length === 0) {
      return { failureRisk: 0 };
    }

    // Base failure risk on indicator severity
    let failureRisk = 0;
    let degradationRate = 0;

    for (const indicator of indicators) {
      const severityWeight =
        indicator.severity === 'critical' ? 0.4 :
        indicator.severity === 'high' ? 0.3 :
        indicator.severity === 'medium' ? 0.2 : 0.1;

      failureRisk += severityWeight;

      if (indicator.trend === 'degrading' && indicator.changePercent > 0) {
        degradationRate += indicator.changePercent / 100;
      }
    }

    failureRisk = Math.min(1, failureRisk / indicators.length);

    // Estimate time to failure based on degradation rate
    let timeToFailure: { value: number; unit: 'days' | 'weeks' | 'months'; confidence: number } | undefined;

    if (degradationRate > 0 && failureRisk > 0.3) {
      // Simplified linear projection
      const avgDegradationPerWeek = degradationRate / 4; // Assuming 4-week lookback
      const remainingCapacity = 1 - failureRisk;
      const weeksToFailure = remainingCapacity / avgDegradationPerWeek;

      if (weeksToFailure < 2) {
        timeToFailure = { value: Math.round(weeksToFailure * 7), unit: 'days', confidence: 0.6 };
      } else if (weeksToFailure < 12) {
        timeToFailure = { value: Math.round(weeksToFailure), unit: 'weeks', confidence: 0.5 };
      } else {
        timeToFailure = { value: Math.round(weeksToFailure / 4), unit: 'months', confidence: 0.3 };
      }
    }

    return { failureRisk, timeToFailure };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    indicators: DegradationIndicator[],
    degradationLevel: string
  ): string[] {
    const recommendations: string[] = [];

    for (const indicator of indicators) {
      switch (indicator.type) {
        case 'cycle_time_increase':
          recommendations.push('Review process steps for inefficiencies or blockers');
          recommendations.push('Analyze resource allocation and capacity');
          break;

        case 'throughput_decrease':
          recommendations.push('Investigate capacity constraints and resource availability');
          recommendations.push('Review for process blockers or dependencies');
          break;

        case 'error_rate_increase':
          recommendations.push('Conduct root cause analysis for recent errors');
          recommendations.push('Review quality control checkpoints');
          recommendations.push('Consider additional training or documentation');
          break;

        case 'variance_increase':
          recommendations.push('Standardize process execution across participants');
          recommendations.push('Identify and address edge cases causing variability');
          break;

        case 'bottleneck_worsening':
          recommendations.push('Allocate additional resources to bottleneck steps');
          recommendations.push('Evaluate automation opportunities for bottleneck activities');
          break;

        case 'step_skip_increase':
          recommendations.push('Review if skipped steps are necessary');
          recommendations.push('Investigate why participants are circumventing process steps');
          break;

        case 'rework_rate_increase':
          recommendations.push('Analyze quality issues causing rework');
          recommendations.push('Implement earlier validation checkpoints');
          break;
      }
    }

    // Add urgency based on degradation level
    if (degradationLevel === 'critical') {
      recommendations.unshift('CRITICAL: Immediate process intervention required');
      recommendations.push('Consider temporary process halt for root cause analysis');
    } else if (degradationLevel === 'degrading') {
      recommendations.unshift('Schedule process review within the next week');
    }

    return [...new Set(recommendations)];
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    currentCases: number,
    baselineCases: number,
    minCases: number
  ): number {
    const currentScore = Math.min(1, currentCases / (minCases * 5)) * 0.4;
    const baselineScore = Math.min(1, baselineCases / (minCases * 10)) * 0.4;
    const minimumMet = currentCases >= minCases && baselineCases >= minCases ? 0.2 : 0;

    return currentScore + baselineScore + minimumMet;
  }
}

// Factory function
let degradationDetectorInstance: DegradationDetector | null = null;

export function createDegradationDetector(pool: Pool): DegradationDetector {
  if (!degradationDetectorInstance) {
    degradationDetectorInstance = new DegradationDetector(pool);
  }
  return degradationDetectorInstance;
}

export function resetDegradationDetector(): void {
  degradationDetectorInstance = null;
}
