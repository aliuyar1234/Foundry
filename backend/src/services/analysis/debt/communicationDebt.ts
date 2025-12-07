/**
 * Communication Debt Calculator
 * Calculates debt from organizational communication inefficiencies
 * T255 - Communication debt calculation
 */

import { Pool } from 'pg';
import {
  CommunicationDebt,
  SubDimension,
  DebtIssue,
} from '../../../models/OrgDebtScore.js';

export interface CommunicationDebtOptions {
  organizationId: string;
  lookbackDays?: number;
}

/**
 * Calculate communication debt for an organization
 */
export async function calculateCommunicationDebt(
  pool: Pool,
  options: CommunicationDebtOptions
): Promise<CommunicationDebt> {
  const { organizationId, lookbackDays = 90 } = options;

  // Get communication metrics from database
  const metrics = await getCommunicationMetrics(pool, organizationId, lookbackDays);

  // Calculate sub-dimension scores
  const subDimensions = calculateSubDimensions(metrics);

  // Calculate overall communication debt score
  const score = calculateOverallScore(subDimensions);

  // Identify top issues
  const topIssues = await identifyCommunicationIssues(pool, organizationId, metrics);

  // Generate recommendations
  const recommendations = generateRecommendations(metrics, topIssues);

  // Determine trend
  const trend = await determineTrend(pool, organizationId, lookbackDays);

  return {
    name: 'communication',
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
 * Get communication metrics from database
 */
async function getCommunicationMetrics(
  pool: Pool,
  organizationId: string,
  lookbackDays: number
): Promise<CommunicationDebt['metrics']> {
  // Get silo score (based on cross-department communication)
  const siloResult = await pool.query(
    `
    SELECT
      COALESCE(
        100 - (
          COUNT(*) FILTER (WHERE sender_dept != receiver_dept)::float /
          NULLIF(COUNT(*), 0) * 100
        ),
        50
      ) as silo_score
    FROM communications
    WHERE organization_id = $1
      AND sent_at > NOW() - INTERVAL '${lookbackDays} days'
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ silo_score: 50 }] }));

  // Get average response delay (hours above 24-hour optimal)
  const responseResult = await pool.query(
    `
    SELECT
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (first_response_at - sent_at)) / 3600) - 24,
        0
      ) as avg_delay
    FROM communications
    WHERE organization_id = $1
      AND sent_at > NOW() - INTERVAL '${lookbackDays} days'
      AND first_response_at IS NOT NULL
      AND requires_response = true
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ avg_delay: 0 }] }));

  // Get meeting overload score (based on hours per person per week)
  const meetingResult = await pool.query(
    `
    SELECT
      COALESCE(
        AVG(weekly_meeting_hours) * 5, -- Scale to 0-100
        30
      ) as meeting_score
    FROM (
      SELECT
        participant_id,
        EXTRACT(EPOCH FROM SUM(duration)) / 3600 /
          GREATEST(1, EXTRACT(DAY FROM (MAX(end_time) - MIN(start_time))) / 7) as weekly_meeting_hours
      FROM meeting_participants mp
      JOIN meetings m ON m.id = mp.meeting_id
      WHERE m.organization_id = $1
        AND m.start_time > NOW() - INTERVAL '${lookbackDays} days'
      GROUP BY participant_id
    ) weekly_hours
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ meeting_score: 30 }] }));

  // Get email overload score (based on daily volume)
  const emailResult = await pool.query(
    `
    SELECT
      COALESCE(
        AVG(daily_emails) * 2, -- Scale to 0-100
        20
      ) as email_score
    FROM (
      SELECT
        sender_id,
        COUNT(*)::float / GREATEST(1, EXTRACT(DAY FROM (MAX(sent_at) - MIN(sent_at)))) as daily_emails
      FROM communications
      WHERE organization_id = $1
        AND sent_at > NOW() - INTERVAL '${lookbackDays} days'
        AND channel = 'email'
      GROUP BY sender_id
    ) daily_counts
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ email_score: 20 }] }));

  // Get cross-team collaboration gap
  const collaborationResult = await pool.query(
    `
    SELECT COUNT(DISTINCT d1.id) as gap_count
    FROM departments d1
    JOIN departments d2 ON d1.organization_id = d2.organization_id AND d1.id < d2.id
    WHERE d1.organization_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM communications c
        JOIN persons p1 ON c.sender_id = p1.id
        JOIN persons p2 ON c.receiver_id = p2.id
        WHERE c.organization_id = $1
          AND p1.department_id = d1.id
          AND p2.department_id = d2.id
          AND c.sent_at > NOW() - INTERVAL '${lookbackDays} days'
      )
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ gap_count: 0 }] }));

  // Get information flow bottlenecks
  const bottleneckResult = await pool.query(
    `
    SELECT COUNT(DISTINCT person_id) as bottleneck_count
    FROM (
      SELECT
        p.id as person_id,
        COUNT(DISTINCT c.receiver_id) as outbound_contacts,
        COUNT(DISTINCT c2.sender_id) as inbound_contacts
      FROM persons p
      LEFT JOIN communications c ON c.sender_id = p.id
        AND c.sent_at > NOW() - INTERVAL '${lookbackDays} days'
      LEFT JOIN communications c2 ON c2.receiver_id = p.id
        AND c2.sent_at > NOW() - INTERVAL '${lookbackDays} days'
      WHERE p.organization_id = $1
      GROUP BY p.id
      HAVING COUNT(DISTINCT c.receiver_id) > 20
        AND COUNT(DISTINCT c2.sender_id) > 20
    ) high_traffic
    `,
    [organizationId]
  ).catch(() => ({ rows: [{ bottleneck_count: 0 }] }));

  return {
    siloScore: Math.min(100, parseFloat(siloResult.rows[0]?.silo_score || '50')),
    avgResponseDelay: Math.max(0, parseFloat(responseResult.rows[0]?.avg_delay || '0')),
    meetingOverloadScore: Math.min(100, parseFloat(meetingResult.rows[0]?.meeting_score || '30')),
    emailOverloadScore: Math.min(100, parseFloat(emailResult.rows[0]?.email_score || '20')),
    crossTeamCollaborationGap: parseInt(collaborationResult.rows[0]?.gap_count || '0'),
    informationFlowBottlenecks: parseInt(bottleneckResult.rows[0]?.bottleneck_count || '0'),
  };
}

/**
 * Calculate sub-dimension scores
 */
function calculateSubDimensions(metrics: CommunicationDebt['metrics']): SubDimension[] {
  return [
    {
      name: 'Organizational Silos',
      score: metrics.siloScore,
      description: `Silo score of ${metrics.siloScore.toFixed(0)}% indicates limited cross-department communication`,
      impactLevel: metrics.siloScore > 70 ? 'critical' :
                   metrics.siloScore > 50 ? 'high' :
                   metrics.siloScore > 30 ? 'medium' : 'low',
    },
    {
      name: 'Response Timeliness',
      score: Math.min(100, metrics.avgResponseDelay * 4), // 25 hours delay = 100 score
      description: `Average response delay of ${metrics.avgResponseDelay.toFixed(1)} hours above optimal`,
      impactLevel: metrics.avgResponseDelay > 24 ? 'critical' :
                   metrics.avgResponseDelay > 12 ? 'high' :
                   metrics.avgResponseDelay > 6 ? 'medium' : 'low',
    },
    {
      name: 'Meeting Load',
      score: metrics.meetingOverloadScore,
      description: `Meeting overload score of ${metrics.meetingOverloadScore.toFixed(0)}%`,
      impactLevel: metrics.meetingOverloadScore > 70 ? 'critical' :
                   metrics.meetingOverloadScore > 50 ? 'high' :
                   metrics.meetingOverloadScore > 30 ? 'medium' : 'low',
    },
    {
      name: 'Email Efficiency',
      score: metrics.emailOverloadScore,
      description: `Email overload score of ${metrics.emailOverloadScore.toFixed(0)}%`,
      impactLevel: metrics.emailOverloadScore > 70 ? 'critical' :
                   metrics.emailOverloadScore > 50 ? 'high' :
                   metrics.emailOverloadScore > 30 ? 'medium' : 'low',
    },
    {
      name: 'Cross-Team Collaboration',
      score: Math.min(100, metrics.crossTeamCollaborationGap * 15),
      description: `${metrics.crossTeamCollaborationGap} team pairs with no direct collaboration`,
      impactLevel: metrics.crossTeamCollaborationGap > 5 ? 'critical' :
                   metrics.crossTeamCollaborationGap > 3 ? 'high' :
                   metrics.crossTeamCollaborationGap > 1 ? 'medium' : 'low',
    },
    {
      name: 'Information Flow',
      score: Math.min(100, metrics.informationFlowBottlenecks * 20),
      description: `${metrics.informationFlowBottlenecks} information flow bottlenecks identified`,
      impactLevel: metrics.informationFlowBottlenecks > 5 ? 'critical' :
                   metrics.informationFlowBottlenecks > 3 ? 'high' :
                   metrics.informationFlowBottlenecks > 1 ? 'medium' : 'low',
    },
  ];
}

/**
 * Calculate overall score from sub-dimensions
 */
function calculateOverallScore(subDimensions: SubDimension[]): number {
  const weights = [0.25, 0.15, 0.20, 0.15, 0.15, 0.10];
  let weightedSum = 0;
  let totalWeight = 0;

  subDimensions.forEach((dim, i) => {
    weightedSum += dim.score * weights[i];
    totalWeight += weights[i];
  });

  return Math.round(weightedSum / totalWeight);
}

/**
 * Identify specific communication issues
 */
async function identifyCommunicationIssues(
  pool: Pool,
  organizationId: string,
  metrics: CommunicationDebt['metrics']
): Promise<DebtIssue[]> {
  const issues: DebtIssue[] = [];

  // Silo issue
  if (metrics.siloScore > 40) {
    const siloResult = await pool.query(
      `
      SELECT d.name, COUNT(DISTINCT c.id) as internal_comms,
             (SELECT COUNT(*) FROM communications c2
              JOIN persons p1 ON c2.sender_id = p1.id
              JOIN persons p2 ON c2.receiver_id = p2.id
              WHERE p1.department_id = d.id AND p2.department_id != d.id
                AND c2.sent_at > NOW() - INTERVAL '90 days') as external_comms
      FROM departments d
      LEFT JOIN persons p ON p.department_id = d.id
      LEFT JOIN communications c ON c.sender_id = p.id
        AND c.sent_at > NOW() - INTERVAL '90 days'
      WHERE d.organization_id = $1
      GROUP BY d.id, d.name
      HAVING COUNT(DISTINCT c.id) > 0
      ORDER BY COUNT(DISTINCT c.id) DESC
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'comm-silos',
      title: 'Organizational Communication Silos',
      description: `Silo score of ${metrics.siloScore.toFixed(0)}% indicates departments operate in isolation`,
      severity: metrics.siloScore > 70 ? 'critical' : 'high',
      estimatedCost: metrics.siloScore * 1000, // Cost of silo inefficiency
      affectedEntities: siloResult.rows.map((r: { name: string }) => r.name),
      suggestedAction: 'Implement cross-functional communication channels and collaborative projects',
    });
  }

  // Response delay issue
  if (metrics.avgResponseDelay > 8) {
    issues.push({
      id: 'comm-response-delay',
      title: 'Slow Response Times',
      description: `Average response delay of ${metrics.avgResponseDelay.toFixed(1)} hours impacting collaboration`,
      severity: metrics.avgResponseDelay > 24 ? 'critical' : 'high',
      estimatedCost: metrics.avgResponseDelay * 2000,
      affectedEntities: [],
      suggestedAction: 'Establish response time SLAs and escalation procedures',
    });
  }

  // Meeting overload
  if (metrics.meetingOverloadScore > 50) {
    issues.push({
      id: 'comm-meeting-overload',
      title: 'Meeting Overload',
      description: `High meeting load (${metrics.meetingOverloadScore.toFixed(0)}%) reducing productive work time`,
      severity: metrics.meetingOverloadScore > 70 ? 'critical' : 'high',
      estimatedCost: metrics.meetingOverloadScore * 1500,
      affectedEntities: [],
      suggestedAction: 'Audit meeting necessity, implement no-meeting days, and use async communication',
    });
  }

  // Email overload
  if (metrics.emailOverloadScore > 50) {
    issues.push({
      id: 'comm-email-overload',
      title: 'Email Overload',
      description: `High email volume (${metrics.emailOverloadScore.toFixed(0)}%) creating information overload`,
      severity: metrics.emailOverloadScore > 70 ? 'critical' : 'high',
      estimatedCost: metrics.emailOverloadScore * 1000,
      affectedEntities: [],
      suggestedAction: 'Consolidate communications, use collaboration tools, and establish email guidelines',
    });
  }

  // Collaboration gaps
  if (metrics.crossTeamCollaborationGap > 2) {
    issues.push({
      id: 'comm-collaboration-gap',
      title: 'Cross-Team Collaboration Gaps',
      description: `${metrics.crossTeamCollaborationGap} team pairs have no direct collaboration`,
      severity: metrics.crossTeamCollaborationGap > 5 ? 'critical' : 'high',
      estimatedCost: metrics.crossTeamCollaborationGap * 10000,
      affectedEntities: [],
      suggestedAction: 'Create cross-functional projects and shared objectives',
    });
  }

  // Information bottlenecks
  if (metrics.informationFlowBottlenecks > 2) {
    const bottleneckResult = await pool.query(
      `
      SELECT p.display_name,
             COUNT(DISTINCT c.receiver_id) as outbound,
             COUNT(DISTINCT c2.sender_id) as inbound
      FROM persons p
      LEFT JOIN communications c ON c.sender_id = p.id
        AND c.sent_at > NOW() - INTERVAL '90 days'
      LEFT JOIN communications c2 ON c2.receiver_id = p.id
        AND c2.sent_at > NOW() - INTERVAL '90 days'
      WHERE p.organization_id = $1
      GROUP BY p.id, p.display_name
      HAVING COUNT(DISTINCT c.receiver_id) > 20
        AND COUNT(DISTINCT c2.sender_id) > 20
      ORDER BY COUNT(DISTINCT c.receiver_id) + COUNT(DISTINCT c2.sender_id) DESC
      LIMIT 5
      `,
      [organizationId]
    ).catch(() => ({ rows: [] }));

    issues.push({
      id: 'comm-bottlenecks',
      title: 'Information Flow Bottlenecks',
      description: `${metrics.informationFlowBottlenecks} individuals are bottlenecks for information flow`,
      severity: metrics.informationFlowBottlenecks > 5 ? 'critical' : 'high',
      estimatedCost: metrics.informationFlowBottlenecks * 15000,
      affectedEntities: bottleneckResult.rows.map((r: { display_name: string }) => r.display_name),
      suggestedAction: 'Distribute communication responsibilities and implement broadcast channels',
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
  metrics: CommunicationDebt['metrics'],
  issues: DebtIssue[]
): string[] {
  const recommendations: string[] = [];

  if (metrics.siloScore > 40) {
    recommendations.push('Create cross-functional communication channels and shared project spaces');
  }

  if (metrics.avgResponseDelay > 12) {
    recommendations.push('Establish clear response time expectations and escalation paths');
  }

  if (metrics.meetingOverloadScore > 40) {
    recommendations.push('Implement meeting-free days and transition to async communication where possible');
  }

  if (metrics.emailOverloadScore > 40) {
    recommendations.push('Adopt team collaboration platforms to reduce email dependency');
  }

  if (metrics.crossTeamCollaborationGap > 2) {
    recommendations.push('Launch cross-functional initiatives to bridge collaboration gaps');
  }

  if (metrics.informationFlowBottlenecks > 2) {
    recommendations.push('Implement information broadcasting systems and distribute key contact roles');
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
      AND dimension = 'communication'
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
  const currentMetrics = await getCommunicationMetrics(pool, organizationId, lookbackDays);
  const currentScore = calculateOverallScore(calculateSubDimensions(currentMetrics));

  const change = currentScore - previousScore;

  if (change < -5) return 'improving';
  if (change > 5) return 'degrading';
  return 'stable';
}

export default { calculateCommunicationDebt };
