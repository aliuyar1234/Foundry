/**
 * Availability Checker Service
 * T044 - Implement unavailability detector
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { getWorkloadScore } from '../operate/realtimeMetrics.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface AvailabilityResult {
  isAvailable: boolean;
  score: number; // 0-1, higher = more available
  status: AvailabilityStatus;
  nextAvailable?: Date;
  reason?: string;
}

export type AvailabilityStatus =
  | 'available'
  | 'busy'
  | 'out_of_office'
  | 'in_meeting'
  | 'do_not_disturb'
  | 'offline'
  | 'unknown';

export interface ScheduleSlot {
  start: Date;
  end: Date;
  type: 'meeting' | 'focus' | 'available' | 'out_of_office';
  title?: string;
}

// =============================================================================
// Configuration
// =============================================================================

const AVAILABILITY_CONFIG = {
  /** Hours after which person is considered potentially offline */
  OFFLINE_THRESHOLD_HOURS: 4,
  /** Work hours (local time) */
  WORK_HOURS_START: 8,
  WORK_HOURS_END: 18,
  /** Time zones for DACH region */
  DEFAULT_TIMEZONE: 'Europe/Vienna',
};

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Check if a person is currently available
 */
export async function checkAvailability(
  personId: string,
  organizationId: string
): Promise<AvailabilityResult> {
  // Get expertise profile for availability info
  const profile = await prisma.expertiseProfile.findUnique({
    where: { personId },
  });

  if (!profile) {
    return {
      isAvailable: true, // Assume available if no profile
      score: 0.5,
      status: 'unknown',
      reason: 'No profile found',
    };
  }

  const availability = profile.availability as Record<string, unknown>;
  const timezone = (availability?.timezone as string) || AVAILABILITY_CONFIG.DEFAULT_TIMEZONE;

  // Check real-time workload status
  const workload = await getWorkloadScore(organizationId, personId);

  // Check if within work hours
  const isWorkHours = checkWorkHours(timezone);
  if (!isWorkHours.isWorkHours) {
    return {
      isAvailable: false,
      score: 0.1,
      status: 'offline',
      nextAvailable: isWorkHours.nextWorkHours,
      reason: 'Outside of work hours',
    };
  }

  // Check calendar/meeting status (simplified - would integrate with calendar)
  const calendarStatus = await checkCalendarStatus(personId);
  if (calendarStatus.inMeeting) {
    return {
      isAvailable: false,
      score: 0.2,
      status: 'in_meeting',
      nextAvailable: calendarStatus.meetingEnd,
      reason: `In meeting: ${calendarStatus.meetingTitle || 'Busy'}`,
    };
  }

  // Check out of office
  if (availability?.outOfOffice) {
    const oooEnd = availability.outOfOfficeEnd
      ? new Date(availability.outOfOfficeEnd as string)
      : undefined;
    return {
      isAvailable: false,
      score: 0,
      status: 'out_of_office',
      nextAvailable: oooEnd,
      reason: 'Out of office',
    };
  }

  // Check workload-based availability
  if (workload) {
    if (workload.workloadScore >= 95) {
      return {
        isAvailable: false,
        score: 0.05,
        status: 'busy',
        reason: 'At maximum capacity',
      };
    }

    if (workload.burnoutRisk >= 80) {
      return {
        isAvailable: true, // Still available but flagged
        score: 0.3,
        status: 'busy',
        reason: 'High burnout risk - consider alternatives',
      };
    }

    // Calculate availability score based on workload
    const workloadScore = 1 - (workload.workloadScore / 100);
    return {
      isAvailable: true,
      score: workloadScore,
      status: workloadScore > 0.5 ? 'available' : 'busy',
    };
  }

  // Default: available
  return {
    isAvailable: true,
    score: 0.7,
    status: 'available',
  };
}

/**
 * Check if multiple people are available
 */
export async function checkMultipleAvailability(
  personIds: string[],
  organizationId: string
): Promise<Map<string, AvailabilityResult>> {
  const results = new Map<string, AvailabilityResult>();

  await Promise.all(
    personIds.map(async (personId) => {
      const result = await checkAvailability(personId, organizationId);
      results.set(personId, result);
    })
  );

  return results;
}

/**
 * Find next available time for a person
 */
export async function findNextAvailableTime(
  personId: string,
  organizationId: string,
  durationMinutes: number = 30
): Promise<Date | null> {
  const availability = await checkAvailability(personId, organizationId);

  if (availability.isAvailable) {
    return new Date(); // Available now
  }

  if (availability.nextAvailable) {
    return availability.nextAvailable;
  }

  // Estimate based on status
  const now = new Date();

  switch (availability.status) {
    case 'in_meeting':
      // Assume meeting lasts 30 more minutes
      return new Date(now.getTime() + 30 * 60 * 1000);

    case 'busy':
      // Assume becomes available in 1 hour
      return new Date(now.getTime() + 60 * 60 * 1000);

    case 'offline':
      // Next work day start
      return getNextWorkDayStart();

    case 'out_of_office':
      // Unknown return date
      return null;

    default:
      return new Date(now.getTime() + 15 * 60 * 1000);
  }
}

/**
 * Get schedule overview for a person
 */
export async function getScheduleOverview(
  personId: string,
  date: Date = new Date()
): Promise<{
  totalMeetingMinutes: number;
  availableSlots: ScheduleSlot[];
  busySlots: ScheduleSlot[];
}> {
  // Simplified - would integrate with calendar service
  const dayStart = new Date(date);
  dayStart.setHours(AVAILABILITY_CONFIG.WORK_HOURS_START, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(AVAILABILITY_CONFIG.WORK_HOURS_END, 0, 0, 0);

  // Mock schedule (in real implementation, fetch from calendar)
  const busySlots: ScheduleSlot[] = [
    {
      start: new Date(date.setHours(9, 0, 0, 0)),
      end: new Date(date.setHours(10, 0, 0, 0)),
      type: 'meeting',
      title: 'Team standup',
    },
    {
      start: new Date(date.setHours(14, 0, 0, 0)),
      end: new Date(date.setHours(15, 0, 0, 0)),
      type: 'meeting',
      title: 'Project review',
    },
  ];

  const totalMeetingMinutes = busySlots
    .filter(s => s.type === 'meeting')
    .reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()) / 60000, 0);

  // Calculate available slots
  const availableSlots: ScheduleSlot[] = [];
  let currentTime = dayStart.getTime();

  for (const busy of busySlots.sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (busy.start.getTime() > currentTime) {
      availableSlots.push({
        start: new Date(currentTime),
        end: busy.start,
        type: 'available',
      });
    }
    currentTime = busy.end.getTime();
  }

  if (currentTime < dayEnd.getTime()) {
    availableSlots.push({
      start: new Date(currentTime),
      end: dayEnd,
      type: 'available',
    });
  }

  return {
    totalMeetingMinutes,
    availableSlots,
    busySlots,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if current time is within work hours
 */
function checkWorkHours(timezone: string): {
  isWorkHours: boolean;
  nextWorkHours?: Date;
} {
  // Simplified - use proper timezone library in production
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const nextMonday = new Date(now);
    nextMonday.setDate(nextMonday.getDate() + (dayOfWeek === 0 ? 1 : 2));
    nextMonday.setHours(AVAILABILITY_CONFIG.WORK_HOURS_START, 0, 0, 0);
    return {
      isWorkHours: false,
      nextWorkHours: nextMonday,
    };
  }

  // Before work hours
  if (hour < AVAILABILITY_CONFIG.WORK_HOURS_START) {
    const todayStart = new Date(now);
    todayStart.setHours(AVAILABILITY_CONFIG.WORK_HOURS_START, 0, 0, 0);
    return {
      isWorkHours: false,
      nextWorkHours: todayStart,
    };
  }

  // After work hours
  if (hour >= AVAILABILITY_CONFIG.WORK_HOURS_END) {
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // Skip weekend
    if (tomorrowStart.getDay() === 6) {
      tomorrowStart.setDate(tomorrowStart.getDate() + 2);
    } else if (tomorrowStart.getDay() === 0) {
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    }

    tomorrowStart.setHours(AVAILABILITY_CONFIG.WORK_HOURS_START, 0, 0, 0);
    return {
      isWorkHours: false,
      nextWorkHours: tomorrowStart,
    };
  }

  return { isWorkHours: true };
}

/**
 * Check calendar status (simplified)
 */
async function checkCalendarStatus(personId: string): Promise<{
  inMeeting: boolean;
  meetingEnd?: Date;
  meetingTitle?: string;
}> {
  // In real implementation, query calendar service
  // For now, return not in meeting
  return {
    inMeeting: false,
  };
}

/**
 * Get next work day start
 */
function getNextWorkDayStart(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);

  // Skip weekend
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }

  next.setHours(AVAILABILITY_CONFIG.WORK_HOURS_START, 0, 0, 0);
  return next;
}

export default {
  checkAvailability,
  checkMultipleAvailability,
  findNextAvailableTime,
  getScheduleOverview,
  AVAILABILITY_CONFIG,
};
