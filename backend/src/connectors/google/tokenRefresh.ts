/**
 * Google OAuth Token Refresh Handler
 * Task: T019
 *
 * Handles automatic token refresh for Google OAuth tokens.
 * Integrates with the OAuth token manager for centralized token storage.
 */

import { OAuth2Client } from 'google-auth-library';
import {
  OAuthTokenManager,
  OAuthTokens,
  TokenRefreshResult,
  getOAuthTokenManager,
} from '../base/oauthTokenManager';
import { Redis } from 'ioredis';

export interface TokenRefreshConfig {
  clientId: string;
  clientSecret: string;
  redis?: Redis | null;
  refreshBufferMs?: number; // Refresh before expiry, default: 5 minutes
}

export class GoogleTokenRefreshHandler {
  private config: TokenRefreshConfig;
  private oauth2Client: OAuth2Client;
  private tokenManager: OAuthTokenManager;
  private refreshBufferMs: number;

  constructor(config: TokenRefreshConfig) {
    this.config = config;
    this.refreshBufferMs = config.refreshBufferMs || 5 * 60 * 1000;
    this.oauth2Client = new OAuth2Client(config.clientId, config.clientSecret);
    this.tokenManager = getOAuthTokenManager(config.redis);

    // Register refresh callback
    this.tokenManager.registerRefreshCallback(
      'google_workspace',
      this.refreshToken.bind(this)
    );
  }

  /**
   * Refresh Google OAuth token
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        return {
          success: false,
          error: 'No access token received',
        };
      }

      const tokens: OAuthTokens = {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken,
        expiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
        tokenType: credentials.token_type || 'Bearer',
        scope: credentials.scope || undefined,
        idToken: credentials.id_token || undefined,
      };

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(instanceId: string): Promise<string | null> {
    return this.tokenManager.getValidAccessToken('google_workspace', instanceId);
  }

  /**
   * Store tokens
   */
  async storeTokens(instanceId: string, tokens: OAuthTokens): Promise<void> {
    await this.tokenManager.storeTokens('google_workspace', instanceId, tokens);
  }

  /**
   * Get stored tokens
   */
  async getTokens(instanceId: string): Promise<OAuthTokens | null> {
    return this.tokenManager.getTokens('google_workspace', instanceId);
  }

  /**
   * Check if tokens need refresh
   */
  async needsRefresh(instanceId: string): Promise<boolean> {
    const tokens = await this.getTokens(instanceId);

    if (!tokens) {
      return false; // No tokens means we need auth, not refresh
    }

    return tokens.expiresAt.getTime() - Date.now() < this.refreshBufferMs;
  }

  /**
   * Force refresh tokens
   */
  async forceRefresh(instanceId: string): Promise<TokenRefreshResult> {
    const tokens = await this.getTokens(instanceId);

    if (!tokens?.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
      };
    }

    return this.tokenManager.refreshTokens(
      'google_workspace',
      instanceId,
      tokens.refreshToken
    );
  }

  /**
   * Delete stored tokens
   */
  async deleteTokens(instanceId: string): Promise<void> {
    await this.tokenManager.deleteTokens('google_workspace', instanceId);
  }

  /**
   * Check if instance has valid tokens
   */
  async hasValidTokens(instanceId: string): Promise<boolean> {
    return this.tokenManager.isTokenValid('google_workspace', instanceId);
  }

  /**
   * Get token expiration time
   */
  async getTokenExpiration(instanceId: string): Promise<Date | null> {
    return this.tokenManager.getTokenExpiration('google_workspace', instanceId);
  }

  /**
   * Create OAuth2 client with current tokens
   */
  async createAuthenticatedClient(instanceId: string): Promise<OAuth2Client | null> {
    const accessToken = await this.getValidAccessToken(instanceId);

    if (!accessToken) {
      return null;
    }

    const tokens = await this.getTokens(instanceId);

    const client = new OAuth2Client(
      this.config.clientId,
      this.config.clientSecret
    );

    client.setCredentials({
      access_token: accessToken,
      refresh_token: tokens?.refreshToken,
      expiry_date: tokens?.expiresAt.getTime(),
      token_type: tokens?.tokenType,
    });

    return client;
  }
}

/**
 * Create token refresh handler
 */
export function createGoogleTokenRefreshHandler(
  config: TokenRefreshConfig
): GoogleTokenRefreshHandler {
  return new GoogleTokenRefreshHandler(config);
}

/**
 * Singleton instance for the application
 */
let tokenRefreshHandlerInstance: GoogleTokenRefreshHandler | null = null;

export function getGoogleTokenRefreshHandler(
  config?: TokenRefreshConfig
): GoogleTokenRefreshHandler {
  if (!tokenRefreshHandlerInstance) {
    if (!config) {
      throw new Error('Config required for first initialization');
    }
    tokenRefreshHandlerInstance = new GoogleTokenRefreshHandler(config);
  }
  return tokenRefreshHandlerInstance;
}
