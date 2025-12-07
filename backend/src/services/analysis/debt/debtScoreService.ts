/**
 * Debt Score Service
 * Aggregates all debt dimensions into composite organizational debt score
 * T256 - Composite debt score aggregation
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  OrgDebtScore,
  DebtCalculationOptions,
  DEFAULT_WEIGHTS,
  scoreToGrade,
  Recommendation,
  DebtScoreHistory,
  DebtDimension,
} from '../../../models/OrgDebtScore.js';
import { calculateProcessDebt } from './processDebt.js';
import { calculateKnowledgeDebt } from './knowledgeDebt.js';
import { calculateDataDebt } from './dataDebt.js';
import { calculateTechnicalDebt } from './technicalDebt.js';
import { calculateCommunicationDebt } from './communicationDebt.js';
import { estimateDebtCost } from './costEstimator.js';

/**
 * Calculate complete organizational debt score
 */
export async function calculateOrgDebtScore(
  pool: Pool,
  options: DebtCalculationOptions
): Promise<OrgDebtScore> {
  const {
    organizationId,
    includeRecommendations = true,
    includeCostEstimate = true,
    lookbackDays = 90,
    customWeights,
  } = options;

  // Calculate all dimension scores in parallel
  const [processDebt, knowledgeDebt, dataDebt, technicalDebt, communicationDebt] =
    await Promise.all([
      calculateProcessDebt(pool, { organizationId, lookbackDays }),
      calculateKnowledgeDebt(pool, { organizationId, lookbackDays }),
      calculateDataDebt(pool, { organizationId, lookbackDays }),
      calculateTechnicalDebt(pool, { organizationId, lookbackDays }),
      calculateCommunicationDebt(pool, { organizationId, lookbackDays }),
    ]);

  const dimensions = {
    process: processDebt,
    knowledge: knowledgeDebt,
    data: dataDebt,
    technical: technicalDebt,
    communication: communicationDebt,
  };

  // Calculate weighted overall score
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...customWeights,
  };

  const overallScore = calculateWeightedScore(dimensions, weights);
  const overallGrade = scoreToGrade(overallScore);
  const overallTrend = determineOverallTrend(dimensions);

  // Get previous score for comparison
  const previousScoreData = await getPreviousScore(pool, organizationId);

  // Calculate cost estimate if requested
  const estimatedAnnualCost = includeCostEstimate
    ? await estimateDebtCost(pool, { organizationId, dimensions, ...options.costParameters })
    : {
        totalAnnualCost: 0,
        currency: 'EUR',
        breakdown: [],
        methodology: 'Not calculated',
        confidenceLevel: 'low' as const,
        assumptions: [],
      };

  // Generate prioritized recommendations
  const topRecommendations = includeRecommendations
    ? generatePrioritizedRecommendations(dimensions, estimatedAnnualCost)
    : [];

  // Get industry benchmark if available
  const benchmark = await getIndustryBenchmark(pool, organizationId);

  const score: OrgDebtScore = {
    id: uuidv4(),
    organizationId,
    calculatedAt: new Date(),
    overallScore,
    overallGrade,
    overallTrend,
    dimensions,
    estimatedAnnualCost,
    topRecommendations,
    previousScore: previousScoreData?.score,
    scoreChange: previousScoreData ? overallScore - previousScoreData.score : undefined,
    industryBenchmark: benchmark?.avgScore,
    benchmarkComparison: benchmark
      ? overallScore < benchmark.avgScore - 10
        ? 'below'
        : overallScore > benchmark.avgScore + 10
        ? 'above'
        : 'at'
      : undefined,
  };

  // Save score to history
  await saveScoreToHistory(pool, score);

  return score;
}

/**
 * Calculate weighted overall score from dimensions
 */
function calculateWeightedScore(
  dimensions: OrgDebtScore['dimensions'],
  weights: Record<string, number>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, dimension] of Object.entries(dimensions)) {
    const weight = weights[key] ?? dimension.weight;
    weightedSum += dimension.score * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

/**
 * Determine overall trend from dimension trends
 */
function determineOverallTrend(
  dimensions: OrgDebtScore['dimensions']
): 'improving' | 'stable' | 'degrading' {
  const trends = Object.values(dimensions).map((d) => d.trend);
  const improving = trends.filter((t) => t === 'improving').length;
  const degrading = trends.filter((t) => t === 'degrading').length;

  if (improving > degrading + 1) return 'improving';
  if (degrading > improving + 1) return 'degrading';
  return 'stable';
}

/**
 * Get previous score from history
 */
async function getPreviousScore(
  pool: Pool,
  organizationId: string
): Promise<{ score: number; date: Date } | null> {
  const result = await pool
    .query(
      `
    SELECT overall_score, calculated_at
    FROM org_debt_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT 1 OFFSET 1
    `,
      [organizationId]
    )
    .catch(() => ({ rows: [] }));

  if (result.rows.length === 0) {
    return null;
  }

  return {
    score: result.rows[0].overall_score,
    date: result.rows[0].calculated_at,
  };
}

/**
 * Get industry benchmark for comparison
 */
async function getIndustryBenchmark(
  pool: Pool,
  organizationId: string
): Promise<{ avgScore: number; industry: string } | null> {
  const result = await pool
    .query(
      `
    SELECT ib.avg_score, ib.industry
    FROM industry_benchmarks ib
    JOIN organizations o ON o.industry = ib.industry
    WHERE o.id = $1
      AND ib.metric_type = 'debt_score'
      AND ib.year = EXTRACT(YEAR FROM NOW())
    `,
      [organizationId]
    )
    .catch(() => ({ rows: [] }));

  if (result.rows.length === 0) {
    return null;
  }

  return {
    avgScore: result.rows[0].avg_score,
    industry: result.rows[0].industry,
  };
}

/**
 * Generate prioritized recommendations across all dimensions
 */
function generatePrioritizedRecommendations(
  dimensions: OrgDebtScore['dimensions'],
  costEstimate: OrgDebtScore['estimatedAnnualCost']
): Recommendation[] {
  const allRecommendations: Recommendation[] = [];
  let priority = 1;

  // Collect all issues from all dimensions
  const allIssues: Array<{
    dimension: string;
    issue: DebtDimension['topIssues'][0];
    dimensionScore: number;
  }> = [];

  for (const [dimensionName, dimension] of Object.entries(dimensions)) {
    for (const issue of dimension.topIssues) {
      allIssues.push({
        dimension: dimensionName,
        issue,
        dimensionScore: dimension.score,
      });
    }
  }

  // Sort by severity and dimension score
  allIssues.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const severityDiff = severityOrder[a.issue.severity] - severityOrder[b.issue.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.dimensionScore - a.dimensionScore;
  });

  // Convert top issues to recommendations
  for (const { dimension, issue, dimensionScore } of allIssues.slice(0, 10)) {
    const estimatedCostSavings = issue.estimatedCost ?? dimensionScore * 1000;
    const scoreReduction = Math.min(15, Math.round(dimensionScore * 0.2));

    allRecommendations.push({
      id: `rec-${issue.id}`,
      priority: priority++,
      title: issue.title,
      description: issue.suggestedAction,
      dimension,
      estimatedImpact: {
        scoreReduction,
        costSavings: estimatedCostSavings,
        timeToValue: getTimeToValue(issue.severity),
      },
      effort: getEffort(issue.severity, estimatedCostSavings),
      complexity: getComplexity(issue.severity),
      prerequisites: [],
      relatedIssues: [issue.id],
    });
  }

  return allRecommendations;
}

/**
 * Get time to value based on severity
 */
function getTimeToValue(severity: string): string {
  switch (severity) {
    case 'critical':
      return '1-2 months';
    case 'high':
      return '2-4 months';
    case 'medium':
      return '4-6 months';
    default:
      return '6+ months';
  }
}

/**
 * Get effort level based on severity and cost
 */
function getEffort(
  severity: string,
  cost: number
): 'low' | 'medium' | 'high' {
  if (cost > 50000 || severity === 'critical') return 'high';
  if (cost > 20000 || severity === 'high') return 'medium';
  return 'low';
}

/**
 * Get complexity based on severity
 */
function getComplexity(severity: string): 'simple' | 'moderate' | 'complex' {
  switch (severity) {
    case 'critical':
      return 'complex';
    case 'high':
      return 'moderate';
    default:
      return 'simple';
  }
}

/**
 * Save score to history for trend tracking
 */
async function saveScoreToHistory(pool: Pool, score: OrgDebtScore): Promise<void> {
  await pool
    .query(
      `
    INSERT INTO org_debt_scores (
      id, organization_id, calculated_at, overall_score, overall_grade,
      process_score, knowledge_score, data_score, technical_score, communication_score,
      estimated_annual_cost, score_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
        score.id,
        score.organizationId,
        score.calculatedAt,
        score.overallScore,
        score.overallGrade,
        score.dimensions.process.score,
        score.dimensions.knowledge.score,
        score.dimensions.data.score,
        score.dimensions.technical.score,
        score.dimensions.communication.score,
        score.estimatedAnnualCost.totalAnnualCost,
        JSON.stringify(score),
      ]
    )
    .catch((err) => {
      console.error('Failed to save debt score to history:', err);
    });

  // Also save individual dimension scores for trend tracking
  for (const [dimension, data] of Object.entries(score.dimensions)) {
    await pool
      .query(
        `
      INSERT INTO debt_score_history (
        organization_id, dimension, score, calculated_at
      ) VALUES ($1, $2, $3, $4)
      `,
        [score.organizationId, dimension, data.score, score.calculatedAt]
      )
      .catch(() => {});
  }
}

/**
 * Get debt score history for an organization
 */
export async function getDebtScoreHistory(
  pool: Pool,
  organizationId: string,
  limit: number = 12
): Promise<DebtScoreHistory[]> {
  const result = await pool
    .query(
      `
    SELECT
      calculated_at as date,
      overall_score,
      process_score,
      knowledge_score,
      data_score,
      technical_score,
      communication_score
    FROM org_debt_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT $2
    `,
      [organizationId, limit]
    )
    .catch(() => ({ rows: [] }));

  return result.rows.map((row) => ({
    date: row.date,
    overallScore: row.overall_score,
    dimensionScores: {
      process: row.process_score,
      knowledge: row.knowledge_score,
      data: row.data_score,
      technical: row.technical_score,
      communication: row.communication_score,
    },
  }));
}

/**
 * Get latest debt score for an organization
 */
export async function getLatestDebtScore(
  pool: Pool,
  organizationId: string
): Promise<OrgDebtScore | null> {
  const result = await pool
    .query(
      `
    SELECT score_data
    FROM org_debt_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT 1
    `,
      [organizationId]
    )
    .catch(() => ({ rows: [] }));

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].score_data as OrgDebtScore;
}

/**
 * Get debt score comparison between organizations
 */
export async function compareDebtScores(
  pool: Pool,
  organizationIds: string[]
): Promise<Map<string, OrgDebtScore>> {
  const scores = new Map<string, OrgDebtScore>();

  await Promise.all(
    organizationIds.map(async (orgId) => {
      const score = await getLatestDebtScore(pool, orgId);
      if (score) {
        scores.set(orgId, score);
      }
    })
  );

  return scores;
}

export default {
  calculateOrgDebtScore,
  getDebtScoreHistory,
  getLatestDebtScore,
  compareDebtScores,
};
