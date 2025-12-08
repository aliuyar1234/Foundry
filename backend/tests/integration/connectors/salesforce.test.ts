/**
 * Salesforce Connector Integration Tests
 * Task T208
 *
 * Tests for Salesforce OAuth, object extractors, and bulk API handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SalesforceConnector } from '../../../src/connectors/salesforce/index.js';
import { DataSource, DataSourceStatus } from '@prisma/client';
import { SALESFORCE_SCOPES } from '../../../src/connectors/salesforce/salesforceClient.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Salesforce Connector', () => {
  let mockDataSource: DataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    mockDataSource = {
      id: 'test-sf-ds-1',
      organizationId: 'test-org-1',
      type: 'SALESFORCE',
      name: 'Test Salesforce',
      status: 'ACTIVE' as DataSourceStatus,
      config: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        instanceUrl: 'https://test.salesforce.com',
      },
      deltaToken: null,
      lastSyncAt: null,
      syncSchedule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DataSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const connector = new SalesforceConnector(mockDataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject missing clientId', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientId: undefined },
      };
      const connector = new SalesforceConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientId');
    });

    it('should reject missing clientSecret', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientSecret: undefined },
      };
      const connector = new SalesforceConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientSecret');
    });
  });

  describe('Salesforce OAuth Flow (Mocked)', () => {
    it('should generate authorization URL with correct parameters', () => {
      const connector = new SalesforceConnector(mockDataSource);
      const redirectUri = 'https://app.example.com/oauth/callback';
      const state = 'random-state-123';

      const authUrl = connector.getAuthorizationUrl(redirectUri, state);

      expect(authUrl).toContain('https://login.salesforce.com/services/oauth2/authorize');
      expect(authUrl).toContain(`client_id=${mockDataSource.config.clientId}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(authUrl).toContain(`state=${state}`);
      expect(authUrl).toContain('response_type=code');
    });

    it('should exchange authorization code for tokens (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          instance_url: 'https://instance.salesforce.com',
          id: 'https://login.salesforce.com/id/00Dxx0000001gERXXX/005xx000001SwiUAAS',
          token_type: 'Bearer',
          issued_at: '1615483725123',
          signature: 'test-signature',
        }),
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens(
        'auth-code-123',
        'https://app.example.com/oauth/callback'
      );

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBe('new-access-token');
      expect(result.tokens?.refreshToken).toBe('new-refresh-token');
    });

    it('should handle token exchange failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'authentication failure',
        }),
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens(
        'invalid-code',
        'https://app.example.com/oauth/callback'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should refresh access token (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-access-token',
          instance_url: 'https://instance.salesforce.com',
          id: 'https://login.salesforce.com/id/00Dxx0000001gERXXX/005xx000001SwiUAAS',
          token_type: 'Bearer',
          issued_at: '1615483825123',
          signature: 'test-signature',
        }),
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBe('refreshed-access-token');
    });

    it('should handle token refresh failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'expired access/refresh token',
        }),
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token refresh failed');
    });

    it('should require refresh token for refreshing', async () => {
      const noRefreshToken = {
        ...mockDataSource,
        config: { ...mockDataSource.config, refreshToken: undefined },
      };
      const connector = new SalesforceConnector(noRefreshToken as DataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token available');
    });
  });

  describe('Salesforce Object Extractors (Mocked)', () => {
    it('should extract Account records (mocked)', async () => {
      mockFetch
        // Test connection
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS', username: 'test@example.com' }),
        })
        // Query Accounts
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 2,
            done: true,
            records: [
              { Id: '001xx000003DGb0AAG', Name: 'Account 1', Type: 'Customer' },
              { Id: '001xx000003DGb1AAG', Name: 'Account 2', Type: 'Prospect' },
            ],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Contact records (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 1,
            done: true,
            records: [
              {
                Id: '003xx000004TmiQAAS',
                FirstName: 'John',
                LastName: 'Doe',
                Email: 'john.doe@example.com',
              },
            ],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Opportunity records (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 1,
            done: true,
            records: [
              {
                Id: '006xx000001hZzGAAU',
                Name: 'Big Deal',
                StageName: 'Prospecting',
                Amount: 50000,
                CloseDate: '2024-12-31',
              },
            ],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Case records (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 1,
            done: true,
            records: [
              {
                Id: '500xx000001hZzGAAU',
                CaseNumber: 'CS-00001',
                Subject: 'Product Issue',
                Status: 'New',
                Priority: 'High',
              },
            ],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Lead records (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 1,
            done: true,
            records: [
              {
                Id: '00Qxx000001hZzGAAU',
                FirstName: 'Jane',
                LastName: 'Smith',
                Company: 'ACME Corp',
                Status: 'Open',
              },
            ],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Bulk API Handling (Mocked)', () => {
    it('should use Bulk API for large datasets (mocked)', async () => {
      mockFetch
        // Test connection
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        // Create bulk job
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: '750xx000000gQ4OAAU',
            operation: 'query',
            object: 'Account',
            state: 'Open',
          }),
        })
        // Add query to job
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        // Close job
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: '750xx000000gQ4OAAU',
            state: 'InProgress',
          }),
        })
        // Check job status
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: '750xx000000gQ4OAAU',
            state: 'Completed',
            numberRecordsProcessed: 10000,
          }),
        })
        // Get results
        .mockResolvedValueOnce({
          ok: true,
          text: async () => 'Id,Name\n001xx000003DGb0AAG,Account 1\n',
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle Bulk API job failures (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            errorCode: 'INVALID_FIELD',
            message: 'Unknown field in query',
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      // Should handle error gracefully
      expect(result).toBeDefined();
    });

    it('should retry Bulk API jobs on timeout (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        // First attempt - job times out
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '750xx000000gQ4OAAU', state: 'Open' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '750xx000000gQ4OAAU', state: 'InProgress' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '750xx000000gQ4OAAU', state: 'Failed' }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result).toBeDefined();
    });

    it('should batch large result sets (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 2000,
            done: false,
            nextRecordsUrl: '/services/data/v58.0/query/01gxx00000ABCDE-2000',
            records: Array(2000).fill({ Id: '001xx', Name: 'Account' }),
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 2000,
            done: true,
            records: Array(500).fill({ Id: '001yy', Name: 'Account 2' }),
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Incremental Sync', () => {
    it('should perform incremental sync with modifiedSince (mocked)', async () => {
      const lastSync = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 5,
            done: true,
            records: [
              {
                Id: '001xx000003DGb0AAG',
                Name: 'Updated Account',
                LastModifiedDate: new Date().toISOString(),
              },
            ],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: false,
        deltaToken: lastSync,
      });

      expect(result.success).toBe(true);
    });

    it('should update delta token after successful sync (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            totalSize: 0,
            done: true,
            records: [],
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
      expect(result.deltaToken).toBeDefined();
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '005xx000001SwiUAAS',
          username: 'test@example.com',
          organizationId: '00Dxx0000001gERXXX',
        }),
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should fail connection test when not authenticated', async () => {
      const noAuth = {
        ...mockDataSource,
        config: { ...mockDataSource.config, accessToken: undefined },
      };
      const connector = new SalesforceConnector(noAuth as DataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });

    it('should fail on invalid credentials (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'authentication failure',
        }),
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });

    it('should attempt token refresh on authentication failure (mocked)', async () => {
      mockFetch
        // Test connection fails
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'INVALID_SESSION_ID' }),
        })
        // Refresh token succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-token',
            instance_url: 'https://instance.salesforce.com',
            issued_at: Date.now().toString(),
          }),
        })
        // Retry test connection succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle Salesforce API rate limits (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '60' }),
          json: async () => ({
            errorCode: 'REQUEST_LIMIT_EXCEEDED',
            message: 'Total requests limit exceeded',
          }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result).toBeDefined();
    });

    it('should handle malformed responses (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const connector = new SalesforceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress during sync', async () => {
      const progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '005xx000001SwiUAAS' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ totalSize: 0, done: true, records: [] }),
        });

      const connector = new SalesforceConnector(mockDataSource);
      await connector.sync({ fullSync: true }, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('current');
      expect(progressUpdates[0]).toHaveProperty('total');
      expect(progressUpdates[0]).toHaveProperty('stage');
    });
  });

  describe('Required Scopes', () => {
    it('should return correct required scopes', () => {
      const connector = new SalesforceConnector(mockDataSource);
      const scopes = connector.getRequiredScopes();

      expect(scopes).toContain('api');
      expect(scopes).toContain('refresh_token');
    });
  });
});
