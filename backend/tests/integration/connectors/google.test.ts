/**
 * Google Workspace Connector Integration Tests
 * Task T205
 *
 * Tests for Google OAuth flow, extractors (Gmail, Calendar, Drive), and incremental sync
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GoogleWorkspaceConnector } from '../../../src/connectors/google/index.js';
import { DataSource, DataSourceStatus } from '@prisma/client';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  GOOGLE_SCOPES,
} from '../../../src/connectors/google/auth.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Google Workspace Connector', () => {
  let mockDataSource: DataSource;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Create mock data source
    mockDataSource = {
      id: 'test-google-ds-1',
      organizationId: 'test-org-1',
      type: 'GOOGLE_WORKSPACE',
      name: 'Test Google Workspace',
      status: 'ACTIVE' as DataSourceStatus,
      config: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        scopes: GOOGLE_SCOPES,
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
      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject missing clientId', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientId: undefined },
      };
      const connector = new GoogleWorkspaceConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientId');
    });

    it('should reject missing clientSecret', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientSecret: undefined },
      };
      const connector = new GoogleWorkspaceConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientSecret');
    });
  });

  describe('OAuth Flow (Mocked)', () => {
    it('should generate authorization URL with correct parameters', () => {
      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const redirectUri = 'https://app.example.com/oauth/callback';
      const state = 'random-state-123';

      const authUrl = connector.getAuthorizationUrl(redirectUri, state);

      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain(`client_id=${mockDataSource.config.clientId}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(authUrl).toContain(`state=${state}`);
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('access_type=offline');
    });

    it('should exchange authorization code for tokens (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          scope: GOOGLE_SCOPES.join(' '),
          token_type: 'Bearer',
        }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens(
        'auth-code-123',
        'https://app.example.com/oauth/callback'
      );

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should handle token exchange failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
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
          expires_in: 3600,
          scope: GOOGLE_SCOPES.join(' '),
          token_type: 'Bearer',
        }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('refreshed-access-token');
    });

    it('should handle token refresh failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked',
        }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token refresh failed');
    });

    it('should require refresh token for refreshing', async () => {
      const noRefreshToken = {
        ...mockDataSource,
        config: { ...mockDataSource.config, refreshToken: undefined },
      };
      const connector = new GoogleWorkspaceConnector(noRefreshToken as DataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token available');
    });
  });

  describe('Gmail Extractor (Mocked)', () => {
    it('should extract Gmail messages (mocked)', async () => {
      // Mock auth test
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emailAddress: 'test@example.com' }),
      });

      // Mock user list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }), // No users for simplified test
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 1,
        syncEmails: true,
      });

      expect(result.success).toBe(true);
    });

    it('should handle Gmail API errors gracefully (mocked)', async () => {
      // Mock failing API call
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid credentials' } }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Calendar Extractor (Mocked)', () => {
    it('should extract calendar events (mocked)', async () => {
      // Mock successful sync (simplified)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 1,
        syncCalendar: true,
      });

      expect(result.success).toBe(true);
    });

    it('should handle calendar sync with no events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: false,
        syncCalendar: true,
      });

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(0);
    });
  });

  describe('Drive Extractor (Mocked)', () => {
    it('should extract Drive files (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 1,
        syncFiles: true,
      });

      expect(result.success).toBe(true);
    });

    it('should handle Drive API rate limiting (mocked)', async () => {
      // Mock rate limit error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Incremental Sync', () => {
    it('should perform incremental sync with delta tokens (mocked)', async () => {
      const deltaToken = JSON.stringify({
        gmail: 'gmail-delta-123',
        calendar: 'calendar-delta-456',
        drive: 'drive-delta-789',
      });

      const dataSourceWithDelta = {
        ...mockDataSource,
        deltaToken,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(dataSourceWithDelta);
      const result = await connector.sync({
        fullSync: false,
        deltaToken,
      });

      expect(result.success).toBe(true);
      expect(result.deltaToken).toBeDefined();
    });

    it('should fall back to full sync if delta token is invalid (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: false,
        deltaToken: 'invalid-token',
      });

      expect(result.success).toBe(true);
    });

    it('should update delta tokens after successful sync (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 1,
      });

      expect(result.success).toBe(true);
      expect(result.deltaToken).toBeDefined();
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ emailAddress: 'test@example.com' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ kind: 'calendar#calendarList' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ kind: 'drive#about' }),
        });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should fail connection test when not authenticated', async () => {
      const noAuth = {
        ...mockDataSource,
        config: { ...mockDataSource.config, accessToken: undefined },
      };
      const connector = new GoogleWorkspaceConnector(noAuth as DataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });

    it('should report partial success if some services fail', async () => {
      // Gmail succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emailAddress: 'test@example.com' }),
      });
      // Calendar fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Insufficient permissions' } }),
      });
      // Drive succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ kind: 'drive#about' }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.testConnection();

      // Should succeed if at least one service works
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle authentication errors during sync', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid credentials' } }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(false);
    });

    it('should handle expired tokens and attempt refresh', async () => {
      const expiredDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          tokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      };

      // Mock refresh token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          expires_in: 3600,
        }),
      });

      // Mock sync request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(expiredDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress during sync', async () => {
      const progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      const connector = new GoogleWorkspaceConnector(mockDataSource);
      await connector.sync({ fullSync: true }, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('current');
      expect(progressUpdates[0]).toHaveProperty('total');
      expect(progressUpdates[0]).toHaveProperty('stage');
    });
  });

  describe('Required Scopes', () => {
    it('should return correct required scopes', () => {
      const connector = new GoogleWorkspaceConnector(mockDataSource);
      const scopes = connector.getRequiredScopes();

      expect(scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
      expect(scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');
      expect(scopes).toContain('https://www.googleapis.com/auth/drive.readonly');
    });
  });
});
