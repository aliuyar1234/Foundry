/**
 * Google Calendar API Client Wrapper
 * Provides typed access to Google Calendar API endpoints
 */

export interface CalendarClientConfig {
  accessToken: string;
}

export interface CalendarEventAttendee {
  email: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
}

export interface CalendarEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink: string;
  created: string;
  updated: string;
  summary?: string;
  description?: string;
  location?: string;
  creator?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  start: CalendarEventTime;
  end: CalendarEventTime;
  endTimeUnspecified?: boolean;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: CalendarEventTime;
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  iCalUID: string;
  sequence: number;
  attendees?: CalendarEventAttendee[];
  attendeesOmitted?: boolean;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
    conferenceSolution?: {
      name: string;
      iconUri: string;
    };
  };
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  privateCopy?: boolean;
  locked?: boolean;
  eventType?: 'default' | 'outOfOffice' | 'focusTime' | 'workingLocation';
}

export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  hidden?: boolean;
  selected?: boolean;
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  primary?: boolean;
}

export interface CalendarListResponse<T> {
  items: T[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Google Calendar API client wrapper class
 */
export class GoogleCalendarClient {
  private accessToken: string;

  constructor(config: CalendarClientConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Make authenticated request to Calendar API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${CALENDAR_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Calendar API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * List user's calendars
   */
  async listCalendars(options: {
    maxResults?: number;
    pageToken?: string;
    syncToken?: string;
    showDeleted?: boolean;
    showHidden?: boolean;
  } = {}): Promise<CalendarListResponse<Calendar>> {
    const params = new URLSearchParams();

    if (options.maxResults) {
      params.set('maxResults', options.maxResults.toString());
    }
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }
    if (options.syncToken) {
      params.set('syncToken', options.syncToken);
    }
    if (options.showDeleted !== undefined) {
      params.set('showDeleted', options.showDeleted.toString());
    }
    if (options.showHidden !== undefined) {
      params.set('showHidden', options.showHidden.toString());
    }

    const query = params.toString();
    return this.request(`/users/me/calendarList${query ? `?${query}` : ''}`);
  }

  /**
   * Get primary calendar
   */
  async getPrimaryCalendar(): Promise<Calendar> {
    return this.request('/calendars/primary');
  }

  /**
   * List events from a calendar
   */
  async listEvents(
    calendarId = 'primary',
    options: {
      maxResults?: number;
      pageToken?: string;
      syncToken?: string;
      timeMin?: string;
      timeMax?: string;
      updatedMin?: string;
      q?: string;
      showDeleted?: boolean;
      singleEvents?: boolean;
      orderBy?: 'startTime' | 'updated';
    } = {}
  ): Promise<CalendarListResponse<CalendarEvent>> {
    const params = new URLSearchParams();

    if (options.maxResults) {
      params.set('maxResults', options.maxResults.toString());
    }
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }
    if (options.syncToken) {
      params.set('syncToken', options.syncToken);
    }
    if (options.timeMin) {
      params.set('timeMin', options.timeMin);
    }
    if (options.timeMax) {
      params.set('timeMax', options.timeMax);
    }
    if (options.updatedMin) {
      params.set('updatedMin', options.updatedMin);
    }
    if (options.q) {
      params.set('q', options.q);
    }
    if (options.showDeleted !== undefined) {
      params.set('showDeleted', options.showDeleted.toString());
    }
    if (options.singleEvents !== undefined) {
      params.set('singleEvents', options.singleEvents.toString());
    }
    if (options.orderBy) {
      params.set('orderBy', options.orderBy);
    }

    const query = params.toString();
    const encodedCalendarId = encodeURIComponent(calendarId);
    return this.request(`/calendars/${encodedCalendarId}/events${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single event
   */
  async getEvent(
    calendarId: string,
    eventId: string
  ): Promise<CalendarEvent> {
    const encodedCalendarId = encodeURIComponent(calendarId);
    const encodedEventId = encodeURIComponent(eventId);
    return this.request(`/calendars/${encodedCalendarId}/events/${encodedEventId}`);
  }

  /**
   * Get events using incremental sync (syncToken)
   */
  async getEventsDelta(
    calendarId = 'primary',
    syncToken?: string,
    lookbackDate?: Date
  ): Promise<{
    events: CalendarEvent[];
    nextSyncToken?: string;
    nextPageToken?: string;
  }> {
    const options: Parameters<typeof this.listEvents>[1] = {
      maxResults: 250,
      showDeleted: true,
      singleEvents: true,
    };

    if (syncToken) {
      options.syncToken = syncToken;
    } else if (lookbackDate) {
      options.timeMin = lookbackDate.toISOString();
      options.orderBy = 'updated';
    }

    const response = await this.listEvents(calendarId, options);

    return {
      events: response.items || [],
      nextSyncToken: response.nextSyncToken,
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Collect all events from paginated response
   */
  async getAllEvents(
    calendarId = 'primary',
    options: Parameters<typeof this.listEvents>[1] = {}
  ): Promise<CalendarEvent[]> {
    const allEvents: CalendarEvent[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listEvents(calendarId, {
        ...options,
        pageToken,
      });

      allEvents.push(...(response.items || []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allEvents;
  }

  /**
   * Test connection by getting primary calendar
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getPrimaryCalendar();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Calendar client instance
 */
export function createCalendarClient(accessToken: string): GoogleCalendarClient {
  return new GoogleCalendarClient({ accessToken });
}
