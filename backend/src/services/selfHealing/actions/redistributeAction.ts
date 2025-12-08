/**
 * Workload Redistribution Action
 * T140 - Implement workload redistribution action
 *
 * Redistributes tasks from overloaded to available team members
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { registerActionExecutor } from '../actionExecutor.js';
import type {
  AutomatedAction,
  RedistributeActionConfig,
  ExecutionChange,
} from 'shared/types/selfHealing.js';
import type {
  ExecutionContext,
  ActionExecutionResult,
  ValidationResult,
} from '../actionExecutor.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

interface TaskReassignment {
  taskId: string;
  taskTitle: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId: string;
  toPersonName: string;
  reason: string;
}

interface TeamMember {
  id: string;
  name: string;
  currentWorkload: number;
  skills: string[];
  activeTasks: number;
  capacity: number;
}

// =============================================================================
// Redistribute Action Implementation
// =============================================================================

/**
 * Execute redistribution action
 */
async function executeRedistribute(
  action: AutomatedAction,
  context: ExecutionContext
): Promise<ActionExecutionResult> {
  const config = action.actionConfig as RedistributeActionConfig;
  const changes: ExecutionChange[] = [];
  const affectedEntities: string[] = [];

  logger.debug({ actionId: action.id, config }, 'Executing redistribution action');

  try {
    // Get the source person (overloaded member)
    const sourcePersonId = extractSourcePerson(context);
    if (!sourcePersonId) {
      return {
        success: false,
        affectedEntities: [],
        changes: [],
        errorMessage: 'Could not determine source person for redistribution',
      };
    }

    // Get available team members from target pool
    const targetMembers = await getAvailableMembers(
      config.targetPool,
      context.organizationId,
      sourcePersonId
    );

    if (targetMembers.length === 0) {
      return {
        success: false,
        affectedEntities: [sourcePersonId],
        changes: [],
        errorMessage: 'No available team members for redistribution',
      };
    }

    // Get tasks to redistribute from source
    const tasksToRedistribute = await getRedistributableTasks(
      sourcePersonId,
      context.organizationId
    );

    if (tasksToRedistribute.length === 0) {
      return {
        success: true,
        affectedEntities: [sourcePersonId],
        changes: [],
        metrics: { noTasksToRedistribute: 1 },
      };
    }

    // Perform redistribution based on strategy
    const reassignments = await redistributeTasks(
      tasksToRedistribute,
      targetMembers,
      config.strategy,
      sourcePersonId
    );

    // Apply reassignments
    const rollbackData: TaskReassignment[] = [];

    for (const reassignment of reassignments) {
      await applyReassignment(reassignment, config.preserveHistory);

      changes.push({
        entityType: 'task',
        entityId: reassignment.taskId,
        changeType: 'update',
        before: {
          assigneeId: reassignment.fromPersonId,
          assigneeName: reassignment.fromPersonName,
        },
        after: {
          assigneeId: reassignment.toPersonId,
          assigneeName: reassignment.toPersonName,
        },
      });

      affectedEntities.push(reassignment.taskId);
      affectedEntities.push(reassignment.fromPersonId);
      affectedEntities.push(reassignment.toPersonId);

      rollbackData.push(reassignment);
    }

    // Update workload scores
    await updateWorkloadScores(
      [sourcePersonId, ...targetMembers.map((m) => m.id)],
      context.organizationId
    );

    // Notify affected parties
    await notifyReassignments(reassignments, context.organizationId);

    logger.info(
      {
        actionId: action.id,
        reassignmentCount: reassignments.length,
        sourcePersonId,
      },
      'Redistribution completed'
    );

    return {
      success: true,
      affectedEntities: [...new Set(affectedEntities)],
      changes,
      metrics: {
        tasksRedistributed: reassignments.length,
        targetMembersUsed: new Set(reassignments.map((r) => r.toPersonId)).size,
        strategy: config.strategy,
      },
      rollbackData: { reassignments: rollbackData },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, actionId: action.id }, 'Redistribution action failed');

    return {
      success: false,
      affectedEntities,
      changes,
      errorMessage,
    };
  }
}

/**
 * Validate redistribution action configuration
 */
function validateRedistributeConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const cfg = config as RedistributeActionConfig;

  if (cfg.type !== 'redistribute') {
    errors.push('Invalid action type for redistribute action');
  }

  if (!cfg.strategy || !['round_robin', 'least_loaded', 'skill_based'].includes(cfg.strategy)) {
    errors.push('Invalid strategy: must be round_robin, least_loaded, or skill_based');
  }

  if (!cfg.targetPool || cfg.targetPool.length === 0) {
    errors.push('Target pool must have at least one entry');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Rollback redistribution action
 */
async function rollbackRedistribution(
  action: AutomatedAction,
  executionId: string,
  rollbackData: Record<string, unknown>
): Promise<boolean> {
  try {
    const reassignments = rollbackData.reassignments as TaskReassignment[];

    for (const reassignment of reassignments) {
      // Revert the task assignment
      await prisma.task.update({
        where: { id: reassignment.taskId },
        data: {
          assigneeId: reassignment.fromPersonId,
          updatedAt: new Date(),
        },
      });

      // Create rollback history entry
      await prisma.taskHistory.create({
        data: {
          id: `th-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          taskId: reassignment.taskId,
          field: 'assigneeId',
          oldValue: reassignment.toPersonId,
          newValue: reassignment.fromPersonId,
          changedBy: 'system',
          reason: 'Redistribution rollback',
          createdAt: new Date(),
        },
      });

      // Notify the person being un-assigned
      await prisma.notification.create({
        data: {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'task_unassigned',
          title: 'Task Reassignment Reverted',
          message: `Task "${reassignment.taskTitle}" has been returned to its original assignee.`,
          recipientId: reassignment.toPersonId,
          organizationId: action.organizationId,
          isRead: false,
          createdAt: new Date(),
        },
      });
    }

    logger.info({ executionId, revertedCount: reassignments.length }, 'Redistribution rolled back');
    return true;
  } catch (error) {
    logger.error({ error, executionId }, 'Failed to rollback redistribution');
    return false;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract source person ID from context
 */
function extractSourcePerson(context: ExecutionContext): string | null {
  if (context.pattern) {
    // Look for overloaded person in affected entities
    const overloaded = context.pattern.affectedEntities.find(
      (e) => e.type === 'person' && e.name.includes('overloaded')
    );
    if (overloaded) return overloaded.id;

    // Fallback to first person entity
    const person = context.pattern.affectedEntities.find((e) => e.type === 'person');
    if (person) return person.id;
  }

  return (context.eventData?.sourcePersonId as string) || null;
}

/**
 * Get available team members from target pool
 */
async function getAvailableMembers(
  targetPool: string[],
  organizationId: string,
  excludePersonId: string
): Promise<TeamMember[]> {
  const members: TeamMember[] = [];

  for (const target of targetPool) {
    // Check if target is a person ID
    const person = await prisma.person.findFirst({
      where: {
        id: target,
        organizationId,
        isActive: true,
        isOnLeave: false,
        id: { not: excludePersonId },
      },
      select: {
        id: true,
        name: true,
        currentWorkload: true,
        skills: true,
        maxWorkload: true,
      },
    });

    if (person) {
      const activeTasks = await prisma.task.count({
        where: { assigneeId: person.id, status: { in: ['pending', 'in_progress'] } },
      });

      members.push({
        id: person.id,
        name: person.name,
        currentWorkload: person.currentWorkload || 50,
        skills: (person.skills as string[]) || [],
        activeTasks,
        capacity: (person.maxWorkload || 100) - (person.currentWorkload || 50),
      });
      continue;
    }

    // Check if target is a team/department
    const teamMembers = await prisma.person.findMany({
      where: {
        organizationId,
        OR: [{ team: target }, { department: target }],
        isActive: true,
        isOnLeave: false,
        id: { not: excludePersonId },
      },
      select: {
        id: true,
        name: true,
        currentWorkload: true,
        skills: true,
        maxWorkload: true,
      },
    });

    for (const tm of teamMembers) {
      const activeTasks = await prisma.task.count({
        where: { assigneeId: tm.id, status: { in: ['pending', 'in_progress'] } },
      });

      members.push({
        id: tm.id,
        name: tm.name,
        currentWorkload: tm.currentWorkload || 50,
        skills: (tm.skills as string[]) || [],
        activeTasks,
        capacity: (tm.maxWorkload || 100) - (tm.currentWorkload || 50),
      });
    }
  }

  // Remove duplicates and sort by capacity
  const uniqueMembers = Array.from(
    new Map(members.map((m) => [m.id, m])).values()
  );

  return uniqueMembers.sort((a, b) => b.capacity - a.capacity);
}

/**
 * Get tasks that can be redistributed from a person
 */
async function getRedistributableTasks(
  personId: string,
  organizationId: string
): Promise<Array<{ id: string; title: string; priority: string; requiredSkills: string[] }>> {
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: personId,
      organizationId,
      status: { in: ['pending', 'in_progress'] },
      // Don't redistribute tasks that are almost done or critical
      progress: { lt: 80 },
    },
    select: {
      id: true,
      title: true,
      priority: true,
      requiredSkills: true,
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: 10, // Limit to prevent massive redistribution
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority || 'medium',
    requiredSkills: (t.requiredSkills as string[]) || [],
  }));
}

/**
 * Redistribute tasks based on strategy
 */
async function redistributeTasks(
  tasks: Array<{ id: string; title: string; priority: string; requiredSkills: string[] }>,
  members: TeamMember[],
  strategy: 'round_robin' | 'least_loaded' | 'skill_based',
  sourcePersonId: string
): Promise<TaskReassignment[]> {
  const sourcePerson = await prisma.person.findUnique({
    where: { id: sourcePersonId },
    select: { name: true },
  });

  const reassignments: TaskReassignment[] = [];
  let memberIndex = 0;

  for (const task of tasks) {
    let targetMember: TeamMember | null = null;

    switch (strategy) {
      case 'round_robin':
        targetMember = members[memberIndex % members.length];
        memberIndex++;
        break;

      case 'least_loaded':
        targetMember = members
          .filter((m) => m.capacity > 10)
          .sort((a, b) => a.currentWorkload - b.currentWorkload)[0] || null;
        break;

      case 'skill_based':
        targetMember = findBestSkillMatch(task.requiredSkills, members);
        break;
    }

    if (targetMember && targetMember.capacity > 10) {
      reassignments.push({
        taskId: task.id,
        taskTitle: task.title,
        fromPersonId: sourcePersonId,
        fromPersonName: sourcePerson?.name || 'Unknown',
        toPersonId: targetMember.id,
        toPersonName: targetMember.name,
        reason: `Auto-redistributed via ${strategy} strategy`,
      });

      // Update member's simulated capacity
      targetMember.capacity -= 10;
      targetMember.currentWorkload += 10;
    }
  }

  return reassignments;
}

/**
 * Find best skill match for a task
 */
function findBestSkillMatch(
  requiredSkills: string[],
  members: TeamMember[]
): TeamMember | null {
  if (requiredSkills.length === 0) {
    // No skills required, use least loaded
    return members.filter((m) => m.capacity > 10)
      .sort((a, b) => a.currentWorkload - b.currentWorkload)[0] || null;
  }

  // Score members by skill match and capacity
  const scored = members
    .filter((m) => m.capacity > 10)
    .map((member) => {
      const matchingSkills = requiredSkills.filter((skill) =>
        member.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()))
      );
      const skillScore = matchingSkills.length / requiredSkills.length;
      const capacityScore = member.capacity / 100;

      return {
        member,
        score: skillScore * 0.7 + capacityScore * 0.3,
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.member || null;
}

/**
 * Apply a task reassignment
 */
async function applyReassignment(
  reassignment: TaskReassignment,
  preserveHistory: boolean
): Promise<void> {
  await prisma.task.update({
    where: { id: reassignment.taskId },
    data: {
      assigneeId: reassignment.toPersonId,
      updatedAt: new Date(),
    },
  });

  if (preserveHistory) {
    await prisma.taskHistory.create({
      data: {
        id: `th-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId: reassignment.taskId,
        field: 'assigneeId',
        oldValue: reassignment.fromPersonId,
        newValue: reassignment.toPersonId,
        changedBy: 'system',
        reason: reassignment.reason,
        createdAt: new Date(),
      },
    });
  }
}

/**
 * Update workload scores for affected people
 */
async function updateWorkloadScores(
  personIds: string[],
  organizationId: string
): Promise<void> {
  for (const personId of personIds) {
    const activeTasks = await prisma.task.count({
      where: {
        assigneeId: personId,
        status: { in: ['pending', 'in_progress'] },
      },
    });

    // Simple workload calculation based on task count
    const workload = Math.min(100, activeTasks * 10);

    await prisma.person.update({
      where: { id: personId },
      data: { currentWorkload: workload },
    });
  }
}

/**
 * Notify all parties about reassignments
 */
async function notifyReassignments(
  reassignments: TaskReassignment[],
  organizationId: string
): Promise<void> {
  // Group by target person to send consolidated notifications
  const byTarget = new Map<string, TaskReassignment[]>();

  for (const r of reassignments) {
    if (!byTarget.has(r.toPersonId)) {
      byTarget.set(r.toPersonId, []);
    }
    byTarget.get(r.toPersonId)!.push(r);
  }

  // Notify each target
  for (const [personId, tasks] of byTarget) {
    const taskList = tasks.map((t) => t.taskTitle).join(', ');
    await prisma.notification.create({
      data: {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'task_assigned',
        title: 'New Tasks Assigned',
        message: `${tasks.length} task(s) have been assigned to you: ${taskList}`,
        recipientId: personId,
        organizationId,
        isRead: false,
        createdAt: new Date(),
      },
    });
  }

  // Notify source person
  if (reassignments.length > 0) {
    const sourcePerson = reassignments[0].fromPersonId;
    await prisma.notification.create({
      data: {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'workload_adjusted',
        title: 'Workload Adjusted',
        message: `${reassignments.length} task(s) have been redistributed to help manage your workload.`,
        recipientId: sourcePerson,
        organizationId,
        isRead: false,
        createdAt: new Date(),
      },
    });
  }
}

// =============================================================================
// Register Action Executor
// =============================================================================

registerActionExecutor({
  actionType: 'redistribute',
  execute: executeRedistribute,
  validate: validateRedistributeConfig,
  canRollback: true,
  rollback: rollbackRedistribution,
});

export default {
  executeRedistribute,
  validateRedistributeConfig,
};
