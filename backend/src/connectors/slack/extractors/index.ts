/**
 * Slack Data Extractors
 * Convert Slack data to ExtractedEvent objects
 */

import {
  SlackUser,
  SlackChannel,
  SlackMessage,
  SlackClient,
} from '../slackClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ExtractionOptions {
  organizationId: string;
  modifiedSince?: Date;
  includeMessages?: boolean;
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  stats: {
    users: number;
    channels: number;
    messages: number;
    total: number;
  };
}

/**
 * Extract user data
 */
export function extractUser(
  user: SlackUser,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `slack-user-${user.id}`,
    source: 'slack',
    eventType: 'communication.user',
    timestamp: user.updated ? new Date(user.updated * 1000) : new Date(),
    data: {
      id: user.id,
      teamId: user.team_id,
      name: user.name,
      realName: user.real_name,
      displayName: user.profile.display_name,
      email: user.profile.email,
      phone: user.profile.phone,
      title: user.profile.title,
      statusText: user.profile.status_text,
      statusEmoji: user.profile.status_emoji,
      timezone: user.tz,
      timezoneLabel: user.tz_label,
      isAdmin: user.is_admin,
      isOwner: user.is_owner,
      isBot: user.is_bot,
      isRestricted: user.is_restricted,
      isUltraRestricted: user.is_ultra_restricted,
      deleted: user.deleted,
      avatar: user.profile.image_72,
    },
    metadata: {
      organizationId,
      updatedAt: user.updated ? new Date(user.updated * 1000).toISOString() : undefined,
      objectType: 'User',
    },
  };
}

/**
 * Extract channel data
 */
export function extractChannel(
  channel: SlackChannel,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `slack-channel-${channel.id}`,
    source: 'slack',
    eventType: 'communication.channel',
    timestamp: channel.created ? new Date(channel.created * 1000) : new Date(),
    data: {
      id: channel.id,
      name: channel.name,
      isChannel: channel.is_channel,
      isGroup: channel.is_group,
      isPrivate: channel.is_private,
      isArchived: channel.is_archived,
      isGeneral: channel.is_general,
      isShared: channel.is_shared,
      isMember: channel.is_member,
      creator: channel.creator,
      topic: channel.topic?.value,
      purpose: channel.purpose?.value,
      numMembers: channel.num_members,
    },
    metadata: {
      organizationId,
      createdAt: channel.created ? new Date(channel.created * 1000).toISOString() : undefined,
      topicLastSet: channel.topic?.last_set
        ? new Date(channel.topic.last_set * 1000).toISOString()
        : undefined,
      objectType: 'Channel',
    },
  };
}

/**
 * Extract message data
 */
export function extractMessage(
  message: SlackMessage,
  channelId: string,
  organizationId: string
): ExtractedEvent {
  const timestamp = new Date(parseFloat(message.ts) * 1000);

  return {
    externalId: `slack-message-${channelId}-${message.ts}`,
    source: 'slack',
    eventType: 'communication.message',
    timestamp,
    data: {
      channelId,
      type: message.type,
      subtype: message.subtype,
      text: message.text,
      userId: message.user,
      botId: message.bot_id,
      ts: message.ts,
      threadTs: message.thread_ts,
      replyCount: message.reply_count,
      replyUsersCount: message.reply_users_count,
      latestReply: message.latest_reply,
      hasReactions: (message.reactions?.length || 0) > 0,
      reactionCount: message.reactions?.reduce((sum, r) => sum + r.count, 0) || 0,
      hasFiles: (message.files?.length || 0) > 0,
      fileCount: message.files?.length || 0,
      hasAttachments: (message.attachments?.length || 0) > 0,
    },
    metadata: {
      organizationId,
      timestamp: timestamp.toISOString(),
      isThreadReply: !!message.thread_ts && message.thread_ts !== message.ts,
      objectType: 'Message',
    },
  };
}

/**
 * Extract all Slack data
 */
export async function extractAllSlackData(
  client: SlackClient,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    users: 0,
    channels: 0,
    messages: 0,
    total: 0,
  };

  // Extract users
  const users = await client.getAllUsers();
  for (const user of users) {
    // Skip bots and deleted users unless you want them
    if (!user.is_bot && !user.deleted) {
      events.push(extractUser(user, options.organizationId));
      stats.users++;
    }
  }

  // Extract channels
  const channels = await client.getAllChannels();
  for (const channel of channels) {
    if (!channel.is_archived) {
      events.push(extractChannel(channel, options.organizationId));
      stats.channels++;
    }
  }

  // Extract messages if requested
  if (options.includeMessages) {
    const oldest = options.modifiedSince
      ? String(options.modifiedSince.getTime() / 1000)
      : undefined;

    for (const channel of channels) {
      if (channel.is_archived || channel.is_im || channel.is_mpim) {
        continue; // Skip archived channels and direct messages
      }

      try {
        const messages = await client.getAllChannelMessages(channel.id, { oldest });
        for (const message of messages) {
          events.push(extractMessage(message, channel.id, options.organizationId));
          stats.messages++;
        }
      } catch {
        // Channel might not be accessible, skip
      }
    }
  }

  stats.total = events.length;

  return { events, stats };
}

// Re-export specialized extractors
export * from './threads.js';
export * from './reactions.js';
export * from './files.js';
export * from './membership.js';
