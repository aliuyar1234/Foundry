/**
 * Workload Balancer Service
 * T041 - Create workload balancer for routing
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getWorkloadScore, getHighestWorkload, getHighBurnoutRisk } from '../operate/realtimeMetrics.js';

// =============================================================================
// Types
// =============================================================================

export interface WorkloadCapacity {
  hasCapacity: boolean;
  score: number; // 0-1, higher = more capacity
  currentWorkload: number;
  maxWorkload: number;
  activeTaskCount: number;
  burnoutRisk: number;
  reason?: string;
}

export interface WorkloadRecommendation {
  personId: string;
  personName: string;
  workloadScore: number;
  capacityRemaining: number;
  recommendationReason: string;
}

// =============================================================================
// Configuration
// =============================================================================

const WORKLOAD_THRESHOLDS = {
  /** Workload percentage above which routing is discouraged */
  HIGH_WORKLOAD: 80,
  /** Workload percentage above which routing is blocked */
  CRITICAL_WORKLOAD: 95,
  /** Burnout risk score above which routing is discouraged */
  HIGH_BURNOUT_RISK: 70,
  /** Default max tasks per person */
  DEFAULT_MAX_TASKS: 20,
};

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Check if a person has capacity for more work
 */
export async function checkWorkloadCapacity(
  personId: string,
  organizationId: string
): Promise<WorkloadCapacity> {
  // Try to get real-time workload from cache
  const cachedWorkload = await getWorkloadScore(organizationId, personId);

  if (cachedWorkload) {
    return evaluateCapacity(cachedWorkload.workloadScore, cachedWorkload.burnoutRisk);
  }

  // Fall back to database query
  const profile = await prisma.expertiseProfile.findUnique({
    where: { personId },
  });

  if (!profile) {
    // No profile, assume available
    return {
      hasCapacity: true,
      score: 0.8,
      currentWorkload: 20,
      maxWorkload: 100,
      activeTaskCount: 0,
      burnoutRisk: 0,
    };
  }

  const availability = profile.availability as Record<string, unknown>;
  const currentWorkload = (availability?.currentWorkload as number) || 0;

  return evaluateCapacity(currentWorkload, 0);
}

/**
 * Evaluate capacity based on workload and burnout risk
 */
function evaluateCapacity(workload: number, burnoutRisk: number): WorkloadCapacity {
  const maxWorkload = 100;

  // Calculate score (higher = more capacity available)
  const workloadScore = 1 - (workload / maxWorkload);
  const burnoutFactor = burnoutRisk > WORKLOAD_THRESHOLDS.HIGH_BURNOUT_RISK ? 0.5 : 1;
  const score = workloadScore * burnoutFactor;

  // Determine if person has capacity
  let hasCapacity = true;
  let reason: string | undefined;

  if (workload >= WORKLOAD_THRESHOLDS.CRITICAL_WORKLOAD) {
    hasCapacity = false;
    reason = 'At maximum capacity';
  } else if (workload >= WORKLOAD_THRESHOLDS.HIGH_WORKLOAD) {
    hasCapacity = true; // Still has some capacity
    reason = 'High workload, consider alternatives';
  } else if (burnoutRisk > WORKLOAD_THRESHOLDS.HIGH_BURNOUT_RISK) {
    hasCapacity = true; // Can take work but flag it
    reason = 'High burnout risk detected';
  }

  return {
    hasCapacity,
    score,
    currentWorkload: workload,
    maxWorkload,
    activeTaskCount: Math.round(workload / 5), // Estimate
    burnoutRisk,
    reason,
  };
}

/**
 * Find person with lowest workload from a group
 */
export async function findLowestWorkload(
  personIds: string[],
  organizationId: string
): Promise<WorkloadRecommendation | null> {
  if (personIds.length === 0) return null;

  const workloads = await Promise.all(
    personIds.map(async (id) => {
      const capacity = await checkWorkloadCapacity(id, organizationId);
      const profile = await prisma.expertiseProfile.findUnique({
        where: { personId: id },
        select: { personName: true },
      });

      return {
        personId: id,
        personName: profile?.personName || 'Unknown',
        workloadScore: capacity.score,
        currentWorkload: capacity.currentWorkload,
        hasCapacity: capacity.hasCapacity,
      };
    })
  );

  // Filter to only those with capacity, sort by workload score (descending)
  const available = workloads
    .filter(w => w.hasCapacity)
    .sort((a, b) => b.workloadScore - a.workloadScore);

  if (available.length === 0) {
    // No one has capacity, return least loaded anyway
    const leastLoaded = workloads.sort((a, b) => b.workloadScore - a.workloadScore)[0];
    return {
      personId: leastLoaded.personId,
      personName: leastLoaded.personName,
      workloadScore: leastLoaded.workloadScore,
      capacityRemaining: Math.max(0, 100 - leastLoaded.currentWorkload),
      recommendationReason: 'Least loaded among fully occupied team members',
    };
  }

  const best = available[0];
  return {
    personId: best.personId,
    personName: best.personName,
    workloadScore: best.workloadScore,
    capacityRemaining: Math.max(0, 100 - best.currentWorkload),
    recommendationReason: 'Has available capacity for new tasks',
  };
}

/**
 * Balance workload across a team
 */
export async function getTeamWorkloadBalance(
  organizationId: string,
  teamId?: string
): Promise<{
  balanced: boolean;
  avgWorkload: number;
  variance: number;
  recommendations: WorkloadRecommendation[];
}> {
  // Get all team members' workload
  const highWorkload = await getHighestWorkload(organizationId, 50);

  if (highWorkload.length === 0) {
    return {
      balanced: true,
      avgWorkload: 0,
      variance: 0,
      recommendations: [],
    };
  }

  // Calculate average and variance
  const workloads = highWorkload.map(w => w.score);
  const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length;
  const variance = workloads.reduce((sum, w) => sum + Math.pow(w - avgWorkload, 2), 0) / workloads.length;

  // Team is balanced if variance is low
  const balanced = variance < 200; // Allow 14% std deviation

  // Find recommendations
  const recommendations: WorkloadRecommendation[] = [];

  // Identify overloaded people
  const overloaded = highWorkload.filter(w => w.score > WORKLOAD_THRESHOLDS.HIGH_WORKLOAD);
  const underloaded = highWorkload.filter(w => w.score < avgWorkload - 10);

  for (const over of overloaded.slice(0, 3)) {
    const under = underloaded.find(u => u.score < avgWorkload);
    if (under) {
      recommendations.push({
        personId: under.personId,
        personName: '', // Would need to look up
        workloadScore: 1 - (under.score / 100),
        capacityRemaining: 100 - under.score,
        recommendationReason: `Can take work from overloaded team member (${over.score}% → ${under.score}%)`,
      });
    }
  }

  logger.debug({
    balanced,
    avgWorkload,
    variance,
    overloadedCount: overloaded.length,
  }, 'Team workload analysis completed');

  return {
    balanced,
    avgWorkload,
    variance,
    recommendations,
  };
}

/**
 * Get redistribution suggestions for an overloaded person
 */
export async function getRedistributionSuggestions(
  personId: string,
  organizationId: string
): Promise<WorkloadRecommendation[]> {
  // Get people with capacity
  const capacity = await checkWorkloadCapacity(personId, organizationId);

  if (capacity.score > 0.3) {
    // Not overloaded enough to warrant redistribution
    return [];
  }

  // Find people in same team with capacity
  const profile = await prisma.expertiseProfile.findUnique({
    where: { personId },
  });

  if (!profile) return [];

  const availability = profile.availability as Record<string, unknown>;
  const team = availability?.team as string | undefined;

  // Get team members (simplified - would query graph in real implementation)
  const teamMembers = await prisma.expertiseProfile.findMany({
    where: {
      organizationId,
      personId: { not: personId },
    },
    take: 10,
  });

  const recommendations: WorkloadRecommendation[] = [];

  for (const member of teamMembers) {
    const memberAvail = member.availability as Record<string, unknown>;
    const memberWorkload = (memberAvail?.currentWorkload as number) || 0;

    if (memberWorkload < WORKLOAD_THRESHOLDS.HIGH_WORKLOAD) {
      recommendations.push({
        personId: member.personId,
        personName: member.personName,
        workloadScore: 1 - (memberWorkload / 100),
        capacityRemaining: 100 - memberWorkload,
        recommendationReason: 'Available to take on redistributed tasks',
      });
    }
  }

  return recommendations.sort((a, b) => b.workloadScore - a.workloadScore).slice(0, 5);
}

/**
 * Check for burnout risk in organization
 */
export async function checkOrganizationBurnoutRisk(
  organizationId: string,
  threshold: number = WORKLOAD_THRESHOLDS.HIGH_BURNOUT_RISK
): Promise<{
  atRiskCount: number;
  atRiskPeople: Array<{ personId: string; risk: number }>;
}> {
  const atRisk = await getHighBurnoutRisk(organizationId, threshold);

  return {
    atRiskCount: atRisk.length,
    atRiskPeople: atRisk,
  };
}

export default {
  checkWorkloadCapacity,
  findLowestWorkload,
  getTeamWorkloadBalance,
  getRedistributionSuggestions,
  checkOrganizationBurnoutRisk,
  WORKLOAD_THRESHOLDS,
};
