/**
 * Routing Services Index
 * Exports all routing-related services
 */

// Core routing
export { routeRequest, type RoutingRequest, type RoutingContext, type RoutingAnalysisResult } from './routingEngine.js';
export { categorizeRequest, quickCategorize, type CategoryResult } from './requestCategorizer.js';
export { matchRules, type RuleMatch, type MatchContext } from './ruleMatcher.js';
export { calculateConfidence, getConfidenceBreakdown, type ConfidenceInputs, type ConfidenceBreakdown } from './confidenceScorer.js';

// Expertise matching
export {
  findBestExpert,
  findExperts,
  categoriesToSkills,
  getPersonExpertise,
  CATEGORY_SKILL_MAP,
  type ExpertMatch,
  type MatchedSkill,
  type ExpertSearchOptions,
} from './expertiseMatcher.js';

// Workload and availability
export {
  checkWorkloadCapacity,
  findLowestWorkload,
  getTeamWorkloadBalance,
  getRedistributionSuggestions,
  checkOrganizationBurnoutRisk,
  WORKLOAD_THRESHOLDS,
  type WorkloadCapacity,
  type WorkloadRecommendation,
} from './workloadBalancer.js';

export {
  checkAvailability,
  checkMultipleAvailability,
  findNextAvailableTime,
  getScheduleOverview,
  AVAILABILITY_CONFIG,
  type AvailabilityResult,
  type AvailabilityStatus,
  type ScheduleSlot,
} from './availabilityChecker.js';

// Escalation and backup
export {
  handleEscalation,
  getEscalationPath,
  recordEscalation,
  DEFAULT_ESCALATION_PATH,
  URGENT_ESCALATION_PATH,
  type EscalationResult,
  type EscalationPath,
  type EscalationLevel,
} from './escalationHandler.js';

export {
  selectBackup,
  getBackupCandidates,
  type BackupResult,
  type BackupOptions,
} from './backupSelector.js';

// Logging and analytics
export {
  logDecision,
  updateDecisionOutcome,
  queryDecisions,
  getDecision,
  getHandlerDecisions,
  deleteOldDecisions,
  type DecisionLogEntry,
  type AlternativeHandler,
  type DecisionQueryOptions,
} from './decisionLogger.js';

export {
  getRoutingStats,
  getHandlerPerformance,
  getCategoryDistribution,
  getRoutingTrends,
  getLowConfidenceDecisions,
  getRuleEffectiveness,
  getRoutingSummary,
  type RoutingStats,
  type HandlerPerformance,
  type CategoryDistribution,
  type TimeSeriesPoint,
  type RoutingTrends,
} from './routingAnalytics.js';
