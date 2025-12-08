/**
 * M-Files Vault Discovery and Metadata Extractor
 * T170: Extract vault information and structure
 */

import { MFilesClient, MFilesObjectType, MFilesClass, MFilesPropertyDef, MFilesWorkflow } from '../mfilesClient.js';
import { ExtractedEvent } from '../../../base/connector.js';

export interface VaultMetadata {
  vaultGuid: string;
  vaultName: string;
  objectTypeCount: number;
  classCount: number;
  propertyCount: number;
  workflowCount: number;
  objectTypes: string[];
  classes: string[];
  workflows: string[];
}

export interface VaultStructure {
  objectTypes: MFilesObjectType[];
  classes: MFilesClass[];
  propertyDefs: MFilesPropertyDef[];
  workflows: MFilesWorkflow[];
}

/**
 * Discover available vaults and their metadata
 */
export async function extractVaultMetadata(
  client: MFilesClient,
  organizationId: string
): Promise<{
  metadata: VaultMetadata;
  structure: VaultStructure;
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];

  // Get vault information
  const vaultInfo = await client.getVaultInfo();

  // Get vault structure
  const structure = await client.getVaultStructure();

  const metadata: VaultMetadata = {
    vaultGuid: vaultInfo.GUID,
    vaultName: vaultInfo.Name,
    objectTypeCount: structure.objectTypes.length,
    classCount: structure.classes.length,
    propertyCount: structure.propertyDefs.length,
    workflowCount: structure.workflows.length,
    objectTypes: structure.objectTypes.map((ot) => ot.Name),
    classes: structure.classes.map((c) => c.Name),
    workflows: structure.workflows.map((w) => w.Name),
  };

  // Create vault discovery event
  events.push({
    type: 'dms_vault_discovered',
    timestamp: new Date(),
    metadata: {
      vaultGuid: vaultInfo.GUID,
      vaultName: vaultInfo.Name,
      vaultVersion: vaultInfo.Version,
      objectTypeCount: metadata.objectTypeCount,
      classCount: metadata.classCount,
      propertyCount: metadata.propertyCount,
      workflowCount: metadata.workflowCount,
    },
    rawData: {
      vaultInfo,
      organizationId,
    },
  });

  // Create events for each object type
  for (const objectType of structure.objectTypes) {
    events.push({
      type: 'dms_object_type_discovered',
      timestamp: new Date(),
      metadata: {
        objectTypeId: objectType.ID,
        objectTypeName: objectType.Name,
        objectTypeNamePlural: objectType.NamePlural,
        realObjectType: objectType.RealObjectType,
        ownerType: objectType.OwnerType,
        vaultGuid: vaultInfo.GUID,
      },
      rawData: {
        objectType,
        organizationId,
      },
    });
  }

  // Create events for each class
  for (const classInfo of structure.classes) {
    events.push({
      type: 'dms_class_discovered',
      timestamp: new Date(),
      metadata: {
        classId: classInfo.ID,
        className: classInfo.Name,
        classNamePlural: classInfo.NamePlural,
        objectType: classInfo.ObjectType,
        predefined: classInfo.Predefined,
        vaultGuid: vaultInfo.GUID,
      },
      rawData: {
        classInfo,
        organizationId,
      },
    });
  }

  return {
    metadata,
    structure,
    events,
  };
}

/**
 * Map M-Files data type to human-readable format
 */
export function getDataTypeName(dataType: number): string {
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
 * Extract property definitions metadata
 */
export function extractPropertyDefinitionsMetadata(
  propertyDefs: MFilesPropertyDef[]
): Array<{
  id: number;
  name: string;
  dataType: string;
  dataTypeId: number;
  hasValueList: boolean;
  valueListId?: number;
}> {
  return propertyDefs.map((prop) => ({
    id: prop.ID,
    name: prop.Name,
    dataType: getDataTypeName(prop.DataType),
    dataTypeId: prop.DataType,
    hasValueList: prop.ValueList !== undefined && prop.ValueList > 0,
    valueListId: prop.ValueList,
  }));
}

/**
 * Extract workflow metadata with states
 */
export async function extractWorkflowMetadata(
  client: MFilesClient,
  workflowId: number
): Promise<{
  workflow: MFilesWorkflow;
  states: Array<{
    id: number;
    name: string;
    workflowId: number;
  }>;
}> {
  const workflow = await client.getWorkflow(workflowId);
  const workflowStates = await client.getWorkflowStates(workflowId);

  return {
    workflow,
    states: workflowStates.map((state) => ({
      id: state.ID,
      name: state.Name,
      workflowId: state.Workflow,
    })),
  };
}

/**
 * Get object type statistics
 */
export async function getObjectTypeStatistics(
  client: MFilesClient,
  objectTypeId: number
): Promise<{
  objectTypeId: number;
  objectTypeName: string;
  totalObjects: number;
}> {
  const objectType = await client.getObjectType(objectTypeId);
  const objects = await client.getObjectsByType(objectTypeId);

  return {
    objectTypeId: objectType.ID,
    objectTypeName: objectType.Name,
    totalObjects: objects.length,
  };
}

/**
 * Extract vault capabilities and features
 */
export function extractVaultCapabilities(structure: VaultStructure): {
  hasDocuments: boolean;
  hasWorkflows: boolean;
  hasCustomProperties: boolean;
  supportedObjectTypes: string[];
} {
  // Check for common document-related object types
  const documentObjectType = structure.objectTypes.find(
    (ot) => ot.ID === 0 || ot.Name.toLowerCase().includes('document')
  );

  // Check for custom properties (IDs > 1000 are typically custom)
  const customProperties = structure.propertyDefs.filter((prop) => prop.ID >= 1000);

  return {
    hasDocuments: !!documentObjectType,
    hasWorkflows: structure.workflows.length > 0,
    hasCustomProperties: customProperties.length > 0,
    supportedObjectTypes: structure.objectTypes.map((ot) => ot.Name),
  };
}

/**
 * Create vault structure summary event
 */
export function createVaultStructureSummaryEvent(
  vaultGuid: string,
  vaultName: string,
  structure: VaultStructure,
  organizationId: string
): ExtractedEvent {
  const capabilities = extractVaultCapabilities(structure);
  const propertyMetadata = extractPropertyDefinitionsMetadata(structure.propertyDefs);

  return {
    type: 'dms_vault_structure_analyzed',
    timestamp: new Date(),
    metadata: {
      vaultGuid,
      vaultName,
      capabilities,
      objectTypeCount: structure.objectTypes.length,
      classCount: structure.classes.length,
      propertyCount: structure.propertyDefs.length,
      customPropertyCount: propertyMetadata.filter((p) => p.id >= 1000).length,
      workflowCount: structure.workflows.length,
      hasDocumentManagement: capabilities.hasDocuments,
      hasWorkflowManagement: capabilities.hasWorkflows,
    },
    rawData: {
      vaultGuid,
      organizationId,
      propertyMetadata,
      objectTypes: structure.objectTypes.map((ot) => ({
        id: ot.ID,
        name: ot.Name,
        namePlural: ot.NamePlural,
      })),
    },
  };
}
