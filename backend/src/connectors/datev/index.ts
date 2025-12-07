/**
 * DATEV Connector
 * Main connector implementation for DATEV accounting data sources
 */

import { DataSource } from '@prisma/client';
import {
  BaseConnector,
  AuthResult,
  SyncResult,
  SyncOptions,
  SyncProgressCallback,
} from '../base/connector.js';
import {
  DatevAuthConfig,
  DatevTokens,
  DatevClient,
  createDatevClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  DATEV_SCOPES,
} from './datevClient.js';
import { extractAllDatevData } from './extractors/index.js';

export interface DatevConnectorConfig extends DatevAuthConfig {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export class DatevConnector extends BaseConnector {
  get type(): string {
    return 'DATEV';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<DatevConnectorConfig>;

    if (!config.clientId) {
      errors.push('Missing clientId');
    }

    if (!config.clientSecret) {
      errors.push('Missing clientSecret');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const config = this.config as DatevConnectorConfig;
    return getAuthorizationUrl(
      {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        environment: config.environment,
      },
      redirectUri,
      state
    );
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<AuthResult> {
    const config = this.config as DatevConnectorConfig;

    try {
      const tokens = await exchangeCodeForTokens(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          environment: config.environment,
        },
        code,
        redirectUri
      );

      // Update config with tokens
      this.config = {
        ...config,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt.toISOString(),
      };

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      };
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<AuthResult> {
    const config = this.config as DatevConnectorConfig;

    if (!config.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    try {
      const tokens = await refreshAccessToken(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          environment: config.environment,
        },
        config.refreshToken
      );

      // Update config with new tokens
      this.config = {
        ...config,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt.toISOString(),
      };

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * Test connection to DATEV
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = this.config as DatevConnectorConfig;

    if (!config.accessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const client = createDatevClient(config.accessToken, config.environment);
      const success = await client.testConnection();

      if (!success) {
        return { success: false, error: 'Connection test failed' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Perform sync operation
   */
  async sync(
    options: SyncOptions,
    onProgress?: SyncProgressCallback
  ): Promise<SyncResult> {
    const config = this.config as DatevConnectorConfig;

    if (!config.accessToken) {
      return { success: false, eventsCount: 0, error: 'Not authenticated' };
    }

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to DATEV...',
      });

      // Check if token needs refresh
      if (config.expiresAt && new Date(config.expiresAt) <= new Date()) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, eventsCount: 0, error: 'Authentication failed' };
        }
      }

      const client = createDatevClient(config.accessToken, config.environment);

      // Verify connection
      const connected = await client.testConnection();
      if (!connected) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, eventsCount: 0, error: 'Authentication failed' };
        }
      }

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 12;
      const modifiedSince = options.fullSync
        ? new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
        : options.deltaToken
          ? new Date(options.deltaToken)
          : undefined;

      onProgress?.({
        current: 10,
        total: 100,
        stage: 'documents',
        message: 'Extracting documents...',
      });

      onProgress?.({
        current: 30,
        total: 100,
        stage: 'accounts',
        message: 'Extracting chart of accounts...',
      });

      onProgress?.({
        current: 50,
        total: 100,
        stage: 'journal',
        message: 'Extracting journal entries...',
      });

      onProgress?.({
        current: 70,
        total: 100,
        stage: 'partners',
        message: 'Extracting business partners...',
      });

      // Extract all data
      const result = await extractAllDatevData(client, {
        organizationId: this.organizationId,
        modifiedSince,
      });

      onProgress?.({
        current: 100,
        total: 100,
        stage: 'complete',
        message: `Sync complete. Processed ${result.stats.total} records.`,
      });

      return {
        success: true,
        eventsCount: result.stats.total,
        deltaToken: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        eventsCount: 0,
        error: error instanceof Error ? error.message : 'Sync failed',
      };
    }
  }

  /**
   * Get required scopes
   */
  getRequiredScopes(): string[] {
    return DATEV_SCOPES;
  }
}

// Export types and utilities
export * from './datevClient.js';
export * from './extractors/index.js';
