/**
 * Optimization Services Index
 * Exports all process optimization services
 */

export { OptimizationService, getOptimizationService } from './optimization.service.js';

export type {
  OptimizationSuggestion,
  CreateOptimizationInput,
  UpdateOptimizationInput,
  OptimizationFilters,
  OptimizationDetectionRequest,
  BottleneckDetection,
  OptimizationAnalysis,
  OptimizationImpact,
  ImplementationPlan,
  ProcessComparison,
} from '../../models/OptimizationSuggestion.js';

export {
  OPTIMIZATION_DEFAULTS,
  calculateImpactScore,
  calculatePriorityScore,
  groupByType,
} from '../../models/OptimizationSuggestion.js';
