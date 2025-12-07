/**
 * Delta Sync Implementation
 * Handles incremental synchronization using Microsoft Graph delta queries
 */

import { GraphApiClient, DeltaResponse, GraphMessage, GraphEvent } from './graphClient.js';
import { ExtractedEvent } from '../base/connector.js';
import { extractEmailEvents } from './extractors/email.js';
import { extractCalendarEvents } from './extractors/calendar.js';

export interface DeltaTokens {
  inboxDelta?: string;
  sentItemsDelta?: string;
  calendarDelta?: string;
}

export interface SyncState {
  deltaTokens: DeltaTokens;
  lastSyncAt?: Date;
  usersSynced: string[];
}

export interface DeltaSyncOptions {
  userId: string;
  organizationId: string;
  lookbackDate?: Date;
  deltaTokens?: DeltaTokens;
  syncEmails?: boolean;
  syncCalendar?: boolean;
}

export interface DeltaSyncResult {
  events: ExtractedEvent[];
  newDeltaTokens: DeltaTokens;
  itemsProcessed: {
    emails: number;
    calendarEvents: number;
  };
}

/**
 * Perform delta sync for a single user
 */
export async function syncUserData(
  client: GraphApiClient,
  options: DeltaSyncOptions
): Promise<DeltaSyncResult> {
  const { userId, organizationId, lookbackDate, deltaTokens = {}, syncEmails = true, syncCalendar = true } = options;

  const allEvents: ExtractedEvent[] = [];
  const newDeltaTokens: DeltaTokens = { ...deltaTokens };
  const itemsProcessed = { emails: 0, calendarEvents: 0 };

  // Sync inbox emails
  if (syncEmails) {
    const inboxResult = await syncInboxEmails(
      client,
      userId,
      organizationId,
      deltaTokens.inboxDelta,
      lookbackDate
    );
    allEvents.push(...inboxResult.events);
    newDeltaTokens.inboxDelta = inboxResult.deltaToken;
    itemsProcessed.emails += inboxResult.count;

    // Sync sent emails
    const sentResult = await syncSentEmails(
      client,
      userId,
      organizationId,
      deltaTokens.sentItemsDelta,
      lookbackDate
    );
    allEvents.push(...sentResult.events);
    newDeltaTokens.sentItemsDelta = sentResult.deltaToken;
    itemsProcessed.emails += sentResult.count;
  }

  // Sync calendar events
  if (syncCalendar) {
    const calendarResult = await syncCalendarEvents(
      client,
      userId,
      organizationId,
      deltaTokens.calendarDelta,
      lookbackDate
    );
    allEvents.push(...calendarResult.events);
    newDeltaTokens.calendarDelta = calendarResult.deltaToken;
    itemsProcessed.calendarEvents = calendarResult.count;
  }

  return {
    events: allEvents,
    newDeltaTokens,
    itemsProcessed,
  };
}

/**
 * Sync inbox emails with delta
 */
async function syncInboxEmails(
  client: GraphApiClient,
  userId: string,
  organizationId: string,
  deltaToken?: string,
  lookbackDate?: Date
): Promise<{ events: ExtractedEvent[]; deltaToken?: string; count: number }> {
  const messages: GraphMessage[] = [];
  let response: DeltaResponse<GraphMessage>;
  let currentDeltaToken = deltaToken;

  // Get initial page
  response = await client.getMessagesDelta(userId, currentDeltaToken, lookbackDate);
  messages.push(...response.value);

  // Follow next links to get all pages
  while (response.nextLink) {
    response = await client.followNextLink<GraphMessage>(response.nextLink);
    messages.push(...response.value);
  }

  // Extract events from messages
  const events = extractEmailEvents(messages, 'received', organizationId);

  return {
    events,
    deltaToken: response.deltaLink,
    count: messages.length,
  };
}

/**
 * Sync sent emails with delta
 */
async function syncSentEmails(
  client: GraphApiClient,
  userId: string,
  organizationId: string,
  deltaToken?: string,
  lookbackDate?: Date
): Promise<{ events: ExtractedEvent[]; deltaToken?: string; count: number }> {
  const messages: GraphMessage[] = [];
  let response: DeltaResponse<GraphMessage>;

  response = await client.getSentMessagesDelta(userId, deltaToken, lookbackDate);
  messages.push(...response.value);

  while (response.nextLink) {
    response = await client.followNextLink<GraphMessage>(response.nextLink);
    messages.push(...response.value);
  }

  const events = extractEmailEvents(messages, 'sent', organizationId);

  return {
    events,
    deltaToken: response.deltaLink,
    count: messages.length,
  };
}

/**
 * Sync calendar events with delta
 */
async function syncCalendarEvents(
  client: GraphApiClient,
  userId: string,
  organizationId: string,
  deltaToken?: string,
  lookbackDate?: Date
): Promise<{ events: ExtractedEvent[]; deltaToken?: string; count: number }> {
  const calendarEvents: GraphEvent[] = [];
  let response: DeltaResponse<GraphEvent>;

  response = await client.getCalendarEventsDelta(userId, deltaToken, lookbackDate);
  calendarEvents.push(...response.value);

  while (response.nextLink) {
    response = await client.followNextLink<GraphEvent>(response.nextLink);
    calendarEvents.push(...response.value);
  }

  const events = extractCalendarEvents(calendarEvents, organizationId);

  return {
    events,
    deltaToken: response.deltaLink,
    count: calendarEvents.length,
  };
}

/**
 * Calculate lookback date based on months
 */
export function calculateLookbackDate(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

/**
 * Merge delta tokens
 */
export function mergeDeltaTokens(
  existing: DeltaTokens,
  updates: Partial<DeltaTokens>
): DeltaTokens {
  return {
    inboxDelta: updates.inboxDelta || existing.inboxDelta,
    sentItemsDelta: updates.sentItemsDelta || existing.sentItemsDelta,
    calendarDelta: updates.calendarDelta || existing.calendarDelta,
  };
}

/**
 * Parse stored delta tokens from JSON
 */
export function parseDeltaTokens(json: unknown): DeltaTokens {
  if (!json || typeof json !== 'object') {
    return {};
  }

  const obj = json as Record<string, unknown>;
  return {
    inboxDelta: typeof obj.inboxDelta === 'string' ? obj.inboxDelta : undefined,
    sentItemsDelta: typeof obj.sentItemsDelta === 'string' ? obj.sentItemsDelta : undefined,
    calendarDelta: typeof obj.calendarDelta === 'string' ? obj.calendarDelta : undefined,
  };
}
