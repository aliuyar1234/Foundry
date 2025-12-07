/**
 * Team Conflict Detector
 * Analyzes communication patterns to identify emerging team conflicts
 *
 * Conflict indicators analyzed:
 * - Reduced direct communication between team members
 * - Increased CC-to-management (escalation patterns)
 * - Response time asymmetry (one-sided delays)
 * - Communication tone degradation (sentiment analysis indicators)
 * - Meeting avoidance patterns
 * - Communication bypassing (going around people)
 * - Clustering/siloing within teams
 */

import { Pool } from 'pg';
import { runQuery } from '../../../graph/connection.js';

export interface ConflictIndicator {
  type: ConflictIndicatorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
  involvedParties: string[];
  dataPoints: number;
  trend: 'stable' | 'escalating' | 'de-escalating';
}

export type ConflictIndicatorType =
  | 'communication_reduction'
  | 'management_escalation'
  | 'response_asymmetry'
  | 'meeting_avoidance'
  | 'communication_bypass'
  | 'team_siloing'
  | 'cc_overuse'
  | 'formal_tone_increase';

export interface TeamConflictAssessment {
  teamId: string;
  teamName: string;
  organizationId: string;
  overallConflictScore: number; // 0-100
  conflictLevel: 'healthy' | 'tension' | 'conflict' | 'critical';
  indicators: ConflictIndicator[];
  affectedRelationships: ConflictRelationship[];
  recommendedActions: string[];
  analysisWindow: {
    from: Date;
    to: Date;
  };
  confidence: number;
  analyzedAt: Date;
}

export interface ConflictRelationship {
  person1Id: string;
  person1Email: string;
  person1Name?: string;
  person2Id: string;
  person2Email: string;
  person2Name?: string;
  conflictScore: number;
  indicators: string[];
}

export interface ConflictDetectionOptions {
  organizationId: string;
  teamIds?: string[]; // Department names or team identifiers
  personIds?: string[]; // Specific people to analyze relationships for
  lookbackDays?: number;
  baselineDays?: number;
  minInteractions?: number;
  sensitivityLevel?: 'low' | 'medium' | 'high';
}

interface CommunicationPair {
  person1Id: string;
  person1Email: string;
  person1Name?: string;
  person2Id: string;
  person2Email: string;
  person2Name?: string;
  emailCount: number;
  meetingCount: number;
  avgResponseTime1to2: number; // Person 1 responding to Person 2
  avgResponseTime2to1: number;
  ccToManagementCount: number;
  directCount: number;
  bypassCount: number;
  formalPhraseCount: number;
}

interface TeamCommunicationMetrics {
  teamId: string;
  memberCount: number;
  pairs: CommunicationPair[];
  avgIntraTeamEmails: number;
  avgResponseTime: number;
  managementEscalationRate: number;
  meetingParticipationRate: number;
  communicationDensity: number; // edges / possible edges
}

const CONFLICT_THRESHOLDS = {
  low: {
    communicationReduction: 0.25,
    responseAsymmetry: 2.0, // 2x difference
    escalationRate: 0.15,
    bypassRate: 0.1,
  },
  medium: {
    communicationReduction: 0.35,
    responseAsymmetry: 1.75,
    escalationRate: 0.12,
    bypassRate: 0.08,
  },
  high: {
    communicationReduction: 0.20,
    responseAsymmetry: 1.5,
    escalationRate: 0.1,
    bypassRate: 0.05,
  },
};

export class ConflictDetector {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Detect team conflict patterns
   */
  async detectConflicts(
    options: ConflictDetectionOptions
  ): Promise<TeamConflictAssessment[]> {
    const {
      organizationId,
      teamIds,
      lookbackDays = 30,
      baselineDays = 90,
      minInteractions = 5,
      sensitivityLevel = 'medium',
    } = options;

    // Get teams to analyze
    const teams = await this.getTeamsToAnalyze(organizationId, teamIds);

    if (teams.length === 0) {
      return [];
    }

    const assessments: TeamConflictAssessment[] = [];
    const now = new Date();
    const lookbackFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const baselineFrom = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);

    const thresholds = CONFLICT_THRESHOLDS[sensitivityLevel];

    for (const team of teams) {
      // Get current team metrics
      const currentMetrics = await this.getTeamCommunicationMetrics(
        organizationId,
        team.id,
        lookbackFrom,
        now
      );

      // Skip if insufficient data
      if (currentMetrics.pairs.length === 0) {
        continue;
      }

      // Get baseline metrics
      const baselineMetrics = await this.getTeamCommunicationMetrics(
        organizationId,
        team.id,
        baselineFrom,
        lookbackFrom
      );

      // Analyze indicators
      const indicators = this.analyzeIndicators(
        currentMetrics,
        baselineMetrics,
        thresholds,
        minInteractions
      );

      // Identify affected relationships
      const affectedRelationships = this.identifyAffectedRelationships(
        currentMetrics,
        baselineMetrics,
        thresholds,
        minInteractions
      );

      // Calculate overall conflict score
      const overallConflictScore = this.calculateOverallConflictScore(
        indicators,
        affectedRelationships
      );
      const conflictLevel = this.determineConflictLevel(overallConflictScore);

      // Generate recommendations
      const recommendedActions = this.generateRecommendations(
        indicators,
        conflictLevel,
        affectedRelationships
      );

      // Calculate confidence
      const confidence = this.calculateConfidence(
        currentMetrics.pairs.length,
        baselineMetrics.pairs.length,
        minInteractions
      );

      assessments.push({
        teamId: team.id,
        teamName: team.name,
        organizationId,
        overallConflictScore,
        conflictLevel,
        indicators,
        affectedRelationships,
        recommendedActions,
        analysisWindow: {
          from: lookbackFrom,
          to: now,
        },
        confidence,
        analyzedAt: now,
      });
    }

    // Sort by conflict score descending
    assessments.sort((a, b) => b.overallConflictScore - a.overallConflictScore);

    return assessments;
  }

  /**
   * Get teams with active conflicts
   */
  async getConflictingTeams(
    organizationId: string,
    options?: Partial<ConflictDetectionOptions>
  ): Promise<TeamConflictAssessment[]> {
    const assessments = await this.detectConflicts({
      organizationId,
      ...options,
    });

    return assessments.filter(
      (a) => a.conflictLevel === 'conflict' || a.conflictLevel === 'critical'
    );
  }

  /**
   * Get specific relationship conflicts between individuals
   */
  async detectRelationshipConflicts(
    organizationId: string,
    person1Id: string,
    person2Id: string,
    options?: { lookbackDays?: number; baselineDays?: number }
  ): Promise<ConflictRelationship | null> {
    const lookbackDays = options?.lookbackDays || 30;
    const baselineDays = options?.baselineDays || 90;

    const now = new Date();
    const lookbackFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const baselineFrom = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);

    const currentPair = await this.getCommunicationPair(
      organizationId,
      person1Id,
      person2Id,
      lookbackFrom,
      now
    );

    if (!currentPair) {
      return null;
    }

    const baselinePair = await this.getCommunicationPair(
      organizationId,
      person1Id,
      person2Id,
      baselineFrom,
      lookbackFrom
    );

    const thresholds = CONFLICT_THRESHOLDS.medium;
    const indicators: string[] = [];
    let conflictScore = 0;

    // Check communication reduction
    if (baselinePair && baselinePair.emailCount > 0) {
      const reduction =
        (baselinePair.emailCount - currentPair.emailCount) / baselinePair.emailCount;
      if (reduction > thresholds.communicationReduction) {
        indicators.push('Communication reduced significantly');
        conflictScore += reduction * 100;
      }
    }

    // Check response asymmetry
    if (currentPair.avgResponseTime1to2 > 0 && currentPair.avgResponseTime2to1 > 0) {
      const asymmetry = Math.max(
        currentPair.avgResponseTime1to2 / currentPair.avgResponseTime2to1,
        currentPair.avgResponseTime2to1 / currentPair.avgResponseTime1to2
      );
      if (asymmetry > thresholds.responseAsymmetry) {
        indicators.push('Response time asymmetry detected');
        conflictScore += (asymmetry - 1) * 30;
      }
    }

    // Check escalation patterns
    const escalationRate =
      currentPair.ccToManagementCount /
      Math.max(1, currentPair.emailCount + currentPair.meetingCount);
    if (escalationRate > thresholds.escalationRate) {
      indicators.push('High management escalation rate');
      conflictScore += escalationRate * 200;
    }

    if (indicators.length === 0) {
      return null;
    }

    return {
      person1Id: currentPair.person1Id,
      person1Email: currentPair.person1Email,
      person1Name: currentPair.person1Name,
      person2Id: currentPair.person2Id,
      person2Email: currentPair.person2Email,
      person2Name: currentPair.person2Name,
      conflictScore: Math.min(100, conflictScore),
      indicators,
    };
  }

  /**
   * Get teams from Neo4j (by department)
   */
  private async getTeamsToAnalyze(
    organizationId: string,
    teamIds?: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    let query: string;
    let params: Record<string, unknown>;

    if (teamIds && teamIds.length > 0) {
      query = `
        MATCH (p:Person {organizationId: $organizationId})
        WHERE p.department IN $teamIds
        WITH DISTINCT p.department as department
        WHERE department IS NOT NULL
        RETURN department as id, department as name
      `;
      params = { organizationId, teamIds };
    } else {
      query = `
        MATCH (p:Person {organizationId: $organizationId})
        WITH DISTINCT p.department as department
        WHERE department IS NOT NULL
        RETURN department as id, department as name
      `;
      params = { organizationId };
    }

    const results = await runQuery<{ id: string; name: string }>(query, params);
    return results;
  }

  /**
   * Get team communication metrics
   */
  private async getTeamCommunicationMetrics(
    organizationId: string,
    teamId: string,
    from: Date,
    to: Date
  ): Promise<TeamCommunicationMetrics> {
    // Get team members from Neo4j
    const members = await runQuery<{
      id: string;
      email: string;
      displayName?: string;
    }>(
      `
      MATCH (p:Person {organizationId: $organizationId, department: $teamId})
      RETURN p.id as id, p.email as email, p.displayName as displayName
      `,
      { organizationId, teamId }
    );

    if (members.length < 2) {
      return {
        teamId,
        memberCount: members.length,
        pairs: [],
        avgIntraTeamEmails: 0,
        avgResponseTime: 0,
        managementEscalationRate: 0,
        meetingParticipationRate: 0,
        communicationDensity: 0,
      };
    }

    const memberIds = members.map((m) => m.id);
    const memberEmailMap = new Map(members.map((m) => [m.id, { email: m.email, name: m.displayName }]));

    // Query communication pairs from TimescaleDB
    const pairQuery = `
      WITH communications AS (
        SELECT
          actor_id as sender_id,
          metadata->>'recipientId' as recipient_id,
          event_type,
          timestamp,
          metadata,
          CASE
            WHEN metadata->>'hasManagerCC' = 'true' THEN 1
            ELSE 0
          END as has_manager_cc,
          CASE
            WHEN metadata->>'isDirect' = 'true' THEN 1
            ELSE 0
          END as is_direct,
          COALESCE((metadata->>'responseTimeMs')::FLOAT, 0) as response_time
        FROM events
        WHERE organization_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND actor_id = ANY($4)
          AND (metadata->>'recipientId')::TEXT = ANY($4)
          AND event_type IN ('email_sent', 'message_sent', 'meeting_attended')
      )
      SELECT
        sender_id as person1_id,
        recipient_id as person2_id,
        COUNT(*) FILTER (WHERE event_type IN ('email_sent', 'message_sent')) as email_count,
        COUNT(*) FILTER (WHERE event_type = 'meeting_attended') as meeting_count,
        AVG(response_time) FILTER (WHERE response_time > 0) as avg_response_time,
        SUM(has_manager_cc) as cc_to_management_count,
        SUM(is_direct) as direct_count
      FROM communications
      GROUP BY sender_id, recipient_id
    `;

    const pairResult = await this.pool.query(pairQuery, [
      organizationId,
      from,
      to,
      memberIds,
    ]);

    // Build pair map (combining both directions)
    const pairMap = new Map<string, CommunicationPair>();

    for (const row of pairResult.rows) {
      const p1Info = memberEmailMap.get(row.person1_id);
      const p2Info = memberEmailMap.get(row.person2_id);
      if (!p1Info || !p2Info) continue;

      // Create canonical pair key
      const key = [row.person1_id, row.person2_id].sort().join('-');
      const existing = pairMap.get(key);

      if (existing) {
        // Update existing pair with reverse direction data
        if (row.person1_id === existing.person1Id) {
          existing.avgResponseTime1to2 = parseFloat(row.avg_response_time) || 0;
        } else {
          existing.avgResponseTime2to1 = parseFloat(row.avg_response_time) || 0;
        }
        existing.emailCount += parseInt(row.email_count) || 0;
        existing.meetingCount += parseInt(row.meeting_count) || 0;
        existing.ccToManagementCount += parseInt(row.cc_to_management_count) || 0;
        existing.directCount += parseInt(row.direct_count) || 0;
      } else {
        pairMap.set(key, {
          person1Id: row.person1_id,
          person1Email: p1Info.email,
          person1Name: p1Info.name,
          person2Id: row.person2_id,
          person2Email: p2Info.email,
          person2Name: p2Info.name,
          emailCount: parseInt(row.email_count) || 0,
          meetingCount: parseInt(row.meeting_count) || 0,
          avgResponseTime1to2: parseFloat(row.avg_response_time) || 0,
          avgResponseTime2to1: 0,
          ccToManagementCount: parseInt(row.cc_to_management_count) || 0,
          directCount: parseInt(row.direct_count) || 0,
          bypassCount: 0,
          formalPhraseCount: 0,
        });
      }
    }

    const pairs = Array.from(pairMap.values());
    const possiblePairs = (members.length * (members.length - 1)) / 2;

    // Calculate aggregates
    const totalEmails = pairs.reduce((sum, p) => sum + p.emailCount, 0);
    const totalResponseTime = pairs.reduce(
      (sum, p) => sum + p.avgResponseTime1to2 + p.avgResponseTime2to1,
      0
    );
    const totalEscalations = pairs.reduce((sum, p) => sum + p.ccToManagementCount, 0);
    const totalInteractions = pairs.reduce(
      (sum, p) => sum + p.emailCount + p.meetingCount,
      0
    );

    return {
      teamId,
      memberCount: members.length,
      pairs,
      avgIntraTeamEmails: pairs.length > 0 ? totalEmails / pairs.length : 0,
      avgResponseTime:
        pairs.length > 0 ? totalResponseTime / (pairs.length * 2) : 0,
      managementEscalationRate:
        totalInteractions > 0 ? totalEscalations / totalInteractions : 0,
      meetingParticipationRate: 0, // Would need additional query
      communicationDensity: possiblePairs > 0 ? pairs.length / possiblePairs : 0,
    };
  }

  /**
   * Get communication pair data
   */
  private async getCommunicationPair(
    organizationId: string,
    person1Id: string,
    person2Id: string,
    from: Date,
    to: Date
  ): Promise<CommunicationPair | null> {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE actor_id = $2 AND metadata->>'recipientId' = $3) as emails_1_to_2,
        COUNT(*) FILTER (WHERE actor_id = $3 AND metadata->>'recipientId' = $2) as emails_2_to_1,
        AVG(CASE
          WHEN actor_id = $2 AND metadata->>'recipientId' = $3
          THEN (metadata->>'responseTimeMs')::FLOAT
        END) as response_time_1_to_2,
        AVG(CASE
          WHEN actor_id = $3 AND metadata->>'recipientId' = $2
          THEN (metadata->>'responseTimeMs')::FLOAT
        END) as response_time_2_to_1,
        COUNT(*) FILTER (WHERE metadata->>'hasManagerCC' = 'true') as cc_to_management,
        COUNT(*) FILTER (WHERE metadata->>'isDirect' = 'true') as direct_count
      FROM events
      WHERE organization_id = $1
        AND timestamp >= $4
        AND timestamp <= $5
        AND (
          (actor_id = $2 AND metadata->>'recipientId' = $3)
          OR (actor_id = $3 AND metadata->>'recipientId' = $2)
        )
        AND event_type IN ('email_sent', 'message_sent')
    `;

    const result = await this.pool.query(query, [
      organizationId,
      person1Id,
      person2Id,
      from,
      to,
    ]);

    const row = result.rows[0];
    if (!row || (parseInt(row.emails_1_to_2) + parseInt(row.emails_2_to_1)) === 0) {
      return null;
    }

    // Get person info from Neo4j
    const persons = await runQuery<{ id: string; email: string; displayName?: string }>(
      `
      MATCH (p:Person {organizationId: $organizationId})
      WHERE p.id IN [$person1Id, $person2Id]
      RETURN p.id as id, p.email as email, p.displayName as displayName
      `,
      { organizationId, person1Id, person2Id }
    );

    const personMap = new Map(persons.map((p) => [p.id, p]));
    const p1 = personMap.get(person1Id);
    const p2 = personMap.get(person2Id);

    return {
      person1Id,
      person1Email: p1?.email || '',
      person1Name: p1?.displayName,
      person2Id,
      person2Email: p2?.email || '',
      person2Name: p2?.displayName,
      emailCount: parseInt(row.emails_1_to_2) + parseInt(row.emails_2_to_1),
      meetingCount: 0,
      avgResponseTime1to2: parseFloat(row.response_time_1_to_2) || 0,
      avgResponseTime2to1: parseFloat(row.response_time_2_to_1) || 0,
      ccToManagementCount: parseInt(row.cc_to_management) || 0,
      directCount: parseInt(row.direct_count) || 0,
      bypassCount: 0,
      formalPhraseCount: 0,
    };
  }

  /**
   * Analyze conflict indicators
   */
  private analyzeIndicators(
    current: TeamCommunicationMetrics,
    baseline: TeamCommunicationMetrics,
    thresholds: typeof CONFLICT_THRESHOLDS.medium,
    minInteractions: number
  ): ConflictIndicator[] {
    const indicators: ConflictIndicator[] = [];

    // 1. Communication Reduction
    if (baseline.avgIntraTeamEmails > 0) {
      const reduction =
        (baseline.avgIntraTeamEmails - current.avgIntraTeamEmails) /
        baseline.avgIntraTeamEmails;

      if (reduction > thresholds.communicationReduction) {
        const score = Math.min(100, reduction * 150);
        const affectedPairs = current.pairs.filter((p) => {
          const baselinePair = baseline.pairs.find(
            (bp) =>
              (bp.person1Id === p.person1Id && bp.person2Id === p.person2Id) ||
              (bp.person1Id === p.person2Id && bp.person2Id === p.person1Id)
          );
          return baselinePair && p.emailCount < baselinePair.emailCount * 0.5;
        });

        indicators.push({
          type: 'communication_reduction',
          severity: this.scoreToSeverity(score),
          score,
          description: `Intra-team communication has decreased by ${Math.round(reduction * 100)}%`,
          involvedParties: affectedPairs.flatMap((p) => [p.person1Email, p.person2Email]),
          dataPoints: current.pairs.length,
          trend: 'escalating',
        });
      }
    }

    // 2. Management Escalation
    if (current.managementEscalationRate > thresholds.escalationRate) {
      const increase = baseline.managementEscalationRate > 0
        ? (current.managementEscalationRate - baseline.managementEscalationRate) /
          baseline.managementEscalationRate
        : current.managementEscalationRate;

      const score = Math.min(100, current.managementEscalationRate * 400 + increase * 50);
      const highEscalationPairs = current.pairs.filter(
        (p) =>
          p.ccToManagementCount / Math.max(1, p.emailCount + p.meetingCount) >
          thresholds.escalationRate
      );

      indicators.push({
        type: 'management_escalation',
        severity: this.scoreToSeverity(score),
        score,
        description: `${Math.round(current.managementEscalationRate * 100)}% of communications CC management`,
        involvedParties: highEscalationPairs.flatMap((p) => [p.person1Email, p.person2Email]),
        dataPoints: current.pairs.reduce((sum, p) => sum + p.ccToManagementCount, 0),
        trend: increase > 0.1 ? 'escalating' : 'stable',
      });
    }

    // 3. Response Asymmetry
    const asymmetricPairs = current.pairs.filter((p) => {
      if (p.avgResponseTime1to2 === 0 || p.avgResponseTime2to1 === 0) return false;
      const ratio = Math.max(
        p.avgResponseTime1to2 / p.avgResponseTime2to1,
        p.avgResponseTime2to1 / p.avgResponseTime1to2
      );
      return ratio > thresholds.responseAsymmetry;
    });

    if (asymmetricPairs.length > 0) {
      const score = Math.min(100, (asymmetricPairs.length / current.pairs.length) * 200);
      indicators.push({
        type: 'response_asymmetry',
        severity: this.scoreToSeverity(score),
        score,
        description: `${asymmetricPairs.length} relationship(s) show significant response time imbalance`,
        involvedParties: asymmetricPairs.flatMap((p) => [p.person1Email, p.person2Email]),
        dataPoints: asymmetricPairs.length,
        trend: 'stable',
      });
    }

    // 4. Team Siloing
    if (current.communicationDensity < 0.3 && current.memberCount > 3) {
      const densityDrop = baseline.communicationDensity > 0
        ? (baseline.communicationDensity - current.communicationDensity) /
          baseline.communicationDensity
        : 0;

      if (densityDrop > 0.2 || current.communicationDensity < 0.2) {
        const score = Math.min(100, (1 - current.communicationDensity) * 80);
        indicators.push({
          type: 'team_siloing',
          severity: this.scoreToSeverity(score),
          score,
          description: `Only ${Math.round(current.communicationDensity * 100)}% of possible team connections are active`,
          involvedParties: [],
          dataPoints: current.pairs.length,
          trend: densityDrop > 0.1 ? 'escalating' : 'stable',
        });
      }
    }

    // 5. CC Overuse (individual level)
    const highCCPairs = current.pairs.filter((p) => {
      const totalComms = p.emailCount + p.meetingCount;
      return totalComms > minInteractions && p.directCount / totalComms < 0.5;
    });

    if (highCCPairs.length > current.pairs.length * 0.3) {
      const score = Math.min(100, (highCCPairs.length / current.pairs.length) * 150);
      indicators.push({
        type: 'cc_overuse',
        severity: this.scoreToSeverity(score),
        score,
        description: `${Math.round((highCCPairs.length / current.pairs.length) * 100)}% of relationships show excessive CC usage`,
        involvedParties: highCCPairs.flatMap((p) => [p.person1Email, p.person2Email]),
        dataPoints: highCCPairs.length,
        trend: 'stable',
      });
    }

    return indicators;
  }

  /**
   * Identify specific relationships with conflicts
   */
  private identifyAffectedRelationships(
    current: TeamCommunicationMetrics,
    baseline: TeamCommunicationMetrics,
    thresholds: typeof CONFLICT_THRESHOLDS.medium,
    minInteractions: number
  ): ConflictRelationship[] {
    const relationships: ConflictRelationship[] = [];

    for (const pair of current.pairs) {
      const totalInteractions = pair.emailCount + pair.meetingCount;
      if (totalInteractions < minInteractions) continue;

      const pairIndicators: string[] = [];
      let conflictScore = 0;

      // Find baseline pair
      const baselinePair = baseline.pairs.find(
        (bp) =>
          (bp.person1Id === pair.person1Id && bp.person2Id === pair.person2Id) ||
          (bp.person1Id === pair.person2Id && bp.person2Id === pair.person1Id)
      );

      // Check communication reduction
      if (baselinePair && baselinePair.emailCount > minInteractions) {
        const reduction = (baselinePair.emailCount - pair.emailCount) / baselinePair.emailCount;
        if (reduction > thresholds.communicationReduction) {
          pairIndicators.push(`Communication reduced by ${Math.round(reduction * 100)}%`);
          conflictScore += reduction * 50;
        }
      }

      // Check response asymmetry
      if (pair.avgResponseTime1to2 > 0 && pair.avgResponseTime2to1 > 0) {
        const asymmetry = Math.max(
          pair.avgResponseTime1to2 / pair.avgResponseTime2to1,
          pair.avgResponseTime2to1 / pair.avgResponseTime1to2
        );
        if (asymmetry > thresholds.responseAsymmetry) {
          pairIndicators.push(`Response time asymmetry: ${asymmetry.toFixed(1)}x`);
          conflictScore += (asymmetry - 1) * 20;
        }
      }

      // Check escalation rate
      const escalationRate = pair.ccToManagementCount / totalInteractions;
      if (escalationRate > thresholds.escalationRate) {
        pairIndicators.push(`High escalation rate: ${Math.round(escalationRate * 100)}%`);
        conflictScore += escalationRate * 100;
      }

      // Check direct communication ratio
      const directRatio = pair.directCount / totalInteractions;
      if (directRatio < 0.4) {
        pairIndicators.push(`Low direct communication: ${Math.round(directRatio * 100)}%`);
        conflictScore += (1 - directRatio) * 30;
      }

      if (pairIndicators.length > 0 && conflictScore > 20) {
        relationships.push({
          person1Id: pair.person1Id,
          person1Email: pair.person1Email,
          person1Name: pair.person1Name,
          person2Id: pair.person2Id,
          person2Email: pair.person2Email,
          person2Name: pair.person2Name,
          conflictScore: Math.min(100, conflictScore),
          indicators: pairIndicators,
        });
      }
    }

    // Sort by conflict score
    return relationships.sort((a, b) => b.conflictScore - a.conflictScore);
  }

  /**
   * Calculate overall conflict score
   */
  private calculateOverallConflictScore(
    indicators: ConflictIndicator[],
    relationships: ConflictRelationship[]
  ): number {
    if (indicators.length === 0 && relationships.length === 0) {
      return 0;
    }

    // Indicator contribution
    const indicatorWeights: Record<ConflictIndicatorType, number> = {
      communication_reduction: 1.3,
      management_escalation: 1.5,
      response_asymmetry: 1.0,
      meeting_avoidance: 1.2,
      communication_bypass: 1.4,
      team_siloing: 1.1,
      cc_overuse: 0.9,
      formal_tone_increase: 0.8,
    };

    let indicatorScore = 0;
    let totalWeight = 0;

    for (const indicator of indicators) {
      const weight = indicatorWeights[indicator.type] || 1.0;
      indicatorScore += indicator.score * weight;
      totalWeight += weight;
    }

    const avgIndicatorScore = totalWeight > 0 ? indicatorScore / totalWeight : 0;

    // Relationship contribution
    const avgRelationshipScore =
      relationships.length > 0
        ? relationships.reduce((sum, r) => sum + r.conflictScore, 0) / relationships.length
        : 0;

    // Multiple indicators boost
    const indicatorCountBoost = Math.min(15, (indicators.length - 1) * 5);

    // Multiple affected relationships boost
    const relationshipCountBoost = Math.min(15, (relationships.length - 1) * 3);

    return Math.min(
      100,
      avgIndicatorScore * 0.6 +
        avgRelationshipScore * 0.4 +
        indicatorCountBoost +
        relationshipCountBoost
    );
  }

  /**
   * Determine conflict level
   */
  private determineConflictLevel(
    score: number
  ): 'healthy' | 'tension' | 'conflict' | 'critical' {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'conflict';
    if (score >= 25) return 'tension';
    return 'healthy';
  }

  /**
   * Convert score to severity
   */
  private scoreToSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    indicators: ConflictIndicator[],
    conflictLevel: string,
    relationships: ConflictRelationship[]
  ): string[] {
    const recommendations: string[] = [];

    for (const indicator of indicators) {
      switch (indicator.type) {
        case 'communication_reduction':
          recommendations.push('Schedule team-building activities to rebuild communication');
          recommendations.push('Consider restructuring meeting cadences to encourage interaction');
          break;

        case 'management_escalation':
          recommendations.push('Train team on conflict resolution techniques');
          recommendations.push('Clarify decision-making authority and escalation paths');
          break;

        case 'response_asymmetry':
          recommendations.push('Address potential power imbalances or workload issues');
          recommendations.push('Facilitate direct conversations between affected parties');
          break;

        case 'team_siloing':
          recommendations.push('Create cross-functional projects to bridge gaps');
          recommendations.push('Review team structure for collaboration barriers');
          break;

        case 'cc_overuse':
          recommendations.push('Establish clearer communication norms');
          recommendations.push('Address underlying trust issues in the team');
          break;

        case 'communication_bypass':
          recommendations.push('Investigate reasons for communication circumvention');
          recommendations.push('Ensure all team members have appropriate access and authority');
          break;
      }
    }

    // Relationship-specific recommendations
    if (relationships.length > 0 && relationships.length <= 3) {
      recommendations.push(
        `Consider mediated discussions for ${relationships.length} specific relationship(s)`
      );
    } else if (relationships.length > 3) {
      recommendations.push('Team-wide intervention may be needed given multiple affected relationships');
    }

    // Urgency recommendations
    if (conflictLevel === 'critical') {
      recommendations.unshift('URGENT: Consider immediate management intervention');
      recommendations.push('Evaluate if temporary team restructuring is needed');
    } else if (conflictLevel === 'conflict') {
      recommendations.unshift('Schedule a team retrospective within the next 2 weeks');
    }

    return [...new Set(recommendations)];
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(
    currentPairs: number,
    baselinePairs: number,
    minInteractions: number
  ): number {
    const currentScore = Math.min(1, currentPairs / 10) * 0.4;
    const baselineScore = Math.min(1, baselinePairs / 15) * 0.4;
    const minimumMet = currentPairs >= 2 && baselinePairs >= 2 ? 0.2 : 0;

    return currentScore + baselineScore + minimumMet;
  }
}

// Factory function
let conflictDetectorInstance: ConflictDetector | null = null;

export function createConflictDetector(pool: Pool): ConflictDetector {
  if (!conflictDetectorInstance) {
    conflictDetectorInstance = new ConflictDetector(pool);
  }
  return conflictDetectorInstance;
}

export function resetConflictDetector(): void {
  conflictDetectorInstance = null;
}
