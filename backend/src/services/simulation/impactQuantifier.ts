/**
 * Impact Quantifier (T169)
 * Quantifies the cost, time, and risk impacts of simulated changes
 */

import type { PersonnelImpact } from './personnelSimulator';
import type { ProcessChangeImpact } from './processSimulator';
import type { OrgStructureImpact } from './orgStructureSimulator';

export interface QuantifiedImpact {
  summary: ImpactSummary;
  financial: FinancialImpact;
  operational: OperationalImpact;
  strategic: StrategicImpact;
  risk: RiskImpact;
  timeline: TimelineImpact;
  recommendations: ImpactRecommendation[];
}

interface ImpactSummary {
  overallScore: number; // 0-100, higher = more favorable
  impactLevel: 'minimal' | 'moderate' | 'significant' | 'major' | 'transformational';
  netBenefit: boolean;
  confidenceLevel: number;
  keyTakeaway: string;
}

interface FinancialImpact {
  oneTimeCosts: {
    implementation: number;
    training: number;
    technology: number;
    severance: number;
    consulting: number;
    other: number;
    total: number;
  };
  recurringCosts: {
    monthly: number;
    annual: number;
    fiveYear: number;
  };
  savings: {
    laborSavings: number;
    efficiencyGains: number;
    riskReduction: number;
    totalAnnual: number;
    fiveYear: number;
  };
  netFinancialImpact: {
    yearOne: number;
    yearTwo: number;
    yearThree: number;
    fiveYear: number;
  };
  roi: {
    simple: number;
    paybackMonths: number;
    npv: number;
    irr: number;
  };
  currency: string;
}

interface OperationalImpact {
  productivity: {
    shortTermChange: number; // percentage during transition
    longTermChange: number; // percentage after stabilization
    transitionPeriod: number; // days
  };
  quality: {
    errorRateChange: number;
    customerSatisfactionImpact: number;
    complianceRiskChange: number;
  };
  capacity: {
    throughputChange: number;
    bottleneckRisk: number;
    scalabilityImpact: number;
  };
  agility: {
    responseTimeChange: number;
    adaptabilityScore: number;
    innovationCapacityChange: number;
  };
}

interface StrategicImpact {
  alignment: {
    strategyAlignmentScore: number;
    competitivePositionImpact: number;
    marketResponsivenessChange: number;
  };
  capabilities: {
    newCapabilities: string[];
    enhancedCapabilities: string[];
    atRiskCapabilities: string[];
    capabilityGaps: string[];
  };
  culture: {
    cultureAlignmentScore: number;
    employeeEngagementImpact: number;
    talentAttractionImpact: number;
    changeReadiness: number;
  };
  growth: {
    revenueImpact: number;
    marketShareImpact: number;
    customerBaseImpact: number;
    partnerEcosystemImpact: number;
  };
}

interface RiskImpact {
  overallRiskScore: number;
  riskProfile: {
    before: Record<string, number>;
    after: Record<string, number>;
    netChange: number;
  };
  topRisks: Array<{
    risk: string;
    category: string;
    probability: number;
    impact: number;
    score: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    mitigation: string;
  }>;
  opportunityCosts: {
    delayedProjects: string[];
    missedOpportunities: string[];
    resourceDiversion: number;
  };
  contingencyRecommendations: string[];
}

interface TimelineImpact {
  totalDuration: number;
  phases: Array<{
    name: string;
    duration: number;
    productivityImpact: number;
    riskLevel: number;
  }>;
  criticalMilestones: Array<{
    name: string;
    day: number;
    criticality: 'must_hit' | 'should_hit' | 'nice_to_have';
    riskIfMissed: string;
  }>;
  parallelOpportunities: string[];
  accelerationOptions: Array<{
    option: string;
    timeReduction: number;
    additionalCost: number;
    risk: string;
  }>;
}

interface ImpactRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'proceed' | 'modify' | 'delay' | 'cancel' | 'monitor';
  recommendation: string;
  rationale: string;
  actions: string[];
  timeframe: string;
}

export class ImpactQuantifier {
  private discountRate = 0.10; // 10% discount rate for NPV
  private avgSalary = 65000; // Average annual salary in EUR

  /**
   * Quantify the impact of a personnel change
   */
  quantifyPersonnelImpact(impact: PersonnelImpact): QuantifiedImpact {
    const financial = this.calculatePersonnelFinancialImpact(impact);
    const operational = this.calculatePersonnelOperationalImpact(impact);
    const strategic = this.calculatePersonnelStrategicImpact(impact);
    const risk = this.calculatePersonnelRiskImpact(impact);
    const timeline = this.calculatePersonnelTimelineImpact(impact);

    const summary = this.generatePersonnelSummary(impact, financial, risk);
    const recommendations = this.generatePersonnelRecommendations(impact, financial, risk);

    return {
      summary,
      financial,
      operational,
      strategic,
      risk,
      timeline,
      recommendations,
    };
  }

  /**
   * Quantify the impact of a process change
   */
  quantifyProcessImpact(impact: ProcessChangeImpact): QuantifiedImpact {
    const financial = this.calculateProcessFinancialImpact(impact);
    const operational = this.calculateProcessOperationalImpact(impact);
    const strategic = this.calculateProcessStrategicImpact(impact);
    const risk = this.calculateProcessRiskImpact(impact);
    const timeline = this.calculateProcessTimelineImpact(impact);

    const summary = this.generateProcessSummary(impact, financial, risk);
    const recommendations = this.generateProcessRecommendations(impact, financial, risk);

    return {
      summary,
      financial,
      operational,
      strategic,
      risk,
      timeline,
      recommendations,
    };
  }

  /**
   * Quantify the impact of an org structure change
   */
  quantifyOrgStructureImpact(impact: OrgStructureImpact): QuantifiedImpact {
    const financial = this.calculateOrgFinancialImpact(impact);
    const operational = this.calculateOrgOperationalImpact(impact);
    const strategic = this.calculateOrgStrategicImpact(impact);
    const risk = this.calculateOrgRiskImpact(impact);
    const timeline = this.calculateOrgTimelineImpact(impact);

    const summary = this.generateOrgSummary(impact, financial, risk);
    const recommendations = this.generateOrgRecommendations(impact, financial, risk);

    return {
      summary,
      financial,
      operational,
      strategic,
      risk,
      timeline,
      recommendations,
    };
  }

  /**
   * Combine multiple impacts into aggregate view
   */
  aggregateImpacts(impacts: QuantifiedImpact[]): QuantifiedImpact {
    // Aggregate financial impacts
    const financial: FinancialImpact = {
      oneTimeCosts: {
        implementation: 0,
        training: 0,
        technology: 0,
        severance: 0,
        consulting: 0,
        other: 0,
        total: 0,
      },
      recurringCosts: { monthly: 0, annual: 0, fiveYear: 0 },
      savings: { laborSavings: 0, efficiencyGains: 0, riskReduction: 0, totalAnnual: 0, fiveYear: 0 },
      netFinancialImpact: { yearOne: 0, yearTwo: 0, yearThree: 0, fiveYear: 0 },
      roi: { simple: 0, paybackMonths: 0, npv: 0, irr: 0 },
      currency: 'EUR',
    };

    for (const impact of impacts) {
      financial.oneTimeCosts.implementation += impact.financial.oneTimeCosts.implementation;
      financial.oneTimeCosts.training += impact.financial.oneTimeCosts.training;
      financial.oneTimeCosts.technology += impact.financial.oneTimeCosts.technology;
      financial.oneTimeCosts.severance += impact.financial.oneTimeCosts.severance;
      financial.oneTimeCosts.consulting += impact.financial.oneTimeCosts.consulting;
      financial.oneTimeCosts.other += impact.financial.oneTimeCosts.other;
      financial.recurringCosts.annual += impact.financial.recurringCosts.annual;
      financial.savings.totalAnnual += impact.financial.savings.totalAnnual;
    }

    financial.oneTimeCosts.total = Object.values(financial.oneTimeCosts).reduce((a, b) => a + b, 0) - financial.oneTimeCosts.total;
    financial.recurringCosts.monthly = financial.recurringCosts.annual / 12;
    financial.recurringCosts.fiveYear = financial.recurringCosts.annual * 5;
    financial.savings.fiveYear = financial.savings.totalAnnual * 5;

    // Calculate aggregate net impact
    const netAnnual = financial.savings.totalAnnual - financial.recurringCosts.annual;
    financial.netFinancialImpact = {
      yearOne: netAnnual - financial.oneTimeCosts.total,
      yearTwo: netAnnual,
      yearThree: netAnnual,
      fiveYear: netAnnual * 5 - financial.oneTimeCosts.total,
    };

    // Calculate ROI
    financial.roi = this.calculateROI(financial);

    // Aggregate other dimensions (use weighted averages)
    const avgOperational = this.averageOperationalImpacts(impacts.map((i) => i.operational));
    const avgStrategic = this.averageStrategicImpacts(impacts.map((i) => i.strategic));
    const combinedRisk = this.combineRiskImpacts(impacts.map((i) => i.risk));
    const combinedTimeline = this.combineTimelineImpacts(impacts.map((i) => i.timeline));

    // Generate aggregate summary
    const overallScore = impacts.reduce((sum, i) => sum + i.summary.overallScore, 0) / impacts.length;
    const summary: ImpactSummary = {
      overallScore: Math.round(overallScore),
      impactLevel: this.getImpactLevel(overallScore),
      netBenefit: financial.netFinancialImpact.fiveYear > 0,
      confidenceLevel: Math.min(...impacts.map((i) => i.summary.confidenceLevel)),
      keyTakeaway: this.generateAggregateTakeaway(impacts, financial),
    };

    // Combine recommendations
    const recommendations = this.prioritizeRecommendations(
      impacts.flatMap((i) => i.recommendations)
    );

    return {
      summary,
      financial,
      operational: avgOperational,
      strategic: avgStrategic,
      risk: combinedRisk,
      timeline: combinedTimeline,
      recommendations,
    };
  }

  // Private methods for personnel impact calculation

  private calculatePersonnelFinancialImpact(impact: PersonnelImpact): FinancialImpact {
    const oneTimeCosts = {
      implementation: 0,
      training: 5000 * impact.affectedTeamMembers.filter((m) => m.additionalLoadPercent > 20).length,
      technology: 0,
      severance: impact.changeType === 'departure' ? 0 : 0,
      consulting: impact.overallRiskScore > 70 ? 15000 : 5000,
      other: 2000,
      total: 0,
    };
    oneTimeCosts.total = Object.values(oneTimeCosts).reduce((a, b) => a + b, 0);

    const recurringCosts = {
      monthly: 0,
      annual: impact.costEstimate.indirectCosts,
      fiveYear: impact.costEstimate.indirectCosts * 5,
    };
    recurringCosts.monthly = recurringCosts.annual / 12;

    const savings = {
      laborSavings: 0,
      efficiencyGains: 0,
      riskReduction: 0,
      totalAnnual: 0,
      fiveYear: 0,
    };

    const netAnnual = savings.totalAnnual - recurringCosts.annual;
    const netFinancialImpact = {
      yearOne: netAnnual - oneTimeCosts.total - impact.costEstimate.directCosts,
      yearTwo: netAnnual,
      yearThree: netAnnual,
      fiveYear: netAnnual * 5 - oneTimeCosts.total - impact.costEstimate.directCosts,
    };

    return {
      oneTimeCosts,
      recurringCosts,
      savings,
      netFinancialImpact,
      roi: this.calculateROI({ oneTimeCosts, recurringCosts, savings, netFinancialImpact, currency: 'EUR', roi: { simple: 0, paybackMonths: 0, npv: 0, irr: 0 } }),
      currency: 'EUR',
    };
  }

  private calculatePersonnelOperationalImpact(impact: PersonnelImpact): OperationalImpact {
    return {
      productivity: {
        shortTermChange: -20 - (impact.overallRiskScore / 5),
        longTermChange: -5,
        transitionPeriod: impact.estimatedRecoveryTime.expected,
      },
      quality: {
        errorRateChange: impact.impactAreas.knowledgeLoss.score > 50 ? 15 : 5,
        customerSatisfactionImpact: -impact.impactAreas.communicationGaps.externalRelationships * 2,
        complianceRiskChange: impact.criticalDependencies.filter((d) => d.type === 'approval').length * 10,
      },
      capacity: {
        throughputChange: -impact.impactAreas.processDisruption.bottleneckRisk / 2,
        bottleneckRisk: impact.impactAreas.processDisruption.bottleneckRisk,
        scalabilityImpact: -10,
      },
      agility: {
        responseTimeChange: impact.impactAreas.processDisruption.affectedProcessCount * 5,
        adaptabilityScore: 70 - impact.overallRiskScore / 3,
        innovationCapacityChange: -impact.impactAreas.knowledgeLoss.uniqueKnowledgeAreas.length * 5,
      },
    };
  }

  private calculatePersonnelStrategicImpact(impact: PersonnelImpact): StrategicImpact {
    return {
      alignment: {
        strategyAlignmentScore: 70,
        competitivePositionImpact: -impact.impactAreas.knowledgeLoss.score / 10,
        marketResponsivenessChange: -5,
      },
      capabilities: {
        newCapabilities: [],
        enhancedCapabilities: [],
        atRiskCapabilities: impact.impactAreas.knowledgeLoss.uniqueKnowledgeAreas,
        capabilityGaps: impact.impactAreas.knowledgeLoss.criticalUndocumented,
      },
      culture: {
        cultureAlignmentScore: 75 - impact.impactAreas.teamDynamics.teamMoraleRisk / 4,
        employeeEngagementImpact: -impact.impactAreas.teamDynamics.score / 5,
        talentAttractionImpact: 0,
        changeReadiness: 60,
      },
      growth: {
        revenueImpact: -impact.impactAreas.projectRisk.delayedProjects.length * 2,
        marketShareImpact: 0,
        customerBaseImpact: -impact.impactAreas.communicationGaps.externalRelationships,
        partnerEcosystemImpact: 0,
      },
    };
  }

  private calculatePersonnelRiskImpact(impact: PersonnelImpact): RiskImpact {
    const topRisks = [
      {
        risk: 'Knowledge Loss',
        category: 'Operational',
        probability: impact.impactAreas.knowledgeLoss.score,
        impact: 70,
        score: impact.impactAreas.knowledgeLoss.score * 0.7,
        trend: 'increasing' as const,
        mitigation: 'Accelerate knowledge documentation and cross-training',
      },
      {
        risk: 'Process Disruption',
        category: 'Operational',
        probability: impact.impactAreas.processDisruption.bottleneckRisk,
        impact: 60,
        score: impact.impactAreas.processDisruption.score * 0.6,
        trend: 'increasing' as const,
        mitigation: 'Identify and train backup personnel',
      },
      {
        risk: 'Team Morale Decline',
        category: 'People',
        probability: impact.impactAreas.teamDynamics.teamMoraleRisk,
        impact: 50,
        score: impact.impactAreas.teamDynamics.score * 0.5,
        trend: 'stable' as const,
        mitigation: 'Transparent communication and support programs',
      },
    ];

    return {
      overallRiskScore: impact.overallRiskScore,
      riskProfile: {
        before: { operational: 30, people: 25, strategic: 20 },
        after: {
          operational: 30 + impact.impactAreas.processDisruption.score / 3,
          people: 25 + impact.impactAreas.teamDynamics.score / 3,
          strategic: 20 + impact.impactAreas.knowledgeLoss.score / 5,
        },
        netChange: impact.overallRiskScore / 3,
      },
      topRisks,
      opportunityCosts: {
        delayedProjects: impact.impactAreas.projectRisk.delayedProjects,
        missedOpportunities: [],
        resourceDiversion: impact.estimatedRecoveryTime.expected * 500,
      },
      contingencyRecommendations: [
        'Maintain open communication with affected team',
        'Have interim coverage plan ready',
        'Schedule regular check-ins during transition',
      ],
    };
  }

  private calculatePersonnelTimelineImpact(impact: PersonnelImpact): TimelineImpact {
    return {
      totalDuration: impact.estimatedRecoveryTime.maximum,
      phases: [
        {
          name: 'Immediate Response',
          duration: 7,
          productivityImpact: -30,
          riskLevel: 80,
        },
        {
          name: 'Knowledge Transfer',
          duration: impact.estimatedRecoveryTime.expected - 7,
          productivityImpact: -20,
          riskLevel: 60,
        },
        {
          name: 'Stabilization',
          duration: impact.estimatedRecoveryTime.maximum - impact.estimatedRecoveryTime.expected,
          productivityImpact: -10,
          riskLevel: 30,
        },
      ],
      criticalMilestones: [
        {
          name: 'Critical Knowledge Documented',
          day: 14,
          criticality: 'must_hit',
          riskIfMissed: 'Permanent knowledge loss',
        },
        {
          name: 'Backup Personnel Identified',
          day: 7,
          criticality: 'must_hit',
          riskIfMissed: 'Process disruption',
        },
      ],
      parallelOpportunities: ['Documentation and training can run in parallel'],
      accelerationOptions: [
        {
          option: 'External consulting support',
          timeReduction: 10,
          additionalCost: 15000,
          risk: 'External dependency',
        },
      ],
    };
  }

  private generatePersonnelSummary(
    impact: PersonnelImpact,
    financial: FinancialImpact,
    risk: RiskImpact
  ): ImpactSummary {
    const overallScore = 100 - impact.overallRiskScore;

    return {
      overallScore,
      impactLevel: this.getImpactLevel(100 - impact.overallRiskScore),
      netBenefit: false,
      confidenceLevel: 75,
      keyTakeaway: impact.overallRiskScore > 60
        ? `High-risk ${impact.changeType}: Immediate mitigation required to prevent ${impact.impactAreas.knowledgeLoss.uniqueKnowledgeAreas.length > 0 ? 'critical knowledge loss' : 'significant disruption'}`
        : `Manageable ${impact.changeType}: Standard transition procedures should suffice`,
    };
  }

  private generatePersonnelRecommendations(
    impact: PersonnelImpact,
    _financial: FinancialImpact,
    _risk: RiskImpact
  ): ImpactRecommendation[] {
    const recommendations: ImpactRecommendation[] = [];

    if (impact.impactAreas.knowledgeLoss.score > 50) {
      recommendations.push({
        priority: 'critical',
        category: 'proceed',
        recommendation: 'Initiate emergency knowledge transfer',
        rationale: 'Unique knowledge at risk of being lost',
        actions: [
          'Schedule knowledge transfer sessions immediately',
          'Document all undocumented critical processes',
          'Identify and train backup personnel',
        ],
        timeframe: 'Within 1 week',
      });
    }

    if (impact.impactAreas.processDisruption.bottleneckRisk > 40) {
      recommendations.push({
        priority: 'high',
        category: 'proceed',
        recommendation: 'Establish process continuity plan',
        rationale: 'Multiple processes at risk of disruption',
        actions: [
          'Map all affected processes',
          'Assign interim owners',
          'Communicate changes to stakeholders',
        ],
        timeframe: 'Within 2 weeks',
      });
    }

    recommendations.push({
      priority: 'medium',
      category: 'monitor',
      recommendation: 'Monitor team morale and engagement',
      rationale: 'Personnel changes affect team dynamics',
      actions: [
        'Schedule regular team check-ins',
        'Address concerns proactively',
        'Recognize team efforts during transition',
      ],
      timeframe: 'Ongoing for 3 months',
    });

    return recommendations;
  }

  // Private methods for process impact calculation

  private calculateProcessFinancialImpact(impact: ProcessChangeImpact): FinancialImpact {
    return {
      ...impact.costBenefitAnalysis,
      oneTimeCosts: {
        implementation: impact.costBenefitAnalysis.implementationCosts.technology,
        training: impact.costBenefitAnalysis.implementationCosts.training,
        technology: impact.costBenefitAnalysis.implementationCosts.technology,
        severance: 0,
        consulting: impact.costBenefitAnalysis.implementationCosts.consulting,
        other: impact.costBenefitAnalysis.implementationCosts.opportunity,
        total: impact.costBenefitAnalysis.implementationCosts.total,
      },
      recurringCosts: {
        monthly: impact.costBenefitAnalysis.ongoingCosts.monthly,
        annual: impact.costBenefitAnalysis.ongoingCosts.annual,
        fiveYear: impact.costBenefitAnalysis.ongoingCosts.annual * 5,
      },
      savings: {
        laborSavings: impact.costBenefitAnalysis.benefits.laborSavings,
        efficiencyGains: impact.costBenefitAnalysis.benefits.efficiencyGains,
        riskReduction: impact.costBenefitAnalysis.benefits.qualityImprovements,
        totalAnnual: impact.costBenefitAnalysis.benefits.totalAnnual,
        fiveYear: impact.costBenefitAnalysis.benefits.totalAnnual * 5,
      },
      netFinancialImpact: {
        yearOne: impact.costBenefitAnalysis.benefits.totalAnnual - impact.costBenefitAnalysis.implementationCosts.total,
        yearTwo: impact.costBenefitAnalysis.benefits.totalAnnual,
        yearThree: impact.costBenefitAnalysis.benefits.totalAnnual,
        fiveYear: impact.costBenefitAnalysis.npv,
      },
      roi: {
        simple: impact.costBenefitAnalysis.roi,
        paybackMonths: impact.costBenefitAnalysis.paybackPeriod,
        npv: impact.costBenefitAnalysis.npv,
        irr: 0, // Simplified
      },
      currency: 'EUR',
    };
  }

  private calculateProcessOperationalImpact(impact: ProcessChangeImpact): OperationalImpact {
    return {
      productivity: {
        shortTermChange: -15,
        longTermChange: impact.metrics.efficiencyGain.timeReduction,
        transitionPeriod: impact.timeline.totalDuration,
      },
      quality: {
        errorRateChange: -impact.metrics.qualityImpact.qualityImprovement,
        customerSatisfactionImpact: impact.metrics.qualityImpact.qualityImprovement / 2,
        complianceRiskChange: impact.metrics.complianceImpact.complianceRisks.length * 5,
      },
      capacity: {
        throughputChange: impact.metrics.efficiencyGain.throughputIncrease,
        bottleneckRisk: impact.metrics.efficiencyGain.newBottlenecks.length * 20,
        scalabilityImpact: impact.changeType === 'automation' ? 30 : 0,
      },
      agility: {
        responseTimeChange: -impact.metrics.efficiencyGain.timeReduction,
        adaptabilityScore: 70,
        innovationCapacityChange: impact.changeType === 'automation' ? 20 : 0,
      },
    };
  }

  private calculateProcessStrategicImpact(impact: ProcessChangeImpact): StrategicImpact {
    return {
      alignment: {
        strategyAlignmentScore: impact.overallImpactScore,
        competitivePositionImpact: impact.metrics.efficiencyGain.timeReduction / 5,
        marketResponsivenessChange: impact.metrics.efficiencyGain.throughputIncrease / 4,
      },
      capabilities: {
        newCapabilities: impact.changeType === 'automation' ? ['Automated processing'] : [],
        enhancedCapabilities: ['Process efficiency'],
        atRiskCapabilities: [],
        capabilityGaps: impact.metrics.resourceImpact.skillRequirements
          .filter((s) => s.gap > 30)
          .map((s) => s.skill),
      },
      culture: {
        cultureAlignmentScore: 75,
        employeeEngagementImpact: impact.changeType === 'automation' ? -10 : 5,
        talentAttractionImpact: impact.changeType === 'automation' ? 10 : 0,
        changeReadiness: 65,
      },
      growth: {
        revenueImpact: impact.metrics.efficiencyGain.throughputIncrease / 10,
        marketShareImpact: 0,
        customerBaseImpact: 0,
        partnerEcosystemImpact: 0,
      },
    };
  }

  private calculateProcessRiskImpact(impact: ProcessChangeImpact): RiskImpact {
    return {
      overallRiskScore: impact.metrics.riskAnalysis.overallRisk,
      riskProfile: {
        before: { operational: 40, technical: 30, organizational: 30 },
        after: {
          operational: 40 - impact.metrics.riskAnalysis.riskReduction,
          technical: 30 + (impact.changeType === 'automation' ? 10 : 0),
          organizational: 30,
        },
        netChange: -impact.metrics.riskAnalysis.riskReduction,
      },
      topRisks: impact.metrics.riskAnalysis.risks.map((r) => ({
        risk: r.description,
        category: r.category,
        probability: r.likelihood,
        impact: r.impact,
        score: r.score,
        trend: 'stable' as const,
        mitigation: r.mitigation,
      })),
      opportunityCosts: {
        delayedProjects: [],
        missedOpportunities: [],
        resourceDiversion: impact.costBenefitAnalysis.implementationCosts.opportunity,
      },
      contingencyRecommendations: [
        'Maintain rollback capability',
        'Have manual backup procedures ready',
        'Monitor closely during initial rollout',
      ],
    };
  }

  private calculateProcessTimelineImpact(impact: ProcessChangeImpact): TimelineImpact {
    return {
      totalDuration: impact.timeline.totalDuration,
      phases: impact.timeline.phases.map((p) => ({
        name: p.name,
        duration: p.duration,
        productivityImpact: -10,
        riskLevel: 40,
      })),
      criticalMilestones: impact.timeline.milestones.map((m) => ({
        name: m.name,
        day: m.day,
        criticality: 'must_hit' as const,
        riskIfMissed: 'Schedule delay',
      })),
      parallelOpportunities: ['Training and documentation can proceed in parallel'],
      accelerationOptions: [
        {
          option: 'Additional consulting resources',
          timeReduction: 14,
          additionalCost: 20000,
          risk: 'Quality may suffer',
        },
      ],
    };
  }

  private generateProcessSummary(
    impact: ProcessChangeImpact,
    financial: FinancialImpact,
    _risk: RiskImpact
  ): ImpactSummary {
    return {
      overallScore: impact.overallImpactScore,
      impactLevel: this.getImpactLevel(impact.overallImpactScore),
      netBenefit: financial.netFinancialImpact.fiveYear > 0,
      confidenceLevel: 80,
      keyTakeaway: financial.roi.simple > 50
        ? `Strong ROI of ${financial.roi.simple}% - ${impact.changeType} recommended with ${Math.round(financial.roi.paybackMonths)} month payback`
        : `Moderate impact - consider ${impact.changeType} if strategic alignment is high`,
    };
  }

  private generateProcessRecommendations(
    impact: ProcessChangeImpact,
    financial: FinancialImpact,
    risk: RiskImpact
  ): ImpactRecommendation[] {
    const recommendations: ImpactRecommendation[] = [];

    if (financial.roi.simple > 30 && risk.overallRiskScore < 50) {
      recommendations.push({
        priority: 'high',
        category: 'proceed',
        recommendation: 'Proceed with implementation',
        rationale: `Positive ROI (${financial.roi.simple}%) with acceptable risk`,
        actions: [
          'Finalize implementation plan',
          'Secure budget approval',
          'Begin phase 1 activities',
        ],
        timeframe: 'Start within 2 weeks',
      });
    } else if (risk.overallRiskScore > 60) {
      recommendations.push({
        priority: 'high',
        category: 'modify',
        recommendation: 'Address risks before proceeding',
        rationale: 'Risk level exceeds acceptable threshold',
        actions: risk.topRisks.slice(0, 3).map((r) => r.mitigation),
        timeframe: 'Complete risk mitigation within 4 weeks',
      });
    }

    return recommendations;
  }

  // Private methods for org structure impact calculation

  private calculateOrgFinancialImpact(impact: OrgStructureImpact): FinancialImpact {
    const consultingCost = 25000;
    const trainingCost = impact.affectedPersonnel.length * 1000;
    const communicationCost = 5000;

    const oneTimeCosts = {
      implementation: 10000,
      training: trainingCost,
      technology: 5000,
      severance: 0,
      consulting: consultingCost,
      other: communicationCost,
      total: 0,
    };
    oneTimeCosts.total = Object.values(oneTimeCosts).reduce((a, b) => a + b, 0);

    const productivityLoss = impact.affectedPersonnel.length * this.avgSalary * 0.1;

    return {
      oneTimeCosts,
      recurringCosts: {
        monthly: 0,
        annual: productivityLoss,
        fiveYear: productivityLoss * 2, // Productivity recovers
      },
      savings: {
        laborSavings: 0,
        efficiencyGains: impact.overallImpactScore > 60 ? 50000 : 0,
        riskReduction: 0,
        totalAnnual: impact.overallImpactScore > 60 ? 50000 : 0,
        fiveYear: impact.overallImpactScore > 60 ? 250000 : 0,
      },
      netFinancialImpact: {
        yearOne: -oneTimeCosts.total - productivityLoss,
        yearTwo: impact.overallImpactScore > 60 ? 50000 : -productivityLoss / 2,
        yearThree: impact.overallImpactScore > 60 ? 50000 : 0,
        fiveYear: impact.overallImpactScore > 60 ? 150000 : -oneTimeCosts.total,
      },
      roi: {
        simple: impact.overallImpactScore > 60 ? 50 : -30,
        paybackMonths: impact.overallImpactScore > 60 ? 24 : 0,
        npv: impact.overallImpactScore > 60 ? 100000 : -50000,
        irr: 0,
      },
      currency: 'EUR',
    };
  }

  private calculateOrgOperationalImpact(impact: OrgStructureImpact): OperationalImpact {
    return {
      productivity: {
        shortTermChange: -20 - impact.cultureRisk.overallRisk / 5,
        longTermChange: impact.overallImpactScore > 60 ? 10 : -5,
        transitionPeriod: impact.implementationPlan.totalDuration,
      },
      quality: {
        errorRateChange: impact.processImpact.handoffComplexityIncrease / 2,
        customerSatisfactionImpact: -impact.cultureRisk.engagementImpact / 10,
        complianceRiskChange: 5,
      },
      capacity: {
        throughputChange: -impact.processImpact.handoffComplexityIncrease / 3,
        bottleneckRisk: impact.communicationImpact.bottleneckRisk.length * 15,
        scalabilityImpact: impact.spanOfControlAnalysis.overallHealthScore - 70,
      },
      agility: {
        responseTimeChange: impact.communicationImpact.projectedPathLength - impact.communicationImpact.currentPathLength,
        adaptabilityScore: impact.cultureRisk.changeReadiness,
        innovationCapacityChange: impact.overallImpactScore > 70 ? 10 : -5,
      },
    };
  }

  private calculateOrgStrategicImpact(impact: OrgStructureImpact): StrategicImpact {
    return {
      alignment: {
        strategyAlignmentScore: impact.overallImpactScore,
        competitivePositionImpact: 0,
        marketResponsivenessChange: impact.teamDynamicsImpact.teamsAffected > 3 ? -10 : 5,
      },
      capabilities: {
        newCapabilities: [],
        enhancedCapabilities: impact.overallImpactScore > 60 ? ['Organizational agility'] : [],
        atRiskCapabilities: impact.knowledgeTransferImpact.criticalKnowledgeAtRisk,
        capabilityGaps: impact.teamDynamicsImpact.leadershipGaps,
      },
      culture: {
        cultureAlignmentScore: 100 - impact.cultureRisk.overallRisk,
        employeeEngagementImpact: impact.cultureRisk.engagementImpact,
        talentAttractionImpact: impact.overallImpactScore > 70 ? 5 : -10,
        changeReadiness: impact.cultureRisk.changeReadiness,
      },
      growth: {
        revenueImpact: 0,
        marketShareImpact: 0,
        customerBaseImpact: 0,
        partnerEcosystemImpact: 0,
      },
    };
  }

  private calculateOrgRiskImpact(impact: OrgStructureImpact): RiskImpact {
    return {
      overallRiskScore: impact.cultureRisk.overallRisk,
      riskProfile: {
        before: { organizational: 30, operational: 25, people: 35 },
        after: {
          organizational: 30 + impact.cultureRisk.overallRisk / 4,
          operational: 25 + impact.processImpact.handoffComplexityIncrease / 3,
          people: 35 + impact.cultureRisk.turnoverRisk / 3,
        },
        netChange: impact.cultureRisk.overallRisk / 3,
      },
      topRisks: impact.cultureRisk.factors.map((f) => ({
        risk: f.factor,
        category: 'People',
        probability: f.risk === 'high' ? 70 : f.risk === 'medium' ? 50 : 30,
        impact: f.risk === 'high' ? 70 : f.risk === 'medium' ? 50 : 30,
        score: f.risk === 'high' ? 49 : f.risk === 'medium' ? 25 : 9,
        trend: 'increasing' as const,
        mitigation: f.mitigation,
      })),
      opportunityCosts: {
        delayedProjects: [],
        missedOpportunities: ['Focus diverted from strategic initiatives'],
        resourceDiversion: impact.affectedPersonnel.length * 5000,
      },
      contingencyRecommendations: impact.implementationPlan.changeManagementActions,
    };
  }

  private calculateOrgTimelineImpact(impact: OrgStructureImpact): TimelineImpact {
    return {
      totalDuration: impact.implementationPlan.totalDuration,
      phases: impact.implementationPlan.phases.map((p) => ({
        name: p.name,
        duration: p.duration,
        productivityImpact: -15,
        riskLevel: 50,
      })),
      criticalMilestones: [
        {
          name: 'Communication Complete',
          day: 21,
          criticality: 'must_hit',
          riskIfMissed: 'Employee uncertainty and rumors',
        },
        {
          name: 'Transition Complete',
          day: impact.implementationPlan.totalDuration - 30,
          criticality: 'must_hit',
          riskIfMissed: 'Extended disruption',
        },
      ],
      parallelOpportunities: ['Communication and preparation can run in parallel'],
      accelerationOptions: [
        {
          option: 'Dedicated change management team',
          timeReduction: 14,
          additionalCost: 30000,
          risk: 'May feel rushed to employees',
        },
      ],
    };
  }

  private generateOrgSummary(
    impact: OrgStructureImpact,
    financial: FinancialImpact,
    _risk: RiskImpact
  ): ImpactSummary {
    return {
      overallScore: impact.overallImpactScore,
      impactLevel: this.getImpactLevel(impact.overallImpactScore),
      netBenefit: financial.netFinancialImpact.fiveYear > 0,
      confidenceLevel: 70,
      keyTakeaway: impact.cultureRisk.overallRisk > 60
        ? `High change risk (${impact.cultureRisk.turnoverRisk}% turnover risk) - strong change management required`
        : `Manageable ${impact.change.type} with ${impact.affectedPersonnel.length} people affected`,
    };
  }

  private generateOrgRecommendations(
    impact: OrgStructureImpact,
    _financial: FinancialImpact,
    _risk: RiskImpact
  ): ImpactRecommendation[] {
    const recommendations: ImpactRecommendation[] = [];

    if (impact.cultureRisk.overallRisk > 50) {
      recommendations.push({
        priority: 'critical',
        category: 'modify',
        recommendation: 'Strengthen change management approach',
        rationale: 'High culture risk requires proactive intervention',
        actions: impact.implementationPlan.changeManagementActions,
        timeframe: 'Before and during transition',
      });
    }

    if (impact.knowledgeTransferImpact.criticalKnowledgeAtRisk.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'proceed',
        recommendation: 'Execute knowledge transfer plan',
        rationale: 'Critical knowledge at risk during transition',
        actions: impact.knowledgeTransferImpact.transferPlan.map(
          (t) => `Transfer ${t.knowledge} from ${t.from} to ${t.to}`
        ),
        timeframe: 'Start immediately, complete before transition',
      });
    }

    recommendations.push({
      priority: 'medium',
      category: 'monitor',
      recommendation: 'Track success metrics closely',
      rationale: 'Early detection of issues enables quick response',
      actions: impact.successMetrics.map((m) => `Monitor ${m.metric} ${m.measurementFrequency}`),
      timeframe: 'Ongoing for 6 months',
    });

    return recommendations;
  }

  // Helper methods

  private calculateROI(financial: Omit<FinancialImpact, 'roi'>): FinancialImpact['roi'] {
    const totalCost = financial.oneTimeCosts.total;
    const netAnnualBenefit = financial.savings.totalAnnual - financial.recurringCosts.annual;

    const simple = totalCost > 0
      ? ((netAnnualBenefit * 3 - totalCost) / totalCost) * 100
      : 0;

    const paybackMonths = netAnnualBenefit > 0
      ? Math.ceil(totalCost / (netAnnualBenefit / 12))
      : 0;

    // Calculate NPV
    let npv = -totalCost;
    for (let year = 1; year <= 5; year++) {
      npv += netAnnualBenefit / Math.pow(1 + this.discountRate, year);
    }

    return {
      simple: Math.round(simple),
      paybackMonths,
      npv: Math.round(npv),
      irr: 0, // Simplified - would need iterative calculation
    };
  }

  private getImpactLevel(score: number): ImpactSummary['impactLevel'] {
    if (score >= 80) return 'minimal';
    if (score >= 60) return 'moderate';
    if (score >= 40) return 'significant';
    if (score >= 20) return 'major';
    return 'transformational';
  }

  private averageOperationalImpacts(impacts: OperationalImpact[]): OperationalImpact {
    const count = impacts.length || 1;
    return {
      productivity: {
        shortTermChange: impacts.reduce((s, i) => s + i.productivity.shortTermChange, 0) / count,
        longTermChange: impacts.reduce((s, i) => s + i.productivity.longTermChange, 0) / count,
        transitionPeriod: Math.max(...impacts.map((i) => i.productivity.transitionPeriod)),
      },
      quality: {
        errorRateChange: impacts.reduce((s, i) => s + i.quality.errorRateChange, 0) / count,
        customerSatisfactionImpact: impacts.reduce((s, i) => s + i.quality.customerSatisfactionImpact, 0) / count,
        complianceRiskChange: impacts.reduce((s, i) => s + i.quality.complianceRiskChange, 0) / count,
      },
      capacity: {
        throughputChange: impacts.reduce((s, i) => s + i.capacity.throughputChange, 0) / count,
        bottleneckRisk: Math.max(...impacts.map((i) => i.capacity.bottleneckRisk)),
        scalabilityImpact: impacts.reduce((s, i) => s + i.capacity.scalabilityImpact, 0) / count,
      },
      agility: {
        responseTimeChange: impacts.reduce((s, i) => s + i.agility.responseTimeChange, 0) / count,
        adaptabilityScore: impacts.reduce((s, i) => s + i.agility.adaptabilityScore, 0) / count,
        innovationCapacityChange: impacts.reduce((s, i) => s + i.agility.innovationCapacityChange, 0) / count,
      },
    };
  }

  private averageStrategicImpacts(impacts: StrategicImpact[]): StrategicImpact {
    const count = impacts.length || 1;
    return {
      alignment: {
        strategyAlignmentScore: impacts.reduce((s, i) => s + i.alignment.strategyAlignmentScore, 0) / count,
        competitivePositionImpact: impacts.reduce((s, i) => s + i.alignment.competitivePositionImpact, 0) / count,
        marketResponsivenessChange: impacts.reduce((s, i) => s + i.alignment.marketResponsivenessChange, 0) / count,
      },
      capabilities: {
        newCapabilities: [...new Set(impacts.flatMap((i) => i.capabilities.newCapabilities))],
        enhancedCapabilities: [...new Set(impacts.flatMap((i) => i.capabilities.enhancedCapabilities))],
        atRiskCapabilities: [...new Set(impacts.flatMap((i) => i.capabilities.atRiskCapabilities))],
        capabilityGaps: [...new Set(impacts.flatMap((i) => i.capabilities.capabilityGaps))],
      },
      culture: {
        cultureAlignmentScore: impacts.reduce((s, i) => s + i.culture.cultureAlignmentScore, 0) / count,
        employeeEngagementImpact: impacts.reduce((s, i) => s + i.culture.employeeEngagementImpact, 0) / count,
        talentAttractionImpact: impacts.reduce((s, i) => s + i.culture.talentAttractionImpact, 0) / count,
        changeReadiness: Math.min(...impacts.map((i) => i.culture.changeReadiness)),
      },
      growth: {
        revenueImpact: impacts.reduce((s, i) => s + i.growth.revenueImpact, 0),
        marketShareImpact: impacts.reduce((s, i) => s + i.growth.marketShareImpact, 0),
        customerBaseImpact: impacts.reduce((s, i) => s + i.growth.customerBaseImpact, 0),
        partnerEcosystemImpact: impacts.reduce((s, i) => s + i.growth.partnerEcosystemImpact, 0),
      },
    };
  }

  private combineRiskImpacts(impacts: RiskImpact[]): RiskImpact {
    const allRisks = impacts.flatMap((i) => i.topRisks);
    const sortedRisks = allRisks.sort((a, b) => b.score - a.score).slice(0, 10);

    return {
      overallRiskScore: Math.max(...impacts.map((i) => i.overallRiskScore)),
      riskProfile: {
        before: {},
        after: {},
        netChange: impacts.reduce((s, i) => s + i.riskProfile.netChange, 0),
      },
      topRisks: sortedRisks,
      opportunityCosts: {
        delayedProjects: [...new Set(impacts.flatMap((i) => i.opportunityCosts.delayedProjects))],
        missedOpportunities: [...new Set(impacts.flatMap((i) => i.opportunityCosts.missedOpportunities))],
        resourceDiversion: impacts.reduce((s, i) => s + i.opportunityCosts.resourceDiversion, 0),
      },
      contingencyRecommendations: [...new Set(impacts.flatMap((i) => i.contingencyRecommendations))],
    };
  }

  private combineTimelineImpacts(impacts: TimelineImpact[]): TimelineImpact {
    return {
      totalDuration: Math.max(...impacts.map((i) => i.totalDuration)),
      phases: impacts.flatMap((i) => i.phases),
      criticalMilestones: impacts
        .flatMap((i) => i.criticalMilestones)
        .sort((a, b) => a.day - b.day),
      parallelOpportunities: [...new Set(impacts.flatMap((i) => i.parallelOpportunities))],
      accelerationOptions: impacts.flatMap((i) => i.accelerationOptions),
    };
  }

  private generateAggregateTakeaway(impacts: QuantifiedImpact[], financial: FinancialImpact): string {
    const netBenefit = financial.netFinancialImpact.fiveYear;
    const avgRisk = impacts.reduce((s, i) => s + i.risk.overallRiskScore, 0) / impacts.length;

    if (netBenefit > 100000 && avgRisk < 40) {
      return `Strong positive outcome expected: €${Math.round(netBenefit / 1000)}K 5-year benefit with manageable risk`;
    }
    if (netBenefit > 0 && avgRisk < 60) {
      return `Positive but cautious: €${Math.round(netBenefit / 1000)}K benefit with moderate risk (${Math.round(avgRisk)}%)`;
    }
    if (avgRisk > 70) {
      return `High risk scenario: Consider phasing or additional mitigation before proceeding`;
    }
    return `Mixed impact: Careful evaluation of trade-offs recommended before proceeding`;
  }

  private prioritizeRecommendations(recommendations: ImpactRecommendation[]): ImpactRecommendation[] {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return recommendations
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 10);
  }
}

export default ImpactQuantifier;
