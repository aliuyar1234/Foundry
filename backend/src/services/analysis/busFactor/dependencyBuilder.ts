/**
 * Knowledge Dependency Graph Builder
 * Builds a graph of knowledge dependencies between people and processes/domains
 *
 * Analyzes:
 * - Process participation patterns
 * - Communication centrality
 * - Document authorship/ownership
 * - Meeting attendance patterns
 * - Response patterns (who answers questions about what)
 */

import { Pool } from 'pg';
import { runQuery } from '../../../graph/connection.js';

export interface KnowledgeDomain {
  id: string;
  name: string;
  type: 'process' | 'system' | 'department' | 'topic' | 'custom';
  description?: string;
  relatedProcessIds?: string[];
  keywords?: string[];
}

export interface PersonKnowledge {
  personId: string;
  email: string;
  displayName?: string;
  department?: string;
  domains: DomainExpertise[];
  overallKnowledgeScore: number;
  uniqueKnowledgeCount: number; // Domains where this person is the sole/primary expert
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface DomainExpertise {
  domainId: string;
  domainName: string;
  expertiseScore: number; // 0-100
  isUniqueExpert: boolean;
  isPrimaryExpert: boolean;
  contributionFactors: ContributionFactor[];
  lastActivity?: Date;
}

export interface ContributionFactor {
  type: ContributionType;
  weight: number;
  count: number;
  description: string;
}

export type ContributionType =
  | 'process_participation'
  | 'communication_hub'
  | 'document_authorship'
  | 'meeting_presence'
  | 'question_responder'
  | 'task_ownership'
  | 'mentoring_activity';

export interface KnowledgeGraph {
  domains: KnowledgeDomain[];
  experts: PersonKnowledge[];
  dependencies: KnowledgeDependency[];
  organizationCoverage: number; // 0-1, how well knowledge is distributed
  singlePointsOfFailure: string[]; // Person IDs who are sole experts
}

export interface KnowledgeDependency {
  domainId: string;
  personId: string;
  dependencyStrength: number; // 0-1, how dependent the domain is on this person
  redundancyLevel: number; // 0-1, how many others can cover
  knowledgeType: 'explicit' | 'tacit' | 'mixed';
}

export interface DependencyBuilderOptions {
  organizationId: string;
  lookbackDays?: number;
  minActivityThreshold?: number;
  includeExternalDomains?: boolean;
  customDomains?: KnowledgeDomain[];
}

// Contribution weights for expertise calculation
const CONTRIBUTION_WEIGHTS: Record<ContributionType, number> = {
  process_participation: 1.2,
  communication_hub: 1.0,
  document_authorship: 1.3,
  meeting_presence: 0.8,
  question_responder: 1.5,
  task_ownership: 1.4,
  mentoring_activity: 1.1,
};

export class KnowledgeDependencyBuilder {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Build complete knowledge dependency graph
   */
  async buildKnowledgeGraph(
    options: DependencyBuilderOptions
  ): Promise<KnowledgeGraph> {
    const {
      organizationId,
      lookbackDays = 180,
      minActivityThreshold = 5,
      customDomains = [],
    } = options;

    const now = new Date();
    const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    // 1. Discover or use provided knowledge domains
    const domains = customDomains.length > 0
      ? customDomains
      : await this.discoverDomains(organizationId, from, now);

    if (domains.length === 0) {
      return {
        domains: [],
        experts: [],
        dependencies: [],
        organizationCoverage: 0,
        singlePointsOfFailure: [],
      };
    }

    // 2. Get all persons in organization
    const persons = await this.getPersons(organizationId);

    // 3. Calculate expertise for each person in each domain
    const expertiseMatrix = await this.buildExpertiseMatrix(
      organizationId,
      persons,
      domains,
      from,
      now,
      minActivityThreshold
    );

    // 4. Identify unique experts and primary experts per domain
    const { experts, dependencies } = this.analyzeExpertiseDistribution(
      expertiseMatrix,
      domains,
      persons
    );

    // 5. Calculate organization-wide metrics
    const singlePointsOfFailure = experts
      .filter((e) => e.uniqueKnowledgeCount > 0)
      .map((e) => e.personId);

    const organizationCoverage = this.calculateOrganizationCoverage(
      domains,
      dependencies
    );

    return {
      domains,
      experts,
      dependencies,
      organizationCoverage,
      singlePointsOfFailure,
    };
  }

  /**
   * Get knowledge dependencies for a specific person
   */
  async getPersonKnowledge(
    organizationId: string,
    personId: string,
    options?: { lookbackDays?: number }
  ): Promise<PersonKnowledge | null> {
    const lookbackDays = options?.lookbackDays || 180;
    const now = new Date();
    const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    // Get person info
    const persons = await runQuery<{
      id: string;
      email: string;
      displayName?: string;
      department?: string;
    }>(
      `
      MATCH (p:Person {organizationId: $organizationId, id: $personId})
      RETURN p.id as id, p.email as email, p.displayName as displayName, p.department as department
      `,
      { organizationId, personId }
    );

    if (persons.length === 0) {
      return null;
    }

    const person = persons[0];

    // Discover domains
    const domains = await this.discoverDomains(organizationId, from, now);

    // Calculate expertise
    const expertiseScores = await this.calculatePersonExpertise(
      organizationId,
      personId,
      domains,
      from,
      now
    );

    // Get all persons for comparison
    const allPersons = await this.getPersons(organizationId);
    const expertiseMatrix = await this.buildExpertiseMatrix(
      organizationId,
      allPersons,
      domains,
      from,
      now,
      5
    );

    // Determine unique/primary expert status
    const domainExpertise: DomainExpertise[] = [];
    let uniqueKnowledgeCount = 0;

    for (const domain of domains) {
      const personScore = expertiseScores.get(domain.id) || 0;
      if (personScore === 0) continue;

      // Get all scores for this domain
      const domainScores: Array<{ personId: string; score: number }> = [];
      for (const [pid, scores] of expertiseMatrix) {
        const score = scores.get(domain.id);
        if (score && score > 0) {
          domainScores.push({ personId: pid, score });
        }
      }

      domainScores.sort((a, b) => b.score - a.score);

      const isUniqueExpert = domainScores.length === 1 && domainScores[0].personId === personId;
      const isPrimaryExpert = domainScores.length > 0 && domainScores[0].personId === personId;

      if (isUniqueExpert) {
        uniqueKnowledgeCount++;
      }

      const factors = await this.getContributionFactors(
        organizationId,
        personId,
        domain,
        from,
        now
      );

      domainExpertise.push({
        domainId: domain.id,
        domainName: domain.name,
        expertiseScore: personScore,
        isUniqueExpert,
        isPrimaryExpert,
        contributionFactors: factors,
      });
    }

    const overallKnowledgeScore =
      domainExpertise.length > 0
        ? domainExpertise.reduce((sum, d) => sum + d.expertiseScore, 0) /
          domainExpertise.length
        : 0;

    const criticality = this.determineCriticality(
      uniqueKnowledgeCount,
      overallKnowledgeScore
    );

    return {
      personId: person.id,
      email: person.email,
      displayName: person.displayName,
      department: person.department,
      domains: domainExpertise,
      overallKnowledgeScore,
      uniqueKnowledgeCount,
      criticality,
    };
  }

  /**
   * Discover knowledge domains from organizational data
   */
  private async discoverDomains(
    organizationId: string,
    from: Date,
    to: Date
  ): Promise<KnowledgeDomain[]> {
    const domains: KnowledgeDomain[] = [];

    // 1. Discover process-based domains
    const processes = await runQuery<{ id: string; name: string }>(
      `
      MATCH (p:Process {organizationId: $organizationId})
      RETURN p.id as id, p.name as name
      `,
      { organizationId }
    );

    for (const process of processes) {
      domains.push({
        id: `process:${process.id}`,
        name: process.name,
        type: 'process',
        relatedProcessIds: [process.id],
      });
    }

    // 2. Discover department-based domains
    const departments = await runQuery<{ department: string }>(
      `
      MATCH (p:Person {organizationId: $organizationId})
      WHERE p.department IS NOT NULL
      RETURN DISTINCT p.department as department
      `,
      { organizationId }
    );

    for (const dept of departments) {
      domains.push({
        id: `dept:${dept.department}`,
        name: dept.department,
        type: 'department',
      });
    }

    // 3. Discover topic-based domains from event metadata
    const topicQuery = `
      SELECT DISTINCT metadata->>'topic' as topic
      FROM events
      WHERE organization_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
        AND metadata->>'topic' IS NOT NULL
      LIMIT 50
    `;

    const topicResult = await this.pool.query(topicQuery, [organizationId, from, to]);

    for (const row of topicResult.rows) {
      if (row.topic) {
        domains.push({
          id: `topic:${row.topic}`,
          name: row.topic,
          type: 'topic',
          keywords: [row.topic.toLowerCase()],
        });
      }
    }

    return domains;
  }

  /**
   * Get persons in organization
   */
  private async getPersons(
    organizationId: string
  ): Promise<Array<{ id: string; email: string; displayName?: string; department?: string }>> {
    return runQuery<{
      id: string;
      email: string;
      displayName?: string;
      department?: string;
    }>(
      `
      MATCH (p:Person {organizationId: $organizationId})
      RETURN p.id as id, p.email as email, p.displayName as displayName, p.department as department
      `,
      { organizationId }
    );
  }

  /**
   * Build expertise matrix: person -> domain -> score
   */
  private async buildExpertiseMatrix(
    organizationId: string,
    persons: Array<{ id: string; email: string }>,
    domains: KnowledgeDomain[],
    from: Date,
    to: Date,
    minActivityThreshold: number
  ): Promise<Map<string, Map<string, number>>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const person of persons) {
      const scores = await this.calculatePersonExpertise(
        organizationId,
        person.id,
        domains,
        from,
        to
      );

      // Filter out low activity scores
      const filteredScores = new Map<string, number>();
      for (const [domainId, score] of scores) {
        if (score >= minActivityThreshold) {
          filteredScores.set(domainId, score);
        }
      }

      if (filteredScores.size > 0) {
        matrix.set(person.id, filteredScores);
      }
    }

    return matrix;
  }

  /**
   * Calculate expertise scores for a person across all domains
   */
  private async calculatePersonExpertise(
    organizationId: string,
    personId: string,
    domains: KnowledgeDomain[],
    from: Date,
    to: Date
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();

    for (const domain of domains) {
      const factors = await this.getContributionFactors(
        organizationId,
        personId,
        domain,
        from,
        to
      );

      // Calculate weighted score
      let totalScore = 0;
      let totalWeight = 0;

      for (const factor of factors) {
        const weight = CONTRIBUTION_WEIGHTS[factor.type] || 1.0;
        totalScore += factor.weight * weight * Math.min(factor.count / 10, 10); // Cap contribution per factor
        totalWeight += weight;
      }

      const normalizedScore = totalWeight > 0
        ? Math.min(100, (totalScore / totalWeight) * 20)
        : 0;

      scores.set(domain.id, normalizedScore);
    }

    return scores;
  }

  /**
   * Get contribution factors for a person in a domain
   */
  private async getContributionFactors(
    organizationId: string,
    personId: string,
    domain: KnowledgeDomain,
    from: Date,
    to: Date
  ): Promise<ContributionFactor[]> {
    const factors: ContributionFactor[] = [];

    // 1. Process participation (for process domains)
    if (domain.type === 'process' && domain.relatedProcessIds) {
      const processQuery = `
        SELECT COUNT(*) as count
        FROM events
        WHERE organization_id = $1
          AND actor_id = $2
          AND metadata->>'processId' = ANY($3)
          AND timestamp >= $4
          AND timestamp <= $5
      `;

      const processResult = await this.pool.query(processQuery, [
        organizationId,
        personId,
        domain.relatedProcessIds,
        from,
        to,
      ]);

      const count = parseInt(processResult.rows[0]?.count) || 0;
      if (count > 0) {
        factors.push({
          type: 'process_participation',
          weight: Math.min(count / 50, 1),
          count,
          description: `Participated in ${count} process activities`,
        });
      }
    }

    // 2. Communication hub (emails/messages about domain topics)
    if (domain.keywords && domain.keywords.length > 0) {
      const commQuery = `
        SELECT COUNT(*) as count
        FROM events
        WHERE organization_id = $1
          AND actor_id = $2
          AND event_type IN ('email_sent', 'message_sent')
          AND timestamp >= $3
          AND timestamp <= $4
          AND (
            metadata->>'subject' ILIKE ANY($5)
            OR metadata->>'topic' ILIKE ANY($5)
          )
      `;

      const patterns = domain.keywords.map((k) => `%${k}%`);
      const commResult = await this.pool.query(commQuery, [
        organizationId,
        personId,
        from,
        to,
        patterns,
      ]);

      const count = parseInt(commResult.rows[0]?.count) || 0;
      if (count > 0) {
        factors.push({
          type: 'communication_hub',
          weight: Math.min(count / 30, 1),
          count,
          description: `Sent ${count} communications about this topic`,
        });
      }
    }

    // 3. Document authorship
    const docQuery = `
      SELECT COUNT(*) as count
      FROM events
      WHERE organization_id = $1
        AND actor_id = $2
        AND event_type IN ('document_created', 'document_edited')
        AND timestamp >= $3
        AND timestamp <= $4
        ${domain.keywords ? "AND metadata->>'title' ILIKE ANY($5)" : ''}
    `;

    const docParams: unknown[] = [organizationId, personId, from, to];
    if (domain.keywords) {
      docParams.push(domain.keywords.map((k) => `%${k}%`));
    }

    const docResult = await this.pool.query(docQuery, docParams);
    const docCount = parseInt(docResult.rows[0]?.count) || 0;
    if (docCount > 0) {
      factors.push({
        type: 'document_authorship',
        weight: Math.min(docCount / 20, 1),
        count: docCount,
        description: `Authored/edited ${docCount} related documents`,
      });
    }

    // 4. Meeting presence (for department domains)
    if (domain.type === 'department') {
      const meetingQuery = `
        SELECT COUNT(*) as count
        FROM events
        WHERE organization_id = $1
          AND actor_id = $2
          AND event_type = 'meeting_attended'
          AND timestamp >= $3
          AND timestamp <= $4
          AND metadata->>'department' = $5
      `;

      const meetingResult = await this.pool.query(meetingQuery, [
        organizationId,
        personId,
        from,
        to,
        domain.name,
      ]);

      const count = parseInt(meetingResult.rows[0]?.count) || 0;
      if (count > 0) {
        factors.push({
          type: 'meeting_presence',
          weight: Math.min(count / 40, 1),
          count,
          description: `Attended ${count} department meetings`,
        });
      }
    }

    // 5. Question responder pattern (replied to questions)
    const responderQuery = `
      SELECT COUNT(*) as count
      FROM events e1
      WHERE e1.organization_id = $1
        AND e1.actor_id = $2
        AND e1.event_type IN ('email_sent', 'message_sent')
        AND e1.timestamp >= $3
        AND e1.timestamp <= $4
        AND e1.metadata->>'isReply' = 'true'
        AND EXISTS (
          SELECT 1 FROM events e2
          WHERE e2.metadata->>'conversationId' = e1.metadata->>'conversationId'
            AND e2.metadata->>'hasQuestion' = 'true'
            AND e2.timestamp < e1.timestamp
        )
    `;

    const responderResult = await this.pool.query(responderQuery, [
      organizationId,
      personId,
      from,
      to,
    ]);

    const responderCount = parseInt(responderResult.rows[0]?.count) || 0;
    if (responderCount > 0) {
      factors.push({
        type: 'question_responder',
        weight: Math.min(responderCount / 20, 1),
        count: responderCount,
        description: `Responded to ${responderCount} questions`,
      });
    }

    return factors;
  }

  /**
   * Analyze expertise distribution across organization
   */
  private analyzeExpertiseDistribution(
    expertiseMatrix: Map<string, Map<string, number>>,
    domains: KnowledgeDomain[],
    persons: Array<{ id: string; email: string; displayName?: string; department?: string }>
  ): { experts: PersonKnowledge[]; dependencies: KnowledgeDependency[] } {
    const experts: PersonKnowledge[] = [];
    const dependencies: KnowledgeDependency[] = [];

    // Build domain -> experts map
    const domainExperts = new Map<string, Array<{ personId: string; score: number }>>();

    for (const domain of domains) {
      const domainScores: Array<{ personId: string; score: number }> = [];

      for (const [personId, scores] of expertiseMatrix) {
        const score = scores.get(domain.id);
        if (score && score > 0) {
          domainScores.push({ personId, score });
        }
      }

      domainScores.sort((a, b) => b.score - a.score);
      domainExperts.set(domain.id, domainScores);
    }

    // Calculate dependencies
    for (const domain of domains) {
      const domainScores = domainExperts.get(domain.id) || [];
      const totalScore = domainScores.reduce((sum, d) => sum + d.score, 0);

      for (const { personId, score } of domainScores) {
        const dependencyStrength = totalScore > 0 ? score / totalScore : 0;
        const redundancyLevel = domainScores.length > 1
          ? 1 - dependencyStrength
          : 0;

        dependencies.push({
          domainId: domain.id,
          personId,
          dependencyStrength,
          redundancyLevel,
          knowledgeType: dependencyStrength > 0.7 ? 'tacit' : 'mixed',
        });
      }
    }

    // Build expert profiles
    const personMap = new Map(persons.map((p) => [p.id, p]));

    for (const [personId, scores] of expertiseMatrix) {
      const person = personMap.get(personId);
      if (!person) continue;

      const domainExpertise: DomainExpertise[] = [];
      let uniqueKnowledgeCount = 0;

      for (const [domainId, score] of scores) {
        const domain = domains.find((d) => d.id === domainId);
        if (!domain) continue;

        const domainScores = domainExperts.get(domainId) || [];
        const isUniqueExpert = domainScores.length === 1 && domainScores[0].personId === personId;
        const isPrimaryExpert = domainScores.length > 0 && domainScores[0].personId === personId;

        if (isUniqueExpert) {
          uniqueKnowledgeCount++;
        }

        domainExpertise.push({
          domainId,
          domainName: domain.name,
          expertiseScore: score,
          isUniqueExpert,
          isPrimaryExpert,
          contributionFactors: [], // Would need additional query for details
        });
      }

      const overallKnowledgeScore =
        domainExpertise.length > 0
          ? domainExpertise.reduce((sum, d) => sum + d.expertiseScore, 0) /
            domainExpertise.length
          : 0;

      experts.push({
        personId: person.id,
        email: person.email,
        displayName: person.displayName,
        department: person.department,
        domains: domainExpertise,
        overallKnowledgeScore,
        uniqueKnowledgeCount,
        criticality: this.determineCriticality(uniqueKnowledgeCount, overallKnowledgeScore),
      });
    }

    // Sort by criticality/unique knowledge
    experts.sort((a, b) => {
      if (a.uniqueKnowledgeCount !== b.uniqueKnowledgeCount) {
        return b.uniqueKnowledgeCount - a.uniqueKnowledgeCount;
      }
      return b.overallKnowledgeScore - a.overallKnowledgeScore;
    });

    return { experts, dependencies };
  }

  /**
   * Calculate organization-wide knowledge coverage
   */
  private calculateOrganizationCoverage(
    domains: KnowledgeDomain[],
    dependencies: KnowledgeDependency[]
  ): number {
    if (domains.length === 0) return 0;

    let coveredDomains = 0;
    let wellCoveredDomains = 0;

    for (const domain of domains) {
      const domainDeps = dependencies.filter((d) => d.domainId === domain.id);

      if (domainDeps.length > 0) {
        coveredDomains++;

        // Well covered = at least 2 people with meaningful expertise
        const significantExperts = domainDeps.filter(
          (d) => d.dependencyStrength > 0.1
        ).length;
        if (significantExperts >= 2) {
          wellCoveredDomains++;
        }
      }
    }

    // Coverage = weighted average of covered and well-covered
    const coverageRate = coveredDomains / domains.length;
    const redundancyRate = wellCoveredDomains / domains.length;

    return coverageRate * 0.4 + redundancyRate * 0.6;
  }

  /**
   * Determine criticality level
   */
  private determineCriticality(
    uniqueKnowledgeCount: number,
    overallScore: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (uniqueKnowledgeCount >= 3 || (uniqueKnowledgeCount >= 2 && overallScore > 70)) {
      return 'critical';
    }
    if (uniqueKnowledgeCount >= 1 || overallScore > 80) {
      return 'high';
    }
    if (overallScore > 50) {
      return 'medium';
    }
    return 'low';
  }
}

// Factory function
let dependencyBuilderInstance: KnowledgeDependencyBuilder | null = null;

export function createKnowledgeDependencyBuilder(
  pool: Pool
): KnowledgeDependencyBuilder {
  if (!dependencyBuilderInstance) {
    dependencyBuilderInstance = new KnowledgeDependencyBuilder(pool);
  }
  return dependencyBuilderInstance;
}

export function resetKnowledgeDependencyBuilder(): void {
  dependencyBuilderInstance = null;
}
