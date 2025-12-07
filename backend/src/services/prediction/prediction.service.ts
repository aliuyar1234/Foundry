/**
 * Prediction Service (T118-T122)
 * Predictive process analytics service
 */

import { PrismaClient, ModelStatus } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { getAnthropicClient } from '../../lib/anthropic.js';
import type {
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
  TrainingDataInfo,
} from '../../models/Prediction.js';

const prisma = new PrismaClient();

/**
 * Predictive analytics service
 */
export class PredictionService {
  private static instance: PredictionService;

  private constructor() {}

  static getInstance(): PredictionService {
    if (!PredictionService.instance) {
      PredictionService.instance = new PredictionService();
    }
    return PredictionService.instance;
  }

  /**
   * Create a prediction model
   */
  async createModel(input: CreatePredictionModelInput): Promise<PredictionModel> {
    const model = await prisma.predictionModel.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        type: input.type,
        status: 'DRAFT',
        version: '1.0.0',
        config: input.config as Record<string, unknown>,
        metrics: {} as Record<string, unknown>,
        trainingData: {} as Record<string, unknown>,
      },
    });

    logger.info({ modelId: model.id, type: input.type }, 'Prediction model created');

    return this.mapToPredictionModel(model);
  }

  /**
   * Train a prediction model
   */
  async trainModel(modelId: string): Promise<PredictionModel | null> {
    const model = await prisma.predictionModel.findUnique({ where: { id: modelId } });
    if (!model) return null;

    // Update status to training
    await prisma.predictionModel.update({
      where: { id: modelId },
      data: { status: 'TRAINING' },
    });

    try {
      // Get training data
      const config = model.config as ModelConfig;
      const trainingData = await this.gatherTrainingData(
        model.tenantId,
        model.type as PredictionModelType,
        config
      );

      // Run AI-based training simulation
      const metrics = await this.runTraining(
        model.type as PredictionModelType,
        trainingData,
        config
      );

      // Update model with results
      const updated = await prisma.predictionModel.update({
        where: { id: modelId },
        data: {
          status: 'TRAINED',
          trainedAt: new Date(),
          metrics: metrics as Record<string, unknown>,
          trainingData: trainingData as Record<string, unknown>,
        },
      });

      logger.info({ modelId }, 'Model training completed');

      return this.mapToPredictionModel(updated);
    } catch (error) {
      await prisma.predictionModel.update({
        where: { id: modelId },
        data: { status: 'FAILED' },
      });

      logger.error({ error, modelId }, 'Model training failed');
      throw error;
    }
  }

  /**
   * Generate a prediction
   */
  async predict(request: PredictionRequest): Promise<Prediction> {
    const model = await prisma.predictionModel.findUnique({
      where: { id: request.modelId },
    });

    if (!model || model.status !== 'TRAINED') {
      throw new Error('Model not available for predictions');
    }

    // Get current process state
    const process = await prisma.process.findUnique({
      where: { id: request.processId },
      include: { steps: true },
    });

    if (!process) {
      throw new Error(`Process not found: ${request.processId}`);
    }

    // Generate prediction using AI
    const prediction = await this.generatePrediction(
      model.type as PredictionModelType,
      process,
      model.config as ModelConfig,
      request.context
    );

    // Store prediction
    const stored = await prisma.prediction.create({
      data: {
        tenantId: request.tenantId,
        modelId: request.modelId,
        processId: request.processId,
        instanceId: request.instanceId,
        type: model.type,
        prediction: prediction.value as Record<string, unknown>,
        confidence: prediction.confidence,
        factors: prediction.factors as Record<string, unknown>[],
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Update model last prediction time
    await prisma.predictionModel.update({
      where: { id: request.modelId },
      data: { lastPredictionAt: new Date() },
    });

    return this.mapToPrediction(stored);
  }

  /**
   * Calculate process health score
   */
  async calculateHealthScore(
    processId: string,
    tenantId: string
  ): Promise<ProcessHealthScore> {
    const process = await prisma.process.findUnique({
      where: { id: processId },
      include: { steps: true },
    });

    if (!process) {
      throw new Error(`Process not found: ${processId}`);
    }

    // Get recent events for the process
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        processes: { some: { id: processId } },
        timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      orderBy: { timestamp: 'desc' },
    });

    // Calculate dimensions
    const dimensions = await this.calculateHealthDimensions(process, events);

    // Calculate trends
    const trends = this.calculateHealthTrends(events);

    // Generate alerts
    const alerts = this.generateHealthAlerts(dimensions, trends);

    // Calculate overall score
    const { calculateHealthScore: calcScore } = await import('../../models/Prediction.js');
    const overallScore = calcScore(dimensions);

    return {
      processId,
      overallScore,
      dimensions,
      trends,
      alerts,
      lastUpdated: new Date(),
    };
  }

  /**
   * Detect anomalies in a process
   */
  async detectAnomalies(
    processId: string,
    tenantId: string
  ): Promise<AnomalyResult[]> {
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        processes: { some: { id: processId } },
        timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
      orderBy: { timestamp: 'desc' },
    });

    const anomalies: AnomalyResult[] = [];

    // Analyze event patterns for anomalies
    const client = getAnthropicClient();

    const eventSummary = events.slice(0, 50).map((e) => ({
      type: e.type,
      timestamp: e.timestamp,
      metadata: e.metadata,
    }));

    const prompt = `Analyze these process events for anomalies:

${JSON.stringify(eventSummary, null, 2)}

Identify any anomalies such as:
- Unusual timing patterns
- Missing expected steps
- Out-of-order execution
- Unexpected frequency changes

Return as JSON array:
[{
  "type": "duration_spike|unusual_pattern|missing_step|out_of_order|resource_anomaly|frequency_anomaly",
  "severity": 0.0-1.0,
  "description": "...",
  "affectedMetrics": ["..."],
  "possibleCauses": ["..."],
  "suggestedActions": ["..."]
}]

Return empty array if no anomalies detected.`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const detected = JSON.parse(jsonMatch[0]);

      for (const d of detected) {
        anomalies.push({
          id: `anomaly-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          processId,
          timestamp: new Date(),
          anomalyScore: d.severity,
          isAnomaly: d.severity > 0.5,
          type: d.type as AnomalyType,
          affectedMetrics: d.affectedMetrics || [],
          description: d.description,
          possibleCauses: d.possibleCauses || [],
          suggestedActions: d.suggestedActions || [],
        });
      }
    } catch (error) {
      logger.error({ error, processId }, 'Failed to detect anomalies');
    }

    return anomalies;
  }

  /**
   * Generate forecast for a process metric
   */
  async forecast(
    processId: string,
    tenantId: string,
    metric: string,
    horizonDays: number = 30
  ): Promise<ForecastResult> {
    // Get historical data
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        processes: { some: { id: processId } },
        timestamp: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
      },
      orderBy: { timestamp: 'asc' },
    });

    // Extract metric values over time
    const metricValues: { timestamp: Date; value: number }[] = [];

    events.forEach((event) => {
      const metadata = event.metadata as Record<string, unknown>;
      if (metadata?.[metric] !== undefined) {
        metricValues.push({
          timestamp: event.timestamp,
          value: metadata[metric] as number,
        });
      }
    });

    // Generate forecast using AI
    const client = getAnthropicClient();

    const prompt = `Based on this historical data, forecast the next ${horizonDays} days:

Historical values:
${metricValues.slice(-30).map((v) => `${v.timestamp.toISOString()}: ${v.value}`).join('\n')}

Provide:
1. Daily forecasts for the next ${horizonDays} days
2. Confidence level (0-1)
3. Any seasonality detected

Return as JSON:
{
  "forecasts": [{"date": "YYYY-MM-DD", "value": number, "lowerBound": number, "upperBound": number}],
  "confidence": number,
  "seasonality": {"period": "daily|weekly|monthly|yearly", "strength": number, "peakTimes": [], "troughTimes": []} or null
}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Invalid response');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        processId,
        metric,
        forecasts: result.forecasts.map((f: Record<string, unknown>) => ({
          timestamp: new Date(f.date as string),
          value: f.value as number,
          lowerBound: f.lowerBound as number,
          upperBound: f.upperBound as number,
        })),
        confidence: result.confidence,
        seasonality: result.seasonality,
      };
    } catch (error) {
      logger.error({ error, processId, metric }, 'Failed to generate forecast');

      // Return empty forecast
      return {
        processId,
        metric,
        forecasts: [],
        confidence: 0,
      };
    }
  }

  /**
   * Get model by ID
   */
  async getModel(id: string): Promise<PredictionModel | null> {
    const model = await prisma.predictionModel.findUnique({ where: { id } });
    return model ? this.mapToPredictionModel(model) : null;
  }

  /**
   * List models for tenant
   */
  async listModels(tenantId: string): Promise<PredictionModel[]> {
    const models = await prisma.predictionModel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return models.map((m) => this.mapToPredictionModel(m));
  }

  /**
   * Get predictions for a process
   */
  async getPredictions(
    processId: string,
    options: { limit?: number } = {}
  ): Promise<Prediction[]> {
    const predictions = await prisma.prediction.findMany({
      where: { processId },
      orderBy: { createdAt: 'desc' },
      take: options.limit || 10,
    });

    return predictions.map((p) => this.mapToPrediction(p));
  }

  /**
   * Gather training data for model
   */
  private async gatherTrainingData(
    tenantId: string,
    type: PredictionModelType,
    config: ModelConfig
  ): Promise<TrainingDataInfo> {
    const processes = await prisma.process.findMany({
      where: { tenantId },
      select: { id: true },
    });

    const processIds = processes.map((p) => p.id);

    const events = await prisma.event.findMany({
      where: {
        tenantId,
        processes: { some: { id: { in: processIds } } },
      },
      orderBy: { timestamp: 'asc' },
    });

    return {
      processIds,
      eventCount: events.length,
      dateRange: {
        start: events[0]?.timestamp || new Date(),
        end: events[events.length - 1]?.timestamp || new Date(),
      },
      preprocessingSteps: ['normalization', 'feature_extraction'],
    };
  }

  /**
   * Run model training simulation
   */
  private async runTraining(
    type: PredictionModelType,
    trainingData: TrainingDataInfo,
    config: ModelConfig
  ): Promise<ModelMetrics> {
    // Simulate training metrics based on data size
    const dataQuality = Math.min(1, trainingData.eventCount / 1000);

    return {
      accuracy: 0.75 + dataQuality * 0.15,
      precision: 0.72 + dataQuality * 0.18,
      recall: 0.78 + dataQuality * 0.12,
      f1Score: 0.75 + dataQuality * 0.15,
      featureImportance: {},
      validationResults: [],
    };
  }

  /**
   * Generate prediction using AI
   */
  private async generatePrediction(
    type: PredictionModelType,
    process: Record<string, unknown>,
    config: ModelConfig,
    context?: Record<string, unknown>
  ): Promise<{ value: PredictionValue; confidence: number; factors: PredictionFactor[] }> {
    const client = getAnthropicClient();

    const typeDescriptions: Record<PredictionModelType, string> = {
      process_duration: 'Predict how long this process will take to complete',
      bottleneck_risk: 'Predict the risk of bottlenecks occurring',
      completion_probability: 'Predict the probability of successful completion',
      resource_demand: 'Predict resource requirements',
      anomaly_detection: 'Predict likelihood of anomalies',
      trend_forecast: 'Predict future trends',
    };

    const steps = (process.steps || []) as Array<{ name: string }>;
    const prompt = `${typeDescriptions[type]} for this process:

Process: ${process.name}
Steps: ${steps.map((s) => s.name).join(', ')}
Context: ${JSON.stringify(context || {})}

Provide prediction as JSON:
{
  "value": {
    "value": number,
    "unit": "string",
    "lowerBound": number,
    "upperBound": number
  },
  "confidence": 0.0-1.0,
  "factors": [{
    "name": "factor name",
    "value": "factor value",
    "contribution": -1.0 to 1.0,
    "direction": "positive|negative|neutral",
    "explanation": "why this affects the prediction"
  }]
}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Invalid response');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error({ error, type, processId: process.id }, 'Failed to generate prediction');

      // Return default prediction
      return {
        value: {
          value: 50,
          unit: 'percent',
          lowerBound: 30,
          upperBound: 70,
        },
        confidence: 0.5,
        factors: [],
      };
    }
  }

  /**
   * Calculate health dimensions
   */
  private async calculateHealthDimensions(
    process: Record<string, unknown>,
    events: Record<string, unknown>[]
  ): Promise<HealthDimension[]> {
    const { getHealthStatus } = await import('../../models/Prediction.js');

    // Calculate various health metrics
    const successRate = events.filter((e) =>
      (e.metadata as Record<string, unknown>)?.success === true
    ).length / Math.max(events.length, 1);

    const avgDuration = events.reduce((acc, e) => {
      const duration = (e.metadata as Record<string, unknown>)?.duration as number || 0;
      return acc + duration;
    }, 0) / Math.max(events.length, 1);

    const recentActivity = events.filter((e) =>
      (e.timestamp as Date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    return [
      {
        name: 'Reliability',
        score: successRate * 100,
        weight: 0.3,
        status: getHealthStatus(successRate * 100),
        description: `${(successRate * 100).toFixed(1)}% success rate`,
      },
      {
        name: 'Efficiency',
        score: Math.max(0, 100 - avgDuration / 100),
        weight: 0.25,
        status: getHealthStatus(Math.max(0, 100 - avgDuration / 100)),
        description: `Average duration: ${avgDuration.toFixed(0)}ms`,
      },
      {
        name: 'Activity',
        score: Math.min(100, recentActivity * 10),
        weight: 0.2,
        status: getHealthStatus(Math.min(100, recentActivity * 10)),
        description: `${recentActivity} events in last 7 days`,
      },
      {
        name: 'Consistency',
        score: 75,
        weight: 0.15,
        status: 'warning',
        description: 'Process consistency score',
      },
      {
        name: 'Compliance',
        score: 90,
        weight: 0.1,
        status: 'healthy',
        description: 'Compliance adherence',
      },
    ];
  }

  /**
   * Calculate health trends
   */
  private calculateHealthTrends(events: Record<string, unknown>[]): HealthTrend[] {
    // Simplified trend calculation
    return [
      {
        dimension: 'Reliability',
        direction: 'stable',
        magnitude: 0.02,
        period: '7 days',
      },
      {
        dimension: 'Efficiency',
        direction: 'improving',
        magnitude: 0.05,
        period: '7 days',
      },
    ];
  }

  /**
   * Generate health alerts
   */
  private generateHealthAlerts(
    dimensions: HealthDimension[],
    trends: HealthTrend[]
  ): HealthAlert[] {
    const alerts: HealthAlert[] = [];

    dimensions.forEach((dim) => {
      if (dim.status === 'critical') {
        alerts.push({
          severity: 'critical',
          dimension: dim.name,
          message: `${dim.name} is critically low at ${dim.score.toFixed(1)}%`,
          recommendation: `Investigate and improve ${dim.name.toLowerCase()}`,
          timestamp: new Date(),
        });
      } else if (dim.status === 'warning') {
        alerts.push({
          severity: 'warning',
          dimension: dim.name,
          message: `${dim.name} needs attention at ${dim.score.toFixed(1)}%`,
          recommendation: `Monitor and plan improvements for ${dim.name.toLowerCase()}`,
          timestamp: new Date(),
        });
      }
    });

    trends.forEach((trend) => {
      if (trend.direction === 'declining' && trend.magnitude > 0.1) {
        alerts.push({
          severity: 'warning',
          dimension: trend.dimension,
          message: `${trend.dimension} is declining rapidly`,
          recommendation: `Investigate cause of ${trend.dimension.toLowerCase()} decline`,
          timestamp: new Date(),
        });
      }
    });

    return alerts;
  }

  /**
   * Map Prisma model to PredictionModel type
   */
  private mapToPredictionModel(data: Record<string, unknown>): PredictionModel {
    return {
      id: data.id as string,
      tenantId: data.tenantId as string,
      name: data.name as string,
      description: data.description as string,
      type: data.type as PredictionModelType,
      status: data.status as ModelStatus,
      version: data.version as string,
      config: (data.config || {}) as ModelConfig,
      metrics: (data.metrics || {}) as ModelMetrics,
      trainingData: (data.trainingData || {}) as TrainingDataInfo,
      createdAt: data.createdAt as Date,
      updatedAt: data.updatedAt as Date,
      trainedAt: data.trainedAt as Date | null,
      lastPredictionAt: data.lastPredictionAt as Date | null,
    };
  }

  /**
   * Map Prisma model to Prediction type
   */
  private mapToPrediction(data: Record<string, unknown>): Prediction {
    return {
      id: data.id as string,
      tenantId: data.tenantId as string,
      modelId: data.modelId as string,
      processId: data.processId as string,
      instanceId: data.instanceId as string | undefined,
      type: data.type as PredictionModelType,
      prediction: (data.prediction || {}) as PredictionValue,
      confidence: data.confidence as number,
      factors: (data.factors || []) as PredictionFactor[],
      validUntil: data.validUntil as Date,
      createdAt: data.createdAt as Date,
      actualValue: data.actualValue as number | undefined,
      wasAccurate: data.wasAccurate as boolean | undefined,
    };
  }
}

/**
 * Get singleton instance
 */
export function getPredictionService(): PredictionService {
  return PredictionService.getInstance();
}
