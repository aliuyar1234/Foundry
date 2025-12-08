/**
 * Docuware Workflow State Extractor
 * Task: T165
 * Extracts workflow states and task tracking information
 */

import { DocuwareClient, DocuwareWorkflow, DocuwareTask } from '../docuwareClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface WorkflowExtractionOptions {
  organizationId: string;
  cabinetId?: string;
  includeCompleted?: boolean;
  includeTasks?: boolean;
}

export interface WorkflowExtractionResult {
  events: ExtractedEvent[];
  stats: {
    totalWorkflows: number;
    activeWorkflows: number;
    completedWorkflows: number;
    totalTasks: number;
    byState: Record<string, number>;
    byWorkflowType: Record<string, number>;
  };
}

/**
 * Determine workflow state category
 */
function getWorkflowStateCategory(state: string): string {
  const stateLower = state?.toLowerCase() || '';

  if (stateLower.includes('complete') || stateLower.includes('finished')) {
    return 'completed';
  }
  if (stateLower.includes('active') || stateLower.includes('running')) {
    return 'active';
  }
  if (stateLower.includes('pending') || stateLower.includes('waiting')) {
    return 'pending';
  }
  if (stateLower.includes('failed') || stateLower.includes('error')) {
    return 'failed';
  }
  if (stateLower.includes('cancelled') || stateLower.includes('aborted')) {
    return 'cancelled';
  }

  return 'unknown';
}

/**
 * Convert Docuware workflow to ExtractedEvent
 */
export function workflowToEvent(
  workflow: DocuwareWorkflow,
  organizationId: string,
  tasks?: DocuwareTask[]
): ExtractedEvent {
  const timestamp = workflow.CompletedAt
    ? new Date(workflow.CompletedAt)
    : workflow.StartedAt
      ? new Date(workflow.StartedAt)
      : new Date();

  const stateCategory = getWorkflowStateCategory(workflow.State);
  const isCompleted = !!workflow.CompletedAt;
  const duration = workflow.CompletedAt && workflow.StartedAt
    ? new Date(workflow.CompletedAt).getTime() - new Date(workflow.StartedAt).getTime()
    : null;

  return {
    externalId: `docuware-workflow-${workflow.Id}`,
    source: 'docuware',
    eventType: isCompleted ? 'dms.workflow.completed' : 'dms.workflow.active',
    timestamp,
    data: {
      workflowId: workflow.Id,
      workflowName: workflow.WorkflowName,
      state: workflow.State,
      stateCategory,
      fileCabinetId: workflow.FileCabinetId,
      documentId: workflow.DocumentId,
      assignedUser: workflow.AssignedUser,
      startedAt: workflow.StartedAt,
      completedAt: workflow.CompletedAt,
      currentStep: workflow.CurrentStep,
      isCompleted,
      durationMs: duration,
      taskCount: tasks?.length || 0,
      tasks: tasks?.map(task => ({
        id: task.Id,
        activityName: task.ActivityName,
        assignedTo: task.AssignedTo,
        status: task.Status,
        dueDate: task.DueDate,
        completedAt: task.CompletedAt,
      })),
    },
    metadata: {
      organizationId,
      objectType: 'Workflow',
      source: 'docuware',
    },
  };
}

/**
 * Convert Docuware task to ExtractedEvent
 */
export function taskToEvent(
  task: DocuwareTask,
  workflow: DocuwareWorkflow,
  organizationId: string
): ExtractedEvent {
  const timestamp = task.CompletedAt
    ? new Date(task.CompletedAt)
    : new Date();

  const isCompleted = !!task.CompletedAt;
  const isOverdue = task.DueDate && !task.CompletedAt
    ? new Date(task.DueDate) < new Date()
    : false;

  return {
    externalId: `docuware-task-${task.Id}`,
    source: 'docuware',
    eventType: isCompleted ? 'dms.task.completed' : 'dms.task.pending',
    timestamp,
    data: {
      taskId: task.Id,
      workflowId: task.WorkflowId,
      workflowName: workflow.WorkflowName,
      activityName: task.ActivityName,
      assignedTo: task.AssignedTo,
      status: task.Status,
      dueDate: task.DueDate,
      completedAt: task.CompletedAt,
      isCompleted,
      isOverdue,
      documentId: workflow.DocumentId,
      fileCabinetId: workflow.FileCabinetId,
    },
    metadata: {
      organizationId,
      objectType: 'WorkflowTask',
      source: 'docuware',
    },
  };
}

/**
 * Extract workflows from Docuware
 */
export async function extractWorkflows(
  client: DocuwareClient,
  options: WorkflowExtractionOptions
): Promise<WorkflowExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    totalWorkflows: 0,
    activeWorkflows: 0,
    completedWorkflows: 0,
    totalTasks: 0,
    byState: {} as Record<string, number>,
    byWorkflowType: {} as Record<string, number>,
  };

  try {
    const workflows = await client.getWorkflows(options.cabinetId);

    for (const workflow of workflows) {
      // Filter completed workflows if needed
      if (!options.includeCompleted && workflow.CompletedAt) {
        continue;
      }

      // Get tasks if requested
      let tasks: DocuwareTask[] | undefined;
      if (options.includeTasks) {
        tasks = await client.getWorkflowTasks(workflow.Id);
        stats.totalTasks += tasks.length;

        // Create task events
        for (const task of tasks) {
          events.push(taskToEvent(task, workflow, options.organizationId));
        }
      }

      // Create workflow event
      events.push(workflowToEvent(workflow, options.organizationId, tasks));

      // Update stats
      stats.totalWorkflows++;

      if (workflow.CompletedAt) {
        stats.completedWorkflows++;
      } else {
        stats.activeWorkflows++;
      }

      const state = workflow.State || 'unknown';
      stats.byState[state] = (stats.byState[state] || 0) + 1;

      const workflowName = workflow.WorkflowName || 'unknown';
      stats.byWorkflowType[workflowName] = (stats.byWorkflowType[workflowName] || 0) + 1;
    }
  } catch (error) {
    console.error('Error extracting workflows:', error);
    // Don't throw error as workflows might not be available
    console.warn('Workflows feature may not be available in this Docuware installation');
  }

  return { events, stats };
}

/**
 * Extract workflow for specific document
 */
export async function extractDocumentWorkflows(
  client: DocuwareClient,
  cabinetId: string,
  documentId: number,
  organizationId: string,
  includeTasks = true
): Promise<ExtractedEvent[]> {
  const events: ExtractedEvent[] = [];

  try {
    const workflows = await client.getDocumentWorkflows(cabinetId, documentId);

    for (const workflow of workflows) {
      let tasks: DocuwareTask[] | undefined;

      if (includeTasks) {
        tasks = await client.getWorkflowTasks(workflow.Id);

        for (const task of tasks) {
          events.push(taskToEvent(task, workflow, organizationId));
        }
      }

      events.push(workflowToEvent(workflow, organizationId, tasks));
    }
  } catch (error) {
    console.error(`Error extracting workflows for document ${documentId}:`, error);
  }

  return events;
}

/**
 * Calculate workflow statistics from extracted events
 */
export function calculateWorkflowStats(events: ExtractedEvent[]): {
  workflowEvents: number;
  taskEvents: number;
  averageDuration: number;
  completionRate: number;
  overdueTasksCount: number;
  byAssignedUser: Record<string, number>;
  averageTasksPerWorkflow: number;
} {
  const workflowEvents = events.filter(e => e.eventType.includes('workflow')).length;
  const taskEvents = events.filter(e => e.eventType.includes('task')).length;

  const workflows = events.filter(e => e.eventType.includes('workflow'));
  const completedWorkflows = workflows.filter(e => e.data.isCompleted).length;

  const durations = workflows
    .filter(e => e.data.durationMs)
    .map(e => e.data.durationMs as number);

  const averageDuration = durations.length > 0
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : 0;

  const completionRate = workflows.length > 0
    ? (completedWorkflows / workflows.length) * 100
    : 0;

  const tasks = events.filter(e => e.eventType.includes('task'));
  const overdueTasksCount = tasks.filter(e => e.data.isOverdue).length;

  const byAssignedUser: Record<string, number> = {};
  for (const task of tasks) {
    const assignedTo = task.data.assignedTo as string;
    if (assignedTo) {
      byAssignedUser[assignedTo] = (byAssignedUser[assignedTo] || 0) + 1;
    }
  }

  const averageTasksPerWorkflow = workflows.length > 0
    ? taskEvents / workflowEvents
    : 0;

  return {
    workflowEvents,
    taskEvents,
    averageDuration,
    completionRate,
    overdueTasksCount,
    byAssignedUser,
    averageTasksPerWorkflow,
  };
}
