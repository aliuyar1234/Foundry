/**
 * Gmail History Sync (Incremental)
 * Task: T022
 *
 * Implements incremental sync using Gmail History API.
 * Tracks changes since last sync for efficient updates.
 */

import { GmailApiClient, GmailMessageMetadata } from '../gmailClient';
import { ExtractedEvent } from '../../base/connector';

export interface HistorySyncOptions {
  userId: string;
  organizationId: string;
  startHistoryId: string;
  historyTypes?: HistoryType[];
  labelId?: string;
  maxResults?: number;
}

export type HistoryType =
  | 'messageAdded'
  | 'messageDeleted'
  | 'labelAdded'
  | 'labelRemoved';

export interface HistoryChange {
  type: 'added' | 'deleted' | 'labelAdded' | 'labelRemoved';
  messageId: string;
  threadId: string;
  labelIds?: string[];
  timestamp: Date;
}

export interface HistorySyncResult {
  changes: HistoryChange[];
  events: ExtractedEvent[];
  newHistoryId: string;
  changesProcessed: number;
  historyExpired: boolean;
}

export class GmailHistorySynchronizer {
  private client: GmailApiClient;

  constructor(client: GmailApiClient) {
    this.client = client;
  }

  /**
   * Sync changes since last history ID
   */
  async syncHistory(options: HistorySyncOptions): Promise<HistorySyncResult> {
    const changes: HistoryChange[] = [];
    const messageIdsToFetch = new Set<string>();
    let pageToken: string | undefined;
    let newHistoryId = options.startHistoryId;
    let historyExpired = false;

    try {
      do {
        const response = await this.client.getHistory(
          options.startHistoryId,
          options.userId,
          {
            maxResults: options.maxResults || 100,
            pageToken,
            historyTypes: options.historyTypes || ['messageAdded'],
            labelId: options.labelId,
          }
        );

        if (response.historyId) {
          newHistoryId = response.historyId;
        }

        const history = response.history || [];

        for (const record of history) {
          // Process added messages
          if (record.messagesAdded) {
            for (const added of record.messagesAdded) {
              changes.push({
                type: 'added',
                messageId: added.message.id,
                threadId: added.message.threadId,
                labelIds: added.message.labelIds,
                timestamp: new Date(),
              });
              messageIdsToFetch.add(added.message.id);
            }
          }

          // Process deleted messages
          if (record.messagesDeleted) {
            for (const deleted of record.messagesDeleted) {
              changes.push({
                type: 'deleted',
                messageId: deleted.message.id,
                threadId: deleted.message.threadId,
                timestamp: new Date(),
              });
            }
          }

          // Process label additions
          if (record.labelsAdded) {
            for (const added of record.labelsAdded) {
              changes.push({
                type: 'labelAdded',
                messageId: added.message.id,
                threadId: added.message.threadId,
                labelIds: added.labelIds,
                timestamp: new Date(),
              });
            }
          }

          // Process label removals
          if (record.labelsRemoved) {
            for (const removed of record.labelsRemoved) {
              changes.push({
                type: 'labelRemoved',
                messageId: removed.message.id,
                threadId: removed.message.threadId,
                labelIds: removed.labelIds,
                timestamp: new Date(),
              });
            }
          }
        }

        pageToken = response.nextPageToken;
      } while (pageToken);
    } catch (error) {
      // Check if history ID has expired
      if (
        error instanceof Error &&
        (error.message.includes('historyId') ||
          error.message.includes('404') ||
          error.message.includes('invalid'))
      ) {
        historyExpired = true;
      } else {
        throw error;
      }
    }

    // Fetch full metadata for new messages
    const events = await this.fetchMessageEvents(
      Array.from(messageIdsToFetch),
      options.userId,
      options.organizationId
    );

    // Add deletion events
    for (const change of changes) {
      if (change.type === 'deleted') {
        events.push({
          type: 'email.deleted',
          timestamp: change.timestamp,
          actorId: undefined,
          targetId: change.messageId,
          metadata: {
            source: 'google',
            organizationId: options.organizationId,
            messageId: change.messageId,
            threadId: change.threadId,
          },
        });
      }
    }

    return {
      changes,
      events,
      newHistoryId,
      changesProcessed: changes.length,
      historyExpired,
    };
  }

  /**
   * Fetch full message events for a list of IDs
   */
  private async fetchMessageEvents(
    messageIds: string[],
    userId: string,
    organizationId: string
  ): Promise<ExtractedEvent[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const events: ExtractedEvent[] = [];
    const batchSize = 50;

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const messages = await this.client.batchGetMessageMetadata(batch, userId);

      for (const message of messages) {
        events.push(this.messageToEvent(message, organizationId));
      }
    }

    return events;
  }

  /**
   * Convert message metadata to event
   */
  private messageToEvent(
    message: GmailMessageMetadata,
    organizationId: string
  ): ExtractedEvent {
    const fromEmail = this.parseEmailAddress(message.from);
    const toEmails = message.to || [];
    const timestamp = new Date(parseInt(message.internalDate));

    const isSent = message.labelIds.includes('SENT');
    const eventType = isSent ? 'email.sent' : 'email.received';

    return {
      type: eventType,
      timestamp,
      actorId: fromEmail,
      targetId: toEmails[0],
      metadata: {
        source: 'google',
        organizationId,
        messageId: message.id,
        threadId: message.threadId,
        subject: message.subject,
        from: fromEmail,
        to: toEmails,
        cc: message.cc || [],
        labelIds: message.labelIds,
        hasAttachments: message.hasAttachments,
        snippet: message.snippet,
      },
    };
  }

  /**
   * Parse email address from header
   */
  private parseEmailAddress(from: string | undefined): string | undefined {
    if (!from) return undefined;
    const match = from.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase() : from.toLowerCase().trim();
  }

  /**
   * Get current history ID for initial sync
   */
  async getCurrentHistoryId(userId: string): Promise<string> {
    const profile = await this.client.getProfile(userId);
    return profile.historyId;
  }
}

/**
 * Create history synchronizer
 */
export function createGmailHistorySynchronizer(
  client: GmailApiClient
): GmailHistorySynchronizer {
  return new GmailHistorySynchronizer(client);
}
