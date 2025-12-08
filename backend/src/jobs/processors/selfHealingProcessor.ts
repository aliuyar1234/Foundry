/**
 * Self-Healing Processor
 * T148 - Create pattern detection job
 * T149 - Create action execution job
 *
 * Background job processor for self-healing operations
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { BaseProcessor, ProcessorContext } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import { detectPatterns, matchPatternsToActions } from '../../services/selfHealing/patternDetector.js';
import { executeAction, executeActionsForPatterns } from '../../services/selfHealing/actionExecutor.js';
import { runSafetyChecks, logSafetyResult } from '../../services/selfHealing/safetyChecks.js';
import {
  logPatternDetected,
  logActionTriggered,
  logActionExecuted,
  logActionCompleted,
  logActionFailed,
} from '../../services/selfHealing/auditTrail.js';
import { processExpiredApprovals, escalatePendingApprovals } from '../../services/selfHealing/approvalWorkflow.js';
import { runLearningAnalysis } from '../../services/selfHealing/learningService.js';
import type {
  PatternType,
  DetectedPattern,
  AutomatedAction,
  ActionExecution,
} from 'shared/types/selfHealing.js';

// =============================================================================
// Job Types
// =============================================================================

export type SelfHealingJobType =
  | 'pattern_scan'
  | 'action_execution'
  | 'approval_maintenance'
  | 'learning_analysis';

export interface SelfHealingJobData {
  type: SelfHealingJobType;
  organizationId: string;
  // Pattern scan options
  patternTypes?: PatternType[];
  timeWindowMinutes?: number;
  autoExecute?: boolean;
  // Action execution options
  actionId?: string;
  executionId?: string;
  patternId?: string;
  dryRun?: boolean;
  // Learning options
  analysisWindowDays?: number;
}

export interface SelfHealingJobResult {
  type: SelfHealingJobType;
  organizationId: string;
  duration: number;
  success: boolean;
  patternsDetected?: number;
  actionsExecuted?: number;
  approvalsProcessed?: number;
  learnedPatterns?: number;
  details?: Record<string, unknown>;
  completedAt: Date;
}

// =============================================================================
// Processor Implementation
// =============================================================================

export class SelfHealingProcessor extends BaseProcessor<
  SelfHealingJobData,
  SelfHealingJobResult
> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.SELF_HEALING || 'self-healing', prisma);
  }

  async process(
    job: Job<SelfHealingJobData>,
    context: ProcessorContext
  ): Promise<SelfHealingJobResult> {
    const { type, organizationId } = job.data;
    const startTime = Date.now();

    context.logger.info(`Starting self-healing job: ${type}`, {
      organizationId,
      jobId: job.id,
    });

    try {
      let result: Partial<SelfHealingJobResult>;

      switch (type) {
        case 'pattern_scan':
          result = await this.runPatternScan(job, context);
          break;
        case 'action_execution':
          result = await this.runActionExecution(job, context);
          break;
        case 'approval_maintenance':
          result = await this.runApprovalMaintenance(job, context);
          break;
        case 'learning_analysis':
          result = await this.runLearningAnalysis(job, context);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      return {
        type,
        organizationId,
        duration: Date.now() - startTime,
        success: true,
        ...result,
        completedAt: new Date(),
      };
    } catch (error) {
      context.logger.error(`Self-healing job failed: ${type}`, error as Error);

      return {
        type,
        organizationId,
        duration: Date.now() - startTime,
        success: false,
        details: { error: (error as Error).message },
        completedAt: new Date(),
      };
    }
  }

  // ===========================================================================
  // Pattern Scan (T148)
  // ===========================================================================

  private async runPatternScan(
    job: Job<SelfHealingJobData>,
    context: ProcessorContext
  ): Promise<Partial<SelfHealingJobResult>> {
    const { organizationId, patternTypes, timeWindowMinutes, autoExecute, dryRun } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 4,
      stage: 'detecting',
      message: 'Running pattern detection...',
    });

    // Run pattern detection
    const detectionResult = await detectPatterns({
      organizationId,
      patternTypes,
      timeWindowMinutes: timeWindowMinutes || 60,
    });

    context.logger.info('Patterns detected', {
      count: detectionResult.patterns.length,
      types: [...new Set(detectionResult.patterns.map((p) => p.type))],
    });

    // Log detected patterns to audit trail
    await this.updateProgress(job, {
      current: 1,
      total: 4,
      stage: 'logging',
      message: 'Logging detected patterns...',
    });

    for (const pattern of detectionResult.patterns) {
      await logPatternDetected(pattern, organizationId);
    }

    // Match patterns to actions
    await this.updateProgress(job, {
      current: 2,
      total: 4,
      stage: 'matching',
      message: 'Matching patterns to actions...',
    });

    await matchPatternsToActions(organizationId, detectionResult.patterns);

    // Execute actions if auto-execute is enabled
    let actionsExecuted = 0;
    const executionIds: string[] = [];

    if (autoExecute && detectionResult.patterns.length > 0) {
      await this.updateProgress(job, {
        current: 3,
        total: 4,
        stage: 'executing',
        message: 'Executing matched actions...',
      });

      const executions = await executeActionsForPatterns(
        organizationId,
        detectionResult.patterns,
        { dryRun }
      );

      actionsExecuted = executions.length;
      executionIds.push(...executions.map((e) => e.id));
    }

    await this.updateProgress(job, {
      current: 4,
      total: 4,
      stage: 'complete',
      message: 'Pattern scan completed',
    });

    return {
      patternsDetected: detectionResult.patterns.length,
      actionsExecuted,
      details: {
        patternTypes: [...new Set(detectionResult.patterns.map((p) => p.type))],
        executionIds,
        scanDurationMs: detectionResult.scanDurationMs,
      },
    };
  }

  // ===========================================================================
  // Action Execution (T149)
  // ===========================================================================

  private async runActionExecution(
    job: Job<SelfHealingJobData>,
    context: ProcessorContext
  ): Promise<Partial<SelfHealingJobResult>> {
    const { organizationId, actionId, executionId, patternId, dryRun } = job.data;

    if (!actionId) {
      throw new Error('actionId is required for action execution');
    }

    await this.updateProgress(job, {
      current: 0,
      total: 4,
      stage: 'loading',
      message: 'Loading action configuration...',
    });

    // Load action
    const action = await this.prisma.automatedAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    // Load pattern if specified
    let pattern: DetectedPattern | undefined;
    if (patternId) {
      // In a real implementation, we'd load the pattern from cache or DB
      pattern = undefined;
    }

    // Run safety checks
    await this.updateProgress(job, {
      current: 1,
      total: 4,
      stage: 'safety',
      message: 'Running safety checks...',
    });

    const safetyResult = await runSafetyChecks(
      action as AutomatedAction,
      pattern || null
    );

    await logSafetyResult(actionId, safetyResult, organizationId);

    if (!safetyResult.passed) {
      context.logger.warn('Safety checks failed', {
        actionId,
        reason: safetyResult.blockedReason,
      });

      return {
        actionsExecuted: 0,
        details: {
          blocked: true,
          reason: safetyResult.blockedReason,
          checks: safetyResult.checks,
        },
      };
    }

    // Execute action
    await this.updateProgress(job, {
      current: 2,
      total: 4,
      stage: 'executing',
      message: 'Executing action...',
    });

    const executionContext = {
      executionId: executionId || `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      triggeredBy: 'schedule' as const,
      pattern,
      organizationId,
    };

    await logActionTriggered(action as AutomatedAction, 'system', pattern);

    const execution = await executeAction(
      action as AutomatedAction,
      executionContext,
      { dryRun }
    );

    // Log result
    await this.updateProgress(job, {
      current: 3,
      total: 4,
      stage: 'logging',
      message: 'Logging execution result...',
    });

    if (execution.status === 'completed') {
      await logActionCompleted(
        execution,
        action as AutomatedAction,
        execution.result || {}
      );
    } else if (execution.status === 'failed') {
      await logActionFailed(
        execution,
        action as AutomatedAction,
        execution.errorMessage || 'Unknown error'
      );
    }

    await this.updateProgress(job, {
      current: 4,
      total: 4,
      stage: 'complete',
      message: 'Action execution completed',
    });

    return {
      actionsExecuted: execution.status === 'completed' ? 1 : 0,
      details: {
        executionId: execution.id,
        status: execution.status,
        result: execution.result,
        errorMessage: execution.errorMessage,
      },
    };
  }

  // ===========================================================================
  // Approval Maintenance
  // ===========================================================================

  private async runApprovalMaintenance(
    job: Job<SelfHealingJobData>,
    context: ProcessorContext
  ): Promise<Partial<SelfHealingJobResult>> {
    const { organizationId } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 2,
      stage: 'expired',
      message: 'Processing expired approvals...',
    });

    // Process expired approvals
    const expiredCount = await processExpiredApprovals(organizationId);

    await this.updateProgress(job, {
      current: 1,
      total: 2,
      stage: 'escalation',
      message: 'Escalating pending approvals...',
    });

    // Escalate stale approvals
    const escalatedCount = await escalatePendingApprovals(organizationId);

    await this.updateProgress(job, {
      current: 2,
      total: 2,
      stage: 'complete',
      message: 'Approval maintenance completed',
    });

    return {
      approvalsProcessed: expiredCount + escalatedCount,
      details: {
        expiredCount,
        escalatedCount,
      },
    };
  }

  // ===========================================================================
  // Learning Analysis
  // ===========================================================================

  private async runLearningAnalysis(
    job: Job<SelfHealingJobData>,
    context: ProcessorContext
  ): Promise<Partial<SelfHealingJobResult>> {
    const { organizationId, analysisWindowDays } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 2,
      stage: 'analyzing',
      message: 'Running learning analysis...',
    });

    const result = await runLearningAnalysis(organizationId, {
      analysisWindowDays: analysisWindowDays || 30,
    });

    await this.updateProgress(job, {
      current: 2,
      total: 2,
      stage: 'complete',
      message: 'Learning analysis completed',
    });

    return {
      learnedPatterns: result.newPatterns.length + result.updatedPatterns.length,
      details: {
        newPatterns: result.newPatterns.length,
        updatedPatterns: result.updatedPatterns.length,
        suggestions: result.suggestions.length,
      },
    };
  }
}

// =============================================================================
// Factory and Scheduling Functions
// =============================================================================

export function createSelfHealingProcessor(prisma: PrismaClient): SelfHealingProcessor {
  return new SelfHealingProcessor(prisma);
}

/**
 * Schedule recurring self-healing jobs for an organization
 */
export async function scheduleSelfHealingJobs(
  organizationId: string,
  options: {
    patternScanIntervalMinutes?: number;
    approvalMaintenanceIntervalMinutes?: number;
    learningAnalysisIntervalHours?: number;
  } = {}
): Promise<void> {
  const {
    patternScanIntervalMinutes = 15,
    approvalMaintenanceIntervalMinutes = 60,
    learningAnalysisIntervalHours = 24,
  } = options;

  // In production, these would be scheduled via BullMQ's repeat option
  console.info('Self-healing jobs scheduled (would use job queue)', {
    organizationId,
    patternScanIntervalMinutes,
    approvalMaintenanceIntervalMinutes,
    learningAnalysisIntervalHours,
  });

  // Example BullMQ scheduling:
  // await selfHealingQueue.add('pattern_scan', {
  //   type: 'pattern_scan',
  //   organizationId,
  //   autoExecute: true,
  // }, {
  //   repeat: { every: patternScanIntervalMinutes * 60 * 1000 },
  //   jobId: `pattern-scan-${organizationId}`,
  // });
}

/**
 * Run immediate self-healing operation
 */
export async function runImmediateSelfHealing(
  prisma: PrismaClient,
  data: SelfHealingJobData
): Promise<SelfHealingJobResult> {
  const processor = createSelfHealingProcessor(prisma);

  // Create a mock job for direct processing
  const mockJob = {
    id: `manual-${Date.now()}`,
    data,
    updateProgress: async () => {},
  } as unknown as Job<SelfHealingJobData>;

  const context: ProcessorContext = {
    prisma,
    logger: {
      info: (msg, data) => console.info(msg, data),
      warn: (msg, data) => console.warn(msg, data),
      error: (msg, err, data) => console.error(msg, err, data),
      debug: (msg, data) => console.debug(msg, data),
    },
  };

  return processor.process(mockJob, context);
}

export default SelfHealingProcessor;
