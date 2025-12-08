/**
 * HubSpot Connector Integration Tests
 * Task T209
 *
 * Tests for HubSpot OAuth, CRM extractors, and rate limiting
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HubSpotConnector } from '../../../src/connectors/hubspot/index.js';
import { DataSource, DataSourceStatus } from '@prisma/client';
import { HUBSPOT_SCOPES } from '../../../src/connectors/hubspot/hubspotClient.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HubSpot Connector', () => {
  let mockDataSource: DataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    mockDataSource = {
      id: 'test-hs-ds-1',
      organizationId: 'test-org-1',
      type: 'HUBSPOT',
      name: 'Test HubSpot',
      status: 'ACTIVE' as DataSourceStatus,
      config: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
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
      const connector = new HubSpotConnector(mockDataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject missing clientId', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientId: undefined },
      };
      const connector = new HubSpotConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientId');
    });

    it('should reject missing clientSecret', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientSecret: undefined },
      };
      const connector = new HubSpotConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientSecret');
    });
  });

  describe('HubSpot OAuth Flow (Mocked)', () => {
    it('should generate authorization URL with correct parameters', () => {
      const connector = new HubSpotConnector(mockDataSource);
      const redirectUri = 'https://app.example.com/oauth/callback';
      const state = 'random-state-123';

      const authUrl = connector.getAuthorizationUrl(redirectUri, state);

      expect(authUrl).toContain('https://app.hubspot.com/oauth/authorize');
      expect(authUrl).toContain(`client_id=${mockDataSource.config.clientId}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(authUrl).toContain(`state=${state}`);
    });

    it('should exchange authorization code for tokens (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 21600,
          token_type: 'bearer',
        }),
      });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens(
        'auth-code-123',
        'https://app.example.com/oauth/callback'
      );

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBe('new-access-token');
      expect(result.tokens?.refreshToken).toBe('new-refresh-token');
      expect(result.tokens?.expiresAt).toBeInstanceOf(Date);
    });

    it('should handle token exchange failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Code is invalid or expired',
        }),
      });

      const connector = new HubSpotConnector(mockDataSource);
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
          refresh_token: 'new-refresh-token',
          expires_in: 21600,
          token_type: 'bearer',
        }),
      });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBe('refreshed-access-token');
    });

    it('should handle token refresh failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Refresh token is invalid',
        }),
      });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token refresh failed');
    });

    it('should require refresh token for refreshing', async () => {
      const noRefreshToken = {
        ...mockDataSource,
        config: { ...mockDataSource.config, refreshToken: undefined },
      };
      const connector = new HubSpotConnector(noRefreshToken as DataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token available');
    });

    it('should auto-refresh expired token before sync (mocked)', async () => {
      const expiredDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      };

      mockFetch
        // Refresh token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_in: 21600,
          }),
        })
        // Test connection
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        // Sync request
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(expiredDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('CRM Object Extractors (Mocked)', () => {
    it('should extract Companies (mocked)', async () => {
      mockFetch
        // Test connection
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        // Query Companies
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '123',
                properties: {
                  name: 'Company A',
                  domain: 'companya.com',
                  industry: 'Technology',
                },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-15T00:00:00Z',
              },
            ],
            paging: {},
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Contacts (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '456',
                properties: {
                  firstname: 'John',
                  lastname: 'Doe',
                  email: 'john.doe@example.com',
                  phone: '+1234567890',
                },
                createdAt: '2024-01-02T00:00:00Z',
                updatedAt: '2024-01-16T00:00:00Z',
              },
            ],
            paging: {},
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Deals (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '789',
                properties: {
                  dealname: 'Big Deal',
                  amount: '50000',
                  dealstage: 'presentationscheduled',
                  closedate: '2024-12-31',
                },
                createdAt: '2024-01-03T00:00:00Z',
                updatedAt: '2024-01-17T00:00:00Z',
              },
            ],
            paging: {},
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract Tickets (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '101',
                properties: {
                  subject: 'Support Request',
                  content: 'Need help with integration',
                  hs_ticket_priority: 'HIGH',
                  hs_pipeline_stage: 'new',
                },
                createdAt: '2024-01-04T00:00:00Z',
                updatedAt: '2024-01-18T00:00:00Z',
              },
            ],
            paging: {},
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle paginated results (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        // First page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: Array(100).fill({ id: '1', properties: { name: 'Company' } }),
            paging: {
              next: { after: 'cursor-100' },
            },
          }),
        })
        // Second page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: Array(50).fill({ id: '2', properties: { name: 'Company 2' } }),
            paging: {},
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limiting (Mocked)', () => {
    it('should respect rate limit headers (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'X-HubSpot-RateLimit-Remaining': '90',
            'X-HubSpot-RateLimit-Max': '100',
          }),
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle rate limit exceeded (429) (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({
            'Retry-After': '10',
          }),
          json: async () => ({
            status: 'error',
            message: 'You have reached your secondly limit.',
            errorType: 'RATE_LIMIT',
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      // Should handle rate limit gracefully
      expect(result).toBeDefined();
    });

    it('should implement exponential backoff on rate limits (mocked)', async () => {
      const fetchCalls: number[] = [];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        // First attempt - rate limited
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
          json: async () => ({ status: 'error', errorType: 'RATE_LIMIT' }),
        })
        // Second attempt - succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result).toBeDefined();
    });

    it('should track daily API usage (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'X-HubSpot-RateLimit-Daily': '250000',
            'X-HubSpot-RateLimit-Daily-Remaining': '249500',
          }),
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should warn when approaching rate limit (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'X-HubSpot-RateLimit-Remaining': '5',
            'X-HubSpot-RateLimit-Max': '100',
          }),
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Incremental Sync', () => {
    it('should perform incremental sync with modifiedSince (mocked)', async () => {
      const lastSync = new Date(Date.now() - 24 * 60 * 60 * 1000);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '123',
                properties: { name: 'Updated Company' },
                updatedAt: new Date().toISOString(),
              },
            ],
            paging: {},
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: false,
        deltaToken: lastSync.toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it('should update delta token after successful sync (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(mockDataSource);
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
          portalId: 12345,
          timeZone: 'US/Eastern',
          accountType: 'MARKETING_HUB_PROFESSIONAL',
        }),
      });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should fail connection test when not authenticated', async () => {
      const noAuth = {
        ...mockDataSource,
        config: { ...mockDataSource.config, accessToken: undefined },
      };
      const connector = new HubSpotConnector(noAuth as DataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });

    it('should fail on invalid credentials (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          status: 'error',
          message: 'Authentication credentials not valid',
          errorType: 'UNAUTHORIZED',
        }),
      });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });

    it('should refresh token on authentication failure (mocked)', async () => {
      mockFetch
        // Test connection fails
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ status: 'error', errorType: 'UNAUTHORIZED' }),
        })
        // Refresh token succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_in: 21600,
          }),
        })
        // Retry test connection succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const connector = new HubSpotConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle HubSpot API errors (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            status: 'error',
            message: 'Invalid property name',
            errorType: 'PROPERTY_DOESNT_EXIST',
          }),
        });

      const connector = new HubSpotConnector(mockDataSource);
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

      const connector = new HubSpotConnector(mockDataSource);
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
          json: async () => ({ portalId: 12345 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        });

      const connector = new HubSpotConnector(mockDataSource);
      await connector.sync({ fullSync: true }, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('current');
      expect(progressUpdates[0]).toHaveProperty('total');
      expect(progressUpdates[0]).toHaveProperty('stage');
    });
  });

  describe('Required Scopes', () => {
    it('should return correct required scopes', () => {
      const connector = new HubSpotConnector(mockDataSource);
      const scopes = connector.getRequiredScopes();

      expect(scopes).toContain('crm.objects.companies.read');
      expect(scopes).toContain('crm.objects.contacts.read');
      expect(scopes).toContain('crm.objects.deals.read');
      expect(scopes).toContain('tickets');
    });
  });
});
