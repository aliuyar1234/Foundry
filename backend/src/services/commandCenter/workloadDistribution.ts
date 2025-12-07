/**
 * Workload Distribution Metrics
 * T097 - Implement workload distribution metrics
 *
 * Analyzes and reports on workload distribution across teams and individuals
 */

import { prisma } from '../../lib/prisma';
import * as expertiseGraph from '../operate/expertiseGraph';
import * as timescaleClient from '../operate/timescaleClient';

export interface WorkloadDistributionReport {
  organizationId: string;
  timestamp: Date;
  summary: WorkloadSummary;
  byDepartment: DepartmentWorkload[];
  byIndividual: IndividualWorkload[];
  imbalances: WorkloadImbalance[];
  recommendations: WorkloadRecommendation[];
}

export interface WorkloadSummary {
  totalCapacity: number; // Total available work hours
  totalAssigned: number; // Total assigned work hours
  utilizationRate: number; // Percentage
  overloadedCount: number;
  underutilizedCount: number;
  optimalCount: number;
  avgWorkloadScore: number;
}

export interface DepartmentWorkload {
  departmentId: string;
  departmentName: string;
  headcount: number;
  totalCapacity: number;
  totalAssigned: number;
  utilizationRate: number;
  avgWorkloadScore: number;
  overloadedCount: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface IndividualWorkload {
  userId: string;
  userName: string;
  department: string;
  role: string;
  workloadScore: number; // 0-1
  assignedTasks: number;
  pendingApprovals: number;
  overdueItems: number;
  capacityHours: number;
  assignedHours: number;
  status: 'underutilized' | 'optimal' | 'high' | 'overloaded' | 'burnout_risk';
  riskFactors: string[];
}

export interface WorkloadImbalance {
  type: 'department' | 'individual' | 'skill';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affected: string[];
  impact: string;
}

export interface WorkloadRecommendation {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type: 'redistribute' | 'hire' | 'train' | 'postpone' | 'escalate';
  description: string;
  affectedUsers?: string[];
  expectedImpact: string;
}

const WORKLOAD_THRESHOLDS = {
  underutilized: 0.3,
  optimal_low: 0.5,
  optimal_high: 0.75,
  high: 0.85,
  overloaded: 0.95,
};

/**
 * Get comprehensive workload distribution report
 */
export async function getWorkloadDistribution(
  organizationId: string,
  options: {
    departmentId?: string;
    timeRange?: 'day' | 'week' | 'month';
  } = {}
): Promise<WorkloadDistributionReport> {
  const { departmentId, timeRange = 'week' } = options;

  // Get all users with workload data
  const users = await getUsersWithWorkload(organizationId, departmentId);

  // Calculate summary
  const summary = calculateSummary(users);

  // Group by department
  const byDepartment = await calculateDepartmentWorkloads(organizationId, users);

  // Individual workloads (top overloaded and underutilized)
  const byIndividual = users
    .sort((a, b) => b.workloadScore - a.workloadScore)
    .slice(0, 20);

  // Detect imbalances
  const imbalances = detectImbalances(summary, byDepartment, byIndividual);

  // Generate recommendations
  const recommendations = generateRecommendations(imbalances, byDepartment, byIndividual);

  return {
    organizationId,
    timestamp: new Date(),
    summary,
    byDepartment,
    byIndividual,
    imbalances,
    recommendations,
  };
}

/**
 * Get users with workload data
 */
async function getUsersWithWorkload(
  organizationId: string,
  departmentId?: string
): Promise<IndividualWorkload[]> {
  // Get users from Prisma
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(departmentId && { department: departmentId }),
    },
    include: {
      expertiseProfiles: {
        select: {
          workloadScore: true,
          capacityHours: true,
        },
      },
    },
  });

  // Get task counts for each user
  const userWorkloads: IndividualWorkload[] = await Promise.all(
    users.map(async user => {
      const [assignedTasks, pendingApprovals, overdueItems] = await Promise.all([
        prisma.task.count({
          where: {
            assigneeId: user.id,
            status: { notIn: ['completed', 'cancelled'] },
          },
        }),
        prisma.routingDecision.count({
          where: {
            handlerId: user.id,
            status: 'pending',
          },
        }),
        prisma.task.count({
          where: {
            assigneeId: user.id,
            status: { notIn: ['completed', 'cancelled'] },
            dueDate: { lt: new Date() },
          },
        }),
      ]);

      const profile = user.expertiseProfiles[0];
      const workloadScore = profile?.workloadScore || calculateEstimatedWorkload(assignedTasks, pendingApprovals);
      const capacityHours = profile?.capacityHours || 40;
      const assignedHours = estimateAssignedHours(assignedTasks, pendingApprovals);

      const status = getWorkloadStatus(workloadScore);
      const riskFactors = getRiskFactors(workloadScore, overdueItems, assignedTasks, pendingApprovals);

      return {
        userId: user.id,
        userName: user.name || user.email,
        department: user.department || 'Unassigned',
        role: user.role || 'Employee',
        workloadScore,
        assignedTasks,
        pendingApprovals,
        overdueItems,
        capacityHours,
        assignedHours,
        status,
        riskFactors,
      };
    })
  );

  return userWorkloads;
}

/**
 * Calculate estimated workload score from task counts
 */
function calculateEstimatedWorkload(assignedTasks: number, pendingApprovals: number): number {
  // Simple heuristic: each task = 0.05, each approval = 0.02, max 1.0
  const score = assignedTasks * 0.05 + pendingApprovals * 0.02;
  return Math.min(1, score);
}

/**
 * Estimate assigned hours from task counts
 */
function estimateAssignedHours(assignedTasks: number, pendingApprovals: number): number {
  // Assume average task = 4 hours, approval = 0.5 hours
  return assignedTasks * 4 + pendingApprovals * 0.5;
}

/**
 * Get workload status from score
 */
function getWorkloadStatus(score: number): IndividualWorkload['status'] {
  if (score >= WORKLOAD_THRESHOLDS.overloaded) return 'burnout_risk';
  if (score >= WORKLOAD_THRESHOLDS.high) return 'overloaded';
  if (score >= WORKLOAD_THRESHOLDS.optimal_high) return 'high';
  if (score >= WORKLOAD_THRESHOLDS.optimal_low) return 'optimal';
  return 'underutilized';
}

/**
 * Get risk factors for an individual
 */
function getRiskFactors(
  workloadScore: number,
  overdueItems: number,
  assignedTasks: number,
  pendingApprovals: number
): string[] {
  const factors: string[] = [];

  if (workloadScore >= 0.9) factors.push('Critical workload level');
  if (overdueItems > 5) factors.push(`${overdueItems} overdue items`);
  if (assignedTasks > 20) factors.push('High task count');
  if (pendingApprovals > 15) factors.push('Approval backlog');
  if (workloadScore < 0.2 && assignedTasks < 3) factors.push('Underutilized capacity');

  return factors;
}

/**
 * Calculate summary statistics
 */
function calculateSummary(users: IndividualWorkload[]): WorkloadSummary {
  if (users.length === 0) {
    return {
      totalCapacity: 0,
      totalAssigned: 0,
      utilizationRate: 0,
      overloadedCount: 0,
      underutilizedCount: 0,
      optimalCount: 0,
      avgWorkloadScore: 0,
    };
  }

  const totalCapacity = users.reduce((sum, u) => sum + u.capacityHours, 0);
  const totalAssigned = users.reduce((sum, u) => sum + u.assignedHours, 0);
  const utilizationRate = totalCapacity > 0 ? (totalAssigned / totalCapacity) * 100 : 0;

  const overloadedCount = users.filter(u =>
    u.status === 'overloaded' || u.status === 'burnout_risk'
  ).length;
  const underutilizedCount = users.filter(u => u.status === 'underutilized').length;
  const optimalCount = users.filter(u => u.status === 'optimal').length;

  const avgWorkloadScore = users.reduce((sum, u) => sum + u.workloadScore, 0) / users.length;

  return {
    totalCapacity,
    totalAssigned,
    utilizationRate,
    overloadedCount,
    underutilizedCount,
    optimalCount,
    avgWorkloadScore,
  };
}

/**
 * Calculate department-level workloads
 */
async function calculateDepartmentWorkloads(
  organizationId: string,
  users: IndividualWorkload[]
): Promise<DepartmentWorkload[]> {
  // Group users by department
  const deptMap = new Map<string, IndividualWorkload[]>();
  for (const user of users) {
    const dept = user.department;
    const existing = deptMap.get(dept) || [];
    existing.push(user);
    deptMap.set(dept, existing);
  }

  // Calculate metrics for each department
  const departments: DepartmentWorkload[] = [];
  for (const [deptName, deptUsers] of deptMap) {
    const headcount = deptUsers.length;
    const totalCapacity = deptUsers.reduce((sum, u) => sum + u.capacityHours, 0);
    const totalAssigned = deptUsers.reduce((sum, u) => sum + u.assignedHours, 0);
    const utilizationRate = totalCapacity > 0 ? (totalAssigned / totalCapacity) * 100 : 0;
    const avgWorkloadScore = deptUsers.reduce((sum, u) => sum + u.workloadScore, 0) / headcount;
    const overloadedCount = deptUsers.filter(u =>
      u.status === 'overloaded' || u.status === 'burnout_risk'
    ).length;

    // Calculate trend (would normally compare to historical data)
    const trend = avgWorkloadScore > 0.75 ? 'increasing' : avgWorkloadScore < 0.4 ? 'decreasing' : 'stable';

    departments.push({
      departmentId: deptName.toLowerCase().replace(/\s+/g, '-'),
      departmentName: deptName,
      headcount,
      totalCapacity,
      totalAssigned,
      utilizationRate,
      avgWorkloadScore,
      overloadedCount,
      trend: trend as 'increasing' | 'stable' | 'decreasing',
    });
  }

  return departments.sort((a, b) => b.avgWorkloadScore - a.avgWorkloadScore);
}

/**
 * Detect workload imbalances
 */
function detectImbalances(
  summary: WorkloadSummary,
  departments: DepartmentWorkload[],
  individuals: IndividualWorkload[]
): WorkloadImbalance[] {
  const imbalances: WorkloadImbalance[] = [];

  // Check for organization-wide overload
  if (summary.overloadedCount > summary.optimalCount) {
    imbalances.push({
      type: 'individual',
      severity: 'high',
      description: 'More overloaded staff than optimal capacity staff',
      affected: individuals
        .filter(i => i.status === 'overloaded' || i.status === 'burnout_risk')
        .map(i => i.userName),
      impact: 'Risk of burnout, quality issues, and delayed deliveries',
    });
  }

  // Check for department imbalances
  const maxDeptWorkload = Math.max(...departments.map(d => d.avgWorkloadScore));
  const minDeptWorkload = Math.min(...departments.map(d => d.avgWorkloadScore));

  if (maxDeptWorkload - minDeptWorkload > 0.3) {
    const overworked = departments.filter(d => d.avgWorkloadScore > 0.7);
    const underworked = departments.filter(d => d.avgWorkloadScore < 0.4);

    imbalances.push({
      type: 'department',
      severity: 'medium',
      description: 'Significant workload imbalance between departments',
      affected: [...overworked.map(d => d.departmentName), ...underworked.map(d => d.departmentName)],
      impact: 'Inefficient resource utilization and potential bottlenecks',
    });
  }

  // Check for individual burnout risks
  const burnoutRisks = individuals.filter(i => i.status === 'burnout_risk');
  if (burnoutRisks.length > 0) {
    imbalances.push({
      type: 'individual',
      severity: 'critical',
      description: `${burnoutRisks.length} staff members at burnout risk`,
      affected: burnoutRisks.map(i => i.userName),
      impact: 'Immediate intervention required to prevent burnout',
    });
  }

  // Check for underutilization
  const underutilized = individuals.filter(i => i.status === 'underutilized');
  if (underutilized.length > individuals.length * 0.2) {
    imbalances.push({
      type: 'individual',
      severity: 'low',
      description: `${underutilized.length} staff members are underutilized`,
      affected: underutilized.map(i => i.userName),
      impact: 'Potential for better resource allocation',
    });
  }

  return imbalances.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Generate workload recommendations
 */
function generateRecommendations(
  imbalances: WorkloadImbalance[],
  departments: DepartmentWorkload[],
  individuals: IndividualWorkload[]
): WorkloadRecommendation[] {
  const recommendations: WorkloadRecommendation[] = [];

  // Address critical imbalances first
  const criticalImbalances = imbalances.filter(i => i.severity === 'critical');
  for (const imbalance of criticalImbalances) {
    if (imbalance.type === 'individual' && imbalance.description.includes('burnout')) {
      recommendations.push({
        priority: 'urgent',
        type: 'redistribute',
        description: 'Immediately redistribute workload from staff at burnout risk',
        affectedUsers: imbalance.affected,
        expectedImpact: 'Reduce burnout risk and maintain team health',
      });
    }
  }

  // Department-level recommendations
  const overloadedDepts = departments.filter(d => d.avgWorkloadScore > 0.8);
  for (const dept of overloadedDepts) {
    recommendations.push({
      priority: 'high',
      type: 'redistribute',
      description: `Redistribute workload from ${dept.departmentName} department`,
      expectedImpact: `Reduce average workload from ${(dept.avgWorkloadScore * 100).toFixed(0)}% to optimal levels`,
    });
  }

  // Check if hiring is needed
  const severelyOverloaded = individuals.filter(i => i.workloadScore > 0.9).length;
  if (severelyOverloaded > individuals.length * 0.3) {
    recommendations.push({
      priority: 'high',
      type: 'hire',
      description: 'Consider hiring additional staff - sustained high workload across team',
      expectedImpact: 'Long-term workload balance and capacity increase',
    });
  }

  // Training recommendations for skill gaps
  const underutilized = individuals.filter(i => i.status === 'underutilized');
  if (underutilized.length > 0 && overloadedDepts.length > 0) {
    recommendations.push({
      priority: 'medium',
      type: 'train',
      description: 'Cross-train underutilized staff to help with overloaded departments',
      affectedUsers: underutilized.slice(0, 5).map(u => u.userName),
      expectedImpact: 'Better workload distribution and skill development',
    });
  }

  return recommendations;
}

/**
 * Get workload trend for a specific user
 */
export async function getUserWorkloadTrend(
  userId: string,
  organizationId: string,
  days: number = 30
): Promise<{ date: string; workloadScore: number }[]> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const metrics = await timescaleClient.queryWorkloadMetrics({
      organizationId,
      userId,
      startTime,
      endTime,
    });

    return metrics.map(m => ({
      date: new Date(m.bucket).toISOString().split('T')[0],
      workloadScore: m.avg_workload || 0,
    }));
  } catch {
    return [];
  }
}

export default {
  getWorkloadDistribution,
  getUserWorkloadTrend,
};
