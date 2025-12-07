/**
 * AI Readiness Scoring Model
 * Evaluates organization's readiness for AI/ML implementation
 */

export interface AIReadinessInput {
  organizationId: string;
  dataMetrics: AIDataMetrics;
  infrastructureMetrics: InfrastructureMetrics;
  talentMetrics: TalentMetrics;
  strategyMetrics: StrategyMetrics;
  governanceMetrics: GovernanceMetrics;
}

export interface AIDataMetrics {
  dataVolume: 'low' | 'medium' | 'high' | 'very_high';
  dataVariety: number; // Number of different data types
  dataVelocity: 'batch' | 'near_real_time' | 'real_time';
  dataQualityScore: number; // 0-1
  labeledDataAvailability: number; // 0-1
  historicalDataDepth: number; // Years of historical data
  dataAccessibility: number; // 0-1, how easily accessible is data
  privacyCompliance: number; // 0-1, GDPR etc.
}

export interface InfrastructureMetrics {
  cloudAdoption: 'none' | 'partial' | 'cloud_first' | 'fully_cloud';
  computeCapacity: 'limited' | 'adequate' | 'scalable';
  mlPlatformAvailable: boolean;
  dataLakeExists: boolean;
  apiInfrastructure: number; // 0-1
  cicdMaturity: number; // 0-1
  monitoringCapability: number; // 0-1
}

export interface TalentMetrics {
  dataScientists: number;
  mlEngineers: number;
  dataEngineers: number;
  domainExperts: number;
  aiLiteracyLevel: number; // 0-1, organization-wide
  trainingBudget: 'none' | 'limited' | 'adequate' | 'generous';
  partnerEcosystem: boolean; // Access to AI consultants/partners
}

export interface StrategyMetrics {
  aiStrategyDefined: boolean;
  executiveSponsor: boolean;
  useCasesIdentified: number;
  pilotProjectsCompleted: number;
  successMetricsDefined: boolean;
  ethicsGuidelinesExist: boolean;
  budgetAllocated: number; // 0-1, relative to needs
}

export interface GovernanceMetrics {
  dataGovernanceMaturity: number; // 0-1
  modelGovernanceExists: boolean;
  biasMitigationProcess: boolean;
  explainabilityRequirements: boolean;
  auditTrailCapability: number; // 0-1
  regulatoryAwareness: number; // 0-1
}

export interface AIReadinessScore {
  overallScore: number; // 0-100
  readinessLevel: 'nascent' | 'emerging' | 'developing' | 'maturing' | 'leading';
  categoryScores: {
    dataFoundation: CategoryScore;
    technicalInfrastructure: CategoryScore;
    talentAndCulture: CategoryScore;
    strategyAndVision: CategoryScore;
    governanceAndEthics: CategoryScore;
  };
  strengths: string[];
  gaps: string[];
  prioritizedRecommendations: Recommendation[];
  aiUseCaseSuitability: UseCaseSuitability[];
  estimatedTimeToValue: string;
  investmentGuidance: InvestmentGuidance;
}

export interface CategoryScore {
  score: number;
  maxScore: number;
  percentage: number;
  status: 'nascent' | 'emerging' | 'developing' | 'maturing' | 'leading';
  details: ScoreDetail[];
}

export interface ScoreDetail {
  criterion: string;
  score: number;
  maxScore: number;
  status: string;
  recommendation?: string;
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  estimatedEffort: string;
  expectedOutcome: string;
  dependencies?: string[];
}

export interface UseCaseSuitability {
  useCase: string;
  category: 'automation' | 'analytics' | 'prediction' | 'generation' | 'optimization';
  suitabilityScore: number; // 0-100
  readinessStatus: 'ready' | 'near_ready' | 'preparation_needed' | 'significant_gaps';
  requiredCapabilities: string[];
  potentialValue: 'low' | 'medium' | 'high' | 'transformative';
  implementationComplexity: 'low' | 'medium' | 'high';
}

export interface InvestmentGuidance {
  recommendedBudgetRange: string;
  phaseBreakdown: PhaseInvestment[];
  quickWins: string[];
  longTermInitiatives: string[];
}

export interface PhaseInvestment {
  phase: string;
  duration: string;
  focus: string;
  estimatedCost: string;
  expectedOutcomes: string[];
}

// Category weights for AI readiness
const AI_CATEGORY_WEIGHTS = {
  dataFoundation: 0.30,
  technicalInfrastructure: 0.20,
  talentAndCulture: 0.20,
  strategyAndVision: 0.15,
  governanceAndEthics: 0.15,
};

/**
 * Calculate AI readiness score
 */
export async function calculateAIReadiness(input: AIReadinessInput): Promise<AIReadinessScore> {
  // Calculate category scores
  const dataFoundation = calculateDataFoundation(input.dataMetrics);
  const technicalInfrastructure = calculateTechnicalInfrastructure(input.infrastructureMetrics);
  const talentAndCulture = calculateTalentAndCulture(input.talentMetrics);
  const strategyAndVision = calculateStrategyAndVision(input.strategyMetrics);
  const governanceAndEthics = calculateGovernanceAndEthics(input.governanceMetrics);

  // Calculate overall score
  const overallScore = Math.round(
    dataFoundation.percentage * AI_CATEGORY_WEIGHTS.dataFoundation +
    technicalInfrastructure.percentage * AI_CATEGORY_WEIGHTS.technicalInfrastructure +
    talentAndCulture.percentage * AI_CATEGORY_WEIGHTS.talentAndCulture +
    strategyAndVision.percentage * AI_CATEGORY_WEIGHTS.strategyAndVision +
    governanceAndEthics.percentage * AI_CATEGORY_WEIGHTS.governanceAndEthics
  );

  // Determine readiness level
  const readinessLevel = getAIReadinessLevel(overallScore);

  // Identify strengths and gaps
  const { strengths, gaps } = analyzeAIStrengthsAndGaps(
    dataFoundation,
    technicalInfrastructure,
    talentAndCulture,
    strategyAndVision,
    governanceAndEthics
  );

  // Generate recommendations
  const prioritizedRecommendations = generateAIRecommendations(input, overallScore);

  // Assess use case suitability
  const aiUseCaseSuitability = assessUseCaseSuitability(input, overallScore);

  // Estimate time to value
  const estimatedTimeToValue = estimateTimeToValue(overallScore, input);

  // Investment guidance
  const investmentGuidance = generateInvestmentGuidance(input, overallScore);

  return {
    overallScore,
    readinessLevel,
    categoryScores: {
      dataFoundation,
      technicalInfrastructure,
      talentAndCulture,
      strategyAndVision,
      governanceAndEthics,
    },
    strengths,
    gaps,
    prioritizedRecommendations,
    aiUseCaseSuitability,
    estimatedTimeToValue,
    investmentGuidance,
  };
}

/**
 * Calculate data foundation score
 */
function calculateDataFoundation(metrics: AIDataMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Data volume (15 points)
  const volumeScores: Record<string, number> = { low: 5, medium: 10, high: 13, very_high: 15 };
  const volumeScore = volumeScores[metrics.dataVolume];
  details.push({
    criterion: 'Data Volume',
    score: volumeScore,
    maxScore: 15,
    status: getAIStatus(volumeScore / 15 * 100),
    recommendation: volumeScore < 10 ? 'Accumulate more training data' : undefined,
  });
  totalScore += volumeScore;

  // Data quality (20 points)
  const qualityScore = Math.round(metrics.dataQualityScore * 20);
  details.push({
    criterion: 'Data Quality',
    score: qualityScore,
    maxScore: 20,
    status: getAIStatus(qualityScore / 20 * 100),
    recommendation: qualityScore < 15 ? 'Improve data quality for ML training' : undefined,
  });
  totalScore += qualityScore;

  // Labeled data (20 points)
  const labeledScore = Math.round(metrics.labeledDataAvailability * 20);
  details.push({
    criterion: 'Labeled Data Availability',
    score: labeledScore,
    maxScore: 20,
    status: getAIStatus(labeledScore / 20 * 100),
    recommendation: labeledScore < 15 ? 'Invest in data labeling initiatives' : undefined,
  });
  totalScore += labeledScore;

  // Historical depth (15 points)
  const historyScore = Math.min(15, metrics.historicalDataDepth * 3);
  details.push({
    criterion: 'Historical Data Depth',
    score: Math.round(historyScore),
    maxScore: 15,
    status: getAIStatus(historyScore / 15 * 100),
    recommendation: historyScore < 10 ? 'Preserve historical data for trend analysis' : undefined,
  });
  totalScore += historyScore;

  // Accessibility (15 points)
  const accessScore = Math.round(metrics.dataAccessibility * 15);
  details.push({
    criterion: 'Data Accessibility',
    score: accessScore,
    maxScore: 15,
    status: getAIStatus(accessScore / 15 * 100),
    recommendation: accessScore < 12 ? 'Improve data democratization' : undefined,
  });
  totalScore += accessScore;

  // Privacy compliance (15 points)
  const privacyScore = Math.round(metrics.privacyCompliance * 15);
  details.push({
    criterion: 'Privacy Compliance',
    score: privacyScore,
    maxScore: 15,
    status: getAIStatus(privacyScore / 15 * 100),
    recommendation: privacyScore < 12 ? 'Strengthen data privacy controls' : undefined,
  });
  totalScore += privacyScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getAIStatus(percentage),
    details,
  };
}

/**
 * Calculate technical infrastructure score
 */
function calculateTechnicalInfrastructure(metrics: InfrastructureMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Cloud adoption (25 points)
  const cloudScores: Record<string, number> = { none: 5, partial: 12, cloud_first: 20, fully_cloud: 25 };
  const cloudScore = cloudScores[metrics.cloudAdoption];
  details.push({
    criterion: 'Cloud Adoption',
    score: cloudScore,
    maxScore: 25,
    status: getAIStatus(cloudScore / 25 * 100),
    recommendation: cloudScore < 15 ? 'Accelerate cloud migration for AI workloads' : undefined,
  });
  totalScore += cloudScore;

  // Compute capacity (20 points)
  const computeScores: Record<string, number> = { limited: 5, adequate: 12, scalable: 20 };
  const computeScore = computeScores[metrics.computeCapacity];
  details.push({
    criterion: 'Compute Capacity',
    score: computeScore,
    maxScore: 20,
    status: getAIStatus(computeScore / 20 * 100),
    recommendation: computeScore < 12 ? 'Expand compute resources for ML training' : undefined,
  });
  totalScore += computeScore;

  // ML platform (20 points)
  const mlPlatformScore = metrics.mlPlatformAvailable ? 20 : 5;
  details.push({
    criterion: 'ML Platform',
    score: mlPlatformScore,
    maxScore: 20,
    status: getAIStatus(mlPlatformScore / 20 * 100),
    recommendation: mlPlatformScore < 15 ? 'Implement MLOps platform' : undefined,
  });
  totalScore += mlPlatformScore;

  // Data lake (15 points)
  const dataLakeScore = metrics.dataLakeExists ? 15 : 3;
  details.push({
    criterion: 'Data Lake/Warehouse',
    score: dataLakeScore,
    maxScore: 15,
    status: getAIStatus(dataLakeScore / 15 * 100),
    recommendation: dataLakeScore < 10 ? 'Establish centralized data lake' : undefined,
  });
  totalScore += dataLakeScore;

  // CI/CD maturity (10 points)
  const cicdScore = Math.round(metrics.cicdMaturity * 10);
  details.push({
    criterion: 'CI/CD Maturity',
    score: cicdScore,
    maxScore: 10,
    status: getAIStatus(cicdScore / 10 * 100),
    recommendation: cicdScore < 7 ? 'Mature ML pipeline automation' : undefined,
  });
  totalScore += cicdScore;

  // Monitoring (10 points)
  const monitoringScore = Math.round(metrics.monitoringCapability * 10);
  details.push({
    criterion: 'Monitoring Capability',
    score: monitoringScore,
    maxScore: 10,
    status: getAIStatus(monitoringScore / 10 * 100),
    recommendation: monitoringScore < 7 ? 'Implement model monitoring' : undefined,
  });
  totalScore += monitoringScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getAIStatus(percentage),
    details,
  };
}

/**
 * Calculate talent and culture score
 */
function calculateTalentAndCulture(metrics: TalentMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Data science team (30 points)
  const teamSize = metrics.dataScientists + metrics.mlEngineers;
  const teamScore = Math.min(30, teamSize * 6);
  details.push({
    criterion: 'Data Science Team Size',
    score: teamScore,
    maxScore: 30,
    status: getAIStatus(teamScore / 30 * 100),
    recommendation: teamScore < 20 ? 'Hire data scientists and ML engineers' : undefined,
  });
  totalScore += teamScore;

  // Data engineers (20 points)
  const engScore = Math.min(20, metrics.dataEngineers * 5);
  details.push({
    criterion: 'Data Engineering Capacity',
    score: engScore,
    maxScore: 20,
    status: getAIStatus(engScore / 20 * 100),
    recommendation: engScore < 15 ? 'Build data engineering capability' : undefined,
  });
  totalScore += engScore;

  // Domain experts (15 points)
  const domainScore = Math.min(15, metrics.domainExperts * 3);
  details.push({
    criterion: 'Domain Expertise',
    score: domainScore,
    maxScore: 15,
    status: getAIStatus(domainScore / 15 * 100),
    recommendation: domainScore < 10 ? 'Involve domain experts in AI projects' : undefined,
  });
  totalScore += domainScore;

  // AI literacy (20 points)
  const literacyScore = Math.round(metrics.aiLiteracyLevel * 20);
  details.push({
    criterion: 'Organization AI Literacy',
    score: literacyScore,
    maxScore: 20,
    status: getAIStatus(literacyScore / 20 * 100),
    recommendation: literacyScore < 15 ? 'Launch AI awareness programs' : undefined,
  });
  totalScore += literacyScore;

  // Training budget (15 points)
  const budgetScores: Record<string, number> = { none: 2, limited: 6, adequate: 12, generous: 15 };
  const trainingScore = budgetScores[metrics.trainingBudget];
  details.push({
    criterion: 'Training Investment',
    score: trainingScore,
    maxScore: 15,
    status: getAIStatus(trainingScore / 15 * 100),
    recommendation: trainingScore < 10 ? 'Increase AI training budget' : undefined,
  });
  totalScore += trainingScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getAIStatus(percentage),
    details,
  };
}

/**
 * Calculate strategy and vision score
 */
function calculateStrategyAndVision(metrics: StrategyMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // AI strategy (25 points)
  const strategyScore = metrics.aiStrategyDefined ? 25 : 5;
  details.push({
    criterion: 'AI Strategy Defined',
    score: strategyScore,
    maxScore: 25,
    status: getAIStatus(strategyScore / 25 * 100),
    recommendation: strategyScore < 15 ? 'Develop comprehensive AI strategy' : undefined,
  });
  totalScore += strategyScore;

  // Executive sponsor (20 points)
  const sponsorScore = metrics.executiveSponsor ? 20 : 3;
  details.push({
    criterion: 'Executive Sponsorship',
    score: sponsorScore,
    maxScore: 20,
    status: getAIStatus(sponsorScore / 20 * 100),
    recommendation: sponsorScore < 15 ? 'Secure C-level AI sponsor' : undefined,
  });
  totalScore += sponsorScore;

  // Use cases identified (20 points)
  const useCaseScore = Math.min(20, metrics.useCasesIdentified * 4);
  details.push({
    criterion: 'Use Cases Identified',
    score: useCaseScore,
    maxScore: 20,
    status: getAIStatus(useCaseScore / 20 * 100),
    recommendation: useCaseScore < 15 ? 'Identify high-value AI use cases' : undefined,
  });
  totalScore += useCaseScore;

  // Pilot experience (20 points)
  const pilotScore = Math.min(20, metrics.pilotProjectsCompleted * 5);
  details.push({
    criterion: 'Pilot Experience',
    score: pilotScore,
    maxScore: 20,
    status: getAIStatus(pilotScore / 20 * 100),
    recommendation: pilotScore < 10 ? 'Run AI pilot projects' : undefined,
  });
  totalScore += pilotScore;

  // Budget allocated (15 points)
  const budgetScore = Math.round(metrics.budgetAllocated * 15);
  details.push({
    criterion: 'Budget Allocation',
    score: budgetScore,
    maxScore: 15,
    status: getAIStatus(budgetScore / 15 * 100),
    recommendation: budgetScore < 10 ? 'Allocate dedicated AI budget' : undefined,
  });
  totalScore += budgetScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getAIStatus(percentage),
    details,
  };
}

/**
 * Calculate governance and ethics score
 */
function calculateGovernanceAndEthics(metrics: GovernanceMetrics): CategoryScore {
  const details: ScoreDetail[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // Data governance (25 points)
  const govScore = Math.round(metrics.dataGovernanceMaturity * 25);
  details.push({
    criterion: 'Data Governance',
    score: govScore,
    maxScore: 25,
    status: getAIStatus(govScore / 25 * 100),
    recommendation: govScore < 18 ? 'Strengthen data governance framework' : undefined,
  });
  totalScore += govScore;

  // Model governance (20 points)
  const modelGovScore = metrics.modelGovernanceExists ? 20 : 5;
  details.push({
    criterion: 'Model Governance',
    score: modelGovScore,
    maxScore: 20,
    status: getAIStatus(modelGovScore / 20 * 100),
    recommendation: modelGovScore < 15 ? 'Implement model governance processes' : undefined,
  });
  totalScore += modelGovScore;

  // Bias mitigation (20 points)
  const biasScore = metrics.biasMitigationProcess ? 20 : 5;
  details.push({
    criterion: 'Bias Mitigation',
    score: biasScore,
    maxScore: 20,
    status: getAIStatus(biasScore / 20 * 100),
    recommendation: biasScore < 15 ? 'Establish bias detection and mitigation' : undefined,
  });
  totalScore += biasScore;

  // Audit trail (20 points)
  const auditScore = Math.round(metrics.auditTrailCapability * 20);
  details.push({
    criterion: 'Audit Trail Capability',
    score: auditScore,
    maxScore: 20,
    status: getAIStatus(auditScore / 20 * 100),
    recommendation: auditScore < 15 ? 'Implement ML audit logging' : undefined,
  });
  totalScore += auditScore;

  // Regulatory awareness (15 points)
  const regScore = Math.round(metrics.regulatoryAwareness * 15);
  details.push({
    criterion: 'Regulatory Awareness',
    score: regScore,
    maxScore: 15,
    status: getAIStatus(regScore / 15 * 100),
    recommendation: regScore < 10 ? 'Monitor AI regulations (EU AI Act, etc.)' : undefined,
  });
  totalScore += regScore;

  const percentage = (totalScore / maxScore) * 100;

  return {
    score: totalScore,
    maxScore,
    percentage,
    status: getAIStatus(percentage),
    details,
  };
}

function getAIStatus(percentage: number): 'nascent' | 'emerging' | 'developing' | 'maturing' | 'leading' {
  if (percentage < 20) return 'nascent';
  if (percentage < 40) return 'emerging';
  if (percentage < 60) return 'developing';
  if (percentage < 80) return 'maturing';
  return 'leading';
}

function getAIReadinessLevel(score: number): AIReadinessScore['readinessLevel'] {
  if (score < 20) return 'nascent';
  if (score < 40) return 'emerging';
  if (score < 60) return 'developing';
  if (score < 80) return 'maturing';
  return 'leading';
}

function analyzeAIStrengthsAndGaps(
  data: CategoryScore,
  infra: CategoryScore,
  talent: CategoryScore,
  strategy: CategoryScore,
  governance: CategoryScore
): { strengths: string[]; gaps: string[] } {
  const strengths: string[] = [];
  const gaps: string[] = [];

  const categories = [
    { name: 'Data Foundation', score: data },
    { name: 'Technical Infrastructure', score: infra },
    { name: 'Talent & Culture', score: talent },
    { name: 'Strategy & Vision', score: strategy },
    { name: 'Governance & Ethics', score: governance },
  ];

  categories.forEach(({ name, score }) => {
    if (score.status === 'leading' || score.status === 'maturing') {
      strengths.push(`${name}: ${score.percentage.toFixed(0)}%`);
    } else if (score.status === 'nascent' || score.status === 'emerging') {
      gaps.push(`${name} needs development (${score.percentage.toFixed(0)}%)`);
    }
  });

  return { strengths: strengths.slice(0, 5), gaps: gaps.slice(0, 5) };
}

function generateAIRecommendations(input: AIReadinessInput, overallScore: number): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Data recommendations
  if (input.dataMetrics.dataQualityScore < 0.7) {
    recommendations.push({
      priority: 'critical',
      category: 'Data',
      title: 'Improve Data Quality',
      description: 'Implement data quality framework with validation rules and cleansing pipelines',
      estimatedEffort: '2-3 months',
      expectedOutcome: 'Higher accuracy ML models and reliable insights',
    });
  }

  // Infrastructure recommendations
  if (!input.infrastructureMetrics.mlPlatformAvailable) {
    recommendations.push({
      priority: 'high',
      category: 'Infrastructure',
      title: 'Implement MLOps Platform',
      description: 'Deploy ML platform for model development, training, and deployment',
      estimatedEffort: '3-4 months',
      expectedOutcome: 'Faster model iteration and reliable deployments',
      dependencies: ['Cloud adoption', 'Data lake'],
    });
  }

  // Talent recommendations
  const teamSize = input.talentMetrics.dataScientists + input.talentMetrics.mlEngineers;
  if (teamSize < 2) {
    recommendations.push({
      priority: 'critical',
      category: 'Talent',
      title: 'Build AI Team',
      description: 'Hire data scientists and ML engineers or partner with AI consultancy',
      estimatedEffort: '3-6 months',
      expectedOutcome: 'Capability to execute AI projects',
    });
  }

  // Strategy recommendations
  if (!input.strategyMetrics.aiStrategyDefined) {
    recommendations.push({
      priority: 'high',
      category: 'Strategy',
      title: 'Develop AI Strategy',
      description: 'Create roadmap with prioritized use cases, success metrics, and governance',
      estimatedEffort: '1-2 months',
      expectedOutcome: 'Aligned AI investments and clear direction',
    });
  }

  // Governance recommendations
  if (!input.governanceMetrics.modelGovernanceExists) {
    recommendations.push({
      priority: 'medium',
      category: 'Governance',
      title: 'Establish Model Governance',
      description: 'Define model lifecycle management, version control, and monitoring',
      estimatedEffort: '2-3 months',
      expectedOutcome: 'Reliable and compliant AI systems',
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function assessUseCaseSuitability(input: AIReadinessInput, overallScore: number): UseCaseSuitability[] {
  const useCases: UseCaseSuitability[] = [];

  // Process automation
  useCases.push({
    useCase: 'Document Processing & Extraction',
    category: 'automation',
    suitabilityScore: calculateUseCaseFit(input, 'automation'),
    readinessStatus: overallScore > 60 ? 'ready' : overallScore > 40 ? 'near_ready' : 'preparation_needed',
    requiredCapabilities: ['OCR capability', 'Training data', 'Integration APIs'],
    potentialValue: 'high',
    implementationComplexity: 'medium',
  });

  // Predictive analytics
  useCases.push({
    useCase: 'Demand Forecasting',
    category: 'prediction',
    suitabilityScore: calculateUseCaseFit(input, 'prediction'),
    readinessStatus: input.dataMetrics.historicalDataDepth >= 2 && overallScore > 50 ? 'ready' : 'preparation_needed',
    requiredCapabilities: ['Historical sales data', 'ML platform', 'Domain expertise'],
    potentialValue: 'transformative',
    implementationComplexity: 'medium',
  });

  // Anomaly detection
  useCases.push({
    useCase: 'Fraud Detection',
    category: 'analytics',
    suitabilityScore: calculateUseCaseFit(input, 'analytics'),
    readinessStatus: input.dataMetrics.labeledDataAvailability > 0.5 ? 'near_ready' : 'significant_gaps',
    requiredCapabilities: ['Labeled fraud data', 'Real-time processing', 'Model monitoring'],
    potentialValue: 'high',
    implementationComplexity: 'high',
  });

  // Gen AI
  useCases.push({
    useCase: 'Customer Service Chatbot',
    category: 'generation',
    suitabilityScore: calculateUseCaseFit(input, 'generation'),
    readinessStatus: overallScore > 40 ? 'near_ready' : 'preparation_needed',
    requiredCapabilities: ['Knowledge base', 'LLM integration', 'Conversation data'],
    potentialValue: 'medium',
    implementationComplexity: 'medium',
  });

  return useCases.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
}

function calculateUseCaseFit(input: AIReadinessInput, category: string): number {
  let score = 50;

  score += input.dataMetrics.dataQualityScore * 20;
  score += input.infrastructureMetrics.mlPlatformAvailable ? 10 : 0;
  score += (input.talentMetrics.dataScientists > 0 ? 10 : 0);
  score += input.strategyMetrics.pilotProjectsCompleted * 5;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function estimateTimeToValue(overallScore: number, input: AIReadinessInput): string {
  if (overallScore >= 80 && input.strategyMetrics.pilotProjectsCompleted > 0) {
    return '3-6 months to production AI';
  } else if (overallScore >= 60) {
    return '6-12 months to production AI';
  } else if (overallScore >= 40) {
    return '12-18 months to production AI';
  } else {
    return '18-24+ months to production AI';
  }
}

function generateInvestmentGuidance(input: AIReadinessInput, overallScore: number): InvestmentGuidance {
  const teamSize = input.talentMetrics.dataScientists + input.talentMetrics.mlEngineers;

  let budgetRange: string;
  if (overallScore >= 70) {
    budgetRange = '€100,000 - €300,000 annually';
  } else if (overallScore >= 50) {
    budgetRange = '€200,000 - €500,000 annually';
  } else {
    budgetRange = '€300,000 - €800,000 annually';
  }

  return {
    recommendedBudgetRange: budgetRange,
    phaseBreakdown: [
      {
        phase: 'Foundation',
        duration: '0-6 months',
        focus: 'Data infrastructure, team building, strategy',
        estimatedCost: '30% of budget',
        expectedOutcomes: ['Data platform operational', 'Core team in place', 'Strategy approved'],
      },
      {
        phase: 'Pilot',
        duration: '6-12 months',
        focus: 'First use case implementation, MLOps setup',
        estimatedCost: '40% of budget',
        expectedOutcomes: ['First model in production', 'MLOps processes defined'],
      },
      {
        phase: 'Scale',
        duration: '12-24 months',
        focus: 'Expand use cases, optimize operations',
        estimatedCost: '30% of budget',
        expectedOutcomes: ['Multiple AI applications', 'Measurable ROI'],
      },
    ],
    quickWins: [
      'Deploy pre-trained models for common tasks',
      'Automate data quality monitoring',
      'Implement AI-powered search',
    ],
    longTermInitiatives: [
      'Build custom ML models for core business processes',
      'Establish AI center of excellence',
      'Develop proprietary training datasets',
    ],
  };
}

export default {
  calculateAIReadiness,
};
