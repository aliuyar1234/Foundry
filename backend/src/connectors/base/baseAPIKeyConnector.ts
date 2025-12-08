/**
 * Base API Key Connector
 * Task: T003
 *
 * Abstract base class for API key based connectors.
 * Handles credential storage, validation, and common operations.
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
} from './connector';
import { RateLimiter, createConnectorRateLimiter } from './rateLimiter';
import { Redis } from 'ioredis';

export interface APIKeyConfig {
  apiKey?: string;
  apiSecret?: string;
  baseUrl: string;
  authHeader?: string; // Default: 'Authorization'
  authPrefix?: string; // Default: 'Bearer'
  additionalHeaders?: Record<string, string>;
}

export interface APIKeyConnectorOptions {
  redis?: Redis | null;
  rateLimiter?: RateLimiter;
}

/**
 * Abstract base class for API key-based connectors
 */
export abstract class BaseAPIKeyConnector
  extends BaseConnector
  implements IDataConnector
{
  protected apiKeyConfig: APIKeyConfig;
  protected rateLimiter: RateLimiter | null;
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  constructor(
    dataSource: DataSource,
    apiKeyConfig: APIKeyConfig,
    options: APIKeyConnectorOptions = {}
  ) {
    super(dataSource);
    this.apiKeyConfig = apiKeyConfig;
    this.rateLimiter =
      options.rateLimiter ||
      (options.redis
        ? createConnectorRateLimiter(options.redis, this.type)
        : null);
  }

  /**
   * Connector capabilities - must be implemented by subclasses
   */
  abstract get capabilities(): ConnectorCapabilities;

  /**
   * API key connectors don't use OAuth authorization URL
   */
  getAuthorizationUrl(_redirectUri: string, _state: string): string {
    throw new Error(
      'API key connectors do not support OAuth authorization flow'
    );
  }

  /**
   * API key connectors don't exchange codes for tokens
   */
  async exchangeCodeForTokens(
    _code: string,
    _redirectUri: string
  ): Promise<AuthResult> {
    return {
      success: false,
      error: 'API key connectors do not support OAuth token exchange',
    };
  }

  /**
   * API key connectors don't refresh tokens
   */
  async refreshAccessToken(): Promise<AuthResult> {
    return {
      success: false,
      error: 'API key connectors do not support token refresh',
    };
  }

  /**
   * Validate API credentials
   */
  async validateCredentials(
    apiKey: string,
    apiSecret?: string
  ): Promise<AuthResult> {
    try {
      const isValid = await this.performCredentialValidation(apiKey, apiSecret);

      if (isValid) {
        // Store credentials in config
        this.updateConfig({
          apiKey,
          apiSecret,
          authenticated: true,
        });

        return {
          success: true,
          accessToken: apiKey, // Use API key as access token for consistency
        };
      }

      return {
        success: false,
        error: 'Invalid API credentials',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Credential validation failed';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Perform credential validation - implement in subclass
   */
  protected abstract performCredentialValidation(
    apiKey: string,
    apiSecret?: string
  ): Promise<boolean>;

  /**
   * Check if authenticated with valid API key
   */
  isAuthenticated(): boolean {
    const apiKey =
      this.apiKeyConfig.apiKey || (this.config.apiKey as string | undefined);
    return !!apiKey;
  }

  /**
   * Get the API key for requests
   */
  protected getApiKey(): string | null {
    return (
      this.apiKeyConfig.apiKey ||
      (this.config.apiKey as string | undefined) ||
      null
    );
  }

  /**
   * Get the API secret for requests
   */
  protected getApiSecret(): string | null {
    return (
      this.apiKeyConfig.apiSecret ||
      (this.config.apiSecret as string | undefined) ||
      null
    );
  }

  /**
   * Get authentication headers for API requests
   */
  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const apiKey = this.getApiKey();

    if (apiKey) {
      const headerName = this.apiKeyConfig.authHeader || 'Authorization';
      const prefix = this.apiKeyConfig.authPrefix ?? 'Bearer';
      headers[headerName] = prefix ? `${prefix} ${apiKey}` : apiKey;
    }

    // Add any additional headers
    if (this.apiKeyConfig.additionalHeaders) {
      Object.assign(headers, this.apiKeyConfig.additionalHeaders);
    }

    return headers;
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
      // Check if we have API key
      const apiKey = this.getApiKey();

      if (!apiKey) {
        return {
          healthy: false,
          status: 'disconnected',
          error: 'No API key configured',
        };
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
    // Ensure we have API key
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        eventsCount: 0,
        error: 'No API key configured',
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
   * API key connectors don't have OAuth scopes
   */
  getRequiredScopes(): string[] {
    return [];
  }

  /**
   * Get required permissions/capabilities
   */
  abstract getRequiredPermissions(): string[];

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
   * Execute an API call with retry on transient errors
   */
  protected async executeWithRetry<T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a retryable error
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          throw lastError;
        }

        // Wait before retrying
        await this.sleep(delay);
        delay *= 2; // Exponential backoff
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if an error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504') ||
        message.includes('rate limit')
      );
    }
    return false;
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Build full URL from base and path
   */
  protected buildUrl(path: string, queryParams?: Record<string, string>): string {
    const baseUrl = this.apiKeyConfig.baseUrl.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    let url = `${baseUrl}/${cleanPath}`;

    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    return url;
  }

  /**
   * Update credentials
   */
  updateCredentials(apiKey: string, apiSecret?: string): void {
    this.apiKeyConfig.apiKey = apiKey;
    if (apiSecret !== undefined) {
      this.apiKeyConfig.apiSecret = apiSecret;
    }
    this.updateConfig({
      apiKey,
      apiSecret,
    });
  }

  /**
   * Clear credentials
   */
  clearCredentials(): void {
    this.apiKeyConfig.apiKey = undefined;
    this.apiKeyConfig.apiSecret = undefined;
    this.updateConfig({
      apiKey: undefined,
      apiSecret: undefined,
      authenticated: false,
    });
  }
}

/**
 * Session-based API connector for systems that use session tokens
 */
export abstract class BaseSessionConnector extends BaseAPIKeyConnector {
  protected sessionId: string | null = null;
  protected sessionExpiresAt: Date | null = null;

  /**
   * Create a new session
   */
  abstract createSession(): Promise<{
    success: boolean;
    sessionId?: string;
    expiresAt?: Date;
    error?: string;
  }>;

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    if (!this.sessionId) {
      return false;
    }

    if (this.sessionExpiresAt) {
      // Add 5 minute buffer
      return this.sessionExpiresAt.getTime() > Date.now() + 5 * 60 * 1000;
    }

    return true;
  }

  /**
   * Ensure valid session before making requests
   */
  protected async ensureSession(): Promise<string> {
    if (!this.isSessionValid()) {
      const result = await this.createSession();
      if (!result.success || !result.sessionId) {
        throw new Error('Failed to create session: ' + result.error);
      }
      this.sessionId = result.sessionId;
      this.sessionExpiresAt = result.expiresAt || null;
    }

    return this.sessionId!;
  }

  /**
   * Execute API call with automatic session management
   */
  protected async executeWithSession<T>(
    apiCall: (sessionId: string) => Promise<T>
  ): Promise<T> {
    const sessionId = await this.ensureSession();

    try {
      return await apiCall(sessionId);
    } catch (error) {
      // Check if session expired
      if (this.isSessionExpiredError(error)) {
        // Clear session and retry
        this.sessionId = null;
        this.sessionExpiresAt = null;
        const newSessionId = await this.ensureSession();
        return await apiCall(newSessionId);
      }
      throw error;
    }
  }

  /**
   * Check if error indicates session expiration
   */
  protected isSessionExpiredError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('session') ||
        message.includes('expired') ||
        message.includes('401')
      );
    }
    return false;
  }

  /**
   * Logout/destroy session
   */
  async logout(): Promise<void> {
    if (this.sessionId) {
      await this.destroySession(this.sessionId);
      this.sessionId = null;
      this.sessionExpiresAt = null;
    }
  }

  /**
   * Destroy session on the server
   */
  protected abstract destroySession(sessionId: string): Promise<void>;
}
