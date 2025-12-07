/**
 * Knowledge Debt Calculator
 * Calculates debt from knowledge management gaps
 * T252 - Knowledge debt calculation
 */

import { Pool } from 'pg';
import {
  KnowledgeDebt,
  SubDimension,
  DebtIssue,
} from '../../../models/OrgDebtScore.js';

export interface KnowledgeDebtOptions {
  organizationId: string;
  lookbackDays?: number;
}

/**
 * Calculate knowledge debt for an organization
 */
export async function calculateKnowledgeDebt(
  pool: Pool,
  options: KnowledgeDebtOptions
): Promise<KnowledgeDebt> {
  const { organizationId, lookbackDays = 90 } = options;

  // Get knowledge metrics from database
  const metrics = await getKnowledgeMetrics(pool, organizationId, lookbackDays);

  // Calculate sub-dimension scores
  const subDimensions = calculateSubDimensions(metrics);

  // Calculate overall knowledge debt score
  const score = calculateOverallScore(subDimensions);

  // Identify top issues
  const topIssues = await identifyKnowledgeIssues(pool, organizationId, metrics);

  // Generate recommendations
  const recommendations = generateRecommendations(metrics, topIssues);

  // Determine trend
  const trend = await determineTrend(pool, organizationId, lookbackDays);

  return {
    name: 'knowledge',
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
 * Get knowledge metrics from database
 */
async function getKnowledgeMetrics(
  pool: Pool,
  organizationId: string,
  lookbackDays: number
): Promise<KnowledgeDebt['metrics']> {
  // Get single points of failure (people who are sole experts)
  const spofResult = await pool.query(
    `
    SELECT COUNT(DISTINCT person_id) as count
    FROM person_expertise pe
    WHERE pe.organization_id = $1
      AND pe.expertise_level >= 80
      AND NOT EXISTS (
        SELECT 1 FROM person_expertise pe2
        WHERE pe2.organization_id = $1
          AND pe2.domain = pe.domain
          AND pe2.person_id != pe.person_id
          AND pe2.expertise_level >= 50
      )
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get undocumented expertise areas
  const undocumentedResult = await pool.query(
    `
    SELECT COUNT(DISTINCT domain) as count
    FROM person_expertise
    WHERE organization_id = $1
      AND expertise_level >= 70
      AND domain NOT IN (
        SELECT DISTINCT category FROM knowledge_documents
        WHERE organization_id = $1
      )
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get average bus factor
  const busFactorResult = await pool.query(
    `
    SELECT AVG(bus_factor) as avg_bus_factor
    FROM domain_bus_factors
    WHERE organization_id = $1
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ avg_bus_factor: 2.5 }] }));

  // Get knowledge silo count (departments with low cross-sharing)
  const siloResult = await pool.query(
    `
    SELECT COUNT(DISTINCT department) as count
    FROM (
      SELECT p.department,
             COUNT(DISTINCT kd.id) as doc_count,
             COUNT(DISTINCT ka.accessed_by) as accessor_count
      FROM persons p
      LEFT JOIN knowledge_documents kd ON kd.created_by = p.id
      LEFT JOIN knowledge_access ka ON ka.document_id = kd.id
      WHERE p.organization_id = $1
        AND p.department IS NOT NULL
      GROUP BY p.department
      HAVING COUNT(DISTINCT ka.accessed_by) < 3 OR COUNT(DISTINCT kd.id) < 5
    ) silos
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  // Get expertise concentration score
  const concentrationResult = await pool.query(
    `
    SELECT
      COALESCE(
        (SELECT MAX(expertise_count)::float / NULLIF(COUNT(DISTINCT person_id), 0) * 100
         FROM (
           SELECT person_id, COUNT(*) as expertise_count
           FROM person_expertise
           WHERE organization_id = $1 AND expertise_level >= 70
           GROUP BY person_id
         ) exp_counts),
        0
      ) as concentration
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ concentration: 0 }] }));

  // Get succession gap count (critical roles without backup)
  const successionResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM critical_roles cr
    WHERE cr.organization_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM succession_plans sp
        WHERE sp.role_id = cr.id
          AND sp.readiness_level >= 'developing'
      )
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  return {
    singlePointsOfFailure: parseInt(spofResult.rows[0]?.count || '0'),
    undocumentedExpertiseAreas: parseInt(undocumentedResult.rows[0]?.count || '0'),
    avgBusFactor: parseFloat(busFactorResult.rows[0]?.avg_bus_factor || '2.5'),
    knowledgeSiloCount: parseInt(siloResult.rows[0]?.count || '0'),
    expertiseConcentrationScore: parseFloat(concentrationResult.rows[0]?.concentration || '0'),
    successionGapCount: parseInt(successionResult.rows[0]?.count || '0'),
  };
}

/**
 * Calculate sub-dimension scores
 */
function calculateSubDimensions(metrics: KnowledgeDebt['metrics']): SubDimension[] {
  // Bus factor score: 1 = critical (100), 5 = healthy (0)
  const busFactorScore = Math.max(0, Math.min(100, (5 - metrics.avgBusFactor) * 25));

  return [
    {
      name: 'Single Points of Failure',
      score: Math.min(100, metrics.singlePointsOfFailure * 15),
      description: `${metrics.singlePointsOfFailure} people are sole experts in critical areas`,
      impactLevel: metrics.singlePointsOfFailure > 5 ? 'critical' :
                   metrics.singlePointsOfFailure > 3 ? 'high' :
                   metrics.singlePointsOfFailure > 1 ? 'medium' : 'low',
    },
    {
      name: 'Documentation Coverage',
      score: Math.min(100, metrics.undocumentedExpertiseAreas * 10),
      description: `${metrics.undocumentedExpertiseAreas} expertise areas lack documentation`,
      impactLevel: metrics.undocumentedExpertiseAreas > 10 ? 'critical' :
                   metrics.undocumentedExpertiseAreas > 5 ? 'high' :
                   metrics.undocumentedExpertiseAreas > 2 ? 'medium' : 'low',
    },
    {
      name: 'Bus Factor',
      score: busFactorScore,
      description: `Average bus factor of ${metrics.avgBusFactor.toFixed(1)} (target: 3+)`,
      impactLevel: metrics.avgBusFactor < 1.5 ? 'critical' :
                   metrics.avgBusFactor < 2 ? 'high' :
                   metrics.avgBusFactor < 2.5 ? 'medium' : 'low',
    },
    {
      name: 'Knowledge Silos',
      score: Math.min(100, metrics.knowledgeSiloCount * 12),
      description: `${metrics.knowledgeSiloCount} departments operate as knowledge silos`,
      impactLevel: metrics.knowledgeSiloCount > 5 ? 'critical' :
                   metrics.knowledgeSiloCount > 3 ? 'high' :
                   metrics.knowledgeSiloCount > 1 ? 'medium' : 'low',
    },
    {
      name: 'Expertise Distribution',
      score: Math.min(100, metrics.expertiseConcentrationScore),
      description: `Expertise concentration score of ${metrics.expertiseConcentrationScore.toFixed(0)}%`,
      impactLevel: metrics.expertiseConcentrationScore > 70 ? 'critical' :
                   metrics.expertiseConcentrationScore > 50 ? 'high' :
                   metrics.expertiseConcentrationScore > 30 ? 'medium' : 'low',
    },
    {
      name: 'Succession Planning',
      score: Math.min(100, metrics.successionGapCount * 20),
      description: `${metrics.successionGapCount} critical roles without succession plans`,
      impactLevel: metrics.successionGapCount > 5 ? 'critical' :
                   metrics.successionGapCount > 3 ? 'high' :
                   metrics.successionGapCount > 1 ? 'medium' : 'low',
    },
  ];
}

/**
 * Calculate overall score from sub-dimensions
 */
function calculateOverallScore(subDimensions: SubDimension[]): number {
  const weights = [0.25, 0.15, 0.20, 0.15, 0.10, 0.15];
  let weightedSum = 0;
  let totalWeight = 0;

  subDimensions.forEach((dim, i) => {
    weightedSum += dim.score * weights[i];
    totalWeight += weights[i];
  });

  return Math.round(weightedSum / totalWeight);
}

/**
 * Identify specific knowledge issues
 */
async function identifyKnowledgeIssues(
  pool: Pool,
  organizationId: string,
  metrics: KnowledgeDebt['metrics']
): Promise<DebtIssue[]> {
  const issues: DebtIssue[] = [];

  // Single points of failure
  if (metrics.singlePointsOfFailure > 0) {
    const spofResult = await pool.query(
      `
      SELECT DISTINCT p.display_name, pe.domain
      FROM person_expertise pe
      JOIN persons p ON p.id = pe.person_id
      WHERE pe.organization_id = $1
        AND pe.expertise_level >= 80
        AND NOT EXISTS (
          SELECT 1 FROM person_expertise pe2
          WHERE pe2.organization_id = $1
            AND pe2.domain = pe.domain
            AND pe2.person_id != pe.person_id
            AND pe2.expertise_level >= 50
        )
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'knowledge-spof',
      title: 'Critical Single Points of Failure',
      description: `${metrics.singlePointsOfFailure} individuals hold unique critical knowledge that would be lost if they leave`,
      severity: metrics.singlePointsOfFailure > 5 ? 'critical' : 'high',
      estimatedCost: metrics.singlePointsOfFailure * 50000, // Cost of losing unique expertise
      affectedEntities: spofResult.rows.map((r: { display_name: string; domain: string }) =>
        `${r.display_name} (${r.domain})`
      ),
      suggestedAction: 'Implement knowledge transfer and cross-training programs',
    });
  }

  // Low bus factor
  if (metrics.avgBusFactor < 2) {
    issues.push({
      id: 'knowledge-bus-factor',
      title: 'Low Bus Factor Risk',
      description: `Average bus factor of ${metrics.avgBusFactor.toFixed(1)} indicates high knowledge concentration risk`,
      severity: metrics.avgBusFactor < 1.5 ? 'critical' : 'high',
      estimatedCost: 100000, // Business continuity risk
      affectedEntities: [],
      suggestedAction: 'Distribute knowledge across at least 3 people per critical domain',
    });
  }

  // Knowledge silos
  if (metrics.knowledgeSiloCount > 2) {
    issues.push({
      id: 'knowledge-silos',
      title: 'Department Knowledge Silos',
      description: `${metrics.knowledgeSiloCount} departments are operating as isolated knowledge silos`,
      severity: metrics.knowledgeSiloCount > 5 ? 'critical' : 'high',
      estimatedCost: metrics.knowledgeSiloCount * 20000,
      affectedEntities: [],
      suggestedAction: 'Implement cross-functional knowledge sharing sessions',
    });
  }

  // Undocumented expertise
  if (metrics.undocumentedExpertiseAreas > 5) {
    issues.push({
      id: 'knowledge-undocumented',
      title: 'Undocumented Expertise',
      description: `${metrics.undocumentedExpertiseAreas} critical expertise areas lack formal documentation`,
      severity: metrics.undocumentedExpertiseAreas > 10 ? 'critical' : 'high',
      estimatedCost: metrics.undocumentedExpertiseAreas * 10000,
      affectedEntities: [],
      suggestedAction: 'Create knowledge base articles for undocumented expertise areas',
    });
  }

  // Succession gaps
  if (metrics.successionGapCount > 2) {
    issues.push({
      id: 'knowledge-succession',
      title: 'Succession Planning Gaps',
      description: `${metrics.successionGapCount} critical roles have no identified successors`,
      severity: metrics.successionGapCount > 5 ? 'critical' : 'high',
      estimatedCost: metrics.successionGapCount * 30000,
      affectedEntities: [],
      suggestedAction: 'Develop succession plans and identify backup personnel',
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
  metrics: KnowledgeDebt['metrics'],
  issues: DebtIssue[]
): string[] {
  const recommendations: string[] = [];

  if (metrics.singlePointsOfFailure > 2) {
    recommendations.push('Implement a formal knowledge transfer program for single points of failure');
  }

  if (metrics.avgBusFactor < 2.5) {
    recommendations.push('Cross-train team members to achieve minimum bus factor of 3');
  }

  if (metrics.knowledgeSiloCount > 2) {
    recommendations.push('Establish regular cross-department knowledge sharing sessions');
  }

  if (metrics.undocumentedExpertiseAreas > 5) {
    recommendations.push('Launch documentation sprint for critical undocumented knowledge');
  }

  if (metrics.successionGapCount > 2) {
    recommendations.push('Create succession plans for all critical roles');
  }

  if (metrics.expertiseConcentrationScore > 50) {
    recommendations.push('Distribute expertise through mentoring and rotation programs');
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
      AND dimension = 'knowledge'
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
  const currentMetrics = await getKnowledgeMetrics(pool, organizationId, lookbackDays);
  const currentScore = calculateOverallScore(calculateSubDimensions(currentMetrics));

  const change = currentScore - previousScore;

  if (change < -5) return 'improving';
  if (change > 5) return 'degrading';
  return 'stable';
}

export default { calculateKnowledgeDebt };
