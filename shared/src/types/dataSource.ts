/**
 * Data Source Types
 */

export const DataSourceType = {
  M365: 'M365',
  GOOGLE_WORKSPACE: 'GOOGLE_WORKSPACE',
  ODOO: 'ODOO',
  SAP_B1: 'SAP_B1',
  DYNAMICS: 'DYNAMICS',
  HUBSPOT: 'HUBSPOT',
  SALESFORCE: 'SALESFORCE',
  CUSTOM: 'CUSTOM',
} as const;

export type DataSourceType = (typeof DataSourceType)[keyof typeof DataSourceType];

export const DataSourceStatus = {
  PENDING: 'PENDING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
  DISABLED: 'DISABLED',
} as const;

export type DataSourceStatus = (typeof DataSourceStatus)[keyof typeof DataSourceStatus];

export const SyncStatus = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const JobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export interface DataSource {
  id: string;
  type: DataSourceType;
  name: string;
  status: DataSourceStatus;
  config: DataSourceConfig;
  syncSchedule?: string;
  lastSyncAt?: Date;
  lastSyncStatus?: SyncStatus;
  metadata: Record<string, unknown>;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataSourceConfig {
  // Common fields
  enabled?: boolean;

  // M365 specific
  tenantId?: string;
  clientId?: string;
  // Note: clientSecret stored encrypted, never returned in API

  // OAuth tokens
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;

  // Sync options
  lookbackMonths?: number;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncFiles?: boolean;
}

export interface SyncJob {
  id: string;
  status: JobStatus;
  startedAt?: Date;
  completedAt?: Date;
  eventsCount: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  dataSourceId: string;
  createdAt: Date;
}

export interface CreateDataSourceRequest {
  type: DataSourceType;
  name: string;
  config?: Partial<DataSourceConfig>;
  syncSchedule?: string;
}

export interface UpdateDataSourceRequest {
  name?: string;
  config?: Partial<DataSourceConfig>;
  syncSchedule?: string;
  status?: DataSourceStatus;
}

export interface DataSourceWithJobs extends DataSource {
  recentJobs: SyncJob[];
}

export interface SyncJobSummary {
  id: string;
  status: JobStatus;
  eventsCount: number;
  duration?: number;
  createdAt: Date;
}
