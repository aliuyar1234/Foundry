/**
 * Slack Workspace Analytics
 * Task: T120
 *
 * Provides analytics and insights about workspace activity.
 * Tracks communication patterns, active users, and channel health.
 */

import { SlackClient, SlackUser, SlackChannel, SlackMessage } from './slackClient';

export interface AnalyticsOptions {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  channelIds?: string[];
}

export interface UserActivity {
  userId: string;
  userName?: string;
  displayName?: string;
  messageCount: number;
  replyCount: number;
  reactionCount: number;
  fileCount: number;
  channelsActive: number;
  threadsStarted: number;
  avgMessageLength: number;
  peakActivityHour: number;
  lastActive?: Date;
}

export interface ChannelActivity {
  channelId: string;
  channelName: string;
  messageCount: number;
  uniquePosters: number;
  threadCount: number;
  reactionCount: number;
  fileCount: number;
  avgMessagesPerDay: number;
  peakActivityHour: number;
  isHealthy: boolean;
  healthScore: number;
}

export interface WorkspaceMetrics {
  totalUsers: number;
  activeUsers: number;
  totalChannels: number;
  activeChannels: number;
  totalMessages: number;
  avgMessagesPerDay: number;
  avgMessagesPerUser: number;
  threadEngagement: number;
  reactionRate: number;
  peakHours: number[];
  communicationTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface CommunicationGraph {
  nodes: Array<{
    id: string;
    type: 'user' | 'channel';
    name: string;
    weight: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    weight: number;
    type: 'message' | 'reply' | 'mention';
  }>;
}

export class SlackWorkspaceAnalytics {
  private client: SlackClient;
  private userCache: Map<string, SlackUser> = new Map();

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Generate workspace overview
   */
  async getWorkspaceOverview(
    options: AnalyticsOptions
  ): Promise<WorkspaceMetrics> {
    const users = await this.client.getAllUsers();
    const channels = await this.client.getAllChannels();

    // Filter out bots and deleted users
    const realUsers = users.filter((u) => !u.is_bot && !u.deleted);

    // Filter out archived channels
    const activeChannels = channels.filter(
      (c) => !c.is_archived && !c.is_im && !c.is_mpim
    );

    // Analyze messages
    const oldest = options.startDate
      ? String(options.startDate.getTime() / 1000)
      : undefined;
    const latest = options.endDate
      ? String(options.endDate.getTime() / 1000)
      : undefined;

    let totalMessages = 0;
    let messagesWithThreads = 0;
    let messagesWithReactions = 0;
    const activeUserIds = new Set<string>();
    const activeChannelIds = new Set<string>();
    const hourCounts: Record<number, number> = {};
    const dailyCounts: Record<string, number> = {};

    for (const channel of activeChannels.slice(0, 50)) { // Limit for performance
      try {
        const messages = await this.client.getAllChannelMessages(channel.id, {
          oldest,
          latest,
        });

        if (messages.length > 0) {
          activeChannelIds.add(channel.id);
        }

        for (const message of messages) {
          totalMessages++;

          if (message.user) {
            activeUserIds.add(message.user);
          }

          if (message.thread_ts && message.thread_ts !== message.ts) {
            messagesWithThreads++;
          }

          if (message.reactions && message.reactions.length > 0) {
            messagesWithReactions++;
          }

          // Track hourly activity
          const timestamp = new Date(parseFloat(message.ts) * 1000);
          const hour = timestamp.getUTCHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;

          // Track daily activity
          const day = timestamp.toISOString().split('T')[0];
          dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        }
      } catch {
        // Skip inaccessible channels
      }
    }

    // Calculate metrics
    const days = Object.keys(dailyCounts).length || 1;
    const avgMessagesPerDay = totalMessages / days;
    const avgMessagesPerUser = activeUserIds.size > 0 ? totalMessages / activeUserIds.size : 0;
    const threadEngagement = totalMessages > 0 ? messagesWithThreads / totalMessages : 0;
    const reactionRate = totalMessages > 0 ? messagesWithReactions / totalMessages : 0;

    // Find peak hours
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => parseInt(hour, 10));

    // Determine trend (simple comparison of first/last week)
    const sortedDays = Object.keys(dailyCounts).sort();
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (sortedDays.length >= 14) {
      const firstWeek = sortedDays.slice(0, 7).reduce((sum, d) => sum + dailyCounts[d], 0);
      const lastWeek = sortedDays.slice(-7).reduce((sum, d) => sum + dailyCounts[d], 0);
      if (lastWeek > firstWeek * 1.1) trend = 'increasing';
      else if (lastWeek < firstWeek * 0.9) trend = 'decreasing';
    }

    return {
      totalUsers: realUsers.length,
      activeUsers: activeUserIds.size,
      totalChannels: activeChannels.length,
      activeChannels: activeChannelIds.size,
      totalMessages,
      avgMessagesPerDay,
      avgMessagesPerUser,
      threadEngagement,
      reactionRate,
      peakHours,
      communicationTrend: trend,
    };
  }

  /**
   * Get user activity analysis
   */
  async getUserActivity(
    options: AnalyticsOptions
  ): Promise<UserActivity[]> {
    const userActivities = new Map<string, {
      messageCount: number;
      replyCount: number;
      reactionCount: number;
      fileCount: number;
      channels: Set<string>;
      threadsStarted: number;
      totalMessageLength: number;
      hourCounts: Record<number, number>;
      lastActive?: Date;
    }>();

    const channels = await this.client.getAllChannels();
    const activeChannels = channels.filter(
      (c) => !c.is_archived && !c.is_im && !c.is_mpim
    );

    const oldest = options.startDate
      ? String(options.startDate.getTime() / 1000)
      : undefined;
    const latest = options.endDate
      ? String(options.endDate.getTime() / 1000)
      : undefined;

    for (const channel of activeChannels.slice(0, 30)) {
      try {
        const messages = await this.client.getAllChannelMessages(channel.id, {
          oldest,
          latest,
        });

        for (const message of messages) {
          if (!message.user) continue;

          if (!userActivities.has(message.user)) {
            userActivities.set(message.user, {
              messageCount: 0,
              replyCount: 0,
              reactionCount: 0,
              fileCount: 0,
              channels: new Set(),
              threadsStarted: 0,
              totalMessageLength: 0,
              hourCounts: {},
            });
          }

          const activity = userActivities.get(message.user)!;
          activity.messageCount++;
          activity.channels.add(channel.id);
          activity.totalMessageLength += message.text?.length || 0;

          if (message.thread_ts && message.thread_ts !== message.ts) {
            activity.replyCount++;
          }

          if (message.reply_count && message.reply_count > 0) {
            activity.threadsStarted++;
          }

          if (message.files) {
            activity.fileCount += message.files.length;
          }

          // Track hour
          const timestamp = new Date(parseFloat(message.ts) * 1000);
          const hour = timestamp.getUTCHours();
          activity.hourCounts[hour] = (activity.hourCounts[hour] || 0) + 1;

          // Track last active
          if (!activity.lastActive || timestamp > activity.lastActive) {
            activity.lastActive = timestamp;
          }

          // Track reactions given
          if (message.reactions) {
            for (const reaction of message.reactions) {
              for (const reactorId of reaction.users) {
                if (!userActivities.has(reactorId)) {
                  userActivities.set(reactorId, {
                    messageCount: 0,
                    replyCount: 0,
                    reactionCount: 0,
                    fileCount: 0,
                    channels: new Set(),
                    threadsStarted: 0,
                    totalMessageLength: 0,
                    hourCounts: {},
                  });
                }
                userActivities.get(reactorId)!.reactionCount++;
              }
            }
          }
        }
      } catch {
        // Skip inaccessible channels
      }
    }

    // Convert to output format
    const users = await this.client.getAllUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    return Array.from(userActivities.entries())
      .map(([userId, activity]) => {
        const user = userMap.get(userId);
        const peakHour = Object.entries(activity.hourCounts)
          .sort((a, b) => b[1] - a[1])[0];

        return {
          userId,
          userName: user?.name,
          displayName: user?.profile.display_name,
          messageCount: activity.messageCount,
          replyCount: activity.replyCount,
          reactionCount: activity.reactionCount,
          fileCount: activity.fileCount,
          channelsActive: activity.channels.size,
          threadsStarted: activity.threadsStarted,
          avgMessageLength: activity.messageCount > 0
            ? activity.totalMessageLength / activity.messageCount
            : 0,
          peakActivityHour: peakHour ? parseInt(peakHour[0], 10) : 0,
          lastActive: activity.lastActive,
        };
      })
      .sort((a, b) => b.messageCount - a.messageCount);
  }

  /**
   * Get channel activity analysis
   */
  async getChannelActivity(
    options: AnalyticsOptions
  ): Promise<ChannelActivity[]> {
    const channelActivities: ChannelActivity[] = [];

    const channels = await this.client.getAllChannels();
    let targetChannels = channels.filter(
      (c) => !c.is_archived && !c.is_im && !c.is_mpim
    );

    if (options.channelIds) {
      targetChannels = targetChannels.filter((c) => options.channelIds!.includes(c.id));
    }

    const oldest = options.startDate
      ? String(options.startDate.getTime() / 1000)
      : undefined;
    const latest = options.endDate
      ? String(options.endDate.getTime() / 1000)
      : undefined;

    for (const channel of targetChannels) {
      try {
        const messages = await this.client.getAllChannelMessages(channel.id, {
          oldest,
          latest,
        });

        const uniquePosters = new Set(messages.map((m) => m.user).filter(Boolean));
        const threadMessages = messages.filter(
          (m) => m.reply_count && m.reply_count > 0
        );
        const reactedMessages = messages.filter(
          (m) => m.reactions && m.reactions.length > 0
        );
        const fileMessages = messages.filter((m) => m.files && m.files.length > 0);

        // Calculate daily activity
        const dailyCounts: Record<string, number> = {};
        const hourCounts: Record<number, number> = {};

        for (const message of messages) {
          const timestamp = new Date(parseFloat(message.ts) * 1000);
          const day = timestamp.toISOString().split('T')[0];
          dailyCounts[day] = (dailyCounts[day] || 0) + 1;

          const hour = timestamp.getUTCHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }

        const days = Object.keys(dailyCounts).length || 1;
        const avgMessagesPerDay = messages.length / days;

        const peakHour = Object.entries(hourCounts)
          .sort((a, b) => b[1] - a[1])[0];

        // Calculate health score (0-100)
        const healthScore = this.calculateChannelHealth(
          messages.length,
          uniquePosters.size,
          threadMessages.length,
          reactedMessages.length,
          days
        );

        channelActivities.push({
          channelId: channel.id,
          channelName: channel.name,
          messageCount: messages.length,
          uniquePosters: uniquePosters.size,
          threadCount: threadMessages.length,
          reactionCount: reactedMessages.reduce(
            (sum, m) => sum + (m.reactions?.length || 0),
            0
          ),
          fileCount: fileMessages.reduce(
            (sum, m) => sum + (m.files?.length || 0),
            0
          ),
          avgMessagesPerDay,
          peakActivityHour: peakHour ? parseInt(peakHour[0], 10) : 0,
          isHealthy: healthScore >= 50,
          healthScore,
        });
      } catch {
        // Skip inaccessible channels
      }
    }

    return channelActivities.sort((a, b) => b.messageCount - a.messageCount);
  }

  /**
   * Build communication graph
   */
  async buildCommunicationGraph(
    options: AnalyticsOptions
  ): Promise<CommunicationGraph> {
    const nodes: CommunicationGraph['nodes'] = [];
    const edges: CommunicationGraph['edges'] = [];
    const userWeights = new Map<string, number>();
    const channelWeights = new Map<string, number>();
    const edgeMap = new Map<string, number>();

    const channels = await this.client.getAllChannels();
    const activeChannels = channels.filter(
      (c) => !c.is_archived && !c.is_im && !c.is_mpim
    );

    const oldest = options.startDate
      ? String(options.startDate.getTime() / 1000)
      : undefined;
    const latest = options.endDate
      ? String(options.endDate.getTime() / 1000)
      : undefined;

    for (const channel of activeChannels.slice(0, 20)) {
      try {
        const messages = await this.client.getAllChannelMessages(channel.id, {
          oldest,
          latest,
        });

        for (const message of messages) {
          if (!message.user) continue;

          // Track user activity
          userWeights.set(
            message.user,
            (userWeights.get(message.user) || 0) + 1
          );

          // Track channel activity
          channelWeights.set(
            channel.id,
            (channelWeights.get(channel.id) || 0) + 1
          );

          // Track user-channel edges
          const edgeKey = `${message.user}:${channel.id}`;
          edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);

          // Track mentions
          const mentionMatches = message.text?.match(/<@([A-Z0-9]+)>/g) || [];
          for (const mention of mentionMatches) {
            const mentionedUser = mention.replace(/<@|>/g, '');
            if (mentionedUser !== message.user) {
              const mentionEdge = `${message.user}:${mentionedUser}:mention`;
              edgeMap.set(mentionEdge, (edgeMap.get(mentionEdge) || 0) + 1);
            }
          }
        }
      } catch {
        // Skip inaccessible channels
      }
    }

    // Build nodes
    const users = await this.client.getAllUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    for (const [userId, weight] of userWeights) {
      const user = userMap.get(userId);
      if (user && !user.is_bot) {
        nodes.push({
          id: userId,
          type: 'user',
          name: user.profile.display_name || user.name,
          weight,
        });
      }
    }

    for (const [channelId, weight] of channelWeights) {
      const channel = activeChannels.find((c) => c.id === channelId);
      if (channel) {
        nodes.push({
          id: channelId,
          type: 'channel',
          name: channel.name,
          weight,
        });
      }
    }

    // Build edges
    for (const [key, weight] of edgeMap) {
      const parts = key.split(':');
      if (parts.length === 2) {
        // User to channel
        edges.push({
          from: parts[0],
          to: parts[1],
          weight,
          type: 'message',
        });
      } else if (parts.length === 3 && parts[2] === 'mention') {
        // User mention
        edges.push({
          from: parts[0],
          to: parts[1],
          weight,
          type: 'mention',
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Calculate channel health score
   */
  private calculateChannelHealth(
    messageCount: number,
    uniquePosters: number,
    threadCount: number,
    reactedCount: number,
    days: number
  ): number {
    let score = 0;

    // Activity level (0-30)
    const avgMessagesPerDay = messageCount / days;
    if (avgMessagesPerDay >= 10) score += 30;
    else if (avgMessagesPerDay >= 5) score += 20;
    else if (avgMessagesPerDay >= 1) score += 10;

    // Participation diversity (0-25)
    if (uniquePosters >= 10) score += 25;
    else if (uniquePosters >= 5) score += 15;
    else if (uniquePosters >= 2) score += 5;

    // Thread engagement (0-25)
    const threadRate = messageCount > 0 ? threadCount / messageCount : 0;
    if (threadRate >= 0.1) score += 25;
    else if (threadRate >= 0.05) score += 15;
    else if (threadRate > 0) score += 5;

    // Reaction engagement (0-20)
    const reactionRate = messageCount > 0 ? reactedCount / messageCount : 0;
    if (reactionRate >= 0.2) score += 20;
    else if (reactionRate >= 0.1) score += 10;
    else if (reactionRate > 0) score += 5;

    return Math.min(100, score);
  }
}

/**
 * Create workspace analytics
 */
export function createWorkspaceAnalytics(client: SlackClient): SlackWorkspaceAnalytics {
  return new SlackWorkspaceAnalytics(client);
}
