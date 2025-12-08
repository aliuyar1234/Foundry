/**
 * Slack File Sharing Extractor
 * Task: T117
 *
 * Extracts file sharing events and file metadata.
 * Tracks document collaboration and sharing patterns.
 */

import { ExtractedEvent } from '../../base/connector';
import { SlackClient } from '../slackClient';

export interface FileExtractionOptions {
  organizationId: string;
  channelIds?: string[];
  userIds?: string[];
  types?: string[];
  oldest?: Date;
  latest?: Date;
  limit?: number;
}

export interface SlackFile {
  id: string;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  user: string;
  editable: boolean;
  size: number;
  mode: string;
  is_external: boolean;
  external_type?: string;
  is_public: boolean;
  public_url_shared: boolean;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  permalink_public?: string;
  channels?: string[];
  groups?: string[];
  ims?: string[];
  shares?: {
    public?: Record<string, Array<{
      reply_users?: string[];
      reply_users_count?: number;
      reply_count?: number;
      ts: string;
    }>>;
    private?: Record<string, Array<{
      reply_users?: string[];
      reply_users_count?: number;
      reply_count?: number;
      ts: string;
    }>>;
  };
  has_rich_preview?: boolean;
  comments_count?: number;
}

export interface FileShare {
  fileId: string;
  channelId: string;
  shareTs: string;
  replyCount: number;
  replyUsersCount: number;
}

export interface FileSummary {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, number>;
  byUser: Record<string, number>;
  topFileTypes: Array<{ type: string; count: number }>;
  avgFileSize: number;
}

export class SlackFileExtractor {
  private client: SlackClient;

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Extract files from workspace
   */
  async extractFiles(
    options: FileExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    files: SlackFile[];
    shares: FileShare[];
    summary: FileSummary;
  }> {
    const events: ExtractedEvent[] = [];
    const files: SlackFile[] = [];
    const shares: FileShare[] = [];
    const byType: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    let totalSize = 0;

    try {
      let page = 1;
      let totalPages = 1;
      const maxFiles = options.limit || 1000;

      const ts_from = options.oldest ? Math.floor(options.oldest.getTime() / 1000) : undefined;
      const ts_to = options.latest ? Math.floor(options.latest.getTime() / 1000) : undefined;

      do {
        const result = await (this.client as any).request<{
          ok: boolean;
          files?: SlackFile[];
          paging?: {
            count: number;
            total: number;
            page: number;
            pages: number;
          };
        }>('files.list', {
          page,
          count: Math.min(100, maxFiles - files.length),
          channel: options.channelIds?.[0], // Only supports one channel in API
          user: options.userIds?.[0], // Only supports one user in API
          types: options.types?.join(','),
          ts_from,
          ts_to,
        });

        if (result.files) {
          for (const file of result.files) {
            if (files.length >= maxFiles) break;

            files.push(file);

            // Track stats
            byType[file.filetype] = (byType[file.filetype] || 0) + 1;
            byUser[file.user] = (byUser[file.user] || 0) + 1;
            totalSize += file.size || 0;

            // Create file event
            events.push(this.createFileEvent(file, options.organizationId));

            // Extract shares
            if (file.shares) {
              const fileShares = this.extractFileShares(file);
              shares.push(...fileShares);

              // Create share events
              for (const share of fileShares) {
                events.push(this.createShareEvent(file, share, options.organizationId));
              }
            }
          }
        }

        totalPages = result.paging?.pages || 1;
        page++;
      } while (page <= totalPages && files.length < maxFiles);
    } catch (error) {
      console.warn('Failed to extract files:', error);
    }

    // Calculate top file types
    const topFileTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    return {
      events,
      files,
      shares,
      summary: {
        totalFiles: files.length,
        totalSize,
        byType,
        byUser,
        topFileTypes,
        avgFileSize: files.length > 0 ? totalSize / files.length : 0,
      },
    };
  }

  /**
   * Get file info by ID
   */
  async getFileInfo(fileId: string): Promise<SlackFile | null> {
    try {
      const result = await (this.client as any).request<{
        ok: boolean;
        file?: SlackFile;
      }>('files.info', { file: fileId });

      return result.file || null;
    } catch (error) {
      console.warn(`Failed to get file info for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Get files shared in a channel
   */
  async getChannelFiles(
    channelId: string,
    options: {
      organizationId: string;
      oldest?: Date;
      latest?: Date;
      limit?: number;
    }
  ): Promise<SlackFile[]> {
    const result = await this.extractFiles({
      organizationId: options.organizationId,
      channelIds: [channelId],
      oldest: options.oldest,
      latest: options.latest,
      limit: options.limit,
    });

    return result.files;
  }

  /**
   * Get files uploaded by a user
   */
  async getUserFiles(
    userId: string,
    options: {
      organizationId: string;
      oldest?: Date;
      latest?: Date;
      limit?: number;
    }
  ): Promise<SlackFile[]> {
    const result = await this.extractFiles({
      organizationId: options.organizationId,
      userIds: [userId],
      oldest: options.oldest,
      latest: options.latest,
      limit: options.limit,
    });

    return result.files;
  }

  /**
   * Extract shares from file
   */
  private extractFileShares(file: SlackFile): FileShare[] {
    const shares: FileShare[] = [];

    if (file.shares?.public) {
      for (const [channelId, channelShares] of Object.entries(file.shares.public)) {
        for (const share of channelShares) {
          shares.push({
            fileId: file.id,
            channelId,
            shareTs: share.ts,
            replyCount: share.reply_count || 0,
            replyUsersCount: share.reply_users_count || 0,
          });
        }
      }
    }

    if (file.shares?.private) {
      for (const [channelId, channelShares] of Object.entries(file.shares.private)) {
        for (const share of channelShares) {
          shares.push({
            fileId: file.id,
            channelId,
            shareTs: share.ts,
            replyCount: share.reply_count || 0,
            replyUsersCount: share.reply_users_count || 0,
          });
        }
      }
    }

    return shares;
  }

  /**
   * Create file event
   */
  private createFileEvent(file: SlackFile, organizationId: string): ExtractedEvent {
    const timestamp = new Date(file.timestamp * 1000);

    return {
      type: 'communication.file_upload',
      timestamp,
      actorId: file.user,
      targetId: file.id,
      metadata: {
        source: 'slack',
        organizationId,
        fileId: file.id,
        name: file.name,
        title: file.title,
        mimetype: file.mimetype,
        filetype: file.filetype,
        prettyType: file.pretty_type,
        size: file.size,
        isExternal: file.is_external,
        externalType: file.external_type,
        isPublic: file.is_public,
        channelCount: (file.channels?.length || 0) + (file.groups?.length || 0),
        commentsCount: file.comments_count || 0,
        hasRichPreview: file.has_rich_preview,
        createdAt: new Date(file.created * 1000).toISOString(),
      },
    };
  }

  /**
   * Create share event
   */
  private createShareEvent(
    file: SlackFile,
    share: FileShare,
    organizationId: string
  ): ExtractedEvent {
    const timestamp = new Date(parseFloat(share.shareTs) * 1000);

    return {
      type: 'communication.file_share',
      timestamp,
      actorId: file.user,
      targetId: `${file.id}:${share.channelId}:${share.shareTs}`,
      metadata: {
        source: 'slack',
        organizationId,
        fileId: file.id,
        fileName: file.name,
        fileType: file.filetype,
        channelId: share.channelId,
        shareTs: share.shareTs,
        replyCount: share.replyCount,
        replyUsersCount: share.replyUsersCount,
      },
    };
  }
}

/**
 * Create file extractor
 */
export function createFileExtractor(client: SlackClient): SlackFileExtractor {
  return new SlackFileExtractor(client);
}
