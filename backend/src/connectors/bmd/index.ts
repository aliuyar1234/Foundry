/**
 * BMD Connector
 * Main connector implementation for BMD NTCS accounting data sources
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
  BmdAuthConfig,
  BmdClient,
  createBmdClient,
} from './bmdClient.js';
import { extractAllBmdData } from './extractors/index.js';

export interface BmdConnectorConfig extends BmdAuthConfig {
  accessToken?: string;
  expiresAt?: string;
}

export class BmdConnector extends BaseConnector {
  get type(): string {
    return 'BMD';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<BmdConnectorConfig>;

    if (!config.apiUrl) {
      errors.push('Missing apiUrl');
    }

    if (!config.apiKey) {
      errors.push('Missing apiKey');
    }

    if (!config.companyId) {
      errors.push('Missing companyId');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get authorization URL - BMD uses API key auth
   */
  getAuthorizationUrl(_redirectUri: string, _state: string): string {
    return '';
  }

  /**
   * Exchange code for tokens - Not applicable for BMD
   */
  async exchangeCodeForTokens(
    _code: string,
    _redirectUri: string
  ): Promise<AuthResult> {
    return {
      success: false,
      error: 'BMD uses API key authentication, not OAuth',
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<AuthResult> {
    const config = this.config as BmdConnectorConfig;

    try {
      const client = createBmdClient({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        companyId: config.companyId,
      });

      const tokens = await client.authenticate();

      // Update config with new token
      this.config = {
        ...config,
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt.toISOString(),
      };

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          expiresAt: tokens.expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Test connection to BMD
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = this.config as BmdConnectorConfig;

    try {
      const client = createBmdClient({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        companyId: config.companyId,
      });

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
    const config = this.config as BmdConnectorConfig;

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to BMD...',
      });

      const client = createBmdClient({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        companyId: config.companyId,
      });

      // Authenticate
      await client.authenticate();

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
        current: 25,
        total: 100,
        stage: 'accounts',
        message: 'Extracting chart of accounts...',
      });

      onProgress?.({
        current: 40,
        total: 100,
        stage: 'journal',
        message: 'Extracting journal entries...',
      });

      onProgress?.({
        current: 60,
        total: 100,
        stage: 'partners',
        message: 'Extracting business partners...',
      });

      onProgress?.({
        current: 80,
        total: 100,
        stage: 'costcenters',
        message: 'Extracting cost centers...',
      });

      // Extract all data
      const result = await extractAllBmdData(client, {
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
   * Get required scopes - Not applicable for BMD
   */
  getRequiredScopes(): string[] {
    return [];
  }
}

// Export types and utilities
export * from './bmdClient.js';
export * from './extractors/index.js';
