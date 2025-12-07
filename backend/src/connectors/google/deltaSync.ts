/**
 * Google Workspace Delta Sync
 * Manages incremental synchronization across Gmail, Calendar, and Drive
 */

import { GmailApiClient } from './gmailClient.js';
import { GoogleCalendarClient } from './calendarClient.js';
import { GoogleDriveClient } from './driveClient.js';
import { extractEmails, EmailExtractionResult } from './extractors/email.js';
import { extractCalendarEvents, CalendarExtractionResult } from './extractors/calendar.js';
import { extractDriveFiles, DriveExtractionResult } from './extractors/drive.js';
import { ExtractedEvent } from '../base/connector.js';

export interface GoogleDeltaTokens {
  gmailHistoryId?: string;
  calendarSyncToken?: string;
  drivePageToken?: string;
}

export interface GoogleSyncOptions {
  organizationId: string;
  lookbackDate?: Date;
  deltaTokens?: GoogleDeltaTokens;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncDrive?: boolean;
}

export interface GoogleSyncResult {
  events: ExtractedEvent[];
  newDeltaTokens: GoogleDeltaTokens;
  stats: {
    emailsProcessed: number;
    calendarEventsProcessed: number;
    driveFilesProcessed: number;
    totalEvents: number;
  };
}

/**
 * Calculate lookback date for initial sync
 */
export function calculateLookbackDate(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

/**
 * Parse delta tokens from stored JSON
 */
export function parseDeltaTokens(data: unknown): GoogleDeltaTokens {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const tokens = data as Record<string, unknown>;
  return {
    gmailHistoryId: typeof tokens.gmailHistoryId === 'string' ? tokens.gmailHistoryId : undefined,
    calendarSyncToken: typeof tokens.calendarSyncToken === 'string' ? tokens.calendarSyncToken : undefined,
    drivePageToken: typeof tokens.drivePageToken === 'string' ? tokens.drivePageToken : undefined,
  };
}

/**
 * Serialize delta tokens for storage
 */
export function serializeDeltaTokens(tokens: GoogleDeltaTokens): string {
  return JSON.stringify(tokens);
}

/**
 * Sync Gmail data
 */
async function syncGmail(
  accessToken: string,
  options: GoogleSyncOptions
): Promise<EmailExtractionResult> {
  const client = new GmailApiClient({ accessToken });

  return extractEmails(client, {
    organizationId: options.organizationId,
    userId: 'me',
    lookbackDate: options.lookbackDate,
    historyId: options.deltaTokens?.gmailHistoryId,
  });
}

/**
 * Sync Calendar data
 */
async function syncCalendar(
  accessToken: string,
  options: GoogleSyncOptions
): Promise<CalendarExtractionResult> {
  const client = new GoogleCalendarClient({ accessToken });

  return extractCalendarEvents(client, {
    organizationId: options.organizationId,
    lookbackDate: options.lookbackDate,
    syncToken: options.deltaTokens?.calendarSyncToken,
  });
}

/**
 * Sync Drive data
 */
async function syncDrive(
  accessToken: string,
  options: GoogleSyncOptions
): Promise<DriveExtractionResult> {
  const client = new GoogleDriveClient({ accessToken });

  return extractDriveFiles(client, {
    organizationId: options.organizationId,
    lookbackDate: options.lookbackDate,
    pageToken: options.deltaTokens?.drivePageToken,
  });
}

/**
 * Perform full sync across all Google Workspace services
 */
export async function syncGoogleWorkspace(
  accessToken: string,
  options: GoogleSyncOptions
): Promise<GoogleSyncResult> {
  const allEvents: ExtractedEvent[] = [];
  const newDeltaTokens: GoogleDeltaTokens = {};
  const stats = {
    emailsProcessed: 0,
    calendarEventsProcessed: 0,
    driveFilesProcessed: 0,
    totalEvents: 0,
  };

  // Sync Gmail
  if (options.syncEmails !== false) {
    try {
      const emailResult = await syncGmail(accessToken, options);
      allEvents.push(...emailResult.events);
      newDeltaTokens.gmailHistoryId = emailResult.newHistoryId;
      stats.emailsProcessed = emailResult.messagesProcessed;
    } catch (error) {
      console.error('Gmail sync failed:', error);
      // Keep existing token if sync fails
      newDeltaTokens.gmailHistoryId = options.deltaTokens?.gmailHistoryId;
    }
  }

  // Sync Calendar
  if (options.syncCalendar !== false) {
    try {
      const calendarResult = await syncCalendar(accessToken, options);
      allEvents.push(...calendarResult.events);
      newDeltaTokens.calendarSyncToken = calendarResult.newSyncToken;
      stats.calendarEventsProcessed = calendarResult.eventsProcessed;
    } catch (error) {
      console.error('Calendar sync failed:', error);
      // Keep existing token if sync fails
      newDeltaTokens.calendarSyncToken = options.deltaTokens?.calendarSyncToken;
    }
  }

  // Sync Drive
  if (options.syncDrive !== false) {
    try {
      const driveResult = await syncDrive(accessToken, options);
      allEvents.push(...driveResult.events);
      newDeltaTokens.drivePageToken = driveResult.newPageToken;
      stats.driveFilesProcessed = driveResult.filesProcessed;
    } catch (error) {
      console.error('Drive sync failed:', error);
      // Keep existing token if sync fails
      newDeltaTokens.drivePageToken = options.deltaTokens?.drivePageToken;
    }
  }

  stats.totalEvents = allEvents.length;

  // Sort events by timestamp
  allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    events: allEvents,
    newDeltaTokens,
    stats,
  };
}

/**
 * Test all Google Workspace connections
 */
export async function testGoogleConnections(accessToken: string): Promise<{
  gmail: boolean;
  calendar: boolean;
  drive: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let gmail = false;
  let calendar = false;
  let drive = false;

  // Test Gmail
  try {
    const gmailClient = new GmailApiClient({ accessToken });
    gmail = await gmailClient.testConnection();
    if (!gmail) {
      errors.push('Gmail connection test returned false');
    }
  } catch (error) {
    errors.push(`Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test Calendar
  try {
    const calendarClient = new GoogleCalendarClient({ accessToken });
    calendar = await calendarClient.testConnection();
    if (!calendar) {
      errors.push('Calendar connection test returned false');
    }
  } catch (error) {
    errors.push(`Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test Drive
  try {
    const driveClient = new GoogleDriveClient({ accessToken });
    drive = await driveClient.testConnection();
    if (!drive) {
      errors.push('Drive connection test returned false');
    }
  } catch (error) {
    errors.push(`Drive: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    gmail,
    calendar,
    drive,
    errors,
  };
}
