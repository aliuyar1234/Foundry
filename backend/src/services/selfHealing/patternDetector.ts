/**
 * Pattern Detector Service
 * T131 - Create pattern detector service
 *
 * Detects operational patterns that may require self-healing actions
 */

import { logger } from '../../lib/logger.js';
import type {
  PatternType,
  DetectedPattern,
  AffectedEntity,
} from 'shared/types/selfHealing.js';
import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface PatternDetectorConfig {
  organizationId: string;
  patternTypes?: PatternType[];
  timeWindowMinutes?: number;
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface PatternDetectionResult {
  patterns: DetectedPattern[];
  scannedAt: Date;
  scanDurationMs: number;
  organizationId: string;
}

export interface PatternDetectorPlugin {
  patternType: PatternType;
  detect: (
    organizationId: string,
    timeWindowMinutes: number
  ) => Promise<DetectedPattern[]>;
}

// =============================================================================
// Pattern Detector Registry
// =============================================================================

const detectorPlugins: Map<PatternType, PatternDetectorPlugin> = new Map();

/**
 * Register a pattern detector plugin
 */
export function registerDetector(plugin: PatternDetectorPlugin): void {
  detectorPlugins.set(plugin.patternType, plugin);
  logger.info({ patternType: plugin.patternType }, 'Registered pattern detector');
}

/**
 * Get all registered detector types
 */
export function getRegisteredDetectors(): PatternType[] {
  return Array.from(detectorPlugins.keys());
}

// =============================================================================
// Main Detection Functions
// =============================================================================

/**
 * Run all pattern detectors and return detected patterns
 */
export async function detectPatterns(
  config: PatternDetectorConfig
): Promise<PatternDetectionResult> {
  const startTime = Date.now();
  const { organizationId, patternTypes, timeWindowMinutes = 60 } = config;

  logger.info({ organizationId, patternTypes }, 'Starting pattern detection');

  const patterns: DetectedPattern[] = [];

  // Determine which detectors to run
  const detectorsToRun =
    patternTypes && patternTypes.length > 0
      ? patternTypes
      : Array.from(detectorPlugins.keys());

  // Run each detector
  for (const patternType of detectorsToRun) {
    const plugin = detectorPlugins.get(patternType);
    if (!plugin) {
      logger.warn({ patternType }, 'No detector registered for pattern type');
      continue;
    }

    try {
      const detected = await plugin.detect(organizationId, timeWindowMinutes);
      patterns.push(...detected);
    } catch (error) {
      logger.error(
        { error, patternType },
        'Pattern detection failed for type'
      );
    }
  }

  // Filter by minimum severity if specified
  const filteredPatterns = config.minSeverity
    ? patterns.filter((p) => severityLevel(p.severity) >= severityLevel(config.minSeverity!))
    : patterns;

  // Sort by severity and recency
  filteredPatterns.sort((a, b) => {
    const severityDiff = severityLevel(b.severity) - severityLevel(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return b.lastDetectedAt.getTime() - a.lastDetectedAt.getTime();
  });

  const result: PatternDetectionResult = {
    patterns: filteredPatterns,
    scannedAt: new Date(),
    scanDurationMs: Date.now() - startTime,
    organizationId,
  };

  logger.info(
    {
      organizationId,
      patternsDetected: filteredPatterns.length,
      durationMs: result.scanDurationMs,
    },
    'Pattern detection completed'
  );

  return result;
}

/**
 * Detect a specific pattern type
 */
export async function detectPatternType(
  organizationId: string,
  patternType: PatternType,
  timeWindowMinutes: number = 60
): Promise<DetectedPattern[]> {
  const plugin = detectorPlugins.get(patternType);
  if (!plugin) {
    throw new Error(`No detector registered for pattern type: ${patternType}`);
  }

  return plugin.detect(organizationId, timeWindowMinutes);
}

/**
 * Match detected patterns against configured actions
 */
export async function matchPatternsToActions(
  organizationId: string,
  patterns: DetectedPattern[]
): Promise<Map<string, string[]>> {
  const patternToActions = new Map<string, string[]>();

  // Get all active automated actions for this organization
  const actions = await prisma.automatedAction.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      triggerConfig: true,
    },
  });

  for (const pattern of patterns) {
    const matchingActions: string[] = [];

    for (const action of actions) {
      const triggerConfig = action.triggerConfig as { type: string; patternType?: string };
      if (
        triggerConfig.type === 'pattern' &&
        triggerConfig.patternType === pattern.type
      ) {
        matchingActions.push(action.id);
      }
    }

    pattern.matchedActions = matchingActions;
    patternToActions.set(pattern.id, matchingActions);
  }

  return patternToActions;
}

// =============================================================================
// Pattern Analysis Functions
// =============================================================================

/**
 * Analyze pattern trends over time
 */
export async function analyzePatternTrends(
  organizationId: string,
  patternType: PatternType,
  days: number = 30
): Promise<{
  occurrences: Array<{ date: Date; count: number }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  averageFrequency: number;
}> {
  // This would query historical pattern data
  // For now, return placeholder
  return {
    occurrences: [],
    trend: 'stable',
    averageFrequency: 0,
  };
}

/**
 * Get pattern statistics for an organization
 */
export async function getPatternStatistics(
  organizationId: string
): Promise<{
  totalDetected: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  recentPatterns: DetectedPattern[];
}> {
  const result = await detectPatterns({
    organizationId,
    timeWindowMinutes: 24 * 60, // Last 24 hours
  });

  const bySeverity: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  const byType: Record<string, number> = {};

  for (const pattern of result.patterns) {
    bySeverity[pattern.severity]++;
    byType[pattern.type] = (byType[pattern.type] || 0) + 1;
  }

  return {
    totalDetected: result.patterns.length,
    bySeverity,
    byType,
    recentPatterns: result.patterns.slice(0, 10),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function severityLevel(severity: 'low' | 'medium' | 'high' | 'critical'): number {
  const levels: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return levels[severity] || 0;
}

/**
 * Create a detected pattern object
 */
export function createDetectedPattern(
  type: PatternType,
  description: string,
  severity: DetectedPattern['severity'],
  affectedEntities: AffectedEntity[],
  suggestedActions: string[] = []
): DetectedPattern {
  return {
    id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    description,
    severity,
    affectedEntities,
    occurrences: 1,
    firstDetectedAt: new Date(),
    lastDetectedAt: new Date(),
    suggestedActions,
    matchedActions: [],
  };
}

/**
 * Merge similar patterns detected in the same scan
 */
export function mergePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  const merged = new Map<string, DetectedPattern>();

  for (const pattern of patterns) {
    // Create a key based on type and affected entities
    const entityKey = pattern.affectedEntities
      .map((e) => `${e.type}:${e.id}`)
      .sort()
      .join('|');
    const key = `${pattern.type}:${entityKey}`;

    const existing = merged.get(key);
    if (existing) {
      // Merge occurrences
      existing.occurrences += pattern.occurrences;
      existing.lastDetectedAt = new Date(
        Math.max(
          existing.lastDetectedAt.getTime(),
          pattern.lastDetectedAt.getTime()
        )
      );
      existing.firstDetectedAt = new Date(
        Math.min(
          existing.firstDetectedAt.getTime(),
          pattern.firstDetectedAt.getTime()
        )
      );
      // Keep highest severity
      if (severityLevel(pattern.severity) > severityLevel(existing.severity)) {
        existing.severity = pattern.severity;
      }
    } else {
      merged.set(key, { ...pattern });
    }
  }

  return Array.from(merged.values());
}

export default {
  detectPatterns,
  detectPatternType,
  matchPatternsToActions,
  analyzePatternTrends,
  getPatternStatistics,
  registerDetector,
  getRegisteredDetectors,
  createDetectedPattern,
  mergePatterns,
};
