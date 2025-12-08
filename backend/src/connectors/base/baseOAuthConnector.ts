/**
 * Base OAuth Connector
 * Task: T002
 *
 * Abstract base class for OAuth 2.0 based connectors.
 * Handles token refresh, storage, and common OAuth operations.
 */

import { DataSource } from '@prisma/client';
import {
  BaseConnector,
  AuthResult,
  SyncResult,
  SyncOptions,
  SyncProgressCallback,
  ConnectorCapabilities,
  RateLimitCallbacks,
  HealthCheckResult,
  SyncCheckpoint,
  IDataConnector,
  ExtendedConnectorConfig,
} from './connector';
import {
  OAuthTokenManager,
  OAuthTokens,
  getOAuthTokenManager,
} from './oauthTokenManager';
import { RateLimiter, createConnectorRateLimiter } from './rateLimiter';
import { Redis } from 'ioredis';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri?: string;
}

export interface OAuthConnectorOptions {
  redis?: Redis | null;
  tokenManager?: OAuthTokenManager;
  rateLimiter?: RateLimiter;
}

/**
 * Abstract base class for OAuth-based connectors
 */
export abstract class BaseOAuthConnector
  extends BaseConnector
  implements IDataConnector
{
  protected tokenManager: OAuthTokenManager;
  protected rateLimiter: RateLimiter | null;
  protected oauthConfig: OAuthConfig;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(
    dataSource: DataSource,
    oauthConfig: OAuthConfig,
    options: OAuthConnectorOptions = {}
  ) {
    super(dataSource);
    this.oauthConfig = oauthConfig;
    this.tokenManager =
      options.tokenManager || getOAuthTokenManager(options.redis);
    this.rateLimiter =
      options.rateLimiter ||
      (options.redis
        ? createConnectorRateLimiter(options.redis, this.type)
        : null);

    // Register refresh callback for this connector type
    this.tokenManager.registerRefreshCallback(
      this.type,
      this.performTokenRefresh.bind(this)
    );
  }

  /**
   * Connector capabilities - must be implemented by subclasses
   */
  abstract get capabilities(): ConnectorCapabilities;

  /**
   * Get the OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.oauthConfig.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.oauthConfig.scopes.join(' '),
      state: state,
      access_type: 'offline',
      prompt: 'consent',
    });

    // Allow subclasses to add custom parameters
    this.addAuthorizationParams(params);

    return `${this.oauthConfig.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Override to add custom authorization parameters
   */
  protected addAuthorizationParams(_params: URLSearchParams): void {
    // Default: no additional params
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<AuthResult> {
    try {
      const tokens = await this.performTokenExchange(code, redirectUri);

      // Store tokens
      await this.tokenManager.storeTokens(
        this.type,
        this.dataSourceId,
        tokens
      );

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Token exchange failed';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Perform the actual token exchange - implement in subclass
   */
  protected abstract performTokenExchange(
    code: string,
    redirectUri: string
  ): Promise<OAuthTokens>;

  /**
   * Perform token refresh - implement in subclass
   */
  protected abstract performTokenRefresh(
    refreshToken: string
  ): Promise<{ success: boolean; tokens?: OAuthTokens; error?: string }>;

  /**
   * Refresh the access token
   */
  async refreshAccessToken(): Promise<AuthResult> {
    const tokens = await this.tokenManager.getTokens(
      this.type,
      this.dataSourceId
    );

    if (!tokens?.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
      };
    }

    const result = await this.tokenManager.refreshTokens(
      this.type,
      this.dataSourceId,
      tokens.refreshToken
    );

    if (result.success && result.tokens) {
      return {
        success: true,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresAt: result.tokens.expiresAt,
      };
    }

    return {
      success: false,
      error: result.error || 'Token refresh failed',
    };
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  protected async getValidAccessToken(): Promise<string | null> {
    return this.tokenManager.getValidAccessToken(this.type, this.dataSourceId);
  }

  /**
   * Check if authenticated with valid tokens
   */
  isAuthenticated(): boolean {
    // Synchronous check - use cached config
    const accessToken = this.config.accessToken as string | undefined;
    const expiresAt = this.config.tokenExpiresAt as string | undefined;

    if (!accessToken) {
      return false;
    }

    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      return expiryDate.getTime() > Date.now() + 5 * 60 * 1000;
    }

    return true;
  }

  /**
   * Async authentication check with token manager
   */
  async isAuthenticatedAsync(): Promise<boolean> {
    return this.tokenManager.isTokenValid(this.type, this.dataSourceId);
  }

  /**
   * Test the connection
   */
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * Health check with latency measurement
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Check if we have valid tokens
      const hasTokens = await this.tokenManager.hasTokens(
        this.type,
        this.dataSourceId
      );

      if (!hasTokens) {
        return {
          healthy: false,
          status: 'disconnected',
          error: 'No authentication tokens found',
        };
      }

      // Check token validity
      const isValid = await this.tokenManager.isTokenValid(
        this.type,
        this.dataSourceId
      );

      if (!isValid) {
        // Try to refresh
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return {
            healthy: false,
            status: 'error',
            error: 'Token refresh failed: ' + refreshResult.error,
          };
        }
      }

      // Test actual connection
      const connectionTest = await this.testConnection();
      const latencyMs = Date.now() - startTime;

      if (!connectionTest.success) {
        return {
          healthy: false,
          status: 'error',
          latencyMs,
          error: connectionTest.error,
        };
      }

      return {
        healthy: true,
        status: latencyMs > 5000 ? 'degraded' : 'connected',
        latencyMs,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  /**
   * Sync with rate limiting support
   */
  async sync(
    options: SyncOptions,
    callbacks?: {
      onProgress?: SyncProgressCallback;
      onRateLimit?: RateLimitCallbacks;
    }
  ): Promise<SyncResult> {
    // Ensure we have a valid token before starting
    const accessToken = await this.getValidAccessToken();
    if (!accessToken) {
      return {
        success: false,
        eventsCount: 0,
        error: 'No valid access token available',
      };
    }

    // Perform the sync with rate limiting wrapper if available
    if (this.rateLimiter) {
      return this.rateLimiter.executeWithLimit(
        this.dataSourceId,
        () =>
          this.performSync(options, callbacks?.onProgress, callbacks?.onRateLimit),
        (state) => {
          if (callbacks?.onRateLimit?.onRateLimitHit) {
            callbacks.onRateLimit.onRateLimitHit(state.resetAt - Date.now());
          }
        }
      );
    }

    return this.performSync(
      options,
      callbacks?.onProgress,
      callbacks?.onRateLimit
    );
  }

  /**
   * Perform the actual sync - implement in subclass
   */
  protected abstract performSync(
    options: SyncOptions,
    onProgress?: SyncProgressCallback,
    onRateLimit?: RateLimitCallbacks
  ): Promise<SyncResult>;

  /**
   * Get required OAuth scopes
   */
  getRequiredScopes(): string[] {
    return this.oauthConfig.scopes;
  }

  /**
   * Get checkpoint for a resource
   */
  async getCheckpoint(resource: string): Promise<SyncCheckpoint | null> {
    const key = `${this.type}:${this.dataSourceId}:${resource}`;
    return this.checkpoints.get(key) || null;
  }

  /**
   * Save checkpoint for a resource
   */
  async saveCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
    const key = `${checkpoint.connectorType}:${checkpoint.instanceId}:${checkpoint.resource}`;
    this.checkpoints.set(key, checkpoint);
  }

  /**
   * Clear checkpoint for a resource
   */
  async clearCheckpoint(resource: string): Promise<void> {
    const key = `${this.type}:${this.dataSourceId}:${resource}`;
    this.checkpoints.delete(key);
  }

  /**
   * Execute an API call with automatic token refresh
   */
  protected async executeWithTokenRefresh<T>(
    apiCall: (accessToken: string) => Promise<T>
  ): Promise<T> {
    let accessToken = await this.getValidAccessToken();

    if (!accessToken) {
      throw new Error('No valid access token available');
    }

    try {
      return await apiCall(accessToken);
    } catch (error) {
      // Check if it's an auth error (401)
      if (this.isAuthError(error)) {
        // Try to refresh token
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          throw new Error('Token refresh failed: ' + refreshResult.error);
        }

        accessToken = await this.getValidAccessToken();
        if (!accessToken) {
          throw new Error('No valid access token after refresh');
        }

        // Retry the call
        return await apiCall(accessToken);
      }

      throw error;
    }
  }

  /**
   * Check if an error is an authentication error
   */
  protected isAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('401') ||
        message.includes('unauthorized') ||
        message.includes('invalid_token') ||
        message.includes('token expired')
      );
    }
    return false;
  }

  /**
   * Revoke tokens and cleanup
   */
  async disconnect(): Promise<void> {
    await this.tokenManager.deleteTokens(this.type, this.dataSourceId);
  }
}
