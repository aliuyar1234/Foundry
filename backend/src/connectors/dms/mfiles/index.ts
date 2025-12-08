/**
 * M-Files DMS Connector
 * Main connector implementation for M-Files document management system
 */

import { DataSource } from '@prisma/client';
import {
  BaseConnector,
  AuthResult,
  SyncResult,
  SyncOptions,
  SyncProgressCallback,
  ExtractedEvent,
} from '../../base/connector.js';
import {
  MFilesAuthConfig,
  authenticateToVault,
  refreshAuthToken,
  validateMFilesConfig,
  testAuthentication,
  getAvailableVaults,
} from './auth.js';
import { MFilesClient, createMFilesClient } from './mfilesClient.js';
import {
  extractVaultMetadata,
  extractPropertyDefinitionsMetadata,
  createVaultStructureSummaryEvent,
} from './extractors/vaults.js';
import { extractDocuments } from './extractors/documents.js';
import { extractAllWorkflows, extractObjectWorkflowStates } from './extractors/workflows.js';
import { extractMultipleVersionHistories } from './extractors/versions.js';

export class MFilesConnector extends BaseConnector {
  get type(): string {
    return 'MFILES';
  }

  /**
   * Validate connector configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const config = this.config as Partial<MFilesAuthConfig>;
    const result = validateMFilesConfig(config);
    return result;
  }

  /**
   * Get authorization URL for OAuth flow
   * Note: M-Files uses basic authentication, not OAuth
   * This method returns a placeholder URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    // M-Files doesn't use OAuth, so we return a placeholder
    // In a real implementation, you might redirect to a custom auth page
    return `${redirectUri}?state=${state}&auth_type=mfiles`;
  }

  /**
   * Exchange authorization code for tokens
   * Note: M-Files uses username/password authentication
   */
  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthResult> {
    try {
      const config = this.getAuthConfig();
      const tokens = await authenticateToVault(config);

      this.updateConfig({
        authToken: tokens.token,
        vaultGuid: tokens.vaultGuid,
        tokenExpiresAt: tokens.expiresAt.toISOString(),
      });

      return {
        success: true,
        accessToken: tokens.token,
        expiresAt: tokens.expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<AuthResult> {
    try {
      const config = this.getAuthConfig();
      const tokens = await refreshAuthToken(config);

      this.updateConfig({
        authToken: tokens.token,
        vaultGuid: tokens.vaultGuid,
        tokenExpiresAt: tokens.expiresAt.toISOString(),
      });

      return {
        success: true,
        accessToken: tokens.token,
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
   * Test connection to M-Files vault
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const config = this.getAuthConfig();
      const authToken = this.config.authToken as string;
      const vaultGuid = this.config.vaultGuid as string;

      if (!authToken || !vaultGuid) {
        return { success: false, error: 'Not authenticated' };
      }

      const success = await testAuthentication(
        config.serverUrl,
        vaultGuid,
        authToken
      );

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

      const authToken = this.config.authToken as string;
      const vaultGuid = this.config.vaultGuid as string;
      const serverUrl = this.config.serverUrl as string;

      const client = createMFilesClient({
        serverUrl,
        vaultGuid,
        authToken,
      });

      const allEvents: ExtractedEvent[] = [];

      // Stage 1: Extract vault metadata and structure
      onProgress?.({
        current: 10,
        total: 100,
        stage: 'vault',
        message: 'Analyzing vault structure...',
      });

      const vaultResult = await extractVaultMetadata(client, this.organizationId);
      allEvents.push(...vaultResult.events);

      // Create vault summary event
      const vaultSummary = createVaultStructureSummaryEvent(
        vaultGuid,
        vaultResult.metadata.vaultName,
        vaultResult.structure,
        this.organizationId
      );
      allEvents.push(vaultSummary);

      // Stage 2: Extract workflows if enabled
      onProgress?.({
        current: 30,
        total: 100,
        stage: 'workflows',
        message: 'Extracting workflows...',
      });

      const workflowResult = await extractAllWorkflows(
        client,
        vaultGuid,
        this.organizationId
      );
      allEvents.push(...workflowResult.events);

      // Stage 3: Extract documents from each object type
      const objectTypes = vaultResult.structure.objectTypes.filter(
        (ot) => ot.RealObjectType
      );

      let processedTypes = 0;
      const totalTypes = objectTypes.length;

      for (const objectType of objectTypes) {
        onProgress?.({
          current: 30 + Math.round((processedTypes / totalTypes) * 50),
          total: 100,
          stage: 'documents',
          message: `Syncing ${objectType.Name}...`,
        });

        try {
          // Extract documents
          const documentResult = await extractDocuments(
            client,
            objectType.ID,
            vaultGuid,
            this.organizationId,
            {
              modifiedSince: options.fullSync
                ? undefined
                : this.getLastSyncDate(options.lookbackMonths),
            }
          );

          allEvents.push(...documentResult.events);

          // Extract workflow states for these documents
          if (workflowResult.workflows.length > 0) {
            const workflowStateResult = await extractObjectWorkflowStates(
              client,
              objectType.ID,
              vaultGuid,
              this.organizationId,
              {
                modifiedSince: options.fullSync
                  ? undefined
                  : this.getLastSyncDate(options.lookbackMonths),
              }
            );
            allEvents.push(...workflowStateResult.events);
          }

          // Extract version history for modified documents (sample)
          if (documentResult.documents.length > 0) {
            const sampleDocuments = documentResult.documents
              .slice(0, Math.min(10, documentResult.documents.length))
              .map((d) => d.objectId);

            if (sampleDocuments.length > 0) {
              const versionResult = await extractMultipleVersionHistories(
                client,
                objectType.ID,
                sampleDocuments,
                vaultGuid,
                this.organizationId
              );
              allEvents.push(...versionResult.events);
            }
          }
        } catch (error) {
          console.error(`Failed to sync object type ${objectType.Name}:`, error);
        }

        processedTypes++;
      }

      onProgress?.({
        current: 100,
        total: 100,
        stage: 'complete',
        message: `Sync complete. Processed ${allEvents.length} events.`,
      });

      // Store delta token (last sync timestamp)
      const deltaToken = JSON.stringify({
        lastSync: new Date().toISOString(),
        vaultGuid,
      });

      return {
        success: true,
        eventsCount: allEvents.length,
        deltaToken,
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
   * Get required OAuth scopes (not applicable for M-Files)
   */
  getRequiredScopes(): string[] {
    return []; // M-Files uses basic authentication, not OAuth scopes
  }

  /**
   * Get available vaults for this M-Files server
   */
  async getAvailableVaults(): Promise<Array<{ guid: string; name: string }>> {
    const config = this.getAuthConfig();
    const vaults = await getAvailableVaults(config.serverUrl);

    return vaults.map((vault) => ({
      guid: vault.GUID,
      name: vault.Name,
    }));
  }

  /**
   * Get auth configuration
   */
  private getAuthConfig(): MFilesAuthConfig {
    return {
      serverUrl: this.config.serverUrl as string,
      username: this.config.username as string,
      password: this.config.password as string,
      vaultGuid: this.config.vaultGuid as string | undefined,
      authenticationType: this.config.authenticationType as
        | 'MFAuthTypeSpecificMFilesUser'
        | 'MFAuthTypeSpecificWindowsUser'
        | undefined,
    };
  }

  /**
   * Get last sync date based on lookback months
   */
  private getLastSyncDate(lookbackMonths?: number): Date | undefined {
    if (!lookbackMonths) {
      return undefined;
    }

    const date = new Date();
    date.setMonth(date.getMonth() - lookbackMonths);
    return date;
  }

  /**
   * Check if connector is properly authenticated
   */
  override isAuthenticated(): boolean {
    const authToken = this.config.authToken as string | undefined;
    const vaultGuid = this.config.vaultGuid as string | undefined;
    const expiresAt = this.config.tokenExpiresAt as string | undefined;

    if (!authToken || !vaultGuid) {
      return false;
    }

    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      // Consider expired if within 1 hour
      return expiryDate.getTime() > Date.now() + 60 * 60 * 1000;
    }

    return true;
  }
}
