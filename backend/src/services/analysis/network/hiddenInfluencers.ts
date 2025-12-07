/**
 * Hidden Influencer Detector
 * Identifies people with disproportionate influence relative to their formal position
 * T236 - Hidden influencer detection
 */

import { runQuery } from '../../../graph/connection.js';
import { calculateInfluenceScores, InfluenceScore } from './influenceScorer.js';
import { compareHierarchies, HierarchyNode } from './hierarchyComparison.js';
import { findCommunityBridges } from './communityDetection.js';

export interface HiddenInfluencer {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  influenceScore: number;
  formalLevel: number;
  actualLevel: number;
  hiddenInfluenceType: HiddenInfluenceType;
  indicators: InfluenceIndicator[];
  confidenceScore: number;
  recommendations: string[];
}

export type HiddenInfluenceType =
  | 'shadow-leader'        // High influence, low formal position
  | 'knowledge-broker'     // Connects disparate groups
  | 'cultural-anchor'      // Central to informal networks
  | 'rising-star'          // Rapidly growing influence
  | 'quiet-expert'         // Technical influence without visibility
  | 'connector';           // Bridges silos

export interface InfluenceIndicator {
  type: string;
  value: number;
  description: string;
  weight: number;
}

export interface HiddenInfluencerResult {
  hiddenInfluencers: HiddenInfluencer[];
  stats: {
    totalIdentified: number;
    byType: Record<HiddenInfluenceType, number>;
    avgConfidenceScore: number;
    departmentsWithHiddenInfluence: string[];
  };
}

/**
 * Detect hidden influencers in the organization
 */
export async function detectHiddenInfluencers(
  organizationId: string,
  options: {
    minConfidence?: number;
    includeTypes?: HiddenInfluenceType[];
  } = {}
): Promise<HiddenInfluencerResult> {
  const minConfidence = options.minConfidence || 0.6;

  // Get influence scores and hierarchy comparison
  const [influenceResult, hierarchyComparison, bridges] = await Promise.all([
    calculateInfluenceScores(organizationId),
    compareHierarchies(organizationId),
    findCommunityBridges(organizationId),
  ]);

  // Create lookup maps
  const influenceMap = new Map<string, InfluenceScore>();
  influenceResult.influencers.forEach((i) => influenceMap.set(i.email, i));

  const hierarchyMap = new Map<string, HierarchyNode>();
  hierarchyComparison.nodes.forEach((n) => hierarchyMap.set(n.email, n));

  const bridgeMap = new Map<string, { communities: string[]; strength: number }>();
  bridges.forEach((b) => bridgeMap.set(b.email, { communities: b.communities, strength: b.bridgeStrength }));

  // Get communication pattern data
  const patternData = await getCommunicationPatterns(organizationId);

  // Analyze each person for hidden influence
  const hiddenInfluencers: HiddenInfluencer[] = [];

  for (const person of influenceResult.influencers) {
    const hierarchy = hierarchyMap.get(person.email);
    const bridge = bridgeMap.get(person.email);
    const patterns = patternData.get(person.email);

    const analysis = analyzeHiddenInfluence(person, hierarchy, bridge, patterns);

    if (analysis.confidenceScore >= minConfidence) {
      if (!options.includeTypes || options.includeTypes.includes(analysis.type)) {
        hiddenInfluencers.push({
          email: person.email,
          displayName: person.displayName,
          department: person.department,
          jobTitle: person.jobTitle,
          influenceScore: person.overallScore,
          formalLevel: hierarchy?.formalLevel || 5,
          actualLevel: hierarchy?.actualLevel || 3,
          hiddenInfluenceType: analysis.type,
          indicators: analysis.indicators,
          confidenceScore: analysis.confidenceScore,
          recommendations: analysis.recommendations,
        });
      }
    }
  }

  // Sort by confidence score
  hiddenInfluencers.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Calculate stats
  const byType: Record<HiddenInfluenceType, number> = {
    'shadow-leader': 0,
    'knowledge-broker': 0,
    'cultural-anchor': 0,
    'rising-star': 0,
    'quiet-expert': 0,
    'connector': 0,
  };

  hiddenInfluencers.forEach((h) => {
    byType[h.hiddenInfluenceType]++;
  });

  const departments = new Set<string>();
  hiddenInfluencers.forEach((h) => {
    if (h.department) departments.add(h.department);
  });

  return {
    hiddenInfluencers,
    stats: {
      totalIdentified: hiddenInfluencers.length,
      byType,
      avgConfidenceScore: hiddenInfluencers.length > 0
        ? hiddenInfluencers.reduce((sum, h) => sum + h.confidenceScore, 0) / hiddenInfluencers.length
        : 0,
      departmentsWithHiddenInfluence: Array.from(departments),
    },
  };
}

/**
 * Get communication pattern data for analysis
 */
async function getCommunicationPatterns(
  organizationId: string
): Promise<Map<string, {
  responseRate: number;
  initiationRate: number;
  threadParticipation: number;
  crossDeptRatio: number;
  recentGrowth: number;
}>> {
  const result = await runQuery<{
    email: string;
    sentCount: { low: number };
    receivedCount: { low: number };
    crossDeptCount: { low: number };
    totalCount: { low: number };
    recentCount: { low: number };
    olderCount: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[sent:COMMUNICATES_WITH]->(other:Person)
    OPTIONAL MATCH (received:Person)-[:COMMUNICATES_WITH]->(p)
    OPTIONAL MATCH (p)-[crossDept:COMMUNICATES_WITH]->(crossOther:Person)
    WHERE crossOther.department <> p.department AND crossOther.department IS NOT NULL
    WITH p,
         sum(COALESCE(sent.totalCount, 0)) as sentCount,
         count(DISTINCT received) as receivedCount,
         count(DISTINCT crossDept) as crossDeptCount,
         count(DISTINCT sent) as totalCount,
         sum(CASE WHEN datetime(sent.lastCommunication) > datetime() - duration('P30D') THEN sent.totalCount ELSE 0 END) as recentCount,
         sum(CASE WHEN datetime(sent.lastCommunication) <= datetime() - duration('P30D') THEN sent.totalCount ELSE 0 END) as olderCount
    RETURN p.email as email, sentCount, receivedCount, crossDeptCount, totalCount, recentCount, olderCount
    `,
    { organizationId }
  );

  const patterns = new Map<string, {
    responseRate: number;
    initiationRate: number;
    threadParticipation: number;
    crossDeptRatio: number;
    recentGrowth: number;
  }>();

  result.forEach((r) => {
    const sent = r.sentCount?.low || 0;
    const received = r.receivedCount?.low || 0;
    const crossDept = r.crossDeptCount?.low || 0;
    const total = r.totalCount?.low || 1;
    const recent = r.recentCount?.low || 0;
    const older = r.olderCount?.low || 1;

    patterns.set(r.email, {
      responseRate: sent > 0 ? received / sent : 0,
      initiationRate: (sent + received) > 0 ? sent / (sent + received) : 0,
      threadParticipation: 0, // Would need thread data
      crossDeptRatio: total > 0 ? crossDept / total : 0,
      recentGrowth: older > 0 ? (recent - older) / older : 0,
    });
  });

  return patterns;
}

/**
 * Analyze a person for hidden influence indicators
 */
function analyzeHiddenInfluence(
  person: InfluenceScore,
  hierarchy: HierarchyNode | undefined,
  bridge: { communities: string[]; strength: number } | undefined,
  patterns: {
    responseRate: number;
    initiationRate: number;
    threadParticipation: number;
    crossDeptRatio: number;
    recentGrowth: number;
  } | undefined
): {
  type: HiddenInfluenceType;
  indicators: InfluenceIndicator[];
  confidenceScore: number;
  recommendations: string[];
} {
  const indicators: InfluenceIndicator[] = [];
  const recommendations: string[] = [];

  // Calculate position discrepancy
  const formalLevel = hierarchy?.formalLevel || 5;
  const actualLevel = hierarchy?.actualLevel || 3;
  const discrepancy = formalLevel - actualLevel;

  // Indicator 1: Position-Influence Gap
  if (discrepancy > 1) {
    indicators.push({
      type: 'position-gap',
      value: discrepancy,
      description: `Influence level ${discrepancy} levels higher than formal position`,
      weight: 0.3,
    });
  }

  // Indicator 2: High betweenness (knowledge broker)
  if (person.components.bridgingInfluence > 0.5) {
    indicators.push({
      type: 'bridging-influence',
      value: person.components.bridgingInfluence,
      description: 'Strong cross-functional connections',
      weight: 0.25,
    });
  }

  // Indicator 3: Community bridge
  if (bridge && bridge.communities.length > 2) {
    indicators.push({
      type: 'community-bridge',
      value: bridge.communities.length,
      description: `Connects ${bridge.communities.length} distinct communities`,
      weight: 0.2,
    });
  }

  // Indicator 4: High response rate (people seek their input)
  if (patterns && patterns.responseRate > 1.5) {
    indicators.push({
      type: 'sought-after',
      value: patterns.responseRate,
      description: 'Receives significantly more responses than average',
      weight: 0.15,
    });
  }

  // Indicator 5: Cross-department reach
  if (patterns && patterns.crossDeptRatio > 0.4) {
    indicators.push({
      type: 'cross-dept-reach',
      value: patterns.crossDeptRatio,
      description: `${Math.round(patterns.crossDeptRatio * 100)}% of connections are cross-departmental`,
      weight: 0.15,
    });
  }

  // Indicator 6: Recent growth (rising star)
  if (patterns && patterns.recentGrowth > 0.3) {
    indicators.push({
      type: 'growth-trajectory',
      value: patterns.recentGrowth,
      description: `${Math.round(patterns.recentGrowth * 100)}% increase in recent activity`,
      weight: 0.1,
    });
  }

  // Indicator 7: Network centrality without formal authority
  if (person.components.networkInfluence > 0.6 && formalLevel > 3) {
    indicators.push({
      type: 'informal-centrality',
      value: person.components.networkInfluence,
      description: 'High network centrality without leadership title',
      weight: 0.25,
    });
  }

  // Calculate confidence score
  const confidenceScore = indicators.reduce((sum, i) => sum + i.value * i.weight, 0);

  // Determine hidden influence type
  const type = determineInfluenceType(indicators, hierarchy, patterns);

  // Generate recommendations
  if (type === 'shadow-leader') {
    recommendations.push('Consider for formal leadership role or project lead');
    recommendations.push('Leverage their informal influence for change initiatives');
  } else if (type === 'knowledge-broker') {
    recommendations.push('Recognize as key information conduit');
    recommendations.push('Include in cross-functional initiatives');
  } else if (type === 'connector') {
    recommendations.push('Leverage for breaking down silos');
    recommendations.push('Consider for liaison or coordinator roles');
  } else if (type === 'rising-star') {
    recommendations.push('Fast-track for development opportunities');
    recommendations.push('Assign stretch projects to accelerate growth');
  } else if (type === 'cultural-anchor') {
    recommendations.push('Consult for cultural change initiatives');
    recommendations.push('Recognize as informal culture keeper');
  } else if (type === 'quiet-expert') {
    recommendations.push('Increase visibility through presentations or mentoring');
    recommendations.push('Document their expertise for knowledge sharing');
  }

  return { type, indicators, confidenceScore, recommendations };
}

/**
 * Determine the type of hidden influence
 */
function determineInfluenceType(
  indicators: InfluenceIndicator[],
  hierarchy: HierarchyNode | undefined,
  patterns: {
    responseRate: number;
    initiationRate: number;
    threadParticipation: number;
    crossDeptRatio: number;
    recentGrowth: number;
  } | undefined
): HiddenInfluenceType {
  const hasPositionGap = indicators.some((i) => i.type === 'position-gap' && i.value > 2);
  const hasBridging = indicators.some((i) => i.type === 'bridging-influence' && i.value > 0.6);
  const hasCommunityBridge = indicators.some((i) => i.type === 'community-bridge' && i.value > 2);
  const hasGrowth = indicators.some((i) => i.type === 'growth-trajectory' && i.value > 0.5);
  const hasCrossDept = indicators.some((i) => i.type === 'cross-dept-reach' && i.value > 0.5);
  const hasSoughtAfter = indicators.some((i) => i.type === 'sought-after' && i.value > 2);

  // Priority-based type determination
  if (hasPositionGap && hasBridging) {
    return 'shadow-leader';
  }
  if (hasCommunityBridge && hasCrossDept) {
    return 'connector';
  }
  if (hasBridging && !hasPositionGap) {
    return 'knowledge-broker';
  }
  if (hasGrowth) {
    return 'rising-star';
  }
  if (hasSoughtAfter && patterns && patterns.initiationRate < 0.3) {
    return 'quiet-expert';
  }
  if (hierarchy?.discrepancyType === 'over-performer') {
    return 'cultural-anchor';
  }

  // Default based on strongest indicator
  return 'shadow-leader';
}

/**
 * Get hidden influencers by type
 */
export async function getHiddenInfluencersByType(
  organizationId: string,
  type: HiddenInfluenceType
): Promise<HiddenInfluencer[]> {
  const result = await detectHiddenInfluencers(organizationId, { includeTypes: [type] });
  return result.hiddenInfluencers;
}

/**
 * Get hidden influencers in a specific department
 */
export async function getDepartmentHiddenInfluencers(
  organizationId: string,
  department: string
): Promise<HiddenInfluencer[]> {
  const result = await detectHiddenInfluencers(organizationId);
  return result.hiddenInfluencers.filter((h) => h.department === department);
}

/**
 * Analyze hidden influence risk (key person dependency)
 */
export async function analyzeHiddenInfluenceRisk(
  organizationId: string
): Promise<{
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  keyPersonRisks: Array<{
    email: string;
    displayName?: string;
    riskType: string;
    impact: string;
    mitigation: string;
  }>;
  overallRecommendations: string[];
}> {
  const result = await detectHiddenInfluencers(organizationId);

  const keyPersonRisks: Array<{
    email: string;
    displayName?: string;
    riskType: string;
    impact: string;
    mitigation: string;
  }> = [];

  // Identify high-risk hidden influencers
  for (const influencer of result.hiddenInfluencers) {
    if (influencer.confidenceScore > 0.8) {
      let riskType = '';
      let impact = '';
      let mitigation = '';

      switch (influencer.hiddenInfluenceType) {
        case 'shadow-leader':
          riskType = 'Leadership Vacuum Risk';
          impact = 'Departure could leave informal leadership void';
          mitigation = 'Formalize role or develop succession plan';
          break;
        case 'knowledge-broker':
          riskType = 'Knowledge Concentration Risk';
          impact = 'Critical information flow dependency';
          mitigation = 'Document knowledge and create backup channels';
          break;
        case 'connector':
          riskType = 'Silo Creation Risk';
          impact = 'Cross-functional coordination could break down';
          mitigation = 'Establish formal coordination mechanisms';
          break;
        case 'quiet-expert':
          riskType = 'Expertise Loss Risk';
          impact = 'Critical technical knowledge could be lost';
          mitigation = 'Knowledge transfer and documentation program';
          break;
        default:
          riskType = 'Influence Dependency Risk';
          impact = 'Organizational effectiveness could be impacted';
          mitigation = 'Distribute influence more broadly';
      }

      keyPersonRisks.push({
        email: influencer.email,
        displayName: influencer.displayName,
        riskType,
        impact,
        mitigation,
      });
    }
  }

  // Determine overall risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  const highRiskCount = keyPersonRisks.length;
  const totalPeople = result.hiddenInfluencers.length;

  if (highRiskCount > 5 || (totalPeople > 0 && highRiskCount / totalPeople > 0.3)) {
    riskLevel = 'critical';
  } else if (highRiskCount > 3 || (totalPeople > 0 && highRiskCount / totalPeople > 0.2)) {
    riskLevel = 'high';
  } else if (highRiskCount > 1) {
    riskLevel = 'medium';
  }

  // Generate overall recommendations
  const overallRecommendations: string[] = [];

  if (riskLevel === 'critical' || riskLevel === 'high') {
    overallRecommendations.push('Conduct immediate succession planning for key hidden influencers');
    overallRecommendations.push('Implement knowledge documentation and transfer programs');
  }

  if (result.stats.byType['shadow-leader'] > 2) {
    overallRecommendations.push('Review organizational structure - informal leadership may indicate formal gaps');
  }

  if (result.stats.byType['connector'] > 2) {
    overallRecommendations.push('Strengthen formal cross-functional coordination mechanisms');
  }

  if (result.stats.byType['quiet-expert'] > 2) {
    overallRecommendations.push('Increase visibility of technical experts through knowledge sharing programs');
  }

  return {
    riskLevel,
    keyPersonRisks,
    overallRecommendations,
  };
}

export default {
  detectHiddenInfluencers,
  getHiddenInfluencersByType,
  getDepartmentHiddenInfluencers,
  analyzeHiddenInfluenceRisk,
};
