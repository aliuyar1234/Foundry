/**
 * Google Drive API Client Wrapper
 * Provides typed access to Google Drive API endpoints
 */

export interface DriveClientConfig {
  accessToken: string;
}

export interface DriveUser {
  displayName: string;
  kind: string;
  me: boolean;
  permissionId: string;
  emailAddress: string;
  photoLink?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  description?: string;
  starred: boolean;
  trashed: boolean;
  explicitlyTrashed?: boolean;
  parents?: string[];
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
  spaces?: string[];
  version?: string;
  webContentLink?: string;
  webViewLink?: string;
  iconLink?: string;
  hasThumbnail?: boolean;
  thumbnailLink?: string;
  thumbnailVersion?: string;
  viewedByMe?: boolean;
  viewedByMeTime?: string;
  createdTime?: string;
  modifiedTime?: string;
  modifiedByMeTime?: string;
  modifiedByMe?: boolean;
  sharedWithMeTime?: string;
  sharingUser?: DriveUser;
  owners?: DriveUser[];
  teamDriveId?: string;
  driveId?: string;
  lastModifyingUser?: DriveUser;
  shared?: boolean;
  ownedByMe?: boolean;
  capabilities?: DriveFileCapabilities;
  viewersCanCopyContent?: boolean;
  copyRequiresWriterPermission?: boolean;
  writersCanShare?: boolean;
  permissions?: DrivePermission[];
  permissionIds?: string[];
  hasAugmentedPermissions?: boolean;
  folderColorRgb?: string;
  originalFilename?: string;
  fullFileExtension?: string;
  fileExtension?: string;
  md5Checksum?: string;
  sha1Checksum?: string;
  sha256Checksum?: string;
  size?: string;
  quotaBytesUsed?: string;
  headRevisionId?: string;
  contentHints?: {
    thumbnail?: {
      image: string;
      mimeType: string;
    };
    indexableText?: string;
  };
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    rotation?: number;
    location?: {
      latitude: number;
      longitude: number;
      altitude: number;
    };
    time?: string;
  };
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
  shortcutDetails?: {
    targetId: string;
    targetMimeType: string;
    targetResourceKey?: string;
  };
  contentRestrictions?: Array<{
    readOnly: boolean;
    reason: string;
    type: string;
    restrictingUser?: DriveUser;
  }>;
  resourceKey?: string;
  linkShareMetadata?: {
    securityUpdateEligible: boolean;
    securityUpdateEnabled: boolean;
  };
}

export interface DriveFileCapabilities {
  canAddChildren?: boolean;
  canAddFolderFromAnotherDrive?: boolean;
  canAddMyDriveParent?: boolean;
  canChangeCopyRequiresWriterPermission?: boolean;
  canChangeSecurityUpdateEnabled?: boolean;
  canChangeViewersCanCopyContent?: boolean;
  canComment?: boolean;
  canCopy?: boolean;
  canDelete?: boolean;
  canDeleteChildren?: boolean;
  canDownload?: boolean;
  canEdit?: boolean;
  canListChildren?: boolean;
  canModifyContent?: boolean;
  canModifyContentRestriction?: boolean;
  canModifyLabels?: boolean;
  canMoveChildrenOutOfTeamDrive?: boolean;
  canMoveChildrenOutOfDrive?: boolean;
  canMoveChildrenWithinTeamDrive?: boolean;
  canMoveChildrenWithinDrive?: boolean;
  canMoveItemIntoTeamDrive?: boolean;
  canMoveItemOutOfTeamDrive?: boolean;
  canMoveItemOutOfDrive?: boolean;
  canMoveItemWithinTeamDrive?: boolean;
  canMoveItemWithinDrive?: boolean;
  canMoveTeamDriveItem?: boolean;
  canReadLabels?: boolean;
  canReadRevisions?: boolean;
  canReadTeamDrive?: boolean;
  canReadDrive?: boolean;
  canRemoveChildren?: boolean;
  canRemoveMyDriveParent?: boolean;
  canRename?: boolean;
  canShare?: boolean;
  canTrash?: boolean;
  canTrashChildren?: boolean;
  canUntrash?: boolean;
}

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  emailAddress?: string;
  domain?: string;
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  allowFileDiscovery?: boolean;
  displayName?: string;
  photoLink?: string;
  expirationTime?: string;
  teamDrivePermissionDetails?: Array<{
    teamDrivePermissionType: string;
    role: string;
    inherited: boolean;
    inheritedFrom?: string;
  }>;
  permissionDetails?: Array<{
    permissionType: string;
    role: string;
    inherited: boolean;
    inheritedFrom?: string;
  }>;
  deleted?: boolean;
  pendingOwner?: boolean;
}

export interface DriveChange {
  kind: string;
  removed: boolean;
  file?: DriveFile;
  fileId?: string;
  time: string;
  driveId?: string;
  changeType: 'file' | 'drive';
}

export interface DriveListResponse<T> {
  files?: T[];
  changes?: T[];
  nextPageToken?: string;
  newStartPageToken?: string;
  incompleteSearch?: boolean;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Google Drive API client wrapper class
 */
export class GoogleDriveClient {
  private accessToken: string;

  constructor(config: DriveClientConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Make authenticated request to Drive API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${DRIVE_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Drive API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get information about the user
   */
  async getAbout(): Promise<{
    user: DriveUser;
    storageQuota: {
      limit?: string;
      usage: string;
      usageInDrive: string;
      usageInDriveTrash: string;
    };
  }> {
    return this.request('/about?fields=user,storageQuota');
  }

  /**
   * List files
   */
  async listFiles(options: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
    orderBy?: string;
    fields?: string;
    spaces?: string;
    corpora?: string;
    includeItemsFromAllDrives?: boolean;
    supportsAllDrives?: boolean;
  } = {}): Promise<DriveListResponse<DriveFile>> {
    const params = new URLSearchParams();

    if (options.maxResults) {
      params.set('pageSize', options.maxResults.toString());
    }
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }
    if (options.q) {
      params.set('q', options.q);
    }
    if (options.orderBy) {
      params.set('orderBy', options.orderBy);
    }
    if (options.fields) {
      params.set('fields', options.fields);
    }
    if (options.spaces) {
      params.set('spaces', options.spaces);
    }
    if (options.corpora) {
      params.set('corpora', options.corpora);
    }
    if (options.includeItemsFromAllDrives !== undefined) {
      params.set('includeItemsFromAllDrives', options.includeItemsFromAllDrives.toString());
    }
    if (options.supportsAllDrives !== undefined) {
      params.set('supportsAllDrives', options.supportsAllDrives.toString());
    }

    const query = params.toString();
    return this.request(`/files${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single file
   */
  async getFile(
    fileId: string,
    fields = 'id,name,mimeType,createdTime,modifiedTime,owners,lastModifyingUser,shared,size,parents,webViewLink'
  ): Promise<DriveFile> {
    return this.request(`/files/${fileId}?fields=${fields}`);
  }

  /**
   * Get start page token for changes tracking
   */
  async getStartPageToken(): Promise<{ startPageToken: string }> {
    return this.request('/changes/startPageToken');
  }

  /**
   * List changes since page token
   */
  async listChanges(
    pageToken: string,
    options: {
      maxResults?: number;
      includeItemsFromAllDrives?: boolean;
      supportsAllDrives?: boolean;
      fields?: string;
    } = {}
  ): Promise<DriveListResponse<DriveChange>> {
    const params = new URLSearchParams({
      pageToken,
    });

    if (options.maxResults) {
      params.set('pageSize', options.maxResults.toString());
    }
    if (options.includeItemsFromAllDrives !== undefined) {
      params.set('includeItemsFromAllDrives', options.includeItemsFromAllDrives.toString());
    }
    if (options.supportsAllDrives !== undefined) {
      params.set('supportsAllDrives', options.supportsAllDrives.toString());
    }
    if (options.fields) {
      params.set('fields', options.fields);
    }

    return this.request(`/changes?${params.toString()}`);
  }

  /**
   * Get changes using incremental sync
   */
  async getChangesDelta(
    pageToken?: string,
    lookbackDate?: Date
  ): Promise<{
    changes: DriveChange[];
    newStartPageToken?: string;
    nextPageToken?: string;
  }> {
    // If no token, get the start token
    if (!pageToken) {
      const tokenResponse = await this.getStartPageToken();

      // For initial sync, we need to list files instead of changes
      if (lookbackDate) {
        const files = await this.getFilesModifiedSince(lookbackDate);
        return {
          changes: files.map((file) => ({
            kind: 'drive#change',
            removed: false,
            file,
            fileId: file.id,
            time: file.modifiedTime || new Date().toISOString(),
            changeType: 'file' as const,
          })),
          newStartPageToken: tokenResponse.startPageToken,
        };
      }

      return {
        changes: [],
        newStartPageToken: tokenResponse.startPageToken,
      };
    }

    const response = await this.listChanges(pageToken, {
      maxResults: 100,
      fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,createdTime,modifiedTime,owners,lastModifyingUser,shared,size,parents))',
    });

    return {
      changes: response.changes || [],
      newStartPageToken: response.newStartPageToken,
      nextPageToken: response.nextPageToken,
    };
  }

  /**
   * Get files modified since a date
   */
  async getFilesModifiedSince(since: Date): Promise<DriveFile[]> {
    const allFiles: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listFiles({
        q: `modifiedTime > '${since.toISOString()}' and trashed = false`,
        orderBy: 'modifiedTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,owners,lastModifyingUser,shared,size,parents,webViewLink)',
        maxResults: 100,
        pageToken,
      });

      allFiles.push(...(response.files || []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allFiles;
  }

  /**
   * Get file permissions
   */
  async getPermissions(fileId: string): Promise<DrivePermission[]> {
    const response = await this.request<{ permissions: DrivePermission[] }>(
      `/files/${fileId}/permissions?fields=permissions(id,type,emailAddress,domain,role,displayName,expirationTime)`
    );
    return response.permissions || [];
  }

  /**
   * Test connection by getting about info
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAbout();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Drive client instance
 */
export function createDriveClient(accessToken: string): GoogleDriveClient {
  return new GoogleDriveClient({ accessToken });
}
