/**
 * Slack Thread Reply Extractor
 * Task: T115
 *
 * Extracts thread replies and conversation threads.
 * Handles nested conversations and parent message tracking.
 */

import { ExtractedEvent } from '../../base/connector';
import { SlackClient, SlackMessage } from '../slackClient';

export interface ThreadExtractionOptions {
  organizationId: string;
  channelIds?: string[];
  oldest?: Date;
  latest?: Date;
  limit?: number;
}

export interface Thread {
  channelId: string;
  parentTs: string;
  parentMessage: SlackMessage;
  replies: SlackMessage[];
  replyCount: number;
  participantIds: string[];
  lastReplyTs: string;
}

export interface ThreadSummary {
  totalThreads: number;
  totalReplies: number;
  avgRepliesPerThread: number;
  byChannel: Record<string, number>;
}

export class SlackThreadExtractor {
  private client: SlackClient;

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Extract threads from channels
   */
  async extractThreads(
    options: ThreadExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    threads: Thread[];
    summary: ThreadSummary;
  }> {
    const events: ExtractedEvent[] = [];
    const threads: Thread[] = [];
    const byChannel: Record<string, number> = {};

    try {
      // Get channels if not specified
      let channelIds = options.channelIds;
      if (!channelIds) {
        const channels = await this.client.getAllChannels();
        channelIds = channels
          .filter((c) => !c.is_archived && !c.is_im && !c.is_mpim)
          .map((c) => c.id);
      }

      const oldest = options.oldest ? String(options.oldest.getTime() / 1000) : undefined;
      const latest = options.latest ? String(options.latest.getTime() / 1000) : undefined;
      let totalProcessed = 0;
      const maxThreads = options.limit || 1000;

      for (const channelId of channelIds) {
        if (totalProcessed >= maxThreads) break;

        try {
          // Get messages with thread_ts (parent messages)
          const messages = await this.client.getAllChannelMessages(channelId, {
            oldest,
            latest,
          });

          // Find parent messages (those that have replies)
          const parentMessages = messages.filter(
            (m) => m.reply_count && m.reply_count > 0
          );

          for (const parentMessage of parentMessages) {
            if (totalProcessed >= maxThreads) break;

            try {
              // Get thread replies
              const threadReplies = await this.getThreadReplies(
                channelId,
                parentMessage.ts
              );

              // Get unique participants
              const participantIds = new Set<string>();
              if (parentMessage.user) participantIds.add(parentMessage.user);
              threadReplies.forEach((r) => {
                if (r.user) participantIds.add(r.user);
              });

              const thread: Thread = {
                channelId,
                parentTs: parentMessage.ts,
                parentMessage,
                replies: threadReplies,
                replyCount: threadReplies.length,
                participantIds: Array.from(participantIds),
                lastReplyTs: threadReplies.length > 0
                  ? threadReplies[threadReplies.length - 1].ts
                  : parentMessage.ts,
              };

              threads.push(thread);
              byChannel[channelId] = (byChannel[channelId] || 0) + 1;

              // Create thread event
              events.push(this.createThreadEvent(thread, options.organizationId));

              // Create reply events
              for (const reply of threadReplies) {
                events.push(
                  this.createReplyEvent(reply, channelId, parentMessage.ts, options.organizationId)
                );
              }

              totalProcessed++;
            } catch (error) {
              console.warn(`Failed to extract thread ${parentMessage.ts}:`, error);
            }
          }
        } catch (error) {
          console.warn(`Failed to extract threads from channel ${channelId}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to extract threads:', error);
    }

    const totalReplies = threads.reduce((sum, t) => sum + t.replyCount, 0);

    return {
      events,
      threads,
      summary: {
        totalThreads: threads.length,
        totalReplies,
        avgRepliesPerThread: threads.length > 0 ? totalReplies / threads.length : 0,
        byChannel,
      },
    };
  }

  /**
   * Get replies in a thread
   */
  async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    const replies: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const result = await (this.client as any).request<{
        ok: boolean;
        messages?: SlackMessage[];
        response_metadata?: { next_cursor?: string };
      }>('conversations.replies', {
        channel: channelId,
        ts: threadTs,
        cursor,
        limit: 200,
      });

      if (result.messages) {
        // First message is the parent, skip it
        const replyMessages = result.messages.filter((m) => m.ts !== threadTs);
        replies.push(...replyMessages);
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return replies;
  }

  /**
   * Get thread by parent timestamp
   */
  async getThread(
    channelId: string,
    parentTs: string,
    organizationId: string
  ): Promise<Thread | null> {
    try {
      // Get parent message
      const result = await (this.client as any).request<{
        ok: boolean;
        messages?: SlackMessage[];
      }>('conversations.history', {
        channel: channelId,
        oldest: parentTs,
        latest: parentTs,
        inclusive: true,
        limit: 1,
      });

      if (!result.messages || result.messages.length === 0) {
        return null;
      }

      const parentMessage = result.messages[0];
      const replies = await this.getThreadReplies(channelId, parentTs);

      const participantIds = new Set<string>();
      if (parentMessage.user) participantIds.add(parentMessage.user);
      replies.forEach((r) => {
        if (r.user) participantIds.add(r.user);
      });

      return {
        channelId,
        parentTs,
        parentMessage,
        replies,
        replyCount: replies.length,
        participantIds: Array.from(participantIds),
        lastReplyTs: replies.length > 0 ? replies[replies.length - 1].ts : parentTs,
      };
    } catch (error) {
      console.warn(`Failed to get thread ${parentTs}:`, error);
      return null;
    }
  }

  /**
   * Create thread event
   */
  private createThreadEvent(thread: Thread, organizationId: string): ExtractedEvent {
    const timestamp = new Date(parseFloat(thread.parentTs) * 1000);

    return {
      type: 'communication.thread',
      timestamp,
      actorId: thread.parentMessage.user,
      targetId: `${thread.channelId}:${thread.parentTs}`,
      metadata: {
        source: 'slack',
        organizationId,
        channelId: thread.channelId,
        parentTs: thread.parentTs,
        replyCount: thread.replyCount,
        participantCount: thread.participantIds.length,
        participantIds: thread.participantIds,
        lastReplyTs: thread.lastReplyTs,
        parentText: thread.parentMessage.text?.substring(0, 200),
      },
    };
  }

  /**
   * Create reply event
   */
  private createReplyEvent(
    reply: SlackMessage,
    channelId: string,
    parentTs: string,
    organizationId: string
  ): ExtractedEvent {
    const timestamp = new Date(parseFloat(reply.ts) * 1000);

    return {
      type: 'communication.thread_reply',
      timestamp,
      actorId: reply.user,
      targetId: `${channelId}:${reply.ts}`,
      metadata: {
        source: 'slack',
        organizationId,
        channelId,
        parentTs,
        replyTs: reply.ts,
        text: reply.text?.substring(0, 500),
        hasReactions: (reply.reactions?.length || 0) > 0,
        reactionCount: reply.reactions?.reduce((sum, r) => sum + r.count, 0) || 0,
        hasFiles: (reply.files?.length || 0) > 0,
      },
    };
  }
}

/**
 * Create thread extractor
 */
export function createThreadExtractor(client: SlackClient): SlackThreadExtractor {
  return new SlackThreadExtractor(client);
}
