/**
 * Shared Calendar Discovery
 * Task: T026
 *
 * Discovers and syncs shared calendars in Google Workspace.
 * Handles calendar permissions and visibility.
 */

import { calendar_v3 } from 'googleapis';
import { ExtractedEvent } from '../../base/connector';

export interface SharedCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  primary: boolean;
  selected: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  hidden: boolean;
  deleted: boolean;
}

export interface CalendarDiscoveryResult {
  calendars: SharedCalendar[];
  primaryCalendarId?: string;
  totalCalendars: number;
  ownedCalendars: number;
  sharedWithMe: number;
}

export class SharedCalendarDiscovery {
  private calendarClient: calendar_v3.Calendar;

  constructor(calendarClient: calendar_v3.Calendar) {
    this.calendarClient = calendarClient;
  }

  /**
   * Discover all accessible calendars
   */
  async discoverCalendars(): Promise<CalendarDiscoveryResult> {
    const calendars: SharedCalendar[] = [];
    let pageToken: string | undefined;
    let primaryCalendarId: string | undefined;

    do {
      const response = await this.calendarClient.calendarList.list({
        maxResults: 250,
        pageToken,
        showDeleted: false,
        showHidden: true,
      });

      for (const item of response.data.items || []) {
        const calendar: SharedCalendar = {
          id: item.id!,
          summary: item.summary || 'Untitled Calendar',
          description: item.description,
          timeZone: item.timeZone,
          accessRole: item.accessRole as SharedCalendar['accessRole'],
          primary: item.primary || false,
          selected: item.selected || false,
          backgroundColor: item.backgroundColor,
          foregroundColor: item.foregroundColor,
          hidden: item.hidden || false,
          deleted: item.deleted || false,
        };

        if (calendar.primary) {
          primaryCalendarId = calendar.id;
        }

        calendars.push(calendar);
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    const ownedCalendars = calendars.filter((c) => c.accessRole === 'owner');
    const sharedWithMe = calendars.filter(
      (c) => c.accessRole !== 'owner' && !c.primary
    );

    return {
      calendars,
      primaryCalendarId,
      totalCalendars: calendars.length,
      ownedCalendars: ownedCalendars.length,
      sharedWithMe: sharedWithMe.length,
    };
  }

  /**
   * Get calendar details
   */
  async getCalendarDetails(calendarId: string): Promise<SharedCalendar | null> {
    try {
      const response = await this.calendarClient.calendarList.get({
        calendarId,
      });

      const item = response.data;
      return {
        id: item.id!,
        summary: item.summary || 'Untitled Calendar',
        description: item.description,
        timeZone: item.timeZone,
        accessRole: item.accessRole as SharedCalendar['accessRole'],
        primary: item.primary || false,
        selected: item.selected || false,
        backgroundColor: item.backgroundColor,
        foregroundColor: item.foregroundColor,
        hidden: item.hidden || false,
        deleted: item.deleted || false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get calendar ACL (access control list)
   */
  async getCalendarPermissions(
    calendarId: string
  ): Promise<
    Array<{
      id: string;
      role: string;
      scope: {
        type: string;
        value?: string;
      };
    }>
  > {
    try {
      const response = await this.calendarClient.acl.list({
        calendarId,
      });

      return (response.data.items || []).map((item) => ({
        id: item.id!,
        role: item.role!,
        scope: {
          type: item.scope?.type || 'unknown',
          value: item.scope?.value,
        },
      }));
    } catch {
      return [];
    }
  }

  /**
   * Sync events from a specific calendar
   */
  async syncCalendarEvents(
    calendarId: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      syncToken?: string;
      maxResults?: number;
      singleEvents?: boolean;
    } = {}
  ): Promise<{
    events: ExtractedEvent[];
    nextSyncToken?: string;
    nextPageToken?: string;
  }> {
    const events: ExtractedEvent[] = [];

    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: options.maxResults || 250,
      singleEvents: options.singleEvents ?? true,
      orderBy: options.singleEvents ? 'startTime' : undefined,
    };

    if (options.syncToken) {
      params.syncToken = options.syncToken;
    } else {
      if (options.timeMin) {
        params.timeMin = options.timeMin.toISOString();
      }
      if (options.timeMax) {
        params.timeMax = options.timeMax.toISOString();
      }
    }

    const response = await this.calendarClient.events.list(params);

    for (const item of response.data.items || []) {
      if (item.status === 'cancelled') {
        events.push({
          type: 'calendar.event.cancelled',
          timestamp: new Date(item.updated || Date.now()),
          actorId: item.organizer?.email,
          targetId: item.id,
          metadata: {
            source: 'google',
            calendarId,
            eventId: item.id,
          },
        });
        continue;
      }

      const startTime = item.start?.dateTime || item.start?.date;
      const endTime = item.end?.dateTime || item.end?.date;

      events.push({
        type: 'calendar.event',
        timestamp: startTime ? new Date(startTime) : new Date(),
        actorId: item.organizer?.email,
        targetId: item.id,
        metadata: {
          source: 'google',
          calendarId,
          eventId: item.id,
          summary: item.summary,
          description: item.description,
          location: item.location,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          isAllDay: !item.start?.dateTime,
          status: item.status,
          visibility: item.visibility,
          organizer: item.organizer?.email,
          organizerName: item.organizer?.displayName,
          attendees: (item.attendees || []).map((a) => ({
            email: a.email,
            displayName: a.displayName,
            responseStatus: a.responseStatus,
            organizer: a.organizer,
            self: a.self,
          })),
          attendeeCount: item.attendees?.length || 0,
          recurrence: item.recurrence,
          recurringEventId: item.recurringEventId,
          htmlLink: item.htmlLink,
          conferenceData: item.conferenceData
            ? {
                type: item.conferenceData.conferenceSolution?.name,
                entryPoints: item.conferenceData.entryPoints?.map((ep) => ({
                  type: ep.entryPointType,
                  uri: ep.uri,
                })),
              }
            : undefined,
        },
      });
    }

    return {
      events,
      nextSyncToken: response.data.nextSyncToken,
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Get free/busy information
   */
  async getFreeBusy(
    calendarIds: string[],
    timeMin: Date,
    timeMax: Date
  ): Promise<
    Record<
      string,
      Array<{
        start: Date;
        end: Date;
      }>
    >
  > {
    const response = await this.calendarClient.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const result: Record<string, Array<{ start: Date; end: Date }>> = {};

    for (const [calendarId, data] of Object.entries(
      response.data.calendars || {}
    )) {
      result[calendarId] = (data.busy || []).map((slot) => ({
        start: new Date(slot.start!),
        end: new Date(slot.end!),
      }));
    }

    return result;
  }

  /**
   * Filter calendars by access role
   */
  filterByAccessRole(
    calendars: SharedCalendar[],
    roles: SharedCalendar['accessRole'][]
  ): SharedCalendar[] {
    return calendars.filter((c) => roles.includes(c.accessRole));
  }

  /**
   * Get writeable calendars
   */
  getWriteableCalendars(calendars: SharedCalendar[]): SharedCalendar[] {
    return this.filterByAccessRole(calendars, ['owner', 'writer']);
  }
}

/**
 * Create shared calendar discovery
 */
export function createSharedCalendarDiscovery(
  calendarClient: calendar_v3.Calendar
): SharedCalendarDiscovery {
  return new SharedCalendarDiscovery(calendarClient);
}
