/**
 * Slack Channel Membership Tracker
 * Task: T119
 *
 * Tracks channel membership and participation patterns.
 * Monitors joins, leaves, and active participation.
 */

import { ExtractedEvent } from '../../base/connector';
import { SlackClient, SlackChannel, SlackUser } from '../slackClient';

export interface MembershipExtractionOptions {
  organizationId: string;
  channelIds?: string[];
  includePrivate?: boolean;
}

export interface ChannelMembership {
  channelId: string;
  channelName: string;
  memberIds: string[];
  memberCount: number;
  isPrivate: boolean;
  creator?: string;
  created?: Date;
}

export interface UserMembership {
  userId: string;
  userName?: string;
  channelIds: string[];
  channelCount: number;
  privateChannelCount: number;
  publicChannelCount: number;
}

export interface MembershipSummary {
  totalChannels: number;
  totalMembers: number;
  avgMembersPerChannel: number;
  avgChannelsPerMember: number;
  channelsBySize: {
    small: number;    // 1-10 members
    medium: number;   // 11-50 members
    large: number;    // 51-200 members
    xlarge: number;   // 200+ members
  };
}

export class SlackMembershipTracker {
  private client: SlackClient;
  private userCache: Map<string, SlackUser> = new Map();

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Extract membership data
   */
  async extractMembership(
    options: MembershipExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    channelMemberships: ChannelMembership[];
    userMemberships: UserMembership[];
    summary: MembershipSummary;
  }> {
    const events: ExtractedEvent[] = [];
    const channelMemberships: ChannelMembership[] = [];
    const userMembershipMap = new Map<string, Set<string>>();
    const userPrivateMap = new Map<string, Set<string>>();

    try {
      // Get channels
      let channels = await this.client.getAllChannels();

      // Filter by channel IDs if specified
      if (options.channelIds) {
        channels = channels.filter((c) => options.channelIds!.includes(c.id));
      }

      // Filter private channels if needed
      if (!options.includePrivate) {
        channels = channels.filter((c) => !c.is_private);
      }

      // Filter out archived channels
      channels = channels.filter((c) => !c.is_archived);

      // Get membership for each channel
      for (const channel of channels) {
        try {
          const members = await this.getChannelMembers(channel.id);

          const membership: ChannelMembership = {
            channelId: channel.id,
            channelName: channel.name,
            memberIds: members,
            memberCount: members.length,
            isPrivate: channel.is_private,
            creator: channel.creator,
            created: channel.created ? new Date(channel.created * 1000) : undefined,
          };

          channelMemberships.push(membership);

          // Track user memberships
          for (const userId of members) {
            if (!userMembershipMap.has(userId)) {
              userMembershipMap.set(userId, new Set());
              userPrivateMap.set(userId, new Set());
            }
            userMembershipMap.get(userId)!.add(channel.id);
            if (channel.is_private) {
              userPrivateMap.get(userId)!.add(channel.id);
            }
          }

          // Create channel membership event
          events.push(this.createChannelMembershipEvent(membership, options.organizationId));
        } catch (error) {
          console.warn(`Failed to get members for channel ${channel.id}:`, error);
        }
      }

      // Build user memberships
      const userMemberships: UserMembership[] = [];
      for (const [userId, channelIds] of userMembershipMap) {
        const privateChannelIds = userPrivateMap.get(userId) || new Set();
        userMemberships.push({
          userId,
          channelIds: Array.from(channelIds),
          channelCount: channelIds.size,
          privateChannelCount: privateChannelIds.size,
          publicChannelCount: channelIds.size - privateChannelIds.size,
        });
      }

      // Create user membership events
      for (const userMembership of userMemberships) {
        events.push(this.createUserMembershipEvent(userMembership, options.organizationId));
      }

      // Calculate summary
      const summary = this.calculateSummary(channelMemberships, userMemberships);

      return { events, channelMemberships, userMemberships, summary };
    } catch (error) {
      console.warn('Failed to extract membership:', error);
      return {
        events: [],
        channelMemberships: [],
        userMemberships: [],
        summary: {
          totalChannels: 0,
          totalMembers: 0,
          avgMembersPerChannel: 0,
          avgChannelsPerMember: 0,
          channelsBySize: { small: 0, medium: 0, large: 0, xlarge: 0 },
        },
      };
    }
  }

  /**
   * Get members of a channel
   */
  async getChannelMembers(channelId: string): Promise<string[]> {
    const members: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await (this.client as any).request<{
        ok: boolean;
        members?: string[];
        response_metadata?: { next_cursor?: string };
      }>('conversations.members', {
        channel: channelId,
        cursor,
        limit: 1000,
      });

      if (result.members) {
        members.push(...result.members);
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return members;
  }

  /**
   * Get channels for a user
   */
  async getUserChannels(userId: string): Promise<string[]> {
    // There's no direct API for this, so we need to check all channels
    const channels = await this.client.getAllChannels();
    const userChannels: string[] = [];

    for (const channel of channels) {
      if (channel.is_archived) continue;

      try {
        const members = await this.getChannelMembers(channel.id);
        if (members.includes(userId)) {
          userChannels.push(channel.id);
        }
      } catch {
        // Skip channels we can't access
      }
    }

    return userChannels;
  }

  /**
   * Get channel membership details
   */
  async getChannelMembershipDetails(
    channelId: string,
    organizationId: string
  ): Promise<ChannelMembership | null> {
    try {
      // Get channel info
      const channelResult = await (this.client as any).request<{
        ok: boolean;
        channel?: SlackChannel;
      }>('conversations.info', { channel: channelId });

      if (!channelResult.channel) {
        return null;
      }

      const channel = channelResult.channel;
      const members = await this.getChannelMembers(channelId);

      return {
        channelId: channel.id,
        channelName: channel.name,
        memberIds: members,
        memberCount: members.length,
        isPrivate: channel.is_private,
        creator: channel.creator,
        created: channel.created ? new Date(channel.created * 1000) : undefined,
      };
    } catch (error) {
      console.warn(`Failed to get membership details for channel ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Calculate membership summary
   */
  private calculateSummary(
    channelMemberships: ChannelMembership[],
    userMemberships: UserMembership[]
  ): MembershipSummary {
    const totalMembers = new Set(channelMemberships.flatMap((c) => c.memberIds)).size;
    const totalChannels = channelMemberships.length;

    const channelsBySize = {
      small: 0,
      medium: 0,
      large: 0,
      xlarge: 0,
    };

    for (const channel of channelMemberships) {
      if (channel.memberCount <= 10) {
        channelsBySize.small++;
      } else if (channel.memberCount <= 50) {
        channelsBySize.medium++;
      } else if (channel.memberCount <= 200) {
        channelsBySize.large++;
      } else {
        channelsBySize.xlarge++;
      }
    }

    const avgMembersPerChannel =
      totalChannels > 0
        ? channelMemberships.reduce((sum, c) => sum + c.memberCount, 0) / totalChannels
        : 0;

    const avgChannelsPerMember =
      userMemberships.length > 0
        ? userMemberships.reduce((sum, u) => sum + u.channelCount, 0) / userMemberships.length
        : 0;

    return {
      totalChannels,
      totalMembers,
      avgMembersPerChannel,
      avgChannelsPerMember,
      channelsBySize,
    };
  }

  /**
   * Create channel membership event
   */
  private createChannelMembershipEvent(
    membership: ChannelMembership,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'communication.channel_membership',
      timestamp: membership.created || new Date(),
      actorId: membership.creator,
      targetId: membership.channelId,
      metadata: {
        source: 'slack',
        organizationId,
        channelId: membership.channelId,
        channelName: membership.channelName,
        memberCount: membership.memberCount,
        isPrivate: membership.isPrivate,
        createdAt: membership.created?.toISOString(),
      },
    };
  }

  /**
   * Create user membership event
   */
  private createUserMembershipEvent(
    membership: UserMembership,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'communication.user_membership',
      timestamp: new Date(),
      actorId: membership.userId,
      targetId: membership.userId,
      metadata: {
        source: 'slack',
        organizationId,
        userId: membership.userId,
        channelCount: membership.channelCount,
        publicChannelCount: membership.publicChannelCount,
        privateChannelCount: membership.privateChannelCount,
        channelIds: membership.channelIds.slice(0, 50), // Limit for metadata size
      },
    };
  }
}

/**
 * Create membership tracker
 */
export function createMembershipTracker(client: SlackClient): SlackMembershipTracker {
  return new SlackMembershipTracker(client);
}
