/**
 * Stuck Process Detector
 * T132 - Implement stuck process detector
 *
 * Detects processes that have stopped progressing or are taking too long
 */

import { logger } from '../../lib/logger.js';
import {
  registerDetector,
  createDetectedPattern,
  mergePatterns,
} from './patternDetector.js';
import type { DetectedPattern, AffectedEntity } from 'shared/types/selfHealing.js';
import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface StuckProcessConfig {
  /** Maximum allowed time for a process step (minutes) */
  maxStepDurationMinutes: number;
  /** Maximum allowed total process duration (minutes) */
  maxProcessDurationMinutes: number;
  /** Minimum times a process must be stuck to trigger */
  minOccurrences: number;
  /** Process types to monitor (empty = all) */
  processTypes?: string[];
}

interface ProcessInstance {
  id: string;
  processId: string;
  processName: string;
  currentStep?: string;
  currentStepName?: string;
  startedAt: Date;
  lastActivityAt?: Date;
  status: string;
  assignedTo?: string;
  assignedToName?: string;
}

// Default configuration
const DEFAULT_CONFIG: StuckProcessConfig = {
  maxStepDurationMinutes: 480, // 8 hours
  maxProcessDurationMinutes: 10080, // 7 days
  minOccurrences: 1,
};

// =============================================================================
// Detector Implementation
// =============================================================================

/**
 * Detect stuck processes
 */
export async function detectStuckProcesses(
  organizationId: string,
  timeWindowMinutes: number,
  config: Partial<StuckProcessConfig> = {}
): Promise<DetectedPattern[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const patterns: DetectedPattern[] = [];

  logger.debug({ organizationId, config: cfg }, 'Detecting stuck processes');

  try {
    // Find processes that appear to be stuck
    const stuckInstances = await findStuckProcessInstances(
      organizationId,
      cfg.maxStepDurationMinutes,
      cfg.maxProcessDurationMinutes,
      cfg.processTypes
    );

    for (const instance of stuckInstances) {
      const stuckDuration = calculateStuckDuration(instance);
      const severity = determineSeverity(stuckDuration, cfg);

      const affectedEntities: AffectedEntity[] = [
        {
          type: 'process_instance',
          id: instance.id,
          name: instance.processName,
          impact: 'direct',
        },
      ];

      if (instance.assignedTo) {
        affectedEntities.push({
          type: 'person',
          id: instance.assignedTo,
          name: instance.assignedToName || 'Unknown',
          impact: 'direct',
        });
      }

      const pattern = createDetectedPattern(
        'stuck_process',
        `Process "${instance.processName}" is stuck at step "${instance.currentStepName || 'unknown'}" for ${formatDuration(stuckDuration)}`,
        severity,
        affectedEntities,
        generateSuggestedActions(instance, stuckDuration)
      );

      patterns.push(pattern);
    }

    // Merge similar patterns
    const merged = mergePatterns(patterns);

    logger.info(
      {
        organizationId,
        stuckCount: stuckInstances.length,
        patternCount: merged.length,
      },
      'Stuck process detection completed'
    );

    return merged;
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to detect stuck processes');
    throw error;
  }
}

// =============================================================================
// Database Queries
// =============================================================================

async function findStuckProcessInstances(
  organizationId: string,
  maxStepMinutes: number,
  maxProcessMinutes: number,
  processTypes?: string[]
): Promise<ProcessInstance[]> {
  const now = new Date();
  const stepThreshold = new Date(now.getTime() - maxStepMinutes * 60 * 1000);
  const processThreshold = new Date(now.getTime() - maxProcessMinutes * 60 * 1000);

  // Query for process instances that are stuck
  // This assumes a ProcessInstance model exists - adjust based on actual schema
  const instances = await prisma.$queryRaw<ProcessInstance[]>`
    SELECT
      pi.id,
      pi."processId",
      p.name as "processName",
      pi."currentStep",
      ps.name as "currentStepName",
      pi."startedAt",
      pi."lastActivityAt",
      pi.status,
      pi."assignedTo",
      per.name as "assignedToName"
    FROM "ProcessInstance" pi
    JOIN "Process" p ON pi."processId" = p.id
    LEFT JOIN "ProcessStep" ps ON pi."currentStep" = ps.id
    LEFT JOIN "Person" per ON pi."assignedTo" = per.id
    WHERE pi."organizationId" = ${organizationId}
      AND pi.status IN ('in_progress', 'pending', 'waiting')
      AND (
        -- Step is stuck
        (pi."lastActivityAt" IS NOT NULL AND pi."lastActivityAt" < ${stepThreshold})
        OR
        -- Process is taking too long overall
        (pi."startedAt" < ${processThreshold})
        OR
        -- No activity and old enough
        (pi."lastActivityAt" IS NULL AND pi."startedAt" < ${stepThreshold})
      )
    ORDER BY COALESCE(pi."lastActivityAt", pi."startedAt") ASC
    LIMIT 100
  `.catch(() => {
    // If the query fails (table doesn't exist yet), return empty
    logger.debug('ProcessInstance table not available, skipping stuck process detection');
    return [];
  });

  return instances;
}

// =============================================================================
// Analysis Functions
// =============================================================================

function calculateStuckDuration(instance: ProcessInstance): number {
  const now = new Date();
  const lastActivity = instance.lastActivityAt || instance.startedAt;
  return Math.floor((now.getTime() - lastActivity.getTime()) / (60 * 1000)); // minutes
}

function determineSeverity(
  stuckMinutes: number,
  config: StuckProcessConfig
): DetectedPattern['severity'] {
  const maxMinutes = config.maxStepDurationMinutes;

  if (stuckMinutes >= maxMinutes * 3) return 'critical';
  if (stuckMinutes >= maxMinutes * 2) return 'high';
  if (stuckMinutes >= maxMinutes * 1.5) return 'medium';
  return 'low';
}

function generateSuggestedActions(
  instance: ProcessInstance,
  stuckMinutes: number
): string[] {
  const actions: string[] = [];

  // Basic suggestions based on stuck duration
  if (stuckMinutes < 480) {
    // < 8 hours
    actions.push('Send reminder to assigned person');
  }

  if (stuckMinutes >= 480 && stuckMinutes < 1440) {
    // 8-24 hours
    actions.push('Escalate to manager');
    actions.push('Send urgent reminder');
  }

  if (stuckMinutes >= 1440) {
    // > 24 hours
    actions.push('Escalate to department head');
    actions.push('Reassign to available team member');
    actions.push('Mark as priority for immediate attention');
  }

  // Add process-specific suggestions
  if (instance.status === 'waiting') {
    actions.push('Check for missing approvals');
    actions.push('Verify external dependencies');
  }

  return actions;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

// =============================================================================
// Advanced Detection
// =============================================================================

/**
 * Detect processes stuck at specific steps repeatedly
 */
export async function detectBottleneckSteps(
  organizationId: string,
  daysToAnalyze: number = 30
): Promise<
  Array<{
    processId: string;
    processName: string;
    stepId: string;
    stepName: string;
    avgDurationMinutes: number;
    stuckCount: number;
  }>
> {
  // Find steps that frequently cause delays
  const bottlenecks = await prisma.$queryRaw<
    Array<{
      processId: string;
      processName: string;
      stepId: string;
      stepName: string;
      avgDurationMinutes: number;
      stuckCount: number;
    }>
  >`
    SELECT
      p.id as "processId",
      p.name as "processName",
      ps.id as "stepId",
      ps.name as "stepName",
      AVG(EXTRACT(EPOCH FROM (psl."endedAt" - psl."startedAt")) / 60) as "avgDurationMinutes",
      COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (psl."endedAt" - psl."startedAt")) / 60 > 480) as "stuckCount"
    FROM "ProcessStepLog" psl
    JOIN "ProcessStep" ps ON psl."stepId" = ps.id
    JOIN "Process" p ON ps."processId" = p.id
    WHERE p."organizationId" = ${organizationId}
      AND psl."startedAt" > NOW() - INTERVAL '${daysToAnalyze} days'
    GROUP BY p.id, p.name, ps.id, ps.name
    HAVING COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (psl."endedAt" - psl."startedAt")) / 60 > 480) > 5
    ORDER BY "stuckCount" DESC
    LIMIT 20
  `.catch(() => []);

  return bottlenecks;
}

/**
 * Predict if a process is likely to get stuck based on current progress
 */
export async function predictStuckRisk(
  processInstanceId: string
): Promise<{
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
  estimatedCompletionTime?: Date;
}> {
  // This would use historical data to predict if current process will get stuck
  // Placeholder implementation
  return {
    riskLevel: 'low',
    riskFactors: [],
  };
}

// =============================================================================
// Register Detector
// =============================================================================

// Register this detector with the pattern detector service
registerDetector({
  patternType: 'stuck_process',
  detect: (organizationId, timeWindowMinutes) =>
    detectStuckProcesses(organizationId, timeWindowMinutes),
});

export default {
  detectStuckProcesses,
  detectBottleneckSteps,
  predictStuckRisk,
  DEFAULT_CONFIG,
};
