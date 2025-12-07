/**
 * Odoo ERP Connector
 * Main connector implementation for Odoo data sources
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
  OdooClientConfig,
  createOdooClient,
  OdooXmlRpcClient,
  OdooJsonRpcClient,
} from './odooClient.js';
import { extractAllOdooData } from './extractors/index.js';

export interface OdooConnectorConfig extends OdooClientConfig {
  modules?: string[];
}

export class OdooConnector extends BaseConnector {
  get type(): string {
    return 'ODOO';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<OdooConnectorConfig>;

    if (!config.url) {
      errors.push('Missing url');
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push('Invalid url format');
      }
    }

    if (!config.database) {
      errors.push('Missing database');
    }

    if (!config.username) {
      errors.push('Missing username');
    }

    if (!config.apiKey && !config.password) {
      errors.push('Missing apiKey or password');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get authorization URL - Odoo uses direct credentials, no OAuth
   */
  getAuthorizationUrl(_redirectUri: string, _state: string): string {
    // Odoo doesn't use OAuth - return empty string
    // Configuration is done through direct API credentials
    return '';
  }

  /**
   * Exchange code for tokens - Not applicable for Odoo
   */
  async exchangeCodeForTokens(
    _code: string,
    _redirectUri: string
  ): Promise<AuthResult> {
    // Odoo uses API key authentication, not OAuth
    return {
      success: false,
      error: 'Odoo uses API key authentication, not OAuth',
    };
  }

  /**
   * Refresh access token - Not applicable for Odoo
   */
  async refreshAccessToken(): Promise<AuthResult> {
    // Odoo uses persistent API keys, no refresh needed
    return {
      success: true,
    };
  }

  /**
   * Test connection to Odoo
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.createClient();
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
    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to Odoo...',
      });

      const client = this.createClient();

      // Test connection first
      const connected = await client.testConnection();
      if (!connected) {
        return {
          success: false,
          eventsCount: 0,
          error: 'Failed to connect to Odoo',
        };
      }

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 6;
      const lookbackDate = options.fullSync
        ? new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
        : undefined;

      onProgress?.({
        current: 10,
        total: 100,
        stage: 'customers',
        message: 'Extracting customers and vendors...',
      });

      onProgress?.({
        current: 30,
        total: 100,
        stage: 'products',
        message: 'Extracting products...',
      });

      onProgress?.({
        current: 50,
        total: 100,
        stage: 'orders',
        message: 'Extracting orders...',
      });

      onProgress?.({
        current: 70,
        total: 100,
        stage: 'invoices',
        message: 'Extracting invoices...',
      });

      // Extract all data
      const result = await extractAllOdooData(client, {
        organizationId: this.organizationId,
        lookbackDate,
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
        deltaToken: new Date().toISOString(), // Use timestamp as delta token
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
   * Get required scopes - Not applicable for Odoo
   */
  getRequiredScopes(): string[] {
    return [];
  }

  /**
   * Create Odoo client
   */
  private createClient(): OdooXmlRpcClient | OdooJsonRpcClient {
    const config = this.config as OdooConnectorConfig;

    return createOdooClient({
      url: config.url,
      database: config.database,
      username: config.username,
      apiKey: config.apiKey,
      password: config.password,
      apiType: config.apiType,
    });
  }
}

// Export types and utilities
export * from './odooClient.js';
export * from './extractors/index.js';
