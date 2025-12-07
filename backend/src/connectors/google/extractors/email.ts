/**
 * Google Gmail Email Metadata Extractor
 * Extracts communication patterns from Gmail messages
 */

import { GmailApiClient, GmailMessageMetadata } from '../gmailClient.js';
import { ExtractedEvent } from '../../base/connector.js';

export interface EmailExtractionOptions {
  organizationId: string;
  userId: string;
  lookbackDate?: Date;
  historyId?: string;
  maxMessages?: number;
}

export interface EmailExtractionResult {
  events: ExtractedEvent[];
  newHistoryId?: string;
  messagesProcessed: number;
}

/**
 * Parse email address from header format
 * Handles formats like "Name <email@domain.com>" and "email@domain.com"
 */
function parseEmailAddress(from: string | undefined): string | undefined {
  if (!from) return undefined;
  const match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : from.toLowerCase().trim();
}

/**
 * Extract display name from email header
 */
function parseDisplayName(from: string | undefined): string | undefined {
  if (!from) return undefined;
  const match = from.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/["']/g, '') : undefined;
}

/**
 * Convert Gmail message to ExtractedEvent
 */
function messageToEvent(
  message: GmailMessageMetadata,
  organizationId: string
): ExtractedEvent {
  const fromEmail = parseEmailAddress(message.from);
  const fromName = parseDisplayName(message.from);
  const toEmails = message.to || [];
  const ccEmails = message.cc || [];
  const timestamp = new Date(parseInt(message.internalDate));

  // Determine event type based on labels
  const isReceived = message.labelIds.includes('INBOX');
  const isSent = message.labelIds.includes('SENT');
  const isDraft = message.labelIds.includes('DRAFT');

  let eventType = 'email.received';
  if (isSent) eventType = 'email.sent';
  if (isDraft) eventType = 'email.drafted';

  return {
    type: eventType,
    timestamp,
    actorId: fromEmail,
    targetId: toEmails[0], // Primary recipient
    metadata: {
      source: 'google',
      organizationId,
      messageId: message.id,
      threadId: message.threadId,
      subject: message.subject,
      from: fromEmail,
      fromName,
      to: toEmails,
      cc: ccEmails,
      snippet: message.snippet,
      hasAttachments: message.hasAttachments,
      labelIds: message.labelIds,
      recipientCount: toEmails.length + ccEmails.length,
      isReply: message.subject?.toLowerCase().startsWith('re:') || false,
      isForward: message.subject?.toLowerCase().startsWith('fwd:') || false,
    },
    rawData: {
      messageMetadata: message,
    },
  };
}

/**
 * Extract email events from Gmail using full sync
 */
export async function extractEmailsFull(
  client: GmailApiClient,
  options: EmailExtractionOptions
): Promise<EmailExtractionResult> {
  const events: ExtractedEvent[] = [];
  let messagesProcessed = 0;

  // Build query based on lookback date
  let query = '';
  if (options.lookbackDate) {
    const dateStr = options.lookbackDate.toISOString().split('T')[0].replace(/-/g, '/');
    query = `after:${dateStr}`;
  }

  // List messages
  let pageToken: string | undefined;
  const maxMessages = options.maxMessages || 1000;

  do {
    const listResponse = await client.listMessages(options.userId, {
      maxResults: Math.min(100, maxMessages - messagesProcessed),
      pageToken,
      q: query,
    });

    const messageIds = listResponse.messages || [];

    if (messageIds.length === 0) break;

    // Batch get message metadata
    const batchSize = 50;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const metadata = await client.batchGetMessageMetadata(
        batch.map((m) => m.id),
        options.userId
      );

      for (const message of metadata) {
        events.push(messageToEvent(message, options.organizationId));
        messagesProcessed++;
      }
    }

    pageToken = listResponse.nextPageToken;
  } while (pageToken && messagesProcessed < maxMessages);

  // Get current history ID for future incremental syncs
  const profile = await client.getProfile(options.userId);

  return {
    events,
    newHistoryId: profile.historyId,
    messagesProcessed,
  };
}

/**
 * Extract email events using incremental sync (history API)
 */
export async function extractEmailsIncremental(
  client: GmailApiClient,
  options: EmailExtractionOptions & { historyId: string }
): Promise<EmailExtractionResult> {
  const events: ExtractedEvent[] = [];
  const messageIds = new Set<string>();
  let pageToken: string | undefined;

  // Get history since last sync
  do {
    const historyResponse = await client.getHistory(
      options.historyId,
      options.userId,
      {
        maxResults: 100,
        pageToken,
        historyTypes: ['messageAdded'],
      }
    );

    const history = historyResponse.history || [];

    // Collect new message IDs
    for (const record of history) {
      if (record.messagesAdded) {
        for (const added of record.messagesAdded) {
          messageIds.add(added.message.id);
        }
      }
    }

    pageToken = historyResponse.nextPageToken;
  } while (pageToken);

  // Get metadata for new messages
  if (messageIds.size > 0) {
    const ids = Array.from(messageIds);
    const batchSize = 50;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const metadata = await client.batchGetMessageMetadata(batch, options.userId);

      for (const message of metadata) {
        events.push(messageToEvent(message, options.organizationId));
      }
    }
  }

  // Get current history ID
  const profile = await client.getProfile(options.userId);

  return {
    events,
    newHistoryId: profile.historyId,
    messagesProcessed: messageIds.size,
  };
}

/**
 * Extract email events (auto-selects full or incremental)
 */
export async function extractEmails(
  client: GmailApiClient,
  options: EmailExtractionOptions
): Promise<EmailExtractionResult> {
  if (options.historyId) {
    try {
      return await extractEmailsIncremental(client, {
        ...options,
        historyId: options.historyId,
      });
    } catch (error) {
      // History ID may be expired, fall back to full sync
      console.warn('History sync failed, falling back to full sync:', error);
      return extractEmailsFull(client, options);
    }
  }

  return extractEmailsFull(client, options);
}

/**
 * Calculate email statistics from extracted events
 */
export function calculateEmailStats(events: ExtractedEvent[]): {
  totalMessages: number;
  sent: number;
  received: number;
  uniqueSenders: number;
  uniqueRecipients: number;
  avgRecipientsPerMessage: number;
  replyRate: number;
  forwardRate: number;
} {
  const sent = events.filter((e) => e.type === 'email.sent').length;
  const received = events.filter((e) => e.type === 'email.received').length;
  const replies = events.filter((e) => e.metadata.isReply).length;
  const forwards = events.filter((e) => e.metadata.isForward).length;

  const senders = new Set(events.map((e) => e.metadata.from).filter(Boolean));
  const recipients = new Set(
    events.flatMap((e) => [
      ...(e.metadata.to || []),
      ...(e.metadata.cc || []),
    ])
  );

  const totalRecipients = events.reduce(
    (sum, e) => sum + (e.metadata.recipientCount || 0),
    0
  );

  return {
    totalMessages: events.length,
    sent,
    received,
    uniqueSenders: senders.size,
    uniqueRecipients: recipients.size,
    avgRecipientsPerMessage: events.length > 0 ? totalRecipients / events.length : 0,
    replyRate: events.length > 0 ? replies / events.length : 0,
    forwardRate: events.length > 0 ? forwards / events.length : 0,
  };
}
