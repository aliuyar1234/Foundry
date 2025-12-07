/**
 * Microsoft 365 Connector
 * Main connector implementation for Microsoft 365 data sources
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
  M365AuthConfig,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  validateM365Config,
  M365_USER_SCOPES,
} from './auth.js';
import { GraphApiClient } from './graphClient.js';
import { syncUserData, calculateLookbackDate, parseDeltaTokens, DeltaTokens } from './deltaSync.js';
import { ExtractedEvent } from '../base/connector.js';

export class M365Connector extends BaseConnector {
  get type(): string {
    return 'M365';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const config = this.config as Partial<M365AuthConfig>;
    const result = validateM365Config(config);
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
   * Test connection to Microsoft 365
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = this.config.accessToken as string;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const client = new GraphApiClient(accessToken);
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
      const client = new GraphApiClient(accessToken);

      // Get users to sync
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'users',
        message: 'Fetching organization users...',
      });

      const users = await client.getUsers();
      const totalUsers = users.length;

      if (totalUsers === 0) {
        return {
          success: true,
          eventsCount: 0,
          error: 'No users found in organization',
        };
      }

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 6;
      const lookbackDate = options.fullSync ? calculateLookbackDate(lookbackMonths) : undefined;

      // Get existing delta tokens
      const existingDeltaTokens = options.deltaToken
        ? parseDeltaTokens(JSON.parse(options.deltaToken))
        : {};

      // Sync each user
      const allEvents: ExtractedEvent[] = [];
      let usersProcessed = 0;

      for (const user of users) {
        if (!user.mail) continue;

        onProgress?.({
          current: Math.round((usersProcessed / totalUsers) * 100),
          total: 100,
          stage: 'sync',
          message: `Syncing ${user.displayName || user.mail}...`,
        });

        try {
          const result = await syncUserData(client, {
            userId: user.id,
            organizationId: this.organizationId,
            lookbackDate,
            deltaTokens: existingDeltaTokens,
            syncEmails: options.syncEmails !== false,
            syncCalendar: options.syncCalendar !== false,
          });

          allEvents.push(...result.events);

          // Update delta tokens
          Object.assign(existingDeltaTokens, result.newDeltaTokens);
        } catch (error) {
          // Log error but continue with other users
          console.error(`Failed to sync user ${user.mail}:`, error);
        }

        usersProcessed++;
      }

      onProgress?.({
        current: 100,
        total: 100,
        stage: 'complete',
        message: `Sync complete. Processed ${allEvents.length} events.`,
      });

      return {
        success: true,
        eventsCount: allEvents.length,
        deltaToken: JSON.stringify(existingDeltaTokens),
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
    return M365_USER_SCOPES;
  }

  /**
   * Get auth configuration
   */
  private getAuthConfig(): M365AuthConfig {
    return {
      tenantId: this.config.tenantId as string,
      clientId: this.config.clientId as string,
      clientSecret: this.config.clientSecret as string,
    };
  }
}
