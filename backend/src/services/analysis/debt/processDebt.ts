/**
 * Process Debt Calculator
 * Calculates debt from process inefficiencies
 * T251 - Process debt calculation
 */

import { Pool } from 'pg';
import {
  ProcessDebt,
  SubDimension,
  DebtIssue,
} from '../../../models/OrgDebtScore.js';

export interface ProcessDebtOptions {
  organizationId: string;
  lookbackDays?: number;
}

/**
 * Calculate process debt for an organization
 */
export async function calculateProcessDebt(
  pool: Pool,
  options: ProcessDebtOptions
): Promise<ProcessDebt> {
  const { organizationId, lookbackDays = 90 } = options;

  // Get process metrics from database
  const metrics = await getProcessMetrics(pool, organizationId, lookbackDays);

  // Calculate sub-dimension scores
  const subDimensions = calculateSubDimensions(metrics);

  // Calculate overall process debt score
  const score = calculateOverallScore(subDimensions);

  // Identify top issues
  const topIssues = await identifyProcessIssues(pool, organizationId, metrics);

  // Generate recommendations
  const recommendations = generateRecommendations(metrics, topIssues);

  // Determine trend (compare to previous period)
  const trend = await determineTrend(pool, organizationId, lookbackDays);

  return {
    name: 'process',
    score,
    weight: 0.25,
    trend,
    subDimensions,
    topIssues,
    recommendations,
    metrics,
  };
}

/**
 * Get process metrics from database
 */
async function getProcessMetrics(
  pool: Pool,
  organizationId: string,
  lookbackDays: number
): Promise<ProcessDebt['metrics']> {
  // Get undocumented process count
  const undocumentedResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM processes
    WHERE organization_id = $1
      AND (documentation IS NULL OR documentation = '' OR documentation_quality < 30)
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get process variation score
  const variationResult = await pool.query(
    `
    SELECT AVG(variation_score) as avg_variation
    FROM process_executions
    WHERE organization_id = $1
      AND executed_at > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ avg_variation: 0 }] }));

  // Get bottleneck count
  const bottleneckResult = await pool.query(
    `
    SELECT COUNT(DISTINCT step_id) as count
    FROM process_bottlenecks
    WHERE organization_id = $1
      AND detected_at > NOW() - INTERVAL '${lookbackDays} days'
      AND severity IN ('high', 'critical')
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get cycle time delay
  const cycleTimeResult = await pool.query(
    `
    SELECT
      AVG(actual_duration - expected_duration) / NULLIF(expected_duration, 0) * 100 as delay_pct
    FROM process_executions
    WHERE organization_id = $1
      AND executed_at > NOW() - INTERVAL '${lookbackDays} days'
      AND expected_duration > 0
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ delay_pct: 0 }] }));

  // Get manual step ratio
  const manualStepsResult = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE is_manual = true)::float / NULLIF(COUNT(*), 0) * 100 as manual_ratio
    FROM process_steps
    WHERE organization_id = $1
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ manual_ratio: 50 }] }));

  // Get rework rate
  const reworkResult = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE is_rework = true)::float / NULLIF(COUNT(*), 0) * 100 as rework_rate
    FROM process_executions
    WHERE organization_id = $1
      AND executed_at > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ rework_rate: 0 }] }));

  return {
    undocumentedProcessCount: parseInt(undocumentedResult.rows[0]?.count || '0'),
    processVariationScore: parseFloat(variationResult.rows[0]?.avg_variation || '0'),
    bottleneckCount: parseInt(bottleneckResult.rows[0]?.count || '0'),
    avgCycleTimeDelay: Math.max(0, parseFloat(cycleTimeResult.rows[0]?.delay_pct || '0')),
    manualStepRatio: parseFloat(manualStepsResult.rows[0]?.manual_ratio || '50'),
    reworkRate: parseFloat(reworkResult.rows[0]?.rework_rate || '0'),
  };
}

/**
 * Calculate sub-dimension scores
 */
function calculateSubDimensions(metrics: ProcessDebt['metrics']): SubDimension[] {
  return [
    {
      name: 'Documentation',
      score: Math.min(100, metrics.undocumentedProcessCount * 5),
      description: `${metrics.undocumentedProcessCount} processes lack proper documentation`,
      impactLevel: metrics.undocumentedProcessCount > 10 ? 'critical' :
                   metrics.undocumentedProcessCount > 5 ? 'high' :
                   metrics.undocumentedProcessCount > 2 ? 'medium' : 'low',
    },
    {
      name: 'Standardization',
      score: Math.min(100, metrics.processVariationScore),
      description: `Process variation score of ${metrics.processVariationScore.toFixed(0)}%`,
      impactLevel: metrics.processVariationScore > 50 ? 'critical' :
                   metrics.processVariationScore > 30 ? 'high' :
                   metrics.processVariationScore > 15 ? 'medium' : 'low',
    },
    {
      name: 'Flow Efficiency',
      score: Math.min(100, metrics.bottleneckCount * 10 + metrics.avgCycleTimeDelay / 2),
      description: `${metrics.bottleneckCount} bottlenecks, ${metrics.avgCycleTimeDelay.toFixed(0)}% cycle time delay`,
      impactLevel: metrics.bottleneckCount > 5 ? 'critical' :
                   metrics.bottleneckCount > 3 ? 'high' :
                   metrics.bottleneckCount > 1 ? 'medium' : 'low',
    },
    {
      name: 'Automation',
      score: Math.min(100, metrics.manualStepRatio),
      description: `${metrics.manualStepRatio.toFixed(0)}% of process steps are manual`,
      impactLevel: metrics.manualStepRatio > 80 ? 'critical' :
                   metrics.manualStepRatio > 60 ? 'high' :
                   metrics.manualStepRatio > 40 ? 'medium' : 'low',
    },
    {
      name: 'Quality',
      score: Math.min(100, metrics.reworkRate * 3),
      description: `${metrics.reworkRate.toFixed(1)}% rework rate`,
      impactLevel: metrics.reworkRate > 20 ? 'critical' :
                   metrics.reworkRate > 10 ? 'high' :
                   metrics.reworkRate > 5 ? 'medium' : 'low',
    },
  ];
}

/**
 * Calculate overall score from sub-dimensions
 */
function calculateOverallScore(subDimensions: SubDimension[]): number {
  const weights = [0.20, 0.20, 0.25, 0.20, 0.15]; // Documentation, Standardization, Flow, Automation, Quality
  let weightedSum = 0;
  let totalWeight = 0;

  subDimensions.forEach((dim, i) => {
    weightedSum += dim.score * weights[i];
    totalWeight += weights[i];
  });

  return Math.round(weightedSum / totalWeight);
}

/**
 * Identify specific process issues
 */
async function identifyProcessIssues(
  pool: Pool,
  organizationId: string,
  metrics: ProcessDebt['metrics']
): Promise<DebtIssue[]> {
  const issues: DebtIssue[] = [];

  // Undocumented processes issue
  if (metrics.undocumentedProcessCount > 0) {
    const undocumentedResult = await pool.query(
      `
      SELECT id, name FROM processes
      WHERE organization_id = $1
        AND (documentation IS NULL OR documentation = '')
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'process-undocumented',
      title: 'Undocumented Processes',
      description: `${metrics.undocumentedProcessCount} processes lack documentation, creating knowledge gaps and onboarding challenges`,
      severity: metrics.undocumentedProcessCount > 10 ? 'critical' : 'high',
      estimatedCost: metrics.undocumentedProcessCount * 5000, // Estimated annual cost per undocumented process
      affectedEntities: undocumentedResult.rows.map((r: { name: string }) => r.name),
      suggestedAction: 'Prioritize documentation for critical processes using SOPs',
    });
  }

  // Bottleneck issues
  if (metrics.bottleneckCount > 0) {
    issues.push({
      id: 'process-bottlenecks',
      title: 'Process Bottlenecks',
      description: `${metrics.bottleneckCount} significant bottlenecks causing delays and inefficiencies`,
      severity: metrics.bottleneckCount > 5 ? 'critical' : metrics.bottleneckCount > 2 ? 'high' : 'medium',
      estimatedCost: metrics.bottleneckCount * 10000,
      affectedEntities: [],
      suggestedAction: 'Analyze bottleneck root causes and implement process improvements',
    });
  }

  // High manual work
  if (metrics.manualStepRatio > 60) {
    issues.push({
      id: 'process-manual-heavy',
      title: 'High Manual Work Load',
      description: `${metrics.manualStepRatio.toFixed(0)}% of process steps are manual, reducing efficiency and increasing error risk`,
      severity: metrics.manualStepRatio > 80 ? 'critical' : 'high',
      estimatedCost: metrics.manualStepRatio * 500,
      affectedEntities: [],
      suggestedAction: 'Identify automation opportunities for repetitive manual tasks',
    });
  }

  // High rework
  if (metrics.reworkRate > 10) {
    issues.push({
      id: 'process-high-rework',
      title: 'Excessive Rework',
      description: `${metrics.reworkRate.toFixed(1)}% rework rate indicates quality issues in process execution`,
      severity: metrics.reworkRate > 20 ? 'critical' : 'high',
      estimatedCost: metrics.reworkRate * 2000,
      affectedEntities: [],
      suggestedAction: 'Implement quality checkpoints and root cause analysis',
    });
  }

  return issues.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Generate recommendations based on metrics
 */
function generateRecommendations(
  metrics: ProcessDebt['metrics'],
  issues: DebtIssue[]
): string[] {
  const recommendations: string[] = [];

  if (metrics.undocumentedProcessCount > 5) {
    recommendations.push('Launch a process documentation initiative starting with customer-facing processes');
  }

  if (metrics.processVariationScore > 30) {
    recommendations.push('Standardize high-variation processes through SOPs and training');
  }

  if (metrics.bottleneckCount > 2) {
    recommendations.push('Conduct bottleneck analysis and implement parallel processing where possible');
  }

  if (metrics.manualStepRatio > 50) {
    recommendations.push('Evaluate RPA tools for automating repetitive manual tasks');
  }

  if (metrics.reworkRate > 10) {
    recommendations.push('Implement quality gates and checklist validation in critical processes');
  }

  if (metrics.avgCycleTimeDelay > 20) {
    recommendations.push('Review process SLAs and eliminate non-value-adding wait times');
  }

  return recommendations.slice(0, 5);
}

/**
 * Determine score trend compared to previous period
 */
async function determineTrend(
  pool: Pool,
  organizationId: string,
  lookbackDays: number
): Promise<'improving' | 'stable' | 'degrading'> {
  const result = await pool.query(
    `
    SELECT score
    FROM debt_score_history
    WHERE organization_id = $1
      AND dimension = 'process'
      AND calculated_at < NOW() - INTERVAL '${lookbackDays} days'
    ORDER BY calculated_at DESC
    LIMIT 1
    `,
    [organizationId]
  ).catch(() => ({ rows: [] }));

  if (result.rows.length === 0) {
    return 'stable';
  }

  const previousScore = result.rows[0].score;
  const currentMetrics = await getProcessMetrics(pool, organizationId, lookbackDays);
  const currentScore = calculateOverallScore(calculateSubDimensions(currentMetrics));

  const change = currentScore - previousScore;

  if (change < -5) return 'improving';
  if (change > 5) return 'degrading';
  return 'stable';
}

export default { calculateProcessDebt };
