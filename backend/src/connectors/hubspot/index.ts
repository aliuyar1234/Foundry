/**
 * HubSpot Connector
 * Main connector implementation for HubSpot CRM data sources
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
  HubSpotAuthConfig,
  HubSpotTokens,
  HubSpotClient,
  createHubSpotClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  HUBSPOT_SCOPES,
} from './hubspotClient.js';
import { extractAllHubSpotData } from './extractors/index.js';

export interface HubSpotConnectorConfig extends HubSpotAuthConfig {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  syncObjects?: string[];
}

export class HubSpotConnector extends BaseConnector {
  get type(): string {
    return 'HUBSPOT';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<HubSpotConnectorConfig>;

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
    const config = this.config as HubSpotConnectorConfig;
    return getAuthorizationUrl(
      {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
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
    const config = this.config as HubSpotConnectorConfig;

    try {
      const tokens = await exchangeCodeForTokens(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
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
    const config = this.config as HubSpotConnectorConfig;

    if (!config.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    try {
      const tokens = await refreshAccessToken(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
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
   * Test connection to HubSpot
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = this.config as HubSpotConnectorConfig;

    if (!config.accessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const client = createHubSpotClient(config.accessToken);
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
    const config = this.config as HubSpotConnectorConfig;

    if (!config.accessToken) {
      return { success: false, eventsCount: 0, error: 'Not authenticated' };
    }

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to HubSpot...',
      });

      // Check if token needs refresh
      if (config.expiresAt && new Date(config.expiresAt) <= new Date()) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, eventsCount: 0, error: 'Authentication failed' };
        }
      }

      const client = createHubSpotClient(config.accessToken);

      // Verify connection
      const connected = await client.testConnection();
      if (!connected) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, eventsCount: 0, error: 'Authentication failed' };
        }
      }

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 6;
      const modifiedSince = options.fullSync
        ? new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
        : options.deltaToken
          ? new Date(options.deltaToken)
          : undefined;

      onProgress?.({
        current: 10,
        total: 100,
        stage: 'companies',
        message: 'Extracting companies...',
      });

      onProgress?.({
        current: 30,
        total: 100,
        stage: 'contacts',
        message: 'Extracting contacts...',
      });

      onProgress?.({
        current: 50,
        total: 100,
        stage: 'deals',
        message: 'Extracting deals...',
      });

      onProgress?.({
        current: 70,
        total: 100,
        stage: 'tickets',
        message: 'Extracting tickets...',
      });

      // Extract all data
      const result = await extractAllHubSpotData(client, {
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
    return HUBSPOT_SCOPES;
  }
}

// Export types and utilities
export * from './hubspotClient.js';
export * from './extractors/index.js';
