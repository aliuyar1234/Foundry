/**
 * Communication Volume Analyzer
 * T204 - Analyze communication patterns and volume
 *
 * Detects unhealthy communication patterns that may lead to burnout
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface CommunicationMetrics {
  personId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  messageVolume: {
    total: number;
    sent: number;
    received: number;
    dailyAverage: number;
    peakDay: Date;
    peakVolume: number;
  };
  responsePatterns: {
    averageResponseTime: number; // minutes
    medianResponseTime: number;
    p95ResponseTime: number;
    afterHoursResponses: number;
    afterHoursPercent: number;
  };
  channelBreakdown: Record<string, {
    messages: number;
    percent: number;
    avgResponseTime: number;
  }>;
  timeDistribution: {
    hourly: number[]; // 24 hours
    daily: number[]; // 7 days (0 = Sunday)
    afterHours: number;
    workingHours: number;
  };
  urgencyMetrics: {
    urgentMessages: number;
    urgentPercent: number;
    escalations: number;
  };
  threadMetrics: {
    threadsStarted: number;
    threadsParticipated: number;
    avgThreadLength: number;
    avgResponsesPerThread: number;
  };
  healthIndicators: {
    score: number; // 0-100 (higher = healthier)
    alerts: string[];
    recommendations: string[];
  };
}

export interface TeamCommunicationMetrics {
  teamId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  overview: {
    totalMessages: number;
    activeMembers: number;
    avgMessagesPerMember: number;
  };
  patterns: {
    peakHours: number[];
    peakDays: number[];
    afterHoursPercent: number;
  };
  memberMetrics: Array<{
    personId: string;
    personName: string;
    messagesSent: number;
    messagesReceived: number;
    avgResponseTime: number;
    healthScore: number;
  }>;
}

export interface CommunicationTrend {
  date: Date;
  messageCount: number;
  avgResponseTime: number;
  afterHoursPercent: number;
}

interface CommunicationEvent {
  id: string;
  personId: string;
  type: 'sent' | 'received';
  channel: string;
  timestamp: Date;
  responseTime?: number;
  isUrgent: boolean;
  threadId?: string;
}

// =============================================================================
// Constants
// =============================================================================

const WORKING_HOURS = {
  start: 9, // 9 AM
  end: 18, // 6 PM
};

const WORKING_DAYS = [1, 2, 3, 4, 5]; // Monday to Friday

const HEALTH_THRESHOLDS = {
  responseTime: {
    healthy: 30,
    concerning: 15,
    critical: 5,
  },
  afterHoursPercent: {
    healthy: 5,
    concerning: 15,
    critical: 25,
  },
  dailyMessages: {
    healthy: 50,
    concerning: 100,
    critical: 150,
  },
};

// =============================================================================
// Communication Analyzer
// =============================================================================

const prisma = new PrismaClient();

/**
 * Analyze communication patterns for a person
 */
export async function analyzeCommunication(
  personId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    channels?: string[];
  } = {}
): Promise<CommunicationMetrics> {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    channels,
  } = options;

  // Get communication events (simulated - in production, integrate with email/chat APIs)
  const events = await getCommunicationEvents(personId, startDate, endDate, channels);

  const sentMessages = events.filter((e) => e.type === 'sent');
  const receivedMessages = events.filter((e) => e.type === 'received');

  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const dailyAverage = events.length / days;

  // Calculate daily volumes
  const dailyVolumes = calculateDailyVolumes(events, startDate, endDate);
  const peakDay = dailyVolumes.reduce((max, curr) =>
    curr.volume > max.volume ? curr : max
  );

  // Calculate response patterns
  const responsePatterns = calculateResponsePatterns(events);

  // Calculate channel breakdown
  const channelBreakdown = calculateChannelBreakdown(events);

  // Calculate time distribution
  const timeDistribution = calculateTimeDistribution(events);

  // Calculate urgency metrics
  const urgencyMetrics = calculateUrgencyMetrics(events);

  // Calculate thread metrics
  const threadMetrics = calculateThreadMetrics(events);

  // Calculate health indicators
  const healthIndicators = calculateHealthIndicators({
    dailyAverage,
    responsePatterns,
    timeDistribution,
    urgencyMetrics,
  });

  return {
    personId,
    period: { startDate, endDate },
    messageVolume: {
      total: events.length,
      sent: sentMessages.length,
      received: receivedMessages.length,
      dailyAverage: Math.round(dailyAverage * 10) / 10,
      peakDay: peakDay.date,
      peakVolume: peakDay.volume,
    },
    responsePatterns,
    channelBreakdown,
    timeDistribution,
    urgencyMetrics,
    threadMetrics,
    healthIndicators,
  };
}

/**
 * Analyze communication patterns for a team
 */
export async function analyzeTeamCommunication(
  teamId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<TeamCommunicationMetrics> {
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

  const memberMetrics = await Promise.all(
    team.users.map(async (user) => {
      const metrics = await analyzeCommunication(user.id, { startDate, endDate });
      return {
        personId: user.id,
        personName: user.name || user.email,
        messagesSent: metrics.messageVolume.sent,
        messagesReceived: metrics.messageVolume.received,
        avgResponseTime: metrics.responsePatterns.averageResponseTime,
        healthScore: metrics.healthIndicators.score,
      };
    })
  );

  const totalMessages = memberMetrics.reduce(
    (sum, m) => sum + m.messagesSent + m.messagesReceived,
    0
  );
  const activeMembers = memberMetrics.filter(
    (m) => m.messagesSent > 0 || m.messagesReceived > 0
  ).length;

  // Aggregate patterns (simplified)
  const allHours: number[] = new Array(24).fill(0);
  const allDays: number[] = new Array(7).fill(0);
  let totalAfterHours = 0;
  let totalWorkingHours = 0;

  for (const member of memberMetrics) {
    const memberMetricsDetail = await analyzeCommunication(member.personId, {
      startDate,
      endDate,
    });
    memberMetricsDetail.timeDistribution.hourly.forEach((v, i) => (allHours[i] += v));
    memberMetricsDetail.timeDistribution.daily.forEach((v, i) => (allDays[i] += v));
    totalAfterHours += memberMetricsDetail.timeDistribution.afterHours;
    totalWorkingHours += memberMetricsDetail.timeDistribution.workingHours;
  }

  // Find peak hours (top 3)
  const peakHours = allHours
    .map((v, i) => ({ hour: i, volume: v }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)
    .map((h) => h.hour);

  // Find peak days (top 3)
  const peakDays = allDays
    .map((v, i) => ({ day: i, volume: v }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)
    .map((d) => d.day);

  const afterHoursPercent =
    totalAfterHours + totalWorkingHours > 0
      ? (totalAfterHours / (totalAfterHours + totalWorkingHours)) * 100
      : 0;

  return {
    teamId,
    period: { startDate, endDate },
    overview: {
      totalMessages,
      activeMembers,
      avgMessagesPerMember: activeMembers > 0 ? Math.round(totalMessages / activeMembers) : 0,
    },
    patterns: {
      peakHours,
      peakDays,
      afterHoursPercent: Math.round(afterHoursPercent * 10) / 10,
    },
    memberMetrics,
  };
}

/**
 * Get communication trends over time
 */
export async function getCommunicationTrends(
  personId: string,
  options: {
    days?: number;
    granularity?: 'daily' | 'weekly';
  } = {}
): Promise<CommunicationTrend[]> {
  const { days = 30, granularity = 'daily' } = options;

  const trends: CommunicationTrend[] = [];
  const intervalDays = granularity === 'daily' ? 1 : 7;
  const endDate = new Date();

  for (let i = days; i >= 0; i -= intervalDays) {
    const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
    const periodStart = granularity === 'daily'
      ? new Date(date.setHours(0, 0, 0, 0))
      : new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodEnd = granularity === 'daily'
      ? new Date(date.setHours(23, 59, 59, 999))
      : date;

    const events = await getCommunicationEvents(personId, periodStart, periodEnd);

    const responseTimes = events
      .filter((e) => e.responseTime !== undefined)
      .map((e) => e.responseTime!);
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    const afterHoursCount = events.filter((e) => isAfterHours(e.timestamp)).length;
    const afterHoursPercent = events.length > 0 ? (afterHoursCount / events.length) * 100 : 0;

    trends.push({
      date: new Date(periodStart),
      messageCount: events.length,
      avgResponseTime: Math.round(avgResponseTime),
      afterHoursPercent: Math.round(afterHoursPercent * 10) / 10,
    });
  }

  return trends;
}

// =============================================================================
// Helper Functions
// =============================================================================

async function getCommunicationEvents(
  personId: string,
  startDate: Date,
  endDate: Date,
  _channels?: string[]
): Promise<CommunicationEvent[]> {
  // In production, this would query actual communication data
  // For now, generate simulated data
  const events: CommunicationEvent[] = [];
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  const channels = ['email', 'slack', 'teams'];
  const dailyCount = 30 + Math.floor(Math.random() * 40);

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);

    for (let m = 0; m < dailyCount; m++) {
      const hour = 7 + Math.floor(Math.random() * 14);
      const timestamp = new Date(dayStart);
      timestamp.setHours(hour, Math.floor(Math.random() * 60));

      events.push({
        id: `${personId}-${d}-${m}`,
        personId,
        type: Math.random() > 0.5 ? 'sent' : 'received',
        channel: channels[Math.floor(Math.random() * channels.length)],
        timestamp,
        responseTime: Math.random() > 0.3 ? Math.floor(5 + Math.random() * 60) : undefined,
        isUrgent: Math.random() > 0.9,
        threadId: Math.random() > 0.5 ? `thread-${Math.floor(Math.random() * 100)}` : undefined,
      });
    }
  }

  return events;
}

function calculateDailyVolumes(
  events: CommunicationEvent[],
  startDate: Date,
  endDate: Date
): Array<{ date: Date; volume: number }> {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const volumes: Array<{ date: Date; volume: number }> = [];

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const volume = events.filter(
      (e) => e.timestamp >= dayStart && e.timestamp <= dayEnd
    ).length;

    volumes.push({ date: dayStart, volume });
  }

  return volumes;
}

function calculateResponsePatterns(
  events: CommunicationEvent[]
): CommunicationMetrics['responsePatterns'] {
  const responseTimes = events
    .filter((e) => e.responseTime !== undefined)
    .map((e) => e.responseTime!)
    .sort((a, b) => a - b);

  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  const medianResponseTime =
    responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length / 2)]
      : 0;

  const p95ResponseTime =
    responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length * 0.95)]
      : 0;

  const afterHoursResponses = events.filter(
    (e) => e.type === 'sent' && isAfterHours(e.timestamp)
  ).length;

  const totalResponses = events.filter((e) => e.type === 'sent').length;
  const afterHoursPercent =
    totalResponses > 0 ? (afterHoursResponses / totalResponses) * 100 : 0;

  return {
    averageResponseTime: Math.round(avgResponseTime),
    medianResponseTime: Math.round(medianResponseTime),
    p95ResponseTime: Math.round(p95ResponseTime),
    afterHoursResponses,
    afterHoursPercent: Math.round(afterHoursPercent * 10) / 10,
  };
}

function calculateChannelBreakdown(
  events: CommunicationEvent[]
): CommunicationMetrics['channelBreakdown'] {
  const breakdown: CommunicationMetrics['channelBreakdown'] = {};

  const channels = new Set(events.map((e) => e.channel));

  for (const channel of channels) {
    const channelEvents = events.filter((e) => e.channel === channel);
    const responseTimes = channelEvents
      .filter((e) => e.responseTime !== undefined)
      .map((e) => e.responseTime!);

    breakdown[channel] = {
      messages: channelEvents.length,
      percent: Math.round((channelEvents.length / events.length) * 100 * 10) / 10,
      avgResponseTime:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0,
    };
  }

  return breakdown;
}

function calculateTimeDistribution(
  events: CommunicationEvent[]
): CommunicationMetrics['timeDistribution'] {
  const hourly = new Array(24).fill(0);
  const daily = new Array(7).fill(0);
  let afterHours = 0;
  let workingHours = 0;

  for (const event of events) {
    const hour = event.timestamp.getHours();
    const day = event.timestamp.getDay();

    hourly[hour]++;
    daily[day]++;

    if (isAfterHours(event.timestamp)) {
      afterHours++;
    } else {
      workingHours++;
    }
  }

  return { hourly, daily, afterHours, workingHours };
}

function calculateUrgencyMetrics(
  events: CommunicationEvent[]
): CommunicationMetrics['urgencyMetrics'] {
  const urgentMessages = events.filter((e) => e.isUrgent).length;

  return {
    urgentMessages,
    urgentPercent: events.length > 0 ? Math.round((urgentMessages / events.length) * 100 * 10) / 10 : 0,
    escalations: Math.floor(urgentMessages * 0.3), // Simulated
  };
}

function calculateThreadMetrics(
  events: CommunicationEvent[]
): CommunicationMetrics['threadMetrics'] {
  const threads = new Map<string, CommunicationEvent[]>();

  for (const event of events) {
    if (event.threadId) {
      const existing = threads.get(event.threadId) || [];
      existing.push(event);
      threads.set(event.threadId, existing);
    }
  }

  const threadLengths = Array.from(threads.values()).map((t) => t.length);
  const avgThreadLength =
    threadLengths.length > 0
      ? threadLengths.reduce((a, b) => a + b, 0) / threadLengths.length
      : 0;

  return {
    threadsStarted: Math.floor(threads.size * 0.4), // Simulated
    threadsParticipated: threads.size,
    avgThreadLength: Math.round(avgThreadLength * 10) / 10,
    avgResponsesPerThread: Math.round(avgThreadLength * 0.6 * 10) / 10, // Simulated
  };
}

function calculateHealthIndicators(data: {
  dailyAverage: number;
  responsePatterns: CommunicationMetrics['responsePatterns'];
  timeDistribution: CommunicationMetrics['timeDistribution'];
  urgencyMetrics: CommunicationMetrics['urgencyMetrics'];
}): CommunicationMetrics['healthIndicators'] {
  const alerts: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check response time
  if (data.responsePatterns.averageResponseTime < HEALTH_THRESHOLDS.responseTime.critical) {
    score -= 25;
    alerts.push('Response times are critically fast, indicating high pressure');
    recommendations.push('Set expectations for reasonable response times');
  } else if (data.responsePatterns.averageResponseTime < HEALTH_THRESHOLDS.responseTime.concerning) {
    score -= 10;
    alerts.push('Response times are very fast');
    recommendations.push('Consider batching responses to reduce interruptions');
  }

  // Check after-hours activity
  if (data.responsePatterns.afterHoursPercent > HEALTH_THRESHOLDS.afterHoursPercent.critical) {
    score -= 25;
    alerts.push('Significant after-hours communication detected');
    recommendations.push('Establish clear boundaries for after-hours communication');
  } else if (data.responsePatterns.afterHoursPercent > HEALTH_THRESHOLDS.afterHoursPercent.concerning) {
    score -= 10;
    alerts.push('Elevated after-hours communication');
    recommendations.push('Review workload distribution');
  }

  // Check daily message volume
  if (data.dailyAverage > HEALTH_THRESHOLDS.dailyMessages.critical) {
    score -= 25;
    alerts.push('Very high daily message volume');
    recommendations.push('Consolidate communications, use async methods');
  } else if (data.dailyAverage > HEALTH_THRESHOLDS.dailyMessages.concerning) {
    score -= 10;
    alerts.push('High daily message volume');
    recommendations.push('Schedule focus time blocks');
  }

  // Check urgency
  if (data.urgencyMetrics.urgentPercent > 20) {
    score -= 15;
    alerts.push('High percentage of urgent messages');
    recommendations.push('Review urgency criteria and prioritization');
  }

  return {
    score: Math.max(0, score),
    alerts,
    recommendations,
  };
}

function isAfterHours(timestamp: Date): boolean {
  const hour = timestamp.getHours();
  const day = timestamp.getDay();

  const isWorkingDay = WORKING_DAYS.includes(day);
  const isWorkingHour = hour >= WORKING_HOURS.start && hour < WORKING_HOURS.end;

  return !isWorkingDay || !isWorkingHour;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  analyzeCommunication,
  analyzeTeamCommunication,
  getCommunicationTrends,
};
