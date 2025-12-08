/**
 * Drive Permissions Extractor
 * Task: T030
 *
 * Extracts and tracks file/folder permissions from Google Drive.
 * Supports sharing analysis and permission change tracking.
 */

import { drive_v3 } from 'googleapis';
import { ExtractedEvent } from '../../base/connector';

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  domain?: string;
  displayName?: string;
  photoLink?: string;
  expirationTime?: Date;
  deleted: boolean;
  pendingOwner: boolean;
  allowFileDiscovery?: boolean;
}

export interface FilePermissions {
  fileId: string;
  fileName: string;
  mimeType: string;
  permissions: DrivePermission[];
  permissionCount: number;
  isSharedExternally: boolean;
  isPublic: boolean;
  owners: string[];
}

export interface PermissionChangeEvent {
  type: 'added' | 'removed' | 'updated';
  permission: DrivePermission;
  fileId: string;
  fileName: string;
  timestamp: Date;
}

export class DrivePermissionsExtractor {
  private driveClient: drive_v3.Drive;

  constructor(driveClient: drive_v3.Drive) {
    this.driveClient = driveClient;
  }

  /**
   * Get permissions for a file
   */
  async getFilePermissions(fileId: string): Promise<FilePermissions | null> {
    try {
      // Get file metadata
      const fileResponse = await this.driveClient.files.get({
        fileId,
        fields: 'id,name,mimeType,owners',
        supportsAllDrives: true,
      });

      // Get permissions
      const permissionsResponse = await this.driveClient.permissions.list({
        fileId,
        fields:
          'permissions(id,type,role,emailAddress,domain,displayName,photoLink,expirationTime,deleted,pendingOwner,allowFileDiscovery)',
        supportsAllDrives: true,
      });

      const permissions: DrivePermission[] = (
        permissionsResponse.data.permissions || []
      ).map((p) => ({
        id: p.id!,
        type: p.type as DrivePermission['type'],
        role: p.role as DrivePermission['role'],
        emailAddress: p.emailAddress,
        domain: p.domain,
        displayName: p.displayName,
        photoLink: p.photoLink,
        expirationTime: p.expirationTime
          ? new Date(p.expirationTime)
          : undefined,
        deleted: p.deleted || false,
        pendingOwner: p.pendingOwner || false,
        allowFileDiscovery: p.allowFileDiscovery,
      }));

      const isPublic = permissions.some((p) => p.type === 'anyone');
      const externalDomains = permissions.filter(
        (p) =>
          p.type === 'user' &&
          p.emailAddress &&
          !this.isInternalDomain(p.emailAddress)
      );

      return {
        fileId,
        fileName: fileResponse.data.name!,
        mimeType: fileResponse.data.mimeType!,
        permissions,
        permissionCount: permissions.length,
        isSharedExternally: externalDomains.length > 0 || isPublic,
        isPublic,
        owners: (fileResponse.data.owners || [])
          .map((o) => o.emailAddress!)
          .filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get permission details
   */
  async getPermission(
    fileId: string,
    permissionId: string
  ): Promise<DrivePermission | null> {
    try {
      const response = await this.driveClient.permissions.get({
        fileId,
        permissionId,
        fields:
          'id,type,role,emailAddress,domain,displayName,photoLink,expirationTime,deleted,pendingOwner,allowFileDiscovery',
        supportsAllDrives: true,
      });

      const p = response.data;
      return {
        id: p.id!,
        type: p.type as DrivePermission['type'],
        role: p.role as DrivePermission['role'],
        emailAddress: p.emailAddress,
        domain: p.domain,
        displayName: p.displayName,
        photoLink: p.photoLink,
        expirationTime: p.expirationTime
          ? new Date(p.expirationTime)
          : undefined,
        deleted: p.deleted || false,
        pendingOwner: p.pendingOwner || false,
        allowFileDiscovery: p.allowFileDiscovery,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find files shared externally
   */
  async findExternallySharedFiles(
    options: {
      pageSize?: number;
      pageToken?: string;
      driveId?: string;
    } = {}
  ): Promise<{
    files: FilePermissions[];
    nextPageToken?: string;
  }> {
    // Query for files with external sharing
    const q = "visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind'";

    const params: drive_v3.Params$Resource$Files$List = {
      pageSize: options.pageSize || 100,
      pageToken: options.pageToken,
      q,
      fields: 'files(id,name,mimeType,owners,permissions),nextPageToken',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };

    if (options.driveId) {
      params.driveId = options.driveId;
      params.corpora = 'drive';
    }

    const response = await this.driveClient.files.list(params);

    const files: FilePermissions[] = (response.data.files || []).map((file) => {
      const permissions: DrivePermission[] = (file.permissions || []).map(
        (p) => ({
          id: p.id!,
          type: p.type as DrivePermission['type'],
          role: p.role as DrivePermission['role'],
          emailAddress: p.emailAddress,
          domain: p.domain,
          displayName: p.displayName,
          deleted: false,
          pendingOwner: false,
        })
      );

      const isPublic = permissions.some((p) => p.type === 'anyone');

      return {
        fileId: file.id!,
        fileName: file.name!,
        mimeType: file.mimeType!,
        permissions,
        permissionCount: permissions.length,
        isSharedExternally: true,
        isPublic,
        owners: (file.owners || [])
          .map((o) => o.emailAddress!)
          .filter(Boolean),
      };
    });

    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  /**
   * Find files shared with specific user
   */
  async findFilesSharedWithUser(
    email: string,
    options: {
      pageSize?: number;
      pageToken?: string;
    } = {}
  ): Promise<{
    files: FilePermissions[];
    nextPageToken?: string;
  }> {
    const q = `'${email}' in readers or '${email}' in writers`;

    const response = await this.driveClient.files.list({
      pageSize: options.pageSize || 100,
      pageToken: options.pageToken,
      q,
      fields: 'files(id,name,mimeType,owners),nextPageToken',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files: FilePermissions[] = [];

    for (const file of response.data.files || []) {
      const filePerms = await this.getFilePermissions(file.id!);
      if (filePerms) {
        files.push(filePerms);
      }
    }

    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  /**
   * Extract permission events for sync
   */
  async extractPermissionEvents(
    fileId: string,
    organizationId: string
  ): Promise<ExtractedEvent[]> {
    const filePerms = await this.getFilePermissions(fileId);

    if (!filePerms) {
      return [];
    }

    const events: ExtractedEvent[] = [];
    const now = new Date();

    // Create event for each permission
    for (const permission of filePerms.permissions) {
      events.push({
        type: 'drive.permission',
        timestamp: now,
        actorId: permission.emailAddress || permission.domain,
        targetId: fileId,
        metadata: {
          source: 'google',
          organizationId,
          fileId,
          fileName: filePerms.fileName,
          mimeType: filePerms.mimeType,
          permissionId: permission.id,
          permissionType: permission.type,
          role: permission.role,
          grantedTo: permission.emailAddress || permission.domain,
          displayName: permission.displayName,
          isPublic: permission.type === 'anyone',
          expirationTime: permission.expirationTime,
          deleted: permission.deleted,
        },
      });
    }

    // Create summary event for file sharing status
    events.push({
      type: 'drive.sharing.summary',
      timestamp: now,
      actorId: filePerms.owners[0],
      targetId: fileId,
      metadata: {
        source: 'google',
        organizationId,
        fileId,
        fileName: filePerms.fileName,
        permissionCount: filePerms.permissionCount,
        isPublic: filePerms.isPublic,
        isSharedExternally: filePerms.isSharedExternally,
        owners: filePerms.owners,
      },
    });

    return events;
  }

  /**
   * Get sharing statistics for a folder
   */
  async getFolderSharingStats(
    folderId: string
  ): Promise<{
    totalFiles: number;
    sharedFiles: number;
    publicFiles: number;
    externallySharedFiles: number;
    uniqueCollaborators: number;
  }> {
    let pageToken: string | undefined;
    let totalFiles = 0;
    let sharedFiles = 0;
    let publicFiles = 0;
    let externallySharedFiles = 0;
    const collaborators = new Set<string>();

    do {
      const response = await this.driveClient.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: 100,
        pageToken,
        fields: 'files(id),nextPageToken',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      for (const file of response.data.files || []) {
        totalFiles++;
        const perms = await this.getFilePermissions(file.id!);

        if (perms) {
          if (perms.permissionCount > 1) {
            sharedFiles++;
          }
          if (perms.isPublic) {
            publicFiles++;
          }
          if (perms.isSharedExternally) {
            externallySharedFiles++;
          }

          for (const perm of perms.permissions) {
            if (perm.emailAddress) {
              collaborators.add(perm.emailAddress);
            }
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return {
      totalFiles,
      sharedFiles,
      publicFiles,
      externallySharedFiles,
      uniqueCollaborators: collaborators.size,
    };
  }

  /**
   * Check if email is from internal domain
   */
  private isInternalDomain(email: string): boolean {
    // This would be configured based on the organization's domains
    // For now, we'll consider Google Workspace domains
    // In practice, this should be configurable
    return false; // Default to treating all as external
  }
}

/**
 * Create permissions extractor
 */
export function createDrivePermissionsExtractor(
  driveClient: drive_v3.Drive
): DrivePermissionsExtractor {
  return new DrivePermissionsExtractor(driveClient);
}
