/**
 * DMS Event Normalizer
 * Task: T176
 *
 * Shared event normalizer for DMS systems (Docuware and M-Files)
 * Normalizes events from different DMS platforms into a common format
 *
 * Entity types:
 * - document: Document creation, modification, deletion
 * - folder: Folder/cabinet operations
 * - workflow: Workflow state changes
 * - approval: Approval steps and decisions
 * - version: Document version changes
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedDMSEvent {
  id: string;
  type: 'document' | 'folder' | 'workflow' | 'approval' | 'version';
  subtype?: string;
  action: 'created' | 'updated' | 'deleted' | 'moved' | 'approved' | 'rejected' | 'transitioned';
  timestamp: Date;
  source: 'docuware' | 'm-files';
  actor: {
    id?: string;
    name?: string;
    email?: string;
    type: 'user' | 'system' | 'service_account';
  };
  target: {
    id: string;
    type: string;
    name?: string;
    path?: string;
  };
  context: {
    organizationId: string;
    instanceId: string;
    cabinetId?: string;
    vaultId?: string;
    batchId?: string;
  };
  data: Record<string, unknown>;
  relationships?: Array<{
    type: string;
    targetId: string;
    targetType: string;
  }>;
}

export interface NormalizationOptions {
  organizationId: string;
  instanceId: string;
  batchId?: string;
  includeRawData?: boolean;
}

/**
 * DMS Event Normalizer
 */
export class DMSEventNormalizer {
  /**
   * Normalize Docuware event
   */
  normalizeDocuwareEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedDMSEvent {
    const metadata = event.metadata as Record<string, unknown>;

    // Determine entity type from event type
    const entityType = this.getDocuwareEntityType(event.type, metadata);
    const action = this.getDocuwareAction(event.type);

    const normalized: NormalizedDMSEvent = {
      id: `docuware:${metadata.documentId || metadata.id || Date.now()}`,
      type: entityType,
      subtype: this.getDocuwareSubtype(event.type, metadata),
      action,
      timestamp: event.timestamp,
      source: 'docuware',
      actor: {
        id: metadata.userId as string,
        name: metadata.userName as string,
        type: this.getActorType(metadata.userId as string),
      },
      target: {
        id: (metadata.documentId || metadata.id) as string,
        type: entityType,
        name: metadata.documentName as string || metadata.title as string,
        path: metadata.filePath as string,
      },
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        cabinetId: metadata.cabinetId as string,
        batchId: options.batchId,
      },
      data: {
        documentId: metadata.documentId,
        cabinetId: metadata.cabinetId,
        cabinetName: metadata.cabinetName,
        fileType: metadata.fileType,
        fileSize: metadata.fileSize,
        pageCount: metadata.pageCount,
        indexData: metadata.indexData,
        status: metadata.status,
        workflowState: metadata.workflowState,
        version: metadata.version,
      },
      relationships: this.buildDocuwareRelationships(metadata),
    };

    if (options.includeRawData) {
      normalized.data.rawData = event.rawData;
    }

    return normalized;
  }

  /**
   * Normalize M-Files event
   */
  normalizeMFilesEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedDMSEvent {
    const metadata = event.metadata as Record<string, unknown>;

    // Determine entity type from event type
    const entityType = this.getMFilesEntityType(event.type, metadata);
    const action = this.getMFilesAction(event.type);

    const normalized: NormalizedDMSEvent = {
      id: `mfiles:${metadata.objectId || metadata.id || Date.now()}`,
      type: entityType,
      subtype: this.getMFilesSubtype(event.type, metadata),
      action,
      timestamp: event.timestamp,
      source: 'm-files',
      actor: {
        id: metadata.userId as string,
        name: metadata.userName as string,
        email: metadata.userEmail as string,
        type: this.getActorType(metadata.userId as string),
      },
      target: {
        id: (metadata.objectId || metadata.id) as string,
        type: entityType,
        name: metadata.objectName as string || metadata.title as string,
        path: metadata.objectPath as string,
      },
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        vaultId: metadata.vaultGuid as string,
        batchId: options.batchId,
      },
      data: {
        objectId: metadata.objectId,
        objectType: metadata.objectType,
        objectTypeId: metadata.objectTypeId,
        classId: metadata.classId,
        className: metadata.className,
        vaultGuid: metadata.vaultGuid,
        vaultName: metadata.vaultName,
        fileSize: metadata.fileSize,
        extension: metadata.extension,
        properties: metadata.properties,
        workflow: metadata.workflow,
        workflowState: metadata.workflowState,
        version: metadata.version,
        checkedOut: metadata.checkedOut,
        checkedOutTo: metadata.checkedOutTo,
      },
      relationships: this.buildMFilesRelationships(metadata),
    };

    if (options.includeRawData) {
      normalized.data.rawData = event.rawData;
    }

    return normalized;
  }

  /**
   * Normalize any DMS event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedDMSEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const source = metadata.source as string;

    if (source === 'docuware') {
      return this.normalizeDocuwareEvent(event, options);
    }

    if (source === 'm-files' || source === 'mfiles') {
      return this.normalizeMFilesEvent(event, options);
    }

    throw new Error(`Unsupported DMS source: ${source}`);
  }

  /**
   * Normalize batch of events
   */
  normalizeEvents(
    events: ExtractedEvent[],
    options: NormalizationOptions
  ): NormalizedDMSEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize DMS event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedDMSEvent => event !== null);
  }

  /**
   * Get Docuware entity type from event
   */
  private getDocuwareEntityType(
    eventType: string,
    metadata: Record<string, unknown>
  ): NormalizedDMSEvent['type'] {
    if (eventType.includes('workflow')) {
      return 'workflow';
    }
    if (eventType.includes('approval')) {
      return 'approval';
    }
    if (eventType.includes('version')) {
      return 'version';
    }
    if (eventType.includes('cabinet') || eventType.includes('folder')) {
      return 'folder';
    }
    return 'document';
  }

  /**
   * Get M-Files entity type from event
   */
  private getMFilesEntityType(
    eventType: string,
    metadata: Record<string, unknown>
  ): NormalizedDMSEvent['type'] {
    if (eventType.includes('workflow')) {
      return 'workflow';
    }
    if (eventType.includes('approval')) {
      return 'approval';
    }
    if (eventType.includes('version') || eventType.includes('checkin') || eventType.includes('checkout')) {
      return 'version';
    }
    const objectType = metadata.objectType as string;
    if (objectType === 'Folder' || metadata.isFolder) {
      return 'folder';
    }
    return 'document';
  }

  /**
   * Get action from Docuware event type
   */
  private getDocuwareAction(eventType: string): NormalizedDMSEvent['action'] {
    if (eventType.includes('.created') || eventType.includes('.import')) {
      return 'created';
    }
    if (eventType.includes('.updated') || eventType.includes('.modified')) {
      return 'updated';
    }
    if (eventType.includes('.deleted')) {
      return 'deleted';
    }
    if (eventType.includes('.moved')) {
      return 'moved';
    }
    if (eventType.includes('.approved')) {
      return 'approved';
    }
    if (eventType.includes('.rejected')) {
      return 'rejected';
    }
    if (eventType.includes('.transitioned')) {
      return 'transitioned';
    }
    return 'updated';
  }

  /**
   * Get action from M-Files event type
   */
  private getMFilesAction(eventType: string): NormalizedDMSEvent['action'] {
    if (eventType.includes('.created') || eventType.includes('.add')) {
      return 'created';
    }
    if (eventType.includes('.updated') || eventType.includes('.modified') || eventType.includes('.checkin')) {
      return 'updated';
    }
    if (eventType.includes('.deleted') || eventType.includes('.destroy')) {
      return 'deleted';
    }
    if (eventType.includes('.moved')) {
      return 'moved';
    }
    if (eventType.includes('.approved')) {
      return 'approved';
    }
    if (eventType.includes('.rejected')) {
      return 'rejected';
    }
    if (eventType.includes('.transitioned') || eventType.includes('.workflow')) {
      return 'transitioned';
    }
    return 'updated';
  }

  /**
   * Get Docuware event subtype
   */
  private getDocuwareSubtype(
    eventType: string,
    metadata: Record<string, unknown>
  ): string | undefined {
    if (metadata.fileType) {
      return metadata.fileType as string;
    }
    if (eventType.includes('workflow')) {
      return 'workflow_step';
    }
    return undefined;
  }

  /**
   * Get M-Files event subtype
   */
  private getMFilesSubtype(
    eventType: string,
    metadata: Record<string, unknown>
  ): string | undefined {
    if (metadata.extension) {
      return metadata.extension as string;
    }
    if (metadata.className) {
      return metadata.className as string;
    }
    if (eventType.includes('checkout')) {
      return 'checkout';
    }
    if (eventType.includes('checkin')) {
      return 'checkin';
    }
    return undefined;
  }

  /**
   * Determine actor type
   */
  private getActorType(userId: string): 'user' | 'system' | 'service_account' {
    if (!userId || userId === 'system' || userId === '0') {
      return 'system';
    }
    if (userId.includes('service') || userId.includes('api')) {
      return 'service_account';
    }
    return 'user';
  }

  /**
   * Build Docuware relationships
   */
  private buildDocuwareRelationships(
    metadata: Record<string, unknown>
  ): NormalizedDMSEvent['relationships'] {
    const relationships: NormalizedDMSEvent['relationships'] = [];

    // Cabinet relationship
    if (metadata.cabinetId) {
      relationships.push({
        type: 'in_cabinet',
        targetId: `cabinet:${metadata.cabinetId}`,
        targetType: 'cabinet',
      });
    }

    // Workflow relationship
    if (metadata.workflowId) {
      relationships.push({
        type: 'in_workflow',
        targetId: `workflow:${metadata.workflowId}`,
        targetType: 'workflow',
      });
    }

    // Parent document relationship (for versions)
    if (metadata.parentDocumentId) {
      relationships.push({
        type: 'version_of',
        targetId: `document:${metadata.parentDocumentId}`,
        targetType: 'document',
      });
    }

    return relationships;
  }

  /**
   * Build M-Files relationships
   */
  private buildMFilesRelationships(
    metadata: Record<string, unknown>
  ): NormalizedDMSEvent['relationships'] {
    const relationships: NormalizedDMSEvent['relationships'] = [];

    // Vault relationship
    if (metadata.vaultGuid) {
      relationships.push({
        type: 'in_vault',
        targetId: `vault:${metadata.vaultGuid}`,
        targetType: 'vault',
      });
    }

    // Class relationship
    if (metadata.classId) {
      relationships.push({
        type: 'instance_of_class',
        targetId: `class:${metadata.classId}`,
        targetType: 'class',
      });
    }

    // Workflow relationship
    if (metadata.workflow) {
      relationships.push({
        type: 'in_workflow',
        targetId: `workflow:${(metadata.workflow as any).id}`,
        targetType: 'workflow',
      });
    }

    // Parent folder relationship
    if (metadata.parentFolderId) {
      relationships.push({
        type: 'in_folder',
        targetId: `folder:${metadata.parentFolderId}`,
        targetType: 'folder',
      });
    }

    // Checkout relationship
    if (metadata.checkedOut && metadata.checkedOutTo) {
      relationships.push({
        type: 'checked_out_to',
        targetId: metadata.checkedOutTo as string,
        targetType: 'user',
      });
    }

    return relationships;
  }
}

/**
 * Create DMS event normalizer
 */
export function createDMSEventNormalizer(): DMSEventNormalizer {
  return new DMSEventNormalizer();
}
