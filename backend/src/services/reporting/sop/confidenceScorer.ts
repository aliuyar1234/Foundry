/**
 * Confidence Score Calculator
 * Calculates confidence scores for SOP generation based on input data quality
 */

import { ProcessData } from './inputFormatter.js';

export interface ConfidenceScore {
  overall: number;
  dataCompleteness: number;
  processComplexity: number;
  dataConsistency: number;
  sampleSize: number;
  breakdown: ConfidenceBreakdown;
  recommendations: string[];
}

export interface ConfidenceBreakdown {
  hasDescription: boolean;
  hasSteps: boolean;
  hasMetrics: boolean;
  hasParticipants: boolean;
  hasSystems: boolean;
  hasVariants: boolean;
  stepCompleteness: number;
  metricsQuality: number;
  participantCoverage: number;
}

interface ScoringWeights {
  dataCompleteness: number;
  processComplexity: number;
  dataConsistency: number;
  sampleSize: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  dataCompleteness: 0.35,
  processComplexity: 0.25,
  dataConsistency: 0.25,
  sampleSize: 0.15,
};

/**
 * Calculate confidence score for SOP generation
 */
export function calculateConfidenceScore(
  processData: ProcessData,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ConfidenceScore {
  const breakdown = calculateBreakdown(processData);
  const recommendations: string[] = [];

  // Calculate individual scores
  const dataCompleteness = calculateDataCompletenessScore(processData, breakdown, recommendations);
  const processComplexity = calculateProcessComplexityScore(processData, breakdown, recommendations);
  const dataConsistency = calculateDataConsistencyScore(processData, breakdown, recommendations);
  const sampleSize = calculateSampleSizeScore(processData, breakdown, recommendations);

  // Calculate weighted overall score
  const overall = Math.round(
    dataCompleteness * weights.dataCompleteness +
    processComplexity * weights.processComplexity +
    dataConsistency * weights.dataConsistency +
    sampleSize * weights.sampleSize
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    dataCompleteness: Math.round(dataCompleteness),
    processComplexity: Math.round(processComplexity),
    dataConsistency: Math.round(dataConsistency),
    sampleSize: Math.round(sampleSize),
    breakdown,
    recommendations,
  };
}

/**
 * Calculate breakdown of available data
 */
function calculateBreakdown(processData: ProcessData): ConfidenceBreakdown {
  const steps = processData.steps || [];

  // Calculate step completeness (how many steps have full data)
  let stepCompleteness = 0;
  if (steps.length > 0) {
    const completeSteps = steps.filter((step) => {
      let score = 0;
      if (step.name) score += 1;
      if (step.description) score += 1;
      if (step.type) score += 1;
      if (step.performer) score += 1;
      if (step.metrics?.avgDuration) score += 1;
      return score >= 3; // At least 3 out of 5 fields
    });
    stepCompleteness = (completeSteps.length / steps.length) * 100;
  }

  // Calculate metrics quality
  let metricsQuality = 0;
  if (processData.metrics) {
    const metrics = processData.metrics;
    let metricCount = 0;
    if (metrics.avgCycleTime !== undefined) metricCount++;
    if (metrics.minCycleTime !== undefined) metricCount++;
    if (metrics.maxCycleTime !== undefined) metricCount++;
    if (metrics.avgSteps !== undefined) metricCount++;
    if (metrics.completionRate !== undefined) metricCount++;
    if (metrics.bottlenecks && metrics.bottlenecks.length > 0) metricCount++;
    metricsQuality = (metricCount / 6) * 100;
  }

  // Calculate participant coverage
  let participantCoverage = 0;
  if (steps.length > 0 && processData.participants && processData.participants.length > 0) {
    const stepsWithPerformers = steps.filter((s) => s.performer).length;
    participantCoverage = (stepsWithPerformers / steps.length) * 100;
  }

  return {
    hasDescription: !!processData.description,
    hasSteps: steps.length > 0,
    hasMetrics: !!processData.metrics,
    hasParticipants: (processData.participants?.length || 0) > 0,
    hasSystems: (processData.systems?.length || 0) > 0,
    hasVariants: (processData.variants?.length || 0) > 0,
    stepCompleteness,
    metricsQuality,
    participantCoverage,
  };
}

/**
 * Calculate data completeness score
 */
function calculateDataCompletenessScore(
  processData: ProcessData,
  breakdown: ConfidenceBreakdown,
  recommendations: string[]
): number {
  let score = 0;
  let maxScore = 0;

  // Process name and description (20 points)
  maxScore += 20;
  if (processData.name) score += 10;
  if (breakdown.hasDescription) {
    score += 10;
  } else {
    recommendations.push('Add a process description for better context');
  }

  // Steps (40 points)
  maxScore += 40;
  if (breakdown.hasSteps) {
    const stepCount = processData.steps?.length || 0;
    if (stepCount >= 5) {
      score += 20;
    } else if (stepCount >= 3) {
      score += 15;
    } else {
      score += 10;
      recommendations.push('Process has very few steps - verify completeness');
    }
    score += (breakdown.stepCompleteness / 100) * 20;
  } else {
    recommendations.push('Add process steps for a complete SOP');
  }

  // Metrics (20 points)
  maxScore += 20;
  if (breakdown.hasMetrics) {
    score += (breakdown.metricsQuality / 100) * 20;
  } else {
    recommendations.push('Add process metrics for timing and performance details');
  }

  // Participants (10 points)
  maxScore += 10;
  if (breakdown.hasParticipants) {
    score += Math.min(10, processData.participants!.length * 2);
  } else {
    recommendations.push('Identify participants/roles for responsibility assignment');
  }

  // Systems (10 points)
  maxScore += 10;
  if (breakdown.hasSystems) {
    score += Math.min(10, processData.systems!.length * 2);
  }

  return (score / maxScore) * 100;
}

/**
 * Calculate process complexity score (higher complexity = needs more data)
 */
function calculateProcessComplexityScore(
  processData: ProcessData,
  breakdown: ConfidenceBreakdown,
  recommendations: string[]
): number {
  const steps = processData.steps || [];
  let score = 100; // Start with 100 and reduce based on complexity without sufficient data

  // Decision points increase complexity
  const decisionSteps = steps.filter((s) =>
    s.type.toLowerCase().includes('decision') ||
    s.type.toLowerCase().includes('gateway')
  );

  if (decisionSteps.length > 0) {
    // Each decision point without conditions reduces confidence
    const decisionsWithConditions = decisionSteps.filter((s) =>
      s.transitions?.some((t) => t.condition)
    );
    const undocumentedDecisions = decisionSteps.length - decisionsWithConditions.length;

    if (undocumentedDecisions > 0) {
      score -= undocumentedDecisions * 10;
      recommendations.push(`${undocumentedDecisions} decision point(s) lack documented conditions`);
    }
  }

  // Multiple variants increase complexity
  if (breakdown.hasVariants && processData.variants) {
    const variantCount = processData.variants.length;
    if (variantCount > 5) {
      score -= 15;
      recommendations.push('Many process variants detected - consider documenting main paths');
    } else if (variantCount > 3) {
      score -= 10;
    }

    // Check if variants are well-documented
    const undocumentedVariants = processData.variants.filter((v) => !v.name).length;
    if (undocumentedVariants > 0) {
      score -= undocumentedVariants * 5;
    }
  }

  // Parallel paths increase complexity
  const stepsWithMultipleTransitions = steps.filter((s) =>
    (s.transitions?.length || 0) > 1
  );
  if (stepsWithMultipleTransitions.length > 3) {
    score -= 10;
  }

  // Long processes are more complex
  if (steps.length > 20) {
    score -= 15;
    recommendations.push('Long process detected - consider breaking into sub-procedures');
  } else if (steps.length > 15) {
    score -= 10;
  }

  return Math.max(0, score);
}

/**
 * Calculate data consistency score
 */
function calculateDataConsistencyScore(
  processData: ProcessData,
  breakdown: ConfidenceBreakdown,
  recommendations: string[]
): number {
  const steps = processData.steps || [];
  let score = 100;

  // Check for orphan steps (steps not connected to others)
  if (steps.length > 1) {
    const stepIds = new Set(steps.map((s) => s.id));
    const referencedIds = new Set<string>();
    const startSteps: string[] = [];
    const endSteps: string[] = [];

    for (const step of steps) {
      if (step.transitions) {
        for (const t of step.transitions) {
          referencedIds.add(t.targetStepId);
        }
      }

      if (step.type.toLowerCase().includes('start')) {
        startSteps.push(step.id);
      }
      if (step.type.toLowerCase().includes('end')) {
        endSteps.push(step.id);
      }
    }

    // Steps not referenced by any transition (except start)
    const orphanSteps = steps.filter((s) =>
      !referencedIds.has(s.id) && !s.type.toLowerCase().includes('start')
    );

    if (orphanSteps.length > 0) {
      score -= orphanSteps.length * 5;
      recommendations.push(`${orphanSteps.length} step(s) are not connected to the process flow`);
    }

    // Check for invalid references
    for (const step of steps) {
      if (step.transitions) {
        for (const t of step.transitions) {
          if (!stepIds.has(t.targetStepId)) {
            score -= 10;
            break;
          }
        }
      }
    }

    // Check for missing start/end
    if (startSteps.length === 0) {
      score -= 10;
      recommendations.push('No start step identified');
    }
    if (endSteps.length === 0) {
      score -= 10;
      recommendations.push('No end step identified');
    }
  }

  // Check participant consistency
  if (breakdown.hasParticipants && steps.length > 0) {
    const stepsWithPerformers = steps.filter((s) => s.performer).length;
    const coverageRatio = stepsWithPerformers / steps.length;

    if (coverageRatio < 0.5) {
      score -= 15;
      recommendations.push('Less than half of steps have assigned performers');
    } else if (coverageRatio < 0.8) {
      score -= 5;
    }
  }

  // Check metrics consistency
  if (processData.metrics) {
    const { avgCycleTime, minCycleTime, maxCycleTime } = processData.metrics;

    if (avgCycleTime !== undefined && minCycleTime !== undefined && maxCycleTime !== undefined) {
      if (avgCycleTime < minCycleTime || avgCycleTime > maxCycleTime) {
        score -= 15;
        recommendations.push('Process metrics appear inconsistent (avg not between min/max)');
      }
    }
  }

  return Math.max(0, score);
}

/**
 * Calculate sample size score (based on case count/frequency data)
 */
function calculateSampleSizeScore(
  processData: ProcessData,
  breakdown: ConfidenceBreakdown,
  recommendations: string[]
): number {
  let score = 50; // Default to 50 if no sample size data

  // Check total cases
  if (processData.metrics?.totalCases !== undefined) {
    const totalCases = processData.metrics.totalCases;

    if (totalCases >= 1000) {
      score = 100;
    } else if (totalCases >= 500) {
      score = 90;
    } else if (totalCases >= 100) {
      score = 80;
    } else if (totalCases >= 50) {
      score = 70;
    } else if (totalCases >= 20) {
      score = 60;
    } else {
      score = 40;
      recommendations.push('Small sample size - patterns may not be representative');
    }
  }

  // Check variant frequency totals
  if (breakdown.hasVariants && processData.variants) {
    const totalFrequency = processData.variants.reduce((sum, v) => sum + v.frequency, 0);
    const totalCases = processData.variants.reduce((sum, v) => sum + v.caseCount, 0);

    // Frequency should sum to ~100%
    if (Math.abs(totalFrequency - 100) > 10) {
      score -= 10;
    }

    // Use case count if available
    if (totalCases > 0 && score === 50) {
      if (totalCases >= 100) {
        score = 80;
      } else if (totalCases >= 50) {
        score = 70;
      } else {
        score = 60;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Get confidence level label
 */
export function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * Get confidence level description
 */
export function getConfidenceLevelDescription(score: number, language: 'en' | 'de' = 'en'): string {
  const level = getConfidenceLevel(score);

  if (language === 'de') {
    switch (level) {
      case 'high':
        return 'Hohe Konfidenz - Die generierten SOPs sollten zuverlässig sein';
      case 'medium':
        return 'Mittlere Konfidenz - Manuelle Überprüfung empfohlen';
      case 'low':
        return 'Niedrige Konfidenz - Erhebliche manuelle Bearbeitung erforderlich';
    }
  }

  switch (level) {
    case 'high':
      return 'High confidence - Generated SOPs should be reliable';
    case 'medium':
      return 'Medium confidence - Manual review recommended';
    case 'low':
      return 'Low confidence - Significant manual editing required';
  }
}

export default calculateConfidenceScore;
