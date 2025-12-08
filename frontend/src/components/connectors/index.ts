/**
 * Connector Components Index
 * Exports all connector-related components
 */

// Core Connector Components (T193-T200)
export { ConnectorCard, ConnectorCardSkeleton } from './ConnectorCard';
export type { ConnectorType } from './ConnectorCard';

export { ConnectorWizardWrapper } from './ConnectorWizardWrapper';
export type { WizardStep } from './ConnectorWizardWrapper';

export { TestConnection } from './TestConnection';
export type { TestResult } from './TestConnection';

export { SyncHistoryTimeline } from './SyncHistoryTimeline';
export type { SyncEvent, SyncError } from './SyncHistoryTimeline';

export { ErrorLogViewer } from './ErrorLogViewer';
export type { ErrorLog } from './ErrorLogViewer';

// DMS System Selector
export { DMSSystemSelector } from './DMSSystemSelector';

// Setup Wizards
export {
  DocuwareSetupWizard,
  type DocuwareConfig,
} from './DocuwareSetupWizard';

export {
  MFilesSetupWizard,
  type MFilesConfig,
} from './MFilesSetupWizard';

// Folder Selector
export {
  DMSFolderSelector,
  generateMockFolderStructure,
} from './DMSFolderSelector';

// Sync Status
export {
  DMSSyncStatus,
  generateMockDMSConnection,
  type SyncStats,
  type DMSConnection,
} from './DMSSyncStatus';

// Example/Demo
export { DMSConnectorExample } from './DMSConnectorExample';
