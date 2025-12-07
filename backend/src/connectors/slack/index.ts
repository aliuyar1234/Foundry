/**
 * Slack Connector
 * Main connector implementation for Slack workspace data sources
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
  SlackAuthConfig,
  SlackTokens,
  SlackClient,
  createSlackClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  SLACK_SCOPES,
} from './slackClient.js';
import { extractAllSlackData } from './extractors/index.js';

export interface SlackConnectorConfig extends SlackAuthConfig {
  accessToken?: string;
  botUserId?: string;
  teamId?: string;
  teamName?: string;
  syncMessages?: boolean;
}

export class SlackConnector extends BaseConnector {
  get type(): string {
    return 'SLACK';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const config = this.config as Partial<SlackConnectorConfig>;

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
    const config = this.config as SlackConnectorConfig;
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
    const config = this.config as SlackConnectorConfig;

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
        botUserId: tokens.botUserId,
        teamId: tokens.teamId,
        teamName: tokens.teamName,
      };

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
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
   * Refresh access token - Slack tokens don't expire by default
   */
  async refreshAccessToken(): Promise<AuthResult> {
    const config = this.config as SlackConnectorConfig;

    if (!config.accessToken) {
      return { success: false, error: 'No access token available' };
    }

    // Slack bot tokens don't expire, just verify they still work
    const client = createSlackClient(config.accessToken);
    const valid = await client.testConnection();

    if (!valid) {
      return { success: false, error: 'Token is no longer valid' };
    }

    return {
      success: true,
      tokens: {
        accessToken: config.accessToken,
      },
    };
  }

  /**
   * Test connection to Slack
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = this.config as SlackConnectorConfig;

    if (!config.accessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const client = createSlackClient(config.accessToken);
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
    const config = this.config as SlackConnectorConfig;

    if (!config.accessToken) {
      return { success: false, eventsCount: 0, error: 'Not authenticated' };
    }

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to Slack...',
      });

      const client = createSlackClient(config.accessToken);

      // Verify connection
      const connected = await client.testConnection();
      if (!connected) {
        return { success: false, eventsCount: 0, error: 'Authentication failed' };
      }

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 3;
      const modifiedSince = options.fullSync
        ? new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
        : options.deltaToken
          ? new Date(options.deltaToken)
          : undefined;

      onProgress?.({
        current: 10,
        total: 100,
        stage: 'users',
        message: 'Extracting users...',
      });

      onProgress?.({
        current: 30,
        total: 100,
        stage: 'channels',
        message: 'Extracting channels...',
      });

      onProgress?.({
        current: 50,
        total: 100,
        stage: 'messages',
        message: 'Extracting messages...',
      });

      // Extract all data
      const result = await extractAllSlackData(client, {
        organizationId: this.organizationId,
        modifiedSince,
        includeMessages: config.syncMessages !== false,
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
    return SLACK_SCOPES;
  }
}

// Export types and utilities
export * from './slackClient.js';
export * from './extractors/index.js';
