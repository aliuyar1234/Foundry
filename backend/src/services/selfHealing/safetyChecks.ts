/**
 * Safety Checks Service
 * T142 - Implement safety checks
 *
 * Validates actions before execution to prevent harmful operations
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import type {
  AutomatedAction,
  ActionConfig,
  DetectedPattern,
} from 'shared/types/selfHealing.js';

// =============================================================================
// Types
// =============================================================================

export interface SafetyCheckResult {
  passed: boolean;
  checks: SafetyCheck[];
  blockedReason?: string;
  warnings: string[];
}

export interface SafetyCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface SafetyPolicy {
  /** Maximum actions per hour per organization */
  maxActionsPerHour: number;
  /** Maximum concurrent executions */
  maxConcurrentExecutions: number;
  /** Maximum affected entities per action */
  maxAffectedEntities: number;
  /** Minimum time between same action executions (minutes) */
  minActionCooldownMinutes: number;
  /** Action types that require human approval */
  requireApprovalTypes: string[];
  /** Severity levels that require human approval */
  requireApprovalSeverities: string[];
  /** Blocked hours (0-23) */
  blockedHours: number[];
  /** Blocked days (0=Sunday, 6=Saturday) */
  blockedDays: number[];
  /** Enable dry-run mode globally */
  dryRunMode: boolean;
}

const DEFAULT_POLICY: SafetyPolicy = {
  maxActionsPerHour: 100,
  maxConcurrentExecutions: 10,
  maxAffectedEntities: 50,
  minActionCooldownMinutes: 5,
  requireApprovalTypes: ['redistribute'],
  requireApprovalSeverities: ['critical'],
  blockedHours: [],
  blockedDays: [],
  dryRunMode: false,
};

// =============================================================================
// Safety Check Functions
// =============================================================================

/**
 * Run all safety checks for an action
 */
export async function runSafetyChecks(
  action: AutomatedAction,
  pattern: DetectedPattern | null,
  policy: Partial<SafetyPolicy> = {}
): Promise<SafetyCheckResult> {
  const cfg = { ...DEFAULT_POLICY, ...policy };
  const checks: SafetyCheck[] = [];
  const warnings: string[] = [];

  logger.debug({ actionId: action.id }, 'Running safety checks');

  // Run all checks
  checks.push(await checkRateLimits(action, cfg));
  checks.push(await checkConcurrentExecutions(action, cfg));
  checks.push(await checkAffectedEntitiesLimit(pattern, cfg));
  checks.push(await checkCooldownPeriod(action, cfg));
  checks.push(checkTimeRestrictions(cfg));
  checks.push(checkApprovalRequirement(action, pattern, cfg));
  checks.push(await checkActionConfiguration(action));
  checks.push(await checkTargetAvailability(action));

  // Collect warnings
  for (const check of checks) {
    if (check.severity === 'warning' && !check.passed) {
      warnings.push(check.message);
    }
  }

  // Determine overall result
  const criticalFailures = checks.filter(
    (c) => !c.passed && (c.severity === 'critical' || c.severity === 'error')
  );

  const passed = criticalFailures.length === 0;
  const blockedReason = criticalFailures[0]?.message;

  const result: SafetyCheckResult = {
    passed,
    checks,
    blockedReason,
    warnings,
  };

  logger.info(
    {
      actionId: action.id,
      passed,
      checkCount: checks.length,
      failedCount: checks.filter((c) => !c.passed).length,
    },
    'Safety checks completed'
  );

  return result;
}

/**
 * Check rate limits
 */
async function checkRateLimits(
  action: AutomatedAction,
  policy: SafetyPolicy
): Promise<SafetyCheck> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentExecutions = await prisma.actionExecution.count({
    where: {
      organizationId: action.organizationId,
      createdAt: { gte: oneHourAgo },
    },
  });

  const passed = recentExecutions < policy.maxActionsPerHour;

  return {
    name: 'rate_limit',
    passed,
    message: passed
      ? `Within rate limit (${recentExecutions}/${policy.maxActionsPerHour})`
      : `Rate limit exceeded: ${recentExecutions} actions in the last hour (max: ${policy.maxActionsPerHour})`,
    severity: 'error',
  };
}

/**
 * Check concurrent execution limit
 */
async function checkConcurrentExecutions(
  action: AutomatedAction,
  policy: SafetyPolicy
): Promise<SafetyCheck> {
  const activeExecutions = await prisma.actionExecution.count({
    where: {
      organizationId: action.organizationId,
      status: 'executing',
    },
  });

  const passed = activeExecutions < policy.maxConcurrentExecutions;

  return {
    name: 'concurrent_limit',
    passed,
    message: passed
      ? `Within concurrent limit (${activeExecutions}/${policy.maxConcurrentExecutions})`
      : `Too many concurrent executions: ${activeExecutions} active (max: ${policy.maxConcurrentExecutions})`,
    severity: 'error',
  };
}

/**
 * Check affected entities limit
 */
async function checkAffectedEntitiesLimit(
  pattern: DetectedPattern | null,
  policy: SafetyPolicy
): Promise<SafetyCheck> {
  if (!pattern) {
    return {
      name: 'affected_entities',
      passed: true,
      message: 'No pattern provided, skipping entity limit check',
      severity: 'info',
    };
  }

  const entityCount = pattern.affectedEntities.length;
  const passed = entityCount <= policy.maxAffectedEntities;

  return {
    name: 'affected_entities',
    passed,
    message: passed
      ? `Within entity limit (${entityCount}/${policy.maxAffectedEntities})`
      : `Too many affected entities: ${entityCount} (max: ${policy.maxAffectedEntities})`,
    severity: passed ? 'info' : 'warning',
  };
}

/**
 * Check cooldown period between same action executions
 */
async function checkCooldownPeriod(
  action: AutomatedAction,
  policy: SafetyPolicy
): Promise<SafetyCheck> {
  if (policy.minActionCooldownMinutes <= 0) {
    return {
      name: 'cooldown',
      passed: true,
      message: 'Cooldown check disabled',
      severity: 'info',
    };
  }

  const cooldownSince = new Date(
    Date.now() - policy.minActionCooldownMinutes * 60 * 1000
  );

  const recentExecution = await prisma.actionExecution.findFirst({
    where: {
      actionId: action.id,
      createdAt: { gte: cooldownSince },
      status: { in: ['completed', 'executing'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  const passed = !recentExecution;

  return {
    name: 'cooldown',
    passed,
    message: passed
      ? 'Cooldown period satisfied'
      : `Action was executed recently (cooldown: ${policy.minActionCooldownMinutes} minutes)`,
    severity: 'warning',
  };
}

/**
 * Check time restrictions (blocked hours/days)
 */
function checkTimeRestrictions(policy: SafetyPolicy): SafetyCheck {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  const hourBlocked = policy.blockedHours.includes(currentHour);
  const dayBlocked = policy.blockedDays.includes(currentDay);

  const passed = !hourBlocked && !dayBlocked;

  let message = 'Within allowed execution window';
  if (hourBlocked) {
    message = `Execution blocked during hour ${currentHour}`;
  } else if (dayBlocked) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    message = `Execution blocked on ${dayNames[currentDay]}`;
  }

  return {
    name: 'time_restriction',
    passed,
    message,
    severity: passed ? 'info' : 'error',
  };
}

/**
 * Check if action requires approval
 */
function checkApprovalRequirement(
  action: AutomatedAction,
  pattern: DetectedPattern | null,
  policy: SafetyPolicy
): SafetyCheck {
  const typeRequiresApproval = policy.requireApprovalTypes.includes(action.actionType);
  const severityRequiresApproval =
    pattern && policy.requireApprovalSeverities.includes(pattern.severity);

  const requiresApproval =
    action.requiresApproval || typeRequiresApproval || severityRequiresApproval;

  return {
    name: 'approval_required',
    passed: true, // This is informational, doesn't block
    message: requiresApproval
      ? 'Action requires approval before execution'
      : 'Action can execute automatically',
    severity: requiresApproval ? 'warning' : 'info',
  };
}

/**
 * Check action configuration validity
 */
async function checkActionConfiguration(
  action: AutomatedAction
): Promise<SafetyCheck> {
  const issues: string[] = [];

  // Check trigger config
  if (!action.triggerConfig) {
    issues.push('Missing trigger configuration');
  }

  // Check action config
  if (!action.actionConfig) {
    issues.push('Missing action configuration');
  }

  // Type-specific validation
  const config = action.actionConfig as ActionConfig;
  switch (action.actionType) {
    case 'reminder':
      if (!(config as { messageTemplate?: string }).messageTemplate) {
        issues.push('Reminder action missing message template');
      }
      break;
    case 'escalation':
      if (!(config as { escalationChain?: unknown[] }).escalationChain?.length) {
        issues.push('Escalation action missing escalation chain');
      }
      break;
    case 'retry':
      if ((config as { maxAttempts?: number }).maxAttempts! > 10) {
        issues.push('Retry action has excessive max attempts (>10)');
      }
      break;
  }

  const passed = issues.length === 0;

  return {
    name: 'configuration',
    passed,
    message: passed
      ? 'Action configuration is valid'
      : `Configuration issues: ${issues.join(', ')}`,
    severity: passed ? 'info' : 'error',
  };
}

/**
 * Check target availability
 */
async function checkTargetAvailability(
  action: AutomatedAction
): Promise<SafetyCheck> {
  const config = action.actionConfig as ActionConfig & { target?: string; targetPool?: string[] };

  // Skip for actions without specific targets
  if (!config.target && !config.targetPool) {
    return {
      name: 'target_availability',
      passed: true,
      message: 'No specific target to validate',
      severity: 'info',
    };
  }

  // Check person availability
  if (config.target) {
    const person = await prisma.person.findFirst({
      where: {
        OR: [
          { id: config.target },
          { role: config.target },
        ],
        organizationId: action.organizationId,
        isActive: true,
      },
    });

    if (!person) {
      return {
        name: 'target_availability',
        passed: false,
        message: `Target "${config.target}" not found or inactive`,
        severity: 'warning',
      };
    }

    if ((person as { isOnLeave?: boolean }).isOnLeave) {
      return {
        name: 'target_availability',
        passed: false,
        message: `Target "${config.target}" is currently on leave`,
        severity: 'warning',
      };
    }
  }

  return {
    name: 'target_availability',
    passed: true,
    message: 'Target is available',
    severity: 'info',
  };
}

// =============================================================================
// Additional Safety Functions
// =============================================================================

/**
 * Validate action before creation/update
 */
export async function validateActionSafety(
  action: Partial<AutomatedAction>,
  organizationId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check action type is known
  const knownTypes = ['reminder', 'escalation', 'retry', 'redistribute', 'notify', 'custom'];
  if (action.actionType && !knownTypes.includes(action.actionType)) {
    errors.push(`Unknown action type: ${action.actionType}`);
  }

  // Check trigger type is known
  const knownTriggers = ['pattern', 'threshold', 'schedule', 'event'];
  if (action.triggerType && !knownTriggers.includes(action.triggerType)) {
    errors.push(`Unknown trigger type: ${action.triggerType}`);
  }

  // Prevent dangerous configurations
  if (action.actionType === 'custom') {
    const customConfig = action.actionConfig as { webhookUrl?: string };
    if (customConfig?.webhookUrl) {
      // Block internal URLs
      if (
        customConfig.webhookUrl.includes('localhost') ||
        customConfig.webhookUrl.includes('127.0.0.1') ||
        customConfig.webhookUrl.includes('0.0.0.0')
      ) {
        errors.push('Custom webhook cannot target localhost');
      }

      // Block non-HTTPS in production
      if (
        process.env.NODE_ENV === 'production' &&
        !customConfig.webhookUrl.startsWith('https://')
      ) {
        errors.push('Custom webhook must use HTTPS in production');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get safety statistics for an organization
 */
export async function getSafetyStatistics(
  organizationId: string,
  days: number = 7
): Promise<{
  blockedExecutions: number;
  warningCount: number;
  byCheckType: Record<string, number>;
  riskScore: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get blocked executions (would need a blocked_executions table in real implementation)
  const blockedExecutions = await prisma.auditLog.count({
    where: {
      action: 'safety_block',
      createdAt: { gte: since },
    },
  });

  // Get warnings
  const warningLogs = await prisma.auditLog.findMany({
    where: {
      action: 'safety_warning',
      createdAt: { gte: since },
    },
    select: { details: true },
  });

  const byCheckType: Record<string, number> = {};
  for (const log of warningLogs) {
    const checkType = (log.details as { checkType?: string })?.checkType || 'unknown';
    byCheckType[checkType] = (byCheckType[checkType] || 0) + 1;
  }

  // Calculate risk score (0-100)
  const totalExecutions = await prisma.actionExecution.count({
    where: { organizationId, createdAt: { gte: since } },
  });

  const riskScore =
    totalExecutions > 0
      ? Math.min(100, Math.round((blockedExecutions / totalExecutions) * 100))
      : 0;

  return {
    blockedExecutions,
    warningCount: warningLogs.length,
    byCheckType,
    riskScore,
  };
}

/**
 * Log safety check result
 */
export async function logSafetyResult(
  actionId: string,
  result: SafetyCheckResult,
  organizationId: string
): Promise<void> {
  const action = result.passed ? 'safety_pass' : 'safety_block';

  await prisma.auditLog.create({
    data: {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      entityType: 'automated_action',
      entityId: actionId,
      performedBy: 'system',
      details: {
        passed: result.passed,
        checkCount: result.checks.length,
        failedChecks: result.checks
          .filter((c) => !c.passed)
          .map((c) => ({ name: c.name, message: c.message })),
        warnings: result.warnings,
      },
      organizationId,
      createdAt: new Date(),
    },
  });
}

export default {
  runSafetyChecks,
  validateActionSafety,
  getSafetyStatistics,
  logSafetyResult,
  DEFAULT_POLICY,
};
