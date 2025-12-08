/**
 * Calendar Integration Service
 * T217 - Integrate with calendar systems for workload analysis
 *
 * Connects to calendar APIs to analyze time allocation
 */

import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  duration: number; // minutes
  type: EventType;
  attendees: Attendee[];
  organizer: string;
  isRecurring: boolean;
  recurrencePattern?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  location?: string;
  meetingLink?: string;
  source: CalendarSource;
}

export type EventType =
  | 'meeting'
  | 'one_on_one'
  | 'team_meeting'
  | 'all_hands'
  | 'interview'
  | 'focus_time'
  | 'out_of_office'
  | 'personal'
  | 'external'
  | 'other';

export type CalendarSource = 'google' | 'outlook' | 'apple' | 'custom';

export interface Attendee {
  email: string;
  name?: string;
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  isOrganizer: boolean;
  isOptional: boolean;
}

export interface CalendarAnalysis {
  personId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalEvents: number;
  totalMeetingHours: number;
  meetingLoad: number; // percentage of work hours
  breakdown: TimeBreakdown;
  patterns: CalendarPattern[];
  concerns: CalendarConcern[];
  availability: AvailabilitySlot[];
}

export interface TimeBreakdown {
  meetings: number; // hours
  oneOnOnes: number;
  teamMeetings: number;
  focusTime: number;
  freeTime: number;
  outOfOffice: number;
  external: number;
}

export interface CalendarPattern {
  type: string;
  description: string;
  frequency: number;
  impact: 'positive' | 'negative' | 'neutral';
  details: string;
}

export interface CalendarConcern {
  type: 'too_many_meetings' | 'insufficient_focus' | 'back_to_back' | 'after_hours' | 'no_breaks';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

export interface AvailabilitySlot {
  start: Date;
  end: Date;
  duration: number; // minutes
  type: 'free' | 'focus' | 'tentative';
}

export interface CalendarConnection {
  id: string;
  personId: string;
  source: CalendarSource;
  email: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: Date;
  syncErrors?: string[];
}

// =============================================================================
// Calendar Integration
// =============================================================================

// In-memory cache for calendar data (would be database in production)
const calendarCache = new Map<string, CalendarEvent[]>();

/**
 * Connect a calendar account
 */
export async function connectCalendar(
  personId: string,
  source: CalendarSource,
  credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }
): Promise<CalendarConnection> {
  // In production, would validate credentials and store securely
  const connection: CalendarConnection = {
    id: `cal-${personId}-${source}`,
    personId,
    source,
    email: `user@${source}.com`,
    status: 'connected',
    lastSync: new Date(),
  };

  return connection;
}

/**
 * Disconnect a calendar
 */
export async function disconnectCalendar(
  personId: string,
  source: CalendarSource
): Promise<void> {
  calendarCache.delete(`${personId}-${source}`);
}

/**
 * Get calendar events for a person
 */
export async function getCalendarEvents(
  personId: string,
  options: {
    start?: Date;
    end?: Date;
    sources?: CalendarSource[];
    types?: EventType[];
  } = {}
): Promise<CalendarEvent[]> {
  const {
    start = new Date(),
    end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  } = options;

  // Check cache
  const cacheKey = `${personId}-all`;
  let events = calendarCache.get(cacheKey);

  if (!events) {
    // Simulate fetching from calendar APIs
    events = generateSimulatedEvents(personId, start, end);
    calendarCache.set(cacheKey, events);
  }

  // Filter by date range
  let filtered = events.filter(e =>
    e.start >= start && e.end <= end
  );

  // Filter by types if specified
  if (options.types?.length) {
    filtered = filtered.filter(e => options.types!.includes(e.type));
  }

  // Filter by sources if specified
  if (options.sources?.length) {
    filtered = filtered.filter(e => options.sources!.includes(e.source));
  }

  return filtered.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Analyze calendar for workload impact
 */
export async function analyzeCalendar(
  personId: string,
  options: {
    start?: Date;
    end?: Date;
    workHoursPerDay?: number;
  } = {}
): Promise<CalendarAnalysis> {
  const {
    start = getWeekStart(new Date()),
    end = getWeekEnd(new Date()),
    workHoursPerDay = 8,
  } = options;

  const events = await getCalendarEvents(personId, { start, end });

  // Calculate breakdown
  const breakdown = calculateTimeBreakdown(events);

  // Calculate meeting load
  const workDays = getWorkDays(start, end);
  const totalWorkHours = workDays * workHoursPerDay;
  const meetingLoad = totalWorkHours > 0
    ? Math.round((breakdown.meetings / totalWorkHours) * 100)
    : 0;

  // Identify patterns
  const patterns = identifyPatterns(events);

  // Identify concerns
  const concerns = identifyConcerns(events, breakdown, meetingLoad);

  // Calculate availability
  const availability = calculateAvailability(events, start, end);

  return {
    personId,
    period: { start, end },
    totalEvents: events.length,
    totalMeetingHours: breakdown.meetings,
    meetingLoad,
    breakdown,
    patterns,
    concerns,
    availability,
  };
}

/**
 * Get availability slots for scheduling
 */
export async function getAvailability(
  personId: string,
  options: {
    start?: Date;
    end?: Date;
    minDuration?: number; // minutes
    excludeTypes?: EventType[];
  } = {}
): Promise<AvailabilitySlot[]> {
  const {
    start = new Date(),
    end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    minDuration = 30,
    excludeTypes = ['out_of_office', 'personal'],
  } = options;

  const events = await getCalendarEvents(personId, { start, end });

  // Filter out excluded types
  const relevantEvents = events.filter(e =>
    !excludeTypes.includes(e.type) && e.status !== 'cancelled'
  );

  const slots = calculateAvailability(relevantEvents, start, end);

  return slots.filter(s => s.duration >= minDuration);
}

/**
 * Find common availability across multiple people
 */
export async function findCommonAvailability(
  personIds: string[],
  options: {
    start?: Date;
    end?: Date;
    duration: number; // minutes required
    maxResults?: number;
  }
): Promise<AvailabilitySlot[]> {
  const {
    start = new Date(),
    end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    duration,
    maxResults = 10,
  } = options;

  // Get availability for each person
  const allAvailability = await Promise.all(
    personIds.map(id => getAvailability(id, { start, end, minDuration: duration }))
  );

  // Find intersection
  let common = allAvailability[0] || [];

  for (let i = 1; i < allAvailability.length; i++) {
    common = findSlotIntersection(common, allAvailability[i]);
  }

  // Filter by minimum duration
  return common
    .filter(s => s.duration >= duration)
    .slice(0, maxResults);
}

/**
 * Sync calendar data
 */
export async function syncCalendar(
  personId: string,
  source?: CalendarSource
): Promise<{
  synced: number;
  errors: string[];
}> {
  // In production, would actually fetch from calendar API
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 30);

  const events = generateSimulatedEvents(personId, start, end);

  const cacheKey = source ? `${personId}-${source}` : `${personId}-all`;
  calendarCache.set(cacheKey, events);

  return {
    synced: events.length,
    errors: [],
  };
}

/**
 * Get meeting statistics
 */
export async function getMeetingStats(
  personId: string,
  options: {
    periodDays?: number;
  } = {}
): Promise<{
  totalMeetings: number;
  totalHours: number;
  avgMeetingsPerDay: number;
  avgMeetingDuration: number;
  peakDay: string;
  mostCommonType: string;
  recurringPercent: number;
  declinedPercent: number;
}> {
  const { periodDays = 30 } = options;

  const start = new Date();
  start.setDate(start.getDate() - periodDays);

  const events = await getCalendarEvents(personId, {
    start,
    end: new Date(),
    types: ['meeting', 'one_on_one', 'team_meeting', 'all_hands', 'interview', 'external'],
  });

  const meetings = events.filter(e => e.status !== 'cancelled');
  const totalHours = meetings.reduce((sum, e) => sum + e.duration / 60, 0);
  const workDays = getWorkDays(start, new Date());

  // Find peak day
  const dayCount: Record<string, number> = {};
  const typeCount: Record<string, number> = {};

  for (const meeting of meetings) {
    const day = meeting.start.toLocaleDateString('en-US', { weekday: 'long' });
    dayCount[day] = (dayCount[day] || 0) + 1;
    typeCount[meeting.type] = (typeCount[meeting.type] || 0) + 1;
  }

  const peakDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Monday';
  const mostCommonType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'meeting';

  const recurring = meetings.filter(e => e.isRecurring).length;
  const declined = events.filter(e => e.responseStatus === 'declined').length;

  return {
    totalMeetings: meetings.length,
    totalHours: Math.round(totalHours * 10) / 10,
    avgMeetingsPerDay: workDays > 0 ? Math.round((meetings.length / workDays) * 10) / 10 : 0,
    avgMeetingDuration: meetings.length > 0 ? Math.round((totalHours / meetings.length) * 60) : 0,
    peakDay,
    mostCommonType,
    recurringPercent: meetings.length > 0 ? Math.round((recurring / meetings.length) * 100) : 0,
    declinedPercent: events.length > 0 ? Math.round((declined / events.length) * 100) : 0,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateSimulatedEvents(
  personId: string,
  start: Date,
  end: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const types: EventType[] = ['meeting', 'one_on_one', 'team_meeting', 'focus_time'];

  let current = new Date(start);

  while (current < end) {
    // Skip weekends
    if (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Generate 3-6 events per day
    const numEvents = 3 + Math.floor(Math.random() * 4);

    for (let i = 0; i < numEvents; i++) {
      const hour = 9 + Math.floor(Math.random() * 8);
      const duration = [30, 30, 60, 60, 60, 90][Math.floor(Math.random() * 6)];
      const type = types[Math.floor(Math.random() * types.length)];

      const eventStart = new Date(current);
      eventStart.setHours(hour, Math.random() > 0.5 ? 0 : 30, 0, 0);

      const eventEnd = new Date(eventStart);
      eventEnd.setMinutes(eventEnd.getMinutes() + duration);

      events.push({
        id: `event-${personId}-${events.length}`,
        title: generateEventTitle(type),
        start: eventStart,
        end: eventEnd,
        duration,
        type,
        attendees: generateAttendees(type),
        organizer: Math.random() > 0.5 ? personId : 'other@example.com',
        isRecurring: Math.random() > 0.6,
        status: 'confirmed',
        responseStatus: Math.random() > 0.1 ? 'accepted' : 'tentative',
        source: 'google',
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return events;
}

function generateEventTitle(type: EventType): string {
  const titles: Record<EventType, string[]> = {
    meeting: ['Project Sync', 'Status Update', 'Planning Session', 'Review Meeting'],
    one_on_one: ['1:1 with Manager', '1:1 with Report', 'Career Check-in'],
    team_meeting: ['Team Standup', 'Sprint Planning', 'Retrospective', 'Team Sync'],
    all_hands: ['Company All-Hands', 'Department Meeting'],
    interview: ['Interview - Engineering', 'Interview - Product'],
    focus_time: ['Focus Time', 'Deep Work Block'],
    out_of_office: ['OOO', 'Vacation'],
    personal: ['Personal', 'Appointment'],
    external: ['Client Call', 'Partner Meeting'],
    other: ['Meeting'],
  };

  const options = titles[type] || titles.other;
  return options[Math.floor(Math.random() * options.length)];
}

function generateAttendees(type: EventType): Attendee[] {
  const count = type === 'one_on_one' ? 2 :
    type === 'team_meeting' ? 5 + Math.floor(Math.random() * 5) :
    type === 'all_hands' ? 50 :
    2 + Math.floor(Math.random() * 4);

  const attendees: Attendee[] = [];

  for (let i = 0; i < count; i++) {
    attendees.push({
      email: `person${i}@example.com`,
      name: `Person ${i + 1}`,
      responseStatus: Math.random() > 0.2 ? 'accepted' : 'tentative',
      isOrganizer: i === 0,
      isOptional: Math.random() > 0.8,
    });
  }

  return attendees;
}

function calculateTimeBreakdown(events: CalendarEvent[]): TimeBreakdown {
  const breakdown: TimeBreakdown = {
    meetings: 0,
    oneOnOnes: 0,
    teamMeetings: 0,
    focusTime: 0,
    freeTime: 0,
    outOfOffice: 0,
    external: 0,
  };

  for (const event of events) {
    const hours = event.duration / 60;

    switch (event.type) {
      case 'meeting':
      case 'all_hands':
      case 'interview':
        breakdown.meetings += hours;
        break;
      case 'one_on_one':
        breakdown.oneOnOnes += hours;
        breakdown.meetings += hours;
        break;
      case 'team_meeting':
        breakdown.teamMeetings += hours;
        breakdown.meetings += hours;
        break;
      case 'focus_time':
        breakdown.focusTime += hours;
        break;
      case 'out_of_office':
      case 'personal':
        breakdown.outOfOffice += hours;
        break;
      case 'external':
        breakdown.external += hours;
        breakdown.meetings += hours;
        break;
    }
  }

  return breakdown;
}

function identifyPatterns(events: CalendarEvent[]): CalendarPattern[] {
  const patterns: CalendarPattern[] = [];

  // Check for recurring meetings
  const recurring = events.filter(e => e.isRecurring);
  if (recurring.length > events.length * 0.5) {
    patterns.push({
      type: 'high_recurring',
      description: 'High percentage of recurring meetings',
      frequency: recurring.length,
      impact: 'neutral',
      details: `${Math.round((recurring.length / events.length) * 100)}% of meetings are recurring`,
    });
  }

  // Check for morning-heavy schedule
  const morningEvents = events.filter(e => e.start.getHours() < 12);
  if (morningEvents.length > events.length * 0.6) {
    patterns.push({
      type: 'morning_heavy',
      description: 'Most meetings scheduled in the morning',
      frequency: morningEvents.length,
      impact: 'neutral',
      details: 'Consider if this impacts deep work time',
    });
  }

  return patterns;
}

function identifyConcerns(
  events: CalendarEvent[],
  breakdown: TimeBreakdown,
  meetingLoad: number
): CalendarConcern[] {
  const concerns: CalendarConcern[] = [];

  // Too many meetings
  if (meetingLoad > 50) {
    concerns.push({
      type: 'too_many_meetings',
      severity: meetingLoad > 70 ? 'high' : 'medium',
      description: `${meetingLoad}% of work time in meetings`,
      suggestion: 'Review recurring meetings for consolidation or delegation opportunities',
    });
  }

  // Insufficient focus time
  if (breakdown.focusTime < 10) {
    concerns.push({
      type: 'insufficient_focus',
      severity: breakdown.focusTime < 5 ? 'high' : 'medium',
      description: 'Limited dedicated focus time scheduled',
      suggestion: 'Block 2-3 hour focus time slots on your calendar',
    });
  }

  // Back-to-back meetings
  const backToBack = countBackToBackMeetings(events);
  if (backToBack > 5) {
    concerns.push({
      type: 'back_to_back',
      severity: backToBack > 10 ? 'high' : 'medium',
      description: `${backToBack} back-to-back meeting sequences this week`,
      suggestion: 'Add 15-minute buffers between meetings',
    });
  }

  return concerns;
}

function countBackToBackMeetings(events: CalendarEvent[]): number {
  const sorted = [...events]
    .filter(e => e.type !== 'focus_time' && e.status !== 'cancelled')
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let count = 0;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start.getTime() - sorted[i - 1].end.getTime();
    if (gap <= 5 * 60 * 1000) { // 5 minutes or less
      count++;
    }
  }

  return count;
}

function calculateAvailability(
  events: CalendarEvent[],
  start: Date,
  end: Date
): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];

  // Get busy times
  const busyTimes = events
    .filter(e => e.status !== 'cancelled')
    .map(e => ({ start: e.start, end: e.end }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Work hours: 9am - 6pm
  let current = new Date(start);

  while (current < end) {
    // Skip weekends
    if (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dayStart = new Date(current);
    dayStart.setHours(9, 0, 0, 0);

    const dayEnd = new Date(current);
    dayEnd.setHours(18, 0, 0, 0);

    // Find free slots in this day
    let slotStart = dayStart;

    for (const busy of busyTimes) {
      if (busy.start >= dayEnd) break;
      if (busy.end <= dayStart) continue;

      if (busy.start > slotStart) {
        const duration = Math.round((busy.start.getTime() - slotStart.getTime()) / 60000);
        if (duration >= 15) {
          slots.push({
            start: new Date(slotStart),
            end: new Date(busy.start),
            duration,
            type: 'free',
          });
        }
      }

      slotStart = new Date(Math.max(slotStart.getTime(), busy.end.getTime()));
    }

    // Add remaining time in day
    if (slotStart < dayEnd) {
      const duration = Math.round((dayEnd.getTime() - slotStart.getTime()) / 60000);
      if (duration >= 15) {
        slots.push({
          start: new Date(slotStart),
          end: new Date(dayEnd),
          duration,
          type: 'free',
        });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

function findSlotIntersection(
  slots1: AvailabilitySlot[],
  slots2: AvailabilitySlot[]
): AvailabilitySlot[] {
  const result: AvailabilitySlot[] = [];

  for (const s1 of slots1) {
    for (const s2 of slots2) {
      const start = new Date(Math.max(s1.start.getTime(), s2.start.getTime()));
      const end = new Date(Math.min(s1.end.getTime(), s2.end.getTime()));

      if (start < end) {
        const duration = Math.round((end.getTime() - start.getTime()) / 60000);
        result.push({ start, end, duration, type: 'free' });
      }
    }
  }

  return result;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

function getWorkDays(start: Date, end: Date): number {
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

// =============================================================================
// Exports
// =============================================================================

export default {
  connectCalendar,
  disconnectCalendar,
  getCalendarEvents,
  analyzeCalendar,
  getAvailability,
  findCommonAvailability,
  syncCalendar,
  getMeetingStats,
};
