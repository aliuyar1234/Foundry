/**
 * Meeting Analyzer Service
 * T218 - Analyze meeting patterns and their impact on productivity
 *
 * Provides insights into meeting efficiency and suggestions for improvement
 */

import { PrismaClient } from '@prisma/client';
import { getCalendarEvents, CalendarEvent, getMeetingStats } from './calendarIntegration.js';

// =============================================================================
// Types
// =============================================================================

export interface MeetingAnalysis {
  personId: string;
  period: {
    start: Date;
    end: Date;
  };
  overview: MeetingOverview;
  efficiency: MeetingEfficiency;
  patterns: MeetingPattern[];
  fragmentation: FragmentationAnalysis;
  recommendations: MeetingRecommendation[];
  costAnalysis: MeetingCost;
}

export interface MeetingOverview {
  totalMeetings: number;
  totalHours: number;
  avgPerDay: number;
  avgDuration: number;
  organizedByMe: number;
  recurring: number;
  oneOnOnes: number;
  teamMeetings: number;
  external: number;
}

export interface MeetingEfficiency {
  score: number; // 0-100
  factors: {
    factor: string;
    score: number;
    weight: number;
    description: string;
  }[];
  trend: 'improving' | 'stable' | 'declining';
}

export interface MeetingPattern {
  type: string;
  description: string;
  frequency: string;
  impact: 'positive' | 'negative' | 'neutral';
  suggestion?: string;
}

export interface FragmentationAnalysis {
  score: number; // 0-100, higher = more fragmented
  avgFocusBlockMinutes: number;
  longestFocusBlockMinutes: number;
  meetingFreeHoursPerDay: number;
  backToBackMeetings: number;
  contextSwitches: number;
}

export interface MeetingRecommendation {
  priority: 'high' | 'medium' | 'low';
  type: 'reduce' | 'consolidate' | 'reschedule' | 'delegate' | 'async';
  title: string;
  description: string;
  potentialTimeSaved: number; // hours per week
  affectedMeetings?: string[];
}

export interface MeetingCost {
  hoursPerWeek: number;
  estimatedCostPerWeek: number; // based on avg hourly rate
  opportunityCost: string;
  comparisons: {
    label: string;
    equivalent: string;
  }[];
}

export interface TeamMeetingAnalysis {
  teamId: string;
  period: {
    start: Date;
    end: Date;
  };
  teamOverview: {
    totalMeetingHours: number;
    avgPerMember: number;
    highestLoad: { personId: string; personName: string; hours: number };
    lowestLoad: { personId: string; personName: string; hours: number };
  };
  sharedMeetings: SharedMeetingInfo[];
  meetingCulture: MeetingCultureScore;
  teamRecommendations: MeetingRecommendation[];
}

export interface SharedMeetingInfo {
  title: string;
  frequency: string;
  attendeeCount: number;
  totalHoursPerWeek: number;
  necessityScore: number;
  suggestion?: string;
}

export interface MeetingCultureScore {
  overallScore: number;
  dimensions: {
    dimension: string;
    score: number;
    description: string;
  }[];
}

// =============================================================================
// Meeting Analyzer
// =============================================================================

const prisma = new PrismaClient();

// Efficiency weights
const EFFICIENCY_WEIGHTS = {
  duration_appropriateness: 0.20,
  attendee_count: 0.15,
  recurring_ratio: 0.15,
  fragmentation: 0.20,
  after_hours: 0.10,
  decline_rate: 0.10,
  meeting_load: 0.10,
};

/**
 * Analyze meetings for a person
 */
export async function analyzeMeetings(
  personId: string,
  options: {
    periodDays?: number;
  } = {}
): Promise<MeetingAnalysis> {
  const { periodDays = 30 } = options;

  const start = new Date();
  start.setDate(start.getDate() - periodDays);
  const end = new Date();

  const events = await getCalendarEvents(personId, {
    start,
    end,
    types: ['meeting', 'one_on_one', 'team_meeting', 'all_hands', 'interview', 'external'],
  });

  const meetings = events.filter(e => e.status !== 'cancelled');

  // Calculate overview
  const overview = calculateOverview(meetings, periodDays);

  // Calculate efficiency
  const efficiency = calculateEfficiency(meetings, events, periodDays);

  // Identify patterns
  const patterns = identifyMeetingPatterns(meetings);

  // Analyze fragmentation
  const fragmentation = analyzeFragmentation(events, start, end);

  // Generate recommendations
  const recommendations = generateRecommendations(meetings, overview, efficiency, fragmentation);

  // Calculate cost
  const costAnalysis = calculateCost(overview);

  return {
    personId,
    period: { start, end },
    overview,
    efficiency,
    patterns,
    fragmentation,
    recommendations,
    costAnalysis,
  };
}

/**
 * Analyze meetings across a team
 */
export async function analyzeTeamMeetings(
  teamId: string,
  options: {
    periodDays?: number;
  } = {}
): Promise<TeamMeetingAnalysis> {
  const { periodDays = 30 } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const start = new Date();
  start.setDate(start.getDate() - periodDays);
  const end = new Date();

  // Analyze each member
  const memberAnalyses = await Promise.all(
    team.users.map(user => analyzeMeetings(user.id, { periodDays }))
  );

  // Calculate team overview
  const totalHours = memberAnalyses.reduce((sum, a) => sum + a.overview.totalHours, 0);
  const avgPerMember = totalHours / memberAnalyses.length;

  const sortedByLoad = memberAnalyses
    .map((a, i) => ({
      personId: team.users[i].id,
      personName: team.users[i].name || team.users[i].email,
      hours: a.overview.totalHours,
    }))
    .sort((a, b) => b.hours - a.hours);

  // Analyze shared meetings
  const sharedMeetings = analyzeSharedMeetings(team.users);

  // Calculate meeting culture score
  const meetingCulture = calculateMeetingCulture(memberAnalyses);

  // Generate team recommendations
  const teamRecommendations = generateTeamRecommendations(memberAnalyses, sharedMeetings);

  return {
    teamId,
    period: { start, end },
    teamOverview: {
      totalMeetingHours: Math.round(totalHours),
      avgPerMember: Math.round(avgPerMember * 10) / 10,
      highestLoad: sortedByLoad[0],
      lowestLoad: sortedByLoad[sortedByLoad.length - 1],
    },
    sharedMeetings,
    meetingCulture,
    teamRecommendations,
  };
}

/**
 * Get meeting optimization suggestions
 */
export async function getMeetingOptimizations(
  personId: string
): Promise<{
  meetingsToCancel: Array<{ title: string; reason: string; hoursSaved: number }>;
  meetingsToShorten: Array<{ title: string; currentDuration: number; suggestedDuration: number }>;
  meetingsToAsync: Array<{ title: string; reason: string; alternative: string }>;
}> {
  const analysis = await analyzeMeetings(personId, { periodDays: 14 });

  return {
    meetingsToCancel: generateCancelSuggestions(analysis),
    meetingsToShorten: generateShortenSuggestions(analysis),
    meetingsToAsync: generateAsyncSuggestions(analysis),
  };
}

/**
 * Compare meeting load between periods
 */
export async function compareMeetingPeriods(
  personId: string,
  options: {
    periodDays?: number;
  } = {}
): Promise<{
  currentPeriod: MeetingOverview;
  previousPeriod: MeetingOverview;
  changes: Array<{ metric: string; change: number; changePercent: number; trend: string }>;
}> {
  const { periodDays = 14 } = options;

  const now = new Date();
  const currentStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const currentEvents = await getCalendarEvents(personId, {
    start: currentStart,
    end: now,
    types: ['meeting', 'one_on_one', 'team_meeting', 'all_hands', 'external'],
  });

  const previousEvents = await getCalendarEvents(personId, {
    start: previousStart,
    end: currentStart,
    types: ['meeting', 'one_on_one', 'team_meeting', 'all_hands', 'external'],
  });

  const currentOverview = calculateOverview(currentEvents.filter(e => e.status !== 'cancelled'), periodDays);
  const previousOverview = calculateOverview(previousEvents.filter(e => e.status !== 'cancelled'), periodDays);

  const changes = [
    {
      metric: 'Total Meetings',
      change: currentOverview.totalMeetings - previousOverview.totalMeetings,
      changePercent: calculatePercentChange(previousOverview.totalMeetings, currentOverview.totalMeetings),
      trend: currentOverview.totalMeetings > previousOverview.totalMeetings ? 'up' : 'down',
    },
    {
      metric: 'Total Hours',
      change: Math.round((currentOverview.totalHours - previousOverview.totalHours) * 10) / 10,
      changePercent: calculatePercentChange(previousOverview.totalHours, currentOverview.totalHours),
      trend: currentOverview.totalHours > previousOverview.totalHours ? 'up' : 'down',
    },
    {
      metric: 'Avg Per Day',
      change: Math.round((currentOverview.avgPerDay - previousOverview.avgPerDay) * 10) / 10,
      changePercent: calculatePercentChange(previousOverview.avgPerDay, currentOverview.avgPerDay),
      trend: currentOverview.avgPerDay > previousOverview.avgPerDay ? 'up' : 'down',
    },
  ];

  return {
    currentPeriod: currentOverview,
    previousPeriod: previousOverview,
    changes,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateOverview(meetings: CalendarEvent[], periodDays: number): MeetingOverview {
  const totalHours = meetings.reduce((sum, m) => sum + m.duration / 60, 0);
  const workDays = Math.ceil(periodDays * (5 / 7)); // Approximate work days

  return {
    totalMeetings: meetings.length,
    totalHours: Math.round(totalHours * 10) / 10,
    avgPerDay: workDays > 0 ? Math.round((meetings.length / workDays) * 10) / 10 : 0,
    avgDuration: meetings.length > 0 ? Math.round(meetings.reduce((sum, m) => sum + m.duration, 0) / meetings.length) : 0,
    organizedByMe: meetings.filter(m => m.attendees.some(a => a.isOrganizer)).length,
    recurring: meetings.filter(m => m.isRecurring).length,
    oneOnOnes: meetings.filter(m => m.type === 'one_on_one').length,
    teamMeetings: meetings.filter(m => m.type === 'team_meeting').length,
    external: meetings.filter(m => m.type === 'external').length,
  };
}

function calculateEfficiency(
  meetings: CalendarEvent[],
  allEvents: CalendarEvent[],
  periodDays: number
): MeetingEfficiency {
  const factors: MeetingEfficiency['factors'] = [];

  // Duration appropriateness (penalize 60+ minute meetings)
  const avgDuration = meetings.length > 0
    ? meetings.reduce((sum, m) => sum + m.duration, 0) / meetings.length
    : 30;
  const durationScore = Math.max(0, 100 - Math.max(0, avgDuration - 30));
  factors.push({
    factor: 'Duration Appropriateness',
    score: durationScore,
    weight: EFFICIENCY_WEIGHTS.duration_appropriateness,
    description: `Average meeting duration: ${Math.round(avgDuration)} minutes`,
  });

  // Attendee count (penalize large meetings)
  const avgAttendees = meetings.length > 0
    ? meetings.reduce((sum, m) => sum + m.attendees.length, 0) / meetings.length
    : 2;
  const attendeeScore = Math.max(0, 100 - Math.max(0, (avgAttendees - 4) * 10));
  factors.push({
    factor: 'Meeting Size',
    score: attendeeScore,
    weight: EFFICIENCY_WEIGHTS.attendee_count,
    description: `Average ${Math.round(avgAttendees)} attendees per meeting`,
  });

  // Recurring ratio (some recurring is good, too much is concerning)
  const recurringRatio = meetings.length > 0
    ? (meetings.filter(m => m.isRecurring).length / meetings.length) * 100
    : 0;
  const recurringScore = recurringRatio <= 50 ? 100 : Math.max(0, 100 - (recurringRatio - 50));
  factors.push({
    factor: 'Recurring Balance',
    score: recurringScore,
    weight: EFFICIENCY_WEIGHTS.recurring_ratio,
    description: `${Math.round(recurringRatio)}% of meetings are recurring`,
  });

  // Meeting load (percent of time in meetings)
  const workHours = periodDays * (5 / 7) * 8;
  const meetingHours = meetings.reduce((sum, m) => sum + m.duration / 60, 0);
  const loadPercent = workHours > 0 ? (meetingHours / workHours) * 100 : 0;
  const loadScore = loadPercent <= 30 ? 100 : Math.max(0, 100 - (loadPercent - 30) * 2);
  factors.push({
    factor: 'Meeting Load',
    score: loadScore,
    weight: EFFICIENCY_WEIGHTS.meeting_load,
    description: `${Math.round(loadPercent)}% of work time in meetings`,
  });

  // Decline rate
  const declined = allEvents.filter(e => e.responseStatus === 'declined').length;
  const declineRate = allEvents.length > 0 ? (declined / allEvents.length) * 100 : 0;
  const declineScore = declineRate >= 10 ? 100 : Math.max(0, declineRate * 10);
  factors.push({
    factor: 'Meeting Selectivity',
    score: declineScore,
    weight: EFFICIENCY_WEIGHTS.decline_rate,
    description: `${Math.round(declineRate)}% of invites declined`,
  });

  // Calculate weighted score
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  return {
    score,
    factors,
    trend: 'stable',
  };
}

function identifyMeetingPatterns(meetings: CalendarEvent[]): MeetingPattern[] {
  const patterns: MeetingPattern[] = [];

  // Long meetings pattern
  const longMeetings = meetings.filter(m => m.duration >= 60);
  if (longMeetings.length > meetings.length * 0.4) {
    patterns.push({
      type: 'long_meetings',
      description: 'High proportion of hour-long or longer meetings',
      frequency: `${longMeetings.length} of ${meetings.length} meetings`,
      impact: 'negative',
      suggestion: 'Try defaulting to 25 or 50 minute meetings',
    });
  }

  // Early morning meetings
  const earlyMeetings = meetings.filter(m => m.start.getHours() < 9);
  if (earlyMeetings.length > 5) {
    patterns.push({
      type: 'early_meetings',
      description: 'Frequent meetings before 9am',
      frequency: `${earlyMeetings.length} meetings before 9am`,
      impact: 'negative',
      suggestion: 'Protect early morning for focused work',
    });
  }

  // Late afternoon meetings
  const lateMeetings = meetings.filter(m => m.start.getHours() >= 16);
  if (lateMeetings.length > 10) {
    patterns.push({
      type: 'late_meetings',
      description: 'Frequent meetings after 4pm',
      frequency: `${lateMeetings.length} meetings after 4pm`,
      impact: 'neutral',
      suggestion: 'Consider if these could be async updates',
    });
  }

  // Mostly organizer
  const organized = meetings.filter(m => m.attendees.some(a => a.isOrganizer));
  if (organized.length > meetings.length * 0.6) {
    patterns.push({
      type: 'high_organizer',
      description: 'Organizing most of your meetings',
      frequency: `${Math.round((organized.length / meetings.length) * 100)}% organized by you`,
      impact: 'neutral',
      suggestion: 'Consider delegating meeting facilitation',
    });
  }

  return patterns;
}

function analyzeFragmentation(
  events: CalendarEvent[],
  start: Date,
  end: Date
): FragmentationAnalysis {
  const meetings = events.filter(e =>
    e.type !== 'focus_time' && e.status !== 'cancelled'
  );

  // Count back-to-back meetings
  const sorted = [...meetings].sort((a, b) => a.start.getTime() - b.start.getTime());
  let backToBack = 0;
  let contextSwitches = 0;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start.getTime() - sorted[i - 1].end.getTime();
    if (gap <= 15 * 60 * 1000) {
      backToBack++;
    }
    if (gap <= 60 * 60 * 1000) {
      contextSwitches++;
    }
  }

  // Calculate focus blocks
  const focusBlocks = calculateFocusBlocks(events, start, end);
  const avgFocusBlock = focusBlocks.length > 0
    ? focusBlocks.reduce((sum, b) => sum + b, 0) / focusBlocks.length
    : 0;
  const longestFocusBlock = focusBlocks.length > 0 ? Math.max(...focusBlocks) : 0;

  // Calculate meeting-free hours
  const workDays = getWorkDayCount(start, end);
  const meetingHours = meetings.reduce((sum, m) => sum + m.duration / 60, 0);
  const meetingFreeHours = workDays > 0
    ? (workDays * 8 - meetingHours) / workDays
    : 8;

  // Fragmentation score (higher = more fragmented)
  const fragmentationScore = Math.min(100, Math.round(
    (backToBack * 5) +
    (contextSwitches * 2) +
    Math.max(0, 50 - avgFocusBlock / 2)
  ));

  return {
    score: fragmentationScore,
    avgFocusBlockMinutes: Math.round(avgFocusBlock),
    longestFocusBlockMinutes: Math.round(longestFocusBlock),
    meetingFreeHoursPerDay: Math.round(meetingFreeHours * 10) / 10,
    backToBackMeetings: backToBack,
    contextSwitches,
  };
}

function calculateFocusBlocks(events: CalendarEvent[], start: Date, end: Date): number[] {
  const blocks: number[] = [];
  const meetings = events
    .filter(e => e.type !== 'focus_time' && e.status !== 'cancelled')
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let current = new Date(start);

  while (current < end) {
    if (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dayStart = new Date(current);
    dayStart.setHours(9, 0, 0, 0);
    const dayEnd = new Date(current);
    dayEnd.setHours(18, 0, 0, 0);

    const dayMeetings = meetings.filter(m =>
      m.start >= dayStart && m.end <= dayEnd
    );

    let blockStart = dayStart;
    for (const meeting of dayMeetings) {
      if (meeting.start > blockStart) {
        const blockMinutes = (meeting.start.getTime() - blockStart.getTime()) / 60000;
        if (blockMinutes >= 30) {
          blocks.push(blockMinutes);
        }
      }
      blockStart = new Date(Math.max(blockStart.getTime(), meeting.end.getTime()));
    }

    if (blockStart < dayEnd) {
      const blockMinutes = (dayEnd.getTime() - blockStart.getTime()) / 60000;
      if (blockMinutes >= 30) {
        blocks.push(blockMinutes);
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return blocks;
}

function generateRecommendations(
  meetings: CalendarEvent[],
  overview: MeetingOverview,
  efficiency: MeetingEfficiency,
  fragmentation: FragmentationAnalysis
): MeetingRecommendation[] {
  const recommendations: MeetingRecommendation[] = [];

  // Too many meetings
  if (overview.avgPerDay > 5) {
    recommendations.push({
      priority: 'high',
      type: 'reduce',
      title: 'Reduce Meeting Load',
      description: `You average ${overview.avgPerDay} meetings per day. Consider declining or delegating non-essential meetings.`,
      potentialTimeSaved: (overview.avgPerDay - 4) * 0.5 * 5, // hours per week
    });
  }

  // High recurring ratio
  if (overview.recurring > overview.totalMeetings * 0.6) {
    recommendations.push({
      priority: 'medium',
      type: 'consolidate',
      title: 'Audit Recurring Meetings',
      description: 'Over 60% of your meetings are recurring. Review each for continued necessity.',
      potentialTimeSaved: overview.recurring * 0.25 * 0.5, // 25% could be eliminated
    });
  }

  // Poor fragmentation
  if (fragmentation.score > 60) {
    recommendations.push({
      priority: 'high',
      type: 'consolidate',
      title: 'Consolidate Meeting Times',
      description: 'Your calendar is highly fragmented. Try batching meetings to create focus blocks.',
      potentialTimeSaved: 2,
    });
  }

  // Back-to-back meetings
  if (fragmentation.backToBackMeetings > 10) {
    recommendations.push({
      priority: 'medium',
      type: 'reschedule',
      title: 'Add Meeting Buffers',
      description: `You have ${fragmentation.backToBackMeetings} back-to-back meeting sequences. Add 5-10 minute buffers.`,
      potentialTimeSaved: 0,
    });
  }

  // Low efficiency score
  if (efficiency.score < 60) {
    recommendations.push({
      priority: 'high',
      type: 'async',
      title: 'Improve Meeting Efficiency',
      description: 'Your meeting efficiency score is low. Consider which meetings could be async updates.',
      potentialTimeSaved: overview.totalHours * 0.2 / 4, // 20% to async, per week
    });
  }

  return recommendations;
}

function calculateCost(overview: MeetingOverview): MeetingCost {
  const hourlyRate = 75; // Assumed average
  const weeksInPeriod = 4;
  const hoursPerWeek = overview.totalHours / weeksInPeriod;
  const costPerWeek = hoursPerWeek * hourlyRate;

  return {
    hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
    estimatedCostPerWeek: Math.round(costPerWeek),
    opportunityCost: `${Math.round(hoursPerWeek)} hours/week not available for focused work`,
    comparisons: [
      {
        label: 'Monthly cost',
        equivalent: `$${Math.round(costPerWeek * 4).toLocaleString()} in salary time`,
      },
      {
        label: 'Annual cost',
        equivalent: `$${Math.round(costPerWeek * 52).toLocaleString()} in salary time`,
      },
      {
        label: 'Time equivalent',
        equivalent: `${Math.round(hoursPerWeek * 52)} hours/year in meetings`,
      },
    ],
  };
}

function analyzeSharedMeetings(
  users: Array<{ id: string; name: string | null; email: string }>
): SharedMeetingInfo[] {
  // Simulate shared meeting analysis
  return [
    {
      title: 'Team Standup',
      frequency: 'Daily',
      attendeeCount: users.length,
      totalHoursPerWeek: users.length * 0.25 * 5,
      necessityScore: 85,
    },
    {
      title: 'Sprint Planning',
      frequency: 'Bi-weekly',
      attendeeCount: users.length,
      totalHoursPerWeek: users.length * 2 / 2,
      necessityScore: 90,
    },
    {
      title: 'All-Hands',
      frequency: 'Weekly',
      attendeeCount: users.length,
      totalHoursPerWeek: users.length * 1,
      necessityScore: 70,
      suggestion: 'Consider bi-weekly with async updates',
    },
  ];
}

function calculateMeetingCulture(memberAnalyses: MeetingAnalysis[]): MeetingCultureScore {
  const avgEfficiency = memberAnalyses.reduce((sum, a) => sum + a.efficiency.score, 0) / memberAnalyses.length;
  const avgFragmentation = memberAnalyses.reduce((sum, a) => sum + a.fragmentation.score, 0) / memberAnalyses.length;
  const avgLoad = memberAnalyses.reduce((sum, a) => sum + a.overview.avgPerDay, 0) / memberAnalyses.length;

  const dimensions = [
    {
      dimension: 'Meeting Efficiency',
      score: Math.round(avgEfficiency),
      description: avgEfficiency > 70 ? 'Meetings are generally efficient' : 'Room for improvement in meeting efficiency',
    },
    {
      dimension: 'Focus Time Protection',
      score: Math.round(100 - avgFragmentation),
      description: avgFragmentation < 50 ? 'Good focus time protection' : 'Calendars are fragmented',
    },
    {
      dimension: 'Meeting Load Balance',
      score: Math.round(Math.max(0, 100 - (avgLoad - 3) * 20)),
      description: avgLoad < 5 ? 'Reasonable meeting load' : 'High meeting volume',
    },
  ];

  const overallScore = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);

  return {
    overallScore,
    dimensions,
  };
}

function generateTeamRecommendations(
  memberAnalyses: MeetingAnalysis[],
  sharedMeetings: SharedMeetingInfo[]
): MeetingRecommendation[] {
  const recommendations: MeetingRecommendation[] = [];

  // Check for low-necessity shared meetings
  const lowNecessity = sharedMeetings.filter(m => m.necessityScore < 75);
  if (lowNecessity.length > 0) {
    recommendations.push({
      priority: 'medium',
      type: 'reduce',
      title: 'Review Shared Meeting Necessity',
      description: `${lowNecessity.length} team meetings scored below 75% necessity. Consider reducing frequency or making async.`,
      potentialTimeSaved: lowNecessity.reduce((sum, m) => sum + m.totalHoursPerWeek * 0.5, 0),
      affectedMeetings: lowNecessity.map(m => m.title),
    });
  }

  // Check for imbalanced meeting loads
  const loads = memberAnalyses.map(a => a.overview.totalHours);
  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);
  if (maxLoad > minLoad * 2) {
    recommendations.push({
      priority: 'high',
      type: 'delegate',
      title: 'Balance Meeting Load',
      description: 'Significant imbalance in meeting loads across team members.',
      potentialTimeSaved: 0,
    });
  }

  return recommendations;
}

function generateCancelSuggestions(analysis: MeetingAnalysis): Array<{ title: string; reason: string; hoursSaved: number }> {
  // Simulate suggestions
  return [
    {
      title: 'Weekly Status Update',
      reason: 'Could be replaced with async Slack update',
      hoursSaved: 1,
    },
  ];
}

function generateShortenSuggestions(analysis: MeetingAnalysis): Array<{ title: string; currentDuration: number; suggestedDuration: number }> {
  return [
    {
      title: '1:1 with Direct Report',
      currentDuration: 60,
      suggestedDuration: 30,
    },
  ];
}

function generateAsyncSuggestions(analysis: MeetingAnalysis): Array<{ title: string; reason: string; alternative: string }> {
  return [
    {
      title: 'Project Update Meeting',
      reason: 'Information sharing only, no discussion needed',
      alternative: 'Loom video or written update',
    },
  ];
}

function getWorkDayCount(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);

  while (current < end) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

function calculatePercentChange(previous: number, current: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// =============================================================================
// Exports
// =============================================================================

export default {
  analyzeMeetings,
  analyzeTeamMeetings,
  getMeetingOptimizations,
  compareMeetingPeriods,
};
