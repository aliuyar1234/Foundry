/**
 * Recommendation Generator
 * Generates prioritized recommendations based on assessment results
 */

import type { ERPReadinessScore, RiskFactor, ERPRecommendation } from './erpReadiness.js';
import type { AIReadinessScore, Recommendation as AIRecommendation } from './aiReadiness.js';
import type { DataQualityScore, DataQualityIssue } from './dataQuality.js';
import type { ProcessMaturityScore, MaturityGap } from './processMaturity.js';

export interface CombinedAssessmentInput {
  organizationId: string;
  erpReadiness?: ERPReadinessScore;
  aiReadiness?: AIReadinessScore;
  dataQuality?: DataQualityScore;
  processMaturity?: ProcessMaturityScore;
  organizationContext: OrganizationContext;
}

export interface OrganizationContext {
  industry: string;
  size: 'small' | 'medium' | 'large' | 'enterprise';
  currentSystems: string[];
  strategicPriorities: string[];
  budgetConstraint: 'tight' | 'moderate' | 'flexible';
  timelineUrgency: 'asap' | 'planned' | 'flexible';
  riskTolerance: 'low' | 'medium' | 'high';
}

export interface RecommendationReport {
  executiveSummary: ExecutiveSummary;
  strategicRecommendations: StrategicRecommendation[];
  tacticalRecommendations: TacticalRecommendation[];
  quickWins: QuickWin[];
  investmentPlan: InvestmentPlan;
  implementationRoadmap: ImplementationRoadmap;
  riskMitigation: RiskMitigation[];
  successMetrics: SuccessMetric[];
}

export interface ExecutiveSummary {
  overallReadiness: number;
  readinessGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  keyStrengths: string[];
  criticalGaps: string[];
  topPriorities: string[];
  estimatedInvestment: string;
  expectedTimeToValue: string;
  recommendation: string;
}

export interface StrategicRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium';
  category: string;
  title: string;
  description: string;
  rationale: string;
  expectedBenefit: string;
  dependencies: string[];
  risks: string[];
  estimatedCost: string;
  estimatedDuration: string;
  kpis: string[];
}

export interface TacticalRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  steps: string[];
  owner: string;
  resources: string[];
  estimatedEffort: string;
  expectedOutcome: string;
}

export interface QuickWin {
  id: string;
  title: string;
  description: string;
  effort: 'days' | 'weeks';
  impact: 'high' | 'medium';
  category: string;
  steps: string[];
}

export interface InvestmentPlan {
  totalEstimate: string;
  breakdown: InvestmentCategory[];
  phasing: InvestmentPhase[];
  roiProjection: ROIProjection;
}

export interface InvestmentCategory {
  category: string;
  amount: string;
  percentage: number;
  justification: string;
}

export interface InvestmentPhase {
  phase: number;
  name: string;
  investment: string;
  timeline: string;
  focus: string[];
}

export interface ROIProjection {
  paybackPeriod: string;
  threeYearROI: string;
  annualBenefits: string;
  intangibleBenefits: string[];
}

export interface ImplementationRoadmap {
  phases: RoadmapPhase[];
  criticalPath: string[];
  milestones: Milestone[];
  dependencies: Dependency[];
}

export interface RoadmapPhase {
  id: string;
  name: string;
  startMonth: number;
  duration: number;
  objectives: string[];
  deliverables: string[];
  resources: string;
  risks: string[];
}

export interface Milestone {
  name: string;
  targetDate: string;
  criteria: string[];
  dependencies: string[];
}

export interface Dependency {
  from: string;
  to: string;
  type: 'finish-to-start' | 'start-to-start';
  critical: boolean;
}

export interface RiskMitigation {
  risk: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  probability: 'high' | 'medium' | 'low';
  impact: string;
  mitigation: string;
  contingency: string;
  owner: string;
}

export interface SuccessMetric {
  category: string;
  metric: string;
  currentValue: string;
  targetValue: string;
  timeframe: string;
  measurementMethod: string;
}

/**
 * Generate comprehensive recommendation report
 */
export async function generateRecommendations(input: CombinedAssessmentInput): Promise<RecommendationReport> {
  const { erpReadiness, aiReadiness, dataQuality, processMaturity, organizationContext } = input;

  // Calculate overall readiness
  const overallReadiness = calculateOverallReadiness(erpReadiness, aiReadiness, dataQuality, processMaturity);

  // Generate executive summary
  const executiveSummary = generateExecutiveSummary(
    overallReadiness,
    erpReadiness,
    aiReadiness,
    dataQuality,
    processMaturity,
    organizationContext
  );

  // Generate strategic recommendations
  const strategicRecommendations = generateStrategicRecommendations(
    erpReadiness,
    aiReadiness,
    dataQuality,
    processMaturity,
    organizationContext
  );

  // Generate tactical recommendations
  const tacticalRecommendations = generateTacticalRecommendations(
    erpReadiness,
    aiReadiness,
    dataQuality,
    processMaturity
  );

  // Identify quick wins
  const quickWins = identifyQuickWins(
    dataQuality,
    processMaturity,
    organizationContext
  );

  // Create investment plan
  const investmentPlan = createInvestmentPlan(
    strategicRecommendations,
    organizationContext
  );

  // Generate implementation roadmap
  const implementationRoadmap = generateImplementationRoadmap(
    strategicRecommendations,
    organizationContext
  );

  // Develop risk mitigation plan
  const riskMitigation = developRiskMitigation(
    erpReadiness?.riskFactors,
    aiReadiness,
    organizationContext
  );

  // Define success metrics
  const successMetrics = defineSuccessMetrics(
    erpReadiness,
    aiReadiness,
    dataQuality,
    processMaturity
  );

  return {
    executiveSummary,
    strategicRecommendations,
    tacticalRecommendations,
    quickWins,
    investmentPlan,
    implementationRoadmap,
    riskMitigation,
    successMetrics,
  };
}

/**
 * Calculate overall readiness score
 */
function calculateOverallReadiness(
  erp?: ERPReadinessScore,
  ai?: AIReadinessScore,
  data?: DataQualityScore,
  process?: ProcessMaturityScore
): number {
  const scores: number[] = [];
  if (erp) scores.push(erp.overallScore);
  if (ai) scores.push(ai.overallScore);
  if (data) scores.push(data.overallScore);
  if (process) scores.push(process.overallScore);

  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(
  overallReadiness: number,
  erp?: ERPReadinessScore,
  ai?: AIReadinessScore,
  data?: DataQualityScore,
  process?: ProcessMaturityScore,
  context?: OrganizationContext
): ExecutiveSummary {
  const grade = getGrade(overallReadiness);

  const keyStrengths: string[] = [];
  const criticalGaps: string[] = [];

  if (erp) {
    keyStrengths.push(...erp.strengths.slice(0, 2));
    criticalGaps.push(...erp.criticalGaps.slice(0, 2));
  }
  if (ai) {
    keyStrengths.push(...ai.strengths.slice(0, 2));
    criticalGaps.push(...ai.gaps.slice(0, 2));
  }
  if (data && data.overallScore > 70) {
    keyStrengths.push(`Data quality at ${data.overallScore}%`);
  } else if (data && data.overallScore < 60) {
    criticalGaps.push(`Data quality needs improvement (${data.overallScore}%)`);
  }
  if (process && process.maturityLevel >= 3) {
    keyStrengths.push(`Process maturity at Level ${process.maturityLevel}`);
  } else if (process && process.maturityLevel < 3) {
    criticalGaps.push(`Process maturity at Level ${process.maturityLevel}`);
  }

  const topPriorities = generateTopPriorities(erp, ai, data, process);

  let recommendation: string;
  if (overallReadiness >= 75) {
    recommendation = 'Organization is well-positioned for digital transformation. Proceed with strategic initiatives while maintaining current strengths.';
  } else if (overallReadiness >= 55) {
    recommendation = 'Foundation is solid but key gaps must be addressed. Focus on targeted improvements before major initiatives.';
  } else if (overallReadiness >= 35) {
    recommendation = 'Significant preparation needed. Prioritize foundational improvements before pursuing ERP or AI projects.';
  } else {
    recommendation = 'Major gaps exist across all areas. Consider a comprehensive transformation program starting with basics.';
  }

  return {
    overallReadiness,
    readinessGrade: grade,
    keyStrengths: keyStrengths.slice(0, 5),
    criticalGaps: criticalGaps.slice(0, 5),
    topPriorities,
    estimatedInvestment: getInvestmentEstimate(overallReadiness, context),
    expectedTimeToValue: getTimeToValue(overallReadiness),
    recommendation,
  };
}

/**
 * Generate strategic recommendations
 */
function generateStrategicRecommendations(
  erp?: ERPReadinessScore,
  ai?: AIReadinessScore,
  data?: DataQualityScore,
  process?: ProcessMaturityScore,
  context?: OrganizationContext
): StrategicRecommendation[] {
  const recommendations: StrategicRecommendation[] = [];
  let id = 1;

  // Data quality strategic initiative
  if (data && data.overallScore < 70) {
    recommendations.push({
      id: `SR-${id++}`,
      priority: data.overallScore < 50 ? 'critical' : 'high',
      category: 'Data Management',
      title: 'Enterprise Data Quality Program',
      description: 'Establish comprehensive data quality management across all business systems',
      rationale: `Current data quality score of ${data.overallScore}% is below target. Quality data is foundational for both ERP and AI initiatives.`,
      expectedBenefit: 'Improved decision-making, reduced errors, and enablement of advanced analytics',
      dependencies: ['Executive sponsorship', 'Data governance framework'],
      risks: ['Resource availability', 'System integration complexity'],
      estimatedCost: '€100,000 - €300,000',
      estimatedDuration: '6-12 months',
      kpis: ['Data quality score', 'Error rates', 'Processing time'],
    });
  }

  // Process maturity strategic initiative
  if (process && process.maturityLevel < 3) {
    recommendations.push({
      id: `SR-${id++}`,
      priority: process.maturityLevel < 2 ? 'critical' : 'high',
      category: 'Process Excellence',
      title: 'Process Standardization and Documentation Initiative',
      description: 'Standardize and document core business processes to achieve Level 3 maturity',
      rationale: `Current process maturity at Level ${process.maturityLevel} limits operational efficiency and transformation readiness.`,
      expectedBenefit: 'Consistent execution, reduced training time, and foundation for automation',
      dependencies: ['Process owners assigned', 'Documentation tools'],
      risks: ['Change resistance', 'Scope creep'],
      estimatedCost: '€50,000 - €150,000',
      estimatedDuration: '6-9 months',
      kpis: ['Processes documented', 'Compliance rate', 'Variance reduction'],
    });
  }

  // ERP strategic initiative
  if (erp && erp.overallScore >= 50) {
    const erpRec = erp.recommendedERPTypes[0];
    if (erpRec) {
      recommendations.push({
        id: `SR-${id++}`,
        priority: 'high',
        category: 'Enterprise Systems',
        title: `ERP Implementation - ${erpRec.name}`,
        description: `Implement ${erpRec.name} to unify business operations and data`,
        rationale: `ERP readiness at ${erp.overallScore}% with ${erpRec.fitScore}% fit score for ${erpRec.name}`,
        expectedBenefit: 'Integrated operations, real-time visibility, and scalable platform',
        dependencies: ['Data quality improvement', 'Process documentation'],
        risks: erp.riskFactors.map(r => r.description).slice(0, 3),
        estimatedCost: erpRec.estimatedCost,
        estimatedDuration: erp.estimatedTimeline,
        kpis: ['Go-live timeline', 'User adoption', 'Process coverage'],
      });
    }
  }

  // AI strategic initiative
  if (ai && ai.overallScore >= 40) {
    recommendations.push({
      id: `SR-${id++}`,
      priority: 'medium',
      category: 'AI & Analytics',
      title: 'AI Capability Development Program',
      description: 'Build organizational AI capabilities through pilots and platform development',
      rationale: `AI readiness at ${ai.overallScore}% (${ai.readinessLevel}). Strategic opportunity for competitive advantage.`,
      expectedBenefit: 'Automated processes, predictive insights, and enhanced decision-making',
      dependencies: ['Data quality', 'Technical infrastructure', 'Talent acquisition'],
      risks: ['Skill gaps', 'Technology complexity', 'ROI uncertainty'],
      estimatedCost: ai.investmentGuidance.recommendedBudgetRange,
      estimatedDuration: ai.estimatedTimeToValue,
      kpis: ['Models deployed', 'Accuracy metrics', 'Business impact'],
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2 };
  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Generate tactical recommendations
 */
function generateTacticalRecommendations(
  erp?: ERPReadinessScore,
  ai?: AIReadinessScore,
  data?: DataQualityScore,
  process?: ProcessMaturityScore
): TacticalRecommendation[] {
  const recommendations: TacticalRecommendation[] = [];
  let id = 1;

  // Data quality tactical items
  if (data) {
    data.issues.slice(0, 5).forEach((issue) => {
      recommendations.push({
        id: `TR-${id++}`,
        priority: issue.severity === 'critical' ? 'high' : issue.severity === 'high' ? 'high' : 'medium',
        category: 'Data Quality',
        title: `Address ${issue.dimension} issue in ${issue.entityType}`,
        description: issue.description,
        steps: [
          'Identify root cause of data quality issue',
          'Design validation rules or cleansing logic',
          'Implement fixes in source systems',
          'Validate improvements through sampling',
        ],
        owner: 'Data Steward',
        resources: ['Data quality tools', 'ETL platform'],
        estimatedEffort: issue.estimatedEffort,
        expectedOutcome: `Improve ${issue.dimension} from current state, affecting ${issue.affectedRecords} records`,
      });
    });
  }

  // Process maturity tactical items
  if (process) {
    process.maturityGaps.slice(0, 3).forEach((gap) => {
      recommendations.push({
        id: `TR-${id++}`,
        priority: gap.gap >= 2 ? 'high' : 'medium',
        category: 'Process Improvement',
        title: `Close ${gap.dimension} maturity gap`,
        description: gap.closingStrategy,
        steps: [
          `Assess current ${gap.dimension.toLowerCase()} practices`,
          'Define target state requirements',
          'Develop implementation plan',
          'Execute improvement activities',
          'Measure and validate results',
        ],
        owner: 'Process Owner',
        resources: ['BPM tools', 'Training programs'],
        estimatedEffort: gap.estimatedEffort,
        expectedOutcome: `Move from Level ${gap.currentLevel} to Level ${gap.targetLevel}`,
      });
    });
  }

  // AI tactical items
  if (ai) {
    ai.prioritizedRecommendations.slice(0, 3).forEach((rec) => {
      recommendations.push({
        id: `TR-${id++}`,
        priority: rec.priority === 'critical' ? 'high' : rec.priority,
        category: 'AI Readiness',
        title: rec.title,
        description: rec.description,
        steps: [
          'Assess current state',
          'Define requirements',
          'Develop implementation approach',
          'Execute and iterate',
        ],
        owner: 'AI/Data Team',
        resources: ['ML platform', 'Data engineering'],
        estimatedEffort: rec.estimatedEffort,
        expectedOutcome: rec.expectedOutcome,
      });
    });
  }

  return recommendations;
}

/**
 * Identify quick wins
 */
function identifyQuickWins(
  data?: DataQualityScore,
  process?: ProcessMaturityScore,
  context?: OrganizationContext
): QuickWin[] {
  const quickWins: QuickWin[] = [];
  let id = 1;

  // Data quality quick wins
  if (data) {
    const lowHangingFruit = data.issues.filter(
      (i) => i.estimatedEffort === 'Low' && (i.severity === 'high' || i.severity === 'critical')
    );
    lowHangingFruit.slice(0, 2).forEach((issue) => {
      quickWins.push({
        id: `QW-${id++}`,
        title: `Fix ${issue.field || issue.entityType} ${issue.dimension}`,
        description: issue.suggestedAction,
        effort: 'weeks',
        impact: 'high',
        category: 'Data Quality',
        steps: ['Identify affected records', 'Apply fix', 'Validate results'],
      });
    });
  }

  // Process quick wins
  quickWins.push({
    id: `QW-${id++}`,
    title: 'Document Top 5 Critical Processes',
    description: 'Create standard documentation for the most critical business processes',
    effort: 'weeks',
    impact: 'high',
    category: 'Process',
    steps: [
      'Identify 5 most critical processes',
      'Conduct quick interviews with process experts',
      'Create standardized documentation',
      'Review and publish',
    ],
  });

  // Data governance quick win
  quickWins.push({
    id: `QW-${id++}`,
    title: 'Assign Data Owners',
    description: 'Designate owners for critical data domains',
    effort: 'days',
    impact: 'medium',
    category: 'Governance',
    steps: [
      'List critical data domains',
      'Identify appropriate owners',
      'Define responsibilities',
      'Communicate assignments',
    ],
  });

  // Automation quick win
  quickWins.push({
    id: `QW-${id++}`,
    title: 'Automate Report Generation',
    description: 'Automate frequently requested manual reports',
    effort: 'weeks',
    impact: 'medium',
    category: 'Automation',
    steps: [
      'Identify top 3 manual reports',
      'Define automation requirements',
      'Implement automated generation',
      'Train users on new process',
    ],
  });

  return quickWins;
}

/**
 * Create investment plan
 */
function createInvestmentPlan(
  strategicRecs: StrategicRecommendation[],
  context: OrganizationContext
): InvestmentPlan {
  // Calculate total from strategic recommendations
  let minTotal = 0;
  let maxTotal = 0;

  strategicRecs.forEach((rec) => {
    const [min, max] = parseInvestmentRange(rec.estimatedCost);
    minTotal += min;
    maxTotal += max;
  });

  const breakdown: InvestmentCategory[] = [
    {
      category: 'Technology & Platforms',
      amount: `€${Math.round(minTotal * 0.35 / 1000)}k - €${Math.round(maxTotal * 0.35 / 1000)}k`,
      percentage: 35,
      justification: 'Software licenses, infrastructure, and platform costs',
    },
    {
      category: 'Implementation Services',
      amount: `€${Math.round(minTotal * 0.30 / 1000)}k - €${Math.round(maxTotal * 0.30 / 1000)}k`,
      percentage: 30,
      justification: 'Consulting, development, and integration services',
    },
    {
      category: 'Change Management',
      amount: `€${Math.round(minTotal * 0.15 / 1000)}k - €${Math.round(maxTotal * 0.15 / 1000)}k`,
      percentage: 15,
      justification: 'Training, communication, and adoption programs',
    },
    {
      category: 'Internal Resources',
      amount: `€${Math.round(minTotal * 0.15 / 1000)}k - €${Math.round(maxTotal * 0.15 / 1000)}k`,
      percentage: 15,
      justification: 'Dedicated internal team allocation',
    },
    {
      category: 'Contingency',
      amount: `€${Math.round(minTotal * 0.05 / 1000)}k - €${Math.round(maxTotal * 0.05 / 1000)}k`,
      percentage: 5,
      justification: 'Risk buffer for unforeseen requirements',
    },
  ];

  const phasing: InvestmentPhase[] = [
    {
      phase: 1,
      name: 'Foundation',
      investment: `€${Math.round((minTotal + maxTotal) / 2 * 0.3 / 1000)}k`,
      timeline: 'Months 1-6',
      focus: ['Data quality', 'Process documentation', 'Team building'],
    },
    {
      phase: 2,
      name: 'Implementation',
      investment: `€${Math.round((minTotal + maxTotal) / 2 * 0.5 / 1000)}k`,
      timeline: 'Months 6-18',
      focus: ['Core system implementation', 'Integration', 'Testing'],
    },
    {
      phase: 3,
      name: 'Optimization',
      investment: `€${Math.round((minTotal + maxTotal) / 2 * 0.2 / 1000)}k`,
      timeline: 'Months 18-24',
      focus: ['Advanced features', 'Process optimization', 'AI pilots'],
    },
  ];

  return {
    totalEstimate: `€${Math.round(minTotal / 1000)}k - €${Math.round(maxTotal / 1000)}k`,
    breakdown,
    phasing,
    roiProjection: {
      paybackPeriod: '18-24 months',
      threeYearROI: '150-250%',
      annualBenefits: `€${Math.round((minTotal + maxTotal) / 2 * 0.4 / 1000)}k estimated annual savings`,
      intangibleBenefits: [
        'Improved decision-making speed',
        'Enhanced employee productivity',
        'Better customer experience',
        'Increased business agility',
      ],
    },
  };
}

/**
 * Generate implementation roadmap
 */
function generateImplementationRoadmap(
  strategicRecs: StrategicRecommendation[],
  context: OrganizationContext
): ImplementationRoadmap {
  const phases: RoadmapPhase[] = [
    {
      id: 'phase-1',
      name: 'Foundation & Planning',
      startMonth: 1,
      duration: 3,
      objectives: ['Complete assessments', 'Secure resources', 'Establish governance'],
      deliverables: ['Project charter', 'Resource plan', 'Risk register'],
      resources: 'Core team (4-6 FTE)',
      risks: ['Executive commitment', 'Resource availability'],
    },
    {
      id: 'phase-2',
      name: 'Data & Process Preparation',
      startMonth: 2,
      duration: 6,
      objectives: ['Improve data quality', 'Document processes', 'Build capabilities'],
      deliverables: ['Clean master data', 'Process documentation', 'Training materials'],
      resources: 'Extended team (8-12 FTE)',
      risks: ['Data complexity', 'Change resistance'],
    },
    {
      id: 'phase-3',
      name: 'Core Implementation',
      startMonth: 6,
      duration: 9,
      objectives: ['Deploy core systems', 'Integrate data', 'Train users'],
      deliverables: ['Configured systems', 'Integrations', 'Trained users'],
      resources: 'Full team (12-20 FTE)',
      risks: ['Technical issues', 'Timeline slippage'],
    },
    {
      id: 'phase-4',
      name: 'Optimization & Advanced Features',
      startMonth: 15,
      duration: 6,
      objectives: ['Optimize processes', 'Deploy advanced features', 'Measure results'],
      deliverables: ['Optimized processes', 'Advanced analytics', 'Performance reports'],
      resources: 'Reduced team (6-10 FTE)',
      risks: ['Adoption challenges', 'Scope creep'],
    },
  ];

  const milestones: Milestone[] = [
    {
      name: 'Project Kickoff',
      targetDate: 'Month 1',
      criteria: ['Team assembled', 'Charter approved', 'Budget secured'],
      dependencies: [],
    },
    {
      name: 'Data Ready',
      targetDate: 'Month 6',
      criteria: ['Data quality >80%', 'Master data cleaned', 'Integrations tested'],
      dependencies: ['Project Kickoff'],
    },
    {
      name: 'Go-Live',
      targetDate: 'Month 12',
      criteria: ['System deployed', 'Users trained', 'Support ready'],
      dependencies: ['Data Ready'],
    },
    {
      name: 'Full Adoption',
      targetDate: 'Month 18',
      criteria: ['90% user adoption', 'KPIs met', 'Old systems retired'],
      dependencies: ['Go-Live'],
    },
  ];

  return {
    phases,
    criticalPath: ['Data preparation', 'Core implementation', 'User training'],
    milestones,
    dependencies: [
      { from: 'phase-1', to: 'phase-2', type: 'finish-to-start', critical: true },
      { from: 'phase-2', to: 'phase-3', type: 'finish-to-start', critical: true },
      { from: 'phase-3', to: 'phase-4', type: 'finish-to-start', critical: false },
    ],
  };
}

/**
 * Develop risk mitigation plan
 */
function developRiskMitigation(
  erpRisks?: RiskFactor[],
  ai?: AIReadinessScore,
  context?: OrganizationContext
): RiskMitigation[] {
  const mitigations: RiskMitigation[] = [];

  // Add ERP risks
  if (erpRisks) {
    erpRisks.slice(0, 3).forEach((risk) => {
      mitigations.push({
        risk: risk.description,
        severity: risk.severity,
        probability: 'medium',
        impact: risk.estimatedImpact,
        mitigation: risk.mitigationStrategy,
        contingency: 'Adjust timeline and scope as needed',
        owner: 'Project Manager',
      });
    });
  }

  // Add standard transformation risks
  mitigations.push({
    risk: 'User adoption resistance',
    severity: 'high',
    probability: 'high',
    impact: 'Delayed ROI and reduced system utilization',
    mitigation: 'Comprehensive change management and training program',
    contingency: 'Extended training period and super-user network',
    owner: 'Change Manager',
  });

  mitigations.push({
    risk: 'Data migration issues',
    severity: 'high',
    probability: 'medium',
    impact: 'Go-live delays and data quality problems',
    mitigation: 'Early data assessment, iterative migration, and thorough testing',
    contingency: 'Phased go-live with parallel running period',
    owner: 'Data Lead',
  });

  mitigations.push({
    risk: 'Resource availability',
    severity: 'medium',
    probability: 'high',
    impact: 'Project delays and knowledge gaps',
    mitigation: 'Dedicated team allocation, backup resources identified',
    contingency: 'External resource augmentation',
    owner: 'Project Sponsor',
  });

  return mitigations;
}

/**
 * Define success metrics
 */
function defineSuccessMetrics(
  erp?: ERPReadinessScore,
  ai?: AIReadinessScore,
  data?: DataQualityScore,
  process?: ProcessMaturityScore
): SuccessMetric[] {
  const metrics: SuccessMetric[] = [];

  if (data) {
    metrics.push({
      category: 'Data Quality',
      metric: 'Overall Data Quality Score',
      currentValue: `${data.overallScore}%`,
      targetValue: '85%',
      timeframe: '12 months',
      measurementMethod: 'Automated data profiling',
    });
  }

  if (process) {
    metrics.push({
      category: 'Process Maturity',
      metric: 'Process Maturity Level',
      currentValue: `Level ${process.maturityLevel}`,
      targetValue: 'Level 3',
      timeframe: '18 months',
      measurementMethod: 'Maturity assessment',
    });
  }

  if (erp) {
    metrics.push({
      category: 'ERP',
      metric: 'ERP Readiness Score',
      currentValue: `${erp.overallScore}%`,
      targetValue: '75%',
      timeframe: '6 months',
      measurementMethod: 'Readiness assessment',
    });
  }

  if (ai) {
    metrics.push({
      category: 'AI',
      metric: 'AI Readiness Score',
      currentValue: `${ai.overallScore}%`,
      targetValue: '60%',
      timeframe: '12 months',
      measurementMethod: 'Capability assessment',
    });
  }

  // Standard metrics
  metrics.push({
    category: 'Adoption',
    metric: 'User Adoption Rate',
    currentValue: 'N/A',
    targetValue: '90%',
    timeframe: '3 months post go-live',
    measurementMethod: 'System usage analytics',
  });

  metrics.push({
    category: 'ROI',
    metric: 'Cost Savings',
    currentValue: 'Baseline',
    targetValue: '15% reduction',
    timeframe: '24 months',
    measurementMethod: 'Financial analysis',
  });

  return metrics;
}

// Helper functions
function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function generateTopPriorities(
  erp?: ERPReadinessScore,
  ai?: AIReadinessScore,
  data?: DataQualityScore,
  process?: ProcessMaturityScore
): string[] {
  const priorities: string[] = [];

  if (data && data.overallScore < 60) {
    priorities.push('Improve data quality foundation');
  }
  if (process && process.maturityLevel < 3) {
    priorities.push('Standardize and document processes');
  }
  if (erp && erp.criticalGaps.length > 0) {
    priorities.push('Address ERP readiness gaps');
  }
  if (ai && ai.gaps.length > 0) {
    priorities.push('Build AI capabilities');
  }

  return priorities.slice(0, 3);
}

function getInvestmentEstimate(score: number, context?: OrganizationContext): string {
  const sizeMultiplier: Record<string, number> = {
    small: 0.5,
    medium: 1.0,
    large: 2.0,
    enterprise: 3.0,
  };
  const multiplier = sizeMultiplier[context?.size || 'medium'];

  if (score >= 70) {
    return `€${150 * multiplier}k - €${300 * multiplier}k`;
  } else if (score >= 50) {
    return `€${200 * multiplier}k - €${400 * multiplier}k`;
  } else {
    return `€${300 * multiplier}k - €${600 * multiplier}k`;
  }
}

function getTimeToValue(score: number): string {
  if (score >= 70) return '6-12 months';
  if (score >= 50) return '12-18 months';
  return '18-24 months';
}

function parseInvestmentRange(range: string): [number, number] {
  const matches = range.match(/€([\d,]+)/g);
  if (matches && matches.length >= 2) {
    const min = parseInt(matches[0].replace(/[€,]/g, ''), 10);
    const max = parseInt(matches[1].replace(/[€,]/g, ''), 10);
    return [min, max];
  }
  return [100000, 300000]; // Default
}

export default {
  generateRecommendations,
};
