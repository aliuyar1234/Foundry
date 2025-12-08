/**
 * Abstract Connector Interface
 * Base class for all data source connectors
 */

import { DataSource, DataSourceStatus } from '@prisma/client';

export interface ConnectorConfig {
  [key: string]: unknown;
}

export interface AuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  eventsCount: number;
  deltaToken?: string;
  error?: string;
  partial?: boolean;
}

export interface SyncProgress {
  current: number;
  total: number;
  stage: string;
  message?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface ExtractedEvent {
  type: string;
  timestamp: Date;
  actorId?: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  rawData?: Record<string, unknown>;
}

/**
 * Abstract base class for connectors
 */
export abstract class BaseConnector {
  protected dataSource: DataSource;
  protected config: ConnectorConfig;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.config = dataSource.config as ConnectorConfig;
  }

  /**
   * Get the connector type identifier
   */
  abstract get type(): string;

  /**
   * Validate the connector configuration
   */
  abstract validateConfig(): { valid: boolean; errors?: string[] };

  /**
   * Initialize OAuth flow and return authorization URL
   */
  abstract getAuthorizationUrl(redirectUri: string, state: string): string;

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<AuthResult>;

  /**
   * Refresh access token using refresh token
   */
  abstract refreshAccessToken(): Promise<AuthResult>;

  /**
   * Test the connection to the data source
   */
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * Perform a full or incremental sync
   */
  abstract sync(
    options: SyncOptions,
    onProgress?: SyncProgressCallback
  ): Promise<SyncResult>;

  /**
   * Get required OAuth scopes/permissions
   */
  abstract getRequiredScopes(): string[];

  /**
   * Check if the connector is properly authenticated
   */
  isAuthenticated(): boolean {
    const accessToken = this.config.accessToken as string | undefined;
    const expiresAt = this.config.tokenExpiresAt as string | undefined;

    if (!accessToken) {
      return false;
    }

    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      // Consider expired if within 5 minutes
      return expiryDate.getTime() > Date.now() + 5 * 60 * 1000;
    }

    return true;
  }

  /**
   * Get the data source ID
   */
  get dataSourceId(): string {
    return this.dataSource.id;
  }

  /**
   * Get the organization ID
   */
  get organizationId(): string {
    return this.dataSource.organizationId;
  }

  /**
   * Get the delta token for incremental sync
   */
  get deltaToken(): string | null {
    return this.dataSource.deltaToken;
  }

  /**
   * Update the connector configuration
   */
  updateConfig(updates: Partial<ConnectorConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export interface SyncOptions {
  fullSync?: boolean;
  lookbackMonths?: number;
  deltaToken?: string;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncFiles?: boolean;
}

/**
 * Connector capabilities
 */
export interface ConnectorCapabilities {
  supportsIncrementalSync: boolean;
  supportsWebhooks: boolean;
  supportedResources: string[];
  requiredConfig: string[];
  optionalConfig: string[];
}

/**
 * Rate limiting callbacks for connectors (T001)
 */
export interface RateLimitCallbacks {
  /** Called when rate limit is approaching (e.g., 80% consumed) */
  onRateLimitWarning?: (remaining: number, resetAt: Date) => void;
  /** Called when rate limit is hit and waiting */
  onRateLimitHit?: (retryAfter: number) => void;
  /** Called after rate limit wait completes */
  onRateLimitRecovered?: () => void;
}

/**
 * Extended connector configuration with rate limiting
 */
export interface ExtendedConnectorConfig extends ConnectorConfig {
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
    burstLimit?: number;
  };
  retryPolicy?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  status: 'connected' | 'degraded' | 'disconnected' | 'error';
  latencyMs?: number;
  lastSuccessfulSync?: Date;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Sync checkpoint for resume capability
 */
export interface SyncCheckpoint {
  connectorType: string;
  instanceId: string;
  resource: string;
  cursor?: string;
  pageToken?: string;
  timestamp: Date;
  processedCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Extended data connector interface with rate limiting
 */
export interface IDataConnector {
  readonly type: string;
  readonly capabilities: ConnectorCapabilities;

  // Configuration
  validateConfig(): { valid: boolean; errors?: string[] };
  updateConfig(updates: Partial<ConnectorConfig>): void;

  // Authentication
  getAuthorizationUrl(redirectUri: string, state: string): string;
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthResult>;
  refreshAccessToken(): Promise<AuthResult>;
  isAuthenticated(): boolean;

  // Connection
  testConnection(): Promise<{ success: boolean; error?: string }>;
  healthCheck(): Promise<HealthCheckResult>;

  // Sync with rate limiting support
  sync(
    options: SyncOptions,
    callbacks?: {
      onProgress?: SyncProgressCallback;
      onRateLimit?: RateLimitCallbacks;
    }
  ): Promise<SyncResult>;

  // Checkpoint management
  getCheckpoint(resource: string): Promise<SyncCheckpoint | null>;
  saveCheckpoint(checkpoint: SyncCheckpoint): Promise<void>;
  clearCheckpoint(resource: string): Promise<void>;

  // Resource info
  get dataSourceId(): string;
  get organizationId(): string;
  get deltaToken(): string | null;
}

/**
 * Connector metadata
 */
export interface ConnectorMetadata {
  type: string;
  name: string;
  description: string;
  icon?: string;
  capabilities: ConnectorCapabilities;
}
