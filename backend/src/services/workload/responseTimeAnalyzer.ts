/**
 * Response Time Analyzer
 * T206 - Analyze response time patterns and pressure
 *
 * Identifies unhealthy response time patterns and expectations
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface ResponseTimeAnalysis {
  personId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  overall: {
    avgResponseTime: number; // minutes
    medianResponseTime: number;
    p95ResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    totalResponses: number;
  };
  byChannel: Record<string, ChannelResponseMetrics>;
  byTimeOfDay: {
    workingHours: ResponseTimeStats;
    afterHours: ResponseTimeStats;
    weekends: ResponseTimeStats;
  };
  byUrgency: {
    urgent: ResponseTimeStats;
    normal: ResponseTimeStats;
    low: ResponseTimeStats;
  };
  trends: ResponseTimeTrend[];
  pressure: ResponseTimePressure;
  recommendations: string[];
}

export interface ChannelResponseMetrics {
  avgResponseTime: number;
  medianResponseTime: number;
  responseCount: number;
  expectedSLA?: number;
  slaCompliance?: number;
}

export interface ResponseTimeStats {
  avgResponseTime: number;
  medianResponseTime: number;
  count: number;
  percentOfTotal: number;
}

export interface ResponseTimeTrend {
  date: Date;
  avgResponseTime: number;
  responseCount: number;
  urgentResponseTime?: number;
}

export interface ResponseTimePressure {
  score: number; // 0-100 (higher = more pressure)
  level: 'critical' | 'high' | 'moderate' | 'healthy';
  indicators: PressureIndicator[];
}

export interface PressureIndicator {
  name: string;
  value: number;
  threshold: number;
  status: 'exceeds' | 'warning' | 'ok';
  impact: string;
}

export interface TeamResponseTimeAnalysis {
  teamId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  teamAverage: number;
  teamMedian: number;
  distribution: {
    under5min: number;
    under15min: number;
    under30min: number;
    under1hour: number;
    over1hour: number;
  };
  memberComparison: Array<{
    personId: string;
    personName: string;
    avgResponseTime: number;
    pressureLevel: string;
  }>;
  hotspots: Array<{
    personId: string;
    personName: string;
    issue: string;
    severity: string;
  }>;
}

// =============================================================================
// Constants
// =============================================================================

const PRESSURE_THRESHOLDS = {
  veryFast: 5, // minutes
  fast: 15,
  normal: 30,
  slow: 60,
};

const CHANNEL_SLAS: Record<string, number> = {
  slack: 15,
  teams: 15,
  email: 60,
  support: 30,
};

// =============================================================================
// Response Time Analyzer
// =============================================================================

const prisma = new PrismaClient();

/**
 * Analyze response time patterns for a person
 */
export async function analyzeResponseTime(
  personId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    channels?: string[];
  } = {}
): Promise<ResponseTimeAnalysis> {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    channels,
  } = options;

  // Get response events (simulated - in production, integrate with communication systems)
  const responses = await getResponseEvents(personId, startDate, endDate, channels);

  // Calculate overall stats
  const responseTimes = responses.map((r) => r.responseTime).sort((a, b) => a - b);
  const overall = calculateOverallStats(responseTimes, responses.length);

  // Calculate by channel
  const byChannel = calculateByChannel(responses);

  // Calculate by time of day
  const byTimeOfDay = calculateByTimeOfDay(responses);

  // Calculate by urgency
  const byUrgency = calculateByUrgency(responses);

  // Calculate trends
  const trends = calculateTrends(responses, startDate, endDate);

  // Calculate pressure
  const pressure = calculatePressure(overall, byTimeOfDay, byUrgency);

  // Generate recommendations
  const recommendations = generateRecommendations(pressure, byTimeOfDay, byUrgency);

  return {
    personId,
    period: { startDate, endDate },
    overall,
    byChannel,
    byTimeOfDay,
    byUrgency,
    trends,
    pressure,
    recommendations,
  };
}

/**
 * Analyze response times for a team
 */
export async function analyzeTeamResponseTime(
  teamId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<TeamResponseTimeAnalysis> {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
  } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Get analysis for each member
  const memberAnalyses = await Promise.all(
    team.users.map(async (user) => ({
      user,
      analysis: await analyzeResponseTime(user.id, { startDate, endDate }),
    }))
  );

  // Calculate team stats
  const allResponseTimes = memberAnalyses.flatMap(
    (ma) => Array(ma.analysis.overall.totalResponses).fill(ma.analysis.overall.avgResponseTime)
  );
  const teamAverage =
    allResponseTimes.length > 0
      ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
      : 0;
  const sortedTimes = [...allResponseTimes].sort((a, b) => a - b);
  const teamMedian = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length / 2)] : 0;

  // Calculate distribution
  const distribution = {
    under5min: 0,
    under15min: 0,
    under30min: 0,
    under1hour: 0,
    over1hour: 0,
  };

  for (const ma of memberAnalyses) {
    const avg = ma.analysis.overall.avgResponseTime;
    if (avg < 5) distribution.under5min++;
    else if (avg < 15) distribution.under15min++;
    else if (avg < 30) distribution.under30min++;
    else if (avg < 60) distribution.under1hour++;
    else distribution.over1hour++;
  }

  // Member comparison
  const memberComparison = memberAnalyses.map((ma) => ({
    personId: ma.user.id,
    personName: ma.user.name || ma.user.email,
    avgResponseTime: Math.round(ma.analysis.overall.avgResponseTime),
    pressureLevel: ma.analysis.pressure.level,
  }));

  // Identify hotspots
  const hotspots = memberAnalyses
    .filter((ma) => ma.analysis.pressure.level === 'critical' || ma.analysis.pressure.level === 'high')
    .map((ma) => ({
      personId: ma.user.id,
      personName: ma.user.name || ma.user.email,
      issue: ma.analysis.pressure.indicators[0]?.impact || 'High response time pressure',
      severity: ma.analysis.pressure.level,
    }));

  return {
    teamId,
    period: { startDate, endDate },
    teamAverage: Math.round(teamAverage),
    teamMedian: Math.round(teamMedian),
    distribution,
    memberComparison,
    hotspots,
  };
}

/**
 * Get expected vs actual response time comparison
 */
export async function compareToExpectations(
  personId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  overall: { expected: number; actual: number; difference: number };
  byChannel: Record<string, { expected: number; actual: number; compliance: number }>;
  suggestions: string[];
}> {
  const analysis = await analyzeResponseTime(personId, options);

  const byChannel: Record<string, { expected: number; actual: number; compliance: number }> = {};

  for (const [channel, metrics] of Object.entries(analysis.byChannel)) {
    const expected = metrics.expectedSLA || CHANNEL_SLAS[channel] || 30;
    byChannel[channel] = {
      expected,
      actual: metrics.avgResponseTime,
      compliance: metrics.slaCompliance || (metrics.avgResponseTime <= expected ? 100 : 50),
    };
  }

  const suggestions: string[] = [];

  for (const [channel, data] of Object.entries(byChannel)) {
    if (data.actual < data.expected * 0.5) {
      suggestions.push(`Consider relaxing response time expectations for ${channel}`);
    } else if (data.actual > data.expected) {
      suggestions.push(`Review capacity for handling ${channel} messages`);
    }
  }

  const expectedOverall = 30; // Default expected response time
  return {
    overall: {
      expected: expectedOverall,
      actual: analysis.overall.avgResponseTime,
      difference: analysis.overall.avgResponseTime - expectedOverall,
    },
    byChannel,
    suggestions,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

interface ResponseEvent {
  id: string;
  channel: string;
  responseTime: number; // minutes
  timestamp: Date;
  urgency: 'urgent' | 'normal' | 'low';
  isAfterHours: boolean;
  isWeekend: boolean;
}

async function getResponseEvents(
  personId: string,
  startDate: Date,
  endDate: Date,
  _channels?: string[]
): Promise<ResponseEvent[]> {
  // In production, query actual response data
  // For now, generate simulated data
  const events: ResponseEvent[] = [];
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const channels = ['slack', 'email', 'teams'];

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const dailyCount = isWeekend ? Math.floor(5 + Math.random() * 10) : Math.floor(20 + Math.random() * 30);

    for (let i = 0; i < dailyCount; i++) {
      const hour = Math.floor(Math.random() * 24);
      const isAfterHours = hour < 9 || hour >= 18;

      const timestamp = new Date(date);
      timestamp.setHours(hour, Math.floor(Math.random() * 60));

      // Response time varies by channel and time
      let baseResponse = 15 + Math.random() * 30;
      if (isAfterHours) baseResponse *= 0.5; // Faster after hours (pressure indicator)
      if (isWeekend) baseResponse *= 0.6;

      events.push({
        id: `response-${personId}-${d}-${i}`,
        channel: channels[Math.floor(Math.random() * channels.length)],
        responseTime: Math.max(1, baseResponse),
        timestamp,
        urgency: Math.random() > 0.8 ? 'urgent' : Math.random() > 0.5 ? 'normal' : 'low',
        isAfterHours,
        isWeekend,
      });
    }
  }

  return events;
}

function calculateOverallStats(
  responseTimes: number[],
  totalCount: number
): ResponseTimeAnalysis['overall'] {
  if (responseTimes.length === 0) {
    return {
      avgResponseTime: 0,
      medianResponseTime: 0,
      p95ResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      totalResponses: 0,
    };
  }

  const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const median = responseTimes[Math.floor(responseTimes.length / 2)];
  const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];

  return {
    avgResponseTime: Math.round(avg * 10) / 10,
    medianResponseTime: Math.round(median * 10) / 10,
    p95ResponseTime: Math.round(p95 * 10) / 10,
    minResponseTime: Math.round(responseTimes[0] * 10) / 10,
    maxResponseTime: Math.round(responseTimes[responseTimes.length - 1] * 10) / 10,
    totalResponses: totalCount,
  };
}

function calculateByChannel(responses: ResponseEvent[]): Record<string, ChannelResponseMetrics> {
  const byChannel: Record<string, ChannelResponseMetrics> = {};
  const channelGroups = new Map<string, number[]>();

  for (const response of responses) {
    const times = channelGroups.get(response.channel) || [];
    times.push(response.responseTime);
    channelGroups.set(response.channel, times);
  }

  for (const [channel, times] of channelGroups.entries()) {
    const sorted = times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const sla = CHANNEL_SLAS[channel];
    const withinSLA = sla ? times.filter((t) => t <= sla).length : times.length;

    byChannel[channel] = {
      avgResponseTime: Math.round(avg * 10) / 10,
      medianResponseTime: Math.round(median * 10) / 10,
      responseCount: times.length,
      expectedSLA: sla,
      slaCompliance: sla ? Math.round((withinSLA / times.length) * 100) : undefined,
    };
  }

  return byChannel;
}

function calculateByTimeOfDay(responses: ResponseEvent[]): ResponseTimeAnalysis['byTimeOfDay'] {
  const workingHours = responses.filter((r) => !r.isAfterHours && !r.isWeekend);
  const afterHours = responses.filter((r) => r.isAfterHours && !r.isWeekend);
  const weekends = responses.filter((r) => r.isWeekend);

  const calculateStats = (events: ResponseEvent[]): ResponseTimeStats => {
    if (events.length === 0) {
      return { avgResponseTime: 0, medianResponseTime: 0, count: 0, percentOfTotal: 0 };
    }
    const times = events.map((e) => e.responseTime).sort((a, b) => a - b);
    return {
      avgResponseTime: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
      medianResponseTime: Math.round(times[Math.floor(times.length / 2)] * 10) / 10,
      count: times.length,
      percentOfTotal: Math.round((times.length / responses.length) * 100),
    };
  };

  return {
    workingHours: calculateStats(workingHours),
    afterHours: calculateStats(afterHours),
    weekends: calculateStats(weekends),
  };
}

function calculateByUrgency(responses: ResponseEvent[]): ResponseTimeAnalysis['byUrgency'] {
  const urgent = responses.filter((r) => r.urgency === 'urgent');
  const normal = responses.filter((r) => r.urgency === 'normal');
  const low = responses.filter((r) => r.urgency === 'low');

  const calculateStats = (events: ResponseEvent[]): ResponseTimeStats => {
    if (events.length === 0) {
      return { avgResponseTime: 0, medianResponseTime: 0, count: 0, percentOfTotal: 0 };
    }
    const times = events.map((e) => e.responseTime).sort((a, b) => a - b);
    return {
      avgResponseTime: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
      medianResponseTime: Math.round(times[Math.floor(times.length / 2)] * 10) / 10,
      count: times.length,
      percentOfTotal: Math.round((times.length / responses.length) * 100),
    };
  };

  return {
    urgent: calculateStats(urgent),
    normal: calculateStats(normal),
    low: calculateStats(low),
  };
}

function calculateTrends(
  responses: ResponseEvent[],
  startDate: Date,
  endDate: Date
): ResponseTimeTrend[] {
  const trends: ResponseTimeTrend[] = [];
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  for (let d = 0; d < days; d += 7) {
    const weekStart = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const weekResponses = responses.filter(
      (r) => r.timestamp >= weekStart && r.timestamp < weekEnd
    );

    if (weekResponses.length > 0) {
      const times = weekResponses.map((r) => r.responseTime);
      const urgentResponses = weekResponses.filter((r) => r.urgency === 'urgent');
      const urgentTimes = urgentResponses.map((r) => r.responseTime);

      trends.push({
        date: weekStart,
        avgResponseTime: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
        responseCount: weekResponses.length,
        urgentResponseTime:
          urgentTimes.length > 0
            ? Math.round((urgentTimes.reduce((a, b) => a + b, 0) / urgentTimes.length) * 10) / 10
            : undefined,
      });
    }
  }

  return trends;
}

function calculatePressure(
  overall: ResponseTimeAnalysis['overall'],
  byTimeOfDay: ResponseTimeAnalysis['byTimeOfDay'],
  byUrgency: ResponseTimeAnalysis['byUrgency']
): ResponseTimePressure {
  const indicators: PressureIndicator[] = [];
  let totalScore = 0;

  // Very fast response time indicator
  if (overall.avgResponseTime < PRESSURE_THRESHOLDS.veryFast) {
    indicators.push({
      name: 'Ultra-fast responses',
      value: overall.avgResponseTime,
      threshold: PRESSURE_THRESHOLDS.veryFast,
      status: 'exceeds',
      impact: 'Extremely fast response times indicate high pressure to respond immediately',
    });
    totalScore += 30;
  } else if (overall.avgResponseTime < PRESSURE_THRESHOLDS.fast) {
    indicators.push({
      name: 'Fast responses',
      value: overall.avgResponseTime,
      threshold: PRESSURE_THRESHOLDS.fast,
      status: 'warning',
      impact: 'Fast response times may indicate pressure to be always available',
    });
    totalScore += 15;
  }

  // After-hours response indicator
  if (byTimeOfDay.afterHours.percentOfTotal > 20) {
    indicators.push({
      name: 'After-hours activity',
      value: byTimeOfDay.afterHours.percentOfTotal,
      threshold: 20,
      status: byTimeOfDay.afterHours.percentOfTotal > 30 ? 'exceeds' : 'warning',
      impact: 'High after-hours response rate suggests difficulty disconnecting from work',
    });
    totalScore += byTimeOfDay.afterHours.percentOfTotal > 30 ? 25 : 15;
  }

  // Weekend response indicator
  if (byTimeOfDay.weekends.percentOfTotal > 10) {
    indicators.push({
      name: 'Weekend activity',
      value: byTimeOfDay.weekends.percentOfTotal,
      threshold: 10,
      status: byTimeOfDay.weekends.percentOfTotal > 20 ? 'exceeds' : 'warning',
      impact: 'Weekend responses indicate lack of work-life boundaries',
    });
    totalScore += byTimeOfDay.weekends.percentOfTotal > 20 ? 20 : 10;
  }

  // Urgent response speed indicator
  if (byUrgency.urgent.avgResponseTime < 5) {
    indicators.push({
      name: 'Urgent response speed',
      value: byUrgency.urgent.avgResponseTime,
      threshold: 5,
      status: 'warning',
      impact: 'Very fast urgent responses may indicate constant vigilance',
    });
    totalScore += 10;
  }

  const score = Math.min(100, totalScore);
  let level: ResponseTimePressure['level'];

  if (score >= 70) level = 'critical';
  else if (score >= 50) level = 'high';
  else if (score >= 30) level = 'moderate';
  else level = 'healthy';

  return { score, level, indicators };
}

function generateRecommendations(
  pressure: ResponseTimePressure,
  byTimeOfDay: ResponseTimeAnalysis['byTimeOfDay'],
  _byUrgency: ResponseTimeAnalysis['byUrgency']
): string[] {
  const recommendations: string[] = [];

  if (pressure.level === 'critical' || pressure.level === 'high') {
    recommendations.push('Set clear response time expectations with your team');
    recommendations.push('Consider implementing focus time blocks with delayed notifications');
  }

  if (byTimeOfDay.afterHours.percentOfTotal > 15) {
    recommendations.push('Establish boundaries for after-hours communication');
    recommendations.push('Use scheduled send for non-urgent after-hours messages');
  }

  if (byTimeOfDay.weekends.percentOfTotal > 5) {
    recommendations.push('Minimize weekend work communication');
    recommendations.push('Delegate urgent matters to on-call if applicable');
  }

  if (recommendations.length === 0) {
    recommendations.push('Response patterns look healthy - maintain current boundaries');
  }

  return recommendations;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  analyzeResponseTime,
  analyzeTeamResponseTime,
  compareToExpectations,
};
