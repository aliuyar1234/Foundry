/**
 * Network Analysis Services Index
 * Exports all network analysis functionality
 */

// Network Builder
export {
  buildCommunicationNetwork,
  buildEgoNetwork,
  getDepartmentNetwork,
  calculateAndStoreNetworkMetrics,
  type NetworkNode,
  type NetworkEdge,
  type CommunicationNetwork,
  type NetworkStats,
  type BuildNetworkOptions,
} from './networkBuilder.js';

// Centrality Calculations
export {
  calculateDegreeCentrality,
  calculateBetweennessCentrality,
  calculateClosenessCentrality,
  calculatePageRank,
  calculateAllCentralityMetrics,
  storeCentralityMetrics,
  type CentralityScores,
  type CentralityResult,
} from './centrality.js';

// Influence Scoring
export {
  calculateInfluenceScores,
  getTopInfluencers,
  getPersonInfluenceScore,
  storeInfluenceScores,
  getInfluenceHierarchyGap,
  type InfluenceScore,
  type InfluenceResult,
} from './influenceScorer.js';

// Community Detection
export {
  detectCommunities,
  getPersonCommunity,
  findCommunityBridges,
  type Community,
  type CommunityMember,
  type CommunityDetectionResult,
} from './communityDetection.js';

// Hierarchy Comparison
export {
  compareHierarchies,
  getHierarchyDiscrepancies,
  getShadowLeaders,
  getUnderLeveragedLeaders,
  type HierarchyNode,
  type HierarchyComparison,
  type HierarchyLevel,
} from './hierarchyComparison.js';

// Hidden Influencers
export {
  detectHiddenInfluencers,
  getHiddenInfluencersByType,
  getDepartmentHiddenInfluencers,
  analyzeHiddenInfluenceRisk,
  type HiddenInfluencer,
  type HiddenInfluenceType,
  type InfluenceIndicator,
  type HiddenInfluencerResult,
} from './hiddenInfluencers.js';

// Pattern Analysis
export {
  analyzePatterns,
  getPersonPattern,
  getDepartmentPatterns,
  type CommunicationPattern,
  type TemporalPattern,
  type BehavioralPattern,
  type RelationalPattern,
  type PatternAnomaly,
  type AnomalyType,
  type PatternAnalysisResult,
  type OrganizationTrends,
  type PatternAlert,
} from './patternAnalyzer.js';
