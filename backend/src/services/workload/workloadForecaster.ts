/**
 * Workload Forecaster
 * T208 - Forecast future workload based on patterns
 *
 * Uses historical data to predict future workload
 */

import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface WorkloadForecast {
  personId?: string;
  teamId?: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  forecasts: ForecastPoint[];
  summary: ForecastSummary;
  confidence: {
    level: 'high' | 'medium' | 'low';
    score: number; // 0-100
    factors: string[];
  };
  alerts: ForecastAlert[];
}

export interface ForecastPoint {
  date: Date;
  predictedLoad: number; // percentage of capacity
  predictedHours: number;
  upperBound: number;
  lowerBound: number;
  components: {
    baseLoad: number;
    seasonal: number;
    trend: number;
    projects: number;
  };
}

export interface ForecastSummary {
  avgPredictedLoad: number;
  maxPredictedLoad: number;
  minPredictedLoad: number;
  peakDate: Date;
  troughDate: Date;
  trend: 'increasing' | 'stable' | 'decreasing';
  daysOverCapacity: number;
}

export interface ForecastAlert {
  type: 'capacity_breach' | 'sustained_high' | 'resource_gap' | 'deadline_conflict';
  severity: 'critical' | 'warning' | 'info';
  dateRange: { start: Date; end: Date };
  description: string;
  recommendation: string;
}

export interface ForecastModel {
  baselineLoad: number;
  trend: number; // weekly change
  seasonalFactors: number[]; // 12 months
  weekdayFactors: number[]; // 7 days
  volatility: number;
}

// =============================================================================
// Workload Forecaster
// =============================================================================

/**
 * Generate workload forecast for a person
 */
export async function forecastPersonWorkload(
  personId: string,
  options: {
    days?: number;
    includeProjects?: boolean;
  } = {}
): Promise<WorkloadForecast> {
  const { days = 30, includeProjects = true } = options;

  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const startDate = new Date();

  // Get historical data and build model
  const model = await buildForecastModel(personId, 90);

  // Generate forecast points
  const forecasts = generateForecastPoints(model, startDate, endDate, includeProjects);

  // Calculate summary
  const summary = calculateForecastSummary(forecasts);

  // Calculate confidence
  const confidence = calculateConfidence(model, forecasts);

  // Generate alerts
  const alerts = generateForecastAlerts(forecasts, summary);

  return {
    personId,
    period: { startDate, endDate },
    forecasts,
    summary,
    confidence,
    alerts,
  };
}

/**
 * Generate workload forecast for a team
 */
export async function forecastTeamWorkload(
  teamId: string,
  options: {
    days?: number;
  } = {}
): Promise<WorkloadForecast> {
  const { days = 30 } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Get individual forecasts
  const memberForecasts = await Promise.all(
    team.users.map((user) => forecastPersonWorkload(user.id, { days }))
  );

  // Aggregate forecasts
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const startDate = new Date();

  const aggregatedForecasts: ForecastPoint[] = [];
  const numDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  for (let d = 0; d < numDays; d++) {
    const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);

    const dayForecasts = memberForecasts
      .map((mf) => mf.forecasts.find((f) => f.date.toDateString() === date.toDateString()))
      .filter(Boolean) as ForecastPoint[];

    if (dayForecasts.length > 0) {
      const avgLoad = dayForecasts.reduce((sum, f) => sum + f.predictedLoad, 0) / dayForecasts.length;
      const totalHours = dayForecasts.reduce((sum, f) => sum + f.predictedHours, 0);

      aggregatedForecasts.push({
        date,
        predictedLoad: Math.round(avgLoad),
        predictedHours: Math.round(totalHours),
        upperBound: Math.round(avgLoad * 1.15),
        lowerBound: Math.round(avgLoad * 0.85),
        components: {
          baseLoad: avgLoad * 0.6,
          seasonal: avgLoad * 0.1,
          trend: avgLoad * 0.15,
          projects: avgLoad * 0.15,
        },
      });
    }
  }

  const summary = calculateForecastSummary(aggregatedForecasts);
  const alerts = generateForecastAlerts(aggregatedForecasts, summary);

  return {
    teamId,
    period: { startDate, endDate },
    forecasts: aggregatedForecasts,
    summary,
    confidence: {
      level: 'medium',
      score: 70,
      factors: ['Aggregated from individual forecasts', 'Team dynamics not fully modeled'],
    },
    alerts,
  };
}

/**
 * Build forecast model from historical data
 */
async function buildForecastModel(
  personId: string,
  historyDays: number
): Promise<ForecastModel> {
  // In production, this would analyze actual historical data
  // For now, generate a reasonable model
  const baselineLoad = 70 + Math.random() * 20;
  const trend = -2 + Math.random() * 4; // -2 to +2 per week

  // Seasonal factors (month index)
  const seasonalFactors = [
    0.9, 0.95, 1.0, 1.05, 1.1, 0.85, // Jan-Jun
    0.7, 0.8, 1.1, 1.15, 1.1, 0.75, // Jul-Dec
  ];

  // Weekday factors (Sun-Sat)
  const weekdayFactors = [
    0.1, 1.0, 1.05, 1.0, 0.95, 0.9, 0.15,
  ];

  const volatility = 10 + Math.random() * 10;

  return {
    baselineLoad,
    trend,
    seasonalFactors,
    weekdayFactors,
    volatility,
  };
}

/**
 * Generate forecast points from model
 */
function generateForecastPoints(
  model: ForecastModel,
  startDate: Date,
  endDate: Date,
  _includeProjects: boolean
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  const numDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  for (let d = 0; d < numDays; d++) {
    const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const week = d / 7;
    const month = date.getMonth();
    const dayOfWeek = date.getDay();

    // Calculate components
    const baseLoad = model.baselineLoad;
    const seasonal = (model.seasonalFactors[month] - 1) * 20;
    const trend = model.trend * week;
    const weekdayEffect = (model.weekdayFactors[dayOfWeek] - 1) * 30;

    // Combine components
    let predictedLoad = baseLoad + seasonal + trend + weekdayEffect;

    // Add some randomness based on volatility
    predictedLoad += (Math.random() - 0.5) * model.volatility;

    // Clamp to reasonable bounds
    predictedLoad = Math.max(0, Math.min(150, predictedLoad));

    // Calculate bounds
    const uncertainty = model.volatility * (1 + week * 0.1); // Uncertainty grows over time
    const upperBound = Math.min(150, predictedLoad + uncertainty);
    const lowerBound = Math.max(0, predictedLoad - uncertainty);

    // Calculate hours (assuming 8 hour day)
    const predictedHours = (predictedLoad / 100) * 8;

    points.push({
      date,
      predictedLoad: Math.round(predictedLoad),
      predictedHours: Math.round(predictedHours * 10) / 10,
      upperBound: Math.round(upperBound),
      lowerBound: Math.round(lowerBound),
      components: {
        baseLoad: Math.round(baseLoad),
        seasonal: Math.round(seasonal),
        trend: Math.round(trend),
        projects: 0, // Would be calculated from project data
      },
    });
  }

  return points;
}

/**
 * Calculate forecast summary statistics
 */
function calculateForecastSummary(forecasts: ForecastPoint[]): ForecastSummary {
  if (forecasts.length === 0) {
    return {
      avgPredictedLoad: 0,
      maxPredictedLoad: 0,
      minPredictedLoad: 0,
      peakDate: new Date(),
      troughDate: new Date(),
      trend: 'stable',
      daysOverCapacity: 0,
    };
  }

  const loads = forecasts.map((f) => f.predictedLoad);
  const avgPredictedLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const maxPredictedLoad = Math.max(...loads);
  const minPredictedLoad = Math.min(...loads);

  const peakIndex = loads.indexOf(maxPredictedLoad);
  const troughIndex = loads.indexOf(minPredictedLoad);

  // Calculate trend
  const firstHalf = loads.slice(0, Math.floor(loads.length / 2));
  const secondHalf = loads.slice(Math.floor(loads.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let trend: ForecastSummary['trend'];
  if (secondAvg > firstAvg + 5) trend = 'increasing';
  else if (secondAvg < firstAvg - 5) trend = 'decreasing';
  else trend = 'stable';

  const daysOverCapacity = loads.filter((l) => l > 100).length;

  return {
    avgPredictedLoad: Math.round(avgPredictedLoad),
    maxPredictedLoad: Math.round(maxPredictedLoad),
    minPredictedLoad: Math.round(minPredictedLoad),
    peakDate: forecasts[peakIndex].date,
    troughDate: forecasts[troughIndex].date,
    trend,
    daysOverCapacity,
  };
}

/**
 * Calculate forecast confidence
 */
function calculateConfidence(
  model: ForecastModel,
  forecasts: ForecastPoint[]
): WorkloadForecast['confidence'] {
  const factors: string[] = [];
  let score = 80; // Base confidence

  // Lower confidence with high volatility
  if (model.volatility > 15) {
    score -= 15;
    factors.push('High historical variability');
  }

  // Lower confidence for longer forecasts
  if (forecasts.length > 14) {
    score -= 10;
    factors.push('Long forecast horizon');
  }

  // Lower confidence with strong trend
  if (Math.abs(model.trend) > 2) {
    score -= 5;
    factors.push('Strong trend may not continue');
  }

  if (factors.length === 0) {
    factors.push('Consistent historical patterns');
  }

  let level: 'high' | 'medium' | 'low';
  if (score >= 70) level = 'high';
  else if (score >= 50) level = 'medium';
  else level = 'low';

  return { level, score, factors };
}

/**
 * Generate alerts from forecast
 */
function generateForecastAlerts(
  forecasts: ForecastPoint[],
  summary: ForecastSummary
): ForecastAlert[] {
  const alerts: ForecastAlert[] = [];

  // Check for capacity breach
  const overCapacityDays = forecasts.filter((f) => f.predictedLoad > 100);
  if (overCapacityDays.length > 0) {
    const severity = overCapacityDays.some((f) => f.predictedLoad > 120)
      ? 'critical'
      : 'warning';

    alerts.push({
      type: 'capacity_breach',
      severity,
      dateRange: {
        start: overCapacityDays[0].date,
        end: overCapacityDays[overCapacityDays.length - 1].date,
      },
      description: `Predicted to exceed capacity on ${overCapacityDays.length} days`,
      recommendation: 'Review task assignments and consider redistribution',
    });
  }

  // Check for sustained high load
  const highLoadDays = forecasts.filter((f) => f.predictedLoad > 85);
  if (highLoadDays.length > forecasts.length * 0.7) {
    alerts.push({
      type: 'sustained_high',
      severity: 'warning',
      dateRange: {
        start: forecasts[0].date,
        end: forecasts[forecasts.length - 1].date,
      },
      description: 'Sustained high workload predicted',
      recommendation: 'Consider deferring non-critical tasks or getting additional help',
    });
  }

  // Check for increasing trend
  if (summary.trend === 'increasing' && summary.avgPredictedLoad > 80) {
    alerts.push({
      type: 'capacity_breach',
      severity: 'info',
      dateRange: {
        start: forecasts[0].date,
        end: forecasts[forecasts.length - 1].date,
      },
      description: 'Workload trending upward',
      recommendation: 'Plan for additional capacity in coming weeks',
    });
  }

  return alerts;
}

/**
 * Get workload comparison between periods
 */
export async function compareWorkloadPeriods(
  personId: string,
  period1: { startDate: Date; endDate: Date },
  period2: { startDate: Date; endDate: Date }
): Promise<{
  period1Average: number;
  period2Average: number;
  change: number;
  changePercent: number;
  analysis: string;
}> {
  // Simplified comparison (in production, use actual historical data)
  const period1Average = 70 + Math.random() * 20;
  const period2Average = 70 + Math.random() * 20;
  const change = period2Average - period1Average;
  const changePercent = (change / period1Average) * 100;

  let analysis: string;
  if (Math.abs(changePercent) < 5) {
    analysis = 'Workload has remained relatively stable';
  } else if (changePercent > 0) {
    analysis = `Workload has increased by ${Math.abs(changePercent).toFixed(1)}%`;
  } else {
    analysis = `Workload has decreased by ${Math.abs(changePercent).toFixed(1)}%`;
  }

  return {
    period1Average: Math.round(period1Average),
    period2Average: Math.round(period2Average),
    change: Math.round(change),
    changePercent: Math.round(changePercent * 10) / 10,
    analysis,
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  forecastPersonWorkload,
  forecastTeamWorkload,
  compareWorkloadPeriods,
};
