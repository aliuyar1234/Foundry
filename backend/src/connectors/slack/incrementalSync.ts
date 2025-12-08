/**
 * Slack Incremental Sync
 * Task: T122
 *
 * Handles incremental synchronization using timestamp (ts) cursor.
 * Manages sync checkpoints and change detection.
 */

import { ExtractedEvent } from '../base/connector';
import { SlackClient, SlackChannel, SlackMessage, SlackUser } from './slackClient';

export interface SyncCheckpoint {
  entityType: string;
  lastSyncTime: Date;
  lastTs?: string;
  channelCursors: Record<string, string>;
  recordCount: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface IncrementalSyncConfig {
  entityType: 'messages' | 'users' | 'channels' | 'files';
  batchSize: number;
}

export interface IncrementalSyncResult {
  events: ExtractedEvent[];
  checkpoint: SyncCheckpoint;
  hasMore: boolean;
  stats: {
    processed: number;
    created: number;
    updated: number;
    errors: number;
  };
}

// Standard sync configurations
export const SLACK_SYNC_CONFIGS: Record<string, IncrementalSyncConfig> = {
  messages: {
    entityType: 'messages',
    batchSize: 200,
  },
  users: {
    entityType: 'users',
    batchSize: 500,
  },
  channels: {
    entityType: 'channels',
    batchSize: 200,
  },
  files: {
    entityType: 'files',
    batchSize: 100,
  },
};

export class SlackIncrementalSync {
  private client: SlackClient;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Sync messages incrementally
   */
  async syncMessages(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      channelIds?: string[];
      maxRecords?: number;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    const config = SLACK_SYNC_CONFIGS.messages;
    const channelCursors = { ...(options.lastCheckpoint?.channelCursors || {}) };
    const startTs = options.lastCheckpoint?.lastTs;
    const maxRecords = options.maxRecords || config.batchSize * 10;

    try {
      // Get channels to sync
      let channels: SlackChannel[];
      if (options.channelIds) {
        channels = (await this.client.getAllChannels())
          .filter((c) => options.channelIds!.includes(c.id));
      } else {
        channels = (await this.client.getAllChannels())
          .filter((c) => !c.is_archived && !c.is_im && !c.is_mpim);
      }

      let latestTs = startTs;
      let hasMore = false;

      for (const channel of channels) {
        if (stats.processed >= maxRecords) {
          hasMore = true;
          break;
        }

        try {
          const oldest = startTs;
          let cursor = channelCursors[channel.id];
          let channelDone = false;

          while (!channelDone && stats.processed < maxRecords) {
            const result = await (this.client as any).request<{
              ok: boolean;
              messages?: SlackMessage[];
              has_more?: boolean;
              response_metadata?: { next_cursor?: string };
            }>('conversations.history', {
              channel: channel.id,
              cursor,
              limit: Math.min(config.batchSize, maxRecords - stats.processed),
              oldest,
            });

            if (result.messages) {
              for (const message of result.messages) {
                const event = this.messageToEvent(
                  message,
                  channel.id,
                  options.organizationId
                );
                events.push(event);
                stats.processed++;
                stats.created++;

                // Track latest timestamp
                if (!latestTs || message.ts > latestTs) {
                  latestTs = message.ts;
                }
              }
            }

            cursor = result.response_metadata?.next_cursor;
            channelCursors[channel.id] = cursor || '';

            if (!result.has_more || !cursor) {
              channelDone = true;
            }
          }

          if (!channelDone) {
            hasMore = true;
          }
        } catch (error) {
          console.warn(`Error syncing channel ${channel.id}:`, error);
          stats.errors++;
        }
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'messages',
        lastSyncTime: new Date(),
        lastTs: latestTs,
        channelCursors,
        recordCount: stats.processed,
        status: stats.errors === 0 ? 'success' : stats.errors < stats.processed ? 'partial' : 'failed',
      };

      this.checkpoints.set('messages', checkpoint);

      return { events, checkpoint, hasMore, stats };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'messages',
        lastSyncTime: options.lastCheckpoint?.lastSyncTime || new Date(0),
        lastTs: startTs,
        channelCursors,
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync users incrementally
   */
  async syncUsers(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      maxRecords?: number;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    const config = SLACK_SYNC_CONFIGS.users;
    const maxRecords = options.maxRecords || config.batchSize * 2;
    const lastSyncTime = options.lastCheckpoint?.lastSyncTime || new Date(0);

    try {
      const users = await this.client.getAllUsers();

      for (const user of users) {
        if (stats.processed >= maxRecords) break;

        // Check if user was updated since last sync
        const userUpdated = user.updated ? new Date(user.updated * 1000) : new Date();
        if (userUpdated < lastSyncTime) {
          continue;
        }

        // Skip bots
        if (user.is_bot || user.deleted) {
          continue;
        }

        const event = this.userToEvent(user, options.organizationId);
        events.push(event);
        stats.processed++;

        if (userUpdated > lastSyncTime) {
          stats.updated++;
        } else {
          stats.created++;
        }
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'users',
        lastSyncTime: new Date(),
        channelCursors: {},
        recordCount: stats.processed,
        status: 'success',
      };

      this.checkpoints.set('users', checkpoint);

      return { events, checkpoint, hasMore: false, stats };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'users',
        lastSyncTime: lastSyncTime,
        channelCursors: {},
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync channels incrementally
   */
  async syncChannels(
    options: {
      organizationId: string;
      lastCheckpoint?: SyncCheckpoint;
      maxRecords?: number;
    }
  ): Promise<IncrementalSyncResult> {
    const events: ExtractedEvent[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    const config = SLACK_SYNC_CONFIGS.channels;
    const maxRecords = options.maxRecords || config.batchSize * 2;
    const lastSyncTime = options.lastCheckpoint?.lastSyncTime || new Date(0);

    try {
      const channels = await this.client.getAllChannels();

      for (const channel of channels) {
        if (stats.processed >= maxRecords) break;

        // Skip DMs
        if (channel.is_im || channel.is_mpim) {
          continue;
        }

        const event = this.channelToEvent(channel, options.organizationId);
        events.push(event);
        stats.processed++;
        stats.created++;
      }

      const checkpoint: SyncCheckpoint = {
        entityType: 'channels',
        lastSyncTime: new Date(),
        channelCursors: {},
        recordCount: stats.processed,
        status: 'success',
      };

      this.checkpoints.set('channels', checkpoint);

      return { events, checkpoint, hasMore: false, stats };
    } catch (error) {
      const checkpoint: SyncCheckpoint = {
        entityType: 'channels',
        lastSyncTime: lastSyncTime,
        channelCursors: {},
        recordCount: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      return { events, checkpoint, hasMore: false, stats };
    }
  }

  /**
   * Sync all entities
   */
  async syncAll(
    options: {
      organizationId: string;
      checkpoints?: Map<string, SyncCheckpoint>;
      entityTypes?: string[];
      maxRecordsPerEntity?: number;
    }
  ): Promise<{
    events: ExtractedEvent[];
    checkpoints: Map<string, SyncCheckpoint>;
    stats: Record<string, IncrementalSyncResult['stats']>;
  }> {
    const allEvents: ExtractedEvent[] = [];
    const checkpoints = new Map<string, SyncCheckpoint>();
    const stats: Record<string, IncrementalSyncResult['stats']> = {};

    const entityTypes = options.entityTypes || ['users', 'channels', 'messages'];

    for (const entityType of entityTypes) {
      const lastCheckpoint = options.checkpoints?.get(entityType);

      let result: IncrementalSyncResult;

      switch (entityType) {
        case 'messages':
          result = await this.syncMessages({
            organizationId: options.organizationId,
            lastCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });
          break;
        case 'users':
          result = await this.syncUsers({
            organizationId: options.organizationId,
            lastCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });
          break;
        case 'channels':
          result = await this.syncChannels({
            organizationId: options.organizationId,
            lastCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });
          break;
        default:
          continue;
      }

      allEvents.push(...result.events);
      checkpoints.set(entityType, result.checkpoint);
      stats[entityType] = result.stats;

      // Continue syncing messages if more available
      if (entityType === 'messages' && result.hasMore) {
        let currentCheckpoint = result.checkpoint;
        while (result.hasMore) {
          result = await this.syncMessages({
            organizationId: options.organizationId,
            lastCheckpoint: currentCheckpoint,
            maxRecords: options.maxRecordsPerEntity,
          });

          allEvents.push(...result.events);
          currentCheckpoint = result.checkpoint;

          stats[entityType].processed += result.stats.processed;
          stats[entityType].created += result.stats.created;
          stats[entityType].updated += result.stats.updated;
          stats[entityType].errors += result.stats.errors;
        }
        checkpoints.set(entityType, currentCheckpoint);
      }
    }

    return { events: allEvents, checkpoints, stats };
  }

  /**
   * Convert message to event
   */
  private messageToEvent(
    message: SlackMessage,
    channelId: string,
    organizationId: string
  ): ExtractedEvent {
    const timestamp = new Date(parseFloat(message.ts) * 1000);
    const isThreadReply = message.thread_ts && message.thread_ts !== message.ts;

    return {
      type: isThreadReply ? 'communication.thread_reply' : 'communication.message',
      timestamp,
      actorId: message.user,
      targetId: `${channelId}:${message.ts}`,
      metadata: {
        source: 'slack',
        organizationId,
        channelId,
        messageTs: message.ts,
        threadTs: message.thread_ts,
        text: message.text?.substring(0, 500),
        hasReactions: (message.reactions?.length || 0) > 0,
        reactionCount: message.reactions?.reduce((sum, r) => sum + r.count, 0) || 0,
        hasFiles: (message.files?.length || 0) > 0,
        fileCount: message.files?.length || 0,
        replyCount: message.reply_count || 0,
        subtype: message.subtype,
      },
    };
  }

  /**
   * Convert user to event
   */
  private userToEvent(user: SlackUser, organizationId: string): ExtractedEvent {
    const timestamp = user.updated ? new Date(user.updated * 1000) : new Date();

    return {
      type: 'communication.user',
      timestamp,
      actorId: user.id,
      targetId: user.id,
      metadata: {
        source: 'slack',
        organizationId,
        userId: user.id,
        teamId: user.team_id,
        name: user.name,
        realName: user.real_name,
        displayName: user.profile.display_name,
        email: user.profile.email,
        title: user.profile.title,
        isAdmin: user.is_admin,
        isOwner: user.is_owner,
        timezone: user.tz,
        updatedAt: timestamp.toISOString(),
      },
    };
  }

  /**
   * Convert channel to event
   */
  private channelToEvent(channel: SlackChannel, organizationId: string): ExtractedEvent {
    const timestamp = channel.created ? new Date(channel.created * 1000) : new Date();

    return {
      type: 'communication.channel',
      timestamp,
      actorId: channel.creator,
      targetId: channel.id,
      metadata: {
        source: 'slack',
        organizationId,
        channelId: channel.id,
        name: channel.name,
        isPrivate: channel.is_private,
        isArchived: channel.is_archived,
        isGeneral: channel.is_general,
        isShared: channel.is_shared,
        memberCount: channel.num_members,
        topic: channel.topic?.value,
        purpose: channel.purpose?.value,
        createdAt: timestamp.toISOString(),
      },
    };
  }

  /**
   * Get checkpoint
   */
  getCheckpoint(entityType: string): SyncCheckpoint | undefined {
    return this.checkpoints.get(entityType);
  }

  /**
   * Set checkpoint
   */
  setCheckpoint(checkpoint: SyncCheckpoint): void {
    this.checkpoints.set(checkpoint.entityType, checkpoint);
  }

  /**
   * Clear checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    entities: string[];
    lastSync: Date | null;
    totalRecords: number;
    status: 'healthy' | 'partial' | 'failed';
  } {
    const entities: string[] = [];
    let lastSync: Date | null = null;
    let totalRecords = 0;
    let hasFailures = false;
    let hasPartial = false;

    for (const [entityType, checkpoint] of this.checkpoints) {
      entities.push(entityType);
      totalRecords += checkpoint.recordCount;

      if (!lastSync || checkpoint.lastSyncTime > lastSync) {
        lastSync = checkpoint.lastSyncTime;
      }

      if (checkpoint.status === 'failed') {
        hasFailures = true;
      } else if (checkpoint.status === 'partial') {
        hasPartial = true;
      }
    }

    return {
      entities,
      lastSync,
      totalRecords,
      status: hasFailures ? 'failed' : hasPartial ? 'partial' : 'healthy',
    };
  }
}

/**
 * Create incremental sync
 */
export function createSlackIncrementalSync(client: SlackClient): SlackIncrementalSync {
  return new SlackIncrementalSync(client);
}
