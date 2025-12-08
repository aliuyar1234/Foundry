/**
 * Docuware Document Metadata Extractor
 * Task: T164
 * Extracts document metadata and index fields (no content extraction)
 */

import { DocuwareClient, DocuwareDocument, DocuwareField } from '../docuwareClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface DocumentExtractionOptions {
  organizationId: string;
  cabinetIds?: string[];
  modifiedSince?: Date;
  includeFields?: boolean;
  maxDocuments?: number;
}

export interface DocumentExtractionResult {
  events: ExtractedEvent[];
  stats: {
    totalDocuments: number;
    byCabinet: Record<string, number>;
    byContentType: Record<string, number>;
    totalSize: number;
    averageSize: number;
  };
}

/**
 * Determine document category from content type
 */
function getDocumentCategory(contentType: string): string {
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('image')) return 'image';
  if (contentType.includes('word') || contentType.includes('document')) return 'document';
  if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'spreadsheet';
  if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'presentation';
  if (contentType.includes('text')) return 'text';
  return 'other';
}

/**
 * Extract field values into structured format
 */
function extractFieldValues(fields: DocuwareField[]): Record<string, any> {
  const fieldValues: Record<string, any> = {};

  for (const field of fields) {
    if (!field.IsNull) {
      fieldValues[field.FieldName] = field.FieldValue;
    }
  }

  return fieldValues;
}

/**
 * Get field metadata
 */
function getFieldMetadata(fields: DocuwareField[]): Array<{
  name: string;
  label: string;
  type: string;
  hasValue: boolean;
}> {
  return fields.map(field => ({
    name: field.FieldName,
    label: field.FieldLabel,
    type: field.ItemElementName,
    hasValue: !field.IsNull,
  }));
}

/**
 * Convert Docuware document to ExtractedEvent
 */
export function documentToEvent(
  document: DocuwareDocument,
  cabinetId: string,
  organizationId: string,
  eventType: 'dms.document.created' | 'dms.document.modified' = 'dms.document.modified'
): ExtractedEvent {
  const timestamp = document.LastModified
    ? new Date(document.LastModified)
    : document.Created
      ? new Date(document.Created)
      : new Date();

  const fieldValues = extractFieldValues(document.Fields);
  const fieldMetadata = getFieldMetadata(document.Fields);

  return {
    externalId: `docuware-doc-${cabinetId}-${document.Id}`,
    source: 'docuware',
    eventType,
    timestamp,
    data: {
      documentId: document.Id,
      cabinetId,
      title: document.Title || fieldValues.DOCUMENT_TITLE || `Document ${document.Id}`,
      contentType: document.ContentType,
      category: getDocumentCategory(document.ContentType),
      fileSize: document.FileSize,
      created: document.Created,
      createdBy: document.CreatedBy,
      lastModified: document.LastModified,
      lastModifiedBy: document.LastModifiedBy,
      version: document.Version || 1,
      pages: document.Pages,
      // Index fields as structured data
      fields: fieldValues,
      fieldCount: document.Fields.length,
      fieldMetadata,
    },
    metadata: {
      organizationId,
      objectType: 'Document',
      source: 'docuware',
      hasContent: false, // Metadata only, no content extraction
    },
  };
}

/**
 * Extract documents from a cabinet
 */
export async function extractDocumentsFromCabinet(
  client: DocuwareClient,
  cabinetId: string,
  organizationId: string,
  options?: {
    modifiedSince?: Date;
    maxDocuments?: number;
  }
): Promise<ExtractedEvent[]> {
  const events: ExtractedEvent[] = [];

  try {
    let documents: DocuwareDocument[] = [];

    if (options?.modifiedSince) {
      documents = await client.getDocumentsModifiedSince(cabinetId, options.modifiedSince);
    } else {
      const result = await client.getDocuments(cabinetId, {
        count: options?.maxDocuments || 1000,
      });
      documents = result.Items || [];
    }

    for (const document of documents) {
      // Determine if it's a new document based on created/modified dates
      const createdDate = document.Created ? new Date(document.Created) : null;
      const modifiedDate = document.LastModified ? new Date(document.LastModified) : null;

      let eventType: 'dms.document.created' | 'dms.document.modified' = 'dms.document.modified';

      // If created and modified are within 1 minute, consider it new
      if (createdDate && modifiedDate) {
        const diff = Math.abs(modifiedDate.getTime() - createdDate.getTime());
        if (diff < 60000) {
          eventType = 'dms.document.created';
        }
      }

      events.push(documentToEvent(document, cabinetId, organizationId, eventType));
    }
  } catch (error) {
    console.error(`Error extracting documents from cabinet ${cabinetId}:`, error);
    throw new Error(`Failed to extract documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return events;
}

/**
 * Extract documents from multiple cabinets
 */
export async function extractDocuments(
  client: DocuwareClient,
  options: DocumentExtractionOptions
): Promise<DocumentExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    totalDocuments: 0,
    byCabinet: {} as Record<string, number>,
    byContentType: {} as Record<string, number>,
    totalSize: 0,
    averageSize: 0,
  };

  try {
    // Get all cabinets if not specified
    let cabinetIds = options.cabinetIds;
    if (!cabinetIds || cabinetIds.length === 0) {
      const cabinets = await client.getCabinets();
      cabinetIds = cabinets
        .filter(c => !c.IsBasket && !c.Archived)
        .map(c => c.Id);
    }

    // Extract documents from each cabinet
    for (const cabinetId of cabinetIds) {
      const cabinetEvents = await extractDocumentsFromCabinet(
        client,
        cabinetId,
        options.organizationId,
        {
          modifiedSince: options.modifiedSince,
          maxDocuments: options.maxDocuments,
        }
      );

      events.push(...cabinetEvents);

      // Update cabinet stats
      stats.byCabinet[cabinetId] = cabinetEvents.length;

      // Update content type stats and size
      for (const event of cabinetEvents) {
        const contentType = event.data.contentType as string;
        if (contentType) {
          stats.byContentType[contentType] = (stats.byContentType[contentType] || 0) + 1;
        }

        const fileSize = event.data.fileSize as number;
        if (fileSize) {
          stats.totalSize += fileSize;
        }
      }
    }

    stats.totalDocuments = events.length;
    stats.averageSize = stats.totalDocuments > 0
      ? Math.round(stats.totalSize / stats.totalDocuments)
      : 0;

  } catch (error) {
    console.error('Error extracting documents:', error);
    throw new Error(`Failed to extract documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { events, stats };
}

/**
 * Extract document with full field details
 */
export async function extractDocumentDetails(
  client: DocuwareClient,
  cabinetId: string,
  documentId: number,
  organizationId: string
): Promise<ExtractedEvent> {
  try {
    const document = await client.getDocument(cabinetId, documentId);
    return documentToEvent(document, cabinetId, organizationId);
  } catch (error) {
    throw new Error(`Failed to extract document details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate document statistics from extracted events
 */
export function calculateDocumentStats(events: ExtractedEvent[]): {
  created: number;
  modified: number;
  byCategory: Record<string, number>;
  byFieldCount: Record<string, number>;
  uniqueCreators: number;
  uniqueModifiers: number;
  totalPages: number;
} {
  const created = events.filter(e => e.eventType === 'dms.document.created').length;
  const modified = events.filter(e => e.eventType === 'dms.document.modified').length;

  const byCategory: Record<string, number> = {};
  const byFieldCount: Record<string, number> = {};
  const creators = new Set<string>();
  const modifiers = new Set<string>();
  let totalPages = 0;

  for (const event of events) {
    const category = event.data.category as string;
    if (category) {
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    const fieldCount = event.data.fieldCount as number;
    if (fieldCount !== undefined) {
      const bucket = `${Math.floor(fieldCount / 5) * 5}-${Math.floor(fieldCount / 5) * 5 + 4}`;
      byFieldCount[bucket] = (byFieldCount[bucket] || 0) + 1;
    }

    if (event.data.createdBy) {
      creators.add(event.data.createdBy as string);
    }

    if (event.data.lastModifiedBy) {
      modifiers.add(event.data.lastModifiedBy as string);
    }

    if (event.data.pages) {
      totalPages += event.data.pages as number;
    }
  }

  return {
    created,
    modified,
    byCategory,
    byFieldCount,
    uniqueCreators: creators.size,
    uniqueModifiers: modifiers.size,
    totalPages,
  };
}
