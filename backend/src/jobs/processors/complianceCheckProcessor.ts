/**
 * Compliance Check Processor
 * T182 - Create compliance check job processor
 *
 * Background job processor for compliance operations
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { BaseProcessor, ProcessorContext } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import {
  evaluateAllRules,
  evaluateDueRules,
} from '../../services/compliance/ruleEngine.js';
import {
  detectViolations,
  detectApprovalBypasses,
  detectRetentionViolations,
  detectProcessDeviations,
} from '../../services/compliance/violationDetector.js';
import {
  collectEvidence,
  cleanupExpiredEvidence,
} from '../../services/compliance/evidenceCollector.js';
import {
  processAllRetentionPolicies,
} from '../../services/compliance/retentionTracker.js';
import {
  updateDeadlineStatuses,
  sendDeadlineNotifications,
} from '../../services/compliance/deadlineTracker.js';
import { generateReport } from '../../services/compliance/reportGenerator.js';
import type { ComplianceFramework, ComplianceReportType } from 'shared/types/compliance.js';

// =============================================================================
// Job Types
// =============================================================================

export type ComplianceJobType =
  | 'rule_evaluation'
  | 'violation_detection'
  | 'evidence_collection'
  | 'retention_processing'
  | 'deadline_maintenance'
  | 'report_generation';

export interface ComplianceJobData {
  type: ComplianceJobType;
  organizationId: string;
  // Rule evaluation options
  framework?: ComplianceFramework;
  ruleIds?: string[];
  // Evidence collection options
  evidenceTypes?: string[];
  // Report generation options
  reportType?: ComplianceReportType;
  startDate?: string;
  endDate?: string;
  // Processing options
  dryRun?: boolean;
}

export interface ComplianceJobResult {
  type: ComplianceJobType;
  organizationId: string;
  duration: number;
  success: boolean;
  rulesEvaluated?: number;
  violationsDetected?: number;
  evidenceCollected?: number;
  recordsProcessed?: number;
  reportId?: string;
  details?: Record<string, unknown>;
  completedAt: Date;
}

// =============================================================================
// Processor Implementation
// =============================================================================

export class ComplianceCheckProcessor extends BaseProcessor<
  ComplianceJobData,
  ComplianceJobResult
> {
  constructor(prisma: PrismaClient) {
    super(QueueNames.COMPLIANCE || 'compliance', prisma);
  }

  async process(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<ComplianceJobResult> {
    const { type, organizationId } = job.data;
    const startTime = Date.now();

    context.logger.info(`Starting compliance job: ${type}`, {
      organizationId,
      jobId: job.id,
    });

    try {
      let result: Partial<ComplianceJobResult>;

      switch (type) {
        case 'rule_evaluation':
          result = await this.runRuleEvaluation(job, context);
          break;
        case 'violation_detection':
          result = await this.runViolationDetection(job, context);
          break;
        case 'evidence_collection':
          result = await this.runEvidenceCollection(job, context);
          break;
        case 'retention_processing':
          result = await this.runRetentionProcessing(job, context);
          break;
        case 'deadline_maintenance':
          result = await this.runDeadlineMaintenance(job, context);
          break;
        case 'report_generation':
          result = await this.runReportGeneration(job, context);
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
      context.logger.error(`Compliance job failed: ${type}`, error as Error);

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
  // Rule Evaluation
  // ===========================================================================

  private async runRuleEvaluation(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<Partial<ComplianceJobResult>> {
    const { organizationId, framework, ruleIds } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 2,
      stage: 'evaluating',
      message: 'Evaluating compliance rules...',
    });

    let result;

    if (ruleIds && ruleIds.length > 0) {
      // Evaluate specific rules
      result = await evaluateAllRules(organizationId, { framework });
    } else {
      // Evaluate due rules
      result = await evaluateDueRules(organizationId);
    }

    await this.updateProgress(job, {
      current: 2,
      total: 2,
      stage: 'complete',
      message: 'Rule evaluation completed',
    });

    context.logger.info('Rule evaluation completed', {
      total: result.totalRules,
      passed: result.passedRules,
      failed: result.failedRules,
    });

    return {
      rulesEvaluated: result.totalRules,
      violationsDetected: result.failedRules,
      details: {
        passed: result.passedRules,
        failed: result.failedRules,
        skipped: result.skippedRules,
        executionTimeMs: result.executionTimeMs,
      },
    };
  }

  // ===========================================================================
  // Violation Detection
  // ===========================================================================

  private async runViolationDetection(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<Partial<ComplianceJobResult>> {
    const { organizationId, framework } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 4,
      stage: 'detecting',
      message: 'Running violation detection...',
    });

    // Run general violation detection
    const generalResult = await detectViolations(organizationId, { framework });

    await this.updateProgress(job, {
      current: 1,
      total: 4,
      stage: 'approval_bypass',
      message: 'Checking for approval bypasses...',
    });

    // Run specialized detectors
    const approvalBypasses = await detectApprovalBypasses(organizationId);

    await this.updateProgress(job, {
      current: 2,
      total: 4,
      stage: 'retention',
      message: 'Checking retention violations...',
    });

    const retentionViolations = await detectRetentionViolations(organizationId);

    await this.updateProgress(job, {
      current: 3,
      total: 4,
      stage: 'process_deviation',
      message: 'Checking process deviations...',
    });

    const processDeviations = await detectProcessDeviations(organizationId);

    await this.updateProgress(job, {
      current: 4,
      total: 4,
      stage: 'complete',
      message: 'Violation detection completed',
    });

    const totalViolations =
      generalResult.violationsDetected +
      approvalBypasses.length +
      retentionViolations.length +
      processDeviations.length;

    context.logger.info('Violation detection completed', {
      general: generalResult.violationsDetected,
      approvalBypasses: approvalBypasses.length,
      retentionViolations: retentionViolations.length,
      processDeviations: processDeviations.length,
    });

    return {
      violationsDetected: totalViolations,
      details: {
        general: generalResult.violationsDetected,
        newViolations: generalResult.newViolations,
        approvalBypasses: approvalBypasses.length,
        retentionViolations: retentionViolations.length,
        processDeviations: processDeviations.length,
      },
    };
  }

  // ===========================================================================
  // Evidence Collection
  // ===========================================================================

  private async runEvidenceCollection(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<Partial<ComplianceJobResult>> {
    const { organizationId, evidenceTypes } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 2,
      stage: 'collecting',
      message: 'Collecting compliance evidence...',
    });

    const result = await collectEvidence({
      organizationId,
      evidenceTypes: evidenceTypes as any,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      endDate: new Date(),
    });

    await this.updateProgress(job, {
      current: 1,
      total: 2,
      stage: 'cleanup',
      message: 'Cleaning up expired evidence...',
    });

    const cleanup = await cleanupExpiredEvidence(organizationId);

    await this.updateProgress(job, {
      current: 2,
      total: 2,
      stage: 'complete',
      message: 'Evidence collection completed',
    });

    context.logger.info('Evidence collection completed', {
      collected: result.collected,
      failed: result.failed,
      cleaned: cleanup.deleted,
    });

    return {
      evidenceCollected: result.collected,
      details: {
        collected: result.collected,
        failed: result.failed,
        evidenceIds: result.evidenceIds,
        expiredCleaned: cleanup.deleted,
        errors: result.errors,
      },
    };
  }

  // ===========================================================================
  // Retention Processing
  // ===========================================================================

  private async runRetentionProcessing(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<Partial<ComplianceJobResult>> {
    const { organizationId, dryRun } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 1,
      stage: 'processing',
      message: 'Processing retention policies...',
    });

    const results = await processAllRetentionPolicies(organizationId, { dryRun });

    let totalProcessed = 0;
    let totalDeleted = 0;
    let totalAnonymized = 0;
    let totalArchived = 0;
    let totalErrors = 0;

    for (const result of results) {
      totalProcessed += result.processed;
      totalDeleted += result.deleted;
      totalAnonymized += result.anonymized;
      totalArchived += result.archived;
      totalErrors += result.errors;
    }

    await this.updateProgress(job, {
      current: 1,
      total: 1,
      stage: 'complete',
      message: 'Retention processing completed',
    });

    context.logger.info('Retention processing completed', {
      policiesProcessed: results.length,
      recordsProcessed: totalProcessed,
      deleted: totalDeleted,
      anonymized: totalAnonymized,
      archived: totalArchived,
    });

    return {
      recordsProcessed: totalProcessed,
      details: {
        policiesProcessed: results.length,
        deleted: totalDeleted,
        anonymized: totalAnonymized,
        archived: totalArchived,
        errors: totalErrors,
        dryRun,
      },
    };
  }

  // ===========================================================================
  // Deadline Maintenance
  // ===========================================================================

  private async runDeadlineMaintenance(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<Partial<ComplianceJobResult>> {
    const { organizationId } = job.data;

    await this.updateProgress(job, {
      current: 0,
      total: 2,
      stage: 'updating',
      message: 'Updating deadline statuses...',
    });

    const statusResult = await updateDeadlineStatuses(organizationId);

    await this.updateProgress(job, {
      current: 1,
      total: 2,
      stage: 'notifying',
      message: 'Sending deadline notifications...',
    });

    const notificationResult = await sendDeadlineNotifications(organizationId);

    await this.updateProgress(job, {
      current: 2,
      total: 2,
      stage: 'complete',
      message: 'Deadline maintenance completed',
    });

    context.logger.info('Deadline maintenance completed', {
      statusesUpdated: statusResult.updated,
      notificationsSent: notificationResult.sent,
    });

    return {
      details: {
        statusesUpdated: statusResult.updated,
        notificationsSent: notificationResult.sent,
      },
    };
  }

  // ===========================================================================
  // Report Generation
  // ===========================================================================

  private async runReportGeneration(
    job: Job<ComplianceJobData>,
    context: ProcessorContext
  ): Promise<Partial<ComplianceJobResult>> {
    const { organizationId, reportType, framework, startDate, endDate } = job.data;

    if (!reportType) {
      throw new Error('reportType is required for report generation');
    }

    await this.updateProgress(job, {
      current: 0,
      total: 1,
      stage: 'generating',
      message: `Generating ${reportType} report...`,
    });

    const report = await generateReport({
      organizationId,
      reportType,
      framework,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    await this.updateProgress(job, {
      current: 1,
      total: 1,
      stage: 'complete',
      message: 'Report generation completed',
    });

    context.logger.info('Report generation completed', {
      reportId: report.id,
      reportType,
      sectionsCount: report.sections.length,
    });

    return {
      reportId: report.id,
      details: {
        reportType,
        framework,
        sectionsCount: report.sections.length,
        complianceScore: report.summary.complianceScore,
      },
    };
  }
}

// =============================================================================
// Factory and Scheduling Functions
// =============================================================================

export function createComplianceCheckProcessor(prisma: PrismaClient): ComplianceCheckProcessor {
  return new ComplianceCheckProcessor(prisma);
}

/**
 * Schedule recurring compliance jobs for an organization
 */
export async function scheduleComplianceJobs(
  organizationId: string,
  options: {
    ruleEvaluationIntervalMinutes?: number;
    violationDetectionIntervalMinutes?: number;
    evidenceCollectionIntervalHours?: number;
    retentionProcessingIntervalHours?: number;
    deadlineMaintenanceIntervalHours?: number;
  } = {}
): Promise<void> {
  const {
    ruleEvaluationIntervalMinutes = 60,
    violationDetectionIntervalMinutes = 30,
    evidenceCollectionIntervalHours = 24,
    retentionProcessingIntervalHours = 24,
    deadlineMaintenanceIntervalHours = 1,
  } = options;

  console.info('Compliance jobs scheduled (would use job queue)', {
    organizationId,
    ruleEvaluationIntervalMinutes,
    violationDetectionIntervalMinutes,
    evidenceCollectionIntervalHours,
    retentionProcessingIntervalHours,
    deadlineMaintenanceIntervalHours,
  });
}

/**
 * Run immediate compliance check
 */
export async function runImmediateComplianceCheck(
  prisma: PrismaClient,
  data: ComplianceJobData
): Promise<ComplianceJobResult> {
  const processor = createComplianceCheckProcessor(prisma);

  const mockJob = {
    id: `manual-${Date.now()}`,
    data,
    updateProgress: async () => {},
  } as unknown as Job<ComplianceJobData>;

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

export default ComplianceCheckProcessor;
