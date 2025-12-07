/**
 * Confidence Scorer Service
 * T034 - Implement confidence scorer for routing decisions
 */

import { logger } from '../../lib/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceInputs {
  /** Confidence in category detection (0-1) */
  categoryConfidence: number;
  /** Score from rule matching (0-1, optional) */
  ruleMatchScore?: number;
  /** Expertise match score (0-1, optional) */
  expertiseScore?: number;
  /** Handler workload factor (0-1, 1 = low workload) */
  workloadScore?: number;
  /** Handler availability factor (0-1, 1 = fully available) */
  availabilityScore?: number;
  /** Historical accuracy for this category (0-1, optional) */
  historicalAccuracy?: number;
  /** Number of similar past decisions (for weighting) */
  similarDecisionCount?: number;
}

export interface ConfidenceBreakdown {
  totalConfidence: number;
  components: {
    name: string;
    weight: number;
    score: number;
    contribution: number;
  }[];
  riskFactors: string[];
  recommendation: 'high_confidence' | 'moderate_confidence' | 'low_confidence' | 'requires_review';
}

// =============================================================================
// Weight Configuration
// =============================================================================

const WEIGHTS = {
  categoryConfidence: 0.25,
  ruleMatchScore: 0.20,
  expertiseScore: 0.25,
  workloadScore: 0.15,
  availabilityScore: 0.10,
  historicalAccuracy: 0.05,
};

// Minimum thresholds
const THRESHOLDS = {
  highConfidence: 0.85,
  moderateConfidence: 0.70,
  lowConfidence: 0.50,
  requiresReview: 0.30,
};

// =============================================================================
// Main Scoring Functions
// =============================================================================

/**
 * Calculate overall confidence score for a routing decision
 */
export function calculateConfidence(inputs: ConfidenceInputs): number {
  const breakdown = getConfidenceBreakdown(inputs);
  return breakdown.totalConfidence;
}

/**
 * Get detailed confidence breakdown
 */
export function getConfidenceBreakdown(inputs: ConfidenceInputs): ConfidenceBreakdown {
  const components: ConfidenceBreakdown['components'] = [];
  const riskFactors: string[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  // Category confidence
  const categoryScore = inputs.categoryConfidence ?? 0.5;
  const categoryWeight = WEIGHTS.categoryConfidence;
  components.push({
    name: 'Category Detection',
    weight: categoryWeight,
    score: categoryScore,
    contribution: categoryScore * categoryWeight,
  });
  weightedSum += categoryScore * categoryWeight;
  totalWeight += categoryWeight;

  if (categoryScore < 0.6) {
    riskFactors.push('Low confidence in category detection');
  }

  // Rule match score (if rule was matched)
  if (inputs.ruleMatchScore !== undefined) {
    const ruleWeight = WEIGHTS.ruleMatchScore;
    components.push({
      name: 'Rule Match',
      weight: ruleWeight,
      score: inputs.ruleMatchScore,
      contribution: inputs.ruleMatchScore * ruleWeight,
    });
    weightedSum += inputs.ruleMatchScore * ruleWeight;
    totalWeight += ruleWeight;

    if (inputs.ruleMatchScore < 0.7) {
      riskFactors.push('Weak rule match');
    }
  }

  // Expertise score
  if (inputs.expertiseScore !== undefined) {
    const expertiseWeight = WEIGHTS.expertiseScore;
    components.push({
      name: 'Expertise Match',
      weight: expertiseWeight,
      score: inputs.expertiseScore,
      contribution: inputs.expertiseScore * expertiseWeight,
    });
    weightedSum += inputs.expertiseScore * expertiseWeight;
    totalWeight += expertiseWeight;

    if (inputs.expertiseScore < 0.5) {
      riskFactors.push('Handler has limited expertise in this area');
    }
  }

  // Workload score
  if (inputs.workloadScore !== undefined) {
    const workloadWeight = WEIGHTS.workloadScore;
    components.push({
      name: 'Workload Capacity',
      weight: workloadWeight,
      score: inputs.workloadScore,
      contribution: inputs.workloadScore * workloadWeight,
    });
    weightedSum += inputs.workloadScore * workloadWeight;
    totalWeight += workloadWeight;

    if (inputs.workloadScore < 0.3) {
      riskFactors.push('Handler has high workload');
    }
  }

  // Availability score
  if (inputs.availabilityScore !== undefined) {
    const availWeight = WEIGHTS.availabilityScore;
    components.push({
      name: 'Handler Availability',
      weight: availWeight,
      score: inputs.availabilityScore,
      contribution: inputs.availabilityScore * availWeight,
    });
    weightedSum += inputs.availabilityScore * availWeight;
    totalWeight += availWeight;

    if (inputs.availabilityScore < 0.5) {
      riskFactors.push('Handler availability is limited');
    }
  }

  // Historical accuracy (if available)
  if (inputs.historicalAccuracy !== undefined && inputs.similarDecisionCount && inputs.similarDecisionCount >= 10) {
    const histWeight = WEIGHTS.historicalAccuracy;
    components.push({
      name: 'Historical Accuracy',
      weight: histWeight,
      score: inputs.historicalAccuracy,
      contribution: inputs.historicalAccuracy * histWeight,
    });
    weightedSum += inputs.historicalAccuracy * histWeight;
    totalWeight += histWeight;

    if (inputs.historicalAccuracy < 0.7) {
      riskFactors.push('Historical accuracy for similar requests is low');
    }
  }

  // Calculate total confidence
  const totalConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Determine recommendation
  let recommendation: ConfidenceBreakdown['recommendation'];
  if (totalConfidence >= THRESHOLDS.highConfidence) {
    recommendation = 'high_confidence';
  } else if (totalConfidence >= THRESHOLDS.moderateConfidence) {
    recommendation = 'moderate_confidence';
  } else if (totalConfidence >= THRESHOLDS.lowConfidence) {
    recommendation = 'low_confidence';
  } else {
    recommendation = 'requires_review';
  }

  // Add risk factors based on recommendation
  if (recommendation === 'requires_review') {
    riskFactors.push('Overall confidence below acceptable threshold');
  }

  logger.debug({
    totalConfidence,
    recommendation,
    riskFactorCount: riskFactors.length,
  }, 'Confidence calculation completed');

  return {
    totalConfidence,
    components,
    riskFactors,
    recommendation,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Adjust confidence based on historical feedback
 */
export function adjustConfidenceFromFeedback(
  baseConfidence: number,
  feedbackScores: number[],
  decayFactor: number = 0.1
): number {
  if (feedbackScores.length === 0) {
    return baseConfidence;
  }

  // Weight recent feedback more heavily
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < feedbackScores.length; i++) {
    const weight = Math.exp(-decayFactor * i);
    weightedSum += (feedbackScores[i] / 5) * weight; // Normalize to 0-1
    totalWeight += weight;
  }

  const feedbackAverage = weightedSum / totalWeight;

  // Blend base confidence with feedback (30% feedback influence)
  return baseConfidence * 0.7 + feedbackAverage * 0.3;
}

/**
 * Calculate expertise-based confidence boost
 */
export function calculateExpertiseBoost(
  skillMatches: number,
  totalSkillsRequired: number,
  avgSkillLevel: number
): number {
  const coverageScore = totalSkillsRequired > 0
    ? Math.min(1, skillMatches / totalSkillsRequired)
    : 0;

  const levelScore = avgSkillLevel / 5; // Assuming 1-5 scale

  // Combine coverage and level
  return (coverageScore * 0.6) + (levelScore * 0.4);
}

/**
 * Calculate workload-based confidence penalty
 */
export function calculateWorkloadPenalty(
  currentWorkload: number,
  maxWorkload: number = 100
): number {
  const utilizationRatio = currentWorkload / maxWorkload;

  if (utilizationRatio < 0.5) {
    return 1.0; // No penalty
  } else if (utilizationRatio < 0.7) {
    return 0.9; // Slight penalty
  } else if (utilizationRatio < 0.85) {
    return 0.7; // Moderate penalty
  } else if (utilizationRatio < 0.95) {
    return 0.4; // Significant penalty
  }

  return 0.1; // Near capacity
}

/**
 * Get confidence level label
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= THRESHOLDS.highConfidence) {
    return 'Very High';
  } else if (confidence >= THRESHOLDS.moderateConfidence) {
    return 'High';
  } else if (confidence >= THRESHOLDS.lowConfidence) {
    return 'Moderate';
  } else if (confidence >= THRESHOLDS.requiresReview) {
    return 'Low';
  }
  return 'Very Low';
}

export default {
  calculateConfidence,
  getConfidenceBreakdown,
  adjustConfidenceFromFeedback,
  calculateExpertiseBoost,
  calculateWorkloadPenalty,
  getConfidenceLabel,
  THRESHOLDS,
};
