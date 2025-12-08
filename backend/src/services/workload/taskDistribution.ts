/**
 * Task Distribution Analyzer
 * T205 - Analyze task distribution across team members
 *
 * Identifies workload imbalances and optimization opportunities
 */

import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface TaskDistribution {
  teamId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  overview: {
    totalTasks: number;
    openTasks: number;
    completedTasks: number;
    avgTasksPerPerson: number;
    distributionScore: number; // 0-100 (higher = more even)
  };
  members: MemberTaskMetrics[];
  imbalances: DistributionImbalance[];
  recommendations: DistributionRecommendation[];
}

export interface MemberTaskMetrics {
  personId: string;
  personName: string;
  taskCounts: {
    total: number;
    open: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  workload: {
    currentLoad: number; // percentage of capacity
    estimatedHours: number;
    capacity: number; // hours available
  };
  performance: {
    completionRate: number;
    avgCompletionTime: number; // hours
    onTimePercent: number;
  };
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byCategory: Record<string, number>;
}

export interface DistributionImbalance {
  type: 'overloaded' | 'underloaded' | 'skill_mismatch' | 'priority_concentration';
  severity: 'high' | 'medium' | 'low';
  affectedPersons: string[];
  description: string;
  impact: string;
}

export interface DistributionRecommendation {
  type: 'redistribute' | 'hire' | 'skill_development' | 'process_change';
  priority: 'high' | 'medium' | 'low';
  description: string;
  expectedImpact: string;
  involvedPersons?: string[];
  suggestedTasks?: string[];
}

export interface TaskAssignmentSuggestion {
  taskId: string;
  taskTitle: string;
  currentAssignee?: string;
  suggestedAssignee: string;
  reason: string;
  confidenceScore: number;
}

// =============================================================================
// Task Distribution Analyzer
// =============================================================================

/**
 * Analyze task distribution for a team
 */
export async function analyzeDistribution(
  teamId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    includeCompleted?: boolean;
  } = {}
): Promise<TaskDistribution> {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    includeCompleted = true,
  } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Get task metrics for each member
  const memberMetrics = await Promise.all(
    team.users.map((user) => getMemberTaskMetrics(user.id, user.name || user.email, startDate, endDate))
  );

  // Calculate overview
  const totalTasks = memberMetrics.reduce((sum, m) => sum + m.taskCounts.total, 0);
  const openTasks = memberMetrics.reduce((sum, m) => sum + m.taskCounts.open, 0);
  const completedTasks = memberMetrics.reduce((sum, m) => sum + m.taskCounts.completed, 0);
  const avgTasksPerPerson = team.users.length > 0 ? totalTasks / team.users.length : 0;

  // Calculate distribution score
  const distributionScore = calculateDistributionScore(memberMetrics);

  // Identify imbalances
  const imbalances = identifyImbalances(memberMetrics, avgTasksPerPerson);

  // Generate recommendations
  const recommendations = generateDistributionRecommendations(memberMetrics, imbalances);

  return {
    teamId,
    period: { startDate, endDate },
    overview: {
      totalTasks,
      openTasks,
      completedTasks,
      avgTasksPerPerson: Math.round(avgTasksPerPerson * 10) / 10,
      distributionScore,
    },
    members: memberMetrics,
    imbalances,
    recommendations,
  };
}

/**
 * Get task metrics for a single team member
 */
export async function getMemberTaskMetrics(
  personId: string,
  personName: string,
  startDate: Date,
  endDate: Date
): Promise<MemberTaskMetrics> {
  // In production, this would query actual task data
  // For now, generate simulated metrics

  const total = Math.floor(10 + Math.random() * 30);
  const completed = Math.floor(total * (0.4 + Math.random() * 0.4));
  const open = total - completed;
  const inProgress = Math.floor(open * 0.4);
  const overdue = Math.floor(open * Math.random() * 0.3);

  const capacity = 40; // hours per week
  const estimatedHours = open * (2 + Math.random() * 4);
  const currentLoad = Math.min(150, (estimatedHours / capacity) * 100);

  const completionRate = total > 0 ? (completed / total) * 100 : 0;
  const avgCompletionTime = 4 + Math.random() * 12;
  const onTimePercent = 70 + Math.random() * 25;

  return {
    personId,
    personName,
    taskCounts: {
      total,
      open,
      inProgress,
      completed,
      overdue,
    },
    workload: {
      currentLoad: Math.round(currentLoad),
      estimatedHours: Math.round(estimatedHours),
      capacity,
    },
    performance: {
      completionRate: Math.round(completionRate),
      avgCompletionTime: Math.round(avgCompletionTime * 10) / 10,
      onTimePercent: Math.round(onTimePercent),
    },
    byPriority: {
      critical: Math.floor(open * 0.1),
      high: Math.floor(open * 0.25),
      medium: Math.floor(open * 0.4),
      low: Math.floor(open * 0.25),
    },
    byCategory: {
      'Development': Math.floor(total * 0.4),
      'Review': Math.floor(total * 0.2),
      'Documentation': Math.floor(total * 0.15),
      'Support': Math.floor(total * 0.15),
      'Other': Math.floor(total * 0.1),
    },
  };
}

/**
 * Calculate distribution score (0-100, higher = more even)
 */
function calculateDistributionScore(members: MemberTaskMetrics[]): number {
  if (members.length <= 1) return 100;

  const loads = members.map((m) => m.workload.currentLoad);
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;

  // Calculate coefficient of variation
  const variance = loads.reduce((sum, load) => sum + Math.pow(load - avgLoad, 2), 0) / loads.length;
  const stdDev = Math.sqrt(variance);
  const cv = avgLoad > 0 ? stdDev / avgLoad : 0;

  // Convert to score (lower CV = higher score)
  const score = Math.max(0, 100 - cv * 100);

  return Math.round(score);
}

/**
 * Identify workload imbalances
 */
function identifyImbalances(
  members: MemberTaskMetrics[],
  avgTasks: number
): DistributionImbalance[] {
  const imbalances: DistributionImbalance[] = [];

  // Check for overloaded members
  const overloaded = members.filter((m) => m.workload.currentLoad > 100);
  if (overloaded.length > 0) {
    imbalances.push({
      type: 'overloaded',
      severity: overloaded.some((m) => m.workload.currentLoad > 130) ? 'high' : 'medium',
      affectedPersons: overloaded.map((m) => m.personId),
      description: `${overloaded.length} team member(s) are at or over capacity`,
      impact: 'Risk of burnout, missed deadlines, and quality issues',
    });
  }

  // Check for underloaded members
  const underloaded = members.filter((m) => m.workload.currentLoad < 50);
  if (underloaded.length > 0 && overloaded.length > 0) {
    imbalances.push({
      type: 'underloaded',
      severity: 'medium',
      affectedPersons: underloaded.map((m) => m.personId),
      description: `${underloaded.length} team member(s) have low utilization while others are overloaded`,
      impact: 'Inefficient resource utilization and uneven workload',
    });
  }

  // Check for priority concentration
  const highPriorityConcentration = members.filter(
    (m) => m.byPriority.critical + m.byPriority.high > m.taskCounts.open * 0.6
  );
  if (highPriorityConcentration.length > 0 && highPriorityConcentration.length < members.length / 2) {
    imbalances.push({
      type: 'priority_concentration',
      severity: 'medium',
      affectedPersons: highPriorityConcentration.map((m) => m.personId),
      description: 'High-priority tasks are concentrated among few team members',
      impact: 'Key person dependency and increased pressure on select individuals',
    });
  }

  // Check for overdue task concentration
  const overdueConcentration = members.filter((m) => m.taskCounts.overdue > 3);
  if (overdueConcentration.length > 0) {
    imbalances.push({
      type: 'overloaded',
      severity: overdueConcentration.some((m) => m.taskCounts.overdue > 5) ? 'high' : 'medium',
      affectedPersons: overdueConcentration.map((m) => m.personId),
      description: `${overdueConcentration.length} team member(s) have multiple overdue tasks`,
      impact: 'Missed commitments and cascading delays',
    });
  }

  return imbalances;
}

/**
 * Generate recommendations for better distribution
 */
function generateDistributionRecommendations(
  members: MemberTaskMetrics[],
  imbalances: DistributionImbalance[]
): DistributionRecommendation[] {
  const recommendations: DistributionRecommendation[] = [];

  // Redistribution recommendations
  const overloaded = members.filter((m) => m.workload.currentLoad > 100);
  const underloaded = members.filter((m) => m.workload.currentLoad < 70);

  if (overloaded.length > 0 && underloaded.length > 0) {
    recommendations.push({
      type: 'redistribute',
      priority: 'high',
      description: 'Redistribute tasks from overloaded to underloaded team members',
      expectedImpact: 'More even workload distribution and reduced burnout risk',
      involvedPersons: [...overloaded.map((m) => m.personId), ...underloaded.map((m) => m.personId)],
    });
  }

  // Hiring recommendation
  const avgLoad = members.reduce((sum, m) => sum + m.workload.currentLoad, 0) / members.length;
  if (avgLoad > 90 && overloaded.length > members.length / 2) {
    recommendations.push({
      type: 'hire',
      priority: 'medium',
      description: 'Consider hiring additional team members to handle workload',
      expectedImpact: 'Sustainable workload levels and improved delivery capacity',
    });
  }

  // Skill development recommendations
  const skillImbalance = imbalances.find((i) => i.type === 'skill_mismatch');
  if (skillImbalance) {
    recommendations.push({
      type: 'skill_development',
      priority: 'medium',
      description: 'Invest in cross-training to enable better task distribution',
      expectedImpact: 'More flexibility in task assignment and reduced bottlenecks',
    });
  }

  // Process change recommendations
  if (members.some((m) => m.taskCounts.overdue > 3)) {
    recommendations.push({
      type: 'process_change',
      priority: 'medium',
      description: 'Review task estimation and capacity planning processes',
      expectedImpact: 'More realistic commitments and fewer overdue tasks',
    });
  }

  return recommendations;
}

/**
 * Get task assignment suggestions for better distribution
 */
export async function getAssignmentSuggestions(
  teamId: string,
  options: {
    taskIds?: string[];
    limit?: number;
  } = {}
): Promise<TaskAssignmentSuggestion[]> {
  const { limit = 10 } = options;

  const distribution = await analyzeDistribution(teamId);
  const suggestions: TaskAssignmentSuggestion[] = [];

  // Find overloaded and underloaded members
  const overloaded = distribution.members.filter((m) => m.workload.currentLoad > 100);
  const underloaded = distribution.members
    .filter((m) => m.workload.currentLoad < 70)
    .sort((a, b) => a.workload.currentLoad - b.workload.currentLoad);

  if (overloaded.length === 0 || underloaded.length === 0) {
    return suggestions;
  }

  // Generate suggestions (simplified - in production, match by skills)
  for (const member of overloaded) {
    const tasksToMove = Math.min(
      3,
      Math.floor((member.workload.currentLoad - 80) / 10)
    );

    for (let i = 0; i < tasksToMove && suggestions.length < limit; i++) {
      const targetMember = underloaded[suggestions.length % underloaded.length];

      suggestions.push({
        taskId: `task-${member.personId}-${i}`,
        taskTitle: `Task ${i + 1} from ${member.personName}`,
        currentAssignee: member.personId,
        suggestedAssignee: targetMember.personId,
        reason: `${member.personName} is at ${member.workload.currentLoad}% capacity, ${targetMember.personName} is at ${targetMember.workload.currentLoad}%`,
        confidenceScore: 75 + Math.floor(Math.random() * 20),
      });
    }
  }

  return suggestions;
}

/**
 * Compare distribution between time periods
 */
export async function compareDistribution(
  teamId: string,
  period1: { startDate: Date; endDate: Date },
  period2: { startDate: Date; endDate: Date }
): Promise<{
  period1: TaskDistribution;
  period2: TaskDistribution;
  changes: {
    distributionScoreChange: number;
    avgLoadChange: number;
    imbalanceChange: number;
    summary: string;
  };
}> {
  const [dist1, dist2] = await Promise.all([
    analyzeDistribution(teamId, period1),
    analyzeDistribution(teamId, period2),
  ]);

  const avgLoad1 = dist1.members.reduce((sum, m) => sum + m.workload.currentLoad, 0) / dist1.members.length;
  const avgLoad2 = dist2.members.reduce((sum, m) => sum + m.workload.currentLoad, 0) / dist2.members.length;

  const changes = {
    distributionScoreChange: dist2.overview.distributionScore - dist1.overview.distributionScore,
    avgLoadChange: avgLoad2 - avgLoad1,
    imbalanceChange: dist2.imbalances.length - dist1.imbalances.length,
    summary: '',
  };

  if (changes.distributionScoreChange > 5) {
    changes.summary = 'Workload distribution has improved';
  } else if (changes.distributionScoreChange < -5) {
    changes.summary = 'Workload distribution has worsened';
  } else {
    changes.summary = 'Workload distribution is stable';
  }

  return { period1: dist1, period2: dist2, changes };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  analyzeDistribution,
  getMemberTaskMetrics,
  getAssignmentSuggestions,
  compareDistribution,
};
