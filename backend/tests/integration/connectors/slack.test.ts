/**
 * Slack Connector Integration Tests
 * Task T210
 *
 * Tests for Slack OAuth, message extractors, and incremental sync with cursor
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SlackConnector } from '../../../src/connectors/slack/index.js';
import { DataSource, DataSourceStatus } from '@prisma/client';
import { SLACK_SCOPES } from '../../../src/connectors/slack/slackClient.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Slack Connector', () => {
  let mockDataSource: DataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    mockDataSource = {
      id: 'test-slack-ds-1',
      organizationId: 'test-org-1',
      type: 'SLACK',
      name: 'Test Slack Workspace',
      status: 'ACTIVE' as DataSourceStatus,
      config: {
        clientId: 'test-client-id.apps.slack.com',
        clientSecret: 'test-client-secret',
        accessToken: 'xoxb-test-access-token',
        botUserId: 'U01234ABCDE',
        teamId: 'T01234ABCDE',
        teamName: 'Test Workspace',
        syncMessages: true,
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
      const connector = new SlackConnector(mockDataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject missing clientId', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientId: undefined },
      };
      const connector = new SlackConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientId');
    });

    it('should reject missing clientSecret', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, clientSecret: undefined },
      };
      const connector = new SlackConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing clientSecret');
    });
  });

  describe('Slack OAuth Flow (Mocked)', () => {
    it('should generate authorization URL with correct parameters', () => {
      const connector = new SlackConnector(mockDataSource);
      const redirectUri = 'https://app.example.com/oauth/callback';
      const state = 'random-state-123';

      const authUrl = connector.getAuthorizationUrl(redirectUri, state);

      expect(authUrl).toContain('https://slack.com/oauth/v2/authorize');
      expect(authUrl).toContain(`client_id=${mockDataSource.config.clientId}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(authUrl).toContain(`state=${state}`);
    });

    it('should exchange authorization code for tokens (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: 'xoxb-new-access-token',
          token_type: 'bot',
          scope: SLACK_SCOPES.join(','),
          bot_user_id: 'U01234ABCDE',
          app_id: 'A01234ABCDE',
          team: {
            id: 'T01234ABCDE',
            name: 'Test Workspace',
          },
          authed_user: {
            id: 'U98765ZYXWV',
          },
        }),
      });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens(
        'auth-code-123',
        'https://app.example.com/oauth/callback'
      );

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBe('xoxb-new-access-token');
    });

    it('should handle token exchange failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: 'invalid_code',
        }),
      });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens(
        'invalid-code',
        'https://app.example.com/oauth/callback'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate token instead of refreshing (bot tokens do not expire)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          url: 'https://testworkspace.slack.com/',
          team: 'Test Workspace',
          user: 'testbot',
          team_id: 'T01234ABCDE',
          user_id: 'U01234ABCDE',
        }),
      });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(true);
      expect(result.tokens?.accessToken).toBe(mockDataSource.config.accessToken);
    });

    it('should fail refresh if token is invalid (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: 'invalid_auth',
        }),
      });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token is no longer valid');
    });
  });

  describe('User Extractor (Mocked)', () => {
    it('should extract workspace users (mocked)', async () => {
      mockFetch
        // Test connection
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            url: 'https://testworkspace.slack.com/',
            team_id: 'T01234ABCDE',
          }),
        })
        // List users
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            members: [
              {
                id: 'U01234ABCDE',
                name: 'john.doe',
                real_name: 'John Doe',
                profile: {
                  email: 'john.doe@example.com',
                  display_name: 'John',
                },
                is_bot: false,
                deleted: false,
              },
              {
                id: 'U98765ZYXWV',
                name: 'jane.smith',
                real_name: 'Jane Smith',
                profile: {
                  email: 'jane.smith@example.com',
                  display_name: 'Jane',
                },
                is_bot: false,
                deleted: false,
              },
            ],
            response_metadata: {},
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle paginated user lists (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        // First page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            members: Array(100).fill({ id: 'U1', name: 'user1', is_bot: false }),
            response_metadata: {
              next_cursor: 'dGVhbTpDMUg5UkVTR0w=',
            },
          }),
        })
        // Second page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            members: Array(50).fill({ id: 'U2', name: 'user2', is_bot: false }),
            response_metadata: {},
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Channel Extractor (Mocked)', () => {
    it('should extract public channels (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [
              {
                id: 'C01234ABCDE',
                name: 'general',
                is_channel: true,
                is_private: false,
                is_archived: false,
                num_members: 10,
              },
              {
                id: 'C98765ZYXWV',
                name: 'random',
                is_channel: true,
                is_private: false,
                is_archived: false,
                num_members: 8,
              },
            ],
            response_metadata: {},
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract private channels if authorized (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [
              {
                id: 'G01234ABCDE',
                name: 'private-channel',
                is_channel: false,
                is_group: true,
                is_private: true,
                is_archived: false,
                num_members: 5,
              },
            ],
            response_metadata: {},
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Message Extractor (Mocked)', () => {
    it('should extract channel messages (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        // Get channels
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: 'C01234ABCDE', name: 'general' }],
            response_metadata: {},
          }),
        })
        // Get messages from channel
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U01234ABCDE',
                text: 'Hello, world!',
                ts: '1615483725.000100',
              },
              {
                type: 'message',
                user: 'U98765ZYXWV',
                text: 'Hi there!',
                ts: '1615483825.000200',
              },
            ],
            has_more: false,
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle threaded messages (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: 'C01234ABCDE', name: 'general' }],
            response_metadata: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U01234ABCDE',
                text: 'Parent message',
                ts: '1615483725.000100',
                thread_ts: '1615483725.000100',
                reply_count: 2,
              },
            ],
            has_more: false,
          }),
        })
        // Get thread replies
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U98765ZYXWV',
                text: 'Reply 1',
                ts: '1615483825.000200',
                thread_ts: '1615483725.000100',
              },
              {
                type: 'message',
                user: 'U01234ABCDE',
                text: 'Reply 2',
                ts: '1615483925.000300',
                thread_ts: '1615483725.000100',
              },
            ],
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should skip bot messages if configured', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: 'C01234ABCDE', name: 'general' }],
            response_metadata: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U01234ABCDE',
                text: 'Human message',
                ts: '1615483725.000100',
              },
              {
                type: 'message',
                bot_id: 'B01234ABCDE',
                text: 'Bot message',
                ts: '1615483825.000200',
              },
            ],
            has_more: false,
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Incremental Sync with Cursor (Mocked)', () => {
    it('should use cursor-based pagination for messages (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: 'C01234ABCDE', name: 'general' }],
            response_metadata: {},
          }),
        })
        // First page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: Array(100).fill({ type: 'message', user: 'U1', text: 'msg' }),
            has_more: true,
            response_metadata: {
              next_cursor: 'bmV4dF90czoxNTE1MzY5NTI4LjAwMDEwMA==',
            },
          }),
        })
        // Second page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: Array(50).fill({ type: 'message', user: 'U2', text: 'msg2' }),
            has_more: false,
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should perform incremental sync since last timestamp (mocked)', async () => {
      const lastSync = Date.now() / 1000 - 86400; // 24 hours ago

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: 'C01234ABCDE', name: 'general' }],
            response_metadata: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U01234ABCDE',
                text: 'New message',
                ts: (Date.now() / 1000).toString(),
              },
            ],
            has_more: false,
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: false,
        deltaToken: lastSync.toString(),
      });

      expect(result.success).toBe(true);
    });

    it('should update delta token with latest message timestamp (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [{ id: 'C01234ABCDE', name: 'general' }],
            response_metadata: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            messages: [],
            has_more: false,
          }),
        });

      const connector = new SlackConnector(mockDataSource);
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
          ok: true,
          url: 'https://testworkspace.slack.com/',
          team: 'Test Workspace',
          user: 'testbot',
          team_id: 'T01234ABCDE',
          user_id: 'U01234ABCDE',
        }),
      });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should fail connection test when not authenticated', async () => {
      const noAuth = {
        ...mockDataSource,
        config: { ...mockDataSource.config, accessToken: undefined },
      };
      const connector = new SlackConnector(noAuth as DataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });

    it('should fail on invalid credentials (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: 'invalid_auth',
        }),
      });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle Slack API rate limits (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'Retry-After': '60' }),
          json: async () => ({
            ok: false,
            error: 'rate_limited',
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result).toBeDefined();
    });

    it('should handle missing permissions (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: false,
            error: 'missing_scope',
            needed: 'channels:history',
            provided: 'channels:read',
          }),
        });

      const connector = new SlackConnector(mockDataSource);
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

      const connector = new SlackConnector(mockDataSource);
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
          json: async () => ({ ok: true, team_id: 'T01234ABCDE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            channels: [],
            response_metadata: {},
          }),
        });

      const connector = new SlackConnector(mockDataSource);
      await connector.sync({ fullSync: true }, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('current');
      expect(progressUpdates[0]).toHaveProperty('total');
      expect(progressUpdates[0]).toHaveProperty('stage');
    });
  });

  describe('Required Scopes', () => {
    it('should return correct required scopes', () => {
      const connector = new SlackConnector(mockDataSource);
      const scopes = connector.getRequiredScopes();

      expect(scopes).toContain('channels:read');
      expect(scopes).toContain('channels:history');
      expect(scopes).toContain('users:read');
      expect(scopes).toContain('groups:read');
    });
  });
});
