/**
 * Escalation Action
 * T138 - Implement escalation action
 *
 * Escalates issues through defined escalation chains
 */

import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { registerActionExecutor } from '../actionExecutor.js';
import type {
  AutomatedAction,
  EscalationActionConfig,
  EscalationLevel,
  ExecutionChange,
} from 'shared/types/selfHealing.js';
import type {
  ExecutionContext,
  ActionExecutionResult,
  ValidationResult,
} from '../actionExecutor.js';

// =============================================================================
// Types
// =============================================================================

interface EscalationState {
  patternId: string;
  currentLevel: number;
  escalatedAt: Date;
  escalatedTo: string[];
  history: EscalationHistoryEntry[];
}

interface EscalationHistoryEntry {
  level: number;
  targetId: string;
  targetName: string;
  escalatedAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
}

// Track escalation state per pattern
const escalationState = new Map<string, EscalationState>();

// =============================================================================
// Escalation Action Implementation
// =============================================================================

/**
 * Execute escalation action
 */
async function executeEscalation(
  action: AutomatedAction,
  context: ExecutionContext
): Promise<ActionExecutionResult> {
  const config = action.actionConfig as EscalationActionConfig;
  const changes: ExecutionChange[] = [];
  const affectedEntities: string[] = [];

  logger.debug({ actionId: action.id, config }, 'Executing escalation action');

  try {
    const patternId = context.pattern?.id || context.executionId;
    const stateKey = `${action.id}:${patternId}`;

    // Get or initialize escalation state
    let state = escalationState.get(stateKey);
    const currentLevel = state?.currentLevel || 0;

    // Sort escalation chain by level
    const sortedChain = [...config.escalationChain].sort((a, b) => a.level - b.level);

    // Find the next level to escalate to
    const nextLevelIndex = sortedChain.findIndex((l) => l.level > currentLevel);
    if (nextLevelIndex === -1) {
      // Already at highest level
      return {
        success: true,
        affectedEntities: state?.escalatedTo || [],
        changes: [],
        metrics: { alreadyAtHighestLevel: 1 },
      };
    }

    const nextLevel = sortedChain[nextLevelIndex];

    // Resolve target for this level
    const target = await resolveEscalationTarget(
      nextLevel,
      context.organizationId,
      config.skipUnavailable
    );

    if (!target) {
      // If we should skip unavailable, try next level
      if (config.skipUnavailable && nextLevelIndex < sortedChain.length - 1) {
        const subsequentLevel = sortedChain[nextLevelIndex + 1];
        const fallbackTarget = await resolveEscalationTarget(
          subsequentLevel,
          context.organizationId,
          false
        );

        if (fallbackTarget) {
          return await performEscalation(
            action,
            context,
            config,
            subsequentLevel,
            fallbackTarget,
            stateKey,
            state
          );
        }
      }

      return {
        success: false,
        affectedEntities: [],
        changes: [],
        errorMessage: `No available target for escalation level ${nextLevel.level}`,
      };
    }

    return await performEscalation(
      action,
      context,
      config,
      nextLevel,
      target,
      stateKey,
      state
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, actionId: action.id }, 'Escalation action failed');

    return {
      success: false,
      affectedEntities,
      changes,
      errorMessage,
    };
  }
}

/**
 * Perform the actual escalation
 */
async function performEscalation(
  action: AutomatedAction,
  context: ExecutionContext,
  config: EscalationActionConfig,
  level: EscalationLevel,
  target: EscalationTarget,
  stateKey: string,
  currentState: EscalationState | undefined
): Promise<ActionExecutionResult> {
  const changes: ExecutionChange[] = [];

  // Build escalation message
  const message = buildEscalationMessage(context, config, level);

  // Send notification to target
  const notificationId = await sendEscalationNotification(
    target,
    message,
    context.organizationId,
    level.level
  );

  // Record the escalation
  const escalationRecord = await prisma.escalation.create({
    data: {
      id: `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionId: action.id,
      level: level.level,
      targetType: level.targetType,
      targetId: target.id,
      reason: context.pattern?.description || 'Manual escalation',
      status: 'pending',
      organizationId: context.organizationId,
      createdAt: new Date(),
    },
  });

  changes.push({
    entityType: 'escalation',
    entityId: escalationRecord.id,
    changeType: 'create',
    after: {
      level: level.level,
      targetId: target.id,
      targetName: target.name,
    },
  });

  // Update escalation state
  const newHistory: EscalationHistoryEntry = {
    level: level.level,
    targetId: target.id,
    targetName: target.name,
    escalatedAt: new Date(),
    acknowledged: false,
  };

  const newState: EscalationState = {
    patternId: context.pattern?.id || context.executionId,
    currentLevel: level.level,
    escalatedAt: new Date(),
    escalatedTo: [...(currentState?.escalatedTo || []), target.id],
    history: [...(currentState?.history || []), newHistory],
  };

  escalationState.set(stateKey, newState);

  // Schedule auto-escalation if wait time is set and there's a next level
  if (level.waitMinutes > 0) {
    await scheduleAutoEscalation(action.id, stateKey, level.waitMinutes);
  }

  logger.info(
    {
      actionId: action.id,
      level: level.level,
      targetId: target.id,
      targetName: target.name,
    },
    'Escalation performed'
  );

  return {
    success: true,
    affectedEntities: [target.id],
    changes,
    metrics: {
      escalationLevel: level.level,
      notificationsSent: 1,
    },
    rollbackData: {
      escalationRecordId: escalationRecord.id,
      notificationId,
      targetId: target.id,
    },
  };
}

/**
 * Validate escalation action configuration
 */
function validateEscalationConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const cfg = config as EscalationActionConfig;

  if (cfg.type !== 'escalation') {
    errors.push('Invalid action type for escalation action');
  }

  if (!cfg.escalationChain || cfg.escalationChain.length === 0) {
    errors.push('Escalation chain is required and must have at least one level');
  }

  if (cfg.escalationChain) {
    const levels = new Set<number>();
    for (const level of cfg.escalationChain) {
      if (levels.has(level.level)) {
        errors.push(`Duplicate escalation level: ${level.level}`);
      }
      levels.add(level.level);

      if (!['person', 'role', 'manager'].includes(level.targetType)) {
        errors.push(`Invalid target type at level ${level.level}`);
      }

      if (level.targetType === 'person' && !level.targetId) {
        errors.push(`Person target requires targetId at level ${level.level}`);
      }

      if (level.targetType === 'role' && !level.role) {
        errors.push(`Role target requires role at level ${level.level}`);
      }

      if (level.waitMinutes < 0) {
        errors.push(`Wait minutes cannot be negative at level ${level.level}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Rollback escalation
 */
async function rollbackEscalation(
  action: AutomatedAction,
  executionId: string,
  rollbackData: Record<string, unknown>
): Promise<boolean> {
  try {
    const escalationRecordId = rollbackData.escalationRecordId as string;

    // Cancel the escalation
    await prisma.escalation.update({
      where: { id: escalationRecordId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    // Send cancellation notification if possible
    const targetId = rollbackData.targetId as string;
    const target = await prisma.person.findUnique({
      where: { id: targetId },
      select: { id: true, name: true },
    });

    if (target) {
      await prisma.notification.create({
        data: {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'escalation_cancelled',
          title: 'Escalation Cancelled',
          message: 'A previous escalation has been cancelled.',
          recipientId: target.id,
          organizationId: action.organizationId,
          isRead: false,
          createdAt: new Date(),
        },
      });
    }

    logger.info({ executionId, escalationRecordId }, 'Escalation rolled back');
    return true;
  } catch (error) {
    logger.error({ error, executionId }, 'Failed to rollback escalation');
    return false;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

interface EscalationTarget {
  id: string;
  name: string;
  email?: string;
  isAvailable: boolean;
}

/**
 * Resolve escalation target based on level configuration
 */
async function resolveEscalationTarget(
  level: EscalationLevel,
  organizationId: string,
  skipUnavailable: boolean
): Promise<EscalationTarget | null> {
  switch (level.targetType) {
    case 'person':
      return resolvePersonTarget(level.targetId!, organizationId, skipUnavailable);
    case 'role':
      return resolveRoleTarget(level.role!, organizationId, skipUnavailable);
    case 'manager':
      return resolveManagerTarget(level.targetId, organizationId, skipUnavailable);
    default:
      return null;
  }
}

async function resolvePersonTarget(
  personId: string,
  organizationId: string,
  skipUnavailable: boolean
): Promise<EscalationTarget | null> {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      isOnLeave: true,
    },
  });

  if (!person) return null;

  const isAvailable = person.isActive && !person.isOnLeave;
  if (skipUnavailable && !isAvailable) return null;

  return {
    id: person.id,
    name: person.name,
    email: person.email || undefined,
    isAvailable,
  };
}

async function resolveRoleTarget(
  role: string,
  organizationId: string,
  skipUnavailable: boolean
): Promise<EscalationTarget | null> {
  const whereClause: Record<string, unknown> = {
    organizationId,
    role,
    isActive: true,
  };

  if (skipUnavailable) {
    whereClause.isOnLeave = false;
  }

  // Find person with the role, preferring available ones
  const person = await prisma.person.findFirst({
    where: whereClause,
    orderBy: [{ isOnLeave: 'asc' }, { currentWorkload: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      isOnLeave: true,
    },
  });

  if (!person) return null;

  return {
    id: person.id,
    name: person.name,
    email: person.email || undefined,
    isAvailable: person.isActive && !person.isOnLeave,
  };
}

async function resolveManagerTarget(
  personId: string | undefined,
  organizationId: string,
  skipUnavailable: boolean
): Promise<EscalationTarget | null> {
  if (!personId) {
    // If no person specified, find any manager
    return resolveRoleTarget('manager', organizationId, skipUnavailable);
  }

  // Find the manager of the specified person
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { managerId: true },
  });

  if (!person?.managerId) {
    // Fall back to any manager
    return resolveRoleTarget('manager', organizationId, skipUnavailable);
  }

  return resolvePersonTarget(person.managerId, organizationId, skipUnavailable);
}

/**
 * Build escalation message with context
 */
function buildEscalationMessage(
  context: ExecutionContext,
  config: EscalationActionConfig,
  level: EscalationLevel
): string {
  const parts: string[] = [
    `**Escalation Notice - Level ${level.level}**`,
    '',
  ];

  if (context.pattern) {
    parts.push(`**Issue:** ${context.pattern.description}`);
    parts.push(`**Severity:** ${context.pattern.severity}`);
    parts.push(`**First Detected:** ${context.pattern.firstDetectedAt.toISOString()}`);
    parts.push(`**Occurrences:** ${context.pattern.occurrences}`);

    if (config.includeContext && context.pattern.affectedEntities.length > 0) {
      parts.push('');
      parts.push('**Affected:**');
      for (const entity of context.pattern.affectedEntities) {
        parts.push(`- ${entity.name} (${entity.type})`);
      }
    }

    if (context.pattern.suggestedActions.length > 0) {
      parts.push('');
      parts.push('**Suggested Actions:**');
      for (const action of context.pattern.suggestedActions.slice(0, 3)) {
        parts.push(`- ${action}`);
      }
    }
  }

  parts.push('');
  parts.push('Please review and take appropriate action.');

  return parts.join('\n');
}

/**
 * Send escalation notification
 */
async function sendEscalationNotification(
  target: EscalationTarget,
  message: string,
  organizationId: string,
  level: number
): Promise<string> {
  const notification = await prisma.notification.create({
    data: {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'escalation',
      title: `Escalation Level ${level}`,
      message,
      recipientId: target.id,
      organizationId,
      isRead: false,
      priority: level >= 3 ? 'high' : 'normal',
      createdAt: new Date(),
    },
  });

  logger.info(
    { notificationId: notification.id, targetId: target.id, level },
    'Escalation notification sent'
  );

  return notification.id;
}

/**
 * Schedule automatic escalation to next level
 */
async function scheduleAutoEscalation(
  actionId: string,
  stateKey: string,
  delayMinutes: number
): Promise<void> {
  // In production, this would schedule a job via BullMQ
  logger.info(
    { actionId, stateKey, delayMinutes },
    'Auto-escalation scheduled (would use job queue)'
  );

  // await escalationQueue.add('auto-escalate', { actionId, stateKey }, {
  //   delay: delayMinutes * 60 * 1000,
  // });
}

// =============================================================================
// Additional Functions
// =============================================================================

/**
 * Acknowledge an escalation
 */
export async function acknowledgeEscalation(
  escalationId: string,
  acknowledgedBy: string
): Promise<boolean> {
  try {
    await prisma.escalation.update({
      where: { id: escalationId },
      data: {
        status: 'acknowledged',
        acknowledgedBy,
        acknowledgedAt: new Date(),
      },
    });

    logger.info({ escalationId, acknowledgedBy }, 'Escalation acknowledged');
    return true;
  } catch (error) {
    logger.error({ error, escalationId }, 'Failed to acknowledge escalation');
    return false;
  }
}

/**
 * Get current escalation level for a pattern
 */
export function getEscalationLevel(actionId: string, patternId: string): number {
  const state = escalationState.get(`${actionId}:${patternId}`);
  return state?.currentLevel || 0;
}

/**
 * Reset escalation state (e.g., when pattern is resolved)
 */
export function resetEscalationState(actionId: string, patternId: string): void {
  const stateKey = `${actionId}:${patternId}`;
  escalationState.delete(stateKey);
  logger.debug({ stateKey }, 'Escalation state reset');
}

// =============================================================================
// Register Action Executor
// =============================================================================

registerActionExecutor({
  actionType: 'escalation',
  execute: executeEscalation,
  validate: validateEscalationConfig,
  canRollback: true,
  rollback: rollbackEscalation,
});

export default {
  executeEscalation,
  validateEscalationConfig,
  acknowledgeEscalation,
  getEscalationLevel,
  resetEscalationState,
};
