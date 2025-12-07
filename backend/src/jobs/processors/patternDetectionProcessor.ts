/**
 * Pattern Detection Job Processor
 * Runs pattern detection analysis for burnout, process degradation, and team conflicts
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { BaseProcessor, ProcessorContext } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import {
  BurnoutDetector,
  createBurnoutDetector,
  BurnoutRiskAssessment,
  BurnoutDetectionOptions,
} from '../../services/analysis/patterns/burnoutDetector.js';
import {
  DegradationDetector,
  createDegradationDetector,
  ProcessDegradationAssessment,
  DegradationDetectionOptions,
} from '../../services/analysis/patterns/degradationDetector.js';
import {
  ConflictDetector,
  createConflictDetector,
  TeamConflictAssessment,
  ConflictDetectionOptions,
} from '../../services/analysis/patterns/conflictDetector.js';

export type PatternType = 'burnout' | 'degradation' | 'conflict' | 'all';

export interface PatternDetectionJobData {
  organizationId: string;
  patternTypes: PatternType[];
  options?: {
    lookbackDays?: number;
    baselineDays?: number;
    sensitivityLevel?: 'low' | 'medium' | 'high';
    // Burnout-specific
    personIds?: string[];
    businessHoursStart?: number;
    businessHoursEnd?: number;
    // Degradation-specific
    processIds?: string[];
    minCaseCount?: number;
    // Conflict-specific
    teamIds?: string[];
    minInteractions?: number;
  };
  // Job tracking
  analysisJobId?: string;
  triggeredBy?: 'scheduled' | 'manual' | 'webhook';
}

export interface PatternDetectionJobResult {
  organizationId: string;
  duration: number;
  burnoutResults?: {
    totalAnalyzed: number;
    highRiskCount: number;
    assessments: BurnoutRiskAssessment[];
  };
  degradationResults?: {
    totalAnalyzed: number;
    criticalCount: number;
    assessments: ProcessDegradationAssessment[];
  };
  conflictResults?: {
    totalAnalyzed: number;
    conflictingTeamsCount: number;
    assessments: TeamConflictAssessment[];
  };
  alertsGenerated: number;
  completedAt: Date;
}

interface InsightRecord {
  id: string;
  organizationId: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  score: number;
  metadata: Record<string, unknown>;
  recommendedActions: string[];
  createdAt: Date;
}

export class PatternDetectionProcessor extends BaseProcessor<
  PatternDetectionJobData,
  PatternDetectionJobResult
> {
  private pool: Pool;
  private burnoutDetector: BurnoutDetector;
  private degradationDetector: DegradationDetector;
  private conflictDetector: ConflictDetector;

  constructor(prisma: PrismaClient, pool: Pool) {
    super(QueueNames.PATTERN_DETECTION, prisma);
    this.pool = pool;
    this.burnoutDetector = createBurnoutDetector(pool);
    this.degradationDetector = createDegradationDetector(pool);
    this.conflictDetector = createConflictDetector(pool);
  }

  async process(
    job: Job<PatternDetectionJobData>,
    context: ProcessorContext
  ): Promise<PatternDetectionJobResult> {
    const { organizationId, patternTypes, options = {} } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting pattern detection', {
      organizationId,
      patternTypes,
    });

    const result: PatternDetectionJobResult = {
      organizationId,
      duration: 0,
      alertsGenerated: 0,
      completedAt: new Date(),
    };

    const typesToRun = patternTypes.includes('all')
      ? ['burnout', 'degradation', 'conflict']
      : patternTypes;

    const totalSteps = typesToRun.length;
    let currentStep = 0;

    // Run burnout detection
    if (typesToRun.includes('burnout')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'burnout',
        message: 'Analyzing burnout patterns...',
      });

      try {
        const burnoutOptions: BurnoutDetectionOptions = {
          organizationId,
          personIds: options.personIds,
          lookbackDays: options.lookbackDays,
          baselineDays: options.baselineDays,
          businessHoursStart: options.businessHoursStart,
          businessHoursEnd: options.businessHoursEnd,
        };

        const burnoutAssessments = await this.burnoutDetector.detectBurnoutPatterns(
          burnoutOptions
        );

        result.burnoutResults = {
          totalAnalyzed: burnoutAssessments.length,
          highRiskCount: burnoutAssessments.filter(
            (a) => a.riskLevel === 'high' || a.riskLevel === 'critical'
          ).length,
          assessments: burnoutAssessments,
        };

        // Create insights for high-risk individuals
        const burnoutAlerts = await this.createBurnoutInsights(
          context,
          organizationId,
          burnoutAssessments
        );
        result.alertsGenerated += burnoutAlerts;

        context.logger.info('Burnout detection completed', {
          analyzed: burnoutAssessments.length,
          highRisk: result.burnoutResults.highRiskCount,
        });
      } catch (error) {
        context.logger.error('Burnout detection failed', error as Error);
      }

      currentStep++;
    }

    // Run degradation detection
    if (typesToRun.includes('degradation')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'degradation',
        message: 'Analyzing process degradation...',
      });

      try {
        const degradationOptions: DegradationDetectionOptions = {
          organizationId,
          processIds: options.processIds,
          lookbackDays: options.lookbackDays,
          baselineDays: options.baselineDays,
          minCaseCount: options.minCaseCount,
          sensitivityLevel: options.sensitivityLevel,
        };

        const degradationAssessments = await this.degradationDetector.detectDegradation(
          degradationOptions
        );

        result.degradationResults = {
          totalAnalyzed: degradationAssessments.length,
          criticalCount: degradationAssessments.filter(
            (a) => a.degradationLevel === 'degrading' || a.degradationLevel === 'critical'
          ).length,
          assessments: degradationAssessments,
        };

        // Create insights for degrading processes
        const degradationAlerts = await this.createDegradationInsights(
          context,
          organizationId,
          degradationAssessments
        );
        result.alertsGenerated += degradationAlerts;

        context.logger.info('Degradation detection completed', {
          analyzed: degradationAssessments.length,
          critical: result.degradationResults.criticalCount,
        });
      } catch (error) {
        context.logger.error('Degradation detection failed', error as Error);
      }

      currentStep++;
    }

    // Run conflict detection
    if (typesToRun.includes('conflict')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'conflict',
        message: 'Analyzing team conflict patterns...',
      });

      try {
        const conflictOptions: ConflictDetectionOptions = {
          organizationId,
          teamIds: options.teamIds,
          lookbackDays: options.lookbackDays,
          baselineDays: options.baselineDays,
          minInteractions: options.minInteractions,
          sensitivityLevel: options.sensitivityLevel,
        };

        const conflictAssessments = await this.conflictDetector.detectConflicts(
          conflictOptions
        );

        result.conflictResults = {
          totalAnalyzed: conflictAssessments.length,
          conflictingTeamsCount: conflictAssessments.filter(
            (a) => a.conflictLevel === 'conflict' || a.conflictLevel === 'critical'
          ).length,
          assessments: conflictAssessments,
        };

        // Create insights for conflicting teams
        const conflictAlerts = await this.createConflictInsights(
          context,
          organizationId,
          conflictAssessments
        );
        result.alertsGenerated += conflictAlerts;

        context.logger.info('Conflict detection completed', {
          analyzed: conflictAssessments.length,
          conflicting: result.conflictResults.conflictingTeamsCount,
        });
      } catch (error) {
        context.logger.error('Conflict detection failed', error as Error);
      }

      currentStep++;
    }

    result.duration = Date.now() - startTime;
    result.completedAt = new Date();

    // Update analysis job record if provided
    if (job.data.analysisJobId) {
      await this.updateAnalysisJobRecord(context, job.data.analysisJobId, result);
    }

    context.logger.info('Pattern detection completed', {
      duration: result.duration,
      alertsGenerated: result.alertsGenerated,
    });

    return result;
  }

  /**
   * Create insights for burnout assessments
   */
  private async createBurnoutInsights(
    context: ProcessorContext,
    organizationId: string,
    assessments: BurnoutRiskAssessment[]
  ): Promise<number> {
    let alertsCreated = 0;

    // Only create insights for moderate+ risk
    const significantAssessments = assessments.filter(
      (a) =>
        a.riskLevel === 'moderate' ||
        a.riskLevel === 'high' ||
        a.riskLevel === 'critical'
    );

    for (const assessment of significantAssessments) {
      const insight: Omit<InsightRecord, 'id' | 'createdAt'> = {
        organizationId,
        type: 'burnout_risk',
        category: 'people',
        severity: this.mapRiskLevelToSeverity(assessment.riskLevel),
        title: `Burnout Risk: ${assessment.displayName || assessment.email}`,
        description: this.generateBurnoutDescription(assessment),
        entityType: 'person',
        entityId: assessment.personId,
        score: assessment.overallRiskScore,
        metadata: {
          indicators: assessment.indicators,
          analysisWindow: assessment.analysisWindow,
          confidence: assessment.confidence,
        },
        recommendedActions: assessment.recommendedActions,
      };

      await this.saveInsight(context, insight);
      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Create insights for degradation assessments
   */
  private async createDegradationInsights(
    context: ProcessorContext,
    organizationId: string,
    assessments: ProcessDegradationAssessment[]
  ): Promise<number> {
    let alertsCreated = 0;

    // Only create insights for warning+ degradation
    const significantAssessments = assessments.filter(
      (a) =>
        a.degradationLevel === 'warning' ||
        a.degradationLevel === 'degrading' ||
        a.degradationLevel === 'critical'
    );

    for (const assessment of significantAssessments) {
      const insight: Omit<InsightRecord, 'id' | 'createdAt'> = {
        organizationId,
        type: 'process_degradation',
        category: 'process',
        severity: this.mapDegradationToSeverity(assessment.degradationLevel),
        title: `Process Degradation: ${assessment.processName}`,
        description: this.generateDegradationDescription(assessment),
        entityType: 'process',
        entityId: assessment.processId,
        score: 100 - assessment.overallHealthScore, // Convert health to degradation score
        metadata: {
          indicators: assessment.indicators,
          predictedFailureRisk: assessment.predictedFailureRisk,
          estimatedTimeToFailure: assessment.estimatedTimeToFailure,
          analysisWindow: assessment.analysisWindow,
          confidence: assessment.confidence,
        },
        recommendedActions: assessment.recommendedActions,
      };

      await this.saveInsight(context, insight);
      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Create insights for conflict assessments
   */
  private async createConflictInsights(
    context: ProcessorContext,
    organizationId: string,
    assessments: TeamConflictAssessment[]
  ): Promise<number> {
    let alertsCreated = 0;

    // Only create insights for tension+ conflict levels
    const significantAssessments = assessments.filter(
      (a) =>
        a.conflictLevel === 'tension' ||
        a.conflictLevel === 'conflict' ||
        a.conflictLevel === 'critical'
    );

    for (const assessment of significantAssessments) {
      const insight: Omit<InsightRecord, 'id' | 'createdAt'> = {
        organizationId,
        type: 'team_conflict',
        category: 'team',
        severity: this.mapConflictToSeverity(assessment.conflictLevel),
        title: `Team Conflict: ${assessment.teamName}`,
        description: this.generateConflictDescription(assessment),
        entityType: 'team',
        entityId: assessment.teamId,
        score: assessment.overallConflictScore,
        metadata: {
          indicators: assessment.indicators,
          affectedRelationships: assessment.affectedRelationships,
          analysisWindow: assessment.analysisWindow,
          confidence: assessment.confidence,
        },
        recommendedActions: assessment.recommendedActions,
      };

      await this.saveInsight(context, insight);
      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Save insight to database
   */
  private async saveInsight(
    context: ProcessorContext,
    insight: Omit<InsightRecord, 'id' | 'createdAt'>
  ): Promise<void> {
    // Check for existing similar insight within the last 7 days
    const existingQuery = `
      SELECT id FROM insights
      WHERE organization_id = $1
        AND type = $2
        AND entity_id = $3
        AND created_at > NOW() - INTERVAL '7 days'
      LIMIT 1
    `;

    const existing = await this.pool.query(existingQuery, [
      insight.organizationId,
      insight.type,
      insight.entityId,
    ]);

    if (existing.rows.length > 0) {
      // Update existing insight
      const updateQuery = `
        UPDATE insights
        SET severity = $1,
            title = $2,
            description = $3,
            score = $4,
            metadata = $5,
            recommended_actions = $6,
            updated_at = NOW()
        WHERE id = $7
      `;

      await this.pool.query(updateQuery, [
        insight.severity,
        insight.title,
        insight.description,
        insight.score,
        JSON.stringify(insight.metadata),
        insight.recommendedActions,
        existing.rows[0].id,
      ]);
    } else {
      // Insert new insight
      const insertQuery = `
        INSERT INTO insights (
          organization_id, type, category, severity, title, description,
          entity_type, entity_id, score, metadata, recommended_actions, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `;

      await this.pool.query(insertQuery, [
        insight.organizationId,
        insight.type,
        insight.category,
        insight.severity,
        insight.title,
        insight.description,
        insight.entityType,
        insight.entityId,
        insight.score,
        JSON.stringify(insight.metadata),
        insight.recommendedActions,
      ]);
    }
  }

  /**
   * Update analysis job record
   */
  private async updateAnalysisJobRecord(
    context: ProcessorContext,
    analysisJobId: string,
    result: PatternDetectionJobResult
  ): Promise<void> {
    try {
      const query = `
        UPDATE analysis_jobs
        SET status = 'completed',
            completed_at = NOW(),
            duration_ms = $1,
            result_summary = $2
        WHERE id = $3
      `;

      await this.pool.query(query, [
        result.duration,
        JSON.stringify({
          burnoutAnalyzed: result.burnoutResults?.totalAnalyzed || 0,
          burnoutHighRisk: result.burnoutResults?.highRiskCount || 0,
          degradationAnalyzed: result.degradationResults?.totalAnalyzed || 0,
          degradationCritical: result.degradationResults?.criticalCount || 0,
          conflictAnalyzed: result.conflictResults?.totalAnalyzed || 0,
          conflictingTeams: result.conflictResults?.conflictingTeamsCount || 0,
          alertsGenerated: result.alertsGenerated,
        }),
        analysisJobId,
      ]);
    } catch (error) {
      context.logger.warn('Failed to update analysis job record', { error });
    }
  }

  /**
   * Generate burnout description
   */
  private generateBurnoutDescription(assessment: BurnoutRiskAssessment): string {
    const parts: string[] = [];

    parts.push(`Risk score: ${assessment.overallRiskScore.toFixed(0)}/100`);

    if (assessment.indicators.length > 0) {
      const topIndicators = assessment.indicators
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((i) => i.description);
      parts.push(`Key indicators: ${topIndicators.join('; ')}`);
    }

    parts.push(`Confidence: ${(assessment.confidence * 100).toFixed(0)}%`);

    return parts.join('. ');
  }

  /**
   * Generate degradation description
   */
  private generateDegradationDescription(
    assessment: ProcessDegradationAssessment
  ): string {
    const parts: string[] = [];

    parts.push(`Health score: ${assessment.overallHealthScore.toFixed(0)}/100`);

    if (assessment.predictedFailureRisk > 0.3) {
      parts.push(`Failure risk: ${(assessment.predictedFailureRisk * 100).toFixed(0)}%`);
    }

    if (assessment.estimatedTimeToFailure) {
      parts.push(
        `Estimated time to failure: ${assessment.estimatedTimeToFailure.value} ${assessment.estimatedTimeToFailure.unit}`
      );
    }

    if (assessment.indicators.length > 0) {
      const topIndicators = assessment.indicators
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((i) => i.description);
      parts.push(`Issues: ${topIndicators.join('; ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Generate conflict description
   */
  private generateConflictDescription(assessment: TeamConflictAssessment): string {
    const parts: string[] = [];

    parts.push(`Conflict score: ${assessment.overallConflictScore.toFixed(0)}/100`);

    if (assessment.affectedRelationships.length > 0) {
      parts.push(
        `${assessment.affectedRelationships.length} relationship(s) affected`
      );
    }

    if (assessment.indicators.length > 0) {
      const topIndicators = assessment.indicators
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((i) => i.description);
      parts.push(`Patterns: ${topIndicators.join('; ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Map risk level to severity
   */
  private mapRiskLevelToSeverity(
    level: 'low' | 'moderate' | 'high' | 'critical'
  ): string {
    switch (level) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'moderate':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Map degradation level to severity
   */
  private mapDegradationToSeverity(
    level: 'healthy' | 'warning' | 'degrading' | 'critical'
  ): string {
    switch (level) {
      case 'critical':
        return 'critical';
      case 'degrading':
        return 'high';
      case 'warning':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Map conflict level to severity
   */
  private mapConflictToSeverity(
    level: 'healthy' | 'tension' | 'conflict' | 'critical'
  ): string {
    switch (level) {
      case 'critical':
        return 'critical';
      case 'conflict':
        return 'high';
      case 'tension':
        return 'medium';
      default:
        return 'low';
    }
  }
}

// Factory function
export function createPatternDetectionProcessor(
  prisma: PrismaClient,
  pool: Pool
): PatternDetectionProcessor {
  return new PatternDetectionProcessor(prisma, pool);
}
