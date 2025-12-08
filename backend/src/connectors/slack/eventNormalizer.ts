/**
 * Slack Event Normalizer
 * Task: T123
 *
 * Normalizes events from Slack into a consistent format.
 * Handles all Slack-specific event types and structures.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedSlackEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'slack';
  entity: string;
  actor: {
    id?: string;
    name?: string;
    type: 'user' | 'bot' | 'system';
  };
  target?: {
    id: string;
    type: string;
    name?: string;
    entity: string;
  };
  context: {
    organizationId: string;
    teamId?: string;
    channelId?: string;
  };
  data: Record<string, unknown>;
  relationships?: Array<{
    type: string;
    targetId: string;
    targetType: string;
  }>;
}

export interface NormalizationOptions {
  organizationId: string;
  teamId?: string;
  includeRawData?: boolean;
}

// Event type mappings
const ENTITY_EVENT_TYPES: Record<string, { type: string; category: string }> = {
  message: { type: 'communication', category: 'messaging' },
  thread_reply: { type: 'communication', category: 'messaging' },
  channel: { type: 'entity', category: 'workspace' },
  user: { type: 'entity', category: 'member' },
  file_upload: { type: 'activity', category: 'sharing' },
  file_share: { type: 'activity', category: 'sharing' },
  reaction: { type: 'activity', category: 'engagement' },
  channel_membership: { type: 'entity', category: 'membership' },
  user_membership: { type: 'entity', category: 'membership' },
  thread: { type: 'communication', category: 'messaging' },
};

export class SlackEventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedSlackEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const entity = this.detectEntity(event.type);
    const entityInfo = ENTITY_EVENT_TYPES[entity] || { type: 'unknown', category: 'unknown' };

    const normalized: NormalizedSlackEvent = {
      id: this.generateEventId(event, metadata),
      type: entityInfo.type,
      subtype: this.extractSubtype(event.type),
      timestamp: event.timestamp,
      source: 'slack',
      entity,
      actor: this.normalizeActor(event, metadata),
      target: this.normalizeTarget(event, metadata, entity),
      context: {
        organizationId: options.organizationId,
        teamId: options.teamId || (metadata.teamId as string),
        channelId: metadata.channelId as string,
      },
      data: this.normalizeData(event, metadata, entity, options.includeRawData),
      relationships: this.buildRelationships(event, metadata),
    };

    return normalized;
  }

  /**
   * Normalize batch of events
   */
  normalizeEvents(
    events: ExtractedEvent[],
    options: NormalizationOptions
  ): NormalizedSlackEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize Slack event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedSlackEvent => event !== null);
  }

  /**
   * Detect entity from event type
   */
  private detectEntity(eventType: string): string {
    // Parse from event type (e.g., "communication.message" -> "message")
    const parts = eventType.split('.');
    if (parts.length >= 2) {
      return parts[1];
    }
    return 'unknown';
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(event: ExtractedEvent, metadata: Record<string, unknown>): string {
    const targetId = event.targetId || metadata.messageTs || metadata.channelId || metadata.userId;
    return `slack:${targetId}:${event.timestamp.getTime()}`;
  }

  /**
   * Extract subtype from event type
   */
  private extractSubtype(eventType: string): string | undefined {
    const parts = eventType.split('.');
    return parts.length > 2 ? parts.slice(2).join('.') : undefined;
  }

  /**
   * Normalize actor
   */
  private normalizeActor(
    event: ExtractedEvent,
    metadata: Record<string, unknown>
  ): NormalizedSlackEvent['actor'] {
    if (event.actorId) {
      const isBotId = event.actorId.startsWith('B');
      return {
        id: event.actorId,
        name: metadata.userName as string,
        type: isBotId ? 'bot' : 'user',
      };
    }

    // Check for bot_id in metadata
    if (metadata.botId) {
      return {
        id: metadata.botId as string,
        type: 'bot',
      };
    }

    return { type: 'system' };
  }

  /**
   * Normalize target
   */
  private normalizeTarget(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    entity: string
  ): NormalizedSlackEvent['target'] | undefined {
    if (!event.targetId) return undefined;

    let targetType: string;
    let targetName: string | undefined;
    let targetEntity: string;

    switch (entity) {
      case 'message':
      case 'thread_reply':
        targetType = 'message';
        targetEntity = 'message';
        targetName = metadata.text
          ? (metadata.text as string).substring(0, 50)
          : undefined;
        break;
      case 'thread':
        targetType = 'thread';
        targetEntity = 'thread';
        break;
      case 'channel':
        targetType = 'channel';
        targetEntity = 'channel';
        targetName = metadata.name as string;
        break;
      case 'user':
        targetType = 'user';
        targetEntity = 'member';
        targetName = (metadata.displayName || metadata.realName || metadata.name) as string;
        break;
      case 'file_upload':
      case 'file_share':
        targetType = 'file';
        targetEntity = 'file';
        targetName = metadata.fileName as string;
        break;
      case 'reaction':
        targetType = 'reaction';
        targetEntity = 'engagement';
        targetName = metadata.emoji as string;
        break;
      case 'channel_membership':
        targetType = 'channel';
        targetEntity = 'membership';
        targetName = metadata.channelName as string;
        break;
      case 'user_membership':
        targetType = 'user';
        targetEntity = 'membership';
        break;
      default:
        targetType = entity;
        targetEntity = entity;
    }

    return {
      id: event.targetId,
      type: targetType,
      name: targetName,
      entity: targetEntity,
    };
  }

  /**
   * Normalize data
   */
  private normalizeData(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    entity: string,
    includeRawData?: boolean
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Copy key fields based on entity type
    const keyFieldsByEntity: Record<string, string[]> = {
      message: [
        'text', 'channelId', 'messageTs', 'threadTs', 'hasReactions',
        'reactionCount', 'hasFiles', 'fileCount', 'replyCount', 'subtype',
      ],
      thread_reply: [
        'text', 'channelId', 'messageTs', 'threadTs', 'parentTs',
        'hasReactions', 'reactionCount', 'hasFiles',
      ],
      thread: [
        'channelId', 'parentTs', 'replyCount', 'participantCount',
        'participantIds', 'lastReplyTs', 'parentText',
      ],
      channel: [
        'name', 'isPrivate', 'isArchived', 'isGeneral', 'isShared',
        'memberCount', 'topic', 'purpose',
      ],
      user: [
        'name', 'realName', 'displayName', 'email', 'title',
        'isAdmin', 'isOwner', 'timezone',
      ],
      file_upload: [
        'fileId', 'name', 'title', 'mimetype', 'filetype', 'prettyType',
        'size', 'isExternal', 'isPublic', 'channelCount', 'commentsCount',
      ],
      file_share: [
        'fileId', 'fileName', 'fileType', 'channelId', 'shareTs',
        'replyCount', 'replyUsersCount',
      ],
      reaction: [
        'channelId', 'messageTs', 'messageUserId', 'emoji', 'count',
        'userIds', 'sentiment',
      ],
      channel_membership: [
        'channelName', 'memberCount', 'isPrivate',
      ],
      user_membership: [
        'channelCount', 'publicChannelCount', 'privateChannelCount', 'channelIds',
      ],
    };

    const keyFields = keyFieldsByEntity[entity] || [];

    for (const field of keyFields) {
      if (field in metadata && metadata[field] !== null && metadata[field] !== undefined) {
        data[field] = metadata[field];
      }
    }

    // Add common fields
    if (metadata.createdAt) {
      data.createdAt = metadata.createdAt;
    }
    if (metadata.updatedAt) {
      data.updatedAt = metadata.updatedAt;
    }

    // Include raw data if requested
    if (includeRawData && event.rawData) {
      data._raw = event.rawData;
    }

    return data;
  }

  /**
   * Build relationships
   */
  private buildRelationships(
    event: ExtractedEvent,
    metadata: Record<string, unknown>
  ): NormalizedSlackEvent['relationships'] {
    const relationships: NormalizedSlackEvent['relationships'] = [];

    // Channel relationship
    if (metadata.channelId) {
      relationships.push({
        type: 'channel',
        targetId: metadata.channelId as string,
        targetType: 'Channel',
      });
    }

    // Thread relationship
    if (metadata.threadTs && metadata.threadTs !== metadata.messageTs) {
      relationships.push({
        type: 'thread',
        targetId: `${metadata.channelId}:${metadata.threadTs}`,
        targetType: 'Thread',
      });
    }

    // User relationships (mentions)
    if (metadata.mentionedUserIds && Array.isArray(metadata.mentionedUserIds)) {
      for (const userId of metadata.mentionedUserIds) {
        relationships.push({
          type: 'mention',
          targetId: userId,
          targetType: 'User',
        });
      }
    }

    // File relationship
    if (metadata.fileId) {
      relationships.push({
        type: 'file',
        targetId: metadata.fileId as string,
        targetType: 'File',
      });
    }

    // Reaction target
    if (metadata.messageUserId) {
      relationships.push({
        type: 'messageAuthor',
        targetId: metadata.messageUserId as string,
        targetType: 'User',
      });
    }

    // Participant relationships
    if (metadata.participantIds && Array.isArray(metadata.participantIds)) {
      for (const userId of metadata.participantIds.slice(0, 10)) {
        relationships.push({
          type: 'participant',
          targetId: userId,
          targetType: 'User',
        });
      }
    }

    return relationships.length > 0 ? relationships : undefined;
  }

  /**
   * Group events by conversation
   */
  groupByConversation(
    events: NormalizedSlackEvent[]
  ): Map<string, NormalizedSlackEvent[]> {
    const groups = new Map<string, NormalizedSlackEvent[]>();

    for (const event of events) {
      const channelId = event.context.channelId || 'unknown';
      if (!groups.has(channelId)) {
        groups.set(channelId, []);
      }
      groups.get(channelId)!.push(event);
    }

    // Sort events within each group by timestamp
    for (const [_, groupEvents] of groups) {
      groupEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    return groups;
  }

  /**
   * Group events by thread
   */
  groupByThread(
    events: NormalizedSlackEvent[]
  ): Map<string, NormalizedSlackEvent[]> {
    const groups = new Map<string, NormalizedSlackEvent[]>();

    for (const event of events) {
      const threadTs = (event.data.threadTs || event.data.parentTs || event.data.messageTs) as string;
      if (!threadTs) continue;

      const key = `${event.context.channelId}:${threadTs}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    // Sort events within each group by timestamp
    for (const [_, groupEvents] of groups) {
      groupEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    return groups;
  }

  /**
   * Calculate event statistics
   */
  calculateStatistics(events: NormalizedSlackEvent[]): {
    totalEvents: number;
    byType: Record<string, number>;
    byEntity: Record<string, number>;
    byActor: Record<string, number>;
    byChannel: Record<string, number>;
    timeRange: { start: Date; end: Date } | null;
  } {
    const byType: Record<string, number> = {};
    const byEntity: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    let minTime: Date | null = null;
    let maxTime: Date | null = null;

    for (const event of events) {
      // By type
      byType[event.type] = (byType[event.type] || 0) + 1;

      // By entity
      byEntity[event.entity] = (byEntity[event.entity] || 0) + 1;

      // By actor
      if (event.actor.id) {
        byActor[event.actor.id] = (byActor[event.actor.id] || 0) + 1;
      }

      // By channel
      if (event.context.channelId) {
        byChannel[event.context.channelId] = (byChannel[event.context.channelId] || 0) + 1;
      }

      // Time range
      if (!minTime || event.timestamp < minTime) {
        minTime = event.timestamp;
      }
      if (!maxTime || event.timestamp > maxTime) {
        maxTime = event.timestamp;
      }
    }

    return {
      totalEvents: events.length,
      byType,
      byEntity,
      byActor,
      byChannel,
      timeRange: minTime && maxTime ? { start: minTime, end: maxTime } : null,
    };
  }
}

/**
 * Create event normalizer
 */
export function createSlackEventNormalizer(): SlackEventNormalizer {
  return new SlackEventNormalizer();
}
