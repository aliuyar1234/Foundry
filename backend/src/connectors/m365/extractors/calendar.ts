/**
 * Calendar Events Extractor
 * Extracts structured events from Microsoft 365 calendar events
 */

import { GraphEvent } from '../graphClient.js';
import { ExtractedEvent } from '../../base/connector.js';

export interface CalendarEventMetadata {
  attendees: string[];
  duration: number; // in minutes
  isRecurring: boolean;
  isOnlineMeeting: boolean;
  isAllDay: boolean;
  isCancelled: boolean;
  responseStatus?: Record<string, string>;
}

/**
 * Calculate event duration in minutes
 */
function calculateDuration(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
}

/**
 * Extract attendee emails from event
 */
function extractAttendees(
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    status?: { response: string };
  }>
): { emails: string[]; responses: Record<string, string> } {
  if (!attendees) return { emails: [], responses: {} };

  const emails: string[] = [];
  const responses: Record<string, string> = {};

  for (const attendee of attendees) {
    const email = attendee.emailAddress?.address?.toLowerCase();
    if (email) {
      emails.push(email);
      if (attendee.status?.response) {
        responses[email] = attendee.status.response;
      }
    }
  }

  return { emails, responses };
}

/**
 * Extract meeting created event
 */
export function extractMeetingCreatedEvent(
  event: GraphEvent,
  organizationId: string
): ExtractedEvent {
  const organizerEmail = event.organizer?.emailAddress?.address?.toLowerCase();
  const { emails: attendees, responses } = extractAttendees(event.attendees);
  const duration = calculateDuration(event.start.dateTime, event.end.dateTime);

  const metadata: CalendarEventMetadata = {
    attendees,
    duration,
    isRecurring: !!event.recurrence,
    isOnlineMeeting: event.isOnlineMeeting,
    isAllDay: event.isAllDay,
    isCancelled: event.isCancelled,
    responseStatus: responses,
  };

  return {
    type: 'meeting_created',
    timestamp: new Date(event.start.dateTime),
    actorId: organizerEmail,
    metadata: {
      ...metadata,
      eventId: event.id,
      attendeeCount: attendees.length,
    },
    rawData: {
      id: event.id,
      subject: event.subject,
      organizationId,
    },
  };
}

/**
 * Extract meeting attended events (one per attendee)
 */
export function extractMeetingAttendedEvents(
  event: GraphEvent,
  organizationId: string
): ExtractedEvent[] {
  const organizerEmail = event.organizer?.emailAddress?.address?.toLowerCase();
  const { emails: attendees, responses } = extractAttendees(event.attendees);
  const duration = calculateDuration(event.start.dateTime, event.end.dateTime);

  // Don't create attended events for cancelled meetings
  if (event.isCancelled) {
    return [];
  }

  // Create an event for each attendee
  return attendees.map((attendeeEmail) => ({
    type: 'meeting_attended',
    timestamp: new Date(event.start.dateTime),
    actorId: attendeeEmail,
    targetId: organizerEmail,
    metadata: {
      organizer: organizerEmail,
      duration,
      isRecurring: !!event.recurrence,
      isOnlineMeeting: event.isOnlineMeeting,
      isAllDay: event.isAllDay,
      response: responses[attendeeEmail] || 'unknown',
      attendeeCount: attendees.length,
      eventId: event.id,
    },
    rawData: {
      id: event.id,
      subject: event.subject,
      organizationId,
    },
  }));
}

/**
 * Batch extract calendar events
 */
export function extractCalendarEvents(
  events: GraphEvent[],
  organizationId: string
): ExtractedEvent[] {
  const extractedEvents: ExtractedEvent[] = [];

  for (const event of events) {
    // Add meeting created event
    extractedEvents.push(extractMeetingCreatedEvent(event, organizationId));

    // Add meeting attended events for each attendee
    extractedEvents.push(...extractMeetingAttendedEvents(event, organizationId));
  }

  return extractedEvents;
}

/**
 * Check if meeting is a 1:1
 */
export function isOneOnOneMeeting(attendeeCount: number): boolean {
  // Organizer + 1 attendee = 2 total
  return attendeeCount === 1;
}

/**
 * Categorize meeting by size
 */
export function categorizeMeetingSize(attendeeCount: number): string {
  if (attendeeCount === 0) return 'solo';
  if (attendeeCount === 1) return 'one_on_one';
  if (attendeeCount <= 5) return 'small';
  if (attendeeCount <= 15) return 'medium';
  return 'large';
}

/**
 * Check if meeting is during typical work hours
 */
export function isDuringWorkHours(
  startTime: Date,
  workStartHour = 8,
  workEndHour = 18
): boolean {
  const hour = startTime.getHours();
  return hour >= workStartHour && hour < workEndHour;
}
