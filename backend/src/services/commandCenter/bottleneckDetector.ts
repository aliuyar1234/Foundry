/**
 * Bottleneck Detector Service
 * T098 - Create bottleneck detector
 *
 * Detects operational bottlenecks across processes, people, and systems
 */

import { prisma } from '../../lib/prisma';
import * as timescaleClient from '../operate/timescaleClient';

export interface Bottleneck {
  id: string;
  type: 'process' | 'person' | 'approval' | 'integration' | 'resource' | 'skill';
  severity: 'low' | 'medium' | 'high' | 'critical';
  name: string;
  description: string;
  location: BottleneckLocation;
  metrics: BottleneckMetrics;
  impact: BottleneckImpact;
  detectedAt: Date;
  status: 'active' | 'acknowledged' | 'resolving' | 'resolved';
  recommendations: string[];
}

export interface BottleneckLocation {
  processId?: string;
  processName?: string;
  stepId?: string;
  stepName?: string;
  userId?: string;
  userName?: string;
  department?: string;
  integrationId?: string;
  integrationName?: string;
}

export interface BottleneckMetrics {
  queueLength: number;
  avgWaitTime: number; // hours
  throughput: number; // per day
  utilizationRate: number; // percentage
  errorRate?: number;
  trend: 'worsening' | 'stable' | 'improving';
}

export interface BottleneckImpact {
  affectedProcesses: number;
  affectedUsers: number;
  estimatedDelay: number; // hours
  costImpact?: number; // estimated cost
  priorityItems: number;
}

export interface BottleneckReport {
  organizationId: string;
  timestamp: Date;
  totalBottlenecks: number;
  criticalCount: number;
  highCount: number;
  bottlenecks: Bottleneck[];
  trends: BottleneckTrend[];
}

export interface BottleneckTrend {
  date: string;
  totalBottlenecks: number;
  criticalBottlenecks: number;
  avgResolutionTime: number; // hours
}

/**
 * Detect all bottlenecks for an organization
 */
export async function detectBottlenecks(
  organizationId: string,
  options: {
    types?: Bottleneck['type'][];
    minSeverity?: Bottleneck['severity'];
  } = {}
): Promise<BottleneckReport> {
  const { types, minSeverity } = options;

  // Run all detection methods in parallel
  const [
    processBottlenecks,
    personBottlenecks,
    approvalBottlenecks,
    resourceBottlenecks,
  ] = await Promise.all([
    detectProcessBottlenecks(organizationId),
    detectPersonBottlenecks(organizationId),
    detectApprovalBottlenecks(organizationId),
    detectResourceBottlenecks(organizationId),
  ]);

  // Combine all bottlenecks
  let allBottlenecks = [
    ...processBottlenecks,
    ...personBottlenecks,
    ...approvalBottlenecks,
    ...resourceBottlenecks,
  ];

  // Filter by types if specified
  if (types && types.length > 0) {
    allBottlenecks = allBottlenecks.filter(b => types.includes(b.type));
  }

  // Filter by minimum severity
  if (minSeverity) {
    const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    const minOrder = severityOrder[minSeverity];
    allBottlenecks = allBottlenecks.filter(b => severityOrder[b.severity] >= minOrder);
  }

  // Sort by severity and impact
  allBottlenecks.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.impact.affectedProcesses - a.impact.affectedProcesses;
  });

  // Get historical trends
  const trends = await getBottleneckTrends(organizationId);

  return {
    organizationId,
    timestamp: new Date(),
    totalBottlenecks: allBottlenecks.length,
    criticalCount: allBottlenecks.filter(b => b.severity === 'critical').length,
    highCount: allBottlenecks.filter(b => b.severity === 'high').length,
    bottlenecks: allBottlenecks,
    trends,
  };
}

/**
 * Detect process-level bottlenecks
 */
async function detectProcessBottlenecks(organizationId: string): Promise<Bottleneck[]> {
  const bottlenecks: Bottleneck[] = [];

  // Find processes with high queue lengths
  const processes = await prisma.process.findMany({
    where: {
      organizationId,
      status: { in: ['active', 'pending'] },
    },
    include: {
      steps: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  for (const process of processes) {
    // Count pending tasks for this process
    const pendingTasks = await prisma.task.count({
      where: {
        processId: process.id,
        status: { in: ['pending', 'in_progress'] },
      },
    });

    // Check if this is a bottleneck
    if (pendingTasks > 10) {
      const severity = getSeverity(pendingTasks, [20, 50, 100]);

      // Calculate average wait time
      const oldestPending = await prisma.task.findFirst({
        where: {
          processId: process.id,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      });

      const avgWaitTime = oldestPending
        ? (Date.now() - new Date(oldestPending.createdAt).getTime()) / (1000 * 60 * 60)
        : 0;

      bottlenecks.push({
        id: `process-${process.id}`,
        type: 'process',
        severity,
        name: process.name,
        description: `Process "${process.name}" has ${pendingTasks} pending tasks`,
        location: {
          processId: process.id,
          processName: process.name,
        },
        metrics: {
          queueLength: pendingTasks,
          avgWaitTime,
          throughput: await getProcessThroughput(process.id),
          utilizationRate: 100, // Fully utilized if bottlenecked
          trend: 'worsening',
        },
        impact: {
          affectedProcesses: 1,
          affectedUsers: await getAffectedUsers(process.id),
          estimatedDelay: avgWaitTime,
          priorityItems: await getPriorityItems(process.id),
        },
        detectedAt: new Date(),
        status: 'active',
        recommendations: getProcessRecommendations(pendingTasks, avgWaitTime),
      });
    }
  }

  return bottlenecks;
}

/**
 * Detect person-level bottlenecks
 */
async function detectPersonBottlenecks(organizationId: string): Promise<Bottleneck[]> {
  const bottlenecks: Bottleneck[] = [];

  // Find users with high task assignments
  const userTaskCounts = await prisma.task.groupBy({
    by: ['assigneeId'],
    where: {
      organizationId,
      status: { in: ['pending', 'in_progress'] },
      assigneeId: { not: null },
    },
    _count: true,
  });

  for (const item of userTaskCounts) {
    if (item._count > 15 && item.assigneeId) {
      const user = await prisma.user.findUnique({
        where: { id: item.assigneeId },
        select: { id: true, name: true, email: true, department: true },
      });

      if (!user) continue;

      const severity = getSeverity(item._count, [25, 40, 60]);

      // Get overdue count
      const overdueCount = await prisma.task.count({
        where: {
          assigneeId: item.assigneeId,
          status: { notIn: ['completed', 'cancelled'] },
          dueDate: { lt: new Date() },
        },
      });

      bottlenecks.push({
        id: `person-${user.id}`,
        type: 'person',
        severity,
        name: user.name || user.email,
        description: `${user.name || user.email} has ${item._count} pending tasks`,
        location: {
          userId: user.id,
          userName: user.name || user.email,
          department: user.department || undefined,
        },
        metrics: {
          queueLength: item._count,
          avgWaitTime: await getAvgWaitTimeForUser(user.id),
          throughput: await getUserThroughput(user.id),
          utilizationRate: Math.min(100, (item._count / 15) * 100),
          trend: overdueCount > 5 ? 'worsening' : 'stable',
        },
        impact: {
          affectedProcesses: await getProcessesAffectedByUser(user.id),
          affectedUsers: 1,
          estimatedDelay: item._count * 2, // Rough estimate: 2 hours per task
          priorityItems: overdueCount,
        },
        detectedAt: new Date(),
        status: 'active',
        recommendations: getPersonRecommendations(item._count, overdueCount),
      });
    }
  }

  return bottlenecks;
}

/**
 * Detect approval bottlenecks
 */
async function detectApprovalBottlenecks(organizationId: string): Promise<Bottleneck[]> {
  const bottlenecks: Bottleneck[] = [];

  // Find handlers with pending approvals backlog
  const approvalCounts = await prisma.routingDecision.groupBy({
    by: ['handlerId'],
    where: {
      organizationId,
      status: 'pending',
      handlerId: { not: null },
    },
    _count: true,
  });

  for (const item of approvalCounts) {
    if (item._count > 10 && item.handlerId) {
      const user = await prisma.user.findUnique({
        where: { id: item.handlerId },
        select: { id: true, name: true, email: true, department: true },
      });

      if (!user) continue;

      const severity = getSeverity(item._count, [20, 35, 50]);

      // Get oldest pending approval
      const oldest = await prisma.routingDecision.findFirst({
        where: {
          handlerId: item.handlerId,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      });

      const avgWaitTime = oldest
        ? (Date.now() - new Date(oldest.createdAt).getTime()) / (1000 * 60 * 60)
        : 0;

      bottlenecks.push({
        id: `approval-${user.id}`,
        type: 'approval',
        severity,
        name: `Approvals: ${user.name || user.email}`,
        description: `${item._count} pending approvals waiting for ${user.name || user.email}`,
        location: {
          userId: user.id,
          userName: user.name || user.email,
          department: user.department || undefined,
        },
        metrics: {
          queueLength: item._count,
          avgWaitTime,
          throughput: await getApprovalThroughput(user.id),
          utilizationRate: Math.min(100, (item._count / 10) * 100),
          trend: avgWaitTime > 48 ? 'worsening' : 'stable',
        },
        impact: {
          affectedProcesses: await getProcessesWaitingApproval(item.handlerId),
          affectedUsers: await getUsersWaitingApproval(item.handlerId),
          estimatedDelay: avgWaitTime,
          priorityItems: await getUrgentApprovals(item.handlerId),
        },
        detectedAt: new Date(),
        status: 'active',
        recommendations: getApprovalRecommendations(item._count, avgWaitTime),
      });
    }
  }

  return bottlenecks;
}

/**
 * Detect resource bottlenecks
 */
async function detectResourceBottlenecks(organizationId: string): Promise<Bottleneck[]> {
  const bottlenecks: Bottleneck[] = [];

  // Check for departments with high overall workload
  const deptTaskCounts = await prisma.task.groupBy({
    by: ['organizationId'],
    where: {
      organizationId,
      status: { in: ['pending', 'in_progress'] },
    },
    _count: true,
  });

  // Get department data from users
  const usersByDept = await prisma.user.groupBy({
    by: ['department'],
    where: {
      organizationId,
      isActive: true,
    },
    _count: true,
  });

  for (const dept of usersByDept) {
    if (!dept.department) continue;

    const deptUsers = await prisma.user.findMany({
      where: {
        organizationId,
        department: dept.department,
        isActive: true,
      },
      select: { id: true },
    });

    const userIds = deptUsers.map(u => u.id);

    const pendingTasks = await prisma.task.count({
      where: {
        organizationId,
        assigneeId: { in: userIds },
        status: { in: ['pending', 'in_progress'] },
      },
    });

    const tasksPerPerson = pendingTasks / dept._count;

    if (tasksPerPerson > 12) {
      const severity = getSeverity(tasksPerPerson, [18, 25, 35]);

      bottlenecks.push({
        id: `resource-${dept.department}`,
        type: 'resource',
        severity,
        name: dept.department,
        description: `${dept.department} department is overloaded (${tasksPerPerson.toFixed(1)} tasks/person)`,
        location: {
          department: dept.department,
        },
        metrics: {
          queueLength: pendingTasks,
          avgWaitTime: 0,
          throughput: 0,
          utilizationRate: Math.min(100, (tasksPerPerson / 15) * 100),
          trend: 'stable',
        },
        impact: {
          affectedProcesses: await getProcessesByDepartment(dept.department, organizationId),
          affectedUsers: dept._count,
          estimatedDelay: tasksPerPerson * 2,
          priorityItems: 0,
        },
        detectedAt: new Date(),
        status: 'active',
        recommendations: getResourceRecommendations(tasksPerPerson, dept._count),
      });
    }
  }

  return bottlenecks;
}

// Helper functions

function getSeverity(value: number, thresholds: [number, number, number]): Bottleneck['severity'] {
  if (value >= thresholds[2]) return 'critical';
  if (value >= thresholds[1]) return 'high';
  if (value >= thresholds[0]) return 'medium';
  return 'low';
}

async function getProcessThroughput(processId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const completed = await prisma.task.count({
    where: {
      processId,
      status: 'completed',
      updatedAt: { gte: sevenDaysAgo },
    },
  });
  return completed / 7;
}

async function getAffectedUsers(processId: string): Promise<number> {
  const result = await prisma.task.findMany({
    where: {
      processId,
      status: { in: ['pending', 'in_progress'] },
      assigneeId: { not: null },
    },
    select: { assigneeId: true },
    distinct: ['assigneeId'],
  });
  return result.length;
}

async function getPriorityItems(processId: string): Promise<number> {
  return prisma.task.count({
    where: {
      processId,
      status: { notIn: ['completed', 'cancelled'] },
      dueDate: { lt: new Date() },
    },
  });
}

async function getAvgWaitTimeForUser(userId: string): Promise<number> {
  const oldest = await prisma.task.findFirst({
    where: {
      assigneeId: userId,
      status: 'pending',
    },
    orderBy: { createdAt: 'asc' },
  });
  return oldest
    ? (Date.now() - new Date(oldest.createdAt).getTime()) / (1000 * 60 * 60)
    : 0;
}

async function getUserThroughput(userId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const completed = await prisma.task.count({
    where: {
      assigneeId: userId,
      status: 'completed',
      updatedAt: { gte: sevenDaysAgo },
    },
  });
  return completed / 7;
}

async function getProcessesAffectedByUser(userId: string): Promise<number> {
  const result = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      status: { in: ['pending', 'in_progress'] },
      processId: { not: null },
    },
    select: { processId: true },
    distinct: ['processId'],
  });
  return result.length;
}

async function getApprovalThroughput(userId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const completed = await prisma.routingDecision.count({
    where: {
      handlerId: userId,
      status: 'completed',
      updatedAt: { gte: sevenDaysAgo },
    },
  });
  return completed / 7;
}

async function getProcessesWaitingApproval(userId: string): Promise<number> {
  const result = await prisma.routingDecision.findMany({
    where: {
      handlerId: userId,
      status: 'pending',
    },
    select: { requestType: true },
    distinct: ['requestType'],
  });
  return result.length;
}

async function getUsersWaitingApproval(handlerId: string): Promise<number> {
  const result = await prisma.routingDecision.findMany({
    where: {
      handlerId,
      status: 'pending',
      requesterId: { not: null },
    },
    select: { requesterId: true },
    distinct: ['requesterId'],
  });
  return result.length;
}

async function getUrgentApprovals(userId: string): Promise<number> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  return prisma.routingDecision.count({
    where: {
      handlerId: userId,
      status: 'pending',
      createdAt: { lt: twoDaysAgo },
    },
  });
}

async function getProcessesByDepartment(department: string, organizationId: string): Promise<number> {
  const deptUsers = await prisma.user.findMany({
    where: { organizationId, department },
    select: { id: true },
  });
  const userIds = deptUsers.map(u => u.id);

  const result = await prisma.process.count({
    where: {
      organizationId,
      ownerId: { in: userIds },
    },
  });
  return result;
}

async function getBottleneckTrends(organizationId: string): Promise<BottleneckTrend[]> {
  // This would ideally come from historical data
  // For now, return simulated trends
  const trends: BottleneckTrend[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    trends.push({
      date: date.toISOString().split('T')[0],
      totalBottlenecks: Math.floor(Math.random() * 10) + 5,
      criticalBottlenecks: Math.floor(Math.random() * 3),
      avgResolutionTime: Math.floor(Math.random() * 24) + 4,
    });
  }

  return trends;
}

// Recommendation generators

function getProcessRecommendations(queueLength: number, avgWaitTime: number): string[] {
  const recommendations: string[] = [];

  if (queueLength > 50) {
    recommendations.push('Consider adding additional resources to this process');
    recommendations.push('Review process steps for automation opportunities');
  }

  if (avgWaitTime > 48) {
    recommendations.push('Investigate root cause of delays');
    recommendations.push('Consider implementing SLA monitoring');
  }

  recommendations.push('Review workload distribution among assigned staff');
  return recommendations;
}

function getPersonRecommendations(taskCount: number, overdueCount: number): string[] {
  const recommendations: string[] = [];

  if (taskCount > 30) {
    recommendations.push('Redistribute tasks to other team members');
    recommendations.push('Prioritize critical tasks and delegate others');
  }

  if (overdueCount > 5) {
    recommendations.push('Address overdue items immediately');
    recommendations.push('Review task priorities and deadlines');
  }

  recommendations.push('Consider temporary support or coverage');
  return recommendations;
}

function getApprovalRecommendations(count: number, avgWaitTime: number): string[] {
  const recommendations: string[] = [];

  if (count > 25) {
    recommendations.push('Set up delegation rules for routine approvals');
    recommendations.push('Consider adding backup approvers');
  }

  if (avgWaitTime > 24) {
    recommendations.push('Review and streamline approval criteria');
    recommendations.push('Implement approval reminders');
  }

  recommendations.push('Consider batch approval workflows for similar items');
  return recommendations;
}

function getResourceRecommendations(tasksPerPerson: number, teamSize: number): string[] {
  const recommendations: string[] = [];

  if (tasksPerPerson > 20) {
    recommendations.push('Consider hiring additional staff');
    recommendations.push('Review task allocation across the organization');
  }

  if (teamSize < 3) {
    recommendations.push('Small team at high risk - consider cross-training');
    recommendations.push('Identify tasks that can be automated or outsourced');
  }

  recommendations.push('Implement workload monitoring and alerts');
  return recommendations;
}

export default {
  detectBottlenecks,
};
