/**
 * M-Files Version History Extractor
 * T173: Extract version history and version metadata for documents
 */

import { MFilesClient, MFilesObjectVersion } from '../mfilesClient.js';
import { ExtractedEvent } from '../../../base/connector.js';

export interface VersionMetadata {
  objectId: number;
  objectType: number;
  version: number;
  title: string;
  displayId: string;
  createdDate?: Date;
  lastModifiedDate?: Date;
  versionLabel?: string;
  checkedOut: boolean;
  checkedOutBy?: number;
  checkedOutAt?: Date;
  isLatest: boolean;
  fileCount: number;
  files: VersionFile[];
}

export interface VersionFile {
  id: number;
  name: string;
  extension: string;
  size: number;
  createdDate: Date;
  lastModifiedDate: Date;
}

export interface VersionHistory {
  objectId: number;
  objectType: number;
  currentVersion: number;
  totalVersions: number;
  versions: VersionMetadata[];
  firstCreated?: Date;
  lastModified?: Date;
}

export interface VersionChange {
  fromVersion: number;
  toVersion: number;
  changeDate: Date;
  changeType: 'created' | 'modified' | 'checked_out' | 'checked_in' | 'file_added' | 'file_removed' | 'file_modified';
  details?: string;
  fileChanges?: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}

/**
 * Extract version metadata from M-Files object version
 */
export function extractVersionMetadata(
  objectVersion: MFilesObjectVersion,
  isLatest: boolean = false
): VersionMetadata {
  const files: VersionFile[] = (objectVersion.Files || []).map((file) => ({
    id: file.ID,
    name: file.Name,
    extension: file.Extension,
    size: file.Size,
    createdDate: new Date(file.CreatedUtc),
    lastModifiedDate: new Date(file.LastModifiedUtc),
  }));

  return {
    objectId: objectVersion.ObjVer.ID,
    objectType: objectVersion.ObjVer.Type,
    version: objectVersion.ObjVer.Version,
    title: objectVersion.Title,
    displayId: objectVersion.DisplayID,
    createdDate: objectVersion.CreatedUtc ? new Date(objectVersion.CreatedUtc) : undefined,
    lastModifiedDate: objectVersion.LastModifiedUtc
      ? new Date(objectVersion.LastModifiedUtc)
      : undefined,
    versionLabel: objectVersion.VersionLabel,
    checkedOut: objectVersion.ObjectCheckedOut || false,
    checkedOutBy: objectVersion.ObjectCheckedOutToUserID,
    checkedOutAt: objectVersion.CheckedOutAtUtc
      ? new Date(objectVersion.CheckedOutAtUtc)
      : undefined,
    isLatest,
    fileCount: files.length,
    files,
  };
}

/**
 * Extract complete version history for an object
 */
export async function extractVersionHistory(
  client: MFilesClient,
  objectTypeId: number,
  objectId: number,
  vaultGuid: string,
  organizationId: string
): Promise<{
  history: VersionHistory;
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];

  // Get all versions
  const objectVersions = await client.getObjectVersions(objectTypeId, objectId);

  if (objectVersions.length === 0) {
    throw new Error(`No versions found for object ${objectTypeId}-${objectId}`);
  }

  // Extract metadata for each version
  const versions: VersionMetadata[] = objectVersions.map((objVer, index) =>
    extractVersionMetadata(objVer, index === objectVersions.length - 1)
  );

  // Sort by version number
  versions.sort((a, b) => a.version - b.version);

  const history: VersionHistory = {
    objectId,
    objectType: objectTypeId,
    currentVersion: versions[versions.length - 1].version,
    totalVersions: versions.length,
    versions,
    firstCreated: versions[0].createdDate,
    lastModified: versions[versions.length - 1].lastModifiedDate,
  };

  // Create version history event
  events.push({
    type: 'dms_version_history_extracted',
    timestamp: new Date(),
    targetId: `${objectTypeId}-${objectId}`,
    metadata: {
      objectId,
      objectType: objectTypeId,
      currentVersion: history.currentVersion,
      totalVersions: history.totalVersions,
      firstCreated: history.firstCreated,
      lastModified: history.lastModified,
      vaultGuid,
    },
    rawData: {
      history,
      organizationId,
    },
  });

  // Create events for each version
  for (const version of versions) {
    events.push(createVersionEvent(version, vaultGuid, organizationId));
  }

  return {
    history,
    events,
  };
}

/**
 * Analyze changes between versions
 */
export function analyzeVersionChanges(
  fromVersion: VersionMetadata,
  toVersion: VersionMetadata
): VersionChange {
  const changeDate = toVersion.lastModifiedDate || new Date();

  // Determine change type
  let changeType: VersionChange['changeType'] = 'modified';

  if (fromVersion.version === 0) {
    changeType = 'created';
  } else if (!fromVersion.checkedOut && toVersion.checkedOut) {
    changeType = 'checked_out';
  } else if (fromVersion.checkedOut && !toVersion.checkedOut) {
    changeType = 'checked_in';
  }

  // Analyze file changes
  const fromFileNames = new Set(fromVersion.files.map((f) => f.name));
  const toFileNames = new Set(toVersion.files.map((f) => f.name));

  const added = toVersion.files
    .filter((f) => !fromFileNames.has(f.name))
    .map((f) => f.name);

  const removed = fromVersion.files
    .filter((f) => !toFileNames.has(f.name))
    .map((f) => f.name);

  const modified = toVersion.files
    .filter((f) => {
      const oldFile = fromVersion.files.find((of) => of.name === f.name);
      return oldFile && (oldFile.size !== f.size || oldFile.lastModifiedDate.getTime() !== f.lastModifiedDate.getTime());
    })
    .map((f) => f.name);

  // Override change type if file changes detected
  if (added.length > 0 && removed.length === 0 && modified.length === 0) {
    changeType = 'file_added';
  } else if (removed.length > 0 && added.length === 0 && modified.length === 0) {
    changeType = 'file_removed';
  } else if (modified.length > 0 || (added.length > 0 && removed.length > 0)) {
    changeType = 'file_modified';
  }

  return {
    fromVersion: fromVersion.version,
    toVersion: toVersion.version,
    changeDate,
    changeType,
    fileChanges:
      added.length > 0 || removed.length > 0 || modified.length > 0
        ? { added, removed, modified }
        : undefined,
  };
}

/**
 * Extract all version changes for an object
 */
export function extractVersionChanges(history: VersionHistory): VersionChange[] {
  const changes: VersionChange[] = [];

  for (let i = 1; i < history.versions.length; i++) {
    const fromVersion = history.versions[i - 1];
    const toVersion = history.versions[i];

    const change = analyzeVersionChanges(fromVersion, toVersion);
    changes.push(change);
  }

  return changes;
}

/**
 * Create version event
 */
export function createVersionEvent(
  version: VersionMetadata,
  vaultGuid: string,
  organizationId: string
): ExtractedEvent {
  const eventType = version.version === 1 ? 'dms_version_created' : 'dms_version_updated';

  return {
    type: eventType,
    timestamp: version.lastModifiedDate || version.createdDate || new Date(),
    targetId: `${version.objectType}-${version.objectId}`,
    metadata: {
      objectId: version.objectId,
      objectType: version.objectType,
      version: version.version,
      title: version.title,
      displayId: version.displayId,
      versionLabel: version.versionLabel,
      fileCount: version.fileCount,
      checkedOut: version.checkedOut,
      checkedOutBy: version.checkedOutBy,
      isLatest: version.isLatest,
      vaultGuid,
    },
    rawData: {
      version,
      organizationId,
    },
  };
}

/**
 * Create version change event
 */
export function createVersionChangeEvent(
  change: VersionChange,
  objectId: number,
  objectType: number,
  title: string,
  vaultGuid: string,
  organizationId: string
): ExtractedEvent {
  return {
    type: 'dms_version_changed',
    timestamp: change.changeDate,
    targetId: `${objectType}-${objectId}`,
    metadata: {
      objectId,
      objectType,
      fromVersion: change.fromVersion,
      toVersion: change.toVersion,
      changeType: change.changeType,
      title,
      fileChanges: change.fileChanges,
      vaultGuid,
    },
    rawData: {
      change,
      organizationId,
    },
  };
}

/**
 * Get version statistics
 */
export function getVersionStatistics(history: VersionHistory): {
  totalVersions: number;
  averageVersionsPerMonth: number;
  oldestVersion: Date | undefined;
  newestVersion: Date | undefined;
  currentlyCheckedOut: boolean;
  fileChangeCount: number;
} {
  const changes = extractVersionChanges(history);
  const fileChangeCount = changes.filter(
    (c) => c.fileChanges && (c.fileChanges.added.length > 0 || c.fileChanges.removed.length > 0 || c.fileChanges.modified.length > 0)
  ).length;

  let averageVersionsPerMonth = 0;
  if (history.firstCreated && history.lastModified) {
    const monthsDiff =
      (history.lastModified.getTime() - history.firstCreated.getTime()) /
      (1000 * 60 * 60 * 24 * 30);
    if (monthsDiff > 0) {
      averageVersionsPerMonth = history.totalVersions / monthsDiff;
    }
  }

  return {
    totalVersions: history.totalVersions,
    averageVersionsPerMonth: Math.round(averageVersionsPerMonth * 100) / 100,
    oldestVersion: history.firstCreated,
    newestVersion: history.lastModified,
    currentlyCheckedOut: history.versions[history.versions.length - 1]?.checkedOut || false,
    fileChangeCount,
  };
}

/**
 * Extract version history for multiple objects
 */
export async function extractMultipleVersionHistories(
  client: MFilesClient,
  objectTypeId: number,
  objectIds: number[],
  vaultGuid: string,
  organizationId: string
): Promise<{
  histories: VersionHistory[];
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];
  const histories: VersionHistory[] = [];

  for (const objectId of objectIds) {
    try {
      const result = await extractVersionHistory(
        client,
        objectTypeId,
        objectId,
        vaultGuid,
        organizationId
      );

      histories.push(result.history);
      events.push(...result.events);

      // Add change events
      const changes = extractVersionChanges(result.history);
      for (const change of changes) {
        events.push(
          createVersionChangeEvent(
            change,
            objectId,
            objectTypeId,
            result.history.versions[0]?.title || '',
            vaultGuid,
            organizationId
          )
        );
      }
    } catch (error) {
      console.error(`Failed to extract version history for ${objectTypeId}-${objectId}:`, error);
    }
  }

  return {
    histories,
    events,
  };
}

/**
 * Find objects with specific version characteristics
 */
export function filterByVersionCharacteristics(
  histories: VersionHistory[],
  criteria: {
    minVersions?: number;
    maxVersions?: number;
    checkedOut?: boolean;
    hasFileChanges?: boolean;
    modifiedSince?: Date;
  }
): VersionHistory[] {
  return histories.filter((history) => {
    if (criteria.minVersions !== undefined && history.totalVersions < criteria.minVersions) {
      return false;
    }

    if (criteria.maxVersions !== undefined && history.totalVersions > criteria.maxVersions) {
      return false;
    }

    if (criteria.checkedOut !== undefined) {
      const latestVersion = history.versions[history.versions.length - 1];
      if (latestVersion.checkedOut !== criteria.checkedOut) {
        return false;
      }
    }

    if (criteria.hasFileChanges !== undefined && criteria.hasFileChanges) {
      const changes = extractVersionChanges(history);
      const hasChanges = changes.some((c) => c.fileChanges);
      if (!hasChanges) {
        return false;
      }
    }

    if (criteria.modifiedSince && history.lastModified) {
      if (history.lastModified < criteria.modifiedSince) {
        return false;
      }
    }

    return true;
  });
}
