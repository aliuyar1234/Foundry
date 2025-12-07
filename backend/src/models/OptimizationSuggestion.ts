/**
 * Optimization Suggestion Model (T092)
 * Types and utilities for AI-powered process optimization
 */

import { OptimizationType, SuggestionStatus } from '@prisma/client';

/**
 * Optimization suggestion from AI analysis
 */
export interface OptimizationSuggestion {
  id: string;
  tenantId: string;
  processId: string;
  type: OptimizationType;
  status: SuggestionStatus;
  title: string;
  description: string;
  analysis: OptimizationAnalysis;
  impact: OptimizationImpact;
  implementation: ImplementationPlan;
  priority: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  implementedAt: Date | null;
}

/**
 * Detailed analysis supporting the suggestion
 */
export interface OptimizationAnalysis {
  currentState: string;
  proposedState: string;
  rationale: string;
  evidence: AnalysisEvidence[];
  risks: AnalysisRisk[];
  assumptions: string[];
  constraints: string[];
}

/**
 * Evidence supporting the analysis
 */
export interface AnalysisEvidence {
  type: 'metric' | 'pattern' | 'comparison' | 'feedback' | 'benchmark';
  source: string;
  description: string;
  data?: Record<string, unknown>;
}

/**
 * Risk identified in the analysis
 */
export interface AnalysisRisk {
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

/**
 * Impact assessment
 */
export interface OptimizationImpact {
  timeReduction?: ImpactMetric;
  costReduction?: ImpactMetric;
  qualityImprovement?: ImpactMetric;
  riskReduction?: ImpactMetric;
  resourceOptimization?: ImpactMetric;
  complianceImprovement?: ImpactMetric;
  overallScore: number;
  affectedProcesses: string[];
  affectedRoles: string[];
}

/**
 * Impact metric with range
 */
export interface ImpactMetric {
  value: number;
  unit: string;
  minimum: number;
  maximum: number;
  confidence: number;
}

/**
 * Implementation plan
 */
export interface ImplementationPlan {
  steps: ImplementationStep[];
  prerequisites: string[];
  resources: ImplementationResource[];
  timeline: string;
  effort: 'low' | 'medium' | 'high';
  complexity: 'low' | 'medium' | 'high';
  rollbackPlan?: string;
}

/**
 * Implementation step
 */
export interface ImplementationStep {
  id: string;
  order: number;
  title: string;
  description: string;
  responsible?: string;
  duration?: string;
  dependencies?: string[];
}

/**
 * Resource needed for implementation
 */
export interface ImplementationResource {
  type: 'person' | 'tool' | 'system' | 'budget' | 'time';
  description: string;
  quantity?: number;
  availability?: string;
}

/**
 * Input for creating an optimization suggestion
 */
export interface CreateOptimizationInput {
  tenantId: string;
  processId: string;
  type: OptimizationType;
  title: string;
  description: string;
  analysis: OptimizationAnalysis;
  impact: OptimizationImpact;
  implementation: ImplementationPlan;
  priority?: number;
  confidence?: number;
}

/**
 * Input for updating an optimization suggestion
 */
export interface UpdateOptimizationInput {
  status?: SuggestionStatus;
  title?: string;
  description?: string;
  analysis?: Partial<OptimizationAnalysis>;
  impact?: Partial<OptimizationImpact>;
  implementation?: Partial<ImplementationPlan>;
  priority?: number;
  reviewedBy?: string;
}

/**
 * Filters for querying optimizations
 */
export interface OptimizationFilters {
  tenantId: string;
  processId?: string;
  type?: OptimizationType;
  status?: SuggestionStatus;
  minPriority?: number;
  minConfidence?: number;
  minImpact?: number;
}

/**
 * Optimization detection request
 */
export interface OptimizationDetectionRequest {
  processId: string;
  tenantId: string;
  options?: {
    types?: OptimizationType[];
    minConfidence?: number;
    includeImplementationPlan?: boolean;
    customCriteria?: string;
  };
}

/**
 * Bottleneck detection result
 */
export interface BottleneckDetection {
  processId: string;
  stepId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'resource' | 'dependency' | 'approval' | 'handoff' | 'rework' | 'wait';
  description: string;
  metrics: {
    averageWaitTime?: number;
    throughputReduction?: number;
    errorRate?: number;
    reworkRate?: number;
  };
  suggestedFixes: string[];
}

/**
 * Process comparison result
 */
export interface ProcessComparison {
  processId: string;
  benchmarkId: string;
  gaps: ComparisonGap[];
  strengths: string[];
  overallScore: number;
}

/**
 * Gap identified in comparison
 */
export interface ComparisonGap {
  area: string;
  current: string;
  benchmark: string;
  gapSize: number;
  recommendation: string;
}

/**
 * Default values for optimization suggestions
 */
export const OPTIMIZATION_DEFAULTS = {
  status: 'PENDING' as SuggestionStatus,
  priority: 50,
  confidence: 0.7,
  effort: 'medium' as const,
  complexity: 'medium' as const,
};

/**
 * Calculate overall impact score
 */
export function calculateImpactScore(impact: OptimizationImpact): number {
  const weights = {
    timeReduction: 0.25,
    costReduction: 0.25,
    qualityImprovement: 0.2,
    riskReduction: 0.15,
    resourceOptimization: 0.1,
    complianceImprovement: 0.05,
  };

  let score = 0;
  let totalWeight = 0;

  if (impact.timeReduction) {
    score += impact.timeReduction.value * impact.timeReduction.confidence * weights.timeReduction;
    totalWeight += weights.timeReduction;
  }
  if (impact.costReduction) {
    score += impact.costReduction.value * impact.costReduction.confidence * weights.costReduction;
    totalWeight += weights.costReduction;
  }
  if (impact.qualityImprovement) {
    score += impact.qualityImprovement.value * impact.qualityImprovement.confidence * weights.qualityImprovement;
    totalWeight += weights.qualityImprovement;
  }
  if (impact.riskReduction) {
    score += impact.riskReduction.value * impact.riskReduction.confidence * weights.riskReduction;
    totalWeight += weights.riskReduction;
  }
  if (impact.resourceOptimization) {
    score += impact.resourceOptimization.value * impact.resourceOptimization.confidence * weights.resourceOptimization;
    totalWeight += weights.resourceOptimization;
  }
  if (impact.complianceImprovement) {
    score += impact.complianceImprovement.value * impact.complianceImprovement.confidence * weights.complianceImprovement;
    totalWeight += weights.complianceImprovement;
  }

  return totalWeight > 0 ? score / totalWeight : 0;
}

/**
 * Calculate priority score based on impact and effort
 */
export function calculatePriorityScore(
  impactScore: number,
  effort: 'low' | 'medium' | 'high',
  confidence: number
): number {
  const effortMultiplier = {
    low: 1.5,
    medium: 1.0,
    high: 0.6,
  };

  return Math.round(impactScore * effortMultiplier[effort] * confidence * 100);
}

/**
 * Group suggestions by type
 */
export function groupByType(
  suggestions: OptimizationSuggestion[]
): Record<OptimizationType, OptimizationSuggestion[]> {
  return suggestions.reduce(
    (acc, suggestion) => {
      if (!acc[suggestion.type]) {
        acc[suggestion.type] = [];
      }
      acc[suggestion.type].push(suggestion);
      return acc;
    },
    {} as Record<OptimizationType, OptimizationSuggestion[]>
  );
}
