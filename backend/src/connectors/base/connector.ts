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
 * Connector metadata
 */
export interface ConnectorMetadata {
  type: string;
  name: string;
  description: string;
  icon?: string;
  capabilities: ConnectorCapabilities;
}
