/**
 * Prediction Services Index
 * Exports all predictive analytics services
 */

export { PredictionService, getPredictionService } from './prediction.service.js';

export type {
  PredictionModel,
  PredictionModelType,
  Prediction,
  PredictionValue,
  PredictionFactor,
  ProcessHealthScore,
  HealthDimension,
  HealthTrend,
  HealthAlert,
  AnomalyResult,
  AnomalyType,
  ForecastResult,
  CreatePredictionModelInput,
  PredictionRequest,
  ModelConfig,
  ModelMetrics,
} from '../../models/Prediction.js';

export {
  MODEL_DEFAULTS,
  calculateAccuracy,
  calculateHealthScore,
  getHealthStatus,
  isPredictionValid,
  getConfidenceInterval,
} from '../../models/Prediction.js';
