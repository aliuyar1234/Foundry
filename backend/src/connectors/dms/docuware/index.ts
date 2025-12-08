/**
 * Docuware DMS Connector
 * Main connector implementation for Docuware document management system
 */

import { DataSource } from '@prisma/client';
import {
  BaseConnector,
  AuthResult,
  SyncResult,
  SyncOptions,
  SyncProgressCallback,
} from '../../base/connector.js';
import {
  DocuwareAuthConfig,
  DocuwareAuthHandler,
  createDocuwareAuthHandler,
  validateDocuwareConfig,
  authenticateWithPassword,
  authenticateWithOAuth,
  refreshAccessToken,
  getAuthorizationUrl,
} from './auth.js';
import {
  DocuwareClient,
  createDocuwareClient,
} from './docuwareClient.js';
import {
  extractAllDocuwareData,
  DocuwareExtractionOptions,
} from './extractors/index.js';

export interface DocuwareConnectorConfig extends DocuwareAuthConfig {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  organizationId?: string;
  userId?: string;
}

export class DocuwareConnector extends BaseConnector {
  private authHandler: DocuwareAuthHandler | null = null;

  get type(): string {
    return 'DOCUWARE';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const config = this.config as Partial<DocuwareConnectorConfig>;
    const result = validateDocuwareConfig(config);
    return {
      valid: result.valid,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const config = this.getAuthConfig();

    // OAuth is only supported if clientId is configured
    if (!config.clientId) {
      throw new Error('OAuth not configured. Use password authentication instead.');
    }

    return getAuthorizationUrl(config, redirectUri, state);
  }

  /**
   * Exchange authorization code for tokens (OAuth)
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<AuthResult> {
    const config = this.getAuthConfig();

    if (!config.clientId) {
      return {
        success: false,
        error: 'OAuth not configured',
      };
    }

    try {
      const result = await authenticateWithOAuth(config, code, redirectUri);

      if (result.success && result.tokens) {
        this.updateConfig({
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresAt: result.tokens.expiresAt.toISOString(),
          organizationId: result.organizationId,
          userId: result.userId,
        });

        return {
          success: true,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresAt: result.tokens.expiresAt,
        };
      }

      return {
        success: false,
        error: result.error || 'Token exchange failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      };
    }
  }

  /**
   * Authenticate with password (alternative to OAuth)
   */
  async authenticateWithPassword(): Promise<AuthResult> {
    const config = this.getAuthConfig();

    if (!config.password) {
      return {
        success: false,
        error: 'Password not configured',
      };
    }

    try {
      const result = await authenticateWithPassword(config);

      if (result.success && result.tokens) {
        this.updateConfig({
          accessToken: result.tokens.accessToken,
          expiresAt: result.tokens.expiresAt.toISOString(),
          organizationId: result.organizationId,
          userId: result.userId,
        });

        return {
          success: true,
          accessToken: result.tokens.accessToken,
          expiresAt: result.tokens.expiresAt,
        };
      }

      return {
        success: false,
        error: result.error || 'Authentication failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Refresh access token (OAuth only)
   */
  async refreshAccessToken(): Promise<AuthResult> {
    const config = this.getAuthConfig();
    const currentRefreshToken = this.config.refreshToken as string;

    if (!currentRefreshToken) {
      // If no refresh token, try password authentication
      if (config.password) {
        return this.authenticateWithPassword();
      }

      return {
        success: false,
        error: 'No refresh token available',
      };
    }

    try {
      const result = await refreshAccessToken(config, currentRefreshToken);

      if (result.success && result.tokens) {
        this.updateConfig({
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken || currentRefreshToken,
          expiresAt: result.tokens.expiresAt.toISOString(),
        });

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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * Test connection to Docuware
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = this.config as DocuwareConnectorConfig;

    if (!config.accessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const client = createDocuwareClient(this.getAuthConfig(), config.accessToken);
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
    const config = this.config as DocuwareConnectorConfig;

    if (!config.accessToken) {
      return { success: false, eventsCount: 0, error: 'Not authenticated' };
    }

    try {
      onProgress?.({
        current: 0,
        total: 100,
        stage: 'initializing',
        message: 'Connecting to Docuware...',
      });

      // Check if token needs refresh
      if (config.expiresAt && new Date(config.expiresAt) <= new Date()) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, eventsCount: 0, error: 'Authentication failed' };
        }
      }

      const client = createDocuwareClient(this.getAuthConfig(), config.accessToken);

      // Verify connection
      const connected = await client.testConnection();
      if (!connected) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return { success: false, eventsCount: 0, error: 'Authentication failed' };
        }
      }

      onProgress?.({
        current: 10,
        total: 100,
        stage: 'cabinets',
        message: 'Discovering document cabinets...',
      });

      // Get all active cabinets if not specified
      let cabinetIds: string[] | undefined = undefined;
      if (!options.fullSync) {
        // For incremental sync, use all non-archived cabinets
        const cabinets = await client.getCabinets();
        cabinetIds = cabinets
          .filter(c => !c.IsBasket && !c.Archived)
          .map(c => c.Id);
      }

      onProgress?.({
        current: 20,
        total: 100,
        stage: 'documents',
        message: 'Extracting document metadata...',
      });

      // Determine lookback date
      const lookbackMonths = options.lookbackMonths || 6;
      const modifiedSince = options.fullSync
        ? undefined
        : options.deltaToken
          ? new Date(options.deltaToken)
          : new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000);

      // Prepare extraction options
      const extractionOptions: DocuwareExtractionOptions = {
        organizationId: this.organizationId,
        cabinetIds,
        modifiedSince,
        extractCabinets: true,
        extractDocuments: true,
        extractWorkflows: true,
        extractApprovals: true,
        extractVersions: true,
        maxDocuments: options.fullSync ? undefined : 1000,
      };

      onProgress?.({
        current: 40,
        total: 100,
        stage: 'workflows',
        message: 'Extracting workflow states...',
      });

      onProgress?.({
        current: 60,
        total: 100,
        stage: 'approvals',
        message: 'Extracting approval chains...',
      });

      onProgress?.({
        current: 80,
        total: 100,
        stage: 'versions',
        message: 'Extracting version history...',
      });

      // Extract all data
      const result = await extractAllDocuwareData(client, extractionOptions);

      onProgress?.({
        current: 100,
        total: 100,
        stage: 'complete',
        message: `Sync complete. Processed ${result.stats.totalEvents} events.`,
      });

      return {
        success: true,
        eventsCount: result.stats.totalEvents,
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
   * Get required scopes (OAuth)
   */
  getRequiredScopes(): string[] {
    return ['full']; // Docuware uses 'full' scope for complete API access
  }

  /**
   * Get auth configuration
   */
  private getAuthConfig(): DocuwareAuthConfig {
    const config = this.config as DocuwareConnectorConfig;
    return {
      hostUrl: config.hostUrl,
      username: config.username,
      password: config.password,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      environment: config.environment,
    };
  }

  /**
   * Get or create auth handler
   */
  private getAuthHandler(): DocuwareAuthHandler {
    if (!this.authHandler) {
      this.authHandler = createDocuwareAuthHandler(this.getAuthConfig());
    }
    return this.authHandler;
  }
}

// Export all types and utilities
export * from './auth.js';
export * from './docuwareClient.js';
export * from './extractors/index.js';
