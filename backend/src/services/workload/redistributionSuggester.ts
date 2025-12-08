/**
 * Task Redistribution Suggester
 * T211 - Suggest optimal task redistribution
 *
 * Analyzes workload and suggests how to redistribute tasks
 */

import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface RedistributionSuggestion {
  id: string;
  type: 'reassign' | 'split' | 'defer' | 'escalate';
  priority: 'critical' | 'high' | 'medium' | 'low';
  task: {
    id: string;
    title: string;
    currentAssignee: string;
    currentAssigneeName: string;
    estimatedHours: number;
    deadline?: Date;
    priority: string;
  };
  suggestion: {
    targetAssignee?: string;
    targetAssigneeName?: string;
    newDeadline?: Date;
    splitInto?: number;
    reason: string;
  };
  impact: {
    sourceLoadReduction: number;
    targetLoadIncrease?: number;
    riskMitigation: string;
  };
  confidence: number;
  constraints: string[];
}

export interface RedistributionPlan {
  teamId: string;
  generatedAt: Date;
  summary: {
    totalSuggestions: number;
    expectedLoadBalancing: number; // percentage improvement
    affectedPeople: number;
    criticalActions: number;
  };
  suggestions: RedistributionSuggestion[];
  beforeState: TeamLoadState;
  afterState: TeamLoadState;
}

export interface TeamLoadState {
  members: Array<{
    personId: string;
    personName: string;
    currentLoad: number;
    taskCount: number;
  }>;
  loadVariance: number;
  maxLoad: number;
  minLoad: number;
  balanceScore: number; // 0-100
}

export interface RedistributionConstraints {
  respectSkills?: boolean;
  respectDeadlines?: boolean;
  maxReassignmentsPerPerson?: number;
  preferSameTeam?: boolean;
  excludePersons?: string[];
}

// =============================================================================
// Redistribution Suggester
// =============================================================================

/**
 * Generate redistribution suggestions for a team
 */
export async function generateRedistributionPlan(
  teamId: string,
  options: {
    constraints?: RedistributionConstraints;
    maxSuggestions?: number;
  } = {}
): Promise<RedistributionPlan> {
  const {
    constraints = {},
    maxSuggestions = 20,
  } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Get current load state
  const beforeState = await calculateTeamLoadState(team.users);

  // Generate suggestions
  const suggestions = await generateSuggestions(
    team.users,
    beforeState,
    constraints,
    maxSuggestions
  );

  // Calculate projected after state
  const afterState = projectAfterState(beforeState, suggestions);

  // Calculate summary
  const summary = {
    totalSuggestions: suggestions.length,
    expectedLoadBalancing: calculateBalancingImprovement(beforeState, afterState),
    affectedPeople: new Set([
      ...suggestions.map((s) => s.task.currentAssignee),
      ...suggestions.filter((s) => s.suggestion.targetAssignee).map((s) => s.suggestion.targetAssignee!),
    ]).size,
    criticalActions: suggestions.filter((s) => s.priority === 'critical').length,
  };

  return {
    teamId,
    generatedAt: new Date(),
    summary,
    suggestions,
    beforeState,
    afterState,
  };
}

/**
 * Get suggestions for a specific overloaded person
 */
export async function suggestForPerson(
  personId: string,
  options: {
    teamId?: string;
    targetLoad?: number;
  } = {}
): Promise<RedistributionSuggestion[]> {
  const { targetLoad = 85 } = options;

  // Get person's current tasks (simulated)
  const tasks = await getPersonTasks(personId);
  const currentLoad = tasks.reduce((sum, t) => sum + t.loadContribution, 0);

  if (currentLoad <= targetLoad) {
    return [];
  }

  const loadToReduce = currentLoad - targetLoad;
  const suggestions: RedistributionSuggestion[] = [];

  // Get potential recipients
  const recipients = await getPotentialRecipients(personId, options.teamId);

  // Sort tasks by suitability for reassignment
  const sortedTasks = [...tasks].sort((a, b) => {
    // Lower priority tasks first
    const priorityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    const priorityDiff = priorityOrder[a.priority as keyof typeof priorityOrder] -
                         priorityOrder[b.priority as keyof typeof priorityOrder];
    if (priorityDiff !== 0) return priorityDiff;

    // Later deadlines first
    if (a.deadline && b.deadline) {
      return b.deadline.getTime() - a.deadline.getTime();
    }

    return 0;
  });

  let reducedLoad = 0;
  for (const task of sortedTasks) {
    if (reducedLoad >= loadToReduce) break;

    // Find best recipient
    const bestRecipient = findBestRecipient(task, recipients);

    if (bestRecipient) {
      suggestions.push({
        id: `suggestion-${task.id}`,
        type: 'reassign',
        priority: currentLoad > 120 ? 'critical' : currentLoad > 100 ? 'high' : 'medium',
        task: {
          id: task.id,
          title: task.title,
          currentAssignee: personId,
          currentAssigneeName: 'Current User',
          estimatedHours: task.estimatedHours,
          deadline: task.deadline,
          priority: task.priority,
        },
        suggestion: {
          targetAssignee: bestRecipient.personId,
          targetAssigneeName: bestRecipient.personName,
          reason: `${bestRecipient.personName} has ${100 - bestRecipient.currentLoad}% available capacity`,
        },
        impact: {
          sourceLoadReduction: task.loadContribution,
          targetLoadIncrease: task.loadContribution,
          riskMitigation: 'Reduces burnout risk for overloaded team member',
        },
        confidence: bestRecipient.matchScore,
        constraints: [],
      });

      reducedLoad += task.loadContribution;
    } else if (task.deadline && daysBetween(new Date(), task.deadline) > 14) {
      // Suggest deferring if no suitable recipient
      suggestions.push({
        id: `suggestion-defer-${task.id}`,
        type: 'defer',
        priority: 'low',
        task: {
          id: task.id,
          title: task.title,
          currentAssignee: personId,
          currentAssigneeName: 'Current User',
          estimatedHours: task.estimatedHours,
          deadline: task.deadline,
          priority: task.priority,
        },
        suggestion: {
          newDeadline: new Date(task.deadline.getTime() + 7 * 24 * 60 * 60 * 1000),
          reason: 'No suitable recipient available; extend deadline to reduce immediate pressure',
        },
        impact: {
          sourceLoadReduction: task.loadContribution * 0.5,
          riskMitigation: 'Spreads workload over longer period',
        },
        confidence: 60,
        constraints: ['Requires stakeholder approval'],
      });
    }
  }

  return suggestions;
}

/**
 * Apply a redistribution suggestion
 */
export async function applySuggestion(
  suggestionId: string,
  _suggestion: RedistributionSuggestion
): Promise<{
  success: boolean;
  message: string;
  updatedTask?: { id: string; assignee: string };
}> {
  // In production, this would update task assignments
  // For now, simulate success

  return {
    success: true,
    message: 'Task reassigned successfully',
    updatedTask: {
      id: suggestionId.replace('suggestion-', ''),
      assignee: 'new-assignee',
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

async function calculateTeamLoadState(
  users: Array<{ id: string; name: string | null; email: string }>
): Promise<TeamLoadState> {
  const members = await Promise.all(
    users.map(async (user) => {
      const tasks = await getPersonTasks(user.id);
      const currentLoad = tasks.reduce((sum, t) => sum + t.loadContribution, 0);

      return {
        personId: user.id,
        personName: user.name || user.email,
        currentLoad: Math.round(currentLoad),
        taskCount: tasks.length,
      };
    })
  );

  const loads = members.map((m) => m.currentLoad);
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const variance = loads.reduce((sum, l) => sum + Math.pow(l - avgLoad, 2), 0) / loads.length;
  const loadVariance = Math.sqrt(variance);

  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);

  // Balance score: 100 = perfectly balanced, 0 = very unbalanced
  const balanceScore = Math.max(0, 100 - loadVariance);

  return {
    members,
    loadVariance: Math.round(loadVariance),
    maxLoad,
    minLoad,
    balanceScore: Math.round(balanceScore),
  };
}

interface TaskInfo {
  id: string;
  title: string;
  estimatedHours: number;
  loadContribution: number;
  priority: string;
  deadline?: Date;
  skills: string[];
}

async function getPersonTasks(_personId: string): Promise<TaskInfo[]> {
  // In production, query actual tasks
  const numTasks = 5 + Math.floor(Math.random() * 10);
  const tasks: TaskInfo[] = [];

  for (let i = 0; i < numTasks; i++) {
    const estimatedHours = 2 + Math.floor(Math.random() * 16);
    tasks.push({
      id: `task-${_personId}-${i}`,
      title: `Task ${i + 1}`,
      estimatedHours,
      loadContribution: (estimatedHours / 40) * 100,
      priority: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
      deadline: Math.random() > 0.3
        ? new Date(Date.now() + Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
        : undefined,
      skills: ['JavaScript', 'React', 'Node.js'].slice(0, 1 + Math.floor(Math.random() * 3)),
    });
  }

  return tasks;
}

interface RecipientCandidate {
  personId: string;
  personName: string;
  currentLoad: number;
  availableCapacity: number;
  skills: string[];
  matchScore: number;
}

async function getPotentialRecipients(
  excludePersonId: string,
  teamId?: string
): Promise<RecipientCandidate[]> {
  // In production, query team members
  const candidates: RecipientCandidate[] = [];

  for (let i = 0; i < 5; i++) {
    const personId = `person-${i}`;
    if (personId === excludePersonId) continue;

    const currentLoad = 50 + Math.floor(Math.random() * 40);
    candidates.push({
      personId,
      personName: `Team Member ${i + 1}`,
      currentLoad,
      availableCapacity: 100 - currentLoad,
      skills: ['JavaScript', 'React', 'Node.js', 'TypeScript'].slice(0, 2 + Math.floor(Math.random() * 3)),
      matchScore: 60 + Math.floor(Math.random() * 30),
    });
  }

  return candidates.filter((c) => c.availableCapacity > 10);
}

function findBestRecipient(
  task: TaskInfo,
  recipients: RecipientCandidate[]
): RecipientCandidate | null {
  // Filter recipients who have capacity
  const eligible = recipients.filter(
    (r) => r.availableCapacity >= task.loadContribution
  );

  if (eligible.length === 0) return null;

  // Score recipients
  const scored = eligible.map((r) => {
    let score = r.matchScore;

    // Bonus for skill match
    const skillMatch = task.skills.filter((s) => r.skills.includes(s)).length;
    score += skillMatch * 10;

    // Bonus for more available capacity
    score += r.availableCapacity * 0.2;

    return { ...r, score };
  });

  // Return best match
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

async function generateSuggestions(
  users: Array<{ id: string; name: string | null; email: string }>,
  currentState: TeamLoadState,
  _constraints: RedistributionConstraints,
  maxSuggestions: number
): Promise<RedistributionSuggestion[]> {
  const suggestions: RedistributionSuggestion[] = [];

  // Focus on overloaded members
  const overloaded = currentState.members.filter((m) => m.currentLoad > 90);
  const underloaded = currentState.members.filter((m) => m.currentLoad < 70);

  for (const member of overloaded) {
    if (suggestions.length >= maxSuggestions) break;

    const memberSuggestions = await suggestForPerson(member.personId, {
      targetLoad: 85,
    });

    suggestions.push(...memberSuggestions.slice(0, 3));
  }

  return suggestions.slice(0, maxSuggestions);
}

function projectAfterState(
  beforeState: TeamLoadState,
  suggestions: RedistributionSuggestion[]
): TeamLoadState {
  const memberChanges = new Map<string, number>();

  for (const suggestion of suggestions) {
    if (suggestion.type === 'reassign' && suggestion.suggestion.targetAssignee) {
      // Reduce source load
      const currentChange = memberChanges.get(suggestion.task.currentAssignee) || 0;
      memberChanges.set(
        suggestion.task.currentAssignee,
        currentChange - suggestion.impact.sourceLoadReduction
      );

      // Increase target load
      const targetChange = memberChanges.get(suggestion.suggestion.targetAssignee) || 0;
      memberChanges.set(
        suggestion.suggestion.targetAssignee,
        targetChange + (suggestion.impact.targetLoadIncrease || 0)
      );
    } else if (suggestion.type === 'defer') {
      const currentChange = memberChanges.get(suggestion.task.currentAssignee) || 0;
      memberChanges.set(
        suggestion.task.currentAssignee,
        currentChange - suggestion.impact.sourceLoadReduction
      );
    }
  }

  const projectedMembers = beforeState.members.map((m) => ({
    ...m,
    currentLoad: Math.max(0, m.currentLoad + (memberChanges.get(m.personId) || 0)),
  }));

  const loads = projectedMembers.map((m) => m.currentLoad);
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const variance = loads.reduce((sum, l) => sum + Math.pow(l - avgLoad, 2), 0) / loads.length;

  return {
    members: projectedMembers,
    loadVariance: Math.round(Math.sqrt(variance)),
    maxLoad: Math.max(...loads),
    minLoad: Math.min(...loads),
    balanceScore: Math.round(Math.max(0, 100 - Math.sqrt(variance))),
  };
}

function calculateBalancingImprovement(before: TeamLoadState, after: TeamLoadState): number {
  if (before.balanceScore >= 100) return 0;
  const improvement = after.balanceScore - before.balanceScore;
  return Math.round((improvement / (100 - before.balanceScore)) * 100);
}

function daysBetween(date1: Date, date2: Date): number {
  return Math.ceil((date2.getTime() - date1.getTime()) / (24 * 60 * 60 * 1000));
}

// =============================================================================
// Exports
// =============================================================================

export default {
  generateRedistributionPlan,
  suggestForPerson,
  applySuggestion,
};
