/**
 * Capacity Planner Service
 * T207 - Plan and manage team capacity
 *
 * Helps teams plan capacity and identify resource constraints
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface CapacityPlan {
  teamId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  summary: {
    totalCapacityHours: number;
    allocatedHours: number;
    availableHours: number;
    utilizationPercent: number;
    headcount: number;
  };
  members: MemberCapacity[];
  allocations: CapacityAllocation[];
  constraints: CapacityConstraint[];
  recommendations: CapacityRecommendation[];
}

export interface MemberCapacity {
  personId: string;
  personName: string;
  role: string;
  baseCapacityHours: number;
  adjustments: CapacityAdjustment[];
  effectiveCapacity: number;
  allocated: number;
  available: number;
  utilizationPercent: number;
  skills: string[];
}

export interface CapacityAdjustment {
  type: 'pto' | 'holiday' | 'training' | 'meetings' | 'admin' | 'other';
  hours: number;
  description: string;
  dates?: { start: Date; end: Date };
}

export interface CapacityAllocation {
  id: string;
  projectId: string;
  projectName: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  requiredHours: number;
  allocatedHours: number;
  assignedMembers: Array<{
    personId: string;
    hours: number;
    role: string;
  }>;
  status: 'fully_allocated' | 'partially_allocated' | 'unallocated' | 'over_allocated';
  gap: number;
  skills: string[];
}

export interface CapacityConstraint {
  type: 'skill_shortage' | 'capacity_shortage' | 'single_point_failure' | 'deadline_conflict';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedProjects: string[];
  affectedMembers: string[];
  suggestedResolution: string;
}

export interface CapacityRecommendation {
  type: 'hire' | 'train' | 'redistribute' | 'defer' | 'outsource';
  priority: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  effort: 'high' | 'medium' | 'low';
}

export interface CapacityScenario {
  name: string;
  description: string;
  changes: Array<{
    type: 'add_project' | 'remove_project' | 'add_member' | 'remove_member' | 'adjust_allocation';
    details: Record<string, unknown>;
  }>;
  impact: {
    utilizationChange: number;
    constraintsAdded: number;
    constraintsResolved: number;
    feasible: boolean;
  };
}

// =============================================================================
// Capacity Planner
// =============================================================================

const prisma = new PrismaClient();

/**
 * Create capacity plan for a team
 */
export async function createCapacityPlan(
  teamId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    includeProjects?: boolean;
  } = {}
): Promise<CapacityPlan> {
  const {
    startDate = new Date(),
    endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    includeProjects = true,
  } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Calculate member capacities
  const members = await Promise.all(
    team.users.map((user) => calculateMemberCapacity(user.id, user.name || user.email, startDate, endDate))
  );

  // Get project allocations
  const allocations = includeProjects
    ? await getProjectAllocations(teamId, startDate, endDate, members)
    : [];

  // Calculate summary
  const totalCapacityHours = members.reduce((sum, m) => sum + m.effectiveCapacity, 0);
  const allocatedHours = members.reduce((sum, m) => sum + m.allocated, 0);
  const availableHours = totalCapacityHours - allocatedHours;
  const utilizationPercent = totalCapacityHours > 0 ? (allocatedHours / totalCapacityHours) * 100 : 0;

  // Identify constraints
  const constraints = identifyConstraints(members, allocations);

  // Generate recommendations
  const recommendations = generateCapacityRecommendations(
    members,
    allocations,
    constraints,
    utilizationPercent
  );

  return {
    teamId,
    period: { startDate, endDate },
    summary: {
      totalCapacityHours: Math.round(totalCapacityHours),
      allocatedHours: Math.round(allocatedHours),
      availableHours: Math.round(availableHours),
      utilizationPercent: Math.round(utilizationPercent),
      headcount: members.length,
    },
    members,
    allocations,
    constraints,
    recommendations,
  };
}

/**
 * Calculate capacity for a single member
 */
async function calculateMemberCapacity(
  personId: string,
  personName: string,
  startDate: Date,
  endDate: Date
): Promise<MemberCapacity> {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const weeks = days / 7;

  // Base capacity (40 hours/week)
  const baseCapacityHours = weeks * 40;

  // Get adjustments (simulated - in production, integrate with calendars/HR systems)
  const adjustments = await getCapacityAdjustments(personId, startDate, endDate);

  const adjustmentTotal = adjustments.reduce((sum, adj) => sum + adj.hours, 0);
  const effectiveCapacity = Math.max(0, baseCapacityHours - adjustmentTotal);

  // Get current allocations (simulated)
  const allocated = effectiveCapacity * (0.5 + Math.random() * 0.4);

  // Get skills (simulated)
  const skills = getPersonSkills(personId);

  return {
    personId,
    personName,
    role: getPersonRole(personId),
    baseCapacityHours: Math.round(baseCapacityHours),
    adjustments,
    effectiveCapacity: Math.round(effectiveCapacity),
    allocated: Math.round(allocated),
    available: Math.round(effectiveCapacity - allocated),
    utilizationPercent: Math.round((allocated / effectiveCapacity) * 100),
    skills,
  };
}

async function getCapacityAdjustments(
  _personId: string,
  startDate: Date,
  endDate: Date
): Promise<CapacityAdjustment[]> {
  const adjustments: CapacityAdjustment[] = [];
  const weeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

  // Meetings (8 hours/week typical)
  adjustments.push({
    type: 'meetings',
    hours: weeks * (6 + Math.random() * 4),
    description: 'Regular meetings and syncs',
  });

  // Admin (4 hours/week typical)
  adjustments.push({
    type: 'admin',
    hours: weeks * (3 + Math.random() * 2),
    description: 'Administrative tasks and communication',
  });

  // Random PTO
  if (Math.random() > 0.7) {
    adjustments.push({
      type: 'pto',
      hours: 8 + Math.floor(Math.random() * 16),
      description: 'Planned time off',
    });
  }

  return adjustments;
}

function getPersonSkills(_personId: string): string[] {
  const allSkills = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python',
    'SQL', 'DevOps', 'Testing', 'Architecture', 'UI/UX'
  ];
  const numSkills = 3 + Math.floor(Math.random() * 4);
  return allSkills.sort(() => Math.random() - 0.5).slice(0, numSkills);
}

function getPersonRole(_personId: string): string {
  const roles = ['Developer', 'Senior Developer', 'Tech Lead', 'Designer', 'QA Engineer'];
  return roles[Math.floor(Math.random() * roles.length)];
}

async function getProjectAllocations(
  _teamId: string,
  _startDate: Date,
  _endDate: Date,
  members: MemberCapacity[]
): Promise<CapacityAllocation[]> {
  // Simulated project allocations
  const projects = [
    { id: 'proj-1', name: 'Feature A', priority: 'high' as const, hours: 200, skills: ['React', 'TypeScript'] },
    { id: 'proj-2', name: 'Bug Fixes', priority: 'medium' as const, hours: 80, skills: ['JavaScript'] },
    { id: 'proj-3', name: 'Infrastructure', priority: 'high' as const, hours: 120, skills: ['DevOps', 'Node.js'] },
    { id: 'proj-4', name: 'Feature B', priority: 'critical' as const, hours: 300, skills: ['React', 'Node.js'] },
  ];

  return projects.map((project) => {
    const eligibleMembers = members.filter((m) =>
      project.skills.some((skill) => m.skills.includes(skill))
    );

    const assignedMembers = eligibleMembers.slice(0, 3).map((m) => ({
      personId: m.personId,
      hours: Math.floor(project.hours / 3),
      role: m.role,
    }));

    const allocatedHours = assignedMembers.reduce((sum, am) => sum + am.hours, 0);
    const gap = project.hours - allocatedHours;

    let status: CapacityAllocation['status'];
    if (gap <= 0) status = 'fully_allocated';
    else if (allocatedHours === 0) status = 'unallocated';
    else if (allocatedHours < project.hours * 0.8) status = 'partially_allocated';
    else status = 'fully_allocated';

    return {
      id: project.id,
      projectId: project.id,
      projectName: project.name,
      priority: project.priority,
      requiredHours: project.hours,
      allocatedHours,
      assignedMembers,
      status,
      gap: Math.max(0, gap),
      skills: project.skills,
    };
  });
}

function identifyConstraints(
  members: MemberCapacity[],
  allocations: CapacityAllocation[]
): CapacityConstraint[] {
  const constraints: CapacityConstraint[] = [];

  // Check for overutilized members
  const overutilized = members.filter((m) => m.utilizationPercent > 100);
  if (overutilized.length > 0) {
    constraints.push({
      type: 'capacity_shortage',
      severity: overutilized.some((m) => m.utilizationPercent > 120) ? 'critical' : 'high',
      description: `${overutilized.length} team member(s) are over-allocated`,
      affectedProjects: [],
      affectedMembers: overutilized.map((m) => m.personId),
      suggestedResolution: 'Redistribute work or extend timelines',
    });
  }

  // Check for skill shortages
  const unallocated = allocations.filter((a) => a.status === 'partially_allocated' || a.status === 'unallocated');
  for (const allocation of unallocated) {
    const missingSkills = allocation.skills.filter((skill) =>
      !members.some((m) => m.skills.includes(skill) && m.available > 0)
    );

    if (missingSkills.length > 0) {
      constraints.push({
        type: 'skill_shortage',
        severity: allocation.priority === 'critical' ? 'critical' : 'high',
        description: `Missing skills for ${allocation.projectName}: ${missingSkills.join(', ')}`,
        affectedProjects: [allocation.projectId],
        affectedMembers: [],
        suggestedResolution: 'Train existing members or hire for these skills',
      });
    }
  }

  // Check for single point of failure
  const skillCounts = new Map<string, number>();
  for (const member of members) {
    for (const skill of member.skills) {
      skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
    }
  }

  const criticalSkills = allocations
    .filter((a) => a.priority === 'critical' || a.priority === 'high')
    .flatMap((a) => a.skills);

  for (const skill of new Set(criticalSkills)) {
    if (skillCounts.get(skill) === 1) {
      constraints.push({
        type: 'single_point_failure',
        severity: 'medium',
        description: `Only one team member has ${skill} skill`,
        affectedProjects: allocations.filter((a) => a.skills.includes(skill)).map((a) => a.projectId),
        affectedMembers: members.filter((m) => m.skills.includes(skill)).map((m) => m.personId),
        suggestedResolution: 'Cross-train another team member on this skill',
      });
    }
  }

  return constraints;
}

function generateCapacityRecommendations(
  members: MemberCapacity[],
  allocations: CapacityAllocation[],
  constraints: CapacityConstraint[],
  utilizationPercent: number
): CapacityRecommendation[] {
  const recommendations: CapacityRecommendation[] = [];

  // High utilization - consider hiring
  if (utilizationPercent > 90) {
    recommendations.push({
      type: 'hire',
      priority: 'high',
      description: 'Team utilization is very high, consider hiring additional resources',
      impact: 'Increase capacity by 25-40 hours/week per new hire',
      effort: 'high',
    });
  }

  // Skill shortage - training recommendation
  const skillShortages = constraints.filter((c) => c.type === 'skill_shortage');
  if (skillShortages.length > 0) {
    recommendations.push({
      type: 'train',
      priority: 'medium',
      description: 'Invest in training to address skill gaps',
      impact: 'More flexibility in task assignment',
      effort: 'medium',
    });
  }

  // Uneven distribution - redistribution
  const loadVariance = calculateLoadVariance(members);
  if (loadVariance > 20) {
    recommendations.push({
      type: 'redistribute',
      priority: 'medium',
      description: 'Redistribute work more evenly across team members',
      impact: 'Reduced burnout risk for overloaded members',
      effort: 'low',
    });
  }

  // Low priority unallocated - defer
  const lowPriorityUnallocated = allocations.filter(
    (a) => a.priority === 'low' && a.status !== 'fully_allocated'
  );
  if (lowPriorityUnallocated.length > 0) {
    recommendations.push({
      type: 'defer',
      priority: 'low',
      description: 'Consider deferring low-priority projects to free up capacity',
      impact: `Free up ${lowPriorityUnallocated.reduce((sum, a) => sum + a.requiredHours, 0)} hours`,
      effort: 'low',
    });
  }

  return recommendations;
}

function calculateLoadVariance(members: MemberCapacity[]): number {
  if (members.length <= 1) return 0;

  const loads = members.map((m) => m.utilizationPercent);
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const variance = loads.reduce((sum, load) => sum + Math.pow(load - avgLoad, 2), 0) / loads.length;

  return Math.sqrt(variance);
}

/**
 * Run what-if scenario analysis
 */
export async function analyzeScenario(
  teamId: string,
  scenario: Omit<CapacityScenario, 'impact'>
): Promise<CapacityScenario> {
  const currentPlan = await createCapacityPlan(teamId);

  // Apply scenario changes (simplified)
  let utilizationChange = 0;
  let constraintsAdded = 0;
  let constraintsResolved = 0;

  for (const change of scenario.changes) {
    switch (change.type) {
      case 'add_project':
        utilizationChange += 10;
        constraintsAdded += Math.random() > 0.5 ? 1 : 0;
        break;
      case 'remove_project':
        utilizationChange -= 10;
        constraintsResolved += Math.random() > 0.5 ? 1 : 0;
        break;
      case 'add_member':
        utilizationChange -= 15;
        constraintsResolved += 1;
        break;
      case 'remove_member':
        utilizationChange += 15;
        constraintsAdded += 1;
        break;
    }
  }

  const newUtilization = currentPlan.summary.utilizationPercent + utilizationChange;
  const feasible = newUtilization >= 0 && newUtilization <= 100;

  return {
    ...scenario,
    impact: {
      utilizationChange,
      constraintsAdded,
      constraintsResolved,
      feasible,
    },
  };
}

/**
 * Get capacity forecast for future periods
 */
export async function getCapacityForecast(
  teamId: string,
  options: {
    periods?: number; // number of weeks to forecast
  } = {}
): Promise<Array<{
  periodStart: Date;
  periodEnd: Date;
  capacity: number;
  projected: number;
  available: number;
}>> {
  const { periods = 8 } = options;
  const forecast: Array<{
    periodStart: Date;
    periodEnd: Date;
    capacity: number;
    projected: number;
    available: number;
  }> = [];

  const baseDate = new Date();

  for (let i = 0; i < periods; i++) {
    const periodStart = new Date(baseDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const plan = await createCapacityPlan(teamId, {
      startDate: periodStart,
      endDate: periodEnd,
      includeProjects: true,
    });

    forecast.push({
      periodStart,
      periodEnd,
      capacity: plan.summary.totalCapacityHours,
      projected: plan.summary.allocatedHours,
      available: plan.summary.availableHours,
    });
  }

  return forecast;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  createCapacityPlan,
  analyzeScenario,
  getCapacityForecast,
};
