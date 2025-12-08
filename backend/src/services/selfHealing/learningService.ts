/**
 * Learning Service
 * T145 - Create learning service
 * T146 - Implement pattern history analyzer
 * T147 - Create resolution suggester
 *
 * Learns from pattern occurrences and suggests resolutions
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import type {
  PatternType,
  DetectedPattern,
  LearnedPattern,
  ResolutionSuggestion,
  AutomatedAction,
} from 'shared/types/selfHealing.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface PatternAnalysis {
  patternType: PatternType;
  occurrences: number;
  avgResolutionTimeMinutes: number;
  successRate: number;
  commonTriggers: string[];
  commonResolutions: ResolutionInfo[];
  trend: 'increasing' | 'decreasing' | 'stable';
  seasonality?: SeasonalityPattern;
}

export interface ResolutionInfo {
  actionType: string;
  usageCount: number;
  successRate: number;
  avgTimeToResolution: number;
}

export interface SeasonalityPattern {
  peakHours: number[];
  peakDays: number[];
  peakWeeks?: number[];
}

export interface LearningResult {
  newPatterns: LearnedPattern[];
  updatedPatterns: LearnedPattern[];
  suggestions: ResolutionSuggestion[];
}

export interface LearningConfig {
  /** Minimum occurrences to consider a pattern */
  minOccurrences: number;
  /** Minimum success rate to suggest (0-1) */
  minSuccessRate: number;
  /** Days of history to analyze */
  analysisWindowDays: number;
  /** Confidence threshold for suggestions */
  confidenceThreshold: number;
}

const DEFAULT_CONFIG: LearningConfig = {
  minOccurrences: 5,
  minSuccessRate: 0.7,
  analysisWindowDays: 30,
  confidenceThreshold: 0.6,
};

// =============================================================================
// Learning Service Functions
// =============================================================================

/**
 * Run learning analysis for an organization
 */
export async function runLearningAnalysis(
  organizationId: string,
  config: Partial<LearningConfig> = {}
): Promise<LearningResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  logger.info({ organizationId }, 'Starting learning analysis');

  const result: LearningResult = {
    newPatterns: [],
    updatedPatterns: [],
    suggestions: [],
  };

  try {
    // Analyze pattern history
    const analyses = await analyzePatternHistory(organizationId, cfg);

    // Process each pattern analysis
    for (const analysis of analyses) {
      // Check if we have an existing learned pattern
      const existing = await prisma.learnedPattern.findFirst({
        where: {
          organizationId,
          patternType: analysis.patternType,
        },
      });

      if (existing) {
        // Update existing pattern
        const updated = await updateLearnedPattern(existing.id, analysis);
        result.updatedPatterns.push(mapToLearnedPattern(updated));
      } else if (analysis.occurrences >= cfg.minOccurrences) {
        // Create new learned pattern
        const created = await createLearnedPattern(organizationId, analysis);
        result.newPatterns.push(mapToLearnedPattern(created));
      }

      // Generate resolution suggestions
      if (analysis.commonResolutions.length > 0) {
        const suggestions = await generateSuggestions(
          organizationId,
          analysis,
          cfg
        );
        result.suggestions.push(...suggestions);
      }
    }

    logger.info(
      {
        organizationId,
        newPatterns: result.newPatterns.length,
        updatedPatterns: result.updatedPatterns.length,
        suggestions: result.suggestions.length,
      },
      'Learning analysis completed'
    );

    return result;
  } catch (error) {
    logger.error({ error, organizationId }, 'Learning analysis failed');
    throw error;
  }
}

// =============================================================================
// Pattern History Analyzer (T146)
// =============================================================================

/**
 * Analyze pattern history to identify trends and common resolutions
 */
export async function analyzePatternHistory(
  organizationId: string,
  config: LearningConfig
): Promise<PatternAnalysis[]> {
  const since = new Date(
    Date.now() - config.analysisWindowDays * 24 * 60 * 60 * 1000
  );

  // Get pattern occurrences grouped by type
  const patternTypes: PatternType[] = [
    'stuck_process',
    'integration_failure',
    'workload_imbalance',
    'approval_bottleneck',
    'response_delay',
    'repeated_errors',
    'communication_gap',
  ];

  const analyses: PatternAnalysis[] = [];

  for (const patternType of patternTypes) {
    const analysis = await analyzePatternType(
      organizationId,
      patternType,
      since,
      config
    );

    if (analysis.occurrences > 0) {
      analyses.push(analysis);
    }
  }

  return analyses;
}

/**
 * Analyze a specific pattern type
 */
async function analyzePatternType(
  organizationId: string,
  patternType: PatternType,
  since: Date,
  config: LearningConfig
): Promise<PatternAnalysis> {
  // Get executions triggered by this pattern type
  const executions = await prisma.actionExecution.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
      action: {
        triggerConfig: {
          path: ['patternType'],
          equals: patternType,
        },
      },
    },
    include: {
      action: { select: { actionType: true, triggerConfig: true } },
    },
  });

  // Calculate metrics
  const totalExecutions = executions.length;
  const successfulExecutions = executions.filter((e) => e.status === 'completed');
  const successRate = totalExecutions > 0
    ? successfulExecutions.length / totalExecutions
    : 0;

  // Calculate average resolution time
  let totalResolutionTime = 0;
  let resolutionsWithTime = 0;

  for (const exec of successfulExecutions) {
    if (exec.completedAt && exec.createdAt) {
      totalResolutionTime += exec.completedAt.getTime() - exec.createdAt.getTime();
      resolutionsWithTime++;
    }
  }

  const avgResolutionTimeMinutes =
    resolutionsWithTime > 0
      ? totalResolutionTime / resolutionsWithTime / (1000 * 60)
      : 0;

  // Find common resolutions (action types)
  const actionTypeCounts = new Map<string, { total: number; success: number; totalTime: number }>();

  for (const exec of executions) {
    const actionType = exec.action?.actionType || 'unknown';
    const current = actionTypeCounts.get(actionType) || { total: 0, success: 0, totalTime: 0 };

    current.total++;
    if (exec.status === 'completed') {
      current.success++;
      if (exec.completedAt && exec.createdAt) {
        current.totalTime += exec.completedAt.getTime() - exec.createdAt.getTime();
      }
    }

    actionTypeCounts.set(actionType, current);
  }

  const commonResolutions: ResolutionInfo[] = Array.from(actionTypeCounts.entries())
    .map(([actionType, counts]) => ({
      actionType,
      usageCount: counts.total,
      successRate: counts.total > 0 ? counts.success / counts.total : 0,
      avgTimeToResolution: counts.success > 0 ? counts.totalTime / counts.success / (1000 * 60) : 0,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  // Calculate trend
  const trend = calculateTrend(executions);

  // Find seasonality patterns
  const seasonality = findSeasonalityPatterns(executions);

  // Find common triggers
  const commonTriggers = await findCommonTriggers(organizationId, patternType, since);

  return {
    patternType,
    occurrences: totalExecutions,
    avgResolutionTimeMinutes,
    successRate,
    commonTriggers,
    commonResolutions,
    trend,
    seasonality,
  };
}

/**
 * Calculate trend from execution history
 */
function calculateTrend(
  executions: Array<{ createdAt: Date }>
): 'increasing' | 'decreasing' | 'stable' {
  if (executions.length < 10) return 'stable';

  // Split into first and second half
  const sorted = [...executions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  // Calculate occurrences per day for each half
  const firstHalfDays = firstHalf.length > 0
    ? (firstHalf[firstHalf.length - 1].createdAt.getTime() - firstHalf[0].createdAt.getTime()) / (24 * 60 * 60 * 1000)
    : 1;
  const secondHalfDays = secondHalf.length > 0
    ? (secondHalf[secondHalf.length - 1].createdAt.getTime() - secondHalf[0].createdAt.getTime()) / (24 * 60 * 60 * 1000)
    : 1;

  const firstRate = firstHalf.length / Math.max(firstHalfDays, 1);
  const secondRate = secondHalf.length / Math.max(secondHalfDays, 1);

  const changeRatio = secondRate / Math.max(firstRate, 0.1);

  if (changeRatio > 1.2) return 'increasing';
  if (changeRatio < 0.8) return 'decreasing';
  return 'stable';
}

/**
 * Find seasonality patterns in occurrences
 */
function findSeasonalityPatterns(
  executions: Array<{ createdAt: Date }>
): SeasonalityPattern | undefined {
  if (executions.length < 20) return undefined;

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);

  for (const exec of executions) {
    hourCounts[exec.createdAt.getHours()]++;
    dayCounts[exec.createdAt.getDay()]++;
  }

  // Find peak hours (above average)
  const avgHourCount = executions.length / 24;
  const peakHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > avgHourCount * 1.5)
    .map((h) => h.hour);

  // Find peak days
  const avgDayCount = executions.length / 7;
  const peakDays = dayCounts
    .map((count, day) => ({ day, count }))
    .filter((d) => d.count > avgDayCount * 1.5)
    .map((d) => d.day);

  if (peakHours.length === 0 && peakDays.length === 0) return undefined;

  return { peakHours, peakDays };
}

/**
 * Find common triggers for a pattern type
 */
async function findCommonTriggers(
  organizationId: string,
  patternType: PatternType,
  since: Date
): Promise<string[]> {
  // Query audit logs for pattern detections
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      organizationId,
      eventType: 'pattern_detected',
      createdAt: { gte: since },
      details: {
        path: ['patternType'],
        equals: patternType,
      },
    },
    select: { details: true },
    take: 100,
  });

  // Extract common triggers from details
  const triggerCounts = new Map<string, number>();

  for (const log of auditLogs) {
    const details = log.details as {
      description?: string;
      affectedEntities?: Array<{ type: string }>;
    };

    // Extract entity types as triggers
    if (details.affectedEntities) {
      for (const entity of details.affectedEntities) {
        const trigger = entity.type;
        triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
      }
    }
  }

  return Array.from(triggerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([trigger]) => trigger);
}

// =============================================================================
// Resolution Suggester (T147)
// =============================================================================

/**
 * Generate resolution suggestions based on pattern analysis
 */
export async function generateSuggestions(
  organizationId: string,
  analysis: PatternAnalysis,
  config: LearningConfig
): Promise<ResolutionSuggestion[]> {
  const suggestions: ResolutionSuggestion[] = [];

  // Get existing actions for this organization
  const existingActions = await prisma.automatedAction.findMany({
    where: {
      organizationId,
      triggerConfig: {
        path: ['patternType'],
        equals: analysis.patternType,
      },
    },
  });

  // Find the best resolution that isn't already configured
  const existingActionTypes = new Set(existingActions.map((a) => a.actionType));

  for (const resolution of analysis.commonResolutions) {
    if (
      resolution.successRate >= config.minSuccessRate &&
      !existingActionTypes.has(resolution.actionType)
    ) {
      const confidence = calculateConfidence(resolution, analysis);

      if (confidence >= config.confidenceThreshold) {
        const suggestion = createSuggestion(
          analysis,
          resolution,
          confidence,
          organizationId
        );
        suggestions.push(suggestion);
      }
    }
  }

  // Also suggest based on pattern characteristics
  const characteristicSuggestions = suggestBasedOnCharacteristics(analysis, config);
  suggestions.push(...characteristicSuggestions);

  return suggestions;
}

/**
 * Calculate confidence score for a suggestion
 */
function calculateConfidence(
  resolution: ResolutionInfo,
  analysis: PatternAnalysis
): number {
  // Factors that increase confidence:
  // - High success rate
  // - High usage count relative to occurrences
  // - Low variance in resolution time

  const successWeight = 0.5;
  const usageWeight = 0.3;
  const consistencyWeight = 0.2;

  const successScore = resolution.successRate;
  const usageScore = Math.min(1, resolution.usageCount / Math.max(analysis.occurrences, 1));

  // Consistency bonus if resolution time is reasonable
  const consistencyScore =
    resolution.avgTimeToResolution > 0 && resolution.avgTimeToResolution < 60 ? 1 : 0.5;

  return (
    successScore * successWeight +
    usageScore * usageWeight +
    consistencyScore * consistencyWeight
  );
}

/**
 * Create a resolution suggestion
 */
function createSuggestion(
  analysis: PatternAnalysis,
  resolution: ResolutionInfo,
  confidence: number,
  organizationId: string
): ResolutionSuggestion {
  const suggestedAction: Partial<AutomatedAction> = {
    name: `Auto-${resolution.actionType} for ${analysis.patternType}`,
    description: `Automatically ${resolution.actionType} when ${analysis.patternType} is detected`,
    triggerType: 'pattern',
    triggerConfig: {
      type: 'pattern',
      patternType: analysis.patternType,
    },
    actionType: resolution.actionType as AutomatedAction['actionType'],
    actionConfig: getDefaultActionConfig(resolution.actionType),
    requiresApproval: confidence < 0.8,
    isActive: false,
    organizationId,
  };

  return {
    patternId: `suggested-${analysis.patternType}`,
    patternDescription: `${analysis.patternType} (${analysis.occurrences} occurrences, ${Math.round(analysis.successRate * 100)}% resolution rate)`,
    suggestedAction,
    confidence,
    basedOnHistory: analysis.occurrences,
  };
}

/**
 * Get default action configuration for an action type
 */
function getDefaultActionConfig(actionType: string): Record<string, unknown> {
  switch (actionType) {
    case 'reminder':
      return {
        type: 'reminder',
        target: 'assigned_person',
        messageTemplate: 'Please review: {{pattern.description}}',
        channel: 'in_app',
        repeatIntervalMinutes: 60,
        maxReminders: 3,
      };
    case 'escalation':
      return {
        type: 'escalation',
        escalationChain: [
          { level: 1, targetType: 'manager', waitMinutes: 60 },
          { level: 2, targetType: 'role', role: 'supervisor', waitMinutes: 120 },
        ],
        includeContext: true,
        skipUnavailable: true,
      };
    case 'retry':
      return {
        type: 'retry',
        targetType: 'job',
        maxAttempts: 3,
        delaySeconds: 300,
        backoffMultiplier: 2,
      };
    case 'redistribute':
      return {
        type: 'redistribute',
        strategy: 'least_loaded',
        targetPool: [],
        preserveHistory: true,
      };
    default:
      return { type: actionType };
  }
}

/**
 * Suggest actions based on pattern characteristics
 */
function suggestBasedOnCharacteristics(
  analysis: PatternAnalysis,
  config: LearningConfig
): ResolutionSuggestion[] {
  const suggestions: ResolutionSuggestion[] = [];

  // Suggest based on trend
  if (analysis.trend === 'increasing' && analysis.occurrences >= config.minOccurrences) {
    suggestions.push({
      patternId: `trend-${analysis.patternType}`,
      patternDescription: `${analysis.patternType} is increasing in frequency`,
      suggestedAction: {
        name: `Alert on increasing ${analysis.patternType}`,
        actionType: 'notify',
        actionConfig: {
          type: 'notify',
          recipients: [{ type: 'role', id: 'admin', channel: 'email' }],
          messageTemplate: `Pattern ${analysis.patternType} is occurring more frequently`,
          severity: 'warning',
          includeData: true,
        },
      },
      confidence: 0.7,
      basedOnHistory: analysis.occurrences,
    });
  }

  // Suggest based on seasonality
  if (analysis.seasonality && analysis.seasonality.peakHours.length > 0) {
    suggestions.push({
      patternId: `seasonality-${analysis.patternType}`,
      patternDescription: `${analysis.patternType} peaks during specific hours`,
      suggestedAction: {
        name: `Preventive check for ${analysis.patternType}`,
        triggerType: 'schedule',
        triggerConfig: {
          type: 'schedule',
          cronExpression: `0 ${analysis.seasonality.peakHours[0] - 1} * * *`,
          timezone: 'UTC',
        },
        actionType: 'notify',
      },
      confidence: 0.6,
      basedOnHistory: analysis.occurrences,
    });
  }

  return suggestions;
}

// =============================================================================
// Learned Pattern Management
// =============================================================================

/**
 * Create a new learned pattern
 */
async function createLearnedPattern(
  organizationId: string,
  analysis: PatternAnalysis
): Promise<{ id: string; patternType: string }> {
  const pattern = await prisma.learnedPattern.create({
    data: {
      id: `lp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      organizationId,
      patternType: analysis.patternType,
      description: `Learned pattern: ${analysis.patternType}`,
      detectionCriteria: {
        occurrences: analysis.occurrences,
        trend: analysis.trend,
        commonTriggers: analysis.commonTriggers,
      },
      suggestedResolution: analysis.commonResolutions[0]?.actionType || 'notify',
      successRate: analysis.successRate,
      occurrenceCount: analysis.occurrences,
      lastOccurrence: new Date(),
      isApproved: false,
      createdAt: new Date(),
    },
  });

  logger.info({ patternId: pattern.id, patternType: analysis.patternType }, 'Created learned pattern');
  return pattern;
}

/**
 * Update an existing learned pattern
 */
async function updateLearnedPattern(
  patternId: string,
  analysis: PatternAnalysis
): Promise<{ id: string; patternType: string }> {
  const pattern = await prisma.learnedPattern.update({
    where: { id: patternId },
    data: {
      detectionCriteria: {
        occurrences: analysis.occurrences,
        trend: analysis.trend,
        commonTriggers: analysis.commonTriggers,
      },
      successRate: analysis.successRate,
      occurrenceCount: { increment: analysis.occurrences },
      lastOccurrence: new Date(),
    },
  });

  logger.debug({ patternId, patternType: analysis.patternType }, 'Updated learned pattern');
  return pattern;
}

/**
 * Map database record to LearnedPattern type
 */
function mapToLearnedPattern(record: {
  id: string;
  patternType: string;
  description: string;
  detectionCriteria: unknown;
  suggestedResolution: string;
  successRate: number;
  occurrenceCount: number;
  lastOccurrence: Date;
  isApproved: boolean;
  approvedBy: string | null;
  createdAt: Date;
}): LearnedPattern {
  return {
    id: record.id,
    patternType: record.patternType,
    description: record.description,
    detectionCriteria: record.detectionCriteria as Record<string, unknown>,
    suggestedResolution: record.suggestedResolution,
    successRate: record.successRate,
    occurrenceCount: record.occurrenceCount,
    lastOccurrence: record.lastOccurrence,
    isApproved: record.isApproved,
    approvedBy: record.approvedBy || undefined,
    createdAt: record.createdAt,
  };
}

/**
 * Get all learned patterns for an organization
 */
export async function getLearnedPatterns(
  organizationId: string
): Promise<LearnedPattern[]> {
  const patterns = await prisma.learnedPattern.findMany({
    where: { organizationId },
    orderBy: { occurrenceCount: 'desc' },
  });

  return patterns.map(mapToLearnedPattern);
}

/**
 * Approve a learned pattern
 */
export async function approveLearnedPattern(
  patternId: string,
  approvedBy: string
): Promise<LearnedPattern> {
  const pattern = await prisma.learnedPattern.update({
    where: { id: patternId },
    data: {
      isApproved: true,
      approvedBy,
    },
  });

  return mapToLearnedPattern(pattern);
}

export default {
  runLearningAnalysis,
  analyzePatternHistory,
  generateSuggestions,
  getLearnedPatterns,
  approveLearnedPattern,
  DEFAULT_CONFIG,
};
