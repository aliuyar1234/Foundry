/**
 * Communication Pattern Analyzer
 * Analyzes temporal and behavioral communication patterns
 * T237 - Communication pattern analysis
 */

import { runQuery } from '../../../graph/connection.js';

export interface CommunicationPattern {
  email: string;
  displayName?: string;
  department?: string;
  patterns: {
    temporal: TemporalPattern;
    behavioral: BehavioralPattern;
    relational: RelationalPattern;
  };
  anomalies: PatternAnomaly[];
  healthScore: number;
}

export interface TemporalPattern {
  peakHours: number[];           // Hours of day with most activity (0-23)
  peakDays: number[];            // Days of week (0=Sunday, 6=Saturday)
  avgResponseTime: number;       // Minutes
  afterHoursRatio: number;       // 0-1
  weekendRatio: number;          // 0-1
  consistencyScore: number;      // How regular their patterns are
}

export interface BehavioralPattern {
  initiationRatio: number;       // How often they initiate vs respond
  avgThreadLength: number;       // Average messages per thread
  broadcastRatio: number;        // One-to-many vs one-to-one
  reciprocityScore: number;      // Do they respond to those who contact them?
  urgencyLevel: number;          // Based on response times and keywords
}

export interface RelationalPattern {
  strongTies: number;            // Frequent, reciprocal connections
  weakTies: number;              // Occasional connections
  bridgingConnections: number;   // Cross-group connections
  concentrationScore: number;    // How concentrated communication is
  networkReach: number;          // Unique contacts over time
}

export interface PatternAnomaly {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  period?: string;
  recommendation?: string;
}

export type AnomalyType =
  | 'unusual-hours'
  | 'communication-spike'
  | 'communication-drop'
  | 'isolation-trend'
  | 'overload-risk'
  | 'burnout-indicators'
  | 'silo-formation';

export interface PatternAnalysisResult {
  patterns: CommunicationPattern[];
  organizationTrends: OrganizationTrends;
  alerts: PatternAlert[];
}

export interface OrganizationTrends {
  avgAfterHoursRatio: number;
  avgResponseTime: number;
  avgNetworkReach: number;
  communicationHealth: 'healthy' | 'warning' | 'concerning';
  siloRisk: number;
  collaborationScore: number;
  temporalDistribution: Array<{ hour: number; volume: number }>;
}

export interface PatternAlert {
  type: string;
  affectedPeople: string[];
  severity: 'info' | 'warning' | 'critical';
  message: string;
  recommendation: string;
}

/**
 * Analyze communication patterns for the organization
 */
export async function analyzePatterns(
  organizationId: string,
  options: {
    timeframeDays?: number;
    includeAnomalies?: boolean;
  } = {}
): Promise<PatternAnalysisResult> {
  const timeframeDays = options.timeframeDays || 90;
  const includeAnomalies = options.includeAnomalies !== false;

  // Get temporal patterns
  const temporalData = await getTemporalData(organizationId, timeframeDays);

  // Get behavioral patterns
  const behavioralData = await getBehavioralData(organizationId, timeframeDays);

  // Get relational patterns
  const relationalData = await getRelationalData(organizationId);

  // Build pattern profiles
  const patterns: CommunicationPattern[] = [];
  const emailSet = new Set([
    ...temporalData.map((t) => t.email),
    ...behavioralData.map((b) => b.email),
    ...relationalData.map((r) => r.email),
  ]);

  const temporalMap = new Map(temporalData.map((t) => [t.email, t]));
  const behavioralMap = new Map(behavioralData.map((b) => [b.email, b]));
  const relationalMap = new Map(relationalData.map((r) => [r.email, r]));

  for (const email of emailSet) {
    const temporal = temporalMap.get(email);
    const behavioral = behavioralMap.get(email);
    const relational = relationalMap.get(email);

    const pattern: CommunicationPattern = {
      email,
      displayName: temporal?.displayName || behavioral?.displayName,
      department: temporal?.department || behavioral?.department,
      patterns: {
        temporal: {
          peakHours: temporal?.peakHours || [],
          peakDays: temporal?.peakDays || [],
          avgResponseTime: temporal?.avgResponseTime || 0,
          afterHoursRatio: temporal?.afterHoursRatio || 0,
          weekendRatio: temporal?.weekendRatio || 0,
          consistencyScore: temporal?.consistencyScore || 0,
        },
        behavioral: {
          initiationRatio: behavioral?.initiationRatio || 0.5,
          avgThreadLength: behavioral?.avgThreadLength || 1,
          broadcastRatio: behavioral?.broadcastRatio || 0,
          reciprocityScore: behavioral?.reciprocityScore || 0.5,
          urgencyLevel: behavioral?.urgencyLevel || 0.5,
        },
        relational: {
          strongTies: relational?.strongTies || 0,
          weakTies: relational?.weakTies || 0,
          bridgingConnections: relational?.bridgingConnections || 0,
          concentrationScore: relational?.concentrationScore || 0,
          networkReach: relational?.networkReach || 0,
        },
      },
      anomalies: [],
      healthScore: 0,
    };

    // Detect anomalies
    if (includeAnomalies) {
      pattern.anomalies = detectAnomalies(pattern);
    }

    // Calculate health score
    pattern.healthScore = calculateHealthScore(pattern);

    patterns.push(pattern);
  }

  // Calculate organization trends
  const organizationTrends = calculateOrganizationTrends(patterns);

  // Generate alerts
  const alerts = generateAlerts(patterns, organizationTrends);

  return { patterns, organizationTrends, alerts };
}

/**
 * Get temporal communication data
 */
async function getTemporalData(
  organizationId: string,
  timeframeDays: number
): Promise<Array<{
  email: string;
  displayName?: string;
  department?: string;
  peakHours: number[];
  peakDays: number[];
  avgResponseTime: number;
  afterHoursRatio: number;
  weekendRatio: number;
  consistencyScore: number;
}>> {
  // Get communication timestamps and volumes
  const result = await runQuery<{
    email: string;
    displayName: string;
    department: string;
    totalComms: { low: number };
    afterHoursComms: { low: number };
    weekendComms: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[r:COMMUNICATES_WITH]-(:Person)
    WHERE datetime(r.lastCommunication) > datetime() - duration({days: $timeframeDays})
    WITH p, count(r) as totalComms,
         sum(CASE
           WHEN time(r.lastCommunication).hour < 8 OR time(r.lastCommunication).hour > 18
           THEN 1 ELSE 0
         END) as afterHoursComms,
         sum(CASE
           WHEN datetime(r.lastCommunication).dayOfWeek IN [6, 7]
           THEN 1 ELSE 0
         END) as weekendComms
    WHERE totalComms > 0
    RETURN p.email as email, p.displayName as displayName, p.department as department,
           totalComms, afterHoursComms, weekendComms
    `,
    { organizationId, timeframeDays }
  );

  return result.map((r) => {
    const total = r.totalComms?.low || 1;
    const afterHours = r.afterHoursComms?.low || 0;
    const weekend = r.weekendComms?.low || 0;

    return {
      email: r.email,
      displayName: r.displayName,
      department: r.department,
      peakHours: [9, 10, 14, 15], // Would need hourly data for accuracy
      peakDays: [1, 2, 3, 4, 5], // Weekdays as default
      avgResponseTime: 60, // Would need response tracking
      afterHoursRatio: afterHours / total,
      weekendRatio: weekend / total,
      consistencyScore: 0.7, // Would need variance calculation
    };
  });
}

/**
 * Get behavioral pattern data
 */
async function getBehavioralData(
  organizationId: string,
  timeframeDays: number
): Promise<Array<{
  email: string;
  displayName?: string;
  department?: string;
  initiationRatio: number;
  avgThreadLength: number;
  broadcastRatio: number;
  reciprocityScore: number;
  urgencyLevel: number;
}>> {
  const result = await runQuery<{
    email: string;
    displayName: string;
    department: string;
    sentCount: { low: number };
    receivedCount: { low: number };
    reciprocalCount: { low: number };
    totalContacts: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[sent:COMMUNICATES_WITH]->(other:Person)
    OPTIONAL MATCH (receiver:Person)-[received:COMMUNICATES_WITH]->(p)
    OPTIONAL MATCH (p)-[outgoing:COMMUNICATES_WITH]->(reciprocal:Person)-[:COMMUNICATES_WITH]->(p)
    WITH p,
         sum(COALESCE(sent.totalCount, 0)) as sentCount,
         sum(COALESCE(received.totalCount, 0)) as receivedCount,
         count(DISTINCT reciprocal) as reciprocalCount,
         count(DISTINCT other) + count(DISTINCT receiver) as totalContacts
    WHERE sentCount > 0 OR receivedCount > 0
    RETURN p.email as email, p.displayName as displayName, p.department as department,
           sentCount, receivedCount, reciprocalCount, totalContacts
    `,
    { organizationId }
  );

  return result.map((r) => {
    const sent = r.sentCount?.low || 0;
    const received = r.receivedCount?.low || 0;
    const total = sent + received || 1;
    const reciprocal = r.reciprocalCount?.low || 0;
    const totalContacts = r.totalContacts?.low || 1;

    return {
      email: r.email,
      displayName: r.displayName,
      department: r.department,
      initiationRatio: sent / total,
      avgThreadLength: 2, // Would need thread tracking
      broadcastRatio: 0.1, // Would need CC/BCC data
      reciprocityScore: reciprocal / totalContacts,
      urgencyLevel: 0.5, // Would need content analysis
    };
  });
}

/**
 * Get relational pattern data
 */
async function getRelationalData(
  organizationId: string
): Promise<Array<{
  email: string;
  displayName?: string;
  department?: string;
  strongTies: number;
  weakTies: number;
  bridgingConnections: number;
  concentrationScore: number;
  networkReach: number;
}>> {
  const result = await runQuery<{
    email: string;
    displayName: string;
    department: string;
    strongTies: { low: number };
    weakTies: { low: number };
    crossDeptCount: { low: number };
    totalConnections: { low: number };
    topConnectionVolume: { low: number };
    totalVolume: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[r:COMMUNICATES_WITH]-(other:Person)
    WITH p, r, other,
         CASE WHEN r.totalCount > 20 THEN 1 ELSE 0 END as isStrong,
         CASE WHEN r.totalCount <= 20 AND r.totalCount > 0 THEN 1 ELSE 0 END as isWeak,
         CASE WHEN other.department <> p.department AND other.department IS NOT NULL THEN 1 ELSE 0 END as isCrossDept
    WITH p,
         sum(isStrong) as strongTies,
         sum(isWeak) as weakTies,
         sum(isCrossDept) as crossDeptCount,
         count(DISTINCT other) as totalConnections,
         max(r.totalCount) as topConnectionVolume,
         sum(r.totalCount) as totalVolume
    WHERE totalConnections > 0
    RETURN p.email as email, p.displayName as displayName, p.department as department,
           strongTies, weakTies, crossDeptCount, totalConnections, topConnectionVolume, totalVolume
    `,
    { organizationId }
  );

  return result.map((r) => {
    const totalConnections = r.totalConnections?.low || 1;
    const topVolume = r.topConnectionVolume?.low || 0;
    const totalVolume = r.totalVolume?.low || 1;

    return {
      email: r.email,
      displayName: r.displayName,
      department: r.department,
      strongTies: r.strongTies?.low || 0,
      weakTies: r.weakTies?.low || 0,
      bridgingConnections: r.crossDeptCount?.low || 0,
      concentrationScore: topVolume / totalVolume, // High = concentrated
      networkReach: totalConnections,
    };
  });
}

/**
 * Detect anomalies in communication patterns
 */
function detectAnomalies(pattern: CommunicationPattern): PatternAnomaly[] {
  const anomalies: PatternAnomaly[] = [];

  // Check for unusual hours
  if (pattern.patterns.temporal.afterHoursRatio > 0.3) {
    anomalies.push({
      type: 'unusual-hours',
      severity: pattern.patterns.temporal.afterHoursRatio > 0.5 ? 'high' : 'medium',
      description: `${Math.round(pattern.patterns.temporal.afterHoursRatio * 100)}% of communication outside business hours`,
      recommendation: 'Review workload distribution and work-life balance',
    });
  }

  // Check for weekend work
  if (pattern.patterns.temporal.weekendRatio > 0.15) {
    anomalies.push({
      type: 'unusual-hours',
      severity: pattern.patterns.temporal.weekendRatio > 0.3 ? 'high' : 'medium',
      description: `${Math.round(pattern.patterns.temporal.weekendRatio * 100)}% of communication on weekends`,
      recommendation: 'Consider workload rebalancing',
    });
  }

  // Check for potential burnout indicators
  if (
    pattern.patterns.temporal.afterHoursRatio > 0.4 &&
    pattern.patterns.behavioral.urgencyLevel > 0.7
  ) {
    anomalies.push({
      type: 'burnout-indicators',
      severity: 'high',
      description: 'Combination of after-hours work and high urgency suggests burnout risk',
      recommendation: 'Proactive check-in and workload review recommended',
    });
  }

  // Check for isolation
  if (pattern.patterns.relational.networkReach < 5 && pattern.patterns.relational.strongTies < 2) {
    anomalies.push({
      type: 'isolation-trend',
      severity: 'medium',
      description: 'Limited network connections may indicate isolation',
      recommendation: 'Consider team integration activities',
    });
  }

  // Check for overload
  if (pattern.patterns.relational.networkReach > 50 && pattern.patterns.behavioral.initiationRatio < 0.3) {
    anomalies.push({
      type: 'overload-risk',
      severity: 'medium',
      description: 'High inbound communication volume with limited outbound',
      recommendation: 'Review if communication routing is appropriate',
    });
  }

  // Check for silo formation
  if (pattern.patterns.relational.bridgingConnections === 0 && pattern.patterns.relational.strongTies > 5) {
    anomalies.push({
      type: 'silo-formation',
      severity: 'low',
      description: 'Strong internal connections but no cross-department links',
      recommendation: 'Encourage cross-functional collaboration',
    });
  }

  return anomalies;
}

/**
 * Calculate communication health score
 */
function calculateHealthScore(pattern: CommunicationPattern): number {
  let score = 100;

  // Penalize after-hours work
  score -= pattern.patterns.temporal.afterHoursRatio * 20;

  // Penalize weekend work
  score -= pattern.patterns.temporal.weekendRatio * 15;

  // Penalize low reciprocity
  if (pattern.patterns.behavioral.reciprocityScore < 0.3) {
    score -= 15;
  }

  // Penalize isolation
  if (pattern.patterns.relational.networkReach < 5) {
    score -= 10;
  }

  // Penalize over-concentration
  if (pattern.patterns.relational.concentrationScore > 0.5) {
    score -= 10;
  }

  // Penalize lack of bridging
  if (pattern.patterns.relational.bridgingConnections === 0) {
    score -= 5;
  }

  // Deduct for anomalies
  pattern.anomalies.forEach((a) => {
    if (a.severity === 'high') score -= 15;
    else if (a.severity === 'medium') score -= 10;
    else score -= 5;
  });

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate organization-wide trends
 */
function calculateOrganizationTrends(patterns: CommunicationPattern[]): OrganizationTrends {
  if (patterns.length === 0) {
    return {
      avgAfterHoursRatio: 0,
      avgResponseTime: 0,
      avgNetworkReach: 0,
      communicationHealth: 'healthy',
      siloRisk: 0,
      collaborationScore: 0,
      temporalDistribution: [],
    };
  }

  const avgAfterHoursRatio =
    patterns.reduce((sum, p) => sum + p.patterns.temporal.afterHoursRatio, 0) / patterns.length;

  const avgResponseTime =
    patterns.reduce((sum, p) => sum + p.patterns.temporal.avgResponseTime, 0) / patterns.length;

  const avgNetworkReach =
    patterns.reduce((sum, p) => sum + p.patterns.relational.networkReach, 0) / patterns.length;

  const avgHealthScore =
    patterns.reduce((sum, p) => sum + p.healthScore, 0) / patterns.length;

  // Determine overall health
  let communicationHealth: 'healthy' | 'warning' | 'concerning' = 'healthy';
  if (avgHealthScore < 60) {
    communicationHealth = 'concerning';
  } else if (avgHealthScore < 75) {
    communicationHealth = 'warning';
  }

  // Calculate silo risk
  const noBridgingCount = patterns.filter(
    (p) => p.patterns.relational.bridgingConnections === 0
  ).length;
  const siloRisk = noBridgingCount / patterns.length;

  // Calculate collaboration score
  const avgReciprocity =
    patterns.reduce((sum, p) => sum + p.patterns.behavioral.reciprocityScore, 0) / patterns.length;
  const avgBridging =
    patterns.reduce((sum, p) => sum + p.patterns.relational.bridgingConnections, 0) / patterns.length;
  const collaborationScore = (avgReciprocity * 0.5 + Math.min(avgBridging / 10, 1) * 0.5) * 100;

  // Temporal distribution (simplified)
  const temporalDistribution = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    volume: hour >= 9 && hour <= 17 ? 100 : hour >= 8 && hour <= 18 ? 50 : 10,
  }));

  return {
    avgAfterHoursRatio,
    avgResponseTime,
    avgNetworkReach,
    communicationHealth,
    siloRisk,
    collaborationScore,
    temporalDistribution,
  };
}

/**
 * Generate organizational alerts
 */
function generateAlerts(
  patterns: CommunicationPattern[],
  trends: OrganizationTrends
): PatternAlert[] {
  const alerts: PatternAlert[] = [];

  // High after-hours work alert
  const highAfterHours = patterns.filter(
    (p) => p.patterns.temporal.afterHoursRatio > 0.4
  );
  if (highAfterHours.length > 3) {
    alerts.push({
      type: 'after-hours-concern',
      affectedPeople: highAfterHours.map((p) => p.email),
      severity: 'warning',
      message: `${highAfterHours.length} people have high after-hours communication`,
      recommendation: 'Review workload distribution and consider process improvements',
    });
  }

  // Isolation alert
  const isolated = patterns.filter(
    (p) => p.patterns.relational.networkReach < 5
  );
  if (isolated.length > 2) {
    alerts.push({
      type: 'isolation-concern',
      affectedPeople: isolated.map((p) => p.email),
      severity: 'warning',
      message: `${isolated.length} people have limited network connections`,
      recommendation: 'Consider team building and integration activities',
    });
  }

  // Silo risk alert
  if (trends.siloRisk > 0.3) {
    alerts.push({
      type: 'silo-risk',
      affectedPeople: patterns
        .filter((p) => p.patterns.relational.bridgingConnections === 0)
        .map((p) => p.email),
      severity: trends.siloRisk > 0.5 ? 'critical' : 'warning',
      message: `${Math.round(trends.siloRisk * 100)}% of people have no cross-department connections`,
      recommendation: 'Implement cross-functional initiatives and collaboration programs',
    });
  }

  // Overall health alert
  if (trends.communicationHealth === 'concerning') {
    alerts.push({
      type: 'health-concern',
      affectedPeople: patterns.filter((p) => p.healthScore < 60).map((p) => p.email),
      severity: 'critical',
      message: 'Overall communication health is concerning',
      recommendation: 'Conduct organization-wide review of communication practices',
    });
  }

  return alerts;
}

/**
 * Get pattern for specific person
 */
export async function getPersonPattern(
  organizationId: string,
  email: string
): Promise<CommunicationPattern | null> {
  const result = await analyzePatterns(organizationId);
  return result.patterns.find((p) => p.email === email) || null;
}

/**
 * Get department patterns summary
 */
export async function getDepartmentPatterns(
  organizationId: string
): Promise<Array<{
  department: string;
  memberCount: number;
  avgHealthScore: number;
  commonAnomalies: string[];
  avgNetworkReach: number;
}>> {
  const result = await analyzePatterns(organizationId);

  const deptMap = new Map<string, CommunicationPattern[]>();
  result.patterns.forEach((p) => {
    if (p.department) {
      if (!deptMap.has(p.department)) {
        deptMap.set(p.department, []);
      }
      deptMap.get(p.department)!.push(p);
    }
  });

  return Array.from(deptMap.entries()).map(([department, patterns]) => {
    const anomalyCounts = new Map<string, number>();
    patterns.forEach((p) => {
      p.anomalies.forEach((a) => {
        anomalyCounts.set(a.type, (anomalyCounts.get(a.type) || 0) + 1);
      });
    });

    const commonAnomalies = Array.from(anomalyCounts.entries())
      .filter(([, count]) => count > patterns.length * 0.3)
      .map(([type]) => type);

    return {
      department,
      memberCount: patterns.length,
      avgHealthScore: patterns.reduce((sum, p) => sum + p.healthScore, 0) / patterns.length,
      commonAnomalies,
      avgNetworkReach:
        patterns.reduce((sum, p) => sum + p.patterns.relational.networkReach, 0) / patterns.length,
    };
  });
}

export default {
  analyzePatterns,
  getPersonPattern,
  getDepartmentPatterns,
};
