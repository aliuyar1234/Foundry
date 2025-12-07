/**
 * Data Debt Calculator
 * Calculates debt from data quality and management issues
 * T253 - Data debt calculation
 */

import { Pool } from 'pg';
import {
  DataDebt,
  SubDimension,
  DebtIssue,
} from '../../../models/OrgDebtScore.js';

export interface DataDebtOptions {
  organizationId: string;
  lookbackDays?: number;
}

/**
 * Calculate data debt for an organization
 */
export async function calculateDataDebt(
  pool: Pool,
  options: DataDebtOptions
): Promise<DataDebt> {
  const { organizationId, lookbackDays = 90 } = options;

  // Get data metrics from database
  const metrics = await getDataMetrics(pool, organizationId, lookbackDays);

  // Calculate sub-dimension scores
  const subDimensions = calculateSubDimensions(metrics);

  // Calculate overall data debt score
  const score = calculateOverallScore(subDimensions);

  // Identify top issues
  const topIssues = await identifyDataIssues(pool, organizationId, metrics);

  // Generate recommendations
  const recommendations = generateRecommendations(metrics, topIssues);

  // Determine trend
  const trend = await determineTrend(pool, organizationId, lookbackDays);

  return {
    name: 'data',
    score,
    weight: 0.20,
    trend,
    subDimensions,
    topIssues,
    recommendations,
    metrics,
  };
}

/**
 * Get data metrics from database
 */
async function getDataMetrics(
  pool: Pool,
  organizationId: string,
  lookbackDays: number
): Promise<DataDebt['metrics']> {
  // Get duplicate record rate
  const duplicateResult = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE duplicate_of IS NOT NULL)::float /
      NULLIF(COUNT(*), 0) * 100 as duplicate_rate
    FROM entity_records
    WHERE organization_id = $1
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ duplicate_rate: 0 }] }));

  // Get data quality score from quality metrics
  const qualityResult = await pool.query(
    `
    SELECT AVG(quality_score) as avg_quality
    FROM data_quality_metrics
    WHERE organization_id = $1
      AND measured_at > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ avg_quality: 70 }] }));

  // Get inconsistent field count
  const inconsistentResult = await pool.query(
    `
    SELECT COUNT(DISTINCT field_name) as count
    FROM data_quality_issues
    WHERE organization_id = $1
      AND issue_type = 'inconsistent'
      AND detected_at > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get missing critical fields
  const missingResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM data_quality_issues
    WHERE organization_id = $1
      AND issue_type = 'missing_required'
      AND severity = 'critical'
      AND detected_at > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get stale data percentage
  const staleResult = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '365 days')::float /
      NULLIF(COUNT(*), 0) * 100 as stale_pct
    FROM entity_records
    WHERE organization_id = $1
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ stale_pct: 0 }] }));

  // Get data source fragmentation
  const fragmentationResult = await pool.query(
    `
    SELECT COUNT(DISTINCT ds.id) as source_count,
           COUNT(DISTINCT ds.id) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM data_source_links dsl
             WHERE dsl.source_id = ds.id OR dsl.target_id = ds.id
           )) as isolated_sources
    FROM data_sources ds
    WHERE ds.organization_id = $1
      AND ds.status = 'active'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ source_count: 1, isolated_sources: 0 }] }));

  return {
    duplicateRecordRate: parseFloat(duplicateResult.rows[0]?.duplicate_rate || '0'),
    dataQualityScore: parseFloat(qualityResult.rows[0]?.avg_quality || '70'),
    inconsistentFieldCount: parseInt(inconsistentResult.rows[0]?.count || '0'),
    missingCriticalFields: parseInt(missingResult.rows[0]?.count || '0'),
    staleDataPercentage: parseFloat(staleResult.rows[0]?.stale_pct || '0'),
    dataSourceFragmentation: parseInt(fragmentationResult.rows[0]?.isolated_sources || '0'),
  };
}

/**
 * Calculate sub-dimension scores
 */
function calculateSubDimensions(metrics: DataDebt['metrics']): SubDimension[] {
  // Convert quality score (0-100 where 100=good) to debt score (0-100 where 100=bad)
  const qualityDebtScore = 100 - metrics.dataQualityScore;

  return [
    {
      name: 'Duplicate Data',
      score: Math.min(100, metrics.duplicateRecordRate * 5), // 20% duplicates = 100 score
      description: `${metrics.duplicateRecordRate.toFixed(1)}% of records are duplicates`,
      impactLevel: metrics.duplicateRecordRate > 15 ? 'critical' :
                   metrics.duplicateRecordRate > 10 ? 'high' :
                   metrics.duplicateRecordRate > 5 ? 'medium' : 'low',
    },
    {
      name: 'Data Quality',
      score: qualityDebtScore,
      description: `Overall data quality score of ${metrics.dataQualityScore.toFixed(0)}%`,
      impactLevel: metrics.dataQualityScore < 50 ? 'critical' :
                   metrics.dataQualityScore < 70 ? 'high' :
                   metrics.dataQualityScore < 85 ? 'medium' : 'low',
    },
    {
      name: 'Data Consistency',
      score: Math.min(100, metrics.inconsistentFieldCount * 8),
      description: `${metrics.inconsistentFieldCount} fields have consistency issues`,
      impactLevel: metrics.inconsistentFieldCount > 10 ? 'critical' :
                   metrics.inconsistentFieldCount > 5 ? 'high' :
                   metrics.inconsistentFieldCount > 2 ? 'medium' : 'low',
    },
    {
      name: 'Data Completeness',
      score: Math.min(100, metrics.missingCriticalFields * 10),
      description: `${metrics.missingCriticalFields} critical fields are missing data`,
      impactLevel: metrics.missingCriticalFields > 10 ? 'critical' :
                   metrics.missingCriticalFields > 5 ? 'high' :
                   metrics.missingCriticalFields > 2 ? 'medium' : 'low',
    },
    {
      name: 'Data Freshness',
      score: Math.min(100, metrics.staleDataPercentage * 2), // 50% stale = 100 score
      description: `${metrics.staleDataPercentage.toFixed(0)}% of data is over 1 year old`,
      impactLevel: metrics.staleDataPercentage > 40 ? 'critical' :
                   metrics.staleDataPercentage > 25 ? 'high' :
                   metrics.staleDataPercentage > 10 ? 'medium' : 'low',
    },
    {
      name: 'Data Integration',
      score: Math.min(100, metrics.dataSourceFragmentation * 15),
      description: `${metrics.dataSourceFragmentation} data sources are not integrated`,
      impactLevel: metrics.dataSourceFragmentation > 5 ? 'critical' :
                   metrics.dataSourceFragmentation > 3 ? 'high' :
                   metrics.dataSourceFragmentation > 1 ? 'medium' : 'low',
    },
  ];
}

/**
 * Calculate overall score from sub-dimensions
 */
function calculateOverallScore(subDimensions: SubDimension[]): number {
  const weights = [0.20, 0.25, 0.15, 0.20, 0.10, 0.10];
  let weightedSum = 0;
  let totalWeight = 0;

  subDimensions.forEach((dim, i) => {
    weightedSum += dim.score * weights[i];
    totalWeight += weights[i];
  });

  return Math.round(weightedSum / totalWeight);
}

/**
 * Identify specific data issues
 */
async function identifyDataIssues(
  pool: Pool,
  organizationId: string,
  metrics: DataDebt['metrics']
): Promise<DebtIssue[]> {
  const issues: DebtIssue[] = [];

  // Duplicate records issue
  if (metrics.duplicateRecordRate > 5) {
    const duplicateResult = await pool.query(
      `
      SELECT entity_type, COUNT(*) as count
      FROM entity_records
      WHERE organization_id = $1
        AND duplicate_of IS NOT NULL
      GROUP BY entity_type
      ORDER BY count DESC
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'data-duplicates',
      title: 'High Duplicate Record Rate',
      description: `${metrics.duplicateRecordRate.toFixed(1)}% of records are duplicates, wasting storage and causing confusion`,
      severity: metrics.duplicateRecordRate > 15 ? 'critical' : 'high',
      estimatedCost: metrics.duplicateRecordRate * 1000, // Cost of maintaining duplicates
      affectedEntities: duplicateResult.rows.map((r: { entity_type: string; count: number }) =>
        `${r.entity_type}: ${r.count} duplicates`
      ),
      suggestedAction: 'Run deduplication process and implement duplicate prevention rules',
    });
  }

  // Low data quality
  if (metrics.dataQualityScore < 70) {
    issues.push({
      id: 'data-quality-low',
      title: 'Low Data Quality Score',
      description: `Overall data quality at ${metrics.dataQualityScore.toFixed(0)}% is below acceptable threshold`,
      severity: metrics.dataQualityScore < 50 ? 'critical' : 'high',
      estimatedCost: (100 - metrics.dataQualityScore) * 500,
      affectedEntities: [],
      suggestedAction: 'Implement data quality rules and validation at entry points',
    });
  }

  // Inconsistent data
  if (metrics.inconsistentFieldCount > 5) {
    const inconsistentResult = await pool.query(
      `
      SELECT field_name, COUNT(*) as issue_count
      FROM data_quality_issues
      WHERE organization_id = $1
        AND issue_type = 'inconsistent'
      GROUP BY field_name
      ORDER BY issue_count DESC
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'data-inconsistent',
      title: 'Data Consistency Issues',
      description: `${metrics.inconsistentFieldCount} fields have inconsistent data formats or values`,
      severity: metrics.inconsistentFieldCount > 10 ? 'critical' : 'high',
      estimatedCost: metrics.inconsistentFieldCount * 2000,
      affectedEntities: inconsistentResult.rows.map((r: { field_name: string }) => r.field_name),
      suggestedAction: 'Standardize data formats and implement validation rules',
    });
  }

  // Missing critical data
  if (metrics.missingCriticalFields > 5) {
    issues.push({
      id: 'data-missing-critical',
      title: 'Missing Critical Data',
      description: `${metrics.missingCriticalFields} instances of missing critical field data`,
      severity: metrics.missingCriticalFields > 10 ? 'critical' : 'high',
      estimatedCost: metrics.missingCriticalFields * 3000,
      affectedEntities: [],
      suggestedAction: 'Identify and fill critical data gaps, implement required field validation',
    });
  }

  // Stale data
  if (metrics.staleDataPercentage > 20) {
    issues.push({
      id: 'data-stale',
      title: 'Stale Data Accumulation',
      description: `${metrics.staleDataPercentage.toFixed(0)}% of data hasn't been updated in over a year`,
      severity: metrics.staleDataPercentage > 40 ? 'critical' : 'high',
      estimatedCost: metrics.staleDataPercentage * 200,
      affectedEntities: [],
      suggestedAction: 'Review and archive stale records, implement data freshness policies',
    });
  }

  // Fragmented data sources
  if (metrics.dataSourceFragmentation > 2) {
    issues.push({
      id: 'data-fragmentation',
      title: 'Data Source Fragmentation',
      description: `${metrics.dataSourceFragmentation} data sources are not integrated, creating silos`,
      severity: metrics.dataSourceFragmentation > 5 ? 'critical' : 'high',
      estimatedCost: metrics.dataSourceFragmentation * 15000,
      affectedEntities: [],
      suggestedAction: 'Develop data integration strategy and consolidate sources',
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
  metrics: DataDebt['metrics'],
  issues: DebtIssue[]
): string[] {
  const recommendations: string[] = [];

  if (metrics.duplicateRecordRate > 5) {
    recommendations.push('Implement automated deduplication with fuzzy matching');
  }

  if (metrics.dataQualityScore < 80) {
    recommendations.push('Establish data quality KPIs and monitoring dashboards');
  }

  if (metrics.inconsistentFieldCount > 3) {
    recommendations.push('Create data dictionary and enforce standardization');
  }

  if (metrics.missingCriticalFields > 3) {
    recommendations.push('Audit required fields and implement mandatory validation');
  }

  if (metrics.staleDataPercentage > 15) {
    recommendations.push('Implement data lifecycle management and archival policies');
  }

  if (metrics.dataSourceFragmentation > 2) {
    recommendations.push('Develop master data management strategy');
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
      AND dimension = 'data'
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
  const currentMetrics = await getDataMetrics(pool, organizationId, lookbackDays);
  const currentScore = calculateOverallScore(calculateSubDimensions(currentMetrics));

  const change = currentScore - previousScore;

  if (change < -5) return 'improving';
  if (change > 5) return 'degrading';
  return 'stable';
}

export default { calculateDataDebt };
