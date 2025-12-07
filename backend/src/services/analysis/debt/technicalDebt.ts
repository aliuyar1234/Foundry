/**
 * Technical Debt Calculator
 * Calculates debt from system and integration issues
 * T254 - Technical debt calculation
 */

import { Pool } from 'pg';
import {
  TechnicalDebt,
  SubDimension,
  DebtIssue,
} from '../../../models/OrgDebtScore.js';

export interface TechnicalDebtOptions {
  organizationId: string;
  lookbackDays?: number;
}

/**
 * Calculate technical debt for an organization
 */
export async function calculateTechnicalDebt(
  pool: Pool,
  options: TechnicalDebtOptions
): Promise<TechnicalDebt> {
  const { organizationId, lookbackDays = 90 } = options;

  // Get technical metrics from database
  const metrics = await getTechnicalMetrics(pool, organizationId, lookbackDays);

  // Calculate sub-dimension scores
  const subDimensions = calculateSubDimensions(metrics);

  // Calculate overall technical debt score
  const score = calculateOverallScore(subDimensions);

  // Identify top issues
  const topIssues = await identifyTechnicalIssues(pool, organizationId, metrics);

  // Generate recommendations
  const recommendations = generateRecommendations(metrics, topIssues);

  // Determine trend
  const trend = await determineTrend(pool, organizationId, lookbackDays);

  return {
    name: 'technical',
    score,
    weight: 0.15,
    trend,
    subDimensions,
    topIssues,
    recommendations,
    metrics,
  };
}

/**
 * Get technical metrics from database
 */
async function getTechnicalMetrics(
  pool: Pool,
  organizationId: string,
  lookbackDays: number
): Promise<TechnicalDebt['metrics']> {
  // Get legacy system count
  const legacyResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM systems
    WHERE organization_id = $1
      AND (
        end_of_life_date < NOW()
        OR last_update < NOW() - INTERVAL '2 years'
        OR status = 'legacy'
      )
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get integration gap count
  const integrationResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM system_integration_gaps
    WHERE organization_id = $1
      AND status = 'open'
      AND severity IN ('high', 'critical')
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get manual data transfer count
  const manualTransferResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM data_transfers
    WHERE organization_id = $1
      AND transfer_method = 'manual'
      AND is_recurring = true
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get system downtime hours
  const downtimeResult = await pool.query(
    `
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0) as hours
    FROM system_incidents
    WHERE organization_id = $1
      AND incident_type = 'outage'
      AND start_time > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ hours: 0 }] }));

  // Get security vulnerability count
  const securityResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM security_vulnerabilities
    WHERE organization_id = $1
      AND status IN ('open', 'in_progress')
      AND severity IN ('high', 'critical')
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get maintenance burden score (based on incident frequency and fix time)
  const maintenanceResult = await pool.query(
    `
    SELECT
      COALESCE(
        (COUNT(*) * 5 + AVG(EXTRACT(EPOCH FROM resolution_time) / 3600) * 2)::float,
        0
      ) as burden_score
    FROM system_incidents
    WHERE organization_id = $1
      AND start_time > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ burden_score: 0 }] }));

  return {
    legacySystemCount: parseInt(legacyResult.rows[0]?.count || '0'),
    integrationGapCount: parseInt(integrationResult.rows[0]?.count || '0'),
    manualDataTransferCount: parseInt(manualTransferResult.rows[0]?.count || '0'),
    systemDowntimeHours: parseFloat(downtimeResult.rows[0]?.hours || '0'),
    securityVulnerabilityCount: parseInt(securityResult.rows[0]?.count || '0'),
    maintenanceBurdenScore: Math.min(100, parseFloat(maintenanceResult.rows[0]?.burden_score || '0')),
  };
}

/**
 * Calculate sub-dimension scores
 */
function calculateSubDimensions(metrics: TechnicalDebt['metrics']): SubDimension[] {
  return [
    {
      name: 'Legacy Systems',
      score: Math.min(100, metrics.legacySystemCount * 15),
      description: `${metrics.legacySystemCount} legacy systems requiring modernization`,
      impactLevel: metrics.legacySystemCount > 5 ? 'critical' :
                   metrics.legacySystemCount > 3 ? 'high' :
                   metrics.legacySystemCount > 1 ? 'medium' : 'low',
    },
    {
      name: 'System Integration',
      score: Math.min(100, metrics.integrationGapCount * 12),
      description: `${metrics.integrationGapCount} critical integration gaps identified`,
      impactLevel: metrics.integrationGapCount > 8 ? 'critical' :
                   metrics.integrationGapCount > 4 ? 'high' :
                   metrics.integrationGapCount > 2 ? 'medium' : 'low',
    },
    {
      name: 'Data Transfer Automation',
      score: Math.min(100, metrics.manualDataTransferCount * 10),
      description: `${metrics.manualDataTransferCount} recurring manual data transfers`,
      impactLevel: metrics.manualDataTransferCount > 10 ? 'critical' :
                   metrics.manualDataTransferCount > 5 ? 'high' :
                   metrics.manualDataTransferCount > 2 ? 'medium' : 'low',
    },
    {
      name: 'System Reliability',
      score: Math.min(100, metrics.systemDowntimeHours * 5),
      description: `${metrics.systemDowntimeHours.toFixed(1)} hours of downtime in lookback period`,
      impactLevel: metrics.systemDowntimeHours > 20 ? 'critical' :
                   metrics.systemDowntimeHours > 10 ? 'high' :
                   metrics.systemDowntimeHours > 5 ? 'medium' : 'low',
    },
    {
      name: 'Security Posture',
      score: Math.min(100, metrics.securityVulnerabilityCount * 20),
      description: `${metrics.securityVulnerabilityCount} high/critical security vulnerabilities`,
      impactLevel: metrics.securityVulnerabilityCount > 5 ? 'critical' :
                   metrics.securityVulnerabilityCount > 2 ? 'high' :
                   metrics.securityVulnerabilityCount > 0 ? 'medium' : 'low',
    },
    {
      name: 'Maintenance Burden',
      score: metrics.maintenanceBurdenScore,
      description: `Maintenance burden score of ${metrics.maintenanceBurdenScore.toFixed(0)}%`,
      impactLevel: metrics.maintenanceBurdenScore > 70 ? 'critical' :
                   metrics.maintenanceBurdenScore > 50 ? 'high' :
                   metrics.maintenanceBurdenScore > 30 ? 'medium' : 'low',
    },
  ];
}

/**
 * Calculate overall score from sub-dimensions
 */
function calculateOverallScore(subDimensions: SubDimension[]): number {
  const weights = [0.20, 0.20, 0.15, 0.15, 0.20, 0.10];
  let weightedSum = 0;
  let totalWeight = 0;

  subDimensions.forEach((dim, i) => {
    weightedSum += dim.score * weights[i];
    totalWeight += weights[i];
  });

  return Math.round(weightedSum / totalWeight);
}

/**
 * Identify specific technical issues
 */
async function identifyTechnicalIssues(
  pool: Pool,
  organizationId: string,
  metrics: TechnicalDebt['metrics']
): Promise<DebtIssue[]> {
  const issues: DebtIssue[] = [];

  // Legacy systems issue
  if (metrics.legacySystemCount > 0) {
    const legacyResult = await pool.query(
      `
      SELECT name, end_of_life_date, last_update
      FROM systems
      WHERE organization_id = $1
        AND (
          end_of_life_date < NOW()
          OR last_update < NOW() - INTERVAL '2 years'
          OR status = 'legacy'
        )
      ORDER BY end_of_life_date ASC NULLS LAST
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'tech-legacy-systems',
      title: 'Legacy Systems Requiring Modernization',
      description: `${metrics.legacySystemCount} systems are end-of-life or outdated, increasing security and maintenance risk`,
      severity: metrics.legacySystemCount > 5 ? 'critical' : 'high',
      estimatedCost: metrics.legacySystemCount * 100000, // Migration cost per system
      affectedEntities: legacyResult.rows.map((r: { name: string }) => r.name),
      suggestedAction: 'Develop modernization roadmap prioritizing critical business systems',
    });
  }

  // Integration gaps
  if (metrics.integrationGapCount > 2) {
    issues.push({
      id: 'tech-integration-gaps',
      title: 'System Integration Gaps',
      description: `${metrics.integrationGapCount} critical integration gaps causing data silos and manual workarounds`,
      severity: metrics.integrationGapCount > 8 ? 'critical' : 'high',
      estimatedCost: metrics.integrationGapCount * 25000,
      affectedEntities: [],
      suggestedAction: 'Implement integration middleware or API-based connections',
    });
  }

  // Manual data transfers
  if (metrics.manualDataTransferCount > 3) {
    issues.push({
      id: 'tech-manual-transfers',
      title: 'Manual Data Transfer Dependencies',
      description: `${metrics.manualDataTransferCount} recurring manual data transfers creating error risk and inefficiency`,
      severity: metrics.manualDataTransferCount > 10 ? 'critical' : 'high',
      estimatedCost: metrics.manualDataTransferCount * 15000, // Annual labor cost
      affectedEntities: [],
      suggestedAction: 'Automate data transfers using ETL tools or scheduled jobs',
    });
  }

  // System reliability
  if (metrics.systemDowntimeHours > 8) {
    issues.push({
      id: 'tech-reliability',
      title: 'System Reliability Issues',
      description: `${metrics.systemDowntimeHours.toFixed(1)} hours of system downtime impacting operations`,
      severity: metrics.systemDowntimeHours > 20 ? 'critical' : 'high',
      estimatedCost: metrics.systemDowntimeHours * 5000, // Cost per hour of downtime
      affectedEntities: [],
      suggestedAction: 'Implement redundancy, monitoring, and incident response procedures',
    });
  }

  // Security vulnerabilities
  if (metrics.securityVulnerabilityCount > 0) {
    const securityResult = await pool.query(
      `
      SELECT system_name, vulnerability_type, severity
      FROM security_vulnerabilities
      WHERE organization_id = $1
        AND status IN ('open', 'in_progress')
        AND severity IN ('high', 'critical')
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 END
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'tech-security',
      title: 'Unresolved Security Vulnerabilities',
      description: `${metrics.securityVulnerabilityCount} high/critical security vulnerabilities require immediate attention`,
      severity: 'critical',
      estimatedCost: metrics.securityVulnerabilityCount * 50000, // Potential breach cost
      affectedEntities: securityResult.rows.map(
        (r: { system_name: string; vulnerability_type: string }) =>
          `${r.system_name}: ${r.vulnerability_type}`
      ),
      suggestedAction: 'Prioritize security patching and implement vulnerability management program',
    });
  }

  // High maintenance burden
  if (metrics.maintenanceBurdenScore > 50) {
    issues.push({
      id: 'tech-maintenance',
      title: 'Excessive Maintenance Burden',
      description: `High maintenance burden (${metrics.maintenanceBurdenScore.toFixed(0)}%) consuming IT resources`,
      severity: metrics.maintenanceBurdenScore > 70 ? 'critical' : 'high',
      estimatedCost: metrics.maintenanceBurdenScore * 2000,
      affectedEntities: [],
      suggestedAction: 'Invest in system modernization and automation to reduce maintenance load',
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
  metrics: TechnicalDebt['metrics'],
  issues: DebtIssue[]
): string[] {
  const recommendations: string[] = [];

  if (metrics.legacySystemCount > 2) {
    recommendations.push('Create a system modernization roadmap with prioritized migration plan');
  }

  if (metrics.integrationGapCount > 3) {
    recommendations.push('Implement an integration platform to connect disparate systems');
  }

  if (metrics.manualDataTransferCount > 5) {
    recommendations.push('Deploy ETL/data integration tools to automate manual transfers');
  }

  if (metrics.systemDowntimeHours > 10) {
    recommendations.push('Implement high-availability architecture and monitoring systems');
  }

  if (metrics.securityVulnerabilityCount > 0) {
    recommendations.push('Establish vulnerability management program with regular scanning');
  }

  if (metrics.maintenanceBurdenScore > 40) {
    recommendations.push('Invest in DevOps practices and automation to reduce maintenance overhead');
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
      AND dimension = 'technical'
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
  const currentMetrics = await getTechnicalMetrics(pool, organizationId, lookbackDays);
  const currentScore = calculateOverallScore(calculateSubDimensions(currentMetrics));

  const change = currentScore - previousScore;

  if (change < -5) return 'improving';
  if (change > 5) return 'degrading';
  return 'stable';
}

export default { calculateTechnicalDebt };
