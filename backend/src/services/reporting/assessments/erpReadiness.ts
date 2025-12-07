/**
 * ERP Readiness Scoring Model
 * Evaluates organization's readiness for ERP implementation
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ERPReadinessInput {
  organizationId: string;
  dataQualityMetrics: DataQualityMetrics;
  processMetrics: ProcessMetrics;
  systemMetrics: SystemMetrics;
  organizationMetrics: OrganizationMetrics;
}

export interface DataQualityMetrics {
  completenessScore: number; // 0-1
  accuracyScore: number; // 0-1
  consistencyScore: number; // 0-1
  duplicateRate: number; // 0-1 (lower is better)
  standardizationLevel: number; // 0-1
  masterDataCoverage: number; // 0-1
}

export interface ProcessMetrics {
  documentedProcesses: number;
  totalProcesses: number;
  processStandardization: number; // 0-1
  automationLevel: number; // 0-1
  processMaturityLevel: number; // 1-5
  bottleneckCount: number;
}

export interface SystemMetrics {
  connectedSystems: number;
  systemIntegrationLevel: number; // 0-1
  dataFlowMapping: number; // 0-1
  apiAvailability: number; // 0-1
  legacySystemCount: number;
}

export interface OrganizationMetrics {
  changeReadinessScore: number; // 0-1
  stakeholderAlignment: number; // 0-1
  resourceAvailability: number; // 0-1
  technicalCapability: number; // 0-1
  budgetAllocation: number; // 0-1
}

export interface ERPReadinessScore {
  overallScore: number; // 0-100
  readinessLevel: 'not_ready' | 'needs_improvement' | 'partially_ready' | 'ready' | 'highly_ready';
  categoryScores: {
    dataReadiness: CategoryScore;
    processReadiness: CategoryScore;
    technicalReadiness: CategoryScore;
    organizationalReadiness: CategoryScore;
  };
  strengths: string[];
  weaknesses: string[];
  criticalGaps: string[];
  riskFactors: RiskFactor[];
  estimatedTimeline: string;
  recommendedERPTypes: ERPRecommendation[];
}

export interface CategoryScore {
  score: number;
  maxScore: number;
  percentage: number;
  status: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
  details: ScoreDetail[];
}

export interface ScoreDetail {
  criterion: string;
  score: number;
  maxScore: number;
  status: string;
  recommendation?: string;
}

export interface RiskFactor {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigationStrategy: string;
  estimatedImpact: string;
}

export interface ERPRecommendation {
  type: string;
  name: string;
  fitScore: number;
  pros: string[];
  cons: string[];
  implementationComplexity: 'low' | 'medium' | 'high';
  estimatedCost: string;
}

// Category weights
const CATEGORY_WEIGHTS = {
  dataReadiness: 0.30,
  processReadiness: 0.25,
  technicalReadiness: 0.20,
  organizationalReadiness: 0.25,
};

// Scoring thresholds
const STATUS_THRESHOLDS = {
  critical: 20,
  poor: 40,
  fair: 60,
  good: 80,
  excellent: 100,
};

/**
 * Calculate ERP readiness score
 */
export async function calculateERPReadiness(input: ERPReadinessInput): Promise<ERPReadinessScore> {
  const { dataQualityMetrics, processMetrics, systemMetrics, organizationMetrics } = input;

  // Calculate category scores
  const dataReadiness = calculateDataReadiness(dataQualityMetrics);
  const processReadiness = calculateProcessReadiness(processMetrics);
  const technicalReadiness = calculateTechnicalReadiness(systemMetrics);
  const organizationalReadiness = calculateOrganizationalReadiness(organizationMetrics);

  // Calculate overall score
  const overallScore = Math.round(
    dataReadiness.percentage * CATEGORY_WEIGHTS.dataReadiness +
    processReadiness.percentage * CATEGORY_WEIGHTS.processReadiness +
    technicalReadiness.percentage * CATEGORY_WEIGHTS.technicalReadiness +
    organizationalReadiness.percentage * CATEGORY_WEIGHTS.organizationalReadiness
  );

  // Determine readiness level
  const readinessLevel = getReadinessLevel(overallScore);

  // Identify strengths and weaknesses
  const { strengths, weaknesses, criticalGaps } = analyzeStrengthsAndWeaknesses(
    dataReadiness,
    processReadiness,
    technicalReadiness,
    organizationalReadiness
  );

  // Assess risks
  const riskFactors = assessRisks(input, overallScore);

  // Estimate timeline
  const estimatedTimeline = estimateImplementationTimeline(overallScore, riskFactors);

  // Recommend ERP types
  const recommendedERPTypes = recommendERPTypes(input, overallScore);

  return {
    overallScore,
    readinessLevel,
    categoryScores: {
      dataReadiness,
      processReadiness,
      technicalReadiness,
      organizationalReadiness,
    },
    strengths,
    weaknesses,
    criticalGaps,
    riskFactors,
    estimatedTimeline,
    recommendedERPTypes,
  };
}

/**
 * Calculate data readiness score
 */
function calculateDataReadiness(metrics: DataQualityMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Completeness (20 points)
  const completenessScore = Math.round(metrics.completenessScore * 20);
  details.push({
    criterion: 'Data Completeness',
    score: completenessScore,
    maxScore: 20,
    status: getStatus(completenessScore / 20 * 100),
    recommendation: completenessScore < 15 ? 'Fill in missing required fields in master data' : undefined,
  });
  totalScore += completenessScore;

  // Accuracy (20 points)
  const accuracyScore = Math.round(metrics.accuracyScore * 20);
  details.push({
    criterion: 'Data Accuracy',
    score: accuracyScore,
    maxScore: 20,
    status: getStatus(accuracyScore / 20 * 100),
    recommendation: accuracyScore < 15 ? 'Implement data validation and cleansing processes' : undefined,
  });
  totalScore += accuracyScore;

  // Consistency (15 points)
  const consistencyScore = Math.round(metrics.consistencyScore * 15);
  details.push({
    criterion: 'Data Consistency',
    score: consistencyScore,
    maxScore: 15,
    status: getStatus(consistencyScore / 15 * 100),
    recommendation: consistencyScore < 12 ? 'Standardize data formats across systems' : undefined,
  });
  totalScore += consistencyScore;

  // Duplicate Rate (15 points, inverted)
  const duplicateScore = Math.round((1 - metrics.duplicateRate) * 15);
  details.push({
    criterion: 'Duplicate Management',
    score: duplicateScore,
    maxScore: 15,
    status: getStatus(duplicateScore / 15 * 100),
    recommendation: duplicateScore < 12 ? 'Run deduplication before ERP migration' : undefined,
  });
  totalScore += duplicateScore;

  // Standardization (15 points)
  const standardizationScore = Math.round(metrics.standardizationLevel * 15);
  details.push({
    criterion: 'Standardization Level',
    score: standardizationScore,
    maxScore: 15,
    status: getStatus(standardizationScore / 15 * 100),
    recommendation: standardizationScore < 12 ? 'Apply industry-standard coding schemes' : undefined,
  });
  totalScore += standardizationScore;

  // Master Data Coverage (15 points)
  const masterDataScore = Math.round(metrics.masterDataCoverage * 15);
  details.push({
    criterion: 'Master Data Coverage',
    score: masterDataScore,
    maxScore: 15,
    status: getStatus(masterDataScore / 15 * 100),
    recommendation: masterDataScore < 12 ? 'Identify and document all master data entities' : undefined,
  });
  totalScore += masterDataScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getStatus(percentage),
    details,
  };
}

/**
 * Calculate process readiness score
 */
function calculateProcessReadiness(metrics: ProcessMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Documentation coverage (25 points)
  const docCoverage = metrics.totalProcesses > 0
    ? metrics.documentedProcesses / metrics.totalProcesses
    : 0;
  const docScore = Math.round(docCoverage * 25);
  details.push({
    criterion: 'Process Documentation',
    score: docScore,
    maxScore: 25,
    status: getStatus(docScore / 25 * 100),
    recommendation: docScore < 20 ? 'Document critical business processes' : undefined,
  });
  totalScore += docScore;

  // Standardization (25 points)
  const standardScore = Math.round(metrics.processStandardization * 25);
  details.push({
    criterion: 'Process Standardization',
    score: standardScore,
    maxScore: 25,
    status: getStatus(standardScore / 25 * 100),
    recommendation: standardScore < 20 ? 'Standardize processes before ERP implementation' : undefined,
  });
  totalScore += standardScore;

  // Automation level (20 points)
  const autoScore = Math.round(metrics.automationLevel * 20);
  details.push({
    criterion: 'Automation Level',
    score: autoScore,
    maxScore: 20,
    status: getStatus(autoScore / 20 * 100),
    recommendation: autoScore < 15 ? 'Identify automation opportunities' : undefined,
  });
  totalScore += autoScore;

  // Process maturity (20 points)
  const maturityScore = Math.round((metrics.processMaturityLevel / 5) * 20);
  details.push({
    criterion: 'Process Maturity',
    score: maturityScore,
    maxScore: 20,
    status: getStatus(maturityScore / 20 * 100),
    recommendation: maturityScore < 15 ? 'Improve process governance and optimization' : undefined,
  });
  totalScore += maturityScore;

  // Bottleneck factor (10 points, inverted)
  const bottleneckPenalty = Math.min(10, metrics.bottleneckCount * 2);
  const bottleneckScore = 10 - bottleneckPenalty;
  details.push({
    criterion: 'Bottleneck Resolution',
    score: bottleneckScore,
    maxScore: 10,
    status: getStatus(bottleneckScore / 10 * 100),
    recommendation: bottleneckScore < 8 ? 'Address process bottlenecks before migration' : undefined,
  });
  totalScore += bottleneckScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getStatus(percentage),
    details,
  };
}

/**
 * Calculate technical readiness score
 */
function calculateTechnicalReadiness(metrics: SystemMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // System integration (30 points)
  const integrationScore = Math.round(metrics.systemIntegrationLevel * 30);
  details.push({
    criterion: 'System Integration',
    score: integrationScore,
    maxScore: 30,
    status: getStatus(integrationScore / 30 * 100),
    recommendation: integrationScore < 24 ? 'Map integration points between systems' : undefined,
  });
  totalScore += integrationScore;

  // Data flow mapping (25 points)
  const dataFlowScore = Math.round(metrics.dataFlowMapping * 25);
  details.push({
    criterion: 'Data Flow Documentation',
    score: dataFlowScore,
    maxScore: 25,
    status: getStatus(dataFlowScore / 25 * 100),
    recommendation: dataFlowScore < 20 ? 'Document data flows between systems' : undefined,
  });
  totalScore += dataFlowScore;

  // API availability (25 points)
  const apiScore = Math.round(metrics.apiAvailability * 25);
  details.push({
    criterion: 'API Availability',
    score: apiScore,
    maxScore: 25,
    status: getStatus(apiScore / 25 * 100),
    recommendation: apiScore < 20 ? 'Assess API capabilities of legacy systems' : undefined,
  });
  totalScore += apiScore;

  // Legacy system factor (20 points, with penalty)
  const legacyPenalty = Math.min(15, metrics.legacySystemCount * 3);
  const legacyScore = 20 - legacyPenalty;
  details.push({
    criterion: 'Legacy System Impact',
    score: legacyScore,
    maxScore: 20,
    status: getStatus(legacyScore / 20 * 100),
    recommendation: legacyScore < 15 ? 'Plan migration strategy for legacy systems' : undefined,
  });
  totalScore += legacyScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getStatus(percentage),
    details,
  };
}

/**
 * Calculate organizational readiness score
 */
function calculateOrganizationalReadiness(metrics: OrganizationMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Change readiness (25 points)
  const changeScore = Math.round(metrics.changeReadinessScore * 25);
  details.push({
    criterion: 'Change Readiness',
    score: changeScore,
    maxScore: 25,
    status: getStatus(changeScore / 25 * 100),
    recommendation: changeScore < 20 ? 'Develop change management program' : undefined,
  });
  totalScore += changeScore;

  // Stakeholder alignment (25 points)
  const alignmentScore = Math.round(metrics.stakeholderAlignment * 25);
  details.push({
    criterion: 'Stakeholder Alignment',
    score: alignmentScore,
    maxScore: 25,
    status: getStatus(alignmentScore / 25 * 100),
    recommendation: alignmentScore < 20 ? 'Secure executive sponsorship and stakeholder buy-in' : undefined,
  });
  totalScore += alignmentScore;

  // Resource availability (20 points)
  const resourceScore = Math.round(metrics.resourceAvailability * 20);
  details.push({
    criterion: 'Resource Availability',
    score: resourceScore,
    maxScore: 20,
    status: getStatus(resourceScore / 20 * 100),
    recommendation: resourceScore < 15 ? 'Allocate dedicated project team members' : undefined,
  });
  totalScore += resourceScore;

  // Technical capability (15 points)
  const techScore = Math.round(metrics.technicalCapability * 15);
  details.push({
    criterion: 'Technical Capability',
    score: techScore,
    maxScore: 15,
    status: getStatus(techScore / 15 * 100),
    recommendation: techScore < 12 ? 'Plan training for IT team' : undefined,
  });
  totalScore += techScore;

  // Budget allocation (15 points)
  const budgetScore = Math.round(metrics.budgetAllocation * 15);
  details.push({
    criterion: 'Budget Allocation',
    score: budgetScore,
    maxScore: 15,
    status: getStatus(budgetScore / 15 * 100),
    recommendation: budgetScore < 12 ? 'Secure adequate budget for implementation' : undefined,
  });
  totalScore += budgetScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getStatus(percentage),
    details,
  };
}

/**
 * Get status from percentage
 */
function getStatus(percentage: number): 'critical' | 'poor' | 'fair' | 'good' | 'excellent' {
  if (percentage < STATUS_THRESHOLDS.critical) return 'critical';
  if (percentage < STATUS_THRESHOLDS.poor) return 'poor';
  if (percentage < STATUS_THRESHOLDS.fair) return 'fair';
  if (percentage < STATUS_THRESHOLDS.good) return 'good';
  return 'excellent';
}

/**
 * Get readiness level from overall score
 */
function getReadinessLevel(score: number): ERPReadinessScore['readinessLevel'] {
  if (score < 30) return 'not_ready';
  if (score < 50) return 'needs_improvement';
  if (score < 70) return 'partially_ready';
  if (score < 85) return 'ready';
  return 'highly_ready';
}

/**
 * Analyze strengths and weaknesses
 */
function analyzeStrengthsAndWeaknesses(
  data: CategoryScore,
  process: CategoryScore,
  technical: CategoryScore,
  organizational: CategoryScore
): { strengths: string[]; weaknesses: string[]; criticalGaps: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const criticalGaps: string[] = [];

  const categories = [
    { name: 'Data Readiness', score: data },
    { name: 'Process Readiness', score: process },
    { name: 'Technical Readiness', score: technical },
    { name: 'Organizational Readiness', score: organizational },
  ];

  categories.forEach(({ name, score }) => {
    if (score.status === 'excellent' || score.status === 'good') {
      strengths.push(`Strong ${name.toLowerCase()} (${score.percentage.toFixed(0)}%)`);
    } else if (score.status === 'poor') {
      weaknesses.push(`${name} needs improvement (${score.percentage.toFixed(0)}%)`);
    } else if (score.status === 'critical') {
      criticalGaps.push(`${name} is critically low (${score.percentage.toFixed(0)}%)`);
    }

    // Add detail-level analysis
    score.details.forEach((detail) => {
      if (detail.status === 'excellent') {
        strengths.push(`${detail.criterion}: ${detail.score}/${detail.maxScore}`);
      } else if (detail.status === 'critical' && detail.recommendation) {
        criticalGaps.push(detail.recommendation);
      }
    });
  });

  return { strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 5), criticalGaps: criticalGaps.slice(0, 5) };
}

/**
 * Assess risks
 */
function assessRisks(input: ERPReadinessInput, overallScore: number): RiskFactor[] {
  const risks: RiskFactor[] = [];

  // Data quality risk
  if (input.dataQualityMetrics.duplicateRate > 0.1) {
    risks.push({
      category: 'Data Quality',
      description: `High duplicate rate (${(input.dataQualityMetrics.duplicateRate * 100).toFixed(0)}%) may cause data migration issues`,
      severity: input.dataQualityMetrics.duplicateRate > 0.2 ? 'critical' : 'high',
      mitigationStrategy: 'Run comprehensive deduplication before migration',
      estimatedImpact: 'Could delay migration by 2-4 weeks',
    });
  }

  // Process documentation risk
  const docRate = input.processMetrics.documentedProcesses / Math.max(1, input.processMetrics.totalProcesses);
  if (docRate < 0.5) {
    risks.push({
      category: 'Process',
      description: `Only ${(docRate * 100).toFixed(0)}% of processes are documented`,
      severity: docRate < 0.3 ? 'critical' : 'high',
      mitigationStrategy: 'Conduct rapid process documentation workshops',
      estimatedImpact: 'Could lead to gaps in ERP configuration',
    });
  }

  // Legacy system risk
  if (input.systemMetrics.legacySystemCount > 3) {
    risks.push({
      category: 'Technical',
      description: `${input.systemMetrics.legacySystemCount} legacy systems require integration`,
      severity: input.systemMetrics.legacySystemCount > 5 ? 'high' : 'medium',
      mitigationStrategy: 'Develop legacy system migration roadmap',
      estimatedImpact: 'May require custom integration development',
    });
  }

  // Change management risk
  if (input.organizationMetrics.changeReadinessScore < 0.5) {
    risks.push({
      category: 'Organizational',
      description: 'Low change readiness may lead to user adoption issues',
      severity: input.organizationMetrics.changeReadinessScore < 0.3 ? 'critical' : 'high',
      mitigationStrategy: 'Implement comprehensive change management program',
      estimatedImpact: 'Could affect ROI and adoption rates',
    });
  }

  // Budget risk
  if (input.organizationMetrics.budgetAllocation < 0.5) {
    risks.push({
      category: 'Financial',
      description: 'Insufficient budget allocation may limit implementation scope',
      severity: 'medium',
      mitigationStrategy: 'Review budget with realistic cost estimates',
      estimatedImpact: 'May require phased implementation approach',
    });
  }

  return risks.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Estimate implementation timeline
 */
function estimateImplementationTimeline(overallScore: number, risks: RiskFactor[]): string {
  let baseMonths: number;

  if (overallScore >= 85) {
    baseMonths = 6;
  } else if (overallScore >= 70) {
    baseMonths = 9;
  } else if (overallScore >= 50) {
    baseMonths = 12;
  } else if (overallScore >= 30) {
    baseMonths = 18;
  } else {
    baseMonths = 24;
  }

  // Add time for critical risks
  const criticalRisks = risks.filter((r) => r.severity === 'critical').length;
  const highRisks = risks.filter((r) => r.severity === 'high').length;

  baseMonths += criticalRisks * 3;
  baseMonths += highRisks * 1.5;

  if (baseMonths <= 6) {
    return '4-6 months';
  } else if (baseMonths <= 9) {
    return '6-9 months';
  } else if (baseMonths <= 12) {
    return '9-12 months';
  } else if (baseMonths <= 18) {
    return '12-18 months';
  } else {
    return '18-24+ months';
  }
}

/**
 * Recommend ERP types based on assessment
 */
function recommendERPTypes(input: ERPReadinessInput, overallScore: number): ERPRecommendation[] {
  const recommendations: ERPRecommendation[] = [];

  // SAP Business One - for SMBs with good data quality
  if (input.dataQualityMetrics.completenessScore > 0.7) {
    recommendations.push({
      type: 'On-Premise',
      name: 'SAP Business One',
      fitScore: calculateFitScore(input, 'sapb1'),
      pros: [
        'Strong DACH market presence',
        'Comprehensive localization',
        'Robust financial modules',
      ],
      cons: [
        'Higher initial cost',
        'Requires partner implementation',
        'Complex customization',
      ],
      implementationComplexity: 'medium',
      estimatedCost: '€50,000 - €150,000',
    });
  }

  // Odoo - for flexible, growing companies
  recommendations.push({
    type: 'Cloud/On-Premise',
    name: 'Odoo',
    fitScore: calculateFitScore(input, 'odoo'),
    pros: [
      'Modular and flexible',
      'Lower initial cost',
      'Open source option',
      'Good for customization',
    ],
    cons: [
      'May require more customization',
      'Community support varies',
      'Less DACH-specific features',
    ],
    implementationComplexity: overallScore > 70 ? 'low' : 'medium',
    estimatedCost: '€20,000 - €80,000',
  });

  // Microsoft Dynamics 365 - for Microsoft-centric organizations
  if (input.systemMetrics.connectedSystems > 3 || input.organizationMetrics.technicalCapability > 0.6) {
    recommendations.push({
      type: 'Cloud',
      name: 'Microsoft Dynamics 365',
      fitScore: calculateFitScore(input, 'dynamics'),
      pros: [
        'Strong Microsoft integration',
        'Modern cloud architecture',
        'AI capabilities built-in',
        'Familiar interface',
      ],
      cons: [
        'Subscription costs add up',
        'Complex licensing',
        'May be overkill for smaller orgs',
      ],
      implementationComplexity: 'high',
      estimatedCost: '€80,000 - €250,000',
    });
  }

  return recommendations.sort((a, b) => b.fitScore - a.fitScore);
}

/**
 * Calculate fit score for specific ERP
 */
function calculateFitScore(input: ERPReadinessInput, erpType: string): number {
  let score = 50; // Base score

  switch (erpType) {
    case 'sapb1':
      score += input.dataQualityMetrics.completenessScore * 15;
      score += input.processMetrics.processStandardization * 15;
      score += (1 - input.organizationMetrics.changeReadinessScore) * -10; // SAP needs change readiness
      break;
    case 'odoo':
      score += input.organizationMetrics.technicalCapability * 20;
      score += (1 - input.processMetrics.processStandardization) * 10; // Odoo handles non-standard well
      score += input.organizationMetrics.budgetAllocation < 0.5 ? 15 : 0; // Cost effective
      break;
    case 'dynamics':
      score += input.systemMetrics.apiAvailability * 15;
      score += input.organizationMetrics.technicalCapability * 15;
      score += input.systemMetrics.connectedSystems > 5 ? 10 : 0;
      break;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

export default {
  calculateERPReadiness,
};
