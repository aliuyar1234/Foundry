/**
 * M-Files Document/Object Metadata Extractor
 * T171: Extract document and object metadata, properties, classes, and types
 */

import {
  MFilesClient,
  MFilesObjectVersion,
  MFilesPropertyValue,
  MFilesClass,
  MFilesPropertyDef,
} from '../mfilesClient.js';
import { ExtractedEvent } from '../../../base/connector.js';

export interface DocumentMetadata {
  objectId: number;
  objectType: number;
  objectTypeDisplay: string;
  version: number;
  title: string;
  displayId: string;
  classId: number;
  className?: string;
  createdDate?: Date;
  lastModifiedDate?: Date;
  checkedOut: boolean;
  checkedOutBy?: number;
  isSingleFile: boolean;
  fileCount: number;
  files: DocumentFile[];
  properties: DocumentProperty[];
}

export interface DocumentFile {
  id: number;
  name: string;
  extension: string;
  size: number;
  createdDate: Date;
  lastModifiedDate: Date;
}

export interface DocumentProperty {
  propertyDefId: number;
  propertyName?: string;
  dataType: number;
  dataTypeName: string;
  value: unknown;
  displayValue?: string;
  hasValue: boolean;
}

/**
 * Extract document metadata from M-Files object
 */
export async function extractDocumentMetadata(
  client: MFilesClient,
  objectVersion: MFilesObjectVersion,
  options: {
    classLookup?: Map<number, MFilesClass>;
    propertyLookup?: Map<number, MFilesPropertyDef>;
  } = {}
): Promise<DocumentMetadata> {
  const files: DocumentFile[] = (objectVersion.Files || []).map((file) => ({
    id: file.ID,
    name: file.Name,
    extension: file.Extension,
    size: file.Size,
    createdDate: new Date(file.CreatedUtc),
    lastModifiedDate: new Date(file.LastModifiedUtc),
  }));

  const properties: DocumentProperty[] = await extractProperties(
    objectVersion.Properties || [],
    options.propertyLookup
  );

  const className = options.classLookup?.get(objectVersion.Class)?.Name;

  return {
    objectId: objectVersion.ObjVer.ID,
    objectType: objectVersion.ObjVer.Type,
    objectTypeDisplay: '', // Will be filled by caller if needed
    version: objectVersion.ObjVer.Version,
    title: objectVersion.Title,
    displayId: objectVersion.DisplayID,
    classId: objectVersion.Class,
    className,
    createdDate: objectVersion.CreatedUtc ? new Date(objectVersion.CreatedUtc) : undefined,
    lastModifiedDate: objectVersion.LastModifiedUtc
      ? new Date(objectVersion.LastModifiedUtc)
      : undefined,
    checkedOut: objectVersion.ObjectCheckedOut || false,
    checkedOutBy: objectVersion.ObjectCheckedOutToUserID,
    isSingleFile: objectVersion.SingleFile || false,
    fileCount: files.length,
    files,
    properties,
  };
}

/**
 * Extract properties from M-Files property values
 */
export async function extractProperties(
  propertyValues: MFilesPropertyValue[],
  propertyLookup?: Map<number, MFilesPropertyDef>
): Promise<DocumentProperty[]> {
  return propertyValues.map((propVal) => {
    const propertyDef = propertyLookup?.get(propVal.PropertyDef);
    const typedValue = propVal.TypedValue;

    return {
      propertyDefId: propVal.PropertyDef,
      propertyName: propertyDef?.Name,
      dataType: typedValue.DataType,
      dataTypeName: getDataTypeName(typedValue.DataType),
      value: extractPropertyValue(typedValue),
      displayValue: typedValue.DisplayValue,
      hasValue: typedValue.HasValue,
    };
  });
}

/**
 * Extract the actual value from typed value
 */
function extractPropertyValue(typedValue: MFilesPropertyValue['TypedValue']): unknown {
  if (!typedValue.HasValue) {
    return null;
  }

  // Handle lookup values
  if (typedValue.Lookup) {
    return {
      id: typedValue.Lookup.Item,
      displayValue: typedValue.Lookup.DisplayValue,
    };
  }

  // Handle multi-select lookup values
  if (typedValue.Lookups) {
    return typedValue.Lookups.map((lookup) => ({
      id: lookup.Item,
      displayValue: lookup.DisplayValue,
    }));
  }

  return typedValue.Value;
}

/**
 * Map M-Files data type to human-readable format
 */
function getDataTypeName(dataType: number): string {
  const dataTypes: Record<number, string> = {
    1: 'Text',
    2: 'Integer',
    3: 'Real',
    5: 'Date',
    6: 'Time',
    7: 'Timestamp',
    8: 'Boolean',
    9: 'Lookup',
    10: 'MultiSelectLookup',
    11: 'Integer64',
    12: 'FILETIME',
    13: 'MultiLineText',
    14: 'ACL',
  };
  return dataTypes[dataType] || `Unknown(${dataType})`;
}

/**
 * Create document created event
 */
export function createDocumentCreatedEvent(
  metadata: DocumentMetadata,
  vaultGuid: string,
  organizationId: string
): ExtractedEvent {
  return {
    type: 'dms_document_created',
    timestamp: metadata.createdDate || new Date(),
    metadata: {
      objectId: metadata.objectId,
      objectType: metadata.objectType,
      version: metadata.version,
      title: metadata.title,
      displayId: metadata.displayId,
      classId: metadata.classId,
      className: metadata.className,
      fileCount: metadata.fileCount,
      vaultGuid,
    },
    rawData: {
      metadata,
      organizationId,
    },
  };
}

/**
 * Create document modified event
 */
export function createDocumentModifiedEvent(
  metadata: DocumentMetadata,
  vaultGuid: string,
  organizationId: string
): ExtractedEvent {
  return {
    type: 'dms_document_modified',
    timestamp: metadata.lastModifiedDate || new Date(),
    metadata: {
      objectId: metadata.objectId,
      objectType: metadata.objectType,
      version: metadata.version,
      title: metadata.title,
      displayId: metadata.displayId,
      classId: metadata.classId,
      className: metadata.className,
      fileCount: metadata.fileCount,
      vaultGuid,
    },
    rawData: {
      metadata,
      organizationId,
    },
  };
}

/**
 * Create document checkout event
 */
export function createDocumentCheckoutEvent(
  metadata: DocumentMetadata,
  vaultGuid: string,
  organizationId: string
): ExtractedEvent | null {
  if (!metadata.checkedOut) {
    return null;
  }

  return {
    type: 'dms_document_checked_out',
    timestamp: new Date(),
    actorId: metadata.checkedOutBy?.toString(),
    targetId: `${metadata.objectType}-${metadata.objectId}`,
    metadata: {
      objectId: metadata.objectId,
      objectType: metadata.objectType,
      title: metadata.title,
      displayId: metadata.displayId,
      checkedOutBy: metadata.checkedOutBy,
      vaultGuid,
    },
    rawData: {
      organizationId,
    },
  };
}

/**
 * Extract documents from M-Files with events
 */
export async function extractDocuments(
  client: MFilesClient,
  objectTypeId: number,
  vaultGuid: string,
  organizationId: string,
  options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}
): Promise<{
  documents: DocumentMetadata[];
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];

  // Get objects of specified type
  const objects = await client.getObjectsByType(objectTypeId, options);

  // Get lookup data for classes and properties
  const [classes, propertyDefs] = await Promise.all([
    client.getClasses(),
    client.getPropertyDefinitions(),
  ]);

  const classLookup = new Map(classes.map((c) => [c.ID, c]));
  const propertyLookup = new Map(propertyDefs.map((p) => [p.ID, p]));

  // Extract metadata for each document
  const documents: DocumentMetadata[] = [];

  for (const obj of objects) {
    const metadata = await extractDocumentMetadata(client, obj, {
      classLookup,
      propertyLookup,
    });

    documents.push(metadata);

    // Create appropriate events based on document state
    if (metadata.createdDate) {
      events.push(createDocumentCreatedEvent(metadata, vaultGuid, organizationId));
    }

    if (metadata.lastModifiedDate && metadata.version > 1) {
      events.push(createDocumentModifiedEvent(metadata, vaultGuid, organizationId));
    }

    const checkoutEvent = createDocumentCheckoutEvent(metadata, vaultGuid, organizationId);
    if (checkoutEvent) {
      events.push(checkoutEvent);
    }
  }

  return {
    documents,
    events,
  };
}

/**
 * Extract specific property value by property definition ID
 */
export function getPropertyValue(
  metadata: DocumentMetadata,
  propertyDefId: number
): DocumentProperty | undefined {
  return metadata.properties.find((p) => p.propertyDefId === propertyDefId);
}

/**
 * Extract all documents of a specific class
 */
export async function extractDocumentsByClass(
  client: MFilesClient,
  classId: number,
  vaultGuid: string,
  organizationId: string,
  options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}
): Promise<{
  documents: DocumentMetadata[];
  events: ExtractedEvent[];
}> {
  // Search for objects of this class across all object types
  const searchQuery = {
    SearchConditions: [
      {
        ConditionType: 5, // Equal
        Expression: {
          DataPropertyValuePropertyDef: 100, // Class property
        },
        TypedValue: {
          DataType: 9, // Lookup
          Lookup: {
            Item: classId,
          },
        },
      },
    ],
  };

  if (options.modifiedSince) {
    searchQuery.SearchConditions.push({
      ConditionType: 1, // Greater than or equal
      Expression: {
        DataPropertyValuePropertyDef: 21, // Last modified
      },
      TypedValue: {
        DataType: 5, // Date
        Value: options.modifiedSince.toISOString(),
      },
    });
  }

  const objects = await client.searchObjects(searchQuery);
  const events: ExtractedEvent[] = [];

  // Get lookup data
  const [classes, propertyDefs] = await Promise.all([
    client.getClasses(),
    client.getPropertyDefinitions(),
  ]);

  const classLookup = new Map(classes.map((c) => [c.ID, c]));
  const propertyLookup = new Map(propertyDefs.map((p) => [p.ID, p]));

  // Extract metadata
  const documents: DocumentMetadata[] = [];

  for (const obj of objects) {
    const metadata = await extractDocumentMetadata(client, obj, {
      classLookup,
      propertyLookup,
    });

    documents.push(metadata);

    // Create events
    if (metadata.lastModifiedDate) {
      events.push(createDocumentModifiedEvent(metadata, vaultGuid, organizationId));
    }
  }

  return {
    documents,
    events,
  };
}

/**
 * Get document statistics
 */
export function getDocumentStatistics(documents: DocumentMetadata[]): {
  totalDocuments: number;
  totalFiles: number;
  checkedOutCount: number;
  singleFileCount: number;
  multiFileCount: number;
  byClass: Record<string, number>;
} {
  const byClass: Record<string, number> = {};

  documents.forEach((doc) => {
    const className = doc.className || 'Unknown';
    byClass[className] = (byClass[className] || 0) + 1;
  });

  return {
    totalDocuments: documents.length,
    totalFiles: documents.reduce((sum, doc) => sum + doc.fileCount, 0),
    checkedOutCount: documents.filter((doc) => doc.checkedOut).length,
    singleFileCount: documents.filter((doc) => doc.isSingleFile).length,
    multiFileCount: documents.filter((doc) => !doc.isSingleFile && doc.fileCount > 0).length,
    byClass,
  };
}
