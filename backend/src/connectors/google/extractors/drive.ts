/**
 * Google Drive File Metadata Extractor
 * Extracts document collaboration patterns from Google Drive
 */

import { GoogleDriveClient, DriveFile, DriveChange } from '../driveClient.js';
import { ExtractedEvent } from '../../base/connector.js';

export interface DriveExtractionOptions {
  organizationId: string;
  lookbackDate?: Date;
  pageToken?: string;
}

export interface DriveExtractionResult {
  events: ExtractedEvent[];
  newPageToken?: string;
  filesProcessed: number;
}

/**
 * Determine file category from MIME type
 */
function getFileCategory(mimeType: string): string {
  if (mimeType.startsWith('application/vnd.google-apps.document')) return 'document';
  if (mimeType.startsWith('application/vnd.google-apps.spreadsheet')) return 'spreadsheet';
  if (mimeType.startsWith('application/vnd.google-apps.presentation')) return 'presentation';
  if (mimeType.startsWith('application/vnd.google-apps.form')) return 'form';
  if (mimeType.startsWith('application/vnd.google-apps.drawing')) return 'drawing';
  if (mimeType.startsWith('application/vnd.google-apps.folder')) return 'folder';
  if (mimeType.startsWith('application/pdf')) return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';
  return 'other';
}

/**
 * Determine if file is a Google Workspace native file
 */
function isGoogleWorkspaceFile(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.');
}

/**
 * Convert file size string to number
 */
function parseFileSize(size: string | undefined): number {
  if (!size) return 0;
  return parseInt(size, 10);
}

/**
 * Convert Drive file to ExtractedEvent
 */
function driveFileToEvent(
  file: DriveFile,
  organizationId: string,
  eventType: 'drive.created' | 'drive.modified' | 'drive.shared' | 'drive.deleted' = 'drive.modified'
): ExtractedEvent {
  const ownerEmail = file.owners?.[0]?.emailAddress?.toLowerCase();
  const lastModifierEmail = file.lastModifyingUser?.emailAddress?.toLowerCase();
  const timestamp = file.modifiedTime
    ? new Date(file.modifiedTime)
    : file.createdTime
      ? new Date(file.createdTime)
      : new Date();

  return {
    type: eventType,
    timestamp,
    actorId: lastModifierEmail || ownerEmail,
    targetId: file.id,
    metadata: {
      source: 'google',
      organizationId,
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      fileCategory: getFileCategory(file.mimeType),
      isGoogleWorkspaceFile: isGoogleWorkspaceFile(file.mimeType),
      size: parseFileSize(file.size),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      owner: ownerEmail,
      ownerName: file.owners?.[0]?.displayName,
      lastModifier: lastModifierEmail,
      lastModifierName: file.lastModifyingUser?.displayName,
      shared: file.shared,
      webViewLink: file.webViewLink,
      parents: file.parents,
      starred: file.starred,
      trashed: file.trashed,
    },
    rawData: {
      driveFile: file,
    },
  };
}

/**
 * Convert Drive change to ExtractedEvent
 */
function driveChangeToEvent(
  change: DriveChange,
  organizationId: string
): ExtractedEvent | null {
  if (change.removed || !change.file) {
    // Handle file removal
    return {
      type: 'drive.deleted',
      timestamp: new Date(change.time),
      actorId: undefined,
      targetId: change.fileId,
      metadata: {
        source: 'google',
        organizationId,
        fileId: change.fileId,
        removed: true,
      },
      rawData: {
        driveChange: change,
      },
    };
  }

  return driveFileToEvent(change.file, organizationId, 'drive.modified');
}

/**
 * Extract drive events using full sync
 */
export async function extractDriveFilesFull(
  client: GoogleDriveClient,
  options: DriveExtractionOptions
): Promise<DriveExtractionResult> {
  const events: ExtractedEvent[] = [];

  // Get files modified since lookback date
  const files = options.lookbackDate
    ? await client.getFilesModifiedSince(options.lookbackDate)
    : [];

  for (const file of files) {
    // Determine event type based on dates
    const createdTime = file.createdTime ? new Date(file.createdTime) : null;
    const modifiedTime = file.modifiedTime ? new Date(file.modifiedTime) : null;

    let eventType: 'drive.created' | 'drive.modified' | 'drive.shared' = 'drive.modified';

    // If created and modified times are within 1 minute, it's a new file
    if (createdTime && modifiedTime) {
      const diff = Math.abs(modifiedTime.getTime() - createdTime.getTime());
      if (diff < 60000) {
        eventType = 'drive.created';
      }
    }

    // If file is shared, mark it
    if (file.shared) {
      eventType = 'drive.shared';
    }

    events.push(driveFileToEvent(file, options.organizationId, eventType));
  }

  // Get start page token for future incremental syncs
  const tokenResponse = await client.getStartPageToken();

  return {
    events,
    newPageToken: tokenResponse.startPageToken,
    filesProcessed: files.length,
  };
}

/**
 * Extract drive events using incremental sync
 */
export async function extractDriveFilesIncremental(
  client: GoogleDriveClient,
  options: DriveExtractionOptions & { pageToken: string }
): Promise<DriveExtractionResult> {
  const events: ExtractedEvent[] = [];
  let pageToken: string | undefined = options.pageToken;
  let newPageToken: string | undefined;
  let filesProcessed = 0;

  do {
    const response = await client.getChangesDelta(pageToken);

    for (const change of response.changes) {
      const event = driveChangeToEvent(change, options.organizationId);
      if (event) {
        events.push(event);
        filesProcessed++;
      }
    }

    pageToken = response.nextPageToken;
    if (!pageToken) {
      newPageToken = response.newStartPageToken;
    }
  } while (pageToken);

  return {
    events,
    newPageToken,
    filesProcessed,
  };
}

/**
 * Extract drive events (auto-selects full or incremental)
 */
export async function extractDriveFiles(
  client: GoogleDriveClient,
  options: DriveExtractionOptions
): Promise<DriveExtractionResult> {
  if (options.pageToken) {
    try {
      return await extractDriveFilesIncremental(client, {
        ...options,
        pageToken: options.pageToken,
      });
    } catch (error) {
      // Page token may be expired, fall back to full sync
      console.warn('Page token expired, falling back to full sync:', error);
      return extractDriveFilesFull(client, options);
    }
  }

  return extractDriveFilesFull(client, options);
}

/**
 * Calculate drive statistics from extracted events
 */
export function calculateDriveStats(events: ExtractedEvent[]): {
  totalFiles: number;
  created: number;
  modified: number;
  shared: number;
  deleted: number;
  byCategory: Record<string, number>;
  totalSize: number;
  uniqueOwners: number;
  uniqueModifiers: number;
  sharedFilesCount: number;
} {
  const created = events.filter((e) => e.type === 'drive.created').length;
  const modified = events.filter((e) => e.type === 'drive.modified').length;
  const shared = events.filter((e) => e.type === 'drive.shared').length;
  const deleted = events.filter((e) => e.type === 'drive.deleted').length;

  const byCategory: Record<string, number> = {};
  for (const event of events) {
    const category = event.metadata.fileCategory as string;
    if (category) {
      byCategory[category] = (byCategory[category] || 0) + 1;
    }
  }

  const totalSize = events.reduce(
    (sum, e) => sum + ((e.metadata.size as number) || 0),
    0
  );

  const owners = new Set(events.map((e) => e.metadata.owner).filter(Boolean));
  const modifiers = new Set(events.map((e) => e.metadata.lastModifier).filter(Boolean));
  const sharedFiles = events.filter((e) => e.metadata.shared).length;

  return {
    totalFiles: events.length,
    created,
    modified,
    shared,
    deleted,
    byCategory,
    totalSize,
    uniqueOwners: owners.size,
    uniqueModifiers: modifiers.size,
    sharedFilesCount: sharedFiles,
  };
}
