/**
 * Bus Factor Score Calculator
 * Calculates the "bus factor" for knowledge domains, teams, and the organization
 *
 * Bus Factor = minimum number of people who need to leave before
 * critical knowledge is lost
 *
 * A bus factor of 1 means a single point of failure exists
 */

import { Pool } from 'pg';
import {
  KnowledgeDependencyBuilder,
  createKnowledgeDependencyBuilder,
  KnowledgeGraph,
  KnowledgeDomain,
  PersonKnowledge,
  KnowledgeDependency,
} from './dependencyBuilder.js';

export interface BusFactorScore {
  domainId: string;
  domainName: string;
  domainType: string;
  busFactor: number; // Minimum people before knowledge loss (1 = critical)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  coverage: number; // 0-1, how well knowledge is distributed
  redundancy: number; // 0-1, backup coverage level
  keyExperts: ExpertSummary[];
  vulnerabilityAssessment: string;
}

export interface ExpertSummary {
  personId: string;
  email: string;
  displayName?: string;
  department?: string;
  expertiseScore: number;
  dependencyStrength: number;
  isUniqueExpert: boolean;
  isPrimaryExpert: boolean;
}

export interface OrganizationBusFactor {
  organizationId: string;
  overallBusFactor: number;
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  domainScores: BusFactorScore[];
  criticalDomainsCount: number;
  highRiskDomainsCount: number;
  singlePointsOfFailure: SinglePointOfFailure[];
  knowledgeDistributionScore: number; // 0-100
  recommendations: string[];
  analyzedAt: Date;
}

export interface SinglePointOfFailure {
  personId: string;
  email: string;
  displayName?: string;
  department?: string;
  uniqueDomains: string[];
  criticality: 'high' | 'critical';
  impactIfLost: ImpactAssessment;
}

export interface ImpactAssessment {
  domainsAffected: number;
  processesAffected: number;
  knowledgeLossPercent: number;
  estimatedRecoveryWeeks: number;
  description: string;
}

export interface BusFactorOptions {
  organizationId: string;
  lookbackDays?: number;
  expertiseThreshold?: number; // Minimum expertise score to count as expert
  primaryThreshold?: number; // Minimum dependency strength to be primary
  includeTeamBreakdown?: boolean;
}

// Thresholds for bus factor risk levels
const BUS_FACTOR_THRESHOLDS = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export class BusFactorCalculator {
  private pool: Pool;
  private dependencyBuilder: KnowledgeDependencyBuilder;

  constructor(pool: Pool) {
    this.pool = pool;
    this.dependencyBuilder = createKnowledgeDependencyBuilder(pool);
  }

  /**
   * Calculate bus factor scores for entire organization
   */
  async calculateOrganizationBusFactor(
    options: BusFactorOptions
  ): Promise<OrganizationBusFactor> {
    const {
      organizationId,
      lookbackDays = 180,
      expertiseThreshold = 30,
      primaryThreshold = 0.3,
    } = options;

    // Build knowledge graph
    const knowledgeGraph = await this.dependencyBuilder.buildKnowledgeGraph({
      organizationId,
      lookbackDays,
      minActivityThreshold: expertiseThreshold / 10,
    });

    // Calculate bus factor for each domain
    const domainScores = this.calculateDomainBusFactors(
      knowledgeGraph,
      expertiseThreshold,
      primaryThreshold
    );

    // Identify single points of failure
    const singlePointsOfFailure = this.identifySinglePointsOfFailure(
      knowledgeGraph,
      domainScores
    );

    // Calculate overall metrics
    const overallBusFactor = this.calculateOverallBusFactor(domainScores);
    const overallRiskLevel = this.determineRiskLevel(overallBusFactor);
    const knowledgeDistributionScore = this.calculateKnowledgeDistribution(
      knowledgeGraph,
      domainScores
    );

    // Count risk levels
    const criticalDomainsCount = domainScores.filter(
      (d) => d.riskLevel === 'critical'
    ).length;
    const highRiskDomainsCount = domainScores.filter(
      (d) => d.riskLevel === 'high'
    ).length;

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      overallRiskLevel,
      singlePointsOfFailure,
      domainScores
    );

    return {
      organizationId,
      overallBusFactor,
      overallRiskLevel,
      domainScores,
      criticalDomainsCount,
      highRiskDomainsCount,
      singlePointsOfFailure,
      knowledgeDistributionScore,
      recommendations,
      analyzedAt: new Date(),
    };
  }

  /**
   * Calculate bus factor for a specific domain
   */
  async calculateDomainBusFactor(
    organizationId: string,
    domainId: string,
    options?: { lookbackDays?: number; expertiseThreshold?: number }
  ): Promise<BusFactorScore | null> {
    const knowledgeGraph = await this.dependencyBuilder.buildKnowledgeGraph({
      organizationId,
      lookbackDays: options?.lookbackDays || 180,
    });

    const domain = knowledgeGraph.domains.find((d) => d.id === domainId);
    if (!domain) {
      return null;
    }

    const expertiseThreshold = options?.expertiseThreshold || 30;

    return this.calculateSingleDomainBusFactor(
      domain,
      knowledgeGraph.dependencies,
      knowledgeGraph.experts,
      expertiseThreshold,
      0.3
    );
  }

  /**
   * Calculate bus factor scores for all domains
   */
  private calculateDomainBusFactors(
    graph: KnowledgeGraph,
    expertiseThreshold: number,
    primaryThreshold: number
  ): BusFactorScore[] {
    const scores: BusFactorScore[] = [];

    for (const domain of graph.domains) {
      const score = this.calculateSingleDomainBusFactor(
        domain,
        graph.dependencies,
        graph.experts,
        expertiseThreshold,
        primaryThreshold
      );
      scores.push(score);
    }

    // Sort by risk (lowest bus factor first)
    scores.sort((a, b) => a.busFactor - b.busFactor);

    return scores;
  }

  /**
   * Calculate bus factor for a single domain
   */
  private calculateSingleDomainBusFactor(
    domain: KnowledgeDomain,
    dependencies: KnowledgeDependency[],
    experts: PersonKnowledge[],
    expertiseThreshold: number,
    primaryThreshold: number
  ): BusFactorScore {
    // Get dependencies for this domain
    const domainDeps = dependencies.filter((d) => d.domainId === domain.id);

    // Get experts for this domain
    const domainExperts: ExpertSummary[] = [];
    let qualifiedExperts = 0;

    for (const dep of domainDeps) {
      const expert = experts.find((e) => e.personId === dep.personId);
      if (!expert) continue;

      const domainExpertise = expert.domains.find((d) => d.domainId === domain.id);
      if (!domainExpertise) continue;

      const isQualified = domainExpertise.expertiseScore >= expertiseThreshold;
      if (isQualified) {
        qualifiedExperts++;
      }

      domainExperts.push({
        personId: expert.personId,
        email: expert.email,
        displayName: expert.displayName,
        department: expert.department,
        expertiseScore: domainExpertise.expertiseScore,
        dependencyStrength: dep.dependencyStrength,
        isUniqueExpert: domainExpertise.isUniqueExpert,
        isPrimaryExpert: domainExpertise.isPrimaryExpert,
      });
    }

    // Sort experts by dependency strength
    domainExperts.sort((a, b) => b.dependencyStrength - a.dependencyStrength);

    // Calculate bus factor
    // Bus factor = number of experts with meaningful expertise
    // If one person has >80% dependency, bus factor = 1
    // Otherwise, count people needed to cover 80% of knowledge
    let busFactor = 0;
    let cumulativeCoverage = 0;

    for (const expert of domainExperts) {
      if (expert.expertiseScore >= expertiseThreshold) {
        busFactor++;
        cumulativeCoverage += expert.dependencyStrength;
        if (cumulativeCoverage >= 0.8) {
          break;
        }
      }
    }

    // Minimum bus factor is 0 if no experts
    busFactor = Math.max(0, busFactor);

    // Calculate coverage and redundancy
    const coverage = cumulativeCoverage;
    const redundancy = qualifiedExperts > 1
      ? Math.min(1, (qualifiedExperts - 1) / 3)
      : 0;

    // Determine risk level
    const riskLevel = this.determineRiskLevel(busFactor);

    // Generate vulnerability assessment
    const vulnerabilityAssessment = this.assessVulnerability(
      busFactor,
      domainExperts,
      coverage
    );

    return {
      domainId: domain.id,
      domainName: domain.name,
      domainType: domain.type,
      busFactor,
      riskLevel,
      coverage,
      redundancy,
      keyExperts: domainExperts.slice(0, 5), // Top 5 experts
      vulnerabilityAssessment,
    };
  }

  /**
   * Identify single points of failure
   */
  private identifySinglePointsOfFailure(
    graph: KnowledgeGraph,
    domainScores: BusFactorScore[]
  ): SinglePointOfFailure[] {
    const spofMap = new Map<string, SinglePointOfFailure>();

    // Find people who are unique experts in any domain
    for (const expert of graph.experts) {
      if (expert.uniqueKnowledgeCount === 0) continue;

      const uniqueDomains = expert.domains
        .filter((d) => d.isUniqueExpert)
        .map((d) => d.domainName);

      if (uniqueDomains.length === 0) continue;

      const impact = this.assessImpactIfLost(expert, graph, domainScores);

      spofMap.set(expert.personId, {
        personId: expert.personId,
        email: expert.email,
        displayName: expert.displayName,
        department: expert.department,
        uniqueDomains,
        criticality: uniqueDomains.length >= 2 ? 'critical' : 'high',
        impactIfLost: impact,
      });
    }

    // Also add people who are primary experts in bus factor 1 domains
    for (const score of domainScores) {
      if (score.busFactor !== 1) continue;

      const primaryExpert = score.keyExperts.find((e) => e.isPrimaryExpert);
      if (!primaryExpert) continue;

      if (!spofMap.has(primaryExpert.personId)) {
        const expert = graph.experts.find((e) => e.personId === primaryExpert.personId);
        if (expert) {
          spofMap.set(primaryExpert.personId, {
            personId: primaryExpert.personId,
            email: primaryExpert.email,
            displayName: primaryExpert.displayName,
            department: primaryExpert.department,
            uniqueDomains: [score.domainName],
            criticality: 'high',
            impactIfLost: this.assessImpactIfLost(expert, graph, domainScores),
          });
        }
      } else {
        // Add domain to existing SPOF
        const existing = spofMap.get(primaryExpert.personId)!;
        if (!existing.uniqueDomains.includes(score.domainName)) {
          existing.uniqueDomains.push(score.domainName);
          if (existing.uniqueDomains.length >= 2) {
            existing.criticality = 'critical';
          }
        }
      }
    }

    // Sort by criticality and number of domains
    return Array.from(spofMap.values()).sort((a, b) => {
      if (a.criticality !== b.criticality) {
        return a.criticality === 'critical' ? -1 : 1;
      }
      return b.uniqueDomains.length - a.uniqueDomains.length;
    });
  }

  /**
   * Assess impact if a person leaves
   */
  private assessImpactIfLost(
    expert: PersonKnowledge,
    graph: KnowledgeGraph,
    domainScores: BusFactorScore[]
  ): ImpactAssessment {
    const affectedDomains = expert.domains.filter(
      (d) => d.isUniqueExpert || d.isPrimaryExpert
    );

    const domainsAffected = affectedDomains.length;

    // Count processes affected
    const processesAffected = affectedDomains.filter((d) =>
      d.domainId.startsWith('process:')
    ).length;

    // Calculate knowledge loss
    const totalKnowledge = graph.experts.reduce(
      (sum, e) => sum + e.overallKnowledgeScore,
      0
    );
    const knowledgeLossPercent =
      totalKnowledge > 0
        ? (expert.overallKnowledgeScore / totalKnowledge) * 100
        : 0;

    // Estimate recovery time based on complexity
    const baseWeeks = 4;
    const complexityMultiplier = 1 + domainsAffected * 0.5;
    const uniquenessMultiplier = 1 + expert.uniqueKnowledgeCount * 0.75;
    const estimatedRecoveryWeeks = Math.round(
      baseWeeks * complexityMultiplier * uniquenessMultiplier
    );

    // Generate description
    const description = this.generateImpactDescription(
      domainsAffected,
      processesAffected,
      expert.uniqueKnowledgeCount,
      estimatedRecoveryWeeks
    );

    return {
      domainsAffected,
      processesAffected,
      knowledgeLossPercent: Math.round(knowledgeLossPercent * 10) / 10,
      estimatedRecoveryWeeks,
      description,
    };
  }

  /**
   * Calculate overall bus factor for organization
   */
  private calculateOverallBusFactor(domainScores: BusFactorScore[]): number {
    if (domainScores.length === 0) return 0;

    // Overall bus factor is the minimum across all important domains
    // Weight by domain importance (processes > departments > topics)
    const weightedScores = domainScores.map((score) => {
      let weight = 1;
      if (score.domainType === 'process') weight = 1.5;
      else if (score.domainType === 'department') weight = 1.2;
      return { busFactor: score.busFactor, weight };
    });

    // Find minimum weighted bus factor
    let minWeightedFactor = Infinity;
    for (const { busFactor, weight } of weightedScores) {
      const weightedFactor = busFactor / weight;
      if (weightedFactor < minWeightedFactor) {
        minWeightedFactor = weightedFactor;
      }
    }

    return Math.round(minWeightedFactor);
  }

  /**
   * Calculate knowledge distribution score
   */
  private calculateKnowledgeDistribution(
    graph: KnowledgeGraph,
    domainScores: BusFactorScore[]
  ): number {
    if (domainScores.length === 0) return 0;

    // Factors:
    // 1. Average redundancy across domains
    const avgRedundancy =
      domainScores.reduce((sum, d) => sum + d.redundancy, 0) / domainScores.length;

    // 2. Percentage of domains with bus factor > 1
    const wellCoveredDomains = domainScores.filter((d) => d.busFactor > 1).length;
    const coverageRate = wellCoveredDomains / domainScores.length;

    // 3. Organization coverage from knowledge graph
    const orgCoverage = graph.organizationCoverage;

    // 4. Inverse of single points of failure
    const spofPenalty = Math.max(0, 1 - graph.singlePointsOfFailure.length * 0.1);

    // Weighted average
    const score =
      avgRedundancy * 25 +
      coverageRate * 30 +
      orgCoverage * 25 +
      spofPenalty * 20;

    return Math.round(score);
  }

  /**
   * Determine risk level from bus factor
   */
  private determineRiskLevel(
    busFactor: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (busFactor <= BUS_FACTOR_THRESHOLDS.critical) return 'critical';
    if (busFactor <= BUS_FACTOR_THRESHOLDS.high) return 'high';
    if (busFactor <= BUS_FACTOR_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Assess vulnerability for a domain
   */
  private assessVulnerability(
    busFactor: number,
    experts: ExpertSummary[],
    coverage: number
  ): string {
    if (busFactor === 0) {
      return 'No identified experts. Knowledge may be undocumented or external.';
    }

    if (busFactor === 1) {
      const expert = experts[0];
      return `Critical: Single expert (${expert.displayName || expert.email}) holds ${Math.round(expert.dependencyStrength * 100)}% of knowledge.`;
    }

    if (busFactor === 2) {
      return `High risk: Only ${busFactor} qualified experts. Loss of either would significantly impact operations.`;
    }

    if (coverage < 0.5) {
      return `Moderate risk: ${busFactor} experts identified but coverage is incomplete (${Math.round(coverage * 100)}%).`;
    }

    return `Acceptable: ${busFactor} experts with ${Math.round(coverage * 100)}% knowledge coverage.`;
  }

  /**
   * Generate impact description
   */
  private generateImpactDescription(
    domainsAffected: number,
    processesAffected: number,
    uniqueKnowledge: number,
    recoveryWeeks: number
  ): string {
    const parts: string[] = [];

    if (uniqueKnowledge > 0) {
      parts.push(
        `${uniqueKnowledge} domain(s) would lose their only expert`
      );
    }

    if (processesAffected > 0) {
      parts.push(`${processesAffected} process(es) would be impacted`);
    }

    parts.push(`Estimated ${recoveryWeeks} weeks to rebuild knowledge`);

    return parts.join('. ') + '.';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    overallRiskLevel: string,
    spofs: SinglePointOfFailure[],
    domainScores: BusFactorScore[]
  ): string[] {
    const recommendations: string[] = [];

    // Urgency based on overall risk
    if (overallRiskLevel === 'critical') {
      recommendations.push(
        'URGENT: Immediate knowledge transfer program needed'
      );
    } else if (overallRiskLevel === 'high') {
      recommendations.push(
        'Priority: Initiate cross-training within 30 days'
      );
    }

    // Single points of failure recommendations
    if (spofs.length > 0) {
      const criticalSpofs = spofs.filter((s) => s.criticality === 'critical');
      if (criticalSpofs.length > 0) {
        recommendations.push(
          `${criticalSpofs.length} critical single points of failure identified - assign backup experts immediately`
        );
      }

      for (const spof of spofs.slice(0, 3)) {
        recommendations.push(
          `Assign backup for ${spof.displayName || spof.email}: ${spof.uniqueDomains.slice(0, 2).join(', ')}`
        );
      }
    }

    // Domain-specific recommendations
    const criticalDomains = domainScores.filter((d) => d.riskLevel === 'critical');
    if (criticalDomains.length > 0) {
      recommendations.push(
        `Document and cross-train for ${criticalDomains.length} critical domain(s): ${criticalDomains.slice(0, 3).map((d) => d.domainName).join(', ')}`
      );
    }

    // General recommendations
    if (domainScores.some((d) => d.coverage < 0.5)) {
      recommendations.push(
        'Create documentation for domains with low coverage'
      );
    }

    if (spofs.length === 0 && overallRiskLevel === 'low') {
      recommendations.push(
        'Knowledge is well distributed. Maintain current practices and periodic reviews.'
      );
    }

    return recommendations;
  }
}

// Factory function
let busFactorCalculatorInstance: BusFactorCalculator | null = null;

export function createBusFactorCalculator(pool: Pool): BusFactorCalculator {
  if (!busFactorCalculatorInstance) {
    busFactorCalculatorInstance = new BusFactorCalculator(pool);
  }
  return busFactorCalculatorInstance;
}

export function resetBusFactorCalculator(): void {
  busFactorCalculatorInstance = null;
}
