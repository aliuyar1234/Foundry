/**
 * Workload Imbalance Detector
 * T134 - Implement workload imbalance detector
 *
 * Detects uneven workload distribution across team members
 */

import { logger } from '../../lib/logger.js';
import {
  registerDetector,
  createDetectedPattern,
  mergePatterns,
} from './patternDetector.js';
import type { DetectedPattern, AffectedEntity } from 'shared/types/selfHealing.js';
import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface WorkloadImbalanceConfig {
  /** Standard deviation threshold for workload imbalance */
  stdDevThreshold: number;
  /** Maximum workload score difference between team members */
  maxWorkloadDifference: number;
  /** Minimum team size to analyze */
  minTeamSize: number;
  /** High workload threshold (0-100) */
  highWorkloadThreshold: number;
  /** Low workload threshold (0-100) */
  lowWorkloadThreshold: number;
}

interface TeamWorkloadAnalysis {
  teamId: string;
  teamName: string;
  department?: string;
  memberCount: number;
  avgWorkload: number;
  stdDev: number;
  maxWorkload: number;
  minWorkload: number;
  overloadedMembers: MemberWorkload[];
  underutilizedMembers: MemberWorkload[];
  isImbalanced: boolean;
  imbalanceScore: number;
}

interface MemberWorkload {
  personId: string;
  personName: string;
  workloadScore: number;
  activeTasks: number;
  pendingRequests: number;
  meetingHours: number;
}

// Default configuration
const DEFAULT_CONFIG: WorkloadImbalanceConfig = {
  stdDevThreshold: 20,
  maxWorkloadDifference: 40,
  minTeamSize: 3,
  highWorkloadThreshold: 80,
  lowWorkloadThreshold: 30,
};

// =============================================================================
// Detector Implementation
// =============================================================================

/**
 * Detect workload imbalances across teams
 */
export async function detectWorkloadImbalances(
  organizationId: string,
  timeWindowMinutes: number,
  config: Partial<WorkloadImbalanceConfig> = {}
): Promise<DetectedPattern[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const patterns: DetectedPattern[] = [];

  logger.debug({ organizationId, config: cfg }, 'Detecting workload imbalances');

  try {
    // Analyze workload by team
    const teamAnalyses = await analyzeTeamWorkloads(organizationId, cfg);

    for (const analysis of teamAnalyses) {
      if (!analysis.isImbalanced) continue;

      const severity = determineSeverity(analysis, cfg);
      const affectedEntities = buildAffectedEntities(analysis);

      const pattern = createDetectedPattern(
        'workload_imbalance',
        buildDescription(analysis),
        severity,
        affectedEntities,
        generateSuggestedActions(analysis)
      );

      patterns.push(pattern);
    }

    const merged = mergePatterns(patterns);

    logger.info(
      {
        organizationId,
        teamsAnalyzed: teamAnalyses.length,
        imbalancedTeams: patterns.length,
      },
      'Workload imbalance detection completed'
    );

    return merged;
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to detect workload imbalances');
    throw error;
  }
}

// =============================================================================
// Workload Analysis
// =============================================================================

async function analyzeTeamWorkloads(
  organizationId: string,
  config: WorkloadImbalanceConfig
): Promise<TeamWorkloadAnalysis[]> {
  const analyses: TeamWorkloadAnalysis[] = [];

  // Get teams/departments in organization
  const teams = await getTeams(organizationId);

  for (const team of teams) {
    // Get members and their workloads
    const members = await getTeamMemberWorkloads(organizationId, team.id);

    if (members.length < config.minTeamSize) continue;

    // Calculate statistics
    const workloads = members.map((m) => m.workloadScore);
    const avgWorkload = average(workloads);
    const stdDev = standardDeviation(workloads);
    const maxWorkload = Math.max(...workloads);
    const minWorkload = Math.min(...workloads);

    // Identify overloaded and underutilized members
    const overloadedMembers = members.filter(
      (m) => m.workloadScore >= config.highWorkloadThreshold
    );
    const underutilizedMembers = members.filter(
      (m) => m.workloadScore <= config.lowWorkloadThreshold
    );

    // Calculate imbalance score (0-100)
    const imbalanceScore = calculateImbalanceScore(
      stdDev,
      maxWorkload - minWorkload,
      config
    );

    // Determine if team is imbalanced
    const isImbalanced =
      stdDev > config.stdDevThreshold ||
      maxWorkload - minWorkload > config.maxWorkloadDifference ||
      (overloadedMembers.length > 0 && underutilizedMembers.length > 0);

    analyses.push({
      teamId: team.id,
      teamName: team.name,
      department: team.department,
      memberCount: members.length,
      avgWorkload,
      stdDev,
      maxWorkload,
      minWorkload,
      overloadedMembers,
      underutilizedMembers,
      isImbalanced,
      imbalanceScore,
    });
  }

  return analyses;
}

async function getTeams(
  organizationId: string
): Promise<Array<{ id: string; name: string; department?: string }>> {
  // Get unique teams from person data
  const teams = await prisma.$queryRaw<
    Array<{ id: string; name: string; department: string | null }>
  >`
    SELECT DISTINCT
      COALESCE(team, department) as id,
      COALESCE(team, department) as name,
      department
    FROM "Person"
    WHERE "organizationId" = ${organizationId}
      AND (team IS NOT NULL OR department IS NOT NULL)
  `.catch(() => []);

  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    department: t.department || undefined,
  }));
}

async function getTeamMemberWorkloads(
  organizationId: string,
  teamId: string
): Promise<MemberWorkload[]> {
  // Get team members with their workload data
  const members = await prisma.$queryRaw<
    Array<{
      personId: string;
      personName: string;
      workloadScore: number | null;
      activeTasks: number;
      pendingRequests: number;
      meetingHours: number;
    }>
  >`
    SELECT
      p.id as "personId",
      p.name as "personName",
      COALESCE(p."currentWorkload", 50) as "workloadScore",
      COALESCE(
        (SELECT COUNT(*) FROM "Task" t WHERE t."assigneeId" = p.id AND t.status = 'in_progress'),
        0
      ) as "activeTasks",
      COALESCE(
        (SELECT COUNT(*) FROM "RoutingDecision" rd WHERE rd."handlerId" = p.id AND rd."responseTime" IS NULL),
        0
      ) as "pendingRequests",
      COALESCE(p."meetingHoursThisWeek", 0) as "meetingHours"
    FROM "Person" p
    WHERE p."organizationId" = ${organizationId}
      AND (p.team = ${teamId} OR p.department = ${teamId})
      AND p."isActive" = true
  `.catch(() => []);

  return members.map((m) => ({
    personId: m.personId,
    personName: m.personName,
    workloadScore: m.workloadScore || 50,
    activeTasks: Number(m.activeTasks),
    pendingRequests: Number(m.pendingRequests),
    meetingHours: m.meetingHours,
  }));
}

// =============================================================================
// Analysis Helpers
// =============================================================================

function calculateImbalanceScore(
  stdDev: number,
  range: number,
  config: WorkloadImbalanceConfig
): number {
  const stdDevScore = Math.min(100, (stdDev / config.stdDevThreshold) * 50);
  const rangeScore = Math.min(100, (range / config.maxWorkloadDifference) * 50);
  return Math.round((stdDevScore + rangeScore) / 2);
}

function determineSeverity(
  analysis: TeamWorkloadAnalysis,
  config: WorkloadImbalanceConfig
): DetectedPattern['severity'] {
  if (analysis.imbalanceScore >= 80) return 'critical';
  if (analysis.imbalanceScore >= 60) return 'high';
  if (analysis.imbalanceScore >= 40) return 'medium';
  return 'low';
}

function buildDescription(analysis: TeamWorkloadAnalysis): string {
  const parts: string[] = [];

  parts.push(`Team "${analysis.teamName}" has workload imbalance`);

  if (analysis.overloadedMembers.length > 0) {
    parts.push(
      `${analysis.overloadedMembers.length} overloaded member(s)`
    );
  }

  if (analysis.underutilizedMembers.length > 0) {
    parts.push(
      `${analysis.underutilizedMembers.length} underutilized member(s)`
    );
  }

  parts.push(
    `workload range: ${Math.round(analysis.minWorkload)}%-${Math.round(analysis.maxWorkload)}%`
  );

  return parts.join(', ');
}

function buildAffectedEntities(analysis: TeamWorkloadAnalysis): AffectedEntity[] {
  const entities: AffectedEntity[] = [
    {
      type: 'team',
      id: analysis.teamId,
      name: analysis.teamName,
      impact: 'direct',
    },
  ];

  // Add overloaded members
  for (const member of analysis.overloadedMembers) {
    entities.push({
      type: 'person',
      id: member.personId,
      name: `${member.personName} (overloaded: ${Math.round(member.workloadScore)}%)`,
      impact: 'direct',
    });
  }

  // Add underutilized members
  for (const member of analysis.underutilizedMembers) {
    entities.push({
      type: 'person',
      id: member.personId,
      name: `${member.personName} (underutilized: ${Math.round(member.workloadScore)}%)`,
      impact: 'direct',
    });
  }

  return entities;
}

function generateSuggestedActions(analysis: TeamWorkloadAnalysis): string[] {
  const actions: string[] = [];

  if (analysis.overloadedMembers.length > 0) {
    actions.push('Redistribute tasks from overloaded team members');
    actions.push('Review pending assignments for overloaded members');
    actions.push('Consider temporary task reassignment');
  }

  if (analysis.underutilizedMembers.length > 0) {
    actions.push('Assign pending tasks to underutilized members');
    actions.push('Review task routing rules to improve distribution');
  }

  if (analysis.stdDev > DEFAULT_CONFIG.stdDevThreshold * 1.5) {
    actions.push('Review team capacity and consider staffing adjustments');
    actions.push('Implement round-robin task assignment');
  }

  actions.push('Schedule team workload review meeting');

  return actions;
}

// =============================================================================
// Utility Functions
// =============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

// =============================================================================
// Advanced Analysis
// =============================================================================

/**
 * Get redistribution suggestions for a team
 */
export async function getRedistributionSuggestions(
  organizationId: string,
  teamId: string
): Promise<
  Array<{
    fromPersonId: string;
    fromPersonName: string;
    toPersonId: string;
    toPersonName: string;
    taskCount: number;
    reason: string;
  }>
> {
  const members = await getTeamMemberWorkloads(organizationId, teamId);
  const suggestions: Array<{
    fromPersonId: string;
    fromPersonName: string;
    toPersonId: string;
    toPersonName: string;
    taskCount: number;
    reason: string;
  }> = [];

  const overloaded = members.filter(
    (m) => m.workloadScore >= DEFAULT_CONFIG.highWorkloadThreshold
  );
  const available = members
    .filter((m) => m.workloadScore <= DEFAULT_CONFIG.lowWorkloadThreshold + 10)
    .sort((a, b) => a.workloadScore - b.workloadScore);

  for (const source of overloaded) {
    for (const target of available) {
      if (target.workloadScore >= source.workloadScore - 20) continue;

      const tasksToMove = Math.min(
        Math.ceil(source.activeTasks * 0.3),
        Math.ceil((source.workloadScore - target.workloadScore) / 10)
      );

      if (tasksToMove > 0) {
        suggestions.push({
          fromPersonId: source.personId,
          fromPersonName: source.personName,
          toPersonId: target.personId,
          toPersonName: target.personName,
          taskCount: tasksToMove,
          reason: `Balance workload from ${Math.round(source.workloadScore)}% to ${Math.round(target.workloadScore)}%`,
        });
      }
    }
  }

  return suggestions;
}

// =============================================================================
// Register Detector
// =============================================================================

registerDetector({
  patternType: 'workload_imbalance',
  detect: (organizationId, timeWindowMinutes) =>
    detectWorkloadImbalances(organizationId, timeWindowMinutes),
});

export default {
  detectWorkloadImbalances,
  getRedistributionSuggestions,
  DEFAULT_CONFIG,
};
