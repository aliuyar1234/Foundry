/**
 * Organizational Debt Score Model Types
 * T250 - Unified metric for organizational health
 */

/**
 * Individual debt dimension score
 */
export interface DebtDimension {
  name: string;
  score: number;           // 0-100 (0 = no debt, 100 = critical debt)
  weight: number;          // Weight in overall calculation
  trend: 'improving' | 'stable' | 'degrading';
  subDimensions: SubDimension[];
  topIssues: DebtIssue[];
  recommendations: string[];
}

export interface SubDimension {
  name: string;
  score: number;
  description: string;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DebtIssue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost?: number;
  affectedEntities: string[];
  suggestedAction: string;
}

/**
 * Process debt - inefficiencies in how work gets done
 */
export interface ProcessDebt extends DebtDimension {
  name: 'process';
  metrics: {
    undocumentedProcessCount: number;
    processVariationScore: number;     // How much processes deviate from standard
    bottleneckCount: number;
    avgCycleTimeDelay: number;         // % above optimal
    manualStepRatio: number;           // % of steps that are manual
    reworkRate: number;                // % of work requiring rework
  };
}

/**
 * Knowledge debt - gaps in organizational knowledge management
 */
export interface KnowledgeDebt extends DebtDimension {
  name: 'knowledge';
  metrics: {
    singlePointsOfFailure: number;
    undocumentedExpertiseAreas: number;
    avgBusFactor: number;              // 1-5 scale
    knowledgeSiloCount: number;
    expertiseConcentrationScore: number;
    successionGapCount: number;
  };
}

/**
 * Data debt - issues with data quality and management
 */
export interface DataDebt extends DebtDimension {
  name: 'data';
  metrics: {
    duplicateRecordRate: number;       // % duplicates
    dataQualityScore: number;          // 0-100
    inconsistentFieldCount: number;
    missingCriticalFields: number;
    staleDataPercentage: number;
    dataSourceFragmentation: number;   // Number of disconnected sources
  };
}

/**
 * Technical debt - system and integration issues
 */
export interface TechnicalDebt extends DebtDimension {
  name: 'technical';
  metrics: {
    legacySystemCount: number;
    integrationGapCount: number;
    manualDataTransferCount: number;
    systemDowntimeHours: number;
    securityVulnerabilityCount: number;
    maintenanceBurdenScore: number;
  };
}

/**
 * Communication debt - organizational communication inefficiencies
 */
export interface CommunicationDebt extends DebtDimension {
  name: 'communication';
  metrics: {
    siloScore: number;                 // 0-100, how siloed
    avgResponseDelay: number;          // Hours above optimal
    meetingOverloadScore: number;
    emailOverloadScore: number;
    crossTeamCollaborationGap: number;
    informationFlowBottlenecks: number;
  };
}

/**
 * Complete organizational debt score
 */
export interface OrgDebtScore {
  id: string;
  organizationId: string;
  calculatedAt: Date;

  // Overall composite score
  overallScore: number;                // 0-100 (0 = healthy, 100 = critical)
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  overallTrend: 'improving' | 'stable' | 'degrading';

  // Dimension scores
  dimensions: {
    process: ProcessDebt;
    knowledge: KnowledgeDebt;
    data: DataDebt;
    technical: TechnicalDebt;
    communication: CommunicationDebt;
  };

  // Cost estimation
  estimatedAnnualCost: CostEstimate;

  // Prioritized recommendations
  topRecommendations: Recommendation[];

  // Historical comparison
  previousScore?: number;
  scoreChange?: number;

  // Benchmark comparison
  industryBenchmark?: number;
  benchmarkComparison?: 'below' | 'at' | 'above';
}

export interface CostEstimate {
  totalAnnualCost: number;
  currency: string;
  breakdown: {
    dimension: string;
    cost: number;
    percentage: number;
  }[];
  methodology: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  assumptions: string[];
}

export interface Recommendation {
  id: string;
  priority: number;                    // 1 = highest
  title: string;
  description: string;
  dimension: string;
  estimatedImpact: {
    scoreReduction: number;            // Expected debt score reduction
    costSavings: number;
    timeToValue: string;               // e.g., "3-6 months"
  };
  effort: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'moderate' | 'complex';
  prerequisites: string[];
  relatedIssues: string[];
}

/**
 * Debt score history entry
 */
export interface DebtScoreHistory {
  date: Date;
  overallScore: number;
  dimensionScores: {
    process: number;
    knowledge: number;
    data: number;
    technical: number;
    communication: number;
  };
  significantChanges?: string[];
}

/**
 * Debt calculation options
 */
export interface DebtCalculationOptions {
  organizationId: string;
  includeRecommendations?: boolean;
  includeCostEstimate?: boolean;
  lookbackDays?: number;
  customWeights?: {
    process?: number;
    knowledge?: number;
    data?: number;
    technical?: number;
    communication?: number;
  };
  costParameters?: {
    avgSalary?: number;
    avgHourlyRate?: number;
    currency?: string;
  };
}

/**
 * Grade thresholds
 */
export const GRADE_THRESHOLDS = {
  A: { max: 20, label: 'Excellent', description: 'Minimal organizational debt' },
  B: { max: 40, label: 'Good', description: 'Some areas for improvement' },
  C: { max: 60, label: 'Fair', description: 'Significant debt requiring attention' },
  D: { max: 80, label: 'Poor', description: 'High debt impacting operations' },
  F: { max: 100, label: 'Critical', description: 'Critical debt requiring immediate action' },
} as const;

/**
 * Default dimension weights
 */
export const DEFAULT_WEIGHTS = {
  process: 0.25,
  knowledge: 0.20,
  data: 0.20,
  technical: 0.15,
  communication: 0.20,
} as const;

/**
 * Calculate grade from score
 */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score <= GRADE_THRESHOLDS.A.max) return 'A';
  if (score <= GRADE_THRESHOLDS.B.max) return 'B';
  if (score <= GRADE_THRESHOLDS.C.max) return 'C';
  if (score <= GRADE_THRESHOLDS.D.max) return 'D';
  return 'F';
}

/**
 * Get grade info
 */
export function getGradeInfo(grade: 'A' | 'B' | 'C' | 'D' | 'F') {
  return GRADE_THRESHOLDS[grade];
}
