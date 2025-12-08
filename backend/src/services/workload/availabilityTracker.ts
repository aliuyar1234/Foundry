/**
 * Availability Tracker Service
 * T219 - Track and manage team member availability
 *
 * Provides real-time availability tracking and scheduling assistance
 */

import { prisma } from '../../lib/prisma.js';
import { EventEmitter } from 'events';
import { getCalendarEvents, getAvailability as getCalendarAvailability } from './calendarIntegration.js';

// =============================================================================
// Types
// =============================================================================

export interface PersonAvailability {
  personId: string;
  personName: string;
  currentStatus: AvailabilityStatus;
  statusSince: Date;
  statusUntil?: Date;
  workingHours: WorkingHours;
  timezone: string;
  todaySchedule: ScheduleBlock[];
  nextAvailable?: Date;
  customStatus?: string;
  autoStatus: boolean;
}

export type AvailabilityStatus =
  | 'available'
  | 'busy'
  | 'in_meeting'
  | 'focusing'
  | 'away'
  | 'out_of_office'
  | 'offline';

export interface WorkingHours {
  timezone: string;
  schedule: {
    [day: string]: { start: string; end: string } | null; // null = not working
  };
  exceptions: Array<{
    date: Date;
    hours: { start: string; end: string } | null;
    reason?: string;
  }>;
}

export interface ScheduleBlock {
  start: Date;
  end: Date;
  type: 'meeting' | 'focus' | 'available' | 'break' | 'out';
  title?: string;
  attendees?: number;
}

export interface TeamAvailability {
  teamId: string;
  asOf: Date;
  members: PersonAvailability[];
  summary: {
    available: number;
    busy: number;
    inMeeting: number;
    focusing: number;
    away: number;
    outOfOffice: number;
    offline: number;
  };
  commonAvailability: CommonSlot[];
}

export interface CommonSlot {
  start: Date;
  end: Date;
  duration: number; // minutes
  availableMembers: string[];
  allAvailable: boolean;
}

export interface AvailabilityPreferences {
  personId: string;
  preferredMeetingTimes: string[]; // e.g., "morning", "afternoon"
  focusTimeBlocks: Array<{ dayOfWeek: number; start: string; end: string }>;
  bufferBetweenMeetings: number; // minutes
  maxMeetingsPerDay: number;
  noMeetingDays: number[]; // 0-6, Sunday = 0
  autoDeclineOutsideHours: boolean;
  autoSetFocusStatus: boolean;
}

export interface ScheduleSuggestion {
  slot: {
    start: Date;
    end: Date;
  };
  score: number; // 0-100
  reasons: string[];
  conflicts: string[];
  attendeeAvailability: Array<{
    personId: string;
    personName: string;
    available: boolean;
    conflict?: string;
  }>;
}

// =============================================================================
// Availability Tracker
// =============================================================================

const availabilityEmitter = new EventEmitter();

// In-memory status cache (would be Redis in production)
const statusCache = new Map<string, PersonAvailability>();
const preferencesCache = new Map<string, AvailabilityPreferences>();

// Default working hours
const DEFAULT_WORKING_HOURS: WorkingHours = {
  timezone: 'America/New_York',
  schedule: {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' },
    saturday: null,
    sunday: null,
  },
  exceptions: [],
};

/**
 * Get availability for a person
 */
export async function getPersonAvailability(
  personId: string
): Promise<PersonAvailability> {
  // Check cache first
  const cached = statusCache.get(personId);
  if (cached && cached.statusSince > new Date(Date.now() - 60000)) {
    return cached;
  }

  const user = await prisma.user.findUnique({
    where: { id: personId },
  });

  if (!user) {
    throw new Error(`Person not found: ${personId}`);
  }

  // Get calendar events for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const events = await getCalendarEvents(personId, {
    start: today,
    end: tomorrow,
  });

  // Determine current status
  const now = new Date();
  const currentEvent = events.find(e =>
    e.start <= now && e.end > now && e.status !== 'cancelled'
  );

  let currentStatus: AvailabilityStatus;
  let statusUntil: Date | undefined;

  if (currentEvent) {
    currentStatus = currentEvent.type === 'focus_time' ? 'focusing' : 'in_meeting';
    statusUntil = currentEvent.end;
  } else if (!isWorkingHours(now, DEFAULT_WORKING_HOURS)) {
    currentStatus = 'offline';
  } else {
    currentStatus = 'available';
  }

  // Build today's schedule
  const todaySchedule = buildTodaySchedule(events, DEFAULT_WORKING_HOURS);

  // Find next available time
  const nextAvailable = findNextAvailable(events, now, DEFAULT_WORKING_HOURS);

  const availability: PersonAvailability = {
    personId,
    personName: user.name || user.email,
    currentStatus,
    statusSince: currentEvent?.start || now,
    statusUntil,
    workingHours: DEFAULT_WORKING_HOURS,
    timezone: DEFAULT_WORKING_HOURS.timezone,
    todaySchedule,
    nextAvailable: currentStatus !== 'available' ? nextAvailable : undefined,
    autoStatus: true,
  };

  // Update cache
  statusCache.set(personId, availability);

  return availability;
}

/**
 * Set manual status for a person
 */
export async function setStatus(
  personId: string,
  status: AvailabilityStatus,
  options: {
    until?: Date;
    customMessage?: string;
  } = {}
): Promise<PersonAvailability> {
  const current = await getPersonAvailability(personId);

  const updated: PersonAvailability = {
    ...current,
    currentStatus: status,
    statusSince: new Date(),
    statusUntil: options.until,
    customStatus: options.customMessage,
    autoStatus: false,
  };

  statusCache.set(personId, updated);

  // Emit status change event
  availabilityEmitter.emit('status_changed', {
    personId,
    previousStatus: current.currentStatus,
    newStatus: status,
  });

  return updated;
}

/**
 * Get team availability
 */
export async function getTeamAvailability(
  teamId: string,
  options: {
    includeSchedules?: boolean;
    futureHours?: number;
  } = {}
): Promise<TeamAvailability> {
  const { includeSchedules = true, futureHours = 8 } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Get availability for each member
  const members = await Promise.all(
    team.users.map(user => getPersonAvailability(user.id))
  );

  // Calculate summary
  const summary = {
    available: members.filter(m => m.currentStatus === 'available').length,
    busy: members.filter(m => m.currentStatus === 'busy').length,
    inMeeting: members.filter(m => m.currentStatus === 'in_meeting').length,
    focusing: members.filter(m => m.currentStatus === 'focusing').length,
    away: members.filter(m => m.currentStatus === 'away').length,
    outOfOffice: members.filter(m => m.currentStatus === 'out_of_office').length,
    offline: members.filter(m => m.currentStatus === 'offline').length,
  };

  // Find common availability
  const now = new Date();
  const futureEnd = new Date(now.getTime() + futureHours * 60 * 60 * 1000);
  const commonAvailability = await findCommonAvailability(
    team.users.map(u => u.id),
    now,
    futureEnd
  );

  return {
    teamId,
    asOf: new Date(),
    members: includeSchedules ? members : members.map(m => ({
      ...m,
      todaySchedule: [],
    })),
    summary,
    commonAvailability,
  };
}

/**
 * Find times when all (or most) team members are available
 */
export async function findCommonAvailability(
  personIds: string[],
  start: Date,
  end: Date,
  options: {
    minDuration?: number; // minutes
    minAvailable?: number; // minimum people available
  } = {}
): Promise<CommonSlot[]> {
  const { minDuration = 30, minAvailable = Math.ceil(personIds.length * 0.8) } = options;

  // Get availability for each person
  const availabilities = await Promise.all(
    personIds.map(id => getCalendarAvailability(id, { start, end, minDuration }))
  );

  const slots: CommonSlot[] = [];

  // Find intersecting slots
  // Start with the first person's availability
  let commonSlots = availabilities[0]?.map(slot => ({
    start: slot.start,
    end: slot.end,
    availablePersons: new Set([personIds[0]]),
  })) || [];

  // Intersect with each subsequent person
  for (let i = 1; i < personIds.length; i++) {
    const personSlots = availabilities[i] || [];
    const newCommonSlots: typeof commonSlots = [];

    for (const common of commonSlots) {
      for (const personSlot of personSlots) {
        const overlapStart = new Date(Math.max(common.start.getTime(), personSlot.start.getTime()));
        const overlapEnd = new Date(Math.min(common.end.getTime(), personSlot.end.getTime()));

        if (overlapStart < overlapEnd) {
          const existing = newCommonSlots.find(s =>
            s.start.getTime() === overlapStart.getTime() &&
            s.end.getTime() === overlapEnd.getTime()
          );

          if (existing) {
            existing.availablePersons.add(personIds[i]);
            common.availablePersons.forEach(p => existing.availablePersons.add(p));
          } else {
            const newSlot = {
              start: overlapStart,
              end: overlapEnd,
              availablePersons: new Set([...common.availablePersons, personIds[i]]),
            };
            newCommonSlots.push(newSlot);
          }
        }
      }

      // Keep partial overlaps if minimum available is met
      if (common.availablePersons.size >= minAvailable) {
        const existing = newCommonSlots.find(s =>
          s.start.getTime() === common.start.getTime() &&
          s.end.getTime() === common.end.getTime()
        );
        if (!existing) {
          newCommonSlots.push(common);
        }
      }
    }

    commonSlots = newCommonSlots;
  }

  // Convert to final format
  for (const slot of commonSlots) {
    const duration = Math.round((slot.end.getTime() - slot.start.getTime()) / 60000);
    if (duration >= minDuration && slot.availablePersons.size >= minAvailable) {
      slots.push({
        start: slot.start,
        end: slot.end,
        duration,
        availableMembers: Array.from(slot.availablePersons),
        allAvailable: slot.availablePersons.size === personIds.length,
      });
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Get scheduling suggestions for a meeting
 */
export async function getSchedulingSuggestions(
  attendeeIds: string[],
  options: {
    duration: number; // minutes
    within?: { start: Date; end: Date };
    preferredTimes?: string[]; // morning, afternoon, etc.
    maxSuggestions?: number;
  }
): Promise<ScheduleSuggestion[]> {
  const {
    duration,
    within = {
      start: new Date(),
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    maxSuggestions = 5,
  } = options;

  // Find common availability
  const commonSlots = await findCommonAvailability(
    attendeeIds,
    within.start,
    within.end,
    { minDuration: duration }
  );

  // Score and rank slots
  const suggestions: ScheduleSuggestion[] = [];

  for (const slot of commonSlots.slice(0, maxSuggestions * 2)) {
    // Get attendee names
    const attendeeAvailability = await Promise.all(
      attendeeIds.map(async (id) => {
        const person = await getPersonAvailability(id);
        const isAvailable = slot.availableMembers.includes(id);
        return {
          personId: id,
          personName: person.personName,
          available: isAvailable,
          conflict: isAvailable ? undefined : 'Has conflicting event',
        };
      })
    );

    // Calculate score
    let score = 100;
    const reasons: string[] = [];
    const conflicts: string[] = [];

    // Penalize if not all available
    if (!slot.allAvailable) {
      const unavailableCount = attendeeIds.length - slot.availableMembers.length;
      score -= unavailableCount * 20;
      conflicts.push(`${unavailableCount} attendee(s) have conflicts`);
    } else {
      reasons.push('All attendees available');
    }

    // Prefer morning/afternoon based on preferences
    const hour = slot.start.getHours();
    if (hour >= 9 && hour <= 11) {
      score += 5;
      reasons.push('Morning slot (typically productive)');
    } else if (hour >= 14 && hour <= 16) {
      score += 3;
      reasons.push('Afternoon slot');
    }

    // Penalize early morning or late afternoon
    if (hour < 9 || hour >= 17) {
      score -= 10;
      conflicts.push('Outside typical working hours');
    }

    // Prefer days with less meetings
    // (would check calendar density in production)

    suggestions.push({
      slot: {
        start: slot.start,
        end: new Date(slot.start.getTime() + duration * 60 * 1000),
      },
      score: Math.max(0, Math.min(100, score)),
      reasons,
      conflicts,
      attendeeAvailability,
    });
  }

  // Sort by score and limit
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);
}

/**
 * Get availability preferences
 */
export async function getAvailabilityPreferences(
  personId: string
): Promise<AvailabilityPreferences> {
  const cached = preferencesCache.get(personId);
  if (cached) return cached;

  // Return defaults
  const defaults: AvailabilityPreferences = {
    personId,
    preferredMeetingTimes: ['morning', 'afternoon'],
    focusTimeBlocks: [
      { dayOfWeek: 1, start: '09:00', end: '11:00' },
      { dayOfWeek: 3, start: '09:00', end: '11:00' },
    ],
    bufferBetweenMeetings: 15,
    maxMeetingsPerDay: 6,
    noMeetingDays: [],
    autoDeclineOutsideHours: false,
    autoSetFocusStatus: true,
  };

  preferencesCache.set(personId, defaults);
  return defaults;
}

/**
 * Update availability preferences
 */
export async function updateAvailabilityPreferences(
  personId: string,
  updates: Partial<Omit<AvailabilityPreferences, 'personId'>>
): Promise<AvailabilityPreferences> {
  const current = await getAvailabilityPreferences(personId);

  const updated: AvailabilityPreferences = {
    ...current,
    ...updates,
  };

  preferencesCache.set(personId, updated);
  return updated;
}

/**
 * Subscribe to availability changes
 */
export function onAvailabilityChange(
  callback: (event: {
    personId: string;
    previousStatus: AvailabilityStatus;
    newStatus: AvailabilityStatus;
  }) => void
): () => void {
  availabilityEmitter.on('status_changed', callback);
  return () => availabilityEmitter.off('status_changed', callback);
}

/**
 * Check if a time slot conflicts with preferences
 */
export async function checkPreferenceConflicts(
  personId: string,
  proposedTime: { start: Date; end: Date }
): Promise<{
  hasConflicts: boolean;
  conflicts: string[];
}> {
  const prefs = await getAvailabilityPreferences(personId);
  const conflicts: string[] = [];

  const dayOfWeek = proposedTime.start.getDay();
  const hour = proposedTime.start.getHours();

  // Check no-meeting days
  if (prefs.noMeetingDays.includes(dayOfWeek)) {
    conflicts.push(`This is a no-meeting day`);
  }

  // Check focus time blocks
  for (const block of prefs.focusTimeBlocks) {
    if (block.dayOfWeek === dayOfWeek) {
      const blockStart = parseInt(block.start.split(':')[0]);
      const blockEnd = parseInt(block.end.split(':')[0]);
      if (hour >= blockStart && hour < blockEnd) {
        conflicts.push(`Conflicts with scheduled focus time (${block.start}-${block.end})`);
      }
    }
  }

  // Check preferred times
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  if (!prefs.preferredMeetingTimes.includes(timeOfDay)) {
    conflicts.push(`${timeOfDay} is not a preferred meeting time`);
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function isWorkingHours(date: Date, workingHours: WorkingHours): boolean {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const dayHours = workingHours.schedule[dayName];

  if (!dayHours) return false;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const [startHour, startMin] = dayHours.start.split(':').map(Number);
  const [endHour, endMin] = dayHours.end.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

function buildTodaySchedule(
  events: Array<{
    start: Date;
    end: Date;
    type: string;
    title: string;
    attendees: Array<{ email: string }>;
  }>,
  workingHours: WorkingHours
): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const dayHours = workingHours.schedule[dayName];

  if (!dayHours) {
    return [{
      start: new Date(today.setHours(0, 0, 0, 0)),
      end: new Date(today.setHours(23, 59, 59, 999)),
      type: 'out',
      title: 'Non-working day',
    }];
  }

  const [startHour, startMin] = dayHours.start.split(':').map(Number);
  const [endHour, endMin] = dayHours.end.split(':').map(Number);

  const workStart = new Date(today);
  workStart.setHours(startHour, startMin, 0, 0);

  const workEnd = new Date(today);
  workEnd.setHours(endHour, endMin, 0, 0);

  // Sort events by start time
  const sortedEvents = [...events]
    .filter(e => e.start >= workStart && e.end <= workEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let currentTime = workStart;

  for (const event of sortedEvents) {
    // Add available block before event if gap exists
    if (event.start > currentTime) {
      blocks.push({
        start: new Date(currentTime),
        end: new Date(event.start),
        type: 'available',
      });
    }

    // Add event block
    blocks.push({
      start: event.start,
      end: event.end,
      type: event.type === 'focus_time' ? 'focus' : 'meeting',
      title: event.title,
      attendees: event.attendees.length,
    });

    currentTime = event.end;
  }

  // Add remaining available time
  if (currentTime < workEnd) {
    blocks.push({
      start: new Date(currentTime),
      end: new Date(workEnd),
      type: 'available',
    });
  }

  return blocks;
}

function findNextAvailable(
  events: Array<{ start: Date; end: Date; status: string }>,
  from: Date,
  workingHours: WorkingHours
): Date | undefined {
  // Filter to busy events after 'from'
  const busyEvents = events
    .filter(e => e.end > from && e.status !== 'cancelled')
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (busyEvents.length === 0) {
    return undefined; // Already available
  }

  // Find first gap
  let searchTime = from;

  for (const event of busyEvents) {
    if (event.start > searchTime) {
      // Gap found
      return searchTime;
    }
    searchTime = new Date(Math.max(searchTime.getTime(), event.end.getTime()));
  }

  return searchTime;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  getPersonAvailability,
  setStatus,
  getTeamAvailability,
  findCommonAvailability,
  getSchedulingSuggestions,
  getAvailabilityPreferences,
  updateAvailabilityPreferences,
  onAvailabilityChange,
  checkPreferenceConflicts,
};
