/**
 * Alert Prioritizer Service
 * T101 - Implement alert prioritization by business impact
 *
 * Prioritizes alerts based on business impact, urgency, and organizational context
 */

import { prisma } from '../../lib/prisma';
import { Alert, AlertSeverity, AlertCategory } from './alertManager';

export interface PrioritizedAlert extends Alert {
  priorityScore: number; // 0-100
  priorityRank: number;
  priorityFactors: PriorityFactor[];
  suggestedResponseTime: number; // minutes
  suggestedAssignee?: SuggestedAssignee;
}

export interface PriorityFactor {
  name: string;
  weight: number; // 0-1
  score: number; // 0-100
  reason: string;
}

export interface SuggestedAssignee {
  userId: string;
  userName: string;
  reason: string;
  currentWorkload: number;
  expertise: string[];
}

export interface PrioritizationConfig {
  severityWeights: Record<AlertSeverity, number>;
  categoryWeights: Record<AlertCategory, number>;
  businessImpactWeights: {
    revenue: number;
    operations: number;
    compliance: number;
    reputation: number;
  };
  timeFactorWeight: number;
  escalationWeight: number;
}

// Default configuration
const DEFAULT_CONFIG: PrioritizationConfig = {
  severityWeights: {
    critical: 1.0,
    error: 0.75,
    warning: 0.5,
    info: 0.25,
  },
  categoryWeights: {
    compliance: 1.0,
    security: 0.95,
    integration: 0.8,
    process: 0.7,
    workload: 0.6,
    deadline: 0.65,
    capacity: 0.55,
    performance: 0.5,
  },
  businessImpactWeights: {
    revenue: 0.35,
    operations: 0.3,
    compliance: 0.25,
    reputation: 0.1,
  },
  timeFactorWeight: 0.15,
  escalationWeight: 0.1,
};

/**
 * Prioritize a list of alerts
 */
export async function prioritizeAlerts(
  alerts: Alert[],
  organizationId: string,
  config: PrioritizationConfig = DEFAULT_CONFIG
): Promise<PrioritizedAlert[]> {
  // Get organization context for better prioritization
  const orgContext = await getOrganizationContext(organizationId);

  // Calculate priority for each alert
  const prioritized: PrioritizedAlert[] = await Promise.all(
    alerts.map(async alert => {
      const { score, factors } = await calculatePriorityScore(alert, config, orgContext);
      const responseTime = calculateSuggestedResponseTime(score, alert.severity);
      const suggestedAssignee = await findSuggestedAssignee(alert, organizationId);

      return {
        ...alert,
        priorityScore: score,
        priorityRank: 0, // Will be set after sorting
        priorityFactors: factors,
        suggestedResponseTime: responseTime,
        suggestedAssignee,
      };
    })
  );

  // Sort by priority score (highest first) and assign ranks
  prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
  prioritized.forEach((alert, index) => {
    alert.priorityRank = index + 1;
  });

  return prioritized;
}

/**
 * Calculate priority score for a single alert
 */
async function calculatePriorityScore(
  alert: Alert,
  config: PrioritizationConfig,
  orgContext: OrganizationContext
): Promise<{ score: number; factors: PriorityFactor[] }> {
  const factors: PriorityFactor[] = [];

  // Factor 1: Severity
  const severityScore = config.severityWeights[alert.severity] * 100;
  factors.push({
    name: 'Severity',
    weight: 0.25,
    score: severityScore,
    reason: `Alert severity is ${alert.severity}`,
  });

  // Factor 2: Category business relevance
  const categoryScore = config.categoryWeights[alert.category] * 100;
  factors.push({
    name: 'Category',
    weight: 0.15,
    score: categoryScore,
    reason: `${alert.category} alerts have ${categoryScore >= 80 ? 'high' : categoryScore >= 50 ? 'medium' : 'low'} business relevance`,
  });

  // Factor 3: Business impact
  const impactScore = calculateBusinessImpactScore(alert.impact, config, orgContext);
  factors.push({
    name: 'Business Impact',
    weight: 0.25,
    score: impactScore,
    reason: getImpactReason(alert.impact),
  });

  // Factor 4: Time factor (age of alert)
  const timeScore = calculateTimeScore(alert.createdAt);
  factors.push({
    name: 'Time Urgency',
    weight: config.timeFactorWeight,
    score: timeScore,
    reason: `Alert created ${getTimeAgo(alert.createdAt)}`,
  });

  // Factor 5: Escalation level
  const escalationScore = Math.min(100, alert.escalationLevel * 20);
  factors.push({
    name: 'Escalation',
    weight: config.escalationWeight,
    score: escalationScore,
    reason: alert.escalationLevel > 0
      ? `Escalated ${alert.escalationLevel} time(s)`
      : 'Not yet escalated',
  });

  // Factor 6: Affected scope
  const scopeScore = calculateScopeScore(alert.impact);
  factors.push({
    name: 'Affected Scope',
    weight: 0.1,
    score: scopeScore,
    reason: `Affects ${alert.impact.affectedUsers} users and ${alert.impact.affectedProcesses} processes`,
  });

  // Factor 7: SLA risk
  if (alert.impact.slaRisk) {
    factors.push({
      name: 'SLA Risk',
      weight: 0.15,
      score: 100,
      reason: 'Alert poses risk to SLA compliance',
    });
  } else {
    factors.push({
      name: 'SLA Risk',
      weight: 0.15,
      score: 0,
      reason: 'No SLA risk identified',
    });
  }

  // Calculate weighted score
  let totalWeight = 0;
  let weightedSum = 0;
  for (const factor of factors) {
    weightedSum += factor.score * factor.weight;
    totalWeight += factor.weight;
  }

  const finalScore = Math.round(weightedSum / totalWeight);

  return { score: finalScore, factors };
}

/**
 * Calculate business impact score
 */
function calculateBusinessImpactScore(
  impact: Alert['impact'],
  config: PrioritizationConfig,
  orgContext: OrganizationContext
): number {
  let score = 0;

  // Business impact level
  switch (impact.businessImpact) {
    case 'critical':
      score += 40;
      break;
    case 'high':
      score += 30;
      break;
    case 'medium':
      score += 20;
      break;
    case 'low':
      score += 10;
      break;
  }

  // Affected users relative to organization size
  const userImpactRatio = orgContext.totalUsers > 0
    ? impact.affectedUsers / orgContext.totalUsers
    : 0;
  score += userImpactRatio * 30;

  // Affected processes relative to total
  const processImpactRatio = orgContext.totalProcesses > 0
    ? impact.affectedProcesses / orgContext.totalProcesses
    : 0;
  score += processImpactRatio * 20;

  // SLA risk is critical
  if (impact.slaRisk) {
    score += 20;
  }

  // Cost impact
  if (impact.estimatedCost && impact.estimatedCost > 0) {
    const costRatio = Math.min(1, impact.estimatedCost / orgContext.avgDailyRevenue);
    score += costRatio * 20;
  }

  return Math.min(100, score);
}

/**
 * Calculate time-based urgency score
 */
function calculateTimeScore(createdAt: Date): number {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);

  // Score increases with age (older = more urgent to resolve)
  if (ageHours < 1) return 20;
  if (ageHours < 4) return 40;
  if (ageHours < 12) return 60;
  if (ageHours < 24) return 80;
  return 100;
}

/**
 * Calculate scope impact score
 */
function calculateScopeScore(impact: Alert['impact']): number {
  const userScore = Math.min(50, impact.affectedUsers * 2);
  const processScore = Math.min(50, impact.affectedProcesses * 5);
  return userScore + processScore;
}

/**
 * Calculate suggested response time based on priority
 */
function calculateSuggestedResponseTime(
  priorityScore: number,
  severity: AlertSeverity
): number {
  // Base response time in minutes
  let baseTime: number;
  switch (severity) {
    case 'critical':
      baseTime = 15;
      break;
    case 'error':
      baseTime = 60;
      break;
    case 'warning':
      baseTime = 240;
      break;
    case 'info':
      baseTime = 480;
      break;
    default:
      baseTime = 240;
  }

  // Adjust based on priority score
  const adjustment = (100 - priorityScore) / 100;
  return Math.round(baseTime * (1 + adjustment));
}

/**
 * Find suggested assignee for an alert
 */
async function findSuggestedAssignee(
  alert: Alert,
  organizationId: string
): Promise<SuggestedAssignee | undefined> {
  // Look for users with relevant expertise and low workload
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      role: { in: ['admin', 'manager', 'supervisor'] },
    },
    include: {
      expertiseProfiles: {
        select: {
          skills: true,
          workloadScore: true,
        },
      },
    },
    take: 10,
  });

  // Score each user
  const categorySkillMap: Record<AlertCategory, string[]> = {
    workload: ['resource management', 'capacity planning'],
    process: ['process improvement', 'operations'],
    compliance: ['compliance', 'regulatory', 'audit'],
    integration: ['integration', 'api', 'technical'],
    performance: ['performance', 'optimization'],
    security: ['security', 'risk management'],
    deadline: ['project management', 'scheduling'],
    capacity: ['capacity planning', 'resource management'],
  };

  const relevantSkills = categorySkillMap[alert.category] || [];

  let bestMatch: SuggestedAssignee | undefined;
  let bestScore = -1;

  for (const user of users) {
    const profile = user.expertiseProfiles[0];
    const workload = profile?.workloadScore || 0.5;
    const skills = profile?.skills || [];

    // Calculate match score
    const skillMatch = relevantSkills.filter(s =>
      (skills as string[]).some(us => us.toLowerCase().includes(s.toLowerCase()))
    ).length / Math.max(1, relevantSkills.length);

    const workloadPenalty = workload; // Lower is better
    const score = skillMatch * 0.6 + (1 - workloadPenalty) * 0.4;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        userId: user.id,
        userName: user.name || user.email,
        reason: skillMatch > 0
          ? `Has relevant expertise in ${alert.category}`
          : 'Available capacity',
        currentWorkload: workload,
        expertise: skills as string[],
      };
    }
  }

  return bestMatch;
}

interface OrganizationContext {
  totalUsers: number;
  totalProcesses: number;
  avgDailyRevenue: number;
  activeSlaCount: number;
}

/**
 * Get organization context for prioritization
 */
async function getOrganizationContext(organizationId: string): Promise<OrganizationContext> {
  const [userCount, processCount] = await Promise.all([
    prisma.user.count({ where: { organizationId, isActive: true } }),
    prisma.process.count({ where: { organizationId } }),
  ]);

  return {
    totalUsers: userCount,
    totalProcesses: processCount,
    avgDailyRevenue: 100000, // Would come from organization settings
    activeSlaCount: 10, // Would come from SLA configuration
  };
}

/**
 * Get human-readable impact reason
 */
function getImpactReason(impact: Alert['impact']): string {
  const parts: string[] = [];

  if (impact.businessImpact === 'critical') {
    parts.push('Critical business impact');
  } else if (impact.businessImpact === 'high') {
    parts.push('High business impact');
  }

  if (impact.affectedUsers > 10) {
    parts.push(`${impact.affectedUsers} users affected`);
  }

  if (impact.slaRisk) {
    parts.push('SLA at risk');
  }

  if (impact.estimatedCost && impact.estimatedCost > 1000) {
    parts.push(`~$${impact.estimatedCost.toLocaleString()} potential cost`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Standard business impact';
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Re-prioritize alerts when conditions change
 */
export async function reprioritizeOnChange(
  organizationId: string,
  changedAlertId: string
): Promise<PrioritizedAlert[]> {
  const { alerts } = await import('./alertManager').then(m =>
    m.queryAlerts({
      organizationId,
      status: ['active', 'acknowledged'],
    })
  );

  return prioritizeAlerts(alerts, organizationId);
}

export default {
  prioritizeAlerts,
  reprioritizeOnChange,
};
