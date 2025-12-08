/**
 * Shared Drive Discovery
 * Task: T029
 *
 * Discovers and syncs Google Shared Drives (Team Drives).
 * Handles drive-level permissions and file metadata.
 */

import { drive_v3 } from 'googleapis';
import { ExtractedEvent } from '../../base/connector';

export interface SharedDrive {
  id: string;
  name: string;
  colorRgb?: string;
  createdTime: Date;
  hidden: boolean;
  capabilities: {
    canAddChildren: boolean;
    canComment: boolean;
    canCopy: boolean;
    canDeleteDrive: boolean;
    canDownload: boolean;
    canEdit: boolean;
    canListChildren: boolean;
    canManageMembers: boolean;
    canReadRevisions: boolean;
    canRename: boolean;
    canRenameDrive: boolean;
    canShare: boolean;
  };
  restrictions?: {
    adminManagedRestrictions: boolean;
    copyRequiresWriterPermission: boolean;
    domainUsersOnly: boolean;
    driveMembersOnly: boolean;
  };
}

export interface SharedDriveDiscoveryResult {
  drives: SharedDrive[];
  totalDrives: number;
  canManage: number;
  readOnly: number;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  driveId?: string;
  parentId?: string;
  createdTime: Date;
  modifiedTime: Date;
  size?: number;
  webViewLink?: string;
  iconLink?: string;
  owners?: Array<{ email: string; displayName?: string }>;
  lastModifyingUser?: { email: string; displayName?: string };
  shared: boolean;
  trashed: boolean;
}

export class SharedDriveDiscovery {
  private driveClient: drive_v3.Drive;

  constructor(driveClient: drive_v3.Drive) {
    this.driveClient = driveClient;
  }

  /**
   * Discover all accessible shared drives
   */
  async discoverSharedDrives(): Promise<SharedDriveDiscoveryResult> {
    const drives: SharedDrive[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.driveClient.drives.list({
        pageSize: 100,
        pageToken,
        fields:
          'drives(id,name,colorRgb,createdTime,hidden,capabilities,restrictions),nextPageToken',
      });

      for (const item of response.data.drives || []) {
        drives.push({
          id: item.id!,
          name: item.name!,
          colorRgb: item.colorRgb,
          createdTime: new Date(item.createdTime!),
          hidden: item.hidden || false,
          capabilities: {
            canAddChildren: item.capabilities?.canAddChildren || false,
            canComment: item.capabilities?.canComment || false,
            canCopy: item.capabilities?.canCopy || false,
            canDeleteDrive: item.capabilities?.canDeleteDrive || false,
            canDownload: item.capabilities?.canDownload || false,
            canEdit: item.capabilities?.canEdit || false,
            canListChildren: item.capabilities?.canListChildren || false,
            canManageMembers: item.capabilities?.canManageMembers || false,
            canReadRevisions: item.capabilities?.canReadRevisions || false,
            canRename: item.capabilities?.canRename || false,
            canRenameDrive: item.capabilities?.canRenameDrive || false,
            canShare: item.capabilities?.canShare || false,
          },
          restrictions: item.restrictions
            ? {
                adminManagedRestrictions:
                  item.restrictions.adminManagedRestrictions || false,
                copyRequiresWriterPermission:
                  item.restrictions.copyRequiresWriterPermission || false,
                domainUsersOnly: item.restrictions.domainUsersOnly || false,
                driveMembersOnly: item.restrictions.driveMembersOnly || false,
              }
            : undefined,
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    const canManage = drives.filter((d) => d.capabilities.canManageMembers);
    const readOnly = drives.filter(
      (d) => !d.capabilities.canEdit && d.capabilities.canListChildren
    );

    return {
      drives,
      totalDrives: drives.length,
      canManage: canManage.length,
      readOnly: readOnly.length,
    };
  }

  /**
   * Get shared drive details
   */
  async getSharedDrive(driveId: string): Promise<SharedDrive | null> {
    try {
      const response = await this.driveClient.drives.get({
        driveId,
        fields: 'id,name,colorRgb,createdTime,hidden,capabilities,restrictions',
      });

      const item = response.data;
      return {
        id: item.id!,
        name: item.name!,
        colorRgb: item.colorRgb,
        createdTime: new Date(item.createdTime!),
        hidden: item.hidden || false,
        capabilities: {
          canAddChildren: item.capabilities?.canAddChildren || false,
          canComment: item.capabilities?.canComment || false,
          canCopy: item.capabilities?.canCopy || false,
          canDeleteDrive: item.capabilities?.canDeleteDrive || false,
          canDownload: item.capabilities?.canDownload || false,
          canEdit: item.capabilities?.canEdit || false,
          canListChildren: item.capabilities?.canListChildren || false,
          canManageMembers: item.capabilities?.canManageMembers || false,
          canReadRevisions: item.capabilities?.canReadRevisions || false,
          canRename: item.capabilities?.canRename || false,
          canRenameDrive: item.capabilities?.canRenameDrive || false,
          canShare: item.capabilities?.canShare || false,
        },
        restrictions: item.restrictions
          ? {
              adminManagedRestrictions:
                item.restrictions.adminManagedRestrictions || false,
              copyRequiresWriterPermission:
                item.restrictions.copyRequiresWriterPermission || false,
              domainUsersOnly: item.restrictions.domainUsersOnly || false,
              driveMembersOnly: item.restrictions.driveMembersOnly || false,
            }
          : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * List files in a shared drive
   */
  async listSharedDriveFiles(
    driveId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      query?: string;
      orderBy?: string;
      includeDeleted?: boolean;
    } = {}
  ): Promise<{
    files: DriveFile[];
    nextPageToken?: string;
  }> {
    const q = options.query || `'${driveId}' in parents`;

    const response = await this.driveClient.files.list({
      corpora: 'drive',
      driveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: options.pageSize || 100,
      pageToken: options.pageToken,
      q: options.includeDeleted ? q : `${q} and trashed = false`,
      orderBy: options.orderBy || 'modifiedTime desc',
      fields:
        'files(id,name,mimeType,driveId,parents,createdTime,modifiedTime,size,webViewLink,iconLink,owners,lastModifyingUser,shared,trashed),nextPageToken',
    });

    const files: DriveFile[] = (response.data.files || []).map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      driveId: file.driveId,
      parentId: file.parents?.[0],
      createdTime: new Date(file.createdTime!),
      modifiedTime: new Date(file.modifiedTime!),
      size: file.size ? parseInt(file.size) : undefined,
      webViewLink: file.webViewLink,
      iconLink: file.iconLink,
      owners: file.owners?.map((o) => ({
        email: o.emailAddress!,
        displayName: o.displayName,
      })),
      lastModifyingUser: file.lastModifyingUser
        ? {
            email: file.lastModifyingUser.emailAddress!,
            displayName: file.lastModifyingUser.displayName,
          }
        : undefined,
      shared: file.shared || false,
      trashed: file.trashed || false,
    }));

    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  /**
   * Sync files from a shared drive to events
   */
  async syncSharedDriveFiles(
    driveId: string,
    organizationId: string,
    options: {
      modifiedAfter?: Date;
      maxFiles?: number;
    } = {}
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];
    let pageToken: string | undefined;
    let filesProcessed = 0;
    const maxFiles = options.maxFiles || 1000;

    let query = `'${driveId}' in parents and trashed = false`;
    if (options.modifiedAfter) {
      query += ` and modifiedTime > '${options.modifiedAfter.toISOString()}'`;
    }

    do {
      const result = await this.listSharedDriveFiles(driveId, {
        pageToken,
        query,
        pageSize: Math.min(100, maxFiles - filesProcessed),
      });

      for (const file of result.files) {
        events.push({
          type: 'drive.file',
          timestamp: file.modifiedTime,
          actorId: file.lastModifyingUser?.email,
          targetId: file.id,
          metadata: {
            source: 'google',
            organizationId,
            driveId,
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            parentId: file.parentId,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            size: file.size,
            webViewLink: file.webViewLink,
            lastModifiedBy: file.lastModifyingUser?.email,
            isFolder: file.mimeType === 'application/vnd.google-apps.folder',
            shared: file.shared,
          },
        });

        filesProcessed++;
      }

      pageToken = result.nextPageToken;
    } while (pageToken && filesProcessed < maxFiles);

    return events;
  }

  /**
   * Get all files across all shared drives
   */
  async syncAllSharedDrives(
    organizationId: string,
    options: {
      modifiedAfter?: Date;
      maxFilesPerDrive?: number;
    } = {}
  ): Promise<{
    events: ExtractedEvent[];
    drivesSynced: number;
    totalFiles: number;
  }> {
    const { drives } = await this.discoverSharedDrives();
    const allEvents: ExtractedEvent[] = [];
    let drivesSynced = 0;

    for (const drive of drives) {
      if (!drive.capabilities.canListChildren) {
        continue;
      }

      const events = await this.syncSharedDriveFiles(
        drive.id,
        organizationId,
        options
      );

      allEvents.push(...events);
      drivesSynced++;
    }

    return {
      events: allEvents,
      drivesSynced,
      totalFiles: allEvents.length,
    };
  }
}

/**
 * Create shared drive discovery
 */
export function createSharedDriveDiscovery(
  driveClient: drive_v3.Drive
): SharedDriveDiscovery {
  return new SharedDriveDiscovery(driveClient);
}
