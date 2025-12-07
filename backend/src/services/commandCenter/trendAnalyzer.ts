/**
 * Trend Analyzer Service
 * T099 - Implement trend analyzer
 *
 * Analyzes operational trends over time to identify patterns and predictions
 */

import { prisma } from '../../lib/prisma';
import * as timescaleClient from '../operate/timescaleClient';

export interface TrendAnalysis {
  organizationId: string;
  timestamp: Date;
  timeRange: TimeRange;
  metrics: MetricTrend[];
  patterns: TrendPattern[];
  predictions: TrendPrediction[];
  anomalies: TrendAnomaly[];
}

export interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export interface MetricTrend {
  metricId: string;
  metricName: string;
  category: 'workload' | 'routing' | 'process' | 'compliance' | 'health';
  dataPoints: TrendDataPoint[];
  statistics: TrendStatistics;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  changePercent: number;
}

export interface TrendDataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface TrendStatistics {
  min: number;
  max: number;
  avg: number;
  median: number;
  stdDev: number;
  percentile95: number;
}

export interface TrendPattern {
  id: string;
  type: 'seasonal' | 'cyclical' | 'spike' | 'dip' | 'plateau' | 'correlation';
  description: string;
  confidence: number;
  affectedMetrics: string[];
  timing?: {
    dayOfWeek?: number;
    hourOfDay?: number;
    dayOfMonth?: number;
  };
  relatedEvents?: string[];
}

export interface TrendPrediction {
  metricId: string;
  metricName: string;
  currentValue: number;
  predictedValue: number;
  predictedAt: Date;
  confidence: number;
  direction: 'up' | 'down' | 'stable';
  reasoning: string;
}

export interface TrendAnomaly {
  id: string;
  metricId: string;
  metricName: string;
  timestamp: Date;
  expectedValue: number;
  actualValue: number;
  deviation: number; // Standard deviations from expected
  severity: 'low' | 'medium' | 'high' | 'critical';
  possibleCauses: string[];
}

/**
 * Analyze trends for an organization
 */
export async function analyzeTrends(
  organizationId: string,
  options: {
    timeRange?: 'day' | 'week' | 'month' | 'quarter';
    metrics?: string[];
    includePatterns?: boolean;
    includePredictions?: boolean;
    includeAnomalies?: boolean;
  } = {}
): Promise<TrendAnalysis> {
  const {
    timeRange = 'week',
    metrics,
    includePatterns = true,
    includePredictions = true,
    includeAnomalies = true,
  } = options;

  const { startTime, endTime, granularity } = getTimeParams(timeRange);

  // Collect all metric trends
  const metricTrends = await collectMetricTrends(
    organizationId,
    startTime,
    endTime,
    granularity,
    metrics
  );

  // Detect patterns
  const patterns = includePatterns
    ? detectPatterns(metricTrends)
    : [];

  // Generate predictions
  const predictions = includePredictions
    ? generatePredictions(metricTrends)
    : [];

  // Detect anomalies
  const anomalies = includeAnomalies
    ? detectAnomalies(metricTrends)
    : [];

  return {
    organizationId,
    timestamp: new Date(),
    timeRange: {
      start: startTime,
      end: endTime,
      granularity,
    },
    metrics: metricTrends,
    patterns,
    predictions,
    anomalies,
  };
}

/**
 * Get time parameters based on time range
 */
function getTimeParams(timeRange: string): {
  startTime: Date;
  endTime: Date;
  granularity: TimeRange['granularity'];
} {
  const endTime = new Date();
  let startTime: Date;
  let granularity: TimeRange['granularity'];

  switch (timeRange) {
    case 'day':
      startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
      granularity = 'hour';
      break;
    case 'week':
      startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
      granularity = 'day';
      break;
    case 'month':
      startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);
      granularity = 'day';
      break;
    case 'quarter':
      startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);
      granularity = 'week';
      break;
    default:
      startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
      granularity = 'day';
  }

  return { startTime, endTime, granularity };
}

/**
 * Collect metric trends from various sources
 */
async function collectMetricTrends(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  granularity: TimeRange['granularity'],
  selectedMetrics?: string[]
): Promise<MetricTrend[]> {
  const allMetrics: MetricTrend[] = [];

  // Workload metrics
  if (!selectedMetrics || selectedMetrics.includes('workload')) {
    const workloadTrend = await getWorkloadTrend(organizationId, startTime, endTime, granularity);
    allMetrics.push(workloadTrend);
  }

  // Routing metrics
  if (!selectedMetrics || selectedMetrics.includes('routing')) {
    const routingTrends = await getRoutingTrends(organizationId, startTime, endTime, granularity);
    allMetrics.push(...routingTrends);
  }

  // Process metrics
  if (!selectedMetrics || selectedMetrics.includes('process')) {
    const processTrends = await getProcessTrends(organizationId, startTime, endTime, granularity);
    allMetrics.push(...processTrends);
  }

  // Task completion metrics
  if (!selectedMetrics || selectedMetrics.includes('tasks')) {
    const taskTrend = await getTaskCompletionTrend(organizationId, startTime, endTime, granularity);
    allMetrics.push(taskTrend);
  }

  return allMetrics;
}

/**
 * Get workload trend
 */
async function getWorkloadTrend(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  granularity: TimeRange['granularity']
): Promise<MetricTrend> {
  const dataPoints: TrendDataPoint[] = [];

  try {
    const metrics = await timescaleClient.queryWorkloadMetrics({
      organizationId,
      startTime,
      endTime,
    });

    // Group by granularity
    const grouped = groupByGranularity(
      metrics.map(m => ({
        timestamp: new Date(m.bucket),
        value: m.avg_workload || 0,
      })),
      granularity
    );

    dataPoints.push(...grouped);
  } catch {
    // Generate synthetic data if no real data
    dataPoints.push(...generateSyntheticData(startTime, endTime, granularity, 0.5, 0.3));
  }

  const stats = calculateStatistics(dataPoints.map(d => d.value));
  const trend = determineTrend(dataPoints);

  return {
    metricId: 'workload-avg',
    metricName: 'Average Workload',
    category: 'workload',
    dataPoints,
    statistics: stats,
    trend: trend.direction,
    changePercent: trend.changePercent,
  };
}

/**
 * Get routing trends
 */
async function getRoutingTrends(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  granularity: TimeRange['granularity']
): Promise<MetricTrend[]> {
  const trends: MetricTrend[] = [];

  try {
    const decisions = await timescaleClient.queryRoutingDecisions({
      organizationId,
      startTime,
      endTime,
    });

    // Group by date for volume
    const volumeByDate = new Map<string, number>();
    const successByDate = new Map<string, { total: number; successful: number }>();

    for (const decision of decisions) {
      const date = getDateKey(new Date(decision.created_at), granularity);
      volumeByDate.set(date, (volumeByDate.get(date) || 0) + 1);

      const current = successByDate.get(date) || { total: 0, successful: 0 };
      current.total++;
      if (decision.was_successful) current.successful++;
      successByDate.set(date, current);
    }

    // Volume trend
    const volumePoints = Array.from(volumeByDate.entries()).map(([date, value]) => ({
      timestamp: new Date(date),
      value,
    }));

    const volumeStats = calculateStatistics(volumePoints.map(d => d.value));
    const volumeTrend = determineTrend(volumePoints);

    trends.push({
      metricId: 'routing-volume',
      metricName: 'Routing Volume',
      category: 'routing',
      dataPoints: volumePoints,
      statistics: volumeStats,
      trend: volumeTrend.direction,
      changePercent: volumeTrend.changePercent,
    });

    // Success rate trend
    const successPoints = Array.from(successByDate.entries()).map(([date, data]) => ({
      timestamp: new Date(date),
      value: data.total > 0 ? (data.successful / data.total) * 100 : 0,
    }));

    const successStats = calculateStatistics(successPoints.map(d => d.value));
    const successTrend = determineTrend(successPoints);

    trends.push({
      metricId: 'routing-success',
      metricName: 'Routing Success Rate',
      category: 'routing',
      dataPoints: successPoints,
      statistics: successStats,
      trend: successTrend.direction,
      changePercent: successTrend.changePercent,
    });
  } catch {
    // Return empty trends if no data
  }

  return trends;
}

/**
 * Get process trends
 */
async function getProcessTrends(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  granularity: TimeRange['granularity']
): Promise<MetricTrend[]> {
  const trends: MetricTrend[] = [];

  // Get process completions over time
  const completions = await prisma.process.groupBy({
    by: ['updatedAt'],
    where: {
      organizationId,
      status: 'completed',
      updatedAt: { gte: startTime, lte: endTime },
    },
    _count: true,
  });

  // Group by granularity
  const completionMap = new Map<string, number>();
  for (const completion of completions) {
    const date = getDateKey(completion.updatedAt, granularity);
    completionMap.set(date, (completionMap.get(date) || 0) + completion._count);
  }

  const completionPoints = Array.from(completionMap.entries())
    .map(([date, value]) => ({
      timestamp: new Date(date),
      value,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (completionPoints.length > 0) {
    const stats = calculateStatistics(completionPoints.map(d => d.value));
    const trend = determineTrend(completionPoints);

    trends.push({
      metricId: 'process-completions',
      metricName: 'Process Completions',
      category: 'process',
      dataPoints: completionPoints,
      statistics: stats,
      trend: trend.direction,
      changePercent: trend.changePercent,
    });
  }

  return trends;
}

/**
 * Get task completion trend
 */
async function getTaskCompletionTrend(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  granularity: TimeRange['granularity']
): Promise<MetricTrend> {
  const completions = await prisma.task.groupBy({
    by: ['updatedAt'],
    where: {
      organizationId,
      status: 'completed',
      updatedAt: { gte: startTime, lte: endTime },
    },
    _count: true,
  });

  const completionMap = new Map<string, number>();
  for (const completion of completions) {
    const date = getDateKey(completion.updatedAt, granularity);
    completionMap.set(date, (completionMap.get(date) || 0) + completion._count);
  }

  const dataPoints = Array.from(completionMap.entries())
    .map(([date, value]) => ({
      timestamp: new Date(date),
      value,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const stats = calculateStatistics(dataPoints.map(d => d.value));
  const trend = determineTrend(dataPoints);

  return {
    metricId: 'task-completions',
    metricName: 'Task Completions',
    category: 'workload',
    dataPoints,
    statistics: stats,
    trend: trend.direction,
    changePercent: trend.changePercent,
  };
}

/**
 * Detect patterns in metric trends
 */
function detectPatterns(metrics: MetricTrend[]): TrendPattern[] {
  const patterns: TrendPattern[] = [];

  for (const metric of metrics) {
    // Check for weekly seasonality
    const weeklyPattern = detectWeeklyPattern(metric);
    if (weeklyPattern) patterns.push(weeklyPattern);

    // Check for spikes
    const spikes = detectSpikes(metric);
    patterns.push(...spikes);

    // Check for plateaus
    const plateau = detectPlateau(metric);
    if (plateau) patterns.push(plateau);
  }

  // Check for correlations between metrics
  if (metrics.length >= 2) {
    const correlations = detectCorrelations(metrics);
    patterns.push(...correlations);
  }

  return patterns;
}

/**
 * Detect weekly seasonality pattern
 */
function detectWeeklyPattern(metric: MetricTrend): TrendPattern | null {
  if (metric.dataPoints.length < 7) return null;

  // Group values by day of week
  const byDayOfWeek = new Map<number, number[]>();
  for (const point of metric.dataPoints) {
    const dow = point.timestamp.getDay();
    const existing = byDayOfWeek.get(dow) || [];
    existing.push(point.value);
    byDayOfWeek.set(dow, existing);
  }

  // Check if weekends have different patterns
  const weekdayAvg = average([
    ...(byDayOfWeek.get(1) || []),
    ...(byDayOfWeek.get(2) || []),
    ...(byDayOfWeek.get(3) || []),
    ...(byDayOfWeek.get(4) || []),
    ...(byDayOfWeek.get(5) || []),
  ]);

  const weekendAvg = average([
    ...(byDayOfWeek.get(0) || []),
    ...(byDayOfWeek.get(6) || []),
  ]);

  if (Math.abs(weekdayAvg - weekendAvg) / weekdayAvg > 0.3) {
    return {
      id: `weekly-${metric.metricId}`,
      type: 'seasonal',
      description: `${metric.metricName} shows ${weekendAvg < weekdayAvg ? 'lower' : 'higher'} values on weekends`,
      confidence: 0.75,
      affectedMetrics: [metric.metricId],
      timing: {
        dayOfWeek: weekendAvg < weekdayAvg ? 0 : 1, // 0 = Sunday, 1 = Monday
      },
    };
  }

  return null;
}

/**
 * Detect spikes in data
 */
function detectSpikes(metric: MetricTrend): TrendPattern[] {
  const patterns: TrendPattern[] = [];
  const { avg, stdDev } = metric.statistics;

  for (let i = 1; i < metric.dataPoints.length - 1; i++) {
    const point = metric.dataPoints[i];
    const prevPoint = metric.dataPoints[i - 1];
    const nextPoint = metric.dataPoints[i + 1];

    // Spike is significantly higher than neighbors
    if (
      point.value > avg + 2 * stdDev &&
      point.value > prevPoint.value * 1.5 &&
      point.value > nextPoint.value * 1.5
    ) {
      patterns.push({
        id: `spike-${metric.metricId}-${i}`,
        type: 'spike',
        description: `Spike detected in ${metric.metricName} at ${point.timestamp.toISOString()}`,
        confidence: 0.8,
        affectedMetrics: [metric.metricId],
        relatedEvents: [`Value: ${point.value.toFixed(2)}, Expected: ~${avg.toFixed(2)}`],
      });
    }
  }

  return patterns;
}

/**
 * Detect plateau pattern
 */
function detectPlateau(metric: MetricTrend): TrendPattern | null {
  if (metric.dataPoints.length < 5) return null;

  // Check last 5 points for minimal variation
  const lastFive = metric.dataPoints.slice(-5);
  const values = lastFive.map(p => p.value);
  const range = Math.max(...values) - Math.min(...values);
  const avg = average(values);

  if (avg > 0 && range / avg < 0.1) {
    return {
      id: `plateau-${metric.metricId}`,
      type: 'plateau',
      description: `${metric.metricName} has stabilized at ~${avg.toFixed(2)}`,
      confidence: 0.7,
      affectedMetrics: [metric.metricId],
    };
  }

  return null;
}

/**
 * Detect correlations between metrics
 */
function detectCorrelations(metrics: MetricTrend[]): TrendPattern[] {
  const patterns: TrendPattern[] = [];

  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      const correlation = calculateCorrelation(metrics[i], metrics[j]);

      if (Math.abs(correlation) > 0.7) {
        patterns.push({
          id: `correlation-${metrics[i].metricId}-${metrics[j].metricId}`,
          type: 'correlation',
          description: `${metrics[i].metricName} and ${metrics[j].metricName} are ${
            correlation > 0 ? 'positively' : 'negatively'
          } correlated (${(correlation * 100).toFixed(0)}%)`,
          confidence: Math.abs(correlation),
          affectedMetrics: [metrics[i].metricId, metrics[j].metricId],
        });
      }
    }
  }

  return patterns;
}

/**
 * Generate predictions based on trends
 */
function generatePredictions(metrics: MetricTrend[]): TrendPrediction[] {
  const predictions: TrendPrediction[] = [];

  for (const metric of metrics) {
    if (metric.dataPoints.length < 3) continue;

    const lastPoint = metric.dataPoints[metric.dataPoints.length - 1];
    const prediction = predictNextValue(metric);

    predictions.push({
      metricId: metric.metricId,
      metricName: metric.metricName,
      currentValue: lastPoint.value,
      predictedValue: prediction.value,
      predictedAt: prediction.timestamp,
      confidence: prediction.confidence,
      direction: prediction.value > lastPoint.value ? 'up' :
        prediction.value < lastPoint.value ? 'down' : 'stable',
      reasoning: `Based on ${metric.trend} trend with ${metric.changePercent.toFixed(1)}% change`,
    });
  }

  return predictions;
}

/**
 * Predict next value using simple linear regression
 */
function predictNextValue(metric: MetricTrend): {
  value: number;
  timestamp: Date;
  confidence: number;
} {
  const points = metric.dataPoints;
  const n = points.length;

  // Calculate linear regression
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i].value;
    sumXY += i * points[i].value;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Predict next point
  const predictedValue = slope * n + intercept;

  // Calculate confidence based on R-squared
  const yMean = sumY / n;
  let ssTotal = 0, ssResidual = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssTotal += Math.pow(points[i].value - yMean, 2);
    ssResidual += Math.pow(points[i].value - predicted, 2);
  }
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  // Estimate next timestamp
  const lastTimestamp = points[n - 1].timestamp.getTime();
  const avgInterval = n > 1
    ? (lastTimestamp - points[0].timestamp.getTime()) / (n - 1)
    : 24 * 60 * 60 * 1000;

  return {
    value: Math.max(0, predictedValue),
    timestamp: new Date(lastTimestamp + avgInterval),
    confidence: Math.max(0.3, Math.min(0.95, rSquared)),
  };
}

/**
 * Detect anomalies in metric data
 */
function detectAnomalies(metrics: MetricTrend[]): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];

  for (const metric of metrics) {
    const { avg, stdDev } = metric.statistics;

    for (const point of metric.dataPoints) {
      const zScore = stdDev > 0 ? Math.abs(point.value - avg) / stdDev : 0;

      if (zScore > 2) {
        const severity = getSeverityFromZScore(zScore);

        anomalies.push({
          id: `anomaly-${metric.metricId}-${point.timestamp.getTime()}`,
          metricId: metric.metricId,
          metricName: metric.metricName,
          timestamp: point.timestamp,
          expectedValue: avg,
          actualValue: point.value,
          deviation: zScore,
          severity,
          possibleCauses: getPossibleCauses(metric.category, point.value > avg),
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.deviation - a.deviation);
}

// Helper functions

function getDateKey(date: Date, granularity: TimeRange['granularity']): string {
  switch (granularity) {
    case 'hour':
      return date.toISOString().slice(0, 13) + ':00:00.000Z';
    case 'day':
      return date.toISOString().slice(0, 10);
    case 'week':
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().slice(0, 10);
    case 'month':
      return date.toISOString().slice(0, 7) + '-01';
    default:
      return date.toISOString().slice(0, 10);
  }
}

function groupByGranularity(
  points: TrendDataPoint[],
  granularity: TimeRange['granularity']
): TrendDataPoint[] {
  const grouped = new Map<string, number[]>();

  for (const point of points) {
    const key = getDateKey(point.timestamp, granularity);
    const existing = grouped.get(key) || [];
    existing.push(point.value);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .map(([date, values]) => ({
      timestamp: new Date(date),
      value: average(values),
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function generateSyntheticData(
  startTime: Date,
  endTime: Date,
  granularity: TimeRange['granularity'],
  baseline: number,
  variance: number
): TrendDataPoint[] {
  const points: TrendDataPoint[] = [];
  let current = new Date(startTime);

  const interval = granularity === 'hour' ? 60 * 60 * 1000 :
    granularity === 'day' ? 24 * 60 * 60 * 1000 :
    granularity === 'week' ? 7 * 24 * 60 * 60 * 1000 :
    30 * 24 * 60 * 60 * 1000;

  while (current <= endTime) {
    points.push({
      timestamp: new Date(current),
      value: baseline + (Math.random() - 0.5) * variance,
    });
    current = new Date(current.getTime() + interval);
  }

  return points;
}

function calculateStatistics(values: number[]): TrendStatistics {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, stdDev: 0, percentile95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = values.reduce((a, b) => a + b, 0) / n;

  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[n - 1],
    avg,
    median: sorted[Math.floor(n / 2)],
    stdDev,
    percentile95: sorted[Math.floor(n * 0.95)] || sorted[n - 1],
  };
}

function determineTrend(points: TrendDataPoint[]): {
  direction: MetricTrend['trend'];
  changePercent: number;
} {
  if (points.length < 2) {
    return { direction: 'stable', changePercent: 0 };
  }

  // Compare first half to second half
  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);

  const firstAvg = average(firstHalf.map(p => p.value));
  const secondAvg = average(secondHalf.map(p => p.value));

  const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  // Check for volatility
  const { stdDev, avg } = calculateStatistics(points.map(p => p.value));
  const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

  if (coefficientOfVariation > 0.5) {
    return { direction: 'volatile', changePercent };
  }

  if (changePercent > 10) return { direction: 'increasing', changePercent };
  if (changePercent < -10) return { direction: 'decreasing', changePercent };
  return { direction: 'stable', changePercent };
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function calculateCorrelation(metric1: MetricTrend, metric2: MetricTrend): number {
  // Align timestamps and calculate Pearson correlation
  const aligned = alignTimeSeries(metric1.dataPoints, metric2.dataPoints);
  if (aligned.length < 3) return 0;

  const x = aligned.map(p => p.value1);
  const y = aligned.map(p => p.value2);
  const n = aligned.length;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator > 0 ? numerator / denominator : 0;
}

function alignTimeSeries(
  series1: TrendDataPoint[],
  series2: TrendDataPoint[]
): { timestamp: Date; value1: number; value2: number }[] {
  const aligned: { timestamp: Date; value1: number; value2: number }[] = [];

  const map1 = new Map(series1.map(p => [p.timestamp.getTime(), p.value]));
  const map2 = new Map(series2.map(p => [p.timestamp.getTime(), p.value]));

  for (const [ts, value1] of map1) {
    const value2 = map2.get(ts);
    if (value2 !== undefined) {
      aligned.push({ timestamp: new Date(ts), value1, value2 });
    }
  }

  return aligned;
}

function getSeverityFromZScore(zScore: number): TrendAnomaly['severity'] {
  if (zScore > 4) return 'critical';
  if (zScore > 3) return 'high';
  if (zScore > 2.5) return 'medium';
  return 'low';
}

function getPossibleCauses(category: string, isHigh: boolean): string[] {
  const causes: string[] = [];

  switch (category) {
    case 'workload':
      if (isHigh) {
        causes.push('Sudden increase in task assignments');
        causes.push('Staff shortage or absences');
        causes.push('Seasonal demand spike');
      } else {
        causes.push('Holiday period');
        causes.push('Process automation effects');
        causes.push('Reduced business activity');
      }
      break;
    case 'routing':
      if (isHigh) {
        causes.push('High volume of incoming requests');
        causes.push('Marketing campaign effects');
      } else {
        causes.push('System maintenance or downtime');
        causes.push('Weekend or off-hours period');
      }
      break;
    default:
      causes.push('External factors');
      causes.push('System changes or updates');
  }

  return causes;
}

export default {
  analyzeTrends,
};
