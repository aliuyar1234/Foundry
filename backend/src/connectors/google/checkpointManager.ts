/**
 * Google-specific Checkpoint Management
 * Task: T032
 *
 * Manages sync checkpoints for Google Workspace resources.
 * Supports history IDs, sync tokens, and page tokens.
 */

import { PrismaClient } from '@prisma/client';
import { SyncCheckpoint } from '../base/connector';
import { Redis } from 'ioredis';

export interface GoogleCheckpoint extends SyncCheckpoint {
  metadata: {
    historyId?: string; // Gmail history ID
    syncToken?: string; // Calendar/Drive sync token
    pageToken?: string; // For paginated resources
    nextPageToken?: string;
    lastMessageId?: string;
    lastEventId?: string;
    lastFileId?: string;
    userEmail?: string;
  };
}

export interface CheckpointManagerOptions {
  instanceId: string;
  connectorType: string;
  redis?: Redis | null;
  prisma?: PrismaClient;
  cacheTtlSeconds?: number;
}

export class GoogleCheckpointManager {
  private instanceId: string;
  private connectorType: string;
  private redis: Redis | null;
  private prisma: PrismaClient | null;
  private localCache: Map<string, GoogleCheckpoint> = new Map();
  private cacheTtlSeconds: number;

  constructor(options: CheckpointManagerOptions) {
    this.instanceId = options.instanceId;
    this.connectorType = options.connectorType;
    this.redis = options.redis || null;
    this.prisma = options.prisma || null;
    this.cacheTtlSeconds = options.cacheTtlSeconds || 3600;
  }

  /**
   * Get checkpoint for a resource
   */
  async getCheckpoint(resource: string): Promise<GoogleCheckpoint | null> {
    const key = this.getKey(resource);

    // Check local cache first
    if (this.localCache.has(key)) {
      return this.localCache.get(key)!;
    }

    // Check Redis
    if (this.redis) {
      const cached = await this.redis.get(key);
      if (cached) {
        const checkpoint = JSON.parse(cached) as GoogleCheckpoint;
        checkpoint.timestamp = new Date(checkpoint.timestamp);
        this.localCache.set(key, checkpoint);
        return checkpoint;
      }
    }

    // Check database
    if (this.prisma) {
      const dbCheckpoint = await this.prisma.syncCheckpoint.findUnique({
        where: {
          instanceId_resource: {
            instanceId: this.instanceId,
            resource,
          },
        },
      });

      if (dbCheckpoint) {
        const checkpoint: GoogleCheckpoint = {
          connectorType: this.connectorType,
          instanceId: this.instanceId,
          resource,
          cursor: dbCheckpoint.cursor || undefined,
          timestamp: dbCheckpoint.timestamp,
          processedCount: dbCheckpoint.processedCount,
          metadata: dbCheckpoint.metadata as GoogleCheckpoint['metadata'],
        };

        this.localCache.set(key, checkpoint);

        // Cache in Redis
        if (this.redis) {
          await this.redis.set(
            key,
            JSON.stringify(checkpoint),
            'EX',
            this.cacheTtlSeconds
          );
        }

        return checkpoint;
      }
    }

    return null;
  }

  /**
   * Save checkpoint for a resource
   */
  async saveCheckpoint(checkpoint: GoogleCheckpoint): Promise<void> {
    const key = this.getKey(checkpoint.resource);

    // Update local cache
    this.localCache.set(key, checkpoint);

    // Update Redis
    if (this.redis) {
      await this.redis.set(
        key,
        JSON.stringify(checkpoint),
        'EX',
        this.cacheTtlSeconds
      );
    }

    // Update database
    if (this.prisma) {
      await this.prisma.syncCheckpoint.upsert({
        where: {
          instanceId_resource: {
            instanceId: this.instanceId,
            resource: checkpoint.resource,
          },
        },
        create: {
          instanceId: this.instanceId,
          resource: checkpoint.resource,
          cursor: checkpoint.cursor,
          timestamp: checkpoint.timestamp,
          processedCount: checkpoint.processedCount,
          metadata: checkpoint.metadata,
        },
        update: {
          cursor: checkpoint.cursor,
          timestamp: checkpoint.timestamp,
          processedCount: checkpoint.processedCount,
          metadata: checkpoint.metadata,
        },
      });
    }
  }

  /**
   * Clear checkpoint for a resource
   */
  async clearCheckpoint(resource: string): Promise<void> {
    const key = this.getKey(resource);

    // Clear local cache
    this.localCache.delete(key);

    // Clear Redis
    if (this.redis) {
      await this.redis.del(key);
    }

    // Clear database
    if (this.prisma) {
      await this.prisma.syncCheckpoint.deleteMany({
        where: {
          instanceId: this.instanceId,
          resource,
        },
      });
    }
  }

  /**
   * Clear all checkpoints for this instance
   */
  async clearAllCheckpoints(): Promise<void> {
    // Clear local cache
    this.localCache.clear();

    // Clear Redis
    if (this.redis) {
      const pattern = `checkpoint:${this.connectorType}:${this.instanceId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }

    // Clear database
    if (this.prisma) {
      await this.prisma.syncCheckpoint.deleteMany({
        where: {
          instanceId: this.instanceId,
        },
      });
    }
  }

  /**
   * Get Gmail history ID checkpoint
   */
  async getGmailHistoryId(userEmail: string): Promise<string | null> {
    const checkpoint = await this.getCheckpoint(`gmail:${userEmail}`);
    return checkpoint?.metadata?.historyId || null;
  }

  /**
   * Save Gmail history ID checkpoint
   */
  async saveGmailHistoryId(
    userEmail: string,
    historyId: string,
    processedCount: number
  ): Promise<void> {
    await this.saveCheckpoint({
      connectorType: this.connectorType,
      instanceId: this.instanceId,
      resource: `gmail:${userEmail}`,
      timestamp: new Date(),
      processedCount,
      metadata: {
        historyId,
        userEmail,
      },
    });
  }

  /**
   * Get Calendar sync token checkpoint
   */
  async getCalendarSyncToken(calendarId: string): Promise<string | null> {
    const checkpoint = await this.getCheckpoint(`calendar:${calendarId}`);
    return checkpoint?.metadata?.syncToken || null;
  }

  /**
   * Save Calendar sync token checkpoint
   */
  async saveCalendarSyncToken(
    calendarId: string,
    syncToken: string,
    processedCount: number
  ): Promise<void> {
    await this.saveCheckpoint({
      connectorType: this.connectorType,
      instanceId: this.instanceId,
      resource: `calendar:${calendarId}`,
      timestamp: new Date(),
      processedCount,
      metadata: {
        syncToken,
      },
    });
  }

  /**
   * Get Drive changes token checkpoint
   */
  async getDriveChangesToken(): Promise<string | null> {
    const checkpoint = await this.getCheckpoint('drive:changes');
    return checkpoint?.cursor || null;
  }

  /**
   * Save Drive changes token checkpoint
   */
  async saveDriveChangesToken(
    pageToken: string,
    processedCount: number
  ): Promise<void> {
    await this.saveCheckpoint({
      connectorType: this.connectorType,
      instanceId: this.instanceId,
      resource: 'drive:changes',
      cursor: pageToken,
      timestamp: new Date(),
      processedCount,
      metadata: {},
    });
  }

  /**
   * Get all checkpoints for this instance
   */
  async getAllCheckpoints(): Promise<GoogleCheckpoint[]> {
    if (this.prisma) {
      const dbCheckpoints = await this.prisma.syncCheckpoint.findMany({
        where: {
          instanceId: this.instanceId,
        },
      });

      return dbCheckpoints.map((cp) => ({
        connectorType: this.connectorType,
        instanceId: this.instanceId,
        resource: cp.resource,
        cursor: cp.cursor || undefined,
        timestamp: cp.timestamp,
        processedCount: cp.processedCount,
        metadata: cp.metadata as GoogleCheckpoint['metadata'],
      }));
    }

    return Array.from(this.localCache.values());
  }

  /**
   * Get checkpoint summary
   */
  async getCheckpointSummary(): Promise<{
    totalCheckpoints: number;
    resources: string[];
    lastSync?: Date;
    totalProcessed: number;
  }> {
    const checkpoints = await this.getAllCheckpoints();

    let lastSync: Date | undefined;
    let totalProcessed = 0;

    for (const cp of checkpoints) {
      totalProcessed += cp.processedCount;
      if (!lastSync || cp.timestamp > lastSync) {
        lastSync = cp.timestamp;
      }
    }

    return {
      totalCheckpoints: checkpoints.length,
      resources: checkpoints.map((cp) => cp.resource),
      lastSync,
      totalProcessed,
    };
  }

  // Private methods

  private getKey(resource: string): string {
    return `checkpoint:${this.connectorType}:${this.instanceId}:${resource}`;
  }
}

/**
 * Create checkpoint manager for Google connector
 */
export function createGoogleCheckpointManager(
  options: CheckpointManagerOptions
): GoogleCheckpointManager {
  return new GoogleCheckpointManager(options);
}
