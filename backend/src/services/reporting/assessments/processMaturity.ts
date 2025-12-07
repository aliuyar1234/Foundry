/**
 * Process Maturity Assessment Scorer
 * Evaluates process maturity using CMMI-inspired framework
 */

export interface ProcessMaturityInput {
  organizationId: string;
  processes: ProcessAssessmentData[];
  organizationMetrics: OrgProcessMetrics;
}

export interface ProcessAssessmentData {
  processId: string;
  processName: string;
  category: string;
  documentation: ProcessDocumentation;
  standardization: ProcessStandardization;
  measurement: ProcessMeasurement;
  optimization: ProcessOptimization;
  automation: ProcessAutomation;
}

export interface ProcessDocumentation {
  hasDocumentation: boolean;
  documentationType: 'none' | 'informal' | 'formal' | 'detailed';
  lastUpdated?: Date;
  ownerAssigned: boolean;
  reviewCycle: 'none' | 'ad_hoc' | 'annual' | 'quarterly' | 'continuous';
}

export interface ProcessStandardization {
  isStandardized: boolean;
  standardizationLevel: number; // 0-1
  variantCount: number;
  complianceRate: number; // 0-1
  deviationFrequency: 'frequent' | 'occasional' | 'rare' | 'never';
}

export interface ProcessMeasurement {
  kpisDefinied: boolean;
  kpiCount: number;
  measurementFrequency: 'none' | 'ad_hoc' | 'periodic' | 'continuous';
  performanceTracked: boolean;
  benchmarksAvailable: boolean;
}

export interface ProcessOptimization {
  optimizationCycles: number; // Count of improvement cycles completed
  lastOptimized?: Date;
  continuousImprovement: boolean;
  feedbackLoop: boolean;
  rootCauseAnalysis: boolean;
}

export interface ProcessAutomation {
  automationLevel: number; // 0-1
  automatedSteps: number;
  totalSteps: number;
  integrationPoints: number;
  manualHandoffs: number;
}

export interface OrgProcessMetrics {
  totalProcesses: number;
  documentedProcesses: number;
  standardizedProcesses: number;
  automatedProcesses: number;
  processOwnership: number; // 0-1, percentage with owners
  crossFunctionalProcesses: number;
  avgProcessAge: number; // months since documentation
}

export interface ProcessMaturityScore {
  overallScore: number; // 0-100
  maturityLevel: 1 | 2 | 3 | 4 | 5;
  maturityLevelName: string;
  dimensionScores: {
    documentation: MaturityDimensionScore;
    standardization: MaturityDimensionScore;
    measurement: MaturityDimensionScore;
    optimization: MaturityDimensionScore;
    automation: MaturityDimensionScore;
  };
  processScores: IndividualProcessScore[];
  categoryBreakdown: CategoryMaturityScore[];
  maturityGaps: MaturityGap[];
  roadmap: MaturityRoadmap;
  benchmarkComparison: BenchmarkComparison;
}

export interface MaturityDimensionScore {
  score: number;
  level: 1 | 2 | 3 | 4 | 5;
  status: string;
  processesAtLevel: Record<number, number>;
  recommendations: string[];
}

export interface IndividualProcessScore {
  processId: string;
  processName: string;
  category: string;
  overallScore: number;
  maturityLevel: 1 | 2 | 3 | 4 | 5;
  dimensionBreakdown: Record<string, number>;
  topIssues: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface CategoryMaturityScore {
  category: string;
  avgScore: number;
  avgLevel: number;
  processCount: number;
  highlightProcess: string;
  improvementPotential: number;
}

export interface MaturityGap {
  dimension: string;
  currentLevel: number;
  targetLevel: number;
  gap: number;
  impact: string;
  closingStrategy: string;
  estimatedEffort: string;
}

export interface MaturityRoadmap {
  currentState: string;
  targetState: string;
  phases: RoadmapPhase[];
  keyMilestones: string[];
  estimatedDuration: string;
  investmentRequired: string;
}

export interface RoadmapPhase {
  phase: number;
  name: string;
  focus: string;
  duration: string;
  objectives: string[];
  keyActivities: string[];
  expectedOutcomes: string[];
}

export interface BenchmarkComparison {
  industryAverage: number;
  topPerformers: number;
  currentPosition: 'below_average' | 'average' | 'above_average' | 'leading';
  percentile: number;
  areasAboveBenchmark: string[];
  areasBelowBenchmark: string[];
}

// CMMI-inspired maturity levels
const MATURITY_LEVELS = {
  1: { name: 'Initial', description: 'Ad-hoc, chaotic processes' },
  2: { name: 'Managed', description: 'Processes are planned and executed' },
  3: { name: 'Defined', description: 'Processes are standardized and documented' },
  4: { name: 'Quantitatively Managed', description: 'Processes are measured and controlled' },
  5: { name: 'Optimizing', description: 'Focus on continuous improvement' },
};

// Dimension weights
const DIMENSION_WEIGHTS = {
  documentation: 0.20,
  standardization: 0.25,
  measurement: 0.20,
  optimization: 0.20,
  automation: 0.15,
};

/**
 * Calculate process maturity score
 */
export async function calculateProcessMaturity(input: ProcessMaturityInput): Promise<ProcessMaturityScore> {
  const { processes, organizationMetrics } = input;

  // Calculate individual process scores
  const processScores = processes.map((p) => calculateIndividualProcessScore(p));

  // Calculate dimension scores
  const documentation = calculateDocumentationDimension(processes);
  const standardization = calculateStandardizationDimension(processes);
  const measurement = calculateMeasurementDimension(processes);
  const optimization = calculateOptimizationDimension(processes);
  const automation = calculateAutomationDimension(processes);

  // Calculate overall score
  const overallScore = Math.round(
    documentation.score * DIMENSION_WEIGHTS.documentation +
    standardization.score * DIMENSION_WEIGHTS.standardization +
    measurement.score * DIMENSION_WEIGHTS.measurement +
    optimization.score * DIMENSION_WEIGHTS.optimization +
    automation.score * DIMENSION_WEIGHTS.automation
  );

  // Determine maturity level
  const maturityLevel = getMaturityLevel(overallScore);

  // Category breakdown
  const categoryBreakdown = calculateCategoryBreakdown(processScores);

  // Identify maturity gaps
  const maturityGaps = identifyMaturityGaps(
    documentation,
    standardization,
    measurement,
    optimization,
    automation,
    maturityLevel
  );

  // Generate roadmap
  const roadmap = generateMaturityRoadmap(overallScore, maturityLevel, maturityGaps);

  // Benchmark comparison
  const benchmarkComparison = calculateBenchmarkComparison(overallScore, maturityLevel);

  return {
    overallScore,
    maturityLevel,
    maturityLevelName: MATURITY_LEVELS[maturityLevel].name,
    dimensionScores: {
      documentation,
      standardization,
      measurement,
      optimization,
      automation,
    },
    processScores: processScores.sort((a, b) => a.overallScore - b.overallScore).slice(0, 10),
    categoryBreakdown,
    maturityGaps,
    roadmap,
    benchmarkComparison,
  };
}

/**
 * Calculate score for individual process
 */
function calculateIndividualProcessScore(process: ProcessAssessmentData): IndividualProcessScore {
  const scores = {
    documentation: calculateProcessDocScore(process.documentation),
    standardization: calculateProcessStdScore(process.standardization),
    measurement: calculateProcessMeasureScore(process.measurement),
    optimization: calculateProcessOptScore(process.optimization),
    automation: calculateProcessAutoScore(process.automation),
  };

  const overallScore = Math.round(
    scores.documentation * DIMENSION_WEIGHTS.documentation +
    scores.standardization * DIMENSION_WEIGHTS.standardization +
    scores.measurement * DIMENSION_WEIGHTS.measurement +
    scores.optimization * DIMENSION_WEIGHTS.optimization +
    scores.automation * DIMENSION_WEIGHTS.automation
  );

  const topIssues: string[] = [];
  if (scores.documentation < 50) topIssues.push('Poor documentation');
  if (scores.standardization < 50) topIssues.push('Low standardization');
  if (scores.measurement < 50) topIssues.push('Limited measurement');
  if (scores.automation < 30) topIssues.push('Manual process');

  return {
    processId: process.processId,
    processName: process.processName,
    category: process.category,
    overallScore,
    maturityLevel: getMaturityLevel(overallScore),
    dimensionBreakdown: scores,
    topIssues,
    priority: getPriority(overallScore),
  };
}

function calculateProcessDocScore(doc: ProcessDocumentation): number {
  let score = 0;
  const typeScores: Record<string, number> = { none: 0, informal: 25, formal: 60, detailed: 90 };
  score += typeScores[doc.documentationType] || 0;
  if (doc.ownerAssigned) score += 10;
  const reviewScores: Record<string, number> = { none: 0, ad_hoc: 5, annual: 10, quarterly: 15, continuous: 20 };
  score += reviewScores[doc.reviewCycle] || 0;
  return Math.min(100, score);
}

function calculateProcessStdScore(std: ProcessStandardization): number {
  let score = std.standardizationLevel * 50;
  score += std.complianceRate * 30;
  const devScores: Record<string, number> = { frequent: 0, occasional: 10, rare: 15, never: 20 };
  score += devScores[std.deviationFrequency] || 0;
  if (std.variantCount <= 1) score += 10;
  return Math.min(100, Math.round(score));
}

function calculateProcessMeasureScore(meas: ProcessMeasurement): number {
  let score = 0;
  if (meas.kpisDefinied) score += 30;
  score += Math.min(30, meas.kpiCount * 6);
  const freqScores: Record<string, number> = { none: 0, ad_hoc: 10, periodic: 20, continuous: 30 };
  score += freqScores[meas.measurementFrequency] || 0;
  if (meas.benchmarksAvailable) score += 10;
  return Math.min(100, score);
}

function calculateProcessOptScore(opt: ProcessOptimization): number {
  let score = Math.min(40, opt.optimizationCycles * 10);
  if (opt.continuousImprovement) score += 25;
  if (opt.feedbackLoop) score += 15;
  if (opt.rootCauseAnalysis) score += 20;
  return Math.min(100, score);
}

function calculateProcessAutoScore(auto: ProcessAutomation): number {
  let score = auto.automationLevel * 60;
  if (auto.totalSteps > 0) {
    score += (auto.automatedSteps / auto.totalSteps) * 20;
  }
  score += Math.min(15, auto.integrationPoints * 3);
  score -= Math.min(15, auto.manualHandoffs * 3);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculate documentation dimension score
 */
function calculateDocumentationDimension(processes: ProcessAssessmentData[]): MaturityDimensionScore {
  const scores = processes.map((p) => calculateProcessDocScore(p.documentation));
  const avgScore = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  const processesAtLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  scores.forEach((s) => {
    const level = getMaturityLevel(s);
    processesAtLevel[level]++;
  });

  const recommendations: string[] = [];
  if (avgScore < 40) recommendations.push('Establish formal documentation standards');
  if (avgScore < 60) recommendations.push('Assign process owners for all critical processes');
  if (avgScore < 80) recommendations.push('Implement regular documentation review cycles');

  return {
    score: Math.round(avgScore),
    level: getMaturityLevel(avgScore),
    status: MATURITY_LEVELS[getMaturityLevel(avgScore)].name,
    processesAtLevel,
    recommendations,
  };
}

/**
 * Calculate standardization dimension score
 */
function calculateStandardizationDimension(processes: ProcessAssessmentData[]): MaturityDimensionScore {
  const scores = processes.map((p) => calculateProcessStdScore(p.standardization));
  const avgScore = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  const processesAtLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  scores.forEach((s) => {
    processesAtLevel[getMaturityLevel(s)]++;
  });

  const recommendations: string[] = [];
  if (avgScore < 40) recommendations.push('Define standard process templates');
  if (avgScore < 60) recommendations.push('Reduce process variants through consolidation');
  if (avgScore < 80) recommendations.push('Implement compliance monitoring');

  return {
    score: Math.round(avgScore),
    level: getMaturityLevel(avgScore),
    status: MATURITY_LEVELS[getMaturityLevel(avgScore)].name,
    processesAtLevel,
    recommendations,
  };
}

/**
 * Calculate measurement dimension score
 */
function calculateMeasurementDimension(processes: ProcessAssessmentData[]): MaturityDimensionScore {
  const scores = processes.map((p) => calculateProcessMeasureScore(p.measurement));
  const avgScore = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  const processesAtLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  scores.forEach((s) => {
    processesAtLevel[getMaturityLevel(s)]++;
  });

  const recommendations: string[] = [];
  if (avgScore < 40) recommendations.push('Define KPIs for critical processes');
  if (avgScore < 60) recommendations.push('Implement process performance dashboards');
  if (avgScore < 80) recommendations.push('Establish industry benchmarks for comparison');

  return {
    score: Math.round(avgScore),
    level: getMaturityLevel(avgScore),
    status: MATURITY_LEVELS[getMaturityLevel(avgScore)].name,
    processesAtLevel,
    recommendations,
  };
}

/**
 * Calculate optimization dimension score
 */
function calculateOptimizationDimension(processes: ProcessAssessmentData[]): MaturityDimensionScore {
  const scores = processes.map((p) => calculateProcessOptScore(p.optimization));
  const avgScore = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  const processesAtLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  scores.forEach((s) => {
    processesAtLevel[getMaturityLevel(s)]++;
  });

  const recommendations: string[] = [];
  if (avgScore < 40) recommendations.push('Implement basic process improvement cycles');
  if (avgScore < 60) recommendations.push('Establish feedback mechanisms from process participants');
  if (avgScore < 80) recommendations.push('Deploy root cause analysis for process issues');

  return {
    score: Math.round(avgScore),
    level: getMaturityLevel(avgScore),
    status: MATURITY_LEVELS[getMaturityLevel(avgScore)].name,
    processesAtLevel,
    recommendations,
  };
}

/**
 * Calculate automation dimension score
 */
function calculateAutomationDimension(processes: ProcessAssessmentData[]): MaturityDimensionScore {
  const scores = processes.map((p) => calculateProcessAutoScore(p.automation));
  const avgScore = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);

  const processesAtLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  scores.forEach((s) => {
    processesAtLevel[getMaturityLevel(s)]++;
  });

  const recommendations: string[] = [];
  if (avgScore < 40) recommendations.push('Identify automation candidates in high-volume processes');
  if (avgScore < 60) recommendations.push('Reduce manual handoffs through integration');
  if (avgScore < 80) recommendations.push('Implement end-to-end workflow automation');

  return {
    score: Math.round(avgScore),
    level: getMaturityLevel(avgScore),
    status: MATURITY_LEVELS[getMaturityLevel(avgScore)].name,
    processesAtLevel,
    recommendations,
  };
}

/**
 * Calculate category breakdown
 */
function calculateCategoryBreakdown(processScores: IndividualProcessScore[]): CategoryMaturityScore[] {
  const categories = new Map<string, IndividualProcessScore[]>();

  processScores.forEach((p) => {
    const existing = categories.get(p.category) || [];
    existing.push(p);
    categories.set(p.category, existing);
  });

  return Array.from(categories.entries()).map(([category, procs]) => {
    const avgScore = procs.reduce((s, p) => s + p.overallScore, 0) / procs.length;
    const avgLevel = procs.reduce((s, p) => s + p.maturityLevel, 0) / procs.length;
    const bestProcess = procs.sort((a, b) => b.overallScore - a.overallScore)[0];
    const worstProcess = procs.sort((a, b) => a.overallScore - b.overallScore)[0];

    return {
      category,
      avgScore: Math.round(avgScore),
      avgLevel: Math.round(avgLevel * 10) / 10,
      processCount: procs.length,
      highlightProcess: bestProcess?.processName || '',
      improvementPotential: bestProcess ? bestProcess.overallScore - worstProcess.overallScore : 0,
    };
  });
}

/**
 * Identify maturity gaps
 */
function identifyMaturityGaps(
  doc: MaturityDimensionScore,
  std: MaturityDimensionScore,
  meas: MaturityDimensionScore,
  opt: MaturityDimensionScore,
  auto: MaturityDimensionScore,
  currentLevel: number
): MaturityGap[] {
  const gaps: MaturityGap[] = [];
  const targetLevel = Math.min(5, currentLevel + 1);

  const dimensions = [
    { name: 'Documentation', score: doc },
    { name: 'Standardization', score: std },
    { name: 'Measurement', score: meas },
    { name: 'Optimization', score: opt },
    { name: 'Automation', score: auto },
  ];

  dimensions.forEach(({ name, score }) => {
    if (score.level < targetLevel) {
      gaps.push({
        dimension: name,
        currentLevel: score.level,
        targetLevel,
        gap: targetLevel - score.level,
        impact: getGapImpact(name, score.level),
        closingStrategy: getClosingStrategy(name, score.level),
        estimatedEffort: getEffortEstimate(score.level, targetLevel),
      });
    }
  });

  return gaps.sort((a, b) => b.gap - a.gap);
}

/**
 * Generate maturity roadmap
 */
function generateMaturityRoadmap(
  overallScore: number,
  currentLevel: number,
  gaps: MaturityGap[]
): MaturityRoadmap {
  const phases: RoadmapPhase[] = [];

  if (currentLevel < 2) {
    phases.push({
      phase: 1,
      name: 'Foundation',
      focus: 'Establish basic process management',
      duration: '3-6 months',
      objectives: ['Document critical processes', 'Assign process owners', 'Define basic standards'],
      keyActivities: ['Process mapping workshops', 'Documentation creation', 'Owner assignment'],
      expectedOutcomes: ['Core processes documented', 'Ownership established', 'Baseline metrics'],
    });
  }

  if (currentLevel < 3) {
    phases.push({
      phase: phases.length + 1,
      name: 'Standardization',
      focus: 'Standardize and formalize processes',
      duration: '6-9 months',
      objectives: ['Standardize process execution', 'Reduce variants', 'Implement compliance'],
      keyActivities: ['Standard template creation', 'Variant analysis', 'Compliance monitoring setup'],
      expectedOutcomes: ['Standardized processes', 'Reduced variance', 'Compliance tracking'],
    });
  }

  if (currentLevel < 4) {
    phases.push({
      phase: phases.length + 1,
      name: 'Measurement',
      focus: 'Implement quantitative management',
      duration: '6-9 months',
      objectives: ['Define KPIs', 'Implement measurement', 'Establish benchmarks'],
      keyActivities: ['KPI definition', 'Dashboard development', 'Benchmark analysis'],
      expectedOutcomes: ['Performance visibility', 'Data-driven decisions', 'Benchmark comparison'],
    });
  }

  if (currentLevel < 5) {
    phases.push({
      phase: phases.length + 1,
      name: 'Optimization',
      focus: 'Continuous improvement culture',
      duration: '9-12 months',
      objectives: ['Establish improvement cycles', 'Implement automation', 'Build optimization capability'],
      keyActivities: ['Lean/Six Sigma deployment', 'RPA implementation', 'Innovation programs'],
      expectedOutcomes: ['Continuous improvement', 'Process excellence', 'Industry leadership'],
    });
  }

  return {
    currentState: MATURITY_LEVELS[currentLevel].description,
    targetState: MATURITY_LEVELS[Math.min(5, currentLevel + 2) as 1 | 2 | 3 | 4 | 5].description,
    phases,
    keyMilestones: phases.flatMap((p) => p.expectedOutcomes.slice(0, 1)),
    estimatedDuration: phases.length > 0 ? `${phases.length * 6}-${phases.length * 12} months` : '0 months',
    investmentRequired: getInvestmentEstimate(currentLevel),
  };
}

/**
 * Calculate benchmark comparison
 */
function calculateBenchmarkComparison(overallScore: number, level: number): BenchmarkComparison {
  // Industry averages (simulated - would be from actual benchmark data)
  const industryAverage = 55;
  const topPerformers = 85;

  let currentPosition: 'below_average' | 'average' | 'above_average' | 'leading';
  if (overallScore < industryAverage - 10) {
    currentPosition = 'below_average';
  } else if (overallScore < industryAverage + 10) {
    currentPosition = 'average';
  } else if (overallScore < topPerformers - 10) {
    currentPosition = 'above_average';
  } else {
    currentPosition = 'leading';
  }

  // Calculate percentile (simplified)
  const percentile = Math.min(99, Math.round((overallScore / 100) * 100));

  return {
    industryAverage,
    topPerformers,
    currentPosition,
    percentile,
    areasAboveBenchmark: overallScore > industryAverage ? ['Overall maturity'] : [],
    areasBelowBenchmark: overallScore < industryAverage ? ['Overall maturity needs improvement'] : [],
  };
}

function getMaturityLevel(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score < 20) return 1;
  if (score < 40) return 2;
  if (score < 60) return 3;
  if (score < 80) return 4;
  return 5;
}

function getPriority(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score < 30) return 'critical';
  if (score < 50) return 'high';
  if (score < 70) return 'medium';
  return 'low';
}

function getGapImpact(dimension: string, level: number): string {
  const impacts: Record<string, string> = {
    Documentation: 'Lack of documentation leads to knowledge loss and inconsistent execution',
    Standardization: 'Non-standard processes increase errors and reduce efficiency',
    Measurement: 'Without measurement, improvement is guesswork',
    Optimization: 'Missing optimization results in stagnation',
    Automation: 'Manual processes are slow and error-prone',
  };
  return impacts[dimension] || 'Improvement needed';
}

function getClosingStrategy(dimension: string, level: number): string {
  const strategies: Record<string, string> = {
    Documentation: 'Implement documentation standards and regular review cycles',
    Standardization: 'Deploy process templates and variance monitoring',
    Measurement: 'Define KPIs and implement dashboards',
    Optimization: 'Establish improvement programs and feedback loops',
    Automation: 'Identify and implement automation opportunities',
  };
  return strategies[dimension] || 'Develop improvement plan';
}

function getEffortEstimate(current: number, target: number): string {
  const gap = target - current;
  if (gap <= 1) return '3-6 months';
  if (gap <= 2) return '6-12 months';
  return '12-18 months';
}

function getInvestmentEstimate(level: number): string {
  if (level <= 1) return '€50,000 - €150,000';
  if (level <= 2) return '€100,000 - €300,000';
  if (level <= 3) return '€200,000 - €500,000';
  return '€150,000 - €400,000';
}

export default {
  calculateProcessMaturity,
};
