/**
 * SAP Business One Connector
 * Main connector implementation for SAP B1 data sources
 */

import { DataSource } from '@prisma/client';
import {
  BaseConnector,
  AuthResult,
  SyncResult,
  SyncOptions,
  SyncProgressCallback,
} from '../base/connector.js';
import { SapB1ClientConfig, SapB1Client, createSapB1Client } from './sapClient.js';
import { extractAllSapData } from './extractors/index.js';

export interface SapB1ConnectorConfig extends SapB1ClientConfig {
  syncEntities?: string[];
  includeAttachments?: boolean;
}

export class SapB1Connector extends BaseConnector {
  get type(): string {
    return 'SAP_B1';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<SapB1ConnectorConfig>;

    if (!config.serverUrl) {
      errors.push('Missing serverUrl');
    }

    if (!config.companyDb) {
      errors.push('Missing companyDb');
    }

    if (!config.username) {
      errors.push('Missing username');
    }

    if (!config.password) {
      errors.push('Missing password');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get authorization URL - SAP B1 uses session auth, no OAuth
   */
  getAuthorizationUrl(_redirectUri: string, _state: string): string {
    return '';
  }

  /**
   * Exchange code for tokens - Not applicable for SAP B1
   */
  async exchangeCodeForTokens(
    _code: string,
    _redirectUri: string
  ): Promise<AuthResult> {
    return {
      success: false,
      error: 'SAP B1 uses session authentication, not OAuth',
    };
  }

  /**
   * Refresh access token - SAP B1 manages sessions internally
   */
  async refreshAccessToken(): Promise<AuthResult> {
    return {
      success: true,
    };
  }

  /**
   * Test connection to SAP B1
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.createClient();
      const success = await client.testConnection();

      if (!success) {
        return { success: false, error: 'Connection test failed' };
      }

      // Logout to clean up session
      await client.logout();

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
    let client: SapB1Client | null = null;

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to SAP Business One...',
      });

      client = this.createClient();

      // Login
      await client.login();

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 6;
      const lookbackDate = options.fullSync
        ? new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
        : undefined;

      onProgress?.({
        current: 10,
        total: 100,
        stage: 'business-partners',
        message: 'Extracting customers and vendors...',
      });

      onProgress?.({
        current: 30,
        total: 100,
        stage: 'items',
        message: 'Extracting items/products...',
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
      const result = await extractAllSapData(client, {
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
        deltaToken: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        eventsCount: 0,
        error: error instanceof Error ? error.message : 'Sync failed',
      };
    } finally {
      // Always logout to clean up session
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }
    }
  }

  /**
   * Get required scopes - Not applicable for SAP B1
   */
  getRequiredScopes(): string[] {
    return [];
  }

  /**
   * Create SAP B1 client
   */
  private createClient(): SapB1Client {
    const config = this.config as SapB1ConnectorConfig;

    return createSapB1Client({
      serverUrl: config.serverUrl,
      companyDb: config.companyDb,
      username: config.username,
      password: config.password,
      sslEnabled: config.sslEnabled,
    });
  }
}

// Export types and utilities
export * from './sapClient.js';
export * from './extractors/index.js';
