/**
 * Google Calendar Events Extractor
 * Extracts meeting patterns from Google Calendar
 */

import { GoogleCalendarClient, CalendarEvent, CalendarEventAttendee } from '../calendarClient.js';
import { ExtractedEvent } from '../../base/connector.js';

export interface CalendarExtractionOptions {
  organizationId: string;
  calendarId?: string;
  lookbackDate?: Date;
  syncToken?: string;
}

export interface CalendarExtractionResult {
  events: ExtractedEvent[];
  newSyncToken?: string;
  eventsProcessed: number;
}

/**
 * Calculate meeting duration in minutes
 */
function calculateDuration(start: string | undefined, end: string | undefined): number {
  if (!start || !end) return 0;
  const startTime = new Date(start);
  const endTime = new Date(end);
  return Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
}

/**
 * Determine meeting type from event properties
 */
function determineMeetingType(event: CalendarEvent): string {
  if (event.eventType === 'outOfOffice') return 'out_of_office';
  if (event.eventType === 'focusTime') return 'focus_time';
  if (event.eventType === 'workingLocation') return 'working_location';

  const attendeeCount = event.attendees?.length || 0;
  if (attendeeCount === 0) return 'personal';
  if (attendeeCount === 1) return 'one_on_one';
  if (attendeeCount <= 5) return 'small_meeting';
  if (attendeeCount <= 15) return 'medium_meeting';
  return 'large_meeting';
}

/**
 * Extract response status summary
 */
function getResponseSummary(attendees: CalendarEventAttendee[] = []): {
  accepted: number;
  declined: number;
  tentative: number;
  needsAction: number;
} {
  return {
    accepted: attendees.filter((a) => a.responseStatus === 'accepted').length,
    declined: attendees.filter((a) => a.responseStatus === 'declined').length,
    tentative: attendees.filter((a) => a.responseStatus === 'tentative').length,
    needsAction: attendees.filter((a) => a.responseStatus === 'needsAction').length,
  };
}

/**
 * Convert Calendar event to ExtractedEvent
 */
function calendarEventToExtractedEvent(
  event: CalendarEvent,
  organizationId: string
): ExtractedEvent {
  const startDateTime = event.start.dateTime || event.start.date;
  const endDateTime = event.end.dateTime || event.end.date;
  const timestamp = startDateTime ? new Date(startDateTime) : new Date();

  const organizerEmail = event.organizer?.email?.toLowerCase();
  const attendeeEmails = event.attendees
    ?.filter((a) => !a.organizer)
    .map((a) => a.email.toLowerCase()) || [];

  const responseSummary = getResponseSummary(event.attendees);
  const duration = calculateDuration(startDateTime, endDateTime);
  const meetingType = determineMeetingType(event);

  // Determine event type
  let eventType = 'calendar.meeting';
  if (event.status === 'cancelled') eventType = 'calendar.cancelled';
  if (event.recurrence?.length) eventType = 'calendar.recurring';
  if (event.eventType === 'outOfOffice') eventType = 'calendar.ooo';
  if (event.eventType === 'focusTime') eventType = 'calendar.focus';

  return {
    type: eventType,
    timestamp,
    actorId: organizerEmail,
    targetId: attendeeEmails[0], // Primary attendee
    metadata: {
      source: 'google',
      organizationId,
      eventId: event.id,
      iCalUID: event.iCalUID,
      summary: event.summary,
      description: event.description,
      location: event.location,
      organizer: organizerEmail,
      organizerName: event.organizer?.displayName,
      attendees: attendeeEmails,
      attendeeCount: event.attendees?.length || 0,
      startTime: startDateTime,
      endTime: endDateTime,
      duration,
      isAllDay: !event.start.dateTime,
      isRecurring: !!event.recurrence?.length,
      recurringEventId: event.recurringEventId,
      status: event.status,
      meetingType,
      isOnlineMeeting: event.isOnlineMeeting || !!event.hangoutLink,
      hangoutLink: event.hangoutLink,
      conferenceType: event.conferenceData?.conferenceSolution?.name,
      visibility: event.visibility,
      responseSummary,
      acceptanceRate: event.attendees?.length
        ? responseSummary.accepted / event.attendees.length
        : 0,
    },
    rawData: {
      calendarEvent: event,
    },
  };
}

/**
 * Extract calendar events using full sync
 */
export async function extractCalendarEventsFull(
  client: GoogleCalendarClient,
  options: CalendarExtractionOptions
): Promise<CalendarExtractionResult> {
  const events: ExtractedEvent[] = [];
  const calendarId = options.calendarId || 'primary';

  const listOptions: Parameters<typeof client.listEvents>[1] = {
    maxResults: 250,
    showDeleted: true,
    singleEvents: true,
    orderBy: 'updated',
  };

  if (options.lookbackDate) {
    listOptions.timeMin = options.lookbackDate.toISOString();
  }

  // Get all events with pagination
  let pageToken: string | undefined;
  let newSyncToken: string | undefined;

  do {
    const response = await client.listEvents(calendarId, {
      ...listOptions,
      pageToken,
    });

    for (const calEvent of response.items || []) {
      events.push(calendarEventToExtractedEvent(calEvent, options.organizationId));
    }

    pageToken = response.nextPageToken;
    newSyncToken = response.nextSyncToken;
  } while (pageToken);

  return {
    events,
    newSyncToken,
    eventsProcessed: events.length,
  };
}

/**
 * Extract calendar events using incremental sync
 */
export async function extractCalendarEventsIncremental(
  client: GoogleCalendarClient,
  options: CalendarExtractionOptions & { syncToken: string }
): Promise<CalendarExtractionResult> {
  const events: ExtractedEvent[] = [];
  const calendarId = options.calendarId || 'primary';

  let pageToken: string | undefined;
  let newSyncToken: string | undefined;

  do {
    const response = await client.listEvents(calendarId, {
      syncToken: options.syncToken,
      pageToken,
      showDeleted: true,
    });

    for (const calEvent of response.items || []) {
      events.push(calendarEventToExtractedEvent(calEvent, options.organizationId));
    }

    pageToken = response.nextPageToken;
    newSyncToken = response.nextSyncToken;
  } while (pageToken);

  return {
    events,
    newSyncToken,
    eventsProcessed: events.length,
  };
}

/**
 * Extract calendar events (auto-selects full or incremental)
 */
export async function extractCalendarEvents(
  client: GoogleCalendarClient,
  options: CalendarExtractionOptions
): Promise<CalendarExtractionResult> {
  if (options.syncToken) {
    try {
      return await extractCalendarEventsIncremental(client, {
        ...options,
        syncToken: options.syncToken,
      });
    } catch (error) {
      // Sync token may be expired (410 Gone), fall back to full sync
      console.warn('Sync token expired, falling back to full sync:', error);
      return extractCalendarEventsFull(client, options);
    }
  }

  return extractCalendarEventsFull(client, options);
}

/**
 * Calculate calendar statistics from extracted events
 */
export function calculateCalendarStats(events: ExtractedEvent[]): {
  totalMeetings: number;
  totalDuration: number;
  avgDuration: number;
  oneOnOneMeetings: number;
  smallMeetings: number;
  largeMeetings: number;
  recurringMeetings: number;
  onlineMeetings: number;
  avgAttendees: number;
  avgAcceptanceRate: number;
} {
  const meetings = events.filter((e) => e.type.startsWith('calendar.'));

  const totalDuration = meetings.reduce(
    (sum, e) => sum + (e.metadata.duration || 0),
    0
  );

  const oneOnOne = meetings.filter((e) => e.metadata.meetingType === 'one_on_one').length;
  const small = meetings.filter((e) => e.metadata.meetingType === 'small_meeting').length;
  const large = meetings.filter(
    (e) => e.metadata.meetingType === 'medium_meeting' || e.metadata.meetingType === 'large_meeting'
  ).length;
  const recurring = meetings.filter((e) => e.metadata.isRecurring).length;
  const online = meetings.filter((e) => e.metadata.isOnlineMeeting).length;

  const totalAttendees = meetings.reduce(
    (sum, e) => sum + (e.metadata.attendeeCount || 0),
    0
  );

  const acceptanceRates = meetings
    .filter((e) => e.metadata.attendeeCount > 0)
    .map((e) => e.metadata.acceptanceRate as number);
  const avgAcceptanceRate =
    acceptanceRates.length > 0
      ? acceptanceRates.reduce((sum, r) => sum + r, 0) / acceptanceRates.length
      : 0;

  return {
    totalMeetings: meetings.length,
    totalDuration,
    avgDuration: meetings.length > 0 ? totalDuration / meetings.length : 0,
    oneOnOneMeetings: oneOnOne,
    smallMeetings: small,
    largeMeetings: large,
    recurringMeetings: recurring,
    onlineMeetings: online,
    avgAttendees: meetings.length > 0 ? totalAttendees / meetings.length : 0,
    avgAcceptanceRate,
  };
}
