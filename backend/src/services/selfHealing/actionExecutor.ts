/**
 * Action Executor Service
 * T136 - Create action executor service
 *
 * Coordinates execution of automated self-healing actions
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import type {
  AutomatedAction,
  ActionExecution,
  ExecutionResult,
  ExecutionChange,
  ExecutionStatus,
  ActionConfig,
  DetectedPattern,
} from 'shared/types/selfHealing.js';

// =============================================================================
// Types
// =============================================================================

export interface ActionExecutorPlugin {
  actionType: string;
  execute: (
    action: AutomatedAction,
    context: ExecutionContext
  ) => Promise<ActionExecutionResult>;
  validate?: (config: ActionConfig) => ValidationResult;
  canRollback?: boolean;
  rollback?: (
    action: AutomatedAction,
    executionId: string,
    rollbackData: Record<string, unknown>
  ) => Promise<boolean>;
}

export interface ExecutionContext {
  executionId: string;
  triggeredBy: 'pattern' | 'threshold' | 'schedule' | 'event' | 'manual';
  pattern?: DetectedPattern;
  eventData?: Record<string, unknown>;
  organizationId: string;
  initiatedBy?: string;
}

export interface ActionExecutionResult {
  success: boolean;
  affectedEntities: string[];
  changes: ExecutionChange[];
  metrics?: Record<string, number>;
  errorMessage?: string;
  rollbackData?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ExecutionOptions {
  bypassApproval?: boolean;
  dryRun?: boolean;
  timeout?: number;
}

// =============================================================================
// Action Executor Registry
// =============================================================================

const actionPlugins: Map<string, ActionExecutorPlugin> = new Map();

/**
 * Register an action executor plugin
 */
export function registerActionExecutor(plugin: ActionExecutorPlugin): void {
  actionPlugins.set(plugin.actionType, plugin);
  logger.info({ actionType: plugin.actionType }, 'Registered action executor');
}

/**
 * Get all registered action types
 */
export function getRegisteredActionTypes(): string[] {
  return Array.from(actionPlugins.keys());
}

/**
 * Check if an action type has rollback capability
 */
export function canRollback(actionType: string): boolean {
  const plugin = actionPlugins.get(actionType);
  return plugin?.canRollback ?? false;
}

// =============================================================================
// Execution Functions
// =============================================================================

/**
 * Execute an automated action
 */
export async function executeAction(
  action: AutomatedAction,
  context: ExecutionContext,
  options: ExecutionOptions = {}
): Promise<ActionExecution> {
  const startTime = Date.now();

  logger.info(
    { actionId: action.id, actionType: action.actionType, context },
    'Starting action execution'
  );

  // Create execution record
  const execution = await createExecution(action, context);

  try {
    // Check if approval is required
    if (action.requiresApproval && !options.bypassApproval) {
      await updateExecutionStatus(execution.id, 'pending_approval');
      logger.info({ executionId: execution.id }, 'Action requires approval');
      return await getExecution(execution.id);
    }

    // Mark as executing
    await updateExecutionStatus(execution.id, 'executing');

    // Get the plugin
    const plugin = actionPlugins.get(action.actionType);
    if (!plugin) {
      throw new Error(`No executor registered for action type: ${action.actionType}`);
    }

    // Validate configuration
    if (plugin.validate) {
      const validation = plugin.validate(action.actionConfig);
      if (!validation.valid) {
        throw new Error(`Invalid action configuration: ${validation.errors.join(', ')}`);
      }
    }

    // Execute the action
    let result: ActionExecutionResult;
    if (options.dryRun) {
      result = {
        success: true,
        affectedEntities: [],
        changes: [],
        metrics: { dryRun: 1 },
      };
      logger.info({ executionId: execution.id }, 'Dry run - skipping actual execution');
    } else {
      result = await executeWithTimeout(
        plugin.execute(action, context),
        options.timeout || 60000
      );
    }

    // Update execution with result
    if (result.success) {
      await completeExecution(execution.id, result);

      // Update action statistics
      await prisma.automatedAction.update({
        where: { id: action.id },
        data: {
          successCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      });
    } else {
      await failExecution(execution.id, result.errorMessage || 'Unknown error', result);

      // Update action statistics
      await prisma.automatedAction.update({
        where: { id: action.id },
        data: {
          failureCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      });
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      { executionId: execution.id, success: result.success, durationMs },
      'Action execution completed'
    );

    return await getExecution(execution.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await failExecution(execution.id, errorMessage);

    // Update action statistics
    await prisma.automatedAction.update({
      where: { id: action.id },
      data: {
        failureCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    logger.error({ error, executionId: execution.id }, 'Action execution failed');
    return await getExecution(execution.id);
  }
}

/**
 * Execute action with timeout
 */
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Action execution timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Approve a pending action execution
 */
export async function approveExecution(
  executionId: string,
  approvedBy: string
): Promise<ActionExecution> {
  const execution = await getExecution(executionId);

  if (execution.status !== 'pending_approval') {
    throw new Error(`Cannot approve execution with status: ${execution.status}`);
  }

  // Update to approved
  await prisma.actionExecution.update({
    where: { id: executionId },
    data: {
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    },
  });

  // Get the action and execute
  const action = await prisma.automatedAction.findUnique({
    where: { id: execution.actionId },
  });

  if (!action) {
    throw new Error(`Action not found: ${execution.actionId}`);
  }

  // Re-execute with bypass approval
  const context: ExecutionContext = {
    executionId,
    triggeredBy: 'manual',
    organizationId: execution.organizationId,
    initiatedBy: approvedBy,
  };

  // Update status to executing
  await updateExecutionStatus(executionId, 'executing');

  try {
    const plugin = actionPlugins.get(action.actionType);
    if (!plugin) {
      throw new Error(`No executor registered for action type: ${action.actionType}`);
    }

    const result = await plugin.execute(action as AutomatedAction, context);

    if (result.success) {
      await completeExecution(executionId, result);
    } else {
      await failExecution(executionId, result.errorMessage || 'Unknown error', result);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await failExecution(executionId, errorMessage);
  }

  return await getExecution(executionId);
}

/**
 * Cancel a pending action execution
 */
export async function cancelExecution(
  executionId: string,
  cancelledBy: string
): Promise<ActionExecution> {
  const execution = await getExecution(executionId);

  if (execution.status !== 'pending_approval') {
    throw new Error(`Cannot cancel execution with status: ${execution.status}`);
  }

  await prisma.actionExecution.update({
    where: { id: executionId },
    data: {
      status: 'cancelled',
    },
  });

  logger.info({ executionId, cancelledBy }, 'Execution cancelled');

  return await getExecution(executionId);
}

/**
 * Rollback a completed action execution
 */
export async function rollbackExecution(
  executionId: string,
  rolledBackBy: string
): Promise<ActionExecution> {
  const execution = await getExecution(executionId);

  if (execution.status !== 'completed') {
    throw new Error(`Cannot rollback execution with status: ${execution.status}`);
  }

  if (execution.wasRolledBack) {
    throw new Error('Execution has already been rolled back');
  }

  if (!execution.rollbackData) {
    throw new Error('No rollback data available for this execution');
  }

  // Get the action
  const action = await prisma.automatedAction.findUnique({
    where: { id: execution.actionId },
  });

  if (!action) {
    throw new Error(`Action not found: ${execution.actionId}`);
  }

  const plugin = actionPlugins.get(action.actionType);
  if (!plugin?.rollback) {
    throw new Error(`Rollback not supported for action type: ${action.actionType}`);
  }

  try {
    const success = await plugin.rollback(
      action as AutomatedAction,
      executionId,
      execution.rollbackData as Record<string, unknown>
    );

    if (success) {
      await prisma.actionExecution.update({
        where: { id: executionId },
        data: {
          status: 'rolled_back',
          wasRolledBack: true,
          rolledBackAt: new Date(),
          rolledBackBy,
        },
      });

      logger.info({ executionId, rolledBackBy }, 'Execution rolled back successfully');
    } else {
      throw new Error('Rollback operation failed');
    }
  } catch (error) {
    logger.error({ error, executionId }, 'Rollback failed');
    throw error;
  }

  return await getExecution(executionId);
}

// =============================================================================
// Batch Execution
// =============================================================================

/**
 * Execute multiple actions for detected patterns
 */
export async function executeActionsForPatterns(
  organizationId: string,
  patterns: DetectedPattern[],
  options: ExecutionOptions = {}
): Promise<ActionExecution[]> {
  const executions: ActionExecution[] = [];

  // Get all active actions for this organization
  const actions = await prisma.automatedAction.findMany({
    where: {
      organizationId,
      isActive: true,
    },
  });

  for (const pattern of patterns) {
    // Find actions that match this pattern
    const matchingActions = actions.filter((action) => {
      const config = action.triggerConfig as { type: string; patternType?: string };
      return config.type === 'pattern' && config.patternType === pattern.type;
    });

    for (const action of matchingActions) {
      const context: ExecutionContext = {
        executionId: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        triggeredBy: 'pattern',
        pattern,
        organizationId,
      };

      try {
        const execution = await executeAction(
          action as AutomatedAction,
          context,
          options
        );
        executions.push(execution);
      } catch (error) {
        logger.error(
          { error, actionId: action.id, patternId: pattern.id },
          'Failed to execute action for pattern'
        );
      }
    }
  }

  return executions;
}

// =============================================================================
// Execution Record Management
// =============================================================================

async function createExecution(
  action: AutomatedAction,
  context: ExecutionContext
): Promise<ActionExecution> {
  const execution = await prisma.actionExecution.create({
    data: {
      id: context.executionId,
      actionId: action.id,
      triggerReason: context.pattern?.description || 'Manual trigger',
      status: 'pending_approval',
      wasRolledBack: false,
      organizationId: context.organizationId,
    },
  });

  return mapToActionExecution(execution);
}

async function updateExecutionStatus(
  executionId: string,
  status: ExecutionStatus
): Promise<void> {
  await prisma.actionExecution.update({
    where: { id: executionId },
    data: { status },
  });
}

async function completeExecution(
  executionId: string,
  result: ActionExecutionResult
): Promise<void> {
  await prisma.actionExecution.update({
    where: { id: executionId },
    data: {
      status: 'completed',
      executedAt: new Date(),
      completedAt: new Date(),
      result: result as unknown as Record<string, unknown>,
      rollbackData: result.rollbackData,
    },
  });
}

async function failExecution(
  executionId: string,
  errorMessage: string,
  result?: ActionExecutionResult
): Promise<void> {
  await prisma.actionExecution.update({
    where: { id: executionId },
    data: {
      status: 'failed',
      errorMessage,
      result: result as unknown as Record<string, unknown>,
    },
  });
}

async function getExecution(executionId: string): Promise<ActionExecution> {
  const execution = await prisma.actionExecution.findUnique({
    where: { id: executionId },
    include: {
      action: { select: { name: true } },
    },
  });

  if (!execution) {
    throw new Error(`Execution not found: ${executionId}`);
  }

  return mapToActionExecution(execution);
}

function mapToActionExecution(
  record: {
    id: string;
    actionId: string;
    triggerReason: string;
    status: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    executedAt: Date | null;
    completedAt: Date | null;
    result: unknown;
    errorMessage: string | null;
    rollbackData: unknown;
    wasRolledBack: boolean;
    rolledBackAt: Date | null;
    rolledBackBy: string | null;
    organizationId: string;
    createdAt: Date;
    action?: { name: string };
  }
): ActionExecution {
  return {
    id: record.id,
    actionId: record.actionId,
    actionName: record.action?.name,
    triggerReason: record.triggerReason,
    status: record.status as ExecutionStatus,
    approvedBy: record.approvedBy || undefined,
    approvedAt: record.approvedAt || undefined,
    executedAt: record.executedAt || undefined,
    completedAt: record.completedAt || undefined,
    result: record.result as ExecutionResult | undefined,
    errorMessage: record.errorMessage || undefined,
    rollbackData: record.rollbackData as Record<string, unknown> | undefined,
    wasRolledBack: record.wasRolledBack,
    rolledBackAt: record.rolledBackAt || undefined,
    rolledBackBy: record.rolledBackBy || undefined,
    organizationId: record.organizationId,
    createdAt: record.createdAt,
  };
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get execution history for an organization
 */
export async function getExecutionHistory(
  organizationId: string,
  options: {
    actionId?: string;
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ActionExecution[]> {
  const executions = await prisma.actionExecution.findMany({
    where: {
      organizationId,
      ...(options.actionId && { actionId: options.actionId }),
      ...(options.status && { status: options.status }),
    },
    include: {
      action: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit || 50,
    skip: options.offset || 0,
  });

  return executions.map(mapToActionExecution);
}

/**
 * Get pending approvals for an organization
 */
export async function getPendingApprovals(
  organizationId: string
): Promise<ActionExecution[]> {
  return getExecutionHistory(organizationId, { status: 'pending_approval' });
}

/**
 * Get execution statistics
 */
export async function getExecutionStatistics(
  organizationId: string,
  days: number = 30
): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byActionType: Record<string, number>;
  successRate: number;
  avgExecutionTimeMs: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const executions = await prisma.actionExecution.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
    },
    include: {
      action: { select: { actionType: true } },
    },
  });

  const byStatus: Record<string, number> = {};
  const byActionType: Record<string, number> = {};
  let completedCount = 0;
  let successCount = 0;
  let totalExecutionTime = 0;

  for (const exec of executions) {
    byStatus[exec.status] = (byStatus[exec.status] || 0) + 1;

    const actionType = exec.action?.actionType || 'unknown';
    byActionType[actionType] = (byActionType[actionType] || 0) + 1;

    if (exec.status === 'completed') {
      successCount++;
      completedCount++;
      if (exec.executedAt && exec.completedAt) {
        totalExecutionTime += exec.completedAt.getTime() - exec.executedAt.getTime();
      }
    } else if (exec.status === 'failed') {
      completedCount++;
    }
  }

  return {
    total: executions.length,
    byStatus,
    byActionType,
    successRate: completedCount > 0 ? successCount / completedCount : 0,
    avgExecutionTimeMs: successCount > 0 ? totalExecutionTime / successCount : 0,
  };
}

export default {
  registerActionExecutor,
  getRegisteredActionTypes,
  canRollback,
  executeAction,
  approveExecution,
  cancelExecution,
  rollbackExecution,
  executeActionsForPatterns,
  getExecutionHistory,
  getPendingApprovals,
  getExecutionStatistics,
};
