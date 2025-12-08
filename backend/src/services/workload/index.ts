/**
 * Workload Services Index
 * Exports all workload-related services for the OPERATE tier
 */

export * from './workloadAnalyzer.js';
export * from './workloadTracker.js';
export * from './metricsWriter.js';

// Re-export convenience functions
export {
  calculateWorkloadScore,
  calculateCapacityRemaining,
  calculateWorkloadMetrics,
  calculateBurnoutRiskScore,
  assessBurnoutRisk,
  calculateTeamWorkload,
  identifyWorkloadImbalances,
  suggestRedistribution,
  DEFAULT_WEIGHTS,
  BURNOUT_THRESHOLDS,
} from './workloadAnalyzer.js';

export {
  WorkloadTracker,
  getWorkloadTracker,
  stopWorkloadTracker,
} from './workloadTracker.js';

export {
  MetricsWriter,
  getMetricsWriter,
  stopMetricsWriter,
} from './metricsWriter.js';

// Burnout Predictor (T203)
export { default as burnoutPredictor } from './burnoutPredictor.js';
export {
  predictBurnout,
  predictTeamBurnout,
  getBurnoutHistory,
  getAtRiskPeople,
} from './burnoutPredictor.js';

// Communication Analyzer (T204)
export { default as communicationAnalyzer } from './communicationAnalyzer.js';
export {
  analyzeCommunication,
  analyzeTeamCommunication,
  getCommunicationTrends,
} from './communicationAnalyzer.js';

// Task Distribution (T205)
export { default as taskDistribution } from './taskDistribution.js';
export {
  analyzeDistribution,
  getMemberTaskMetrics,
  getAssignmentSuggestions,
  compareDistribution,
} from './taskDistribution.js';

// Response Time Analyzer (T206)
export { default as responseTimeAnalyzer } from './responseTimeAnalyzer.js';
export {
  analyzeResponseTime,
  analyzeTeamResponseTime,
  compareToExpectations,
} from './responseTimeAnalyzer.js';

// Capacity Planner (T207)
export { default as capacityPlanner } from './capacityPlanner.js';
export {
  createCapacityPlan,
  analyzeScenario,
  getCapacityForecast,
} from './capacityPlanner.js';

// Workload Forecaster (T208)
export { default as workloadForecaster } from './workloadForecaster.js';
export {
  forecastPersonWorkload,
  forecastTeamWorkload,
  compareWorkloadPeriods,
} from './workloadForecaster.js';

// Seasonal Patterns (T209)
export { default as seasonalPatterns } from './seasonalPatterns.js';
export {
  analyzeSeasonalPatterns,
  analyzeTeamSeasonalPatterns,
  getExpectedWorkload,
} from './seasonalPatterns.js';

// Deadline Impact (T210)
export { default as deadlineImpact } from './deadlineImpact.js';
export {
  estimateDeadlineImpact,
  analyzeTeamDeadlines,
  findDeadlineConflicts,
} from './deadlineImpact.js';

// Redistribution Suggester (T211)
export { default as redistributionSuggester } from './redistributionSuggester.js';
export {
  generateRedistributionPlan,
  suggestForPerson,
  applySuggestion,
} from './redistributionSuggester.js';

// Skill Matcher (T212)
export { default as skillMatcher } from './skillMatcher.js';
export {
  findTaskMatches,
  generateSkillMatrix,
  suggestSkillDevelopment,
  findSkillMentors,
} from './skillMatcher.js';

// Balancing Optimizer (T213)
export { default as balancingOptimizer } from './balancingOptimizer.js';
export {
  optimizeTeamWorkload,
  getQuickSuggestions,
  simulateMoves,
} from './balancingOptimizer.js';

// Burnout Scorer (T214)
export { default as burnoutScorer } from './burnoutScorer.js';
export {
  calculateBurnoutScore,
  calculateTeamBurnoutScore,
  getBurnoutScoreTrend,
  compareBurnoutScores,
} from './burnoutScorer.js';

// Early Warning System (T215)
export { default as earlyWarning } from './earlyWarning.js';
export {
  checkForWarnings,
  checkTeamWarnings,
  acknowledgeWarning,
  resolveWarning,
  onWarning,
  getWarningHistory,
} from './earlyWarning.js';

// Manager Notifier (T216)
export { default as managerNotifier } from './managerNotifier.js';
export {
  notifyManager,
  notifyTeamOverload,
  notifyBurnoutRisk,
  notifyWorkloadImbalance,
  sendWeeklySummary,
  getManagerNotifications,
  markAsRead,
  markAsActioned,
  dismissNotification,
  getManagerPreferences,
  updateManagerPreferences,
  getNotificationStats,
} from './managerNotifier.js';

// Calendar Integration (T217)
export { default as calendarIntegration } from './calendarIntegration.js';
export {
  connectCalendar,
  disconnectCalendar,
  getCalendarEvents,
  analyzeCalendar,
  getAvailability,
  findCommonAvailability,
  syncCalendar,
  getMeetingStats,
} from './calendarIntegration.js';

// Meeting Analyzer (T218)
export { default as meetingAnalyzer } from './meetingAnalyzer.js';
export {
  analyzeMeetings,
  analyzeTeamMeetings,
  getMeetingOptimizations,
  compareMeetingPeriods,
} from './meetingAnalyzer.js';

// Availability Tracker (T219)
export { default as availabilityTracker } from './availabilityTracker.js';
export {
  getPersonAvailability,
  setStatus,
  getTeamAvailability,
  getSchedulingSuggestions,
  getAvailabilityPreferences,
  updateAvailabilityPreferences,
  onAvailabilityChange,
  checkPreferenceConflicts,
} from './availabilityTracker.js';

// Workload Metrics Processor (T220)
export { default as workloadMetricsProcessor } from './workloadMetricsProcessor.js';
export {
  initializeProcessor,
  stopProcessor,
  getQueue,
  scheduleJob,
  schedulePersonMetrics,
  scheduleTeamMetrics,
  scheduleBurnoutAnalysis,
  scheduleEarlyWarningCheck,
  scheduleCalendarSync,
  scheduleForecast,
  scheduleWeeklySummary,
  scheduleBulkPersonJobs,
  getProcessorStats,
  getQueueStatus,
  setupScheduledJobs,
} from './workloadMetricsProcessor.js';
