/**
 * Debt Score Processor
 * BullMQ processor for calculating organizational debt scores
 * T258 - Background job processing for debt calculation
 */

import { Job } from 'bullmq';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  calculateOrgDebtScore,
  getDebtScoreHistory,
} from '../../services/analysis/debt/index.js';
import { DebtCalculationOptions } from '../../models/OrgDebtScore.js';

export interface DebtScoreJobData {
  organizationId: string;
  options?: Partial<DebtCalculationOptions>;
  triggeredBy?: 'scheduled' | 'manual' | 'event';
  triggeredByUserId?: string;
}

export interface DebtScoreJobResult {
  success: boolean;
  scoreId?: string;
  overallScore?: number;
  overallGrade?: string;
  dimensionScores?: {
    process: number;
    knowledge: number;
    data: number;
    technical: number;
    communication: number;
  };
  estimatedAnnualCost?: number;
  trend?: string;
  error?: string;
  processingTimeMs?: number;
}

/**
 * Create debt score processor
 */
export function createDebtScoreProcessor(pool: Pool) {
  return async function processDebtScoreJob(
    job: Job<DebtScoreJobData>
  ): Promise<DebtScoreJobResult> {
    const startTime = Date.now();
    const { organizationId, options = {}, triggeredBy = 'manual' } = job.data;

    try {
      job.updateProgress(10);
      await job.log(`Starting debt score calculation for org ${organizationId}`);
      await job.log(`Triggered by: ${triggeredBy}`);

      // Check if we should skip (recent calculation exists)
      if (triggeredBy === 'scheduled') {
        const recentScore = await checkRecentScore(pool, organizationId);
        if (recentScore) {
          await job.log('Skipping - recent score exists within threshold');
          return {
            success: true,
            scoreId: recentScore.id,
            overallScore: recentScore.score,
            processingTimeMs: Date.now() - startTime,
          };
        }
      }

      job.updateProgress(20);

      // Calculate full debt score
      const calculationOptions: DebtCalculationOptions = {
        organizationId,
        includeRecommendations: true,
        includeCostEstimate: true,
        lookbackDays: options.lookbackDays ?? 90,
        customWeights: options.customWeights,
        costParameters: options.costParameters,
      };

      await job.log('Calculating process debt...');
      job.updateProgress(30);

      await job.log('Calculating knowledge debt...');
      job.updateProgress(40);

      await job.log('Calculating data debt...');
      job.updateProgress(50);

      await job.log('Calculating technical debt...');
      job.updateProgress(60);

      await job.log('Calculating communication debt...');
      job.updateProgress(70);

      const score = await calculateOrgDebtScore(pool, calculationOptions);

      job.updateProgress(80);
      await job.log(`Overall score: ${score.overallScore} (Grade: ${score.overallGrade})`);

      // Create insights from significant findings
      await createDebtInsights(pool, organizationId, score);

      job.updateProgress(90);

      // Check for alerts
      await checkDebtAlerts(pool, organizationId, score, job);

      job.updateProgress(100);
      await job.log('Debt score calculation complete');

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        scoreId: score.id,
        overallScore: score.overallScore,
        overallGrade: score.overallGrade,
        dimensionScores: {
          process: score.dimensions.process.score,
          knowledge: score.dimensions.knowledge.score,
          data: score.dimensions.data.score,
          technical: score.dimensions.technical.score,
          communication: score.dimensions.communication.score,
        },
        estimatedAnnualCost: score.estimatedAnnualCost.totalAnnualCost,
        trend: score.overallTrend,
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await job.log(`Error calculating debt score: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      };
    }
  };
}

/**
 * Check if a recent score exists within threshold
 */
async function checkRecentScore(
  pool: Pool,
  organizationId: string
): Promise<{ id: string; score: number } | null> {
  const result = await pool
    .query(
      `
    SELECT id, overall_score
    FROM org_debt_scores
    WHERE organization_id = $1
      AND calculated_at > NOW() - INTERVAL '6 hours'
    ORDER BY calculated_at DESC
    LIMIT 1
    `,
      [organizationId]
    )
    .catch(() => ({ rows: [] }));

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    score: result.rows[0].overall_score,
  };
}

/**
 * Create insights from debt score findings
 */
async function createDebtInsights(
  pool: Pool,
  organizationId: string,
  score: Awaited<ReturnType<typeof calculateOrgDebtScore>>
): Promise<void> {
  const insights: Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    metadata: object;
  }> = [];

  // Overall health insight
  if (score.overallScore > 60) {
    insights.push({
      type: 'org-debt-critical',
      severity: 'high',
      title: 'Critical Organizational Debt Detected',
      description: `Your organization has a debt score of ${score.overallScore} (Grade ${score.overallGrade}). This indicates significant operational inefficiencies requiring attention.`,
      metadata: {
        score: score.overallScore,
        grade: score.overallGrade,
        estimatedCost: score.estimatedAnnualCost.totalAnnualCost,
      },
    });
  }

  // Trend insight
  if (score.overallTrend === 'degrading' && score.scoreChange && score.scoreChange > 10) {
    insights.push({
      type: 'org-debt-degrading',
      severity: 'medium',
      title: 'Organizational Debt Increasing',
      description: `Your debt score has increased by ${score.scoreChange} points since the last assessment, indicating worsening organizational health.`,
      metadata: {
        previousScore: score.previousScore,
        currentScore: score.overallScore,
        change: score.scoreChange,
      },
    });
  }

  // Dimension-specific insights
  for (const [dimension, data] of Object.entries(score.dimensions)) {
    if (data.score > 70) {
      insights.push({
        type: `${dimension}-debt-critical`,
        severity: 'high',
        title: `Critical ${dimension.charAt(0).toUpperCase() + dimension.slice(1)} Debt`,
        description: data.topIssues[0]?.description ?? `High ${dimension} debt score of ${data.score}`,
        metadata: {
          dimension,
          score: data.score,
          topIssue: data.topIssues[0],
        },
      });
    }
  }

  // Save insights
  for (const insight of insights) {
    await pool
      .query(
        `
      INSERT INTO insights (
        id, organization_id, type, severity, title, description, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (organization_id, type)
      DO UPDATE SET
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      `,
        [
          uuidv4(),
          organizationId,
          insight.type,
          insight.severity,
          insight.title,
          insight.description,
          JSON.stringify(insight.metadata),
        ]
      )
      .catch(() => {});
  }
}

/**
 * Check for debt alerts and create notifications
 */
async function checkDebtAlerts(
  pool: Pool,
  organizationId: string,
  score: Awaited<ReturnType<typeof calculateOrgDebtScore>>,
  job: Job
): Promise<void> {
  // Get previous history
  const history = await getDebtScoreHistory(pool, organizationId, 2);
  const previousScore = history.length > 1 ? history[1].overallScore : null;

  // Alert conditions
  const alerts: Array<{ type: string; message: string }> = [];

  // New critical grade
  if (score.overallGrade === 'F' && previousScore !== null && previousScore <= 80) {
    alerts.push({
      type: 'debt_grade_critical',
      message: `Organizational debt has reached critical level (Grade F, Score: ${score.overallScore})`,
    });
  }

  // Large increase
  if (previousScore !== null && score.overallScore - previousScore > 15) {
    alerts.push({
      type: 'debt_rapid_increase',
      message: `Debt score increased by ${score.overallScore - previousScore} points (now ${score.overallScore})`,
    });
  }

  // High cost estimate
  if (score.estimatedAnnualCost.totalAnnualCost > 500000) {
    alerts.push({
      type: 'debt_high_cost',
      message: `Estimated annual debt cost exceeds €500,000 (${score.estimatedAnnualCost.totalAnnualCost.toLocaleString()})`,
    });
  }

  // Log alerts
  for (const alert of alerts) {
    await job.log(`ALERT [${alert.type}]: ${alert.message}`);

    // Save alert to database
    await pool
      .query(
        `
      INSERT INTO alerts (
        id, organization_id, type, message, severity, created_at, status
      ) VALUES ($1, $2, $3, $4, 'high', NOW(), 'new')
      `,
        [uuidv4(), organizationId, alert.type, alert.message]
      )
      .catch(() => {});
  }
}

/**
 * Schedule recurring debt calculation
 */
export async function scheduleDebtCalculation(
  queue: { add: (name: string, data: DebtScoreJobData, opts?: object) => Promise<Job> },
  organizationId: string,
  cronExpression: string = '0 2 * * 0' // Weekly at 2 AM Sunday
): Promise<void> {
  await queue.add(
    'debt-score-scheduled',
    {
      organizationId,
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: cronExpression,
      },
      jobId: `debt-score-${organizationId}`,
    }
  );
}

export default { createDebtScoreProcessor, scheduleDebtCalculation };
