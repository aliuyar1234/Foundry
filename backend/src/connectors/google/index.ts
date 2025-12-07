/**
 * Google Workspace Connector
 * Main connector implementation for Google Workspace data sources
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
  GoogleAuthConfig,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  validateGoogleConfig,
  GOOGLE_SCOPES,
} from './auth.js';
import {
  syncGoogleWorkspace,
  testGoogleConnections,
  parseDeltaTokens,
  serializeDeltaTokens,
  calculateLookbackDate,
} from './deltaSync.js';

export class GoogleWorkspaceConnector extends BaseConnector {
  get type(): string {
    return 'GOOGLE_WORKSPACE';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const config = this.config as Partial<GoogleAuthConfig>;
    const result = validateGoogleConfig(config);
    return result;
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const config = this.getAuthConfig();
    return getAuthorizationUrl(config, redirectUri, state);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthResult> {
    try {
      const config = this.getAuthConfig();
      const tokens = await exchangeCodeForTokens(config, code, redirectUri);

      this.updateConfig({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt.toISOString(),
        scopes: tokens.scopes,
      });

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
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
    try {
      const config = this.getAuthConfig();
      const currentRefreshToken = this.config.refreshToken as string;

      if (!currentRefreshToken) {
        return {
          success: false,
          error: 'No refresh token available',
        };
      }

      const tokens = await refreshAccessToken(config, currentRefreshToken);

      this.updateConfig({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || currentRefreshToken,
        tokenExpiresAt: tokens.expiresAt.toISOString(),
      });

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * Test connection to Google Workspace
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = this.config.accessToken as string;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const results = await testGoogleConnections(accessToken);

      // Connection is successful if at least one service works
      const success = results.gmail || results.calendar || results.drive;

      if (!success) {
        return {
          success: false,
          error: results.errors.join('; ') || 'All connection tests failed',
        };
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
      // Ensure we have a valid token
      if (!this.isAuthenticated()) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return {
            success: false,
            eventsCount: 0,
            error: 'Authentication failed: ' + refreshResult.error,
          };
        }
      }

      const accessToken = this.config.accessToken as string;

      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Starting Google Workspace sync...',
      });

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 6;
      const lookbackDate = options.fullSync ? calculateLookbackDate(lookbackMonths) : undefined;

      // Get existing delta tokens
      const existingDeltaTokens = options.deltaToken
        ? parseDeltaTokens(JSON.parse(options.deltaToken))
        : {};

      // Stage 1: Sync emails (40% of progress)
      onProgress?.({
        current: 10,
        total: 100,
        stage: 'emails',
        message: 'Syncing Gmail...',
      });

      // Stage 2: Sync calendar (30% of progress)
      onProgress?.({
        current: 50,
        total: 100,
        stage: 'calendar',
        message: 'Syncing Calendar...',
      });

      // Stage 3: Sync drive (30% of progress)
      onProgress?.({
        current: 80,
        total: 100,
        stage: 'drive',
        message: 'Syncing Drive...',
      });

      // Perform full sync
      const result = await syncGoogleWorkspace(accessToken, {
        organizationId: this.organizationId,
        lookbackDate,
        deltaTokens: existingDeltaTokens,
        syncEmails: options.syncEmails,
        syncCalendar: options.syncCalendar,
        syncDrive: options.syncFiles, // Map syncFiles to syncDrive
      });

      onProgress?.({
        current: 100,
        total: 100,
        stage: 'complete',
        message: `Sync complete. Processed ${result.stats.totalEvents} events.`,
      });

      return {
        success: true,
        eventsCount: result.stats.totalEvents,
        deltaToken: serializeDeltaTokens(result.newDeltaTokens),
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
   * Get required OAuth scopes
   */
  getRequiredScopes(): string[] {
    return GOOGLE_SCOPES;
  }

  /**
   * Get auth configuration
   */
  private getAuthConfig(): GoogleAuthConfig {
    return {
      clientId: this.config.clientId as string,
      clientSecret: this.config.clientSecret as string,
    };
  }
}

// Export types and utilities
export * from './auth.js';
export * from './gmailClient.js';
export * from './calendarClient.js';
export * from './driveClient.js';
export * from './deltaSync.js';
