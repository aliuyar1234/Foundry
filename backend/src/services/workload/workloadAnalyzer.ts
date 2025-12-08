/**
 * Workload Analyzer Service
 * T039 - Create workload calculator service
 *
 * Calculates and analyzes workload metrics for individuals and teams
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import type {
  WorkloadMetrics,
  BurnoutRiskAssessment,
  BurnoutRiskFactor,
  TeamWorkload,
  TeamMemberWorkload,
} from 'shared/types/workload.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface WorkloadInput {
  personId: string;
  personName: string;
  department?: string;
  team?: string;
  role?: string;
}

export interface ActivityData {
  emailsReceived: number;
  emailsSent: number;
  messagesReceived: number;
  messagesSent: number;
  meetingsAttended: number;
  meetingHours: number;
  activeTasks: number;
  pendingTasks: number;
  completedTasksToday: number;
  avgResponseTimeMs?: number;
}

export interface WorkloadWeights {
  taskWeight: number;
  communicationWeight: number;
  meetingWeight: number;
  responseTimeWeight: number;
}

// Default weights for workload calculation
const DEFAULT_WEIGHTS: WorkloadWeights = {
  taskWeight: 0.35,
  communicationWeight: 0.25,
  meetingWeight: 0.30,
  responseTimeWeight: 0.10,
};

// Thresholds for burnout risk calculation
const BURNOUT_THRESHOLDS = {
  workHours: { safe: 40, warning: 50, critical: 60 },
  meetingHours: { safe: 15, warning: 25, critical: 35 },
  communicationVolume: { safe: 100, warning: 200, critical: 350 },
  taskCount: { safe: 10, warning: 20, critical: 30 },
  responseTimePressure: { safe: 3600000, warning: 1800000, critical: 900000 }, // ms
  afterHoursPercentage: { safe: 5, warning: 15, critical: 25 },
};

// =============================================================================
// Workload Calculation
// =============================================================================

/**
 * Calculate workload score for a person based on activity data
 */
export function calculateWorkloadScore(
  activity: ActivityData,
  weights: WorkloadWeights = DEFAULT_WEIGHTS
): number {
  // Normalize each component to 0-100 scale

  // Task load: Based on active + pending tasks
  const taskLoad = Math.min(
    ((activity.activeTasks + activity.pendingTasks * 0.5) / 25) * 100,
    100
  );

  // Communication load: Based on total messages (emails + messages)
  const totalCommunication =
    activity.emailsReceived +
    activity.emailsSent +
    activity.messagesReceived +
    activity.messagesSent;
  const communicationLoad = Math.min((totalCommunication / 150) * 100, 100);

  // Meeting load: Based on meeting hours (assuming 40-hour week)
  const meetingLoad = Math.min((activity.meetingHours / 30) * 100, 100);

  // Response time pressure: Faster response = higher pressure
  let responseTimePressure = 0;
  if (activity.avgResponseTimeMs) {
    // Lower response time = higher pressure
    const targetResponse = 4 * 60 * 60 * 1000; // 4 hours
    responseTimePressure = Math.max(
      0,
      Math.min(100, ((targetResponse - activity.avgResponseTimeMs) / targetResponse) * 100)
    );
  }

  // Calculate weighted average
  const workloadScore =
    taskLoad * weights.taskWeight +
    communicationLoad * weights.communicationWeight +
    meetingLoad * weights.meetingWeight +
    responseTimePressure * weights.responseTimeWeight;

  return Math.round(Math.min(Math.max(workloadScore, 0), 100));
}

/**
 * Calculate capacity remaining based on workload score
 */
export function calculateCapacityRemaining(workloadScore: number): number {
  return Math.max(0, 100 - workloadScore);
}

/**
 * Calculate full workload metrics for a person
 */
export async function calculateWorkloadMetrics(
  organizationId: string,
  input: WorkloadInput,
  activity: ActivityData
): Promise<WorkloadMetrics> {
  const workloadScore = calculateWorkloadScore(activity);
  const capacityRemaining = calculateCapacityRemaining(workloadScore);
  const burnoutRiskScore = await calculateBurnoutRiskScore(activity);

  return {
    personId: input.personId,
    personName: input.personName,
    organizationId,
    timestamp: new Date(),

    // Task metrics
    activeTasks: activity.activeTasks,
    pendingTasks: activity.pendingTasks,
    completedTasksToday: activity.completedTasksToday,

    // Communication metrics
    emailsReceived: activity.emailsReceived,
    emailsSent: activity.emailsSent,
    messagesReceived: activity.messagesReceived,
    messagesSent: activity.messagesSent,
    meetingsAttended: activity.meetingsAttended,
    meetingHours: activity.meetingHours,

    // Response metrics
    avgResponseTimeMs: activity.avgResponseTimeMs,
    medianResponseTimeMs: undefined, // Requires more detailed data

    // Capacity metrics
    workloadScore,
    capacityRemaining,
    burnoutRiskScore,

    // Context
    department: input.department,
    team: input.team,
    role: input.role,
  };
}

// =============================================================================
// Burnout Risk Analysis
// =============================================================================

/**
 * Calculate burnout risk score from activity data
 */
export async function calculateBurnoutRiskScore(
  activity: ActivityData
): Promise<number> {
  const factors = calculateBurnoutRiskFactors(activity);

  // Weighted average of all factor scores
  let totalWeight = 0;
  let weightedSum = 0;

  for (const factor of factors) {
    weightedSum += factor.score * factor.weight;
    totalWeight += factor.weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Calculate detailed burnout risk factors
 */
export function calculateBurnoutRiskFactors(
  activity: ActivityData
): BurnoutRiskFactor[] {
  const factors: BurnoutRiskFactor[] = [];

  // Meeting overload factor
  const meetingScore = calculateFactorScore(
    activity.meetingHours,
    BURNOUT_THRESHOLDS.meetingHours
  );
  factors.push({
    factor: 'meeting_overload',
    score: meetingScore,
    weight: 0.25,
    description: `${activity.meetingHours}h in meetings this week`,
    trend: 'stable',
  });

  // Communication volume factor
  const commVolume =
    activity.emailsReceived +
    activity.emailsSent +
    activity.messagesReceived +
    activity.messagesSent;
  const commScore = calculateFactorScore(
    commVolume,
    BURNOUT_THRESHOLDS.communicationVolume
  );
  factors.push({
    factor: 'communication_volume',
    score: commScore,
    weight: 0.20,
    description: `${commVolume} total communications`,
    trend: 'stable',
  });

  // Task overload factor
  const taskCount = activity.activeTasks + activity.pendingTasks;
  const taskScore = calculateFactorScore(taskCount, BURNOUT_THRESHOLDS.taskCount);
  factors.push({
    factor: 'task_overload',
    score: taskScore,
    weight: 0.25,
    description: `${taskCount} active/pending tasks`,
    trend: 'stable',
  });

  // Response time pressure factor
  if (activity.avgResponseTimeMs) {
    // Inverse: lower response time = higher pressure
    const responseScore = calculateInverseFactorScore(
      activity.avgResponseTimeMs,
      BURNOUT_THRESHOLDS.responseTimePressure
    );
    factors.push({
      factor: 'response_time_pressure',
      score: responseScore,
      weight: 0.15,
      description: `Avg response time: ${Math.round(activity.avgResponseTimeMs / 60000)}min`,
      trend: 'stable',
    });
  }

  // Workload variance factor (estimated)
  const workloadVariance = Math.abs(
    (activity.activeTasks / Math.max(activity.completedTasksToday, 1)) - 1
  ) * 50;
  factors.push({
    factor: 'workload_variance',
    score: Math.min(workloadVariance, 100),
    weight: 0.15,
    description: 'Workload inconsistency indicator',
    trend: 'stable',
  });

  return factors;
}

/**
 * Generate full burnout risk assessment
 */
export async function assessBurnoutRisk(
  organizationId: string,
  input: WorkloadInput,
  activity: ActivityData
): Promise<BurnoutRiskAssessment> {
  const factors = calculateBurnoutRiskFactors(activity);
  const riskScore = await calculateBurnoutRiskScore(activity);

  // Determine risk level
  let riskLevel: BurnoutRiskAssessment['riskLevel'];
  if (riskScore >= 80) riskLevel = 'critical';
  else if (riskScore >= 60) riskLevel = 'high';
  else if (riskScore >= 40) riskLevel = 'moderate';
  else riskLevel = 'low';

  // Generate recommendations based on factors
  const recommendedActions = generateRecommendations(factors, riskLevel);

  return {
    personId: input.personId,
    personName: input.personName,
    riskScore,
    riskLevel,
    factors,
    trend: 'stable', // Would need historical data to determine
    recommendedActions,
    lastAssessedAt: new Date(),
  };
}

// =============================================================================
// Team Workload Analysis
// =============================================================================

/**
 * Calculate team workload metrics
 */
export async function calculateTeamWorkload(
  organizationId: string,
  teamId: string,
  teamName: string,
  memberMetrics: WorkloadMetrics[]
): Promise<TeamWorkload> {
  if (memberMetrics.length === 0) {
    return {
      teamId,
      teamName,
      memberCount: 0,
      metrics: {
        avgWorkloadScore: 0,
        maxWorkloadScore: 0,
        avgBurnoutRisk: 0,
        highRiskMembers: 0,
        totalActiveTasks: 0,
        totalMeetingHours: 0,
      },
      distribution: [],
    };
  }

  const distribution: TeamMemberWorkload[] = memberMetrics.map((m) => ({
    personId: m.personId,
    personName: m.personName,
    workloadScore: m.workloadScore,
    burnoutRiskScore: m.burnoutRiskScore,
    activeTasks: m.activeTasks,
    capacityRemaining: m.capacityRemaining,
  }));

  // Calculate aggregates
  const workloadScores = memberMetrics.map((m) => m.workloadScore);
  const burnoutScores = memberMetrics.map((m) => m.burnoutRiskScore);

  return {
    teamId,
    teamName,
    memberCount: memberMetrics.length,
    metrics: {
      avgWorkloadScore: Math.round(average(workloadScores)),
      maxWorkloadScore: Math.max(...workloadScores),
      avgBurnoutRisk: Math.round(average(burnoutScores)),
      highRiskMembers: memberMetrics.filter((m) => m.burnoutRiskScore >= 60).length,
      totalActiveTasks: sum(memberMetrics.map((m) => m.activeTasks)),
      totalMeetingHours: sum(memberMetrics.map((m) => m.meetingHours)),
    },
    distribution: distribution.sort((a, b) => b.workloadScore - a.workloadScore),
  };
}

/**
 * Identify workload imbalances in a team
 */
export function identifyWorkloadImbalances(
  teamWorkload: TeamWorkload
): {
  hasImbalance: boolean;
  overloadedMembers: string[];
  underutilizedMembers: string[];
  imbalanceScore: number;
} {
  const avgWorkload = teamWorkload.metrics.avgWorkloadScore;
  const threshold = 25; // Points from average

  const overloadedMembers = teamWorkload.distribution
    .filter((m) => m.workloadScore > avgWorkload + threshold)
    .map((m) => m.personId);

  const underutilizedMembers = teamWorkload.distribution
    .filter((m) => m.workloadScore < avgWorkload - threshold)
    .map((m) => m.personId);

  const workloadScores = teamWorkload.distribution.map((m) => m.workloadScore);
  const imbalanceScore = calculateStandardDeviation(workloadScores);

  return {
    hasImbalance: overloadedMembers.length > 0 || underutilizedMembers.length > 0,
    overloadedMembers,
    underutilizedMembers,
    imbalanceScore: Math.round(imbalanceScore),
  };
}

/**
 * Get redistribution suggestions for overloaded team member
 */
export function suggestRedistribution(
  overloadedMember: TeamMemberWorkload,
  teamMembers: TeamMemberWorkload[],
  availableTasks: Array<{ id: string; name: string; estimatedHours: number; skills?: string[] }>
): Array<{
  taskId: string;
  taskName: string;
  suggestedAssignee: string;
  reason: string;
}> {
  const suggestions: Array<{
    taskId: string;
    taskName: string;
    suggestedAssignee: string;
    reason: string;
  }> = [];

  // Find members with capacity
  const membersWithCapacity = teamMembers
    .filter(
      (m) =>
        m.personId !== overloadedMember.personId &&
        m.capacityRemaining > 20 &&
        m.burnoutRiskScore < 60
    )
    .sort((a, b) => b.capacityRemaining - a.capacityRemaining);

  if (membersWithCapacity.length === 0) {
    return suggestions;
  }

  // Suggest task redistribution
  for (const task of availableTasks) {
    const bestCandidate = membersWithCapacity.find(
      (m) => m.capacityRemaining >= task.estimatedHours * 5 // Rough capacity conversion
    );

    if (bestCandidate) {
      suggestions.push({
        taskId: task.id,
        taskName: task.name,
        suggestedAssignee: bestCandidate.personId,
        reason: `${bestCandidate.personName} has ${bestCandidate.capacityRemaining}% capacity remaining`,
      });

      // Update candidate's capacity for next iteration
      bestCandidate.capacityRemaining -= task.estimatedHours * 5;
    }
  }

  return suggestions;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate factor score based on thresholds
 */
function calculateFactorScore(
  value: number,
  thresholds: { safe: number; warning: number; critical: number }
): number {
  if (value <= thresholds.safe) {
    return (value / thresholds.safe) * 33;
  } else if (value <= thresholds.warning) {
    return 33 + ((value - thresholds.safe) / (thresholds.warning - thresholds.safe)) * 33;
  } else if (value <= thresholds.critical) {
    return 66 + ((value - thresholds.warning) / (thresholds.critical - thresholds.warning)) * 34;
  }
  return 100;
}

/**
 * Calculate inverse factor score (lower value = higher score)
 */
function calculateInverseFactorScore(
  value: number,
  thresholds: { safe: number; warning: number; critical: number }
): number {
  if (value >= thresholds.safe) {
    return ((thresholds.safe - Math.min(value, thresholds.safe * 2)) / thresholds.safe + 1) * 33;
  } else if (value >= thresholds.warning) {
    return 33 + ((thresholds.safe - value) / (thresholds.safe - thresholds.warning)) * 33;
  } else if (value >= thresholds.critical) {
    return 66 + ((thresholds.warning - value) / (thresholds.warning - thresholds.critical)) * 34;
  }
  return 100;
}

/**
 * Generate recommendations based on risk factors
 */
function generateRecommendations(
  factors: BurnoutRiskFactor[],
  riskLevel: string
): string[] {
  const recommendations: string[] = [];

  // Sort factors by contribution to risk
  const sortedFactors = [...factors].sort(
    (a, b) => b.score * b.weight - a.score * a.weight
  );

  // Generate recommendations for top risk factors
  for (const factor of sortedFactors.slice(0, 3)) {
    if (factor.score < 40) continue;

    switch (factor.factor) {
      case 'meeting_overload':
        recommendations.push('Review and consolidate recurring meetings');
        recommendations.push('Block focus time on calendar');
        break;
      case 'communication_volume':
        recommendations.push('Implement email batching - check 2-3 times daily');
        recommendations.push('Use async communication where possible');
        break;
      case 'task_overload':
        recommendations.push('Prioritize tasks and defer non-urgent items');
        recommendations.push('Discuss workload distribution with manager');
        break;
      case 'response_time_pressure':
        recommendations.push('Set expectations for response times');
        recommendations.push('Use status indicators for availability');
        break;
      case 'after_hours_work':
        recommendations.push('Set clear boundaries for work hours');
        recommendations.push('Configure notification schedules');
        break;
    }
  }

  // Add general recommendations based on risk level
  if (riskLevel === 'critical') {
    recommendations.unshift('Immediate workload reduction recommended');
    recommendations.push('Consider discussing with HR or manager');
  } else if (riskLevel === 'high') {
    recommendations.unshift('Take proactive steps to reduce workload');
  }

  return [...new Set(recommendations)].slice(0, 5);
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function sum(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0);
}

function calculateStandardDeviation(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = average(arr);
  const squareDiffs = arr.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

export default {
  calculateWorkloadScore,
  calculateCapacityRemaining,
  calculateWorkloadMetrics,
  calculateBurnoutRiskScore,
  calculateBurnoutRiskFactors,
  assessBurnoutRisk,
  calculateTeamWorkload,
  identifyWorkloadImbalances,
  suggestRedistribution,
  DEFAULT_WEIGHTS,
  BURNOUT_THRESHOLDS,
};
