/**
 * Slack Reaction Tracker
 * Task: T116
 *
 * Extracts and tracks emoji reactions on messages.
 * Provides reaction analytics and sentiment indicators.
 */

import { ExtractedEvent } from '../../base/connector';
import { SlackClient, SlackMessage } from '../slackClient';

export interface ReactionExtractionOptions {
  organizationId: string;
  channelIds?: string[];
  oldest?: Date;
  latest?: Date;
  limit?: number;
}

export interface Reaction {
  channelId: string;
  messageTs: string;
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageReactions {
  channelId: string;
  messageTs: string;
  messageText?: string;
  messageUserId?: string;
  reactions: Reaction[];
  totalReactions: number;
  uniqueEmojis: number;
  uniqueReactors: number;
}

export interface ReactionSummary {
  totalReactions: number;
  totalMessages: number;
  uniqueEmojis: number;
  topEmojis: Array<{ emoji: string; count: number }>;
  topReactors: Array<{ userId: string; count: number }>;
  sentimentIndicators: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

// Common positive/negative emojis for sentiment analysis
const POSITIVE_EMOJIS = [
  '+1', 'thumbsup', 'clap', 'tada', 'heart', 'fire', 'rocket', 'star',
  'white_check_mark', 'heavy_check_mark', 'sparkles', 'raised_hands',
  'ok_hand', 'muscle', 'trophy', 'medal', '100', 'smile', 'grinning',
  'heart_eyes', 'pray', 'sunglasses', 'partyparrot', 'party_parrot',
];

const NEGATIVE_EMOJIS = [
  '-1', 'thumbsdown', 'x', 'no_entry', 'warning', 'rage', 'angry',
  'disappointed', 'cry', 'sob', 'worried', 'fearful', 'confused',
  'facepalm', 'face_palm', 'skull', 'poop', 'hankey',
];

export class SlackReactionTracker {
  private client: SlackClient;

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Extract reactions from messages
   */
  async extractReactions(
    options: ReactionExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    messageReactions: MessageReactions[];
    summary: ReactionSummary;
  }> {
    const events: ExtractedEvent[] = [];
    const messageReactions: MessageReactions[] = [];
    const emojiCounts: Record<string, number> = {};
    const reactorCounts: Record<string, number> = {};
    let sentimentPositive = 0;
    let sentimentNegative = 0;
    let sentimentNeutral = 0;

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
      const maxMessages = options.limit || 5000;

      for (const channelId of channelIds) {
        if (totalProcessed >= maxMessages) break;

        try {
          const messages = await this.client.getAllChannelMessages(channelId, {
            oldest,
            latest,
          });

          // Filter messages with reactions
          const messagesWithReactions = messages.filter(
            (m) => m.reactions && m.reactions.length > 0
          );

          for (const message of messagesWithReactions) {
            if (totalProcessed >= maxMessages) break;

            const reactions: Reaction[] = [];
            const uniqueReactors = new Set<string>();

            for (const reaction of message.reactions || []) {
              reactions.push({
                channelId,
                messageTs: message.ts,
                emoji: reaction.name,
                count: reaction.count,
                userIds: reaction.users,
              });

              // Track emoji counts
              emojiCounts[reaction.name] = (emojiCounts[reaction.name] || 0) + reaction.count;

              // Track reactor counts
              for (const userId of reaction.users) {
                reactorCounts[userId] = (reactorCounts[userId] || 0) + 1;
                uniqueReactors.add(userId);
              }

              // Track sentiment
              const sentiment = this.classifyEmoji(reaction.name);
              if (sentiment === 'positive') {
                sentimentPositive += reaction.count;
              } else if (sentiment === 'negative') {
                sentimentNegative += reaction.count;
              } else {
                sentimentNeutral += reaction.count;
              }
            }

            const totalReactions = reactions.reduce((sum, r) => sum + r.count, 0);

            const msgReactions: MessageReactions = {
              channelId,
              messageTs: message.ts,
              messageText: message.text?.substring(0, 200),
              messageUserId: message.user,
              reactions,
              totalReactions,
              uniqueEmojis: reactions.length,
              uniqueReactors: uniqueReactors.size,
            };

            messageReactions.push(msgReactions);

            // Create event for each reaction on the message
            for (const reaction of reactions) {
              events.push(this.createReactionEvent(reaction, message, options.organizationId));
            }

            totalProcessed++;
          }
        } catch (error) {
          console.warn(`Failed to extract reactions from channel ${channelId}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to extract reactions:', error);
    }

    // Calculate top emojis
    const topEmojis = Object.entries(emojiCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([emoji, count]) => ({ emoji, count }));

    // Calculate top reactors
    const topReactors = Object.entries(reactorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([userId, count]) => ({ userId, count }));

    const totalReactions = Object.values(emojiCounts).reduce((sum, c) => sum + c, 0);

    return {
      events,
      messageReactions,
      summary: {
        totalReactions,
        totalMessages: messageReactions.length,
        uniqueEmojis: Object.keys(emojiCounts).length,
        topEmojis,
        topReactors,
        sentimentIndicators: {
          positive: sentimentPositive,
          negative: sentimentNegative,
          neutral: sentimentNeutral,
        },
      },
    };
  }

  /**
   * Get reactions for a specific message
   */
  async getMessageReactions(
    channelId: string,
    messageTs: string,
    organizationId: string
  ): Promise<MessageReactions | null> {
    try {
      const result = await (this.client as any).request<{
        ok: boolean;
        messages?: SlackMessage[];
      }>('conversations.history', {
        channel: channelId,
        oldest: messageTs,
        latest: messageTs,
        inclusive: true,
        limit: 1,
      });

      if (!result.messages || result.messages.length === 0) {
        return null;
      }

      const message = result.messages[0];

      if (!message.reactions || message.reactions.length === 0) {
        return {
          channelId,
          messageTs,
          messageText: message.text,
          messageUserId: message.user,
          reactions: [],
          totalReactions: 0,
          uniqueEmojis: 0,
          uniqueReactors: 0,
        };
      }

      const reactions: Reaction[] = [];
      const uniqueReactors = new Set<string>();

      for (const reaction of message.reactions) {
        reactions.push({
          channelId,
          messageTs,
          emoji: reaction.name,
          count: reaction.count,
          userIds: reaction.users,
        });

        reaction.users.forEach((u) => uniqueReactors.add(u));
      }

      return {
        channelId,
        messageTs,
        messageText: message.text,
        messageUserId: message.user,
        reactions,
        totalReactions: reactions.reduce((sum, r) => sum + r.count, 0),
        uniqueEmojis: reactions.length,
        uniqueReactors: uniqueReactors.size,
      };
    } catch (error) {
      console.warn(`Failed to get reactions for message ${messageTs}:`, error);
      return null;
    }
  }

  /**
   * Classify emoji sentiment
   */
  private classifyEmoji(emoji: string): 'positive' | 'negative' | 'neutral' {
    const normalizedEmoji = emoji.toLowerCase().replace(/:/g, '').replace(/-/g, '_');

    if (POSITIVE_EMOJIS.some((e) => normalizedEmoji.includes(e))) {
      return 'positive';
    }

    if (NEGATIVE_EMOJIS.some((e) => normalizedEmoji.includes(e))) {
      return 'negative';
    }

    return 'neutral';
  }

  /**
   * Create reaction event
   */
  private createReactionEvent(
    reaction: Reaction,
    message: SlackMessage,
    organizationId: string
  ): ExtractedEvent {
    const timestamp = new Date(parseFloat(message.ts) * 1000);
    const sentiment = this.classifyEmoji(reaction.emoji);

    return {
      type: 'communication.reaction',
      timestamp,
      actorId: reaction.userIds[0], // First reactor as primary actor
      targetId: `${reaction.channelId}:${reaction.messageTs}:${reaction.emoji}`,
      metadata: {
        source: 'slack',
        organizationId,
        channelId: reaction.channelId,
        messageTs: reaction.messageTs,
        messageUserId: message.user,
        emoji: reaction.emoji,
        count: reaction.count,
        userIds: reaction.userIds,
        sentiment,
      },
    };
  }
}

/**
 * Create reaction tracker
 */
export function createReactionTracker(client: SlackClient): SlackReactionTracker {
  return new SlackReactionTracker(client);
}
