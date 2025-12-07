/**
 * Data Quality Assessment Scorer
 * Evaluates data quality across multiple dimensions
 */

export interface DataQualityInput {
  organizationId: string;
  entityRecords: EntityRecordSample[];
  dataSources: DataSourceInfo[];
}

export interface EntityRecordSample {
  entityType: string;
  totalRecords: number;
  sampleSize: number;
  fieldAnalysis: FieldAnalysis[];
  duplicateInfo: DuplicateInfo;
  freshness: FreshnessInfo;
}

export interface FieldAnalysis {
  fieldName: string;
  fieldType: string;
  completeness: number; // 0-1, percentage of non-null values
  uniqueness: number; // 0-1, unique values / total
  validity: number; // 0-1, values matching expected format
  accuracy: number; // 0-1, values matching reference source
  consistency: number; // 0-1, consistent across sources
  standardization: number; // 0-1, using standard formats/codes
}

export interface DuplicateInfo {
  suspectedDuplicates: number;
  confirmedDuplicates: number;
  duplicateRate: number; // 0-1
  duplicateClusters: number;
}

export interface FreshnessInfo {
  lastUpdated: Date;
  avgAge: number; // days
  staleRecordPercentage: number; // 0-1
  updateFrequency: 'real_time' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'rarely';
}

export interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  recordCount: number;
  lastSyncAt: Date;
  syncStatus: 'active' | 'stale' | 'failed';
  qualityScore: number; // 0-1
}

export interface DataQualityScore {
  overallScore: number; // 0-100
  qualityLevel: 'poor' | 'fair' | 'good' | 'excellent';
  dimensionScores: {
    completeness: DimensionScore;
    uniqueness: DimensionScore;
    validity: DimensionScore;
    accuracy: DimensionScore;
    consistency: DimensionScore;
    timeliness: DimensionScore;
  };
  entityTypeScores: EntityTypeScore[];
  dataSourceScores: DataSourceScore[];
  issues: DataQualityIssue[];
  recommendations: string[];
  trendsIndicator: 'improving' | 'stable' | 'declining';
}

export interface DimensionScore {
  score: number; // 0-100
  status: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
  affectedRecords: number;
  topIssues: string[];
}

export interface EntityTypeScore {
  entityType: string;
  overallScore: number;
  recordCount: number;
  dimensionBreakdown: Record<string, number>;
  criticalFields: CriticalFieldScore[];
}

export interface CriticalFieldScore {
  fieldName: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  issues: string[];
}

export interface DataSourceScore {
  sourceId: string;
  sourceName: string;
  score: number;
  recordCount: number;
  issues: string[];
}

export interface DataQualityIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dimension: string;
  entityType: string;
  field?: string;
  description: string;
  affectedRecords: number;
  impact: string;
  suggestedAction: string;
  estimatedEffort: string;
}

// Dimension weights
const DIMENSION_WEIGHTS = {
  completeness: 0.20,
  uniqueness: 0.15,
  validity: 0.20,
  accuracy: 0.20,
  consistency: 0.15,
  timeliness: 0.10,
};

/**
 * Calculate comprehensive data quality score
 */
export async function calculateDataQuality(input: DataQualityInput): Promise<DataQualityScore> {
  const { entityRecords, dataSources } = input;

  // Calculate dimension scores
  const completeness = calculateCompletenessScore(entityRecords);
  const uniqueness = calculateUniquenessScore(entityRecords);
  const validity = calculateValidityScore(entityRecords);
  const accuracy = calculateAccuracyScore(entityRecords);
  const consistency = calculateConsistencyScore(entityRecords);
  const timeliness = calculateTimelinessScore(entityRecords);

  // Calculate overall score
  const overallScore = Math.round(
    completeness.score * DIMENSION_WEIGHTS.completeness +
    uniqueness.score * DIMENSION_WEIGHTS.uniqueness +
    validity.score * DIMENSION_WEIGHTS.validity +
    accuracy.score * DIMENSION_WEIGHTS.accuracy +
    consistency.score * DIMENSION_WEIGHTS.consistency +
    timeliness.score * DIMENSION_WEIGHTS.timeliness
  );

  // Determine quality level
  const qualityLevel = getQualityLevel(overallScore);

  // Score by entity type
  const entityTypeScores = calculateEntityTypeScores(entityRecords);

  // Score by data source
  const dataSourceScores = calculateDataSourceScores(dataSources);

  // Identify issues
  const issues = identifyIssues(entityRecords, completeness, uniqueness, validity, accuracy, consistency, timeliness);

  // Generate recommendations
  const recommendations = generateRecommendations(issues, overallScore);

  return {
    overallScore,
    qualityLevel,
    dimensionScores: {
      completeness,
      uniqueness,
      validity,
      accuracy,
      consistency,
      timeliness,
    },
    entityTypeScores,
    dataSourceScores,
    issues,
    recommendations,
    trendsIndicator: 'stable', // Would need historical data to calculate
  };
}

/**
 * Calculate completeness dimension score
 */
function calculateCompletenessScore(entityRecords: EntityRecordSample[]): DimensionScore {
  if (entityRecords.length === 0) {
    return createEmptyDimensionScore();
  }

  let totalWeightedScore = 0;
  let totalRecords = 0;
  const topIssues: string[] = [];

  entityRecords.forEach((entity) => {
    const avgCompleteness =
      entity.fieldAnalysis.reduce((sum, f) => sum + f.completeness, 0) /
      Math.max(1, entity.fieldAnalysis.length);

    totalWeightedScore += avgCompleteness * entity.totalRecords;
    totalRecords += entity.totalRecords;

    // Find incomplete fields
    entity.fieldAnalysis
      .filter((f) => f.completeness < 0.8)
      .forEach((f) => {
        topIssues.push(`${entity.entityType}.${f.fieldName}: ${(f.completeness * 100).toFixed(0)}% complete`);
      });
  });

  const score = totalRecords > 0 ? (totalWeightedScore / totalRecords) * 100 : 0;
  const affectedRecords = Math.round(totalRecords * (1 - score / 100));

  return {
    score: Math.round(score),
    status: getStatus(score),
    affectedRecords,
    topIssues: topIssues.slice(0, 5),
  };
}

/**
 * Calculate uniqueness dimension score
 */
function calculateUniquenessScore(entityRecords: EntityRecordSample[]): DimensionScore {
  if (entityRecords.length === 0) {
    return createEmptyDimensionScore();
  }

  let totalWeightedScore = 0;
  let totalRecords = 0;
  const topIssues: string[] = [];

  entityRecords.forEach((entity) => {
    // Uniqueness is inverse of duplicate rate
    const uniquenessScore = (1 - entity.duplicateInfo.duplicateRate) * 100;

    totalWeightedScore += uniquenessScore * entity.totalRecords;
    totalRecords += entity.totalRecords;

    if (entity.duplicateInfo.duplicateRate > 0.05) {
      topIssues.push(
        `${entity.entityType}: ${(entity.duplicateInfo.duplicateRate * 100).toFixed(1)}% duplicate rate (${entity.duplicateInfo.duplicateClusters} clusters)`
      );
    }
  });

  const score = totalRecords > 0 ? totalWeightedScore / totalRecords : 0;
  const affectedRecords = entityRecords.reduce(
    (sum, e) => sum + e.duplicateInfo.suspectedDuplicates,
    0
  );

  return {
    score: Math.round(score),
    status: getStatus(score),
    affectedRecords,
    topIssues: topIssues.slice(0, 5),
  };
}

/**
 * Calculate validity dimension score
 */
function calculateValidityScore(entityRecords: EntityRecordSample[]): DimensionScore {
  if (entityRecords.length === 0) {
    return createEmptyDimensionScore();
  }

  let totalWeightedScore = 0;
  let totalRecords = 0;
  const topIssues: string[] = [];

  entityRecords.forEach((entity) => {
    const avgValidity =
      entity.fieldAnalysis.reduce((sum, f) => sum + f.validity, 0) /
      Math.max(1, entity.fieldAnalysis.length);

    totalWeightedScore += avgValidity * entity.totalRecords;
    totalRecords += entity.totalRecords;

    entity.fieldAnalysis
      .filter((f) => f.validity < 0.9)
      .forEach((f) => {
        topIssues.push(`${entity.entityType}.${f.fieldName}: ${(f.validity * 100).toFixed(0)}% valid`);
      });
  });

  const score = totalRecords > 0 ? (totalWeightedScore / totalRecords) * 100 : 0;
  const affectedRecords = Math.round(totalRecords * (1 - score / 100));

  return {
    score: Math.round(score),
    status: getStatus(score),
    affectedRecords,
    topIssues: topIssues.slice(0, 5),
  };
}

/**
 * Calculate accuracy dimension score
 */
function calculateAccuracyScore(entityRecords: EntityRecordSample[]): DimensionScore {
  if (entityRecords.length === 0) {
    return createEmptyDimensionScore();
  }

  let totalWeightedScore = 0;
  let totalRecords = 0;
  const topIssues: string[] = [];

  entityRecords.forEach((entity) => {
    const avgAccuracy =
      entity.fieldAnalysis.reduce((sum, f) => sum + f.accuracy, 0) /
      Math.max(1, entity.fieldAnalysis.length);

    totalWeightedScore += avgAccuracy * entity.totalRecords;
    totalRecords += entity.totalRecords;

    entity.fieldAnalysis
      .filter((f) => f.accuracy < 0.85)
      .forEach((f) => {
        topIssues.push(`${entity.entityType}.${f.fieldName}: ${(f.accuracy * 100).toFixed(0)}% accurate`);
      });
  });

  const score = totalRecords > 0 ? (totalWeightedScore / totalRecords) * 100 : 0;
  const affectedRecords = Math.round(totalRecords * (1 - score / 100));

  return {
    score: Math.round(score),
    status: getStatus(score),
    affectedRecords,
    topIssues: topIssues.slice(0, 5),
  };
}

/**
 * Calculate consistency dimension score
 */
function calculateConsistencyScore(entityRecords: EntityRecordSample[]): DimensionScore {
  if (entityRecords.length === 0) {
    return createEmptyDimensionScore();
  }

  let totalWeightedScore = 0;
  let totalRecords = 0;
  const topIssues: string[] = [];

  entityRecords.forEach((entity) => {
    const avgConsistency =
      entity.fieldAnalysis.reduce((sum, f) => sum + f.consistency, 0) /
      Math.max(1, entity.fieldAnalysis.length);

    totalWeightedScore += avgConsistency * entity.totalRecords;
    totalRecords += entity.totalRecords;

    entity.fieldAnalysis
      .filter((f) => f.consistency < 0.9)
      .forEach((f) => {
        topIssues.push(`${entity.entityType}.${f.fieldName}: ${(f.consistency * 100).toFixed(0)}% consistent`);
      });
  });

  const score = totalRecords > 0 ? (totalWeightedScore / totalRecords) * 100 : 0;
  const affectedRecords = Math.round(totalRecords * (1 - score / 100));

  return {
    score: Math.round(score),
    status: getStatus(score),
    affectedRecords,
    topIssues: topIssues.slice(0, 5),
  };
}

/**
 * Calculate timeliness dimension score
 */
function calculateTimelinessScore(entityRecords: EntityRecordSample[]): DimensionScore {
  if (entityRecords.length === 0) {
    return createEmptyDimensionScore();
  }

  let totalWeightedScore = 0;
  let totalRecords = 0;
  const topIssues: string[] = [];

  entityRecords.forEach((entity) => {
    // Score based on stale record percentage and update frequency
    const freshnessScore = (1 - entity.freshness.staleRecordPercentage) * 100;
    const frequencyMultiplier = getFrequencyMultiplier(entity.freshness.updateFrequency);

    const timelinessScore = freshnessScore * frequencyMultiplier;
    totalWeightedScore += timelinessScore * entity.totalRecords;
    totalRecords += entity.totalRecords;

    if (entity.freshness.staleRecordPercentage > 0.1) {
      topIssues.push(
        `${entity.entityType}: ${(entity.freshness.staleRecordPercentage * 100).toFixed(0)}% stale records`
      );
    }
  });

  const score = totalRecords > 0 ? totalWeightedScore / totalRecords : 0;
  const affectedRecords = Math.round(
    entityRecords.reduce(
      (sum, e) => sum + e.totalRecords * e.freshness.staleRecordPercentage,
      0
    )
  );

  return {
    score: Math.round(score),
    status: getStatus(score),
    affectedRecords,
    topIssues: topIssues.slice(0, 5),
  };
}

/**
 * Calculate scores per entity type
 */
function calculateEntityTypeScores(entityRecords: EntityRecordSample[]): EntityTypeScore[] {
  return entityRecords.map((entity) => {
    const fieldScores = entity.fieldAnalysis.map((f) => ({
      completeness: f.completeness * 100,
      validity: f.validity * 100,
      accuracy: f.accuracy * 100,
      consistency: f.consistency * 100,
    }));

    const avgScores = {
      completeness: fieldScores.reduce((s, f) => s + f.completeness, 0) / Math.max(1, fieldScores.length),
      validity: fieldScores.reduce((s, f) => s + f.validity, 0) / Math.max(1, fieldScores.length),
      accuracy: fieldScores.reduce((s, f) => s + f.accuracy, 0) / Math.max(1, fieldScores.length),
      consistency: fieldScores.reduce((s, f) => s + f.consistency, 0) / Math.max(1, fieldScores.length),
      uniqueness: (1 - entity.duplicateInfo.duplicateRate) * 100,
      timeliness: (1 - entity.freshness.staleRecordPercentage) * 100,
    };

    const overallScore = Math.round(
      Object.values(avgScores).reduce((s, v) => s + v, 0) / Object.keys(avgScores).length
    );

    // Identify critical fields
    const criticalFields = entity.fieldAnalysis
      .filter((f) => f.completeness < 0.8 || f.validity < 0.9 || f.accuracy < 0.85)
      .map((f) => ({
        fieldName: f.fieldName,
        importance: getFieldImportance(f.fieldName),
        score: Math.round(((f.completeness + f.validity + f.accuracy) / 3) * 100),
        issues: getFieldIssues(f),
      }));

    return {
      entityType: entity.entityType,
      overallScore,
      recordCount: entity.totalRecords,
      dimensionBreakdown: avgScores,
      criticalFields,
    };
  });
}

/**
 * Calculate scores per data source
 */
function calculateDataSourceScores(dataSources: DataSourceInfo[]): DataSourceScore[] {
  return dataSources.map((source) => {
    const issues: string[] = [];

    if (source.syncStatus === 'failed') {
      issues.push('Sync failed - data may be stale');
    } else if (source.syncStatus === 'stale') {
      issues.push('Sync is stale - check connection');
    }

    if (source.qualityScore < 0.7) {
      issues.push(`Quality score below threshold (${(source.qualityScore * 100).toFixed(0)}%)`);
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      score: Math.round(source.qualityScore * 100),
      recordCount: source.recordCount,
      issues,
    };
  });
}

/**
 * Identify quality issues
 */
function identifyIssues(
  entityRecords: EntityRecordSample[],
  completeness: DimensionScore,
  uniqueness: DimensionScore,
  validity: DimensionScore,
  accuracy: DimensionScore,
  consistency: DimensionScore,
  timeliness: DimensionScore
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  let issueId = 1;

  // Completeness issues
  if (completeness.score < 80) {
    entityRecords.forEach((entity) => {
      entity.fieldAnalysis
        .filter((f) => f.completeness < 0.7)
        .forEach((f) => {
          issues.push({
            id: `DQ-${issueId++}`,
            severity: f.completeness < 0.5 ? 'critical' : f.completeness < 0.7 ? 'high' : 'medium',
            dimension: 'completeness',
            entityType: entity.entityType,
            field: f.fieldName,
            description: `${f.fieldName} is ${(f.completeness * 100).toFixed(0)}% complete`,
            affectedRecords: Math.round(entity.totalRecords * (1 - f.completeness)),
            impact: 'Missing data may cause processing errors or incomplete analysis',
            suggestedAction: 'Implement data collection requirements and validation',
            estimatedEffort: 'Medium',
          });
        });
    });
  }

  // Uniqueness issues
  entityRecords
    .filter((e) => e.duplicateInfo.duplicateRate > 0.05)
    .forEach((entity) => {
      issues.push({
        id: `DQ-${issueId++}`,
        severity: entity.duplicateInfo.duplicateRate > 0.15 ? 'critical' : 'high',
        dimension: 'uniqueness',
        entityType: entity.entityType,
        description: `${(entity.duplicateInfo.duplicateRate * 100).toFixed(1)}% duplicate rate detected`,
        affectedRecords: entity.duplicateInfo.suspectedDuplicates,
        impact: 'Duplicates cause data redundancy and inconsistent reporting',
        suggestedAction: 'Run deduplication process and implement duplicate prevention',
        estimatedEffort: 'High',
      });
    });

  // Validity issues
  entityRecords.forEach((entity) => {
    entity.fieldAnalysis
      .filter((f) => f.validity < 0.85)
      .forEach((f) => {
        issues.push({
          id: `DQ-${issueId++}`,
          severity: f.validity < 0.7 ? 'high' : 'medium',
          dimension: 'validity',
          entityType: entity.entityType,
          field: f.fieldName,
          description: `${f.fieldName} has ${((1 - f.validity) * 100).toFixed(0)}% invalid values`,
          affectedRecords: Math.round(entity.totalRecords * (1 - f.validity)),
          impact: 'Invalid data may cause system errors or incorrect calculations',
          suggestedAction: 'Implement input validation and data cleansing rules',
          estimatedEffort: 'Medium',
        });
      });
  });

  // Timeliness issues
  entityRecords
    .filter((e) => e.freshness.staleRecordPercentage > 0.1)
    .forEach((entity) => {
      issues.push({
        id: `DQ-${issueId++}`,
        severity: entity.freshness.staleRecordPercentage > 0.3 ? 'high' : 'medium',
        dimension: 'timeliness',
        entityType: entity.entityType,
        description: `${(entity.freshness.staleRecordPercentage * 100).toFixed(0)}% stale records (avg age: ${entity.freshness.avgAge.toFixed(0)} days)`,
        affectedRecords: Math.round(entity.totalRecords * entity.freshness.staleRecordPercentage),
        impact: 'Stale data may lead to outdated insights and decisions',
        suggestedAction: 'Review data refresh schedules and update processes',
        estimatedEffort: 'Low',
      });
    });

  return issues.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Generate recommendations based on issues
 */
function generateRecommendations(issues: DataQualityIssue[], overallScore: number): string[] {
  const recommendations: string[] = [];

  // Group issues by dimension
  const byDimension = issues.reduce((acc, issue) => {
    acc[issue.dimension] = (acc[issue.dimension] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Completeness recommendations
  if (byDimension.completeness > 0) {
    recommendations.push('Implement mandatory field validation at data entry points');
    recommendations.push('Create data completeness dashboards for monitoring');
  }

  // Uniqueness recommendations
  if (byDimension.uniqueness > 0) {
    recommendations.push('Deploy automated duplicate detection and prevention');
    recommendations.push('Establish master data management practices');
  }

  // Validity recommendations
  if (byDimension.validity > 0) {
    recommendations.push('Define and enforce data validation rules');
    recommendations.push('Implement data profiling for ongoing monitoring');
  }

  // Timeliness recommendations
  if (byDimension.timeliness > 0) {
    recommendations.push('Review and optimize data synchronization schedules');
    recommendations.push('Implement real-time data integration where feasible');
  }

  // General recommendations based on score
  if (overallScore < 60) {
    recommendations.push('Consider a comprehensive data quality improvement program');
  }

  return recommendations.slice(0, 8);
}

function getStatus(score: number): 'critical' | 'poor' | 'fair' | 'good' | 'excellent' {
  if (score < 50) return 'critical';
  if (score < 65) return 'poor';
  if (score < 80) return 'fair';
  if (score < 90) return 'good';
  return 'excellent';
}

function getQualityLevel(score: number): 'poor' | 'fair' | 'good' | 'excellent' {
  if (score < 50) return 'poor';
  if (score < 70) return 'fair';
  if (score < 85) return 'good';
  return 'excellent';
}

function getFrequencyMultiplier(frequency: string): number {
  const multipliers: Record<string, number> = {
    real_time: 1.0,
    hourly: 0.95,
    daily: 0.9,
    weekly: 0.8,
    monthly: 0.7,
    rarely: 0.5,
  };
  return multipliers[frequency] || 0.5;
}

function getFieldImportance(fieldName: string): 'critical' | 'high' | 'medium' | 'low' {
  const criticalFields = ['id', 'email', 'name', 'phone', 'address', 'amount', 'date', 'status'];
  const highFields = ['description', 'category', 'type', 'owner', 'assignee'];

  const lowerName = fieldName.toLowerCase();
  if (criticalFields.some((f) => lowerName.includes(f))) return 'critical';
  if (highFields.some((f) => lowerName.includes(f))) return 'high';
  return 'medium';
}

function getFieldIssues(field: FieldAnalysis): string[] {
  const issues: string[] = [];
  if (field.completeness < 0.8) issues.push(`${((1 - field.completeness) * 100).toFixed(0)}% missing`);
  if (field.validity < 0.9) issues.push(`${((1 - field.validity) * 100).toFixed(0)}% invalid`);
  if (field.accuracy < 0.85) issues.push(`${((1 - field.accuracy) * 100).toFixed(0)}% inaccurate`);
  return issues;
}

function createEmptyDimensionScore(): DimensionScore {
  return {
    score: 0,
    status: 'critical',
    affectedRecords: 0,
    topIssues: ['No data available for assessment'],
  };
}

export default {
  calculateDataQuality,
};
