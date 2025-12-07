/**
 * Assessments Services Index
 * Exports all assessment-related services
 */

export {
  calculateERPReadiness,
  type ERPReadinessInput,
  type ERPReadinessScore,
  type DataQualityMetrics,
  type ProcessMetrics,
  type SystemMetrics,
  type OrganizationMetrics,
  type CategoryScore,
  type RiskFactor,
  type ERPRecommendation,
} from './erpReadiness.js';

export {
  calculateAIReadiness,
  type AIReadinessInput,
  type AIReadinessScore,
  type AIDataMetrics,
  type InfrastructureMetrics,
  type TalentMetrics,
  type StrategyMetrics,
  type GovernanceMetrics,
  type Recommendation,
  type UseCaseSuitability,
  type InvestmentGuidance,
} from './aiReadiness.js';

export {
  calculateDataQuality,
  type DataQualityInput,
  type DataQualityScore,
  type EntityRecordSample,
  type FieldAnalysis,
  type DimensionScore,
  type DataQualityIssue,
} from './dataQuality.js';

export {
  calculateProcessMaturity,
  type ProcessMaturityInput,
  type ProcessMaturityScore,
  type ProcessAssessmentData,
  type MaturityDimensionScore,
  type MaturityGap,
  type MaturityRoadmap,
} from './processMaturity.js';

export {
  generateRecommendations,
  type CombinedAssessmentInput,
  type RecommendationReport,
  type ExecutiveSummary,
  type StrategicRecommendation,
  type TacticalRecommendation,
  type QuickWin,
  type InvestmentPlan,
  type ImplementationRoadmap,
  type RiskMitigation,
  type SuccessMetric,
} from './recommendationGenerator.js';
