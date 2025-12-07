/**
 * Prediction Model (T117)
 * Types and utilities for predictive process analytics
 */

import { ModelStatus } from '@prisma/client';

/**
 * Prediction model for process analytics
 */
export interface PredictionModel {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  type: PredictionModelType;
  status: ModelStatus;
  version: string;
  config: ModelConfig;
  metrics: ModelMetrics;
  trainingData: TrainingDataInfo;
  createdAt: Date;
  updatedAt: Date;
  trainedAt: Date | null;
  lastPredictionAt: Date | null;
}

/**
 * Types of prediction models
 */
export type PredictionModelType =
  | 'process_duration'
  | 'bottleneck_risk'
  | 'completion_probability'
  | 'resource_demand'
  | 'anomaly_detection'
  | 'trend_forecast';

/**
 * Model configuration
 */
export interface ModelConfig {
  algorithm: string;
  hyperparameters: Record<string, unknown>;
  features: FeatureConfig[];
  targetVariable: string;
  windowSize?: number;
  horizonDays?: number;
  updateFrequency: 'hourly' | 'daily' | 'weekly';
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  name: string;
  type: 'numeric' | 'categorical' | 'temporal' | 'derived';
  source: string;
  transformation?: string;
  importance?: number;
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  mse?: number;
  mae?: number;
  r2Score?: number;
  confusionMatrix?: number[][];
  featureImportance: Record<string, number>;
  validationResults: ValidationResult[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  timestamp: Date;
  metric: string;
  predicted: number;
  actual: number;
  error: number;
}

/**
 * Training data information
 */
export interface TrainingDataInfo {
  processIds: string[];
  eventCount: number;
  dateRange: {
    start: Date;
    end: Date;
  };
  samplingStrategy?: string;
  preprocessingSteps: string[];
}

/**
 * Prediction result
 */
export interface Prediction {
  id: string;
  tenantId: string;
  modelId: string;
  processId: string;
  instanceId?: string;
  type: PredictionModelType;
  prediction: PredictionValue;
  confidence: number;
  factors: PredictionFactor[];
  validUntil: Date;
  createdAt: Date;
  actualValue?: number;
  wasAccurate?: boolean;
}

/**
 * Prediction value with range
 */
export interface PredictionValue {
  value: number;
  unit: string;
  lowerBound: number;
  upperBound: number;
  distribution?: 'normal' | 'poisson' | 'exponential';
}

/**
 * Factor contributing to prediction
 */
export interface PredictionFactor {
  name: string;
  value: unknown;
  contribution: number;
  direction: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

/**
 * Process health score
 */
export interface ProcessHealthScore {
  processId: string;
  overallScore: number;
  dimensions: HealthDimension[];
  trends: HealthTrend[];
  alerts: HealthAlert[];
  lastUpdated: Date;
}

/**
 * Health dimension
 */
export interface HealthDimension {
  name: string;
  score: number;
  weight: number;
  status: 'healthy' | 'warning' | 'critical';
  description: string;
}

/**
 * Health trend
 */
export interface HealthTrend {
  dimension: string;
  direction: 'improving' | 'stable' | 'declining';
  magnitude: number;
  period: string;
}

/**
 * Health alert
 */
export interface HealthAlert {
  severity: 'info' | 'warning' | 'critical';
  dimension: string;
  message: string;
  recommendation: string;
  timestamp: Date;
}

/**
 * Anomaly detection result
 */
export interface AnomalyResult {
  id: string;
  processId: string;
  instanceId?: string;
  timestamp: Date;
  anomalyScore: number;
  isAnomaly: boolean;
  type: AnomalyType;
  affectedMetrics: string[];
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
}

/**
 * Types of anomalies
 */
export type AnomalyType =
  | 'duration_spike'
  | 'unusual_pattern'
  | 'missing_step'
  | 'out_of_order'
  | 'resource_anomaly'
  | 'frequency_anomaly';

/**
 * Forecast result
 */
export interface ForecastResult {
  processId: string;
  metric: string;
  forecasts: ForecastPoint[];
  confidence: number;
  seasonality?: SeasonalityInfo;
}

/**
 * Forecast point
 */
export interface ForecastPoint {
  timestamp: Date;
  value: number;
  lowerBound: number;
  upperBound: number;
}

/**
 * Seasonality information
 */
export interface SeasonalityInfo {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  strength: number;
  peakTimes: string[];
  troughTimes: string[];
}

/**
 * Input for creating a prediction model
 */
export interface CreatePredictionModelInput {
  tenantId: string;
  name: string;
  description: string;
  type: PredictionModelType;
  config: ModelConfig;
}

/**
 * Input for generating predictions
 */
export interface PredictionRequest {
  modelId: string;
  processId: string;
  instanceId?: string;
  tenantId: string;
  context?: Record<string, unknown>;
}

/**
 * Default model configuration
 */
export const MODEL_DEFAULTS = {
  status: 'DRAFT' as ModelStatus,
  version: '1.0.0',
  updateFrequency: 'daily' as const,
  horizonDays: 30,
};

/**
 * Calculate model accuracy from validation results
 */
export function calculateAccuracy(results: ValidationResult[]): number {
  if (results.length === 0) return 0;

  const errors = results.map((r) => Math.abs(r.predicted - r.actual));
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxValue = Math.max(...results.map((r) => r.actual));

  return maxValue > 0 ? Math.max(0, 1 - meanError / maxValue) : 0;
}

/**
 * Calculate health score from dimensions
 */
export function calculateHealthScore(dimensions: HealthDimension[]): number {
  if (dimensions.length === 0) return 0;

  const totalWeight = dimensions.reduce((acc, d) => acc + d.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
  return weightedSum / totalWeight;
}

/**
 * Determine health status from score
 */
export function getHealthStatus(score: number): 'healthy' | 'warning' | 'critical' {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'warning';
  return 'critical';
}

/**
 * Check if prediction is still valid
 */
export function isPredictionValid(prediction: Prediction): boolean {
  return new Date() < prediction.validUntil;
}

/**
 * Calculate prediction confidence interval
 */
export function getConfidenceInterval(
  value: number,
  confidence: number,
  distribution: 'normal' | 'poisson' | 'exponential' = 'normal'
): { lower: number; upper: number } {
  const zScores: Record<number, number> = {
    0.9: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };

  const z = zScores[confidence] || 1.96;
  const margin = value * (1 - confidence) * z;

  return {
    lower: Math.max(0, value - margin),
    upper: value + margin,
  };
}
