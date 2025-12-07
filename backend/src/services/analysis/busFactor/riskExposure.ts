/**
 * Risk Exposure Quantifier
 * Quantifies business risk exposure from knowledge concentration
 *
 * Converts bus factor analysis into business impact metrics:
 * - Financial risk (cost of knowledge loss)
 * - Operational risk (process disruption probability)
 * - Recovery cost estimation
 * - Risk mitigation priority scoring
 */

import { Pool } from 'pg';
import {
  BusFactorCalculator,
  createBusFactorCalculator,
  OrganizationBusFactor,
  BusFactorScore,
  SinglePointOfFailure,
} from './scoreCalculator.js';

export interface RiskExposureReport {
  organizationId: string;
  totalRiskExposure: MonetaryRisk;
  riskBreakdown: RiskCategory[];
  topRisks: RankedRisk[];
  mitigationPriorities: MitigationPriority[];
  scenarioAnalysis: ScenarioAnalysis[];
  executiveSummary: string;
  analyzedAt: Date;
}

export interface MonetaryRisk {
  expectedLoss: number; // Annual expected loss in currency
  worstCaseLoss: number; // Maximum potential loss
  currency: string;
  confidence: number; // 0-1
  components: RiskComponent[];
}

export interface RiskComponent {
  name: string;
  amount: number;
  percentage: number;
  description: string;
}

export interface RiskCategory {
  category: 'operational' | 'financial' | 'strategic' | 'compliance';
  riskScore: number; // 0-100
  exposure: number; // Monetary
  probability: number; // 0-1
  primaryFactors: string[];
}

export interface RankedRisk {
  rank: number;
  type: 'person' | 'domain' | 'process';
  entityId: string;
  entityName: string;
  riskScore: number;
  exposureAmount: number;
  probability: number;
  mitigationCost: number;
  roi: number; // Return on mitigation investment
  description: string;
}

export interface MitigationPriority {
  priority: number;
  action: string;
  targetEntity: string;
  estimatedCost: number;
  riskReduction: number;
  timeframe: string;
  dependencies: string[];
}

export interface ScenarioAnalysis {
  scenario: string;
  probability: number;
  impact: MonetaryRisk;
  affectedAreas: string[];
  recoveryTime: string;
  mitigationStatus: 'none' | 'partial' | 'complete';
}

export interface RiskQuantificationOptions {
  organizationId: string;
  lookbackDays?: number;
  // Cost parameters for quantification
  avgSalary?: number; // Average annual salary
  hiringCost?: number; // Cost to hire replacement
  trainingWeeks?: number; // Average training time
  revenuePerEmployee?: number; // Average revenue per employee
  projectValue?: number; // Average project value
  currency?: string;
}

// Default cost assumptions (can be overridden)
const DEFAULT_COSTS = {
  avgSalary: 75000, // EUR
  hiringCost: 15000, // EUR (recruiting, onboarding)
  trainingWeeks: 12,
  revenuePerEmployee: 150000, // EUR
  projectValue: 50000, // EUR
  currency: 'EUR',
};

// Risk probability factors
const DEPARTURE_PROBABILITY = {
  normal: 0.15, // Annual turnover rate
  stressed: 0.25, // For people showing burnout indicators
  critical: 0.30, // For people with high workload/unique knowledge
};

export class RiskExposureQuantifier {
  private pool: Pool;
  private busFactorCalculator: BusFactorCalculator;

  constructor(pool: Pool) {
    this.pool = pool;
    this.busFactorCalculator = createBusFactorCalculator(pool);
  }

  /**
   * Generate comprehensive risk exposure report
   */
  async quantifyRiskExposure(
    options: RiskQuantificationOptions
  ): Promise<RiskExposureReport> {
    const {
      organizationId,
      lookbackDays = 180,
      avgSalary = DEFAULT_COSTS.avgSalary,
      hiringCost = DEFAULT_COSTS.hiringCost,
      trainingWeeks = DEFAULT_COSTS.trainingWeeks,
      revenuePerEmployee = DEFAULT_COSTS.revenuePerEmployee,
      projectValue = DEFAULT_COSTS.projectValue,
      currency = DEFAULT_COSTS.currency,
    } = options;

    const costParams = {
      avgSalary,
      hiringCost,
      trainingWeeks,
      revenuePerEmployee,
      projectValue,
      currency,
    };

    // Get bus factor analysis
    const busFactor = await this.busFactorCalculator.calculateOrganizationBusFactor({
      organizationId,
      lookbackDays,
    });

    // Calculate total risk exposure
    const totalRiskExposure = this.calculateTotalRiskExposure(
      busFactor,
      costParams
    );

    // Break down by risk category
    const riskBreakdown = this.calculateRiskBreakdown(
      busFactor,
      costParams
    );

    // Rank top risks
    const topRisks = this.rankTopRisks(busFactor, costParams);

    // Generate mitigation priorities
    const mitigationPriorities = this.generateMitigationPriorities(
      busFactor,
      topRisks,
      costParams
    );

    // Run scenario analysis
    const scenarioAnalysis = this.runScenarioAnalysis(
      busFactor,
      costParams
    );

    // Generate executive summary
    const executiveSummary = this.generateExecutiveSummary(
      busFactor,
      totalRiskExposure,
      topRisks
    );

    return {
      organizationId,
      totalRiskExposure,
      riskBreakdown,
      topRisks,
      mitigationPriorities,
      scenarioAnalysis,
      executiveSummary,
      analyzedAt: new Date(),
    };
  }

  /**
   * Get risk exposure for a specific person
   */
  async quantifyPersonRisk(
    organizationId: string,
    personId: string,
    options?: Partial<RiskQuantificationOptions>
  ): Promise<RankedRisk | null> {
    const busFactor = await this.busFactorCalculator.calculateOrganizationBusFactor({
      organizationId,
      lookbackDays: options?.lookbackDays || 180,
    });

    const spof = busFactor.singlePointsOfFailure.find(
      (s) => s.personId === personId
    );

    if (!spof) {
      return null;
    }

    const costParams = {
      avgSalary: options?.avgSalary || DEFAULT_COSTS.avgSalary,
      hiringCost: options?.hiringCost || DEFAULT_COSTS.hiringCost,
      trainingWeeks: options?.trainingWeeks || DEFAULT_COSTS.trainingWeeks,
      revenuePerEmployee: options?.revenuePerEmployee || DEFAULT_COSTS.revenuePerEmployee,
      projectValue: options?.projectValue || DEFAULT_COSTS.projectValue,
      currency: options?.currency || DEFAULT_COSTS.currency,
    };

    return this.calculatePersonRisk(spof, costParams);
  }

  /**
   * Calculate total monetary risk exposure
   */
  private calculateTotalRiskExposure(
    busFactor: OrganizationBusFactor,
    costs: typeof DEFAULT_COSTS
  ): MonetaryRisk {
    const components: RiskComponent[] = [];

    // 1. Direct replacement cost for single points of failure
    const replacementCost = busFactor.singlePointsOfFailure.length * (
      costs.hiringCost +
      (costs.avgSalary / 52) * costs.trainingWeeks
    );
    components.push({
      name: 'Replacement & Training',
      amount: replacementCost,
      percentage: 0,
      description: `Cost to replace and train ${busFactor.singlePointsOfFailure.length} critical person(s)`,
    });

    // 2. Knowledge loss / productivity impact
    let knowledgeLossCost = 0;
    for (const spof of busFactor.singlePointsOfFailure) {
      const weeksLost = spof.impactIfLost.estimatedRecoveryWeeks;
      const weeklyRevenue = costs.revenuePerEmployee / 52;
      knowledgeLossCost += weeklyRevenue * weeksLost * 0.5; // 50% productivity loss during recovery
    }
    components.push({
      name: 'Productivity Impact',
      amount: knowledgeLossCost,
      percentage: 0,
      description: 'Revenue impact during knowledge recovery period',
    });

    // 3. Project delay risk
    const criticalDomains = busFactor.domainScores.filter(
      (d) => d.riskLevel === 'critical'
    );
    const projectRisk = criticalDomains.length * costs.projectValue * 0.3; // 30% of project value at risk
    components.push({
      name: 'Project Delay Risk',
      amount: projectRisk,
      percentage: 0,
      description: `Potential delays for ${criticalDomains.length} critical domain(s)`,
    });

    // 4. Opportunity cost
    const opportunityCost = busFactor.singlePointsOfFailure.reduce((sum, spof) => {
      return sum + spof.impactIfLost.domainsAffected * costs.projectValue * 0.1;
    }, 0);
    components.push({
      name: 'Opportunity Cost',
      amount: opportunityCost,
      percentage: 0,
      description: 'Lost opportunities during recovery period',
    });

    // Calculate totals
    const totalExpected = components.reduce((sum, c) => sum + c.amount, 0);

    // Worst case = expected * risk multiplier based on overall bus factor
    const riskMultiplier = busFactor.overallRiskLevel === 'critical' ? 2.5
      : busFactor.overallRiskLevel === 'high' ? 2.0
      : busFactor.overallRiskLevel === 'medium' ? 1.5
      : 1.2;
    const worstCase = totalExpected * riskMultiplier;

    // Update percentages
    for (const component of components) {
      component.percentage = totalExpected > 0
        ? Math.round((component.amount / totalExpected) * 100)
        : 0;
    }

    // Calculate probability-weighted expected loss
    const avgDepartureProbability = this.calculateAverageDepartureProbability(
      busFactor.singlePointsOfFailure
    );
    const expectedLoss = totalExpected * avgDepartureProbability;

    return {
      expectedLoss: Math.round(expectedLoss),
      worstCaseLoss: Math.round(worstCase),
      currency: costs.currency,
      confidence: this.calculateConfidence(busFactor),
      components,
    };
  }

  /**
   * Calculate risk breakdown by category
   */
  private calculateRiskBreakdown(
    busFactor: OrganizationBusFactor,
    costs: typeof DEFAULT_COSTS
  ): RiskCategory[] {
    const categories: RiskCategory[] = [];

    // Operational risk
    const operationalScore = this.calculateOperationalRiskScore(busFactor);
    const operationalExposure = busFactor.domainScores
      .filter((d) => d.domainType === 'process')
      .reduce((sum, d) => sum + this.calculateDomainExposure(d, costs), 0);

    categories.push({
      category: 'operational',
      riskScore: operationalScore,
      exposure: Math.round(operationalExposure),
      probability: this.scoreToProbability(operationalScore),
      primaryFactors: this.getOperationalFactors(busFactor),
    });

    // Financial risk
    const financialScore = this.calculateFinancialRiskScore(busFactor);
    const financialExposure =
      busFactor.singlePointsOfFailure.length *
      (costs.avgSalary + costs.hiringCost + costs.revenuePerEmployee * 0.25);

    categories.push({
      category: 'financial',
      riskScore: financialScore,
      exposure: Math.round(financialExposure),
      probability: this.scoreToProbability(financialScore),
      primaryFactors: this.getFinancialFactors(busFactor),
    });

    // Strategic risk
    const strategicScore = this.calculateStrategicRiskScore(busFactor);
    const strategicExposure = busFactor.domainScores
      .filter((d) => d.riskLevel === 'critical' || d.riskLevel === 'high')
      .length * costs.projectValue;

    categories.push({
      category: 'strategic',
      riskScore: strategicScore,
      exposure: Math.round(strategicExposure),
      probability: this.scoreToProbability(strategicScore),
      primaryFactors: this.getStrategicFactors(busFactor),
    });

    // Compliance risk
    const complianceScore = this.calculateComplianceRiskScore(busFactor);
    const complianceExposure = complianceScore * costs.projectValue * 0.1;

    categories.push({
      category: 'compliance',
      riskScore: complianceScore,
      exposure: Math.round(complianceExposure),
      probability: this.scoreToProbability(complianceScore),
      primaryFactors: this.getComplianceFactors(busFactor),
    });

    return categories;
  }

  /**
   * Rank top risks by exposure and probability
   */
  private rankTopRisks(
    busFactor: OrganizationBusFactor,
    costs: typeof DEFAULT_COSTS
  ): RankedRisk[] {
    const risks: RankedRisk[] = [];

    // Add person risks
    for (const spof of busFactor.singlePointsOfFailure) {
      risks.push(this.calculatePersonRisk(spof, costs));
    }

    // Add domain risks
    for (const domain of busFactor.domainScores) {
      if (domain.riskLevel === 'critical' || domain.riskLevel === 'high') {
        risks.push(this.calculateDomainRisk(domain, costs));
      }
    }

    // Sort by risk score * exposure
    risks.sort((a, b) => (b.riskScore * b.exposureAmount) - (a.riskScore * a.exposureAmount));

    // Assign ranks
    risks.forEach((risk, index) => {
      risk.rank = index + 1;
    });

    return risks.slice(0, 10); // Top 10 risks
  }

  /**
   * Calculate risk for a single person
   */
  private calculatePersonRisk(
    spof: SinglePointOfFailure,
    costs: typeof DEFAULT_COSTS
  ): RankedRisk {
    const departureProbability = spof.criticality === 'critical'
      ? DEPARTURE_PROBABILITY.critical
      : DEPARTURE_PROBABILITY.stressed;

    const exposureAmount =
      spof.impactIfLost.domainsAffected * costs.projectValue +
      spof.impactIfLost.estimatedRecoveryWeeks * (costs.avgSalary / 52) +
      costs.hiringCost;

    const riskScore = Math.min(100, spof.uniqueDomains.length * 25 + (spof.criticality === 'critical' ? 25 : 0));

    const mitigationCost =
      costs.avgSalary * 0.1 + // Training time
      spof.uniqueDomains.length * 5000; // Documentation per domain

    const roi = mitigationCost > 0
      ? (exposureAmount * departureProbability - mitigationCost) / mitigationCost
      : 0;

    return {
      rank: 0,
      type: 'person',
      entityId: spof.personId,
      entityName: spof.displayName || spof.email,
      riskScore,
      exposureAmount: Math.round(exposureAmount),
      probability: departureProbability,
      mitigationCost: Math.round(mitigationCost),
      roi: Math.round(roi * 100) / 100,
      description: `Unique expert for: ${spof.uniqueDomains.join(', ')}`,
    };
  }

  /**
   * Calculate risk for a domain
   */
  private calculateDomainRisk(
    domain: BusFactorScore,
    costs: typeof DEFAULT_COSTS
  ): RankedRisk {
    const riskScore = domain.riskLevel === 'critical' ? 90
      : domain.riskLevel === 'high' ? 70
      : domain.riskLevel === 'medium' ? 50
      : 30;

    const exposureAmount = this.calculateDomainExposure(domain, costs);
    const probability = (1 - domain.redundancy) * DEPARTURE_PROBABILITY.normal;

    const mitigationCost =
      costs.avgSalary * 0.15 * domain.keyExperts.length + // Cross-training
      10000; // Documentation

    const roi = mitigationCost > 0
      ? (exposureAmount * probability - mitigationCost) / mitigationCost
      : 0;

    return {
      rank: 0,
      type: 'domain',
      entityId: domain.domainId,
      entityName: domain.domainName,
      riskScore,
      exposureAmount: Math.round(exposureAmount),
      probability,
      mitigationCost: Math.round(mitigationCost),
      roi: Math.round(roi * 100) / 100,
      description: domain.vulnerabilityAssessment,
    };
  }

  /**
   * Calculate exposure for a domain
   */
  private calculateDomainExposure(
    domain: BusFactorScore,
    costs: typeof DEFAULT_COSTS
  ): number {
    const baseExposure = domain.domainType === 'process'
      ? costs.projectValue * 2
      : costs.projectValue;

    const riskMultiplier = domain.riskLevel === 'critical' ? 2.0
      : domain.riskLevel === 'high' ? 1.5
      : domain.riskLevel === 'medium' ? 1.0
      : 0.5;

    return baseExposure * riskMultiplier * (1 - domain.redundancy);
  }

  /**
   * Generate mitigation priorities
   */
  private generateMitigationPriorities(
    busFactor: OrganizationBusFactor,
    topRisks: RankedRisk[],
    costs: typeof DEFAULT_COSTS
  ): MitigationPriority[] {
    const priorities: MitigationPriority[] = [];
    let priority = 1;

    // High ROI mitigations first
    const sortedByRoi = [...topRisks].sort((a, b) => b.roi - a.roi);

    for (const risk of sortedByRoi.slice(0, 5)) {
      if (risk.type === 'person') {
        priorities.push({
          priority: priority++,
          action: `Cross-train backup for ${risk.entityName}`,
          targetEntity: risk.entityName,
          estimatedCost: risk.mitigationCost,
          riskReduction: Math.round(risk.exposureAmount * risk.probability * 0.7),
          timeframe: '4-8 weeks',
          dependencies: [],
        });

        priorities.push({
          priority: priority++,
          action: `Document critical knowledge from ${risk.entityName}`,
          targetEntity: risk.entityName,
          estimatedCost: Math.round(risk.mitigationCost * 0.3),
          riskReduction: Math.round(risk.exposureAmount * risk.probability * 0.3),
          timeframe: '2-4 weeks',
          dependencies: [],
        });
      } else if (risk.type === 'domain') {
        priorities.push({
          priority: priority++,
          action: `Establish knowledge sharing program for ${risk.entityName}`,
          targetEntity: risk.entityName,
          estimatedCost: risk.mitigationCost,
          riskReduction: Math.round(risk.exposureAmount * risk.probability * 0.6),
          timeframe: '6-12 weeks',
          dependencies: [],
        });
      }
    }

    // General recommendations
    if (busFactor.knowledgeDistributionScore < 50) {
      priorities.push({
        priority: priority++,
        action: 'Implement organization-wide knowledge management system',
        targetEntity: 'Organization',
        estimatedCost: costs.projectValue,
        riskReduction: Math.round(
          topRisks.reduce((sum, r) => sum + r.exposureAmount * r.probability, 0) * 0.2
        ),
        timeframe: '3-6 months',
        dependencies: [],
      });
    }

    return priorities;
  }

  /**
   * Run scenario analysis
   */
  private runScenarioAnalysis(
    busFactor: OrganizationBusFactor,
    costs: typeof DEFAULT_COSTS
  ): ScenarioAnalysis[] {
    const scenarios: ScenarioAnalysis[] = [];

    // Scenario 1: Key person departure
    if (busFactor.singlePointsOfFailure.length > 0) {
      const topSpof = busFactor.singlePointsOfFailure[0];
      scenarios.push({
        scenario: `${topSpof.displayName || topSpof.email} leaves unexpectedly`,
        probability: DEPARTURE_PROBABILITY.critical,
        impact: {
          expectedLoss: Math.round(
            topSpof.impactIfLost.domainsAffected * costs.projectValue +
            topSpof.impactIfLost.estimatedRecoveryWeeks * (costs.revenuePerEmployee / 52)
          ),
          worstCaseLoss: Math.round(
            topSpof.impactIfLost.domainsAffected * costs.projectValue * 2
          ),
          currency: costs.currency,
          confidence: 0.7,
          components: [],
        },
        affectedAreas: topSpof.uniqueDomains,
        recoveryTime: `${topSpof.impactIfLost.estimatedRecoveryWeeks} weeks`,
        mitigationStatus: 'none',
      });
    }

    // Scenario 2: Critical process failure
    const criticalProcess = busFactor.domainScores.find(
      (d) => d.domainType === 'process' && d.riskLevel === 'critical'
    );
    if (criticalProcess) {
      scenarios.push({
        scenario: `${criticalProcess.domainName} process disruption`,
        probability: (1 - criticalProcess.coverage) * 0.2,
        impact: {
          expectedLoss: Math.round(costs.projectValue * 3),
          worstCaseLoss: Math.round(costs.projectValue * 5),
          currency: costs.currency,
          confidence: 0.6,
          components: [],
        },
        affectedAreas: [criticalProcess.domainName],
        recoveryTime: '2-4 weeks',
        mitigationStatus: criticalProcess.redundancy > 0.3 ? 'partial' : 'none',
      });
    }

    // Scenario 3: Multiple departures
    if (busFactor.singlePointsOfFailure.length >= 2) {
      scenarios.push({
        scenario: 'Two key people leave within 6 months',
        probability: Math.pow(DEPARTURE_PROBABILITY.normal, 2) * 3, // Correlation factor
        impact: {
          expectedLoss: Math.round(
            busFactor.singlePointsOfFailure
              .slice(0, 2)
              .reduce((sum, s) => sum + s.impactIfLost.domainsAffected * costs.projectValue, 0)
          ),
          worstCaseLoss: Math.round(costs.revenuePerEmployee * 4),
          currency: costs.currency,
          confidence: 0.5,
          components: [],
        },
        affectedAreas: busFactor.singlePointsOfFailure
          .slice(0, 2)
          .flatMap((s) => s.uniqueDomains),
        recoveryTime: '3-6 months',
        mitigationStatus: 'none',
      });
    }

    return scenarios;
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(
    busFactor: OrganizationBusFactor,
    totalRisk: MonetaryRisk,
    topRisks: RankedRisk[]
  ): string {
    const parts: string[] = [];

    // Overall assessment
    parts.push(
      `Organization bus factor: ${busFactor.overallBusFactor} (${busFactor.overallRiskLevel} risk)`
    );

    // Key metrics
    parts.push(
      `${busFactor.singlePointsOfFailure.length} single point(s) of failure identified`
    );
    parts.push(
      `${busFactor.criticalDomainsCount} critical and ${busFactor.highRiskDomainsCount} high-risk domains`
    );

    // Financial impact
    parts.push(
      `Annual expected risk exposure: ${totalRisk.currency} ${totalRisk.expectedLoss.toLocaleString()}`
    );
    parts.push(
      `Worst case exposure: ${totalRisk.currency} ${totalRisk.worstCaseLoss.toLocaleString()}`
    );

    // Top priority
    if (topRisks.length > 0) {
      const topRisk = topRisks[0];
      parts.push(
        `Top priority: ${topRisk.entityName} (${topRisk.type}) - ROI on mitigation: ${topRisk.roi}x`
      );
    }

    // Overall recommendation
    if (busFactor.overallRiskLevel === 'critical') {
      parts.push(
        'Immediate action required: Initiate knowledge transfer program for critical persons and domains.'
      );
    } else if (busFactor.overallRiskLevel === 'high') {
      parts.push(
        'Recommended: Implement cross-training within 30 days for high-risk areas.'
      );
    } else {
      parts.push(
        'Knowledge distribution is acceptable. Maintain periodic reviews.'
      );
    }

    return parts.join('\n\n');
  }

  // Helper methods

  private calculateAverageDepartureProbability(
    spofs: SinglePointOfFailure[]
  ): number {
    if (spofs.length === 0) return DEPARTURE_PROBABILITY.normal;

    const probabilities = spofs.map((s) =>
      s.criticality === 'critical'
        ? DEPARTURE_PROBABILITY.critical
        : DEPARTURE_PROBABILITY.stressed
    );

    return probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
  }

  private calculateConfidence(busFactor: OrganizationBusFactor): number {
    // Based on data quality
    const domainCoverage = busFactor.domainScores.length > 0 ? 0.3 : 0;
    const spofIdentified = busFactor.singlePointsOfFailure.length > 0 ? 0.3 : 0.1;
    const distributionScore = busFactor.knowledgeDistributionScore / 100 * 0.4;

    return Math.min(1, domainCoverage + spofIdentified + distributionScore);
  }

  private calculateOperationalRiskScore(busFactor: OrganizationBusFactor): number {
    const processDomains = busFactor.domainScores.filter(
      (d) => d.domainType === 'process'
    );
    if (processDomains.length === 0) return 20;

    const avgBusFactor =
      processDomains.reduce((sum, d) => sum + d.busFactor, 0) / processDomains.length;

    return Math.max(0, 100 - avgBusFactor * 20);
  }

  private calculateFinancialRiskScore(busFactor: OrganizationBusFactor): number {
    return Math.min(
      100,
      busFactor.singlePointsOfFailure.length * 20 +
      busFactor.criticalDomainsCount * 15
    );
  }

  private calculateStrategicRiskScore(busFactor: OrganizationBusFactor): number {
    return Math.max(0, 100 - busFactor.knowledgeDistributionScore);
  }

  private calculateComplianceRiskScore(busFactor: OrganizationBusFactor): number {
    // Lower risk score for compliance (documentation focus)
    return Math.min(50, busFactor.criticalDomainsCount * 10);
  }

  private scoreToProbability(score: number): number {
    return Math.min(1, score / 100 * 0.5);
  }

  private getOperationalFactors(busFactor: OrganizationBusFactor): string[] {
    const factors: string[] = [];
    const processDomains = busFactor.domainScores.filter(
      (d) => d.domainType === 'process'
    );
    const criticalProcesses = processDomains.filter(
      (d) => d.riskLevel === 'critical'
    );

    if (criticalProcesses.length > 0) {
      factors.push(`${criticalProcesses.length} critical process(es)`);
    }
    if (busFactor.overallBusFactor <= 2) {
      factors.push('Low overall bus factor');
    }
    return factors;
  }

  private getFinancialFactors(busFactor: OrganizationBusFactor): string[] {
    const factors: string[] = [];
    if (busFactor.singlePointsOfFailure.length > 0) {
      factors.push(`${busFactor.singlePointsOfFailure.length} SPOF(s)`);
    }
    factors.push(
      `Knowledge distribution: ${busFactor.knowledgeDistributionScore}%`
    );
    return factors;
  }

  private getStrategicFactors(busFactor: OrganizationBusFactor): string[] {
    const factors: string[] = [];
    if (busFactor.criticalDomainsCount > 0) {
      factors.push(`${busFactor.criticalDomainsCount} critical domain(s)`);
    }
    const uniqueKnowledge = busFactor.singlePointsOfFailure.reduce(
      (sum, s) => sum + s.uniqueDomains.length,
      0
    );
    if (uniqueKnowledge > 0) {
      factors.push(`${uniqueKnowledge} unique knowledge area(s)`);
    }
    return factors;
  }

  private getComplianceFactors(busFactor: OrganizationBusFactor): string[] {
    const factors: string[] = [];
    const undocumented = busFactor.domainScores.filter(
      (d) => d.coverage < 0.3
    ).length;
    if (undocumented > 0) {
      factors.push(`${undocumented} poorly documented domain(s)`);
    }
    return factors;
  }
}

// Factory function
let riskExposureQuantifierInstance: RiskExposureQuantifier | null = null;

export function createRiskExposureQuantifier(pool: Pool): RiskExposureQuantifier {
  if (!riskExposureQuantifierInstance) {
    riskExposureQuantifierInstance = new RiskExposureQuantifier(pool);
  }
  return riskExposureQuantifierInstance;
}

export function resetRiskExposureQuantifier(): void {
  riskExposureQuantifierInstance = null;
}
