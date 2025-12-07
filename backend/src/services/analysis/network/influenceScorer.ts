/**
 * Influence Score Calculator
 * Calculates composite influence scores for persons in the organization
 * T233 - Influence score calculation
 */

import { runQuery, runWriteTransaction } from '../../../graph/connection.js';
import { calculateAllCentralityMetrics, CentralityScores } from './centrality.js';

export interface InfluenceScore {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  overallScore: number;
  components: {
    networkInfluence: number;      // Based on centrality metrics
    communicationVolume: number;   // Based on total communications
    responseInfluence: number;     // Based on response patterns
    bridgingInfluence: number;     // Based on cross-department connections
    temporalInfluence: number;     // Based on recency of activity
  };
  rank: number;
  percentile: number;
}

export interface InfluenceResult {
  influencers: InfluenceScore[];
  stats: {
    avgScore: number;
    medianScore: number;
    stdDev: number;
    topInfluencerDepartments: Array<{ department: string; count: number }>;
  };
}

/**
 * Weight configuration for influence components
 */
const INFLUENCE_WEIGHTS = {
  networkInfluence: 0.30,      // 30% - centrality metrics
  communicationVolume: 0.20,  // 20% - how much they communicate
  responseInfluence: 0.15,    // 15% - do people respond to them
  bridgingInfluence: 0.20,    // 20% - connecting different groups
  temporalInfluence: 0.15,    // 15% - recent activity matters
};

/**
 * Calculate influence scores for all persons in organization
 */
export async function calculateInfluenceScores(
  organizationId: string
): Promise<InfluenceResult> {
  // Get centrality metrics
  const centralityResult = await calculateAllCentralityMetrics(organizationId);
  const centralityMap = new Map<string, CentralityScores>();
  centralityResult.persons.forEach((p) => centralityMap.set(p.email, p));

  // Get communication volumes
  const volumeResult = await runQuery<{
    email: string;
    displayName: string;
    department: string;
    jobTitle: string;
    sentCount: { low: number };
    receivedCount: { low: number };
    uniqueContacts: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[sent:COMMUNICATES_WITH]->(:Person)
    OPTIONAL MATCH (:Person)-[received:COMMUNICATES_WITH]->(p)
    WITH p,
         sum(COALESCE(sent.totalCount, 0)) as sentCount,
         sum(COALESCE(received.totalCount, 0)) as receivedCount,
         count(DISTINCT sent) + count(DISTINCT received) as uniqueContacts
    RETURN p.email as email, p.displayName as displayName,
           p.department as department, p.jobTitle as jobTitle,
           sentCount, receivedCount, uniqueContacts
    `,
    { organizationId }
  );

  // Get cross-department connections (bridging)
  const bridgingResult = await runQuery<{
    email: string;
    crossDeptConnections: { low: number };
    totalConnections: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[:COMMUNICATES_WITH]-(other:Person)
    WITH p, other,
         CASE WHEN p.department <> other.department AND other.department IS NOT NULL THEN 1 ELSE 0 END as isCrossDept
    WITH p, sum(isCrossDept) as crossDeptConnections, count(other) as totalConnections
    RETURN p.email as email, crossDeptConnections, totalConnections
    `,
    { organizationId }
  );

  const bridgingMap = new Map<string, { crossDept: number; total: number }>();
  bridgingResult.forEach((r) => {
    bridgingMap.set(r.email, {
      crossDept: r.crossDeptConnections?.low || 0,
      total: r.totalConnections?.low || 0,
    });
  });

  // Get temporal activity (recency)
  const temporalResult = await runQuery<{
    email: string;
    lastActivity: string;
    recentActivityCount: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[r:COMMUNICATES_WITH]-(:Person)
    WITH p, max(r.lastCommunication) as lastActivity,
         sum(CASE WHEN datetime(r.lastCommunication) > datetime() - duration('P30D') THEN r.totalCount ELSE 0 END) as recentCount
    RETURN p.email as email, lastActivity, recentCount as recentActivityCount
    `,
    { organizationId }
  );

  const temporalMap = new Map<string, { lastActivity: Date | null; recentCount: number }>();
  temporalResult.forEach((r) => {
    temporalMap.set(r.email, {
      lastActivity: r.lastActivity ? new Date(r.lastActivity) : null,
      recentCount: r.recentActivityCount?.low || 0,
    });
  });

  // Calculate normalized scores
  const maxSent = Math.max(...volumeResult.map((v) => v.sentCount?.low || 0), 1);
  const maxReceived = Math.max(...volumeResult.map((v) => v.receivedCount?.low || 0), 1);
  const maxUniqueContacts = Math.max(...volumeResult.map((v) => v.uniqueContacts?.low || 0), 1);
  const maxCrossDept = Math.max(...Array.from(bridgingMap.values()).map((b) => b.crossDept), 1);
  const maxRecentCount = Math.max(...Array.from(temporalMap.values()).map((t) => t.recentCount), 1);

  // Calculate influence scores
  const influenceScores: InfluenceScore[] = volumeResult.map((person) => {
    const centrality = centralityMap.get(person.email);
    const bridging = bridgingMap.get(person.email);
    const temporal = temporalMap.get(person.email);

    // Network influence (from centrality)
    const networkInfluence = centrality
      ? (centrality.degreeCentrality * 0.3 +
         centrality.betweennessCentrality * 0.3 +
         centrality.pageRank * 0.4)
      : 0;

    // Communication volume (normalized)
    const sentNorm = (person.sentCount?.low || 0) / maxSent;
    const receivedNorm = (person.receivedCount?.low || 0) / maxReceived;
    const contactsNorm = (person.uniqueContacts?.low || 0) / maxUniqueContacts;
    const communicationVolume = (sentNorm * 0.3 + receivedNorm * 0.3 + contactsNorm * 0.4);

    // Response influence (ratio of received to sent - higher means people respond to you)
    const sent = person.sentCount?.low || 1;
    const received = person.receivedCount?.low || 0;
    const responseInfluence = Math.min(received / sent, 2) / 2; // Cap at 2x, normalize to 0-1

    // Bridging influence (cross-department connections)
    const bridgingInfluence = bridging && bridging.total > 0
      ? bridging.crossDept / bridging.total
      : 0;

    // Temporal influence (recent activity)
    const recentCount = temporal?.recentCount || 0;
    const temporalInfluence = recentCount / maxRecentCount;

    // Calculate weighted overall score
    const overallScore =
      networkInfluence * INFLUENCE_WEIGHTS.networkInfluence +
      communicationVolume * INFLUENCE_WEIGHTS.communicationVolume +
      responseInfluence * INFLUENCE_WEIGHTS.responseInfluence +
      bridgingInfluence * INFLUENCE_WEIGHTS.bridgingInfluence +
      temporalInfluence * INFLUENCE_WEIGHTS.temporalInfluence;

    return {
      email: person.email,
      displayName: person.displayName,
      department: person.department,
      jobTitle: person.jobTitle,
      overallScore,
      components: {
        networkInfluence,
        communicationVolume,
        responseInfluence,
        bridgingInfluence,
        temporalInfluence,
      },
      rank: 0,
      percentile: 0,
    };
  });

  // Sort by overall score and assign ranks
  influenceScores.sort((a, b) => b.overallScore - a.overallScore);
  influenceScores.forEach((score, index) => {
    score.rank = index + 1;
    score.percentile = ((influenceScores.length - index) / influenceScores.length) * 100;
  });

  // Calculate stats
  const scores = influenceScores.map((s) => s.overallScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length || 0;
  const sortedScores = [...scores].sort((a, b) => a - b);
  const medianScore = sortedScores[Math.floor(sortedScores.length / 2)] || 0;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Top departments
  const deptCounts = new Map<string, number>();
  influenceScores.slice(0, Math.ceil(influenceScores.length * 0.1)).forEach((s) => {
    if (s.department) {
      deptCounts.set(s.department, (deptCounts.get(s.department) || 0) + 1);
    }
  });
  const topInfluencerDepartments = Array.from(deptCounts.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  return {
    influencers: influenceScores,
    stats: {
      avgScore,
      medianScore,
      stdDev,
      topInfluencerDepartments,
    },
  };
}

/**
 * Get top influencers for organization
 */
export async function getTopInfluencers(
  organizationId: string,
  limit: number = 20
): Promise<InfluenceScore[]> {
  const result = await calculateInfluenceScores(organizationId);
  return result.influencers.slice(0, limit);
}

/**
 * Get influence score for a specific person
 */
export async function getPersonInfluenceScore(
  organizationId: string,
  email: string
): Promise<InfluenceScore | null> {
  const result = await calculateInfluenceScores(organizationId);
  return result.influencers.find((i) => i.email === email) || null;
}

/**
 * Store influence scores on nodes
 */
export async function storeInfluenceScores(
  organizationId: string,
  scores: InfluenceScore[]
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    for (const score of scores) {
      await tx.run(
        `
        MATCH (p:Person {organizationId: $organizationId, email: $email})
        SET p.influenceScore = $overallScore,
            p.influenceRank = $rank,
            p.influencePercentile = $percentile,
            p.networkInfluence = $networkInfluence,
            p.bridgingInfluence = $bridgingInfluence,
            p.influenceUpdatedAt = datetime()
        `,
        {
          organizationId,
          email: score.email,
          overallScore: score.overallScore,
          rank: score.rank,
          percentile: score.percentile,
          networkInfluence: score.components.networkInfluence,
          bridgingInfluence: score.components.bridgingInfluence,
        }
      );
    }
  });
}

/**
 * Compare influence to formal hierarchy position
 */
export async function getInfluenceHierarchyGap(
  organizationId: string
): Promise<Array<{
  email: string;
  displayName?: string;
  jobTitle?: string;
  influenceRank: number;
  hierarchyLevel?: number;
  gap: number;
  isOverperforming: boolean;
}>> {
  const influenceResult = await calculateInfluenceScores(organizationId);

  // Try to determine hierarchy level from job title or reporting structure
  const hierarchyResult = await runQuery<{
    email: string;
    displayName: string;
    jobTitle: string;
    directReports: { low: number };
    managerCount: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (report:Person)-[:REPORTS_TO]->(p)
    OPTIONAL MATCH (p)-[:REPORTS_TO]->(manager:Person)
    RETURN p.email as email, p.displayName as displayName, p.jobTitle as jobTitle,
           count(DISTINCT report) as directReports, count(DISTINCT manager) as managerCount
    `,
    { organizationId }
  );

  const hierarchyMap = new Map<string, { directReports: number; level: number }>();
  hierarchyResult.forEach((h) => {
    // Approximate hierarchy level based on direct reports and manager presence
    let level = 5; // Default: individual contributor
    if ((h.directReports?.low || 0) > 10) level = 2; // Senior leader
    else if ((h.directReports?.low || 0) > 0) level = 3; // Manager
    else if ((h.managerCount?.low || 0) === 0) level = 4; // Possibly senior IC

    hierarchyMap.set(h.email, {
      directReports: h.directReports?.low || 0,
      level,
    });
  });

  // Compare influence rank to hierarchy level
  const maxInfluenceRank = influenceResult.influencers.length;

  return influenceResult.influencers.map((person) => {
    const hierarchy = hierarchyMap.get(person.email);
    const hierarchyLevel = hierarchy?.level || 5;

    // Convert influence rank to comparable scale (1-5)
    const influenceLevel = Math.ceil((person.rank / maxInfluenceRank) * 5);

    // Gap: negative means underperforming vs hierarchy, positive means overperforming
    const gap = hierarchyLevel - influenceLevel;

    return {
      email: person.email,
      displayName: person.displayName,
      jobTitle: person.jobTitle,
      influenceRank: person.rank,
      hierarchyLevel,
      gap,
      isOverperforming: gap > 0,
    };
  }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

export default {
  calculateInfluenceScores,
  getTopInfluencers,
  getPersonInfluenceScore,
  storeInfluenceScores,
  getInfluenceHierarchyGap,
};
