/**
 * Connector Type Definitions
 * Comprehensive TypeScript types for connector-related data structures
 */

// Enums
export type ConnectorType =
  | 'M365'
  | 'GOOGLE_WORKSPACE'
  | 'ODOO'
  | 'SAP_B1'
  | 'DYNAMICS'
  | 'HUBSPOT'
  | 'SALESFORCE'
  | 'SLACK'
  | 'DATEV'
  | 'BMD'
  | 'CUSTOM';

export type ConnectorStatus =
  | 'PENDING'
  | 'CONNECTED'
  | 'ERROR'
  | 'DISABLED';

export type SyncStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED';

export type JobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ErrorSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type ErrorCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'VALIDATION'
  | 'DATA_PROCESSING'
  | 'CONFIGURATION'
  | 'SYNC'
  | 'UNKNOWN';

export type HealthStatus =
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'error';

// Core Connector Types
export interface ConnectorInstance {
  id: string;
  type: ConnectorType;
  name: string;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  syncSchedule?: string;
  lastSyncAt?: string;
  lastSyncStatus?: SyncStatus;
  deltaToken?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
}

export interface ConnectorCapabilities {
  supportsIncrementalSync: boolean;
  supportsWebhooks: boolean;
  supportedResources: string[];
  requiredConfig: string[];
  optionalConfig: string[];
}

export interface ConnectorMetadata {
  type: ConnectorType;
  name: string;
  description: string;
  icon?: string;
  capabilities: ConnectorCapabilities;
}

// Sync Types
export interface SyncJob {
  id: string;
  dataSourceId: string;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
  eventsCount: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SyncProgress {
  jobId: string;
  current: number;
  total: number;
  stage: string;
  message?: string;
  percentage: number;
  estimatedTimeRemaining?: number;
}

export interface SyncOptions {
  fullSync?: boolean;
  lookbackMonths?: number;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncFiles?: boolean;
}

export interface SyncStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageDuration: number;
  totalEventsProcessed: number;
  lastSyncAt?: string;
}

// Error Types
export interface ConnectorError {
  id: string;
  connectorInstanceId: string;
  syncJobId?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code?: string;
  message: string;
  details?: Record<string, unknown>;
  stackTrace?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ErrorSummary {
  total: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  unresolved: number;
  resolved: number;
  recentErrors: ConnectorError[];
}

export interface ErrorFilters {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  resolved?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'occurredAt' | 'severity' | 'category';
  sortOrder?: 'asc' | 'desc';
}

export interface ErrorTrend {
  date: string;
  count: number;
  byCategory: Record<ErrorCategory, number>;
}

// Health Types
export interface ConnectorHealth {
  healthy: boolean;
  status: HealthStatus;
  latencyMs?: number;
  lastSuccessfulSync?: string;
  error?: string;
  details?: Record<string, unknown>;
}

// Input Types
export interface CreateConnectorInput {
  name: string;
  type: ConnectorType;
  config?: Record<string, unknown>;
  syncSchedule?: string;
}

export interface UpdateConnectorInput {
  name?: string;
  config?: Record<string, unknown>;
  syncSchedule?: string;
  status?: ConnectorStatus;
}

export interface ResolveErrorInput {
  resolution: string;
}

// Validation Types
export interface ConnectorValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'number' | 'boolean' | 'select';
  required: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

export interface ConnectorSchema {
  type: ConnectorType;
  name: string;
  authType: 'oauth' | 'apikey' | 'basic' | 'custom';
  configFields: ConfigField[];
  oauthConfig?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
}

// OAuth Types
export interface OAuthAuthorizationResponse {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackParams {
  code: string;
  redirectUri: string;
  state: string;
}

// Event Types
export interface ConnectorEvent {
  id: string;
  type: string;
  timestamp: string;
  actorId?: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  rawData?: Record<string, unknown>;
  connectorInstanceId: string;
  syncJobId?: string;
  organizationId: string;
  createdAt: string;
}

// Rate Limiting Types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfter?: number;
}

export interface RateLimitEvent {
  connectorInstanceId: string;
  timestamp: string;
  rateLimitInfo: RateLimitInfo;
  action: 'warning' | 'hit' | 'recovered';
}

// Webhook Types
export interface WebhookConfig {
  enabled: boolean;
  url: string;
  secret?: string;
  events: string[];
}

export interface WebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  connectorInstanceId: string;
  verified: boolean;
}

// Activity Types
export interface ConnectorActivity {
  type:
    | 'sync_started'
    | 'sync_completed'
    | 'sync_failed'
    | 'instance_created'
    | 'instance_updated'
    | 'instance_deleted'
    | 'error_occurred'
    | 'error_resolved';
  instanceId: string;
  instanceName?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Notification Types
export interface SyncNotification {
  instanceId: string;
  instanceName: string;
  status: 'completed' | 'failed' | 'cancelled';
  eventsProcessed?: number;
  error?: string;
  timestamp: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  status: number;
}

// UI State Types
export interface ConnectorFilters {
  status?: ConnectorStatus[];
  type?: ConnectorType[];
  searchQuery?: string;
}

export interface ActiveSync {
  instanceId: string;
  jobId: string;
  progress?: SyncProgress;
  startedAt: string;
}

// Connector Configuration by Type
export interface M365Config {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncFiles?: boolean;
}

export interface GoogleWorkspaceConfig {
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  adminEmail?: string;
  syncGmail?: boolean;
  syncCalendar?: boolean;
  syncDrive?: boolean;
}

export interface SalesforceConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  apiVersion?: string;
}

export interface HubSpotConfig {
  portalId: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
}

export interface SlackConfig {
  workspaceId: string;
  teamId?: string;
  accessToken?: string;
  botToken?: string;
  webhookUrl?: string;
}

export interface DatevConfig {
  clientId: string;
  clientSecret?: string;
  consultantNumber: string;
  clientNumber: string;
  environment: 'production' | 'sandbox';
}

export interface OdooConfig {
  url: string;
  database: string;
  username: string;
  apiKey?: string;
  modules?: string[];
}

export interface SapB1Config {
  serverUrl: string;
  companyDb: string;
  username: string;
  password?: string;
  sslValidation?: boolean;
}
