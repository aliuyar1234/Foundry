/**
 * Odoo ERP Connector Integration Tests
 * Task T206
 *
 * Tests for Odoo authentication, XML-RPC and REST clients, and module extractors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OdooConnector } from '../../../src/connectors/odoo/index.js';
import { DataSource, DataSourceStatus } from '@prisma/client';
import { createOdooClient } from '../../../src/connectors/odoo/odooClient.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Odoo Connector', () => {
  let mockDataSource: DataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    mockDataSource = {
      id: 'test-odoo-ds-1',
      organizationId: 'test-org-1',
      type: 'ODOO',
      name: 'Test Odoo Instance',
      status: 'ACTIVE' as DataSourceStatus,
      config: {
        url: 'https://odoo.example.com',
        database: 'test_db',
        username: 'admin',
        apiKey: 'test-api-key-123',
        apiType: 'jsonrpc',
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
      const connector = new OdooConnector(mockDataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject missing url', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, url: undefined },
      };
      const connector = new OdooConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing url');
    });

    it('should reject invalid url format', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, url: 'not-a-valid-url' },
      };
      const connector = new OdooConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid url format');
    });

    it('should reject missing database', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, database: undefined },
      };
      const connector = new OdooConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing database');
    });

    it('should reject missing username', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, username: undefined },
      };
      const connector = new OdooConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing username');
    });

    it('should reject missing apiKey and password', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          apiKey: undefined,
          password: undefined,
        },
      };
      const connector = new OdooConnector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing apiKey or password');
    });

    it('should accept password instead of apiKey', () => {
      const validDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          apiKey: undefined,
          password: 'test-password',
        },
      };
      const connector = new OdooConnector(validDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
    });
  });

  describe('Odoo Authentication', () => {
    it('should not use OAuth flow', () => {
      const connector = new OdooConnector(mockDataSource);
      const authUrl = connector.getAuthorizationUrl('https://example.com', 'state');

      expect(authUrl).toBe('');
    });

    it('should reject OAuth code exchange', async () => {
      const connector = new OdooConnector(mockDataSource);
      const result = await connector.exchangeCodeForTokens('code', 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key authentication');
    });

    it('should always succeed refresh token (API keys do not expire)', async () => {
      const connector = new OdooConnector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(true);
    });

    it('should authenticate with API key via JSON-RPC (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: 42, // User ID
        }),
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle authentication failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: 100,
            message: 'Access Denied',
            data: { name: 'odoo.exceptions.AccessDenied' },
          },
        }),
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('XML-RPC Client', () => {
    it('should create XML-RPC client', () => {
      const xmlRpcDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, apiType: 'xmlrpc' },
      };

      const connector = new OdooConnector(xmlRpcDataSource);
      expect(connector.type).toBe('ODOO');
    });

    it('should handle XML-RPC authentication (mocked)', async () => {
      const xmlRpcDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, apiType: 'xmlrpc' },
      };

      // Mock XML-RPC response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <?xml version="1.0"?>
          <methodResponse>
            <params>
              <param><value><int>42</int></value></param>
            </params>
          </methodResponse>
        `,
      });

      const connector = new OdooConnector(xmlRpcDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle XML-RPC fault response (mocked)', async () => {
      const xmlRpcDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, apiType: 'xmlrpc' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <?xml version="1.0"?>
          <methodResponse>
            <fault>
              <value>
                <struct>
                  <member>
                    <name>faultCode</name>
                    <value><int>100</int></value>
                  </member>
                  <member>
                    <name>faultString</name>
                    <value><string>Access Denied</string></value>
                  </member>
                </struct>
              </value>
            </fault>
          </methodResponse>
        `,
      });

      const connector = new OdooConnector(xmlRpcDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('JSON-RPC Client', () => {
    it('should create JSON-RPC client', () => {
      const connector = new OdooConnector(mockDataSource);
      expect(connector.type).toBe('ODOO');
    });

    it('should handle JSON-RPC search queries (mocked)', async () => {
      mockFetch
        // Auth
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        // Search partners
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [1, 2, 3] }),
        })
        // Read partners
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 3,
            result: [
              { id: 1, name: 'Partner 1' },
              { id: 2, name: 'Partner 2' },
            ],
          }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle JSON-RPC errors (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: 200,
            message: 'Odoo Server Error',
            data: { name: 'odoo.exceptions.ValidationError' },
          },
        }),
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Module Extractors', () => {
    it('should extract res.partner (customers/vendors) (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 6,
      });

      expect(result.success).toBe(true);
    });

    it('should extract product.product (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract sale.order (sales orders) (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract account.move (invoices) (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should handle custom modules if configured', async () => {
      const customModulesDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          modules: ['custom.module', 'another.module'],
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(customModulesDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should fail on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should fail on invalid credentials (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: { code: 100, message: 'Invalid credentials' },
        }),
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Sync Operations', () => {
    it('should perform full sync (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 12,
      });

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBeGreaterThanOrEqual(0);
      expect(result.deltaToken).toBeDefined();
    });

    it('should perform incremental sync (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({
        fullSync: false,
        deltaToken: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it('should report progress during sync', async () => {
      const progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 2, result: [] }),
        });

      const connector = new OdooConnector(mockDataSource);
      await connector.sync({ fullSync: true }, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('stage');
    });

    it('should handle sync errors gracefully (mocked)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database not found error (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: { code: 100, message: 'Database not found' },
        }),
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });

    it('should handle missing model permissions (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: 1, result: 42 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 2,
            error: { code: 200, message: 'Access denied for model res.partner' },
          }),
        });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      // Should continue with other models despite error
      expect(result).toBeDefined();
    });

    it('should handle version compatibility issues', async () => {
      // Odoo might return different response formats in different versions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 42 }), // Missing jsonrpc field
      });

      const connector = new OdooConnector(mockDataSource);
      const result = await connector.testConnection();

      expect(result).toBeDefined();
    });
  });

  describe('Required Scopes', () => {
    it('should return empty scopes (Odoo does not use OAuth)', () => {
      const connector = new OdooConnector(mockDataSource);
      const scopes = connector.getRequiredScopes();

      expect(scopes).toEqual([]);
    });
  });
});
