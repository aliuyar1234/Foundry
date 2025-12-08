/**
 * Retry Action
 * T139 - Implement retry action
 *
 * Retries failed operations (jobs, integrations, process steps)
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { registerActionExecutor } from '../actionExecutor.js';
import type {
  AutomatedAction,
  RetryActionConfig,
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

interface RetryState {
  targetId: string;
  attemptCount: number;
  lastAttemptAt: Date;
  nextDelayMs: number;
  errors: string[];
}

// Track retry state per target
const retryState = new Map<string, RetryState>();

// =============================================================================
// Retry Action Implementation
// =============================================================================

/**
 * Execute retry action
 */
async function executeRetry(
  action: AutomatedAction,
  context: ExecutionContext
): Promise<ActionExecutionResult> {
  const config = action.actionConfig as RetryActionConfig;
  const changes: ExecutionChange[] = [];

  logger.debug({ actionId: action.id, config }, 'Executing retry action');

  try {
    // Extract target ID from pattern or context
    const targetId = extractTargetId(context, config);
    if (!targetId) {
      return {
        success: false,
        affectedEntities: [],
        changes: [],
        errorMessage: 'Could not determine target for retry',
      };
    }

    // Get or initialize retry state
    const stateKey = `${action.id}:${targetId}`;
    const state = retryState.get(stateKey);
    const currentAttempt = (state?.attemptCount || 0) + 1;

    // Check if we've exceeded max attempts
    if (currentAttempt > config.maxAttempts) {
      return {
        success: false,
        affectedEntities: [targetId],
        changes: [],
        errorMessage: `Max retry attempts (${config.maxAttempts}) exceeded`,
        metrics: {
          attemptsMade: state?.attemptCount || 0,
          maxAttempts: config.maxAttempts,
        },
      };
    }

    // Calculate delay with backoff
    const delayMs = calculateDelay(currentAttempt, config);

    // If there's remaining delay, schedule for later
    if (state && state.nextDelayMs > 0) {
      const timeSinceLastAttempt = Date.now() - state.lastAttemptAt.getTime();
      if (timeSinceLastAttempt < state.nextDelayMs) {
        const remainingDelay = state.nextDelayMs - timeSinceLastAttempt;
        await scheduleRetry(action.id, targetId, remainingDelay);

        return {
          success: true,
          affectedEntities: [targetId],
          changes: [],
          metrics: {
            scheduledForLater: 1,
            delayMs: remainingDelay,
          },
        };
      }
    }

    // Perform the retry
    let result: RetryResult;
    switch (config.targetType) {
      case 'job':
        result = await retryJob(targetId, context.organizationId);
        break;
      case 'integration':
        result = await retryIntegration(targetId, context.organizationId);
        break;
      case 'process_step':
        result = await retryProcessStep(targetId, context.organizationId);
        break;
      default:
        return {
          success: false,
          affectedEntities: [targetId],
          changes: [],
          errorMessage: `Unknown target type: ${config.targetType}`,
        };
    }

    // Update retry state
    retryState.set(stateKey, {
      targetId,
      attemptCount: currentAttempt,
      lastAttemptAt: new Date(),
      nextDelayMs: result.success ? 0 : delayMs,
      errors: [...(state?.errors || []), ...(result.error ? [result.error] : [])],
    });

    // Record the change
    changes.push({
      entityType: config.targetType,
      entityId: targetId,
      changeType: 'update',
      before: { status: result.previousStatus },
      after: { status: result.newStatus, retryAttempt: currentAttempt },
    });

    if (result.success) {
      // Clear retry state on success
      retryState.delete(stateKey);

      return {
        success: true,
        affectedEntities: [targetId],
        changes,
        metrics: {
          attemptsUntilSuccess: currentAttempt,
          targetType: config.targetType,
        },
        rollbackData: {
          targetId,
          targetType: config.targetType,
          previousStatus: result.previousStatus,
        },
      };
    }

    // Schedule next retry if not at max attempts
    if (currentAttempt < config.maxAttempts) {
      await scheduleRetry(action.id, targetId, delayMs);
    }

    return {
      success: false,
      affectedEntities: [targetId],
      changes,
      errorMessage: result.error,
      metrics: {
        currentAttempt,
        maxAttempts: config.maxAttempts,
        nextRetryDelayMs: currentAttempt < config.maxAttempts ? delayMs : 0,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, actionId: action.id }, 'Retry action failed');

    return {
      success: false,
      affectedEntities: [],
      changes,
      errorMessage,
    };
  }
}

/**
 * Validate retry action configuration
 */
function validateRetryConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const cfg = config as RetryActionConfig;

  if (cfg.type !== 'retry') {
    errors.push('Invalid action type for retry action');
  }

  if (!cfg.targetType || !['job', 'integration', 'process_step'].includes(cfg.targetType)) {
    errors.push('Invalid target type: must be job, integration, or process_step');
  }

  if (!cfg.maxAttempts || cfg.maxAttempts < 1) {
    errors.push('Max attempts must be at least 1');
  }

  if (cfg.maxAttempts > 10) {
    errors.push('Max attempts cannot exceed 10');
  }

  if (!cfg.delaySeconds || cfg.delaySeconds < 1) {
    errors.push('Delay seconds must be at least 1');
  }

  if (cfg.backoffMultiplier && cfg.backoffMultiplier < 1) {
    errors.push('Backoff multiplier must be at least 1');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Rollback retry action
 */
async function rollbackRetry(
  action: AutomatedAction,
  executionId: string,
  rollbackData: Record<string, unknown>
): Promise<boolean> {
  try {
    const { targetId, targetType, previousStatus } = rollbackData as {
      targetId: string;
      targetType: string;
      previousStatus: string;
    };

    // Revert the target to its previous status
    switch (targetType) {
      case 'job':
        await prisma.job.update({
          where: { id: targetId },
          data: { status: previousStatus },
        });
        break;
      case 'integration':
        await prisma.integration.update({
          where: { id: targetId },
          data: { status: previousStatus },
        });
        break;
      case 'process_step':
        await prisma.processInstance.update({
          where: { id: targetId },
          data: { status: previousStatus },
        });
        break;
    }

    logger.info({ executionId, targetId, targetType }, 'Retry action rolled back');
    return true;
  } catch (error) {
    logger.error({ error, executionId }, 'Failed to rollback retry action');
    return false;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

interface RetryResult {
  success: boolean;
  previousStatus: string;
  newStatus: string;
  error?: string;
}

/**
 * Extract target ID from context
 */
function extractTargetId(context: ExecutionContext, config: RetryActionConfig): string | null {
  if (context.pattern) {
    // Look for affected entity matching target type
    const entity = context.pattern.affectedEntities.find((e) => {
      if (config.targetType === 'job' && e.type === 'job') return true;
      if (config.targetType === 'integration' && e.type === 'integration') return true;
      if (config.targetType === 'process_step' && e.type === 'process_instance') return true;
      return false;
    });

    if (entity) return entity.id;
  }

  // Check event data
  if (context.eventData) {
    return (context.eventData.targetId as string) || null;
  }

  return null;
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateDelay(attempt: number, config: RetryActionConfig): number {
  const baseDelayMs = config.delaySeconds * 1000;
  const multiplier = config.backoffMultiplier || 1;

  // Exponential backoff: delay * multiplier^(attempt-1)
  const delayMs = baseDelayMs * Math.pow(multiplier, attempt - 1);

  // Cap at 1 hour
  return Math.min(delayMs, 3600000);
}

/**
 * Retry a failed job
 */
async function retryJob(jobId: string, organizationId: string): Promise<RetryResult> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
  });

  if (!job) {
    return {
      success: false,
      previousStatus: 'unknown',
      newStatus: 'unknown',
      error: `Job not found: ${jobId}`,
    };
  }

  const previousStatus = job.status;

  try {
    // Reset job status for retry
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        retryCount: { increment: 1 },
        lastError: null,
        updatedAt: new Date(),
      },
    });

    // In production, this would add the job back to the queue
    // await jobQueue.add(job.type, job.data, { jobId });

    logger.info({ jobId }, 'Job queued for retry');

    return {
      success: true,
      previousStatus,
      newStatus: 'pending',
    };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retry a failed integration sync
 */
async function retryIntegration(
  integrationId: string,
  organizationId: string
): Promise<RetryResult> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId },
  });

  if (!integration) {
    return {
      success: false,
      previousStatus: 'unknown',
      newStatus: 'unknown',
      error: `Integration not found: ${integrationId}`,
    };
  }

  const previousStatus = integration.status;

  try {
    // Reset integration status
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: 'syncing',
        errorMessage: null,
        updatedAt: new Date(),
      },
    });

    // Create a new sync log entry
    await prisma.syncLog.create({
      data: {
        id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        integrationId,
        status: 'in_progress',
        startedAt: new Date(),
        isRetry: true,
      },
    });

    // In production, this would trigger the actual sync
    // await integrationService.triggerSync(integrationId);

    logger.info({ integrationId }, 'Integration sync retry initiated');

    return {
      success: true,
      previousStatus,
      newStatus: 'syncing',
    };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retry a stuck process step
 */
async function retryProcessStep(
  instanceId: string,
  organizationId: string
): Promise<RetryResult> {
  const instance = await prisma.processInstance.findFirst({
    where: { id: instanceId, organizationId },
  });

  if (!instance) {
    return {
      success: false,
      previousStatus: 'unknown',
      newStatus: 'unknown',
      error: `Process instance not found: ${instanceId}`,
    };
  }

  const previousStatus = instance.status;

  try {
    // Reset the current step
    await prisma.processInstance.update({
      where: { id: instanceId },
      data: {
        status: 'in_progress',
        lastActivityAt: new Date(),
        retryCount: { increment: 1 },
      },
    });

    // Log the retry
    await prisma.processStepLog.create({
      data: {
        id: `psl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        processInstanceId: instanceId,
        stepId: instance.currentStep || 'unknown',
        action: 'retry',
        startedAt: new Date(),
      },
    });

    logger.info({ instanceId }, 'Process step retry initiated');

    return {
      success: true,
      previousStatus,
      newStatus: 'in_progress',
    };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Schedule a retry for later
 */
async function scheduleRetry(
  actionId: string,
  targetId: string,
  delayMs: number
): Promise<void> {
  // In production, this would schedule a job via BullMQ
  logger.info(
    { actionId, targetId, delayMs },
    'Retry scheduled (would use job queue)'
  );

  // await retryQueue.add('execute-retry', { actionId, targetId }, {
  //   delay: delayMs,
  // });
}

// =============================================================================
// Additional Functions
// =============================================================================

/**
 * Get retry statistics for a target
 */
export function getRetryStats(actionId: string, targetId: string): RetryState | null {
  return retryState.get(`${actionId}:${targetId}`) || null;
}

/**
 * Reset retry state for a target
 */
export function resetRetryState(actionId: string, targetId: string): void {
  retryState.delete(`${actionId}:${targetId}`);
  logger.debug({ actionId, targetId }, 'Retry state reset');
}

/**
 * Get all pending retries
 */
export function getPendingRetries(): Array<{ key: string; state: RetryState }> {
  const pending: Array<{ key: string; state: RetryState }> = [];

  retryState.forEach((state, key) => {
    if (state.nextDelayMs > 0) {
      pending.push({ key, state });
    }
  });

  return pending;
}

// =============================================================================
// Register Action Executor
// =============================================================================

registerActionExecutor({
  actionType: 'retry',
  execute: executeRetry,
  validate: validateRetryConfig,
  canRollback: true,
  rollback: rollbackRetry,
});

export default {
  executeRetry,
  validateRetryConfig,
  getRetryStats,
  resetRetryState,
  getPendingRetries,
};
