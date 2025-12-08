/**
 * Docuware Document Version History Extractor
 * Task: T167
 * Extracts document version history and version comparison metadata
 */

import { DocuwareClient, DocuwareVersion } from '../docuwareClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface VersionExtractionOptions {
  organizationId: string;
  cabinetId: string;
  documentIds?: number[];
  includeComparison?: boolean;
}

export interface VersionExtractionResult {
  events: ExtractedEvent[];
  stats: {
    totalVersions: number;
    documentsWithVersions: number;
    averageVersionsPerDocument: number;
    totalSizeChange: number;
    versionsWithComments: number;
    byCreator: Record<string, number>;
  };
}

export interface VersionComparison {
  fromVersion: number;
  toVersion: number;
  sizeChange: number;
  sizeChangePercent: number;
  timeDifference: number;
  creator: string;
  hasComment: boolean;
}

/**
 * Calculate version comparison metadata
 */
function compareVersions(
  previousVersion: DocuwareVersion,
  currentVersion: DocuwareVersion
): VersionComparison {
  const sizeChange = currentVersion.FileSize - previousVersion.FileSize;
  const sizeChangePercent = previousVersion.FileSize > 0
    ? (sizeChange / previousVersion.FileSize) * 100
    : 0;

  const timeDifference = new Date(currentVersion.Created).getTime() -
    new Date(previousVersion.Created).getTime();

  return {
    fromVersion: previousVersion.Version,
    toVersion: currentVersion.Version,
    sizeChange,
    sizeChangePercent,
    timeDifference,
    creator: currentVersion.CreatedBy,
    hasComment: !!currentVersion.Comment,
  };
}

/**
 * Convert Docuware version to ExtractedEvent
 */
export function versionToEvent(
  version: DocuwareVersion,
  cabinetId: string,
  organizationId: string,
  previousVersion?: DocuwareVersion
): ExtractedEvent {
  const timestamp = new Date(version.Created);
  const comparison = previousVersion
    ? compareVersions(previousVersion, version)
    : null;

  return {
    externalId: `docuware-version-${cabinetId}-${version.DocumentId}-v${version.Version}`,
    source: 'docuware',
    eventType: 'dms.version.created',
    timestamp,
    data: {
      documentId: version.DocumentId,
      cabinetId,
      version: version.Version,
      created: version.Created,
      createdBy: version.CreatedBy,
      comment: version.Comment,
      fileSize: version.FileSize,
      hasComment: !!version.Comment,
      // Comparison data if available
      ...(comparison && {
        comparison: {
          previousVersion: comparison.fromVersion,
          sizeChange: comparison.sizeChange,
          sizeChangePercent: comparison.sizeChangePercent,
          timeSincePreviousMs: comparison.timeDifference,
        },
      }),
    },
    metadata: {
      organizationId,
      objectType: 'DocumentVersion',
      source: 'docuware',
    },
  };
}

/**
 * Create version history event (summary of all versions)
 */
export function versionHistoryToEvent(
  versions: DocuwareVersion[],
  cabinetId: string,
  organizationId: string
): ExtractedEvent {
  const latestVersion = versions[versions.length - 1];
  const timestamp = new Date(latestVersion.Created);

  const totalSizeChange = versions.length > 1
    ? latestVersion.FileSize - versions[0].FileSize
    : 0;

  const creators = new Set(versions.map(v => v.CreatedBy));
  const versionsWithComments = versions.filter(v => v.Comment).length;

  const versionChanges = versions.slice(1).map((version, index) => {
    const previous = versions[index];
    return compareVersions(previous, version);
  });

  return {
    externalId: `docuware-version-history-${cabinetId}-${latestVersion.DocumentId}`,
    source: 'docuware',
    eventType: 'dms.version.history',
    timestamp,
    data: {
      documentId: latestVersion.DocumentId,
      cabinetId,
      totalVersions: versions.length,
      currentVersion: latestVersion.Version,
      firstVersion: versions[0].Version,
      firstCreated: versions[0].Created,
      latestCreated: latestVersion.Created,
      totalSizeChange,
      uniqueCreators: creators.size,
      versionsWithComments,
      // Version timeline
      versions: versions.map(v => ({
        version: v.Version,
        created: v.Created,
        createdBy: v.CreatedBy,
        fileSize: v.FileSize,
        hasComment: !!v.Comment,
      })),
      // Version comparisons
      versionChanges: versionChanges.map(vc => ({
        fromVersion: vc.fromVersion,
        toVersion: vc.toVersion,
        sizeChange: vc.sizeChange,
        sizeChangePercent: vc.sizeChangePercent,
        timeDifferenceMs: vc.timeDifference,
        creator: vc.creator,
        hasComment: vc.hasComment,
      })),
    },
    metadata: {
      organizationId,
      objectType: 'VersionHistory',
      source: 'docuware',
    },
  };
}

/**
 * Extract versions for specific document
 */
export async function extractDocumentVersions(
  client: DocuwareClient,
  cabinetId: string,
  documentId: number,
  organizationId: string,
  includeComparison = true
): Promise<ExtractedEvent[]> {
  const events: ExtractedEvent[] = [];

  try {
    const versions = await client.getDocumentVersions(cabinetId, documentId);

    if (versions.length === 0) {
      return events;
    }

    // Create individual version events
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];
      const previousVersion = i > 0 ? versions[i - 1] : undefined;

      events.push(
        versionToEvent(
          version,
          cabinetId,
          organizationId,
          includeComparison ? previousVersion : undefined
        )
      );
    }

    // Create version history summary event
    if (versions.length > 1) {
      events.push(versionHistoryToEvent(versions, cabinetId, organizationId));
    }
  } catch (error) {
    console.error(`Error extracting versions for document ${documentId}:`, error);
  }

  return events;
}

/**
 * Extract versions from multiple documents
 */
export async function extractVersions(
  client: DocuwareClient,
  options: VersionExtractionOptions
): Promise<VersionExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    totalVersions: 0,
    documentsWithVersions: 0,
    averageVersionsPerDocument: 0,
    totalSizeChange: 0,
    versionsWithComments: 0,
    byCreator: {} as Record<string, number>,
  };

  try {
    let documentIds = options.documentIds;

    // If no document IDs provided, get recent documents
    if (!documentIds || documentIds.length === 0) {
      const docsResult = await client.getDocuments(options.cabinetId, {
        count: 100,
      });
      documentIds = docsResult.Items.map(doc => doc.Id);
    }

    for (const documentId of documentIds) {
      const docEvents = await extractDocumentVersions(
        client,
        options.cabinetId,
        documentId,
        options.organizationId,
        options.includeComparison
      );

      if (docEvents.length > 0) {
        events.push(...docEvents);
        stats.documentsWithVersions++;

        // Count individual version events
        const versionEvents = docEvents.filter(e => e.eventType === 'dms.version.created');
        stats.totalVersions += versionEvents.length;

        // Update stats
        for (const event of versionEvents) {
          const creator = event.data.createdBy as string;
          if (creator) {
            stats.byCreator[creator] = (stats.byCreator[creator] || 0) + 1;
          }

          if (event.data.hasComment) {
            stats.versionsWithComments++;
          }

          if (event.data.comparison) {
            const comp = event.data.comparison as any;
            stats.totalSizeChange += comp.sizeChange || 0;
          }
        }
      }
    }

    stats.averageVersionsPerDocument = stats.documentsWithVersions > 0
      ? stats.totalVersions / stats.documentsWithVersions
      : 0;

  } catch (error) {
    console.error('Error extracting versions:', error);
    // Don't throw error as versions might not be available for all documents
    console.warn('Version history may not be available for some documents');
  }

  return { events, stats };
}

/**
 * Calculate version statistics from extracted events
 */
export function calculateVersionStats(events: ExtractedEvent[]): {
  versionEvents: number;
  historyEvents: number;
  averageSizeChange: number;
  averageTimeBetweenVersions: number;
  mostActiveDocument: { documentId: number; versions: number } | null;
  mostActiveCreator: { creator: string; versions: number } | null;
  commentRate: number;
} {
  const versionEvents = events.filter(e => e.eventType === 'dms.version.created');
  const historyEvents = events.filter(e => e.eventType === 'dms.version.history');

  const sizeChanges = versionEvents
    .filter(e => e.data.comparison)
    .map(e => (e.data.comparison as any).sizeChange as number);

  const averageSizeChange = sizeChanges.length > 0
    ? sizeChanges.reduce((sum, c) => sum + c, 0) / sizeChanges.length
    : 0;

  const timeDifferences = versionEvents
    .filter(e => e.data.comparison)
    .map(e => (e.data.comparison as any).timeSincePreviousMs as number);

  const averageTimeBetweenVersions = timeDifferences.length > 0
    ? timeDifferences.reduce((sum, t) => sum + t, 0) / timeDifferences.length
    : 0;

  // Find most active document
  const docVersionCounts: Record<number, number> = {};
  for (const event of versionEvents) {
    const docId = event.data.documentId as number;
    docVersionCounts[docId] = (docVersionCounts[docId] || 0) + 1;
  }

  let mostActiveDocument: { documentId: number; versions: number } | null = null;
  for (const [docId, count] of Object.entries(docVersionCounts)) {
    if (!mostActiveDocument || count > mostActiveDocument.versions) {
      mostActiveDocument = { documentId: parseInt(docId), versions: count };
    }
  }

  // Find most active creator
  const creatorVersionCounts: Record<string, number> = {};
  for (const event of versionEvents) {
    const creator = event.data.createdBy as string;
    if (creator) {
      creatorVersionCounts[creator] = (creatorVersionCounts[creator] || 0) + 1;
    }
  }

  let mostActiveCreator: { creator: string; versions: number } | null = null;
  for (const [creator, count] of Object.entries(creatorVersionCounts)) {
    if (!mostActiveCreator || count > mostActiveCreator.versions) {
      mostActiveCreator = { creator, versions: count };
    }
  }

  const versionsWithComments = versionEvents.filter(e => e.data.hasComment).length;
  const commentRate = versionEvents.length > 0
    ? (versionsWithComments / versionEvents.length) * 100
    : 0;

  return {
    versionEvents: versionEvents.length,
    historyEvents: historyEvents.length,
    averageSizeChange,
    averageTimeBetweenVersions,
    mostActiveDocument,
    mostActiveCreator,
    commentRate,
  };
}
