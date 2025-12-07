/**
 * Network Analysis Job Processor
 * Runs comprehensive network analysis jobs
 * T238 - Network analysis job processor
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { BaseProcessor, ProcessorContext } from '../baseProcessor.js';
import { QueueNames } from '../queue.js';
import {
  buildCommunicationNetwork,
  calculateAndStoreNetworkMetrics,
  CommunicationNetwork,
} from '../../services/analysis/network/networkBuilder.js';
import {
  calculateAllCentralityMetrics,
  storeCentralityMetrics,
  CentralityResult,
} from '../../services/analysis/network/centrality.js';
import {
  calculateInfluenceScores,
  storeInfluenceScores,
  InfluenceResult,
} from '../../services/analysis/network/influenceScorer.js';
import {
  detectCommunities,
  CommunityDetectionResult,
} from '../../services/analysis/network/communityDetection.js';
import {
  compareHierarchies,
  HierarchyComparison,
} from '../../services/analysis/network/hierarchyComparison.js';
import {
  detectHiddenInfluencers,
  analyzeHiddenInfluenceRisk,
  HiddenInfluencerResult,
} from '../../services/analysis/network/hiddenInfluencers.js';
import {
  analyzePatterns,
  PatternAnalysisResult,
} from '../../services/analysis/network/patternAnalyzer.js';

export type NetworkAnalysisType =
  | 'network'
  | 'centrality'
  | 'influence'
  | 'community'
  | 'hierarchy'
  | 'hidden-influencers'
  | 'patterns'
  | 'full';

export interface NetworkAnalysisJobData {
  organizationId: string;
  analysisTypes: NetworkAnalysisType[];
  options?: {
    // Network options
    minCommunications?: number;
    startDate?: string;
    endDate?: string;
    // Community detection options
    minCommunitySize?: number;
    maxIterations?: number;
    // Hidden influencer options
    minConfidence?: number;
    // Pattern analysis options
    timeframeDays?: number;
  };
  // Job tracking
  analysisJobId?: string;
  triggeredBy?: 'scheduled' | 'manual' | 'webhook';
}

export interface NetworkAnalysisJobResult {
  organizationId: string;
  duration: number;
  networkResult?: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    avgDegree: number;
  };
  centralityResult?: {
    calculated: number;
    avgDegree: number;
    avgBetweenness: number;
    avgCloseness: number;
  };
  influenceResult?: {
    calculated: number;
    avgScore: number;
    topInfluencerDepartments: string[];
  };
  communityResult?: {
    communityCount: number;
    modularity: number;
    avgSize: number;
    isolatedNodes: number;
  };
  hierarchyResult?: {
    alignmentScore: number;
    shadowLeaderCount: number;
    underLeveragedCount: number;
    avgDiscrepancy: number;
  };
  hiddenInfluencerResult?: {
    totalIdentified: number;
    byType: Record<string, number>;
    riskLevel: string;
  };
  patternResult?: {
    analyzed: number;
    communicationHealth: string;
    siloRisk: number;
    alertCount: number;
  };
  alertsGenerated: number;
  completedAt: Date;
}

interface InsightRecord {
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
}

export class NetworkAnalysisProcessor extends BaseProcessor<
  NetworkAnalysisJobData,
  NetworkAnalysisJobResult
> {
  private pool: Pool;

  constructor(prisma: PrismaClient, pool: Pool) {
    super(QueueNames.NETWORK_ANALYSIS, prisma);
    this.pool = pool;
  }

  async process(
    job: Job<NetworkAnalysisJobData>,
    context: ProcessorContext
  ): Promise<NetworkAnalysisJobResult> {
    const { organizationId, analysisTypes, options = {} } = job.data;
    const startTime = Date.now();

    context.logger.info('Starting network analysis', {
      organizationId,
      analysisTypes,
    });

    const result: NetworkAnalysisJobResult = {
      organizationId,
      duration: 0,
      alertsGenerated: 0,
      completedAt: new Date(),
    };

    const typesToRun = analysisTypes.includes('full')
      ? ['network', 'centrality', 'influence', 'community', 'hierarchy', 'hidden-influencers', 'patterns']
      : analysisTypes;

    const totalSteps = typesToRun.length;
    let currentStep = 0;

    // Run network building
    if (typesToRun.includes('network')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'network',
        message: 'Building communication network...',
      });

      try {
        const networkResult = await buildCommunicationNetwork({
          organizationId,
          minCommunications: options.minCommunications,
          startDate: options.startDate ? new Date(options.startDate) : undefined,
          endDate: options.endDate ? new Date(options.endDate) : undefined,
        });

        await calculateAndStoreNetworkMetrics(organizationId);

        result.networkResult = {
          nodeCount: networkResult.stats.nodeCount,
          edgeCount: networkResult.stats.edgeCount,
          density: networkResult.stats.density,
          avgDegree: networkResult.stats.avgDegree,
        };

        context.logger.info('Network building completed', result.networkResult);
      } catch (error) {
        context.logger.error('Network building failed', error as Error);
      }

      currentStep++;
    }

    // Run centrality calculations
    if (typesToRun.includes('centrality')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'centrality',
        message: 'Calculating centrality metrics...',
      });

      try {
        const centralityResult = await calculateAllCentralityMetrics(organizationId);
        await storeCentralityMetrics(organizationId, centralityResult);

        result.centralityResult = {
          calculated: centralityResult.persons.length,
          avgDegree: centralityResult.stats.avgDegreeCentrality,
          avgBetweenness: centralityResult.stats.avgBetweennessCentrality,
          avgCloseness: centralityResult.stats.avgClosenessCentrality,
        };

        context.logger.info('Centrality calculation completed', result.centralityResult);
      } catch (error) {
        context.logger.error('Centrality calculation failed', error as Error);
      }

      currentStep++;
    }

    // Run influence scoring
    if (typesToRun.includes('influence')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'influence',
        message: 'Calculating influence scores...',
      });

      try {
        const influenceResult = await calculateInfluenceScores(organizationId);
        await storeInfluenceScores(organizationId, influenceResult.influencers);

        result.influenceResult = {
          calculated: influenceResult.influencers.length,
          avgScore: influenceResult.stats.avgScore,
          topInfluencerDepartments: influenceResult.stats.topInfluencerDepartments
            .slice(0, 5)
            .map((d) => d.department),
        };

        context.logger.info('Influence scoring completed', result.influenceResult);
      } catch (error) {
        context.logger.error('Influence scoring failed', error as Error);
      }

      currentStep++;
    }

    // Run community detection
    if (typesToRun.includes('community')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'community',
        message: 'Detecting communities...',
      });

      try {
        const communityResult = await detectCommunities(organizationId, {
          minCommunitySize: options.minCommunitySize,
          maxIterations: options.maxIterations,
        });

        result.communityResult = {
          communityCount: communityResult.stats.totalCommunities,
          modularity: communityResult.modularity,
          avgSize: communityResult.stats.avgCommunitySize,
          isolatedNodes: communityResult.stats.isolatedNodes,
        };

        // Create insights for small/isolated communities
        const alerts = await this.createCommunityInsights(
          context,
          organizationId,
          communityResult
        );
        result.alertsGenerated += alerts;

        context.logger.info('Community detection completed', result.communityResult);
      } catch (error) {
        context.logger.error('Community detection failed', error as Error);
      }

      currentStep++;
    }

    // Run hierarchy comparison
    if (typesToRun.includes('hierarchy')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'hierarchy',
        message: 'Comparing formal and informal hierarchies...',
      });

      try {
        const hierarchyResult = await compareHierarchies(organizationId);

        result.hierarchyResult = {
          alignmentScore: hierarchyResult.metrics.alignmentScore,
          shadowLeaderCount: hierarchyResult.metrics.shadowLeaderCount,
          underLeveragedCount: hierarchyResult.metrics.underLeveragedCount,
          avgDiscrepancy: hierarchyResult.metrics.avgDiscrepancy,
        };

        // Create insights for hierarchy misalignment
        const alerts = await this.createHierarchyInsights(
          context,
          organizationId,
          hierarchyResult
        );
        result.alertsGenerated += alerts;

        context.logger.info('Hierarchy comparison completed', result.hierarchyResult);
      } catch (error) {
        context.logger.error('Hierarchy comparison failed', error as Error);
      }

      currentStep++;
    }

    // Run hidden influencer detection
    if (typesToRun.includes('hidden-influencers')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'hidden-influencers',
        message: 'Detecting hidden influencers...',
      });

      try {
        const hiddenResult = await detectHiddenInfluencers(organizationId, {
          minConfidence: options.minConfidence,
        });

        const riskAnalysis = await analyzeHiddenInfluenceRisk(organizationId);

        result.hiddenInfluencerResult = {
          totalIdentified: hiddenResult.stats.totalIdentified,
          byType: hiddenResult.stats.byType,
          riskLevel: riskAnalysis.riskLevel,
        };

        // Create insights for hidden influencers
        const alerts = await this.createHiddenInfluencerInsights(
          context,
          organizationId,
          hiddenResult,
          riskAnalysis
        );
        result.alertsGenerated += alerts;

        context.logger.info('Hidden influencer detection completed', result.hiddenInfluencerResult);
      } catch (error) {
        context.logger.error('Hidden influencer detection failed', error as Error);
      }

      currentStep++;
    }

    // Run pattern analysis
    if (typesToRun.includes('patterns')) {
      await this.updateProgress(job, {
        current: currentStep,
        total: totalSteps,
        stage: 'patterns',
        message: 'Analyzing communication patterns...',
      });

      try {
        const patternResult = await analyzePatterns(organizationId, {
          timeframeDays: options.timeframeDays,
        });

        result.patternResult = {
          analyzed: patternResult.patterns.length,
          communicationHealth: patternResult.organizationTrends.communicationHealth,
          siloRisk: patternResult.organizationTrends.siloRisk,
          alertCount: patternResult.alerts.length,
        };

        // Create insights from pattern alerts
        const alerts = await this.createPatternInsights(
          context,
          organizationId,
          patternResult
        );
        result.alertsGenerated += alerts;

        context.logger.info('Pattern analysis completed', result.patternResult);
      } catch (error) {
        context.logger.error('Pattern analysis failed', error as Error);
      }

      currentStep++;
    }

    result.duration = Date.now() - startTime;
    result.completedAt = new Date();

    // Update analysis job record if provided
    if (job.data.analysisJobId) {
      await this.updateAnalysisJobRecord(context, job.data.analysisJobId, result);
    }

    context.logger.info('Network analysis completed', {
      duration: result.duration,
      alertsGenerated: result.alertsGenerated,
    });

    return result;
  }

  /**
   * Create insights from community detection
   */
  private async createCommunityInsights(
    context: ProcessorContext,
    organizationId: string,
    communityResult: CommunityDetectionResult
  ): Promise<number> {
    let alertsCreated = 0;

    // Alert for low modularity (weak community structure)
    if (communityResult.modularity < 0.3) {
      await this.saveInsight(context, {
        organizationId,
        type: 'weak_community_structure',
        category: 'network',
        severity: 'medium',
        title: 'Weak Community Structure',
        description: `Network modularity is ${(communityResult.modularity * 100).toFixed(0)}%, indicating weak community boundaries. This may suggest siloed teams or poor collaboration.`,
        entityType: 'organization',
        entityId: organizationId,
        score: (1 - communityResult.modularity) * 100,
        metadata: {
          modularity: communityResult.modularity,
          communityCount: communityResult.stats.totalCommunities,
        },
        recommendedActions: [
          'Review cross-team collaboration initiatives',
          'Consider team restructuring or integration activities',
        ],
      });
      alertsCreated++;
    }

    // Alert for isolated nodes
    if (communityResult.stats.isolatedNodes > 5) {
      await this.saveInsight(context, {
        organizationId,
        type: 'isolated_employees',
        category: 'network',
        severity: 'medium',
        title: 'Isolated Employees Detected',
        description: `${communityResult.stats.isolatedNodes} employees have minimal network connections and may be at risk of isolation.`,
        entityType: 'organization',
        entityId: organizationId,
        score: Math.min(communityResult.stats.isolatedNodes * 10, 100),
        metadata: {
          isolatedCount: communityResult.stats.isolatedNodes,
        },
        recommendedActions: [
          'Identify and reach out to isolated employees',
          'Implement onboarding buddies or mentoring programs',
        ],
      });
      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Create insights from hierarchy comparison
   */
  private async createHierarchyInsights(
    context: ProcessorContext,
    organizationId: string,
    hierarchyResult: HierarchyComparison
  ): Promise<number> {
    let alertsCreated = 0;

    // Alert for low alignment
    if (hierarchyResult.metrics.alignmentScore < 0.5) {
      await this.saveInsight(context, {
        organizationId,
        type: 'hierarchy_misalignment',
        category: 'network',
        severity: 'high',
        title: 'Significant Hierarchy Misalignment',
        description: `Only ${(hierarchyResult.metrics.alignmentScore * 100).toFixed(0)}% alignment between formal hierarchy and actual influence patterns. This may indicate organizational structure issues.`,
        entityType: 'organization',
        entityId: organizationId,
        score: (1 - hierarchyResult.metrics.alignmentScore) * 100,
        metadata: {
          alignmentScore: hierarchyResult.metrics.alignmentScore,
          shadowLeaders: hierarchyResult.metrics.shadowLeaderCount,
          underLeveraged: hierarchyResult.metrics.underLeveragedCount,
        },
        recommendedActions: [
          'Review organizational structure',
          'Consider formalizing shadow leader roles',
          'Investigate under-leveraged leaders',
        ],
      });
      alertsCreated++;
    }

    // Alert for many shadow leaders
    if (hierarchyResult.metrics.shadowLeaderCount > 3) {
      await this.saveInsight(context, {
        organizationId,
        type: 'shadow_leaders_detected',
        category: 'network',
        severity: 'medium',
        title: 'Multiple Shadow Leaders Identified',
        description: `${hierarchyResult.metrics.shadowLeaderCount} individuals have high influence without formal authority. Consider recognizing their contributions.`,
        entityType: 'organization',
        entityId: organizationId,
        score: Math.min(hierarchyResult.metrics.shadowLeaderCount * 15, 100),
        metadata: {
          count: hierarchyResult.metrics.shadowLeaderCount,
        },
        recommendedActions: [
          'Evaluate shadow leaders for formal recognition',
          'Consider expanding their formal responsibilities',
        ],
      });
      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Create insights from hidden influencer detection
   */
  private async createHiddenInfluencerInsights(
    context: ProcessorContext,
    organizationId: string,
    hiddenResult: HiddenInfluencerResult,
    riskAnalysis: { riskLevel: string; keyPersonRisks: Array<{ email: string; riskType: string }>; overallRecommendations: string[] }
  ): Promise<number> {
    let alertsCreated = 0;

    // Alert for high/critical risk
    if (riskAnalysis.riskLevel === 'high' || riskAnalysis.riskLevel === 'critical') {
      await this.saveInsight(context, {
        organizationId,
        type: 'hidden_influence_risk',
        category: 'network',
        severity: riskAnalysis.riskLevel === 'critical' ? 'critical' : 'high',
        title: 'Hidden Influence Risk Detected',
        description: `${riskAnalysis.riskLevel.toUpperCase()} risk level due to ${riskAnalysis.keyPersonRisks.length} key person dependencies.`,
        entityType: 'organization',
        entityId: organizationId,
        score: riskAnalysis.riskLevel === 'critical' ? 90 : 70,
        metadata: {
          riskLevel: riskAnalysis.riskLevel,
          keyPersonCount: riskAnalysis.keyPersonRisks.length,
          byType: hiddenResult.stats.byType,
        },
        recommendedActions: riskAnalysis.overallRecommendations,
      });
      alertsCreated++;
    }

    // Individual insights for high-confidence hidden influencers
    for (const influencer of hiddenResult.hiddenInfluencers.slice(0, 5)) {
      if (influencer.confidenceScore > 0.8) {
        await this.saveInsight(context, {
          organizationId,
          type: 'hidden_influencer',
          category: 'people',
          severity: 'medium',
          title: `Hidden Influencer: ${influencer.displayName || influencer.email}`,
          description: `${influencer.hiddenInfluenceType.replace('-', ' ')} with ${(influencer.confidenceScore * 100).toFixed(0)}% confidence. Has significant influence beyond formal position.`,
          entityType: 'person',
          entityId: influencer.email,
          score: influencer.confidenceScore * 100,
          metadata: {
            type: influencer.hiddenInfluenceType,
            indicators: influencer.indicators,
            formalLevel: influencer.formalLevel,
            actualLevel: influencer.actualLevel,
          },
          recommendedActions: influencer.recommendations,
        });
        alertsCreated++;
      }
    }

    return alertsCreated;
  }

  /**
   * Create insights from pattern analysis
   */
  private async createPatternInsights(
    context: ProcessorContext,
    organizationId: string,
    patternResult: PatternAnalysisResult
  ): Promise<number> {
    let alertsCreated = 0;

    // Create insights from pattern alerts
    for (const alert of patternResult.alerts) {
      const severityMap: Record<string, string> = {
        info: 'low',
        warning: 'medium',
        critical: 'critical',
      };

      await this.saveInsight(context, {
        organizationId,
        type: `pattern_${alert.type}`,
        category: 'network',
        severity: severityMap[alert.severity] || 'medium',
        title: alert.message,
        description: `${alert.affectedPeople.length} people affected. ${alert.recommendation}`,
        entityType: 'organization',
        entityId: organizationId,
        score: alert.severity === 'critical' ? 90 : alert.severity === 'warning' ? 60 : 30,
        metadata: {
          type: alert.type,
          affectedCount: alert.affectedPeople.length,
          affectedPeople: alert.affectedPeople.slice(0, 10),
        },
        recommendedActions: [alert.recommendation],
      });
      alertsCreated++;
    }

    // Alert for concerning communication health
    if (patternResult.organizationTrends.communicationHealth === 'concerning') {
      await this.saveInsight(context, {
        organizationId,
        type: 'communication_health_concern',
        category: 'network',
        severity: 'high',
        title: 'Communication Health Concerning',
        description: `Organization-wide communication health is concerning. High after-hours work (${(patternResult.organizationTrends.avgAfterHoursRatio * 100).toFixed(0)}%) and silo risk (${(patternResult.organizationTrends.siloRisk * 100).toFixed(0)}%).`,
        entityType: 'organization',
        entityId: organizationId,
        score: 80,
        metadata: {
          health: patternResult.organizationTrends.communicationHealth,
          afterHoursRatio: patternResult.organizationTrends.avgAfterHoursRatio,
          siloRisk: patternResult.organizationTrends.siloRisk,
          collaborationScore: patternResult.organizationTrends.collaborationScore,
        },
        recommendedActions: [
          'Review workload distribution',
          'Implement work-life balance initiatives',
          'Strengthen cross-team collaboration',
        ],
      });
      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Save insight to database
   */
  private async saveInsight(
    context: ProcessorContext,
    insight: InsightRecord
  ): Promise<void> {
    try {
      // Check for existing similar insight
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
        // Update existing
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
        // Insert new
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
    } catch (error) {
      context.logger.warn('Failed to save insight', { error, type: insight.type });
    }
  }

  /**
   * Update analysis job record
   */
  private async updateAnalysisJobRecord(
    context: ProcessorContext,
    analysisJobId: string,
    result: NetworkAnalysisJobResult
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
          networkNodes: result.networkResult?.nodeCount,
          centralityCalculated: result.centralityResult?.calculated,
          influenceCalculated: result.influenceResult?.calculated,
          communitiesDetected: result.communityResult?.communityCount,
          hierarchyAlignment: result.hierarchyResult?.alignmentScore,
          hiddenInfluencers: result.hiddenInfluencerResult?.totalIdentified,
          patternsAnalyzed: result.patternResult?.analyzed,
          alertsGenerated: result.alertsGenerated,
        }),
        analysisJobId,
      ]);
    } catch (error) {
      context.logger.warn('Failed to update analysis job record', { error });
    }
  }
}

// Factory function
export function createNetworkAnalysisProcessor(
  prisma: PrismaClient,
  pool: Pool
): NetworkAnalysisProcessor {
  return new NetworkAnalysisProcessor(prisma, pool);
}
