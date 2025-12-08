/**
 * Deadline Impact Estimator
 * T210 - Estimate impact of project deadlines on workload
 *
 * Analyzes how upcoming deadlines affect team capacity
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface DeadlineImpact {
  deadlineId: string;
  projectId: string;
  projectName: string;
  deadline: Date;
  daysUntilDeadline: number;
  impact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    score: number; // 0-100
    description: string;
  };
  resourceRequirements: {
    totalHours: number;
    weeklyHours: number;
    additionalHeadcount: number;
  };
  affectedMembers: Array<{
    personId: string;
    personName: string;
    currentLoad: number;
    additionalLoad: number;
    projectedLoad: number;
  }>;
  risks: DeadlineRisk[];
  mitigations: DeadlineMitigation[];
}

export interface DeadlineRisk {
  type: 'capacity' | 'skill' | 'dependency' | 'scope' | 'timeline';
  severity: 'critical' | 'high' | 'medium' | 'low';
  probability: number; // 0-100
  description: string;
  consequence: string;
}

export interface DeadlineMitigation {
  type: 'resource' | 'scope' | 'timeline' | 'process';
  description: string;
  impact: string;
  effort: 'high' | 'medium' | 'low';
  recommended: boolean;
}

export interface TeamDeadlineAnalysis {
  teamId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  deadlines: DeadlineImpact[];
  overallRisk: {
    level: 'critical' | 'high' | 'medium' | 'low';
    score: number;
    factors: string[];
  };
  capacityTimeline: Array<{
    date: Date;
    baseCapacity: number;
    deadlineLoad: number;
    totalLoad: number;
    status: 'ok' | 'warning' | 'critical';
  }>;
  recommendations: string[];
}

export interface DeadlineConflict {
  deadline1: { id: string; name: string; date: Date };
  deadline2: { id: string; name: string; date: Date };
  conflictType: 'resource' | 'timing' | 'dependency';
  severity: 'critical' | 'high' | 'medium';
  description: string;
  resolution: string;
}

// =============================================================================
// Deadline Impact Estimator
// =============================================================================

const prisma = new PrismaClient();

/**
 * Estimate impact of a single deadline
 */
export async function estimateDeadlineImpact(
  teamId: string,
  deadline: {
    id: string;
    projectId: string;
    projectName: string;
    date: Date;
    requiredHours: number;
    skills: string[];
  }
): Promise<DeadlineImpact> {
  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const now = new Date();
  const daysUntilDeadline = Math.ceil((deadline.date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const weeksUntilDeadline = Math.max(1, daysUntilDeadline / 7);

  // Calculate required weekly hours
  const weeklyHours = deadline.requiredHours / weeksUntilDeadline;

  // Estimate impact on team members
  const affectedMembers = await estimateAffectedMembers(
    team.users,
    deadline.skills,
    weeklyHours
  );

  // Calculate overall impact
  const impact = calculateImpactSeverity(daysUntilDeadline, weeklyHours, affectedMembers);

  // Identify risks
  const risks = identifyDeadlineRisks(deadline, daysUntilDeadline, affectedMembers);

  // Generate mitigations
  const mitigations = generateMitigations(risks, deadline, affectedMembers);

  return {
    deadlineId: deadline.id,
    projectId: deadline.projectId,
    projectName: deadline.projectName,
    deadline: deadline.date,
    daysUntilDeadline,
    impact,
    resourceRequirements: {
      totalHours: deadline.requiredHours,
      weeklyHours: Math.round(weeklyHours),
      additionalHeadcount: calculateAdditionalHeadcount(weeklyHours, affectedMembers),
    },
    affectedMembers,
    risks,
    mitigations,
  };
}

/**
 * Analyze all deadlines for a team
 */
export async function analyzeTeamDeadlines(
  teamId: string,
  options: {
    days?: number;
  } = {}
): Promise<TeamDeadlineAnalysis> {
  const { days = 60 } = options;

  const startDate = new Date();
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // Get upcoming deadlines (simulated)
  const upcomingDeadlines = await getUpcomingDeadlines(teamId, startDate, endDate);

  // Analyze each deadline
  const deadlineImpacts = await Promise.all(
    upcomingDeadlines.map((d) => estimateDeadlineImpact(teamId, d))
  );

  // Calculate overall risk
  const overallRisk = calculateOverallRisk(deadlineImpacts);

  // Build capacity timeline
  const capacityTimeline = buildCapacityTimeline(startDate, endDate, deadlineImpacts);

  // Generate recommendations
  const recommendations = generateTeamRecommendations(deadlineImpacts, overallRisk);

  return {
    teamId,
    period: { startDate, endDate },
    deadlines: deadlineImpacts,
    overallRisk,
    capacityTimeline,
    recommendations,
  };
}

/**
 * Find conflicts between deadlines
 */
export async function findDeadlineConflicts(
  teamId: string,
  options: {
    days?: number;
  } = {}
): Promise<DeadlineConflict[]> {
  const analysis = await analyzeTeamDeadlines(teamId, options);
  const conflicts: DeadlineConflict[] = [];

  // Check for timing conflicts (deadlines too close together)
  for (let i = 0; i < analysis.deadlines.length; i++) {
    for (let j = i + 1; j < analysis.deadlines.length; j++) {
      const d1 = analysis.deadlines[i];
      const d2 = analysis.deadlines[j];

      const daysBetween = Math.abs(
        (d1.deadline.getTime() - d2.deadline.getTime()) / (24 * 60 * 60 * 1000)
      );

      // Check resource conflicts
      const sharedMembers = d1.affectedMembers.filter((m1) =>
        d2.affectedMembers.some((m2) => m2.personId === m1.personId)
      );

      if (daysBetween < 7 && sharedMembers.length > 0) {
        const overloadedMembers = sharedMembers.filter(
          (m) => m.projectedLoad > 100
        );

        if (overloadedMembers.length > 0) {
          conflicts.push({
            deadline1: { id: d1.deadlineId, name: d1.projectName, date: d1.deadline },
            deadline2: { id: d2.deadlineId, name: d2.projectName, date: d2.deadline },
            conflictType: 'resource',
            severity: daysBetween < 3 ? 'critical' : 'high',
            description: `${sharedMembers.length} team members are assigned to both projects with overlapping deadlines`,
            resolution: 'Stagger deadlines or redistribute work',
          });
        }
      }

      // Check timing conflicts (same deadline date)
      if (daysBetween < 2) {
        conflicts.push({
          deadline1: { id: d1.deadlineId, name: d1.projectName, date: d1.deadline },
          deadline2: { id: d2.deadlineId, name: d2.projectName, date: d2.deadline },
          conflictType: 'timing',
          severity: 'high',
          description: 'Multiple major deadlines on the same day',
          resolution: 'Adjust one deadline if possible',
        });
      }
    }
  }

  return conflicts;
}

// =============================================================================
// Helper Functions
// =============================================================================

async function getUpcomingDeadlines(
  _teamId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{
  id: string;
  projectId: string;
  projectName: string;
  date: Date;
  requiredHours: number;
  skills: string[];
}>> {
  // In production, query actual project deadlines
  const deadlines = [];
  const numDeadlines = 3 + Math.floor(Math.random() * 4);

  for (let i = 0; i < numDeadlines; i++) {
    const daysUntil = Math.floor(Math.random() * 60);
    const date = new Date(startDate.getTime() + daysUntil * 24 * 60 * 60 * 1000);

    if (date <= endDate) {
      deadlines.push({
        id: `deadline-${i}`,
        projectId: `project-${i}`,
        projectName: `Project ${String.fromCharCode(65 + i)}`,
        date,
        requiredHours: 40 + Math.floor(Math.random() * 160),
        skills: ['JavaScript', 'React'].slice(0, 1 + Math.floor(Math.random() * 2)),
      });
    }
  }

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function estimateAffectedMembers(
  users: Array<{ id: string; name: string | null; email: string }>,
  _skills: string[],
  weeklyHours: number
): Promise<DeadlineImpact['affectedMembers']> {
  const hoursPerPerson = weeklyHours / Math.max(1, Math.ceil(users.length / 2));

  return users.slice(0, Math.ceil(users.length / 2)).map((user) => {
    const currentLoad = 60 + Math.random() * 30;
    const additionalLoad = (hoursPerPerson / 40) * 100;

    return {
      personId: user.id,
      personName: user.name || user.email,
      currentLoad: Math.round(currentLoad),
      additionalLoad: Math.round(additionalLoad),
      projectedLoad: Math.round(currentLoad + additionalLoad),
    };
  });
}

function calculateImpactSeverity(
  daysUntilDeadline: number,
  weeklyHours: number,
  affectedMembers: DeadlineImpact['affectedMembers']
): DeadlineImpact['impact'] {
  let score = 0;

  // Time pressure factor
  if (daysUntilDeadline < 7) score += 40;
  else if (daysUntilDeadline < 14) score += 25;
  else if (daysUntilDeadline < 30) score += 10;

  // Workload factor
  if (weeklyHours > 80) score += 30;
  else if (weeklyHours > 40) score += 20;
  else if (weeklyHours > 20) score += 10;

  // Team impact factor
  const overloaded = affectedMembers.filter((m) => m.projectedLoad > 100);
  score += overloaded.length * 10;

  score = Math.min(100, score);

  let severity: DeadlineImpact['impact']['severity'];
  if (score >= 70) severity = 'critical';
  else if (score >= 50) severity = 'high';
  else if (score >= 30) severity = 'medium';
  else severity = 'low';

  return {
    severity,
    score,
    description: generateImpactDescription(severity, daysUntilDeadline, weeklyHours),
  };
}

function generateImpactDescription(
  severity: string,
  daysUntilDeadline: number,
  weeklyHours: number
): string {
  if (severity === 'critical') {
    return `Urgent: ${daysUntilDeadline} days remaining with ${Math.round(weeklyHours)} hours/week required`;
  } else if (severity === 'high') {
    return `Significant workload impact requiring careful resource management`;
  } else if (severity === 'medium') {
    return `Moderate impact on team capacity`;
  }
  return 'Manageable within current capacity';
}

function calculateAdditionalHeadcount(
  weeklyHours: number,
  affectedMembers: DeadlineImpact['affectedMembers']
): number {
  const availableCapacity = affectedMembers.reduce((sum, m) => {
    return sum + Math.max(0, 100 - m.currentLoad) * 0.4; // 40 hours * available %
  }, 0);

  const shortfall = weeklyHours - availableCapacity;

  if (shortfall <= 0) return 0;
  return Math.ceil(shortfall / 30); // Assuming 30 productive hours per week per person
}

function identifyDeadlineRisks(
  deadline: { requiredHours: number; skills: string[] },
  daysUntilDeadline: number,
  affectedMembers: DeadlineImpact['affectedMembers']
): DeadlineRisk[] {
  const risks: DeadlineRisk[] = [];

  // Capacity risk
  const overloaded = affectedMembers.filter((m) => m.projectedLoad > 100);
  if (overloaded.length > 0) {
    risks.push({
      type: 'capacity',
      severity: overloaded.some((m) => m.projectedLoad > 120) ? 'critical' : 'high',
      probability: 70,
      description: `${overloaded.length} team member(s) will be overloaded`,
      consequence: 'Potential delays or quality issues',
    });
  }

  // Timeline risk
  if (daysUntilDeadline < 14 && deadline.requiredHours > 80) {
    risks.push({
      type: 'timeline',
      severity: daysUntilDeadline < 7 ? 'critical' : 'high',
      probability: 60,
      description: 'Tight timeline for required work',
      consequence: 'Risk of missing deadline',
    });
  }

  // Skill risk (simplified)
  if (deadline.skills.length > 1 && affectedMembers.length < 3) {
    risks.push({
      type: 'skill',
      severity: 'medium',
      probability: 40,
      description: 'Limited team members with required skills',
      consequence: 'Bottleneck on specific tasks',
    });
  }

  return risks;
}

function generateMitigations(
  risks: DeadlineRisk[],
  deadline: { requiredHours: number },
  affectedMembers: DeadlineImpact['affectedMembers']
): DeadlineMitigation[] {
  const mitigations: DeadlineMitigation[] = [];

  // Check for capacity risks
  const hasCapacityRisk = risks.some((r) => r.type === 'capacity');
  if (hasCapacityRisk) {
    mitigations.push({
      type: 'resource',
      description: 'Bring in additional resources or contractors',
      impact: 'Increase capacity by 30-40%',
      effort: 'high',
      recommended: affectedMembers.some((m) => m.projectedLoad > 120),
    });

    mitigations.push({
      type: 'scope',
      description: 'Negotiate scope reduction for non-essential features',
      impact: `Reduce workload by 20-30%`,
      effort: 'medium',
      recommended: true,
    });
  }

  // Check for timeline risks
  const hasTimelineRisk = risks.some((r) => r.type === 'timeline');
  if (hasTimelineRisk) {
    mitigations.push({
      type: 'timeline',
      description: 'Request deadline extension',
      impact: 'Reduce time pressure significantly',
      effort: 'low',
      recommended: deadline.requiredHours > 100,
    });

    mitigations.push({
      type: 'process',
      description: 'Implement daily standups and tighter coordination',
      impact: 'Improve efficiency by 10-15%',
      effort: 'low',
      recommended: true,
    });
  }

  return mitigations;
}

function calculateOverallRisk(
  deadlines: DeadlineImpact[]
): TeamDeadlineAnalysis['overallRisk'] {
  if (deadlines.length === 0) {
    return { level: 'low', score: 0, factors: ['No upcoming deadlines'] };
  }

  const avgScore = deadlines.reduce((sum, d) => sum + d.impact.score, 0) / deadlines.length;
  const maxScore = Math.max(...deadlines.map((d) => d.impact.score));
  const totalRisks = deadlines.reduce((sum, d) => sum + d.risks.length, 0);

  const score = Math.round((avgScore + maxScore) / 2);
  const factors: string[] = [];

  if (maxScore >= 70) factors.push('Critical deadline approaching');
  if (deadlines.length >= 3) factors.push('Multiple concurrent deadlines');
  if (totalRisks >= 5) factors.push('Multiple identified risks');

  let level: TeamDeadlineAnalysis['overallRisk']['level'];
  if (score >= 70) level = 'critical';
  else if (score >= 50) level = 'high';
  else if (score >= 30) level = 'medium';
  else level = 'low';

  return { level, score, factors };
}

function buildCapacityTimeline(
  startDate: Date,
  endDate: Date,
  deadlines: DeadlineImpact[]
): TeamDeadlineAnalysis['capacityTimeline'] {
  const timeline: TeamDeadlineAnalysis['capacityTimeline'] = [];
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  for (let d = 0; d < days; d += 7) { // Weekly intervals
    const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const baseCapacity = 100;

    // Calculate deadline load for this week
    let deadlineLoad = 0;
    for (const deadline of deadlines) {
      const daysToDeadline = Math.ceil(
        (deadline.deadline.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysToDeadline > 0 && daysToDeadline <= 14) {
        // Impact increases as deadline approaches
        const proximityFactor = 1 + (14 - daysToDeadline) / 14;
        deadlineLoad += deadline.impact.score * proximityFactor * 0.3;
      }
    }

    const totalLoad = baseCapacity + deadlineLoad;
    let status: 'ok' | 'warning' | 'critical';
    if (totalLoad > 120) status = 'critical';
    else if (totalLoad > 100) status = 'warning';
    else status = 'ok';

    timeline.push({
      date,
      baseCapacity: Math.round(baseCapacity),
      deadlineLoad: Math.round(deadlineLoad),
      totalLoad: Math.round(totalLoad),
      status,
    });
  }

  return timeline;
}

function generateTeamRecommendations(
  deadlines: DeadlineImpact[],
  overallRisk: TeamDeadlineAnalysis['overallRisk']
): string[] {
  const recommendations: string[] = [];

  if (overallRisk.level === 'critical') {
    recommendations.push('URGENT: Review and prioritize all deadlines immediately');
    recommendations.push('Consider bringing in external help for critical projects');
  }

  if (deadlines.some((d) => d.daysUntilDeadline < 7)) {
    recommendations.push('Focus all available resources on imminent deadlines');
  }

  const conflictingDeadlines = deadlines.filter(
    (d, i) => deadlines.some(
      (d2, j) => i !== j && Math.abs(d.daysUntilDeadline - d2.daysUntilDeadline) < 3
    )
  );

  if (conflictingDeadlines.length > 0) {
    recommendations.push('Stagger deadlines to reduce concurrent load peaks');
  }

  if (recommendations.length === 0) {
    recommendations.push('Current deadline schedule appears manageable');
    recommendations.push('Continue monitoring for changes in scope or timeline');
  }

  return recommendations;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  estimateDeadlineImpact,
  analyzeTeamDeadlines,
  findDeadlineConflicts,
};
