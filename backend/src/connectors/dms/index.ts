/**
 * DMS Module
 *
 * Main module for Document Management System connectors
 * Exports Docuware connector, M-Files connector, and shared utilities
 */

// Event normalizer
export {
  DMSEventNormalizer,
  createDMSEventNormalizer,
  NormalizedDMSEvent,
  NormalizationOptions,
} from './eventNormalizer.js';

// Selective sync
export {
  SelectiveSyncManager,
  createSelectiveSyncManager,
  parseSelectiveSyncConfig,
  SelectiveSyncConfig,
  SelectiveSyncPattern,
  SyncScope,
} from './selectiveSync.js';

// Re-export common types
export type {
  ExtractedEvent,
  SyncResult,
  SyncOptions,
  SyncProgressCallback,
} from '../base/connector.js';

/**
 * DMS System Types
 */
export const DMSSystemType = {
  DOCUWARE: 'docuware',
  MFILES: 'm-files',
} as const;

export type DMSSystem = typeof DMSSystemType[keyof typeof DMSSystemType];

/**
 * DMS Entity Types
 */
export const DMSEntityType = {
  DOCUMENT: 'document',
  FOLDER: 'folder',
  WORKFLOW: 'workflow',
  APPROVAL: 'approval',
  VERSION: 'version',
} as const;

export type DMSEntity = typeof DMSEntityType[keyof typeof DMSEntityType];

/**
 * DMS Actions
 */
export const DMSAction = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  MOVED: 'moved',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  TRANSITIONED: 'transitioned',
} as const;

export type DMSActionType = typeof DMSAction[keyof typeof DMSAction];

/**
 * Common DMS interfaces
 */
export interface DMSDocument {
  id: string;
  name: string;
  type: string;
  size?: number;
  extension?: string;
  createdAt: Date;
  modifiedAt: Date;
  createdBy?: string;
  modifiedBy?: string;
  properties?: Record<string, unknown>;
}

export interface DMSFolder {
  id: string;
  name: string;
  path?: string;
  parentId?: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface DMSWorkflow {
  id: string;
  name: string;
  state: string;
  stateId?: string;
  assignedTo?: string[];
  dueDate?: Date;
}

export interface DMSApproval {
  id: string;
  documentId: string;
  workflowId?: string;
  approver: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: Date;
  comments?: string;
}

/**
 * DMS Connector Capabilities
 */
export interface DMSConnectorCapabilities {
  supportsIncrementalSync: boolean;
  supportsWebhooks: boolean;
  supportsWorkflows: boolean;
  supportsVersioning: boolean;
  supportsFullTextSearch: boolean;
  supportedFileTypes: string[];
  maxFileSize?: number;
}

/**
 * DMS Sync Statistics
 */
export interface DMSSyncStats {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  documentsProcessed: number;
  foldersProcessed: number;
  workflowsProcessed: number;
  versionsProcessed: number;
  errorsCount: number;
  errors?: Array<{
    entity: string;
    entityId: string;
    error: string;
    timestamp: Date;
  }>;
}

/**
 * Docuware-specific types
 */
export interface DocuwareCabinet {
  id: string;
  name: string;
  color?: string;
  isBasket?: boolean;
}

export interface DocuwareDocument extends DMSDocument {
  cabinetId: string;
  documentId: number;
  fileType?: string;
  pageCount?: number;
  indexData?: Record<string, unknown>;
}

/**
 * M-Files-specific types
 */
export interface MFilesVault {
  guid: string;
  name: string;
  version?: string;
}

export interface MFilesObject extends DMSDocument {
  vaultGuid: string;
  objectType: string;
  objectTypeId: number;
  classId?: number;
  className?: string;
  version: number;
  checkedOut: boolean;
  checkedOutTo?: string;
}

/**
 * Helper functions
 */

/**
 * Determine if a file type is supported
 */
export function isSupportedFileType(
  extension: string,
  supportedTypes: string[]
): boolean {
  const normalizedExt = extension.toLowerCase().replace(/^\./, '');
  return supportedTypes
    .map(type => type.toLowerCase().replace(/^\./, ''))
    .includes(normalizedExt);
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Sanitize document name for file system
 */
export function sanitizeDocumentName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 255);
}

/**
 * Extract file extension from filename
 */
export function extractFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

/**
 * Build document path
 */
export function buildDocumentPath(
  folders: string[],
  documentName: string
): string {
  const sanitizedFolders = folders.map(sanitizeDocumentName);
  const sanitizedName = sanitizeDocumentName(documentName);
  return [...sanitizedFolders, sanitizedName].join('/');
}

/**
 * Validate DMS credentials
 */
export function validateDMSCredentials(
  system: DMSSystem,
  credentials: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (system === DMSSystemType.DOCUWARE) {
    if (!credentials.baseUrl) {
      errors.push('Base URL is required for Docuware');
    }
    if (!credentials.username && !credentials.apiKey) {
      errors.push('Username or API key is required for Docuware');
    }
    if (credentials.username && !credentials.password) {
      errors.push('Password is required when using username authentication');
    }
  }

  if (system === DMSSystemType.MFILES) {
    if (!credentials.serverUrl) {
      errors.push('Server URL is required for M-Files');
    }
    if (!credentials.vaultGuid && !credentials.vaultName) {
      errors.push('Vault GUID or vault name is required for M-Files');
    }
    if (!credentials.username) {
      errors.push('Username is required for M-Files');
    }
    if (!credentials.password) {
      errors.push('Password is required for M-Files');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
