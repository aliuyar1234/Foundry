/**
 * Salesforce Connector
 * Main connector implementation for Salesforce CRM data sources
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
  SalesforceAuthConfig,
  SalesforceTokens,
  SalesforceClient,
  createSalesforceClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  SALESFORCE_SCOPES,
} from './salesforceClient.js';
import { extractAllSalesforceData } from './extractors/index.js';

export interface SalesforceConnectorConfig extends SalesforceAuthConfig {
  accessToken?: string;
  refreshToken?: string;
  instanceUrl?: string;
  syncObjects?: string[];
}

export class SalesforceConnector extends BaseConnector {
  get type(): string {
    return 'SALESFORCE';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<SalesforceConnectorConfig>;

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
    const config = this.config as SalesforceConnectorConfig;
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
    const config = this.config as SalesforceConnectorConfig;

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
        instanceUrl: tokens.instanceUrl,
      };

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(parseInt(tokens.issuedAt) + 7200 * 1000), // 2 hours
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
    const config = this.config as SalesforceConnectorConfig;

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
        instanceUrl: tokens.instanceUrl,
      };

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(parseInt(tokens.issuedAt) + 7200 * 1000),
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
   * Test connection to Salesforce
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = this.config as SalesforceConnectorConfig;

    if (!config.accessToken || !config.instanceUrl) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const client = createSalesforceClient(config.accessToken, config.instanceUrl);
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
    const config = this.config as SalesforceConnectorConfig;

    if (!config.accessToken || !config.instanceUrl) {
      return { success: false, eventsCount: 0, error: 'Not authenticated' };
    }

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to Salesforce...',
      });

      const client = createSalesforceClient(config.accessToken, config.instanceUrl);

      // Verify connection
      const connected = await client.testConnection();
      if (!connected) {
        // Try to refresh token
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
        stage: 'accounts',
        message: 'Extracting accounts...',
      });

      onProgress?.({
        current: 25,
        total: 100,
        stage: 'contacts',
        message: 'Extracting contacts...',
      });

      onProgress?.({
        current: 40,
        total: 100,
        stage: 'opportunities',
        message: 'Extracting opportunities...',
      });

      onProgress?.({
        current: 55,
        total: 100,
        stage: 'cases',
        message: 'Extracting cases...',
      });

      onProgress?.({
        current: 70,
        total: 100,
        stage: 'leads',
        message: 'Extracting leads...',
      });

      // Extract all data
      const result = await extractAllSalesforceData(client, {
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
    return SALESFORCE_SCOPES;
  }
}

// Export types and utilities
export * from './salesforceClient.js';
export * from './extractors/index.js';
export * from './customObjectDiscovery.js';
export * from './fieldHistoryTracker.js';
export * from './bulkApi.js';
export * from './incrementalSync.js';
export * from './eventNormalizer.js';
