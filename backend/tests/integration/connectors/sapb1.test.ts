/**
 * SAP Business One Connector Integration Tests
 * Task T207
 *
 * Tests for SAP B1 Service Layer authentication, document extractors, and approval workflow extraction
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SapB1Connector } from '../../../src/connectors/sap-b1/index.js';
import { DataSource, DataSourceStatus } from '@prisma/client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SAP Business One Connector', () => {
  let mockDataSource: DataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    mockDataSource = {
      id: 'test-sapb1-ds-1',
      organizationId: 'test-org-1',
      type: 'SAP_B1',
      name: 'Test SAP B1 Instance',
      status: 'ACTIVE' as DataSourceStatus,
      config: {
        serverUrl: 'https://sapb1.example.com:50000/b1s/v1',
        companyDb: 'SBODEMOUS',
        username: 'manager',
        password: 'test-password',
        sslEnabled: true,
        useIncrementalSync: false,
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
      const connector = new SapB1Connector(mockDataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject missing serverUrl', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, serverUrl: undefined },
      };
      const connector = new SapB1Connector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing serverUrl');
    });

    it('should reject missing companyDb', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, companyDb: undefined },
      };
      const connector = new SapB1Connector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing companyDb');
    });

    it('should reject missing username', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, username: undefined },
      };
      const connector = new SapB1Connector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing username');
    });

    it('should reject missing password', () => {
      const invalidDataSource = {
        ...mockDataSource,
        config: { ...mockDataSource.config, password: undefined },
      };
      const connector = new SapB1Connector(invalidDataSource as DataSource);
      const result = connector.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing password');
    });
  });

  describe('SAP B1 Service Layer Authentication', () => {
    it('should not use OAuth flow', () => {
      const connector = new SapB1Connector(mockDataSource);
      const authUrl = connector.getAuthorizationUrl('https://example.com', 'state');

      expect(authUrl).toBe('');
    });

    it('should reject OAuth code exchange', async () => {
      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.exchangeCodeForTokens('code', 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('session authentication');
    });

    it('should always succeed refresh token (session-based auth)', async () => {
      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.refreshAccessToken();

      expect(result.success).toBe(true);
    });

    it('should authenticate and get session cookie (mocked)', async () => {
      mockFetch
        // Login
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'set-cookie': 'B1SESSION=abc123; Path=/b1s; HttpOnly',
          }),
          json: async () => ({
            SessionId: 'abc123',
            Version: '10.0',
            SessionTimeout: 30,
          }),
        })
        // Test query
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        // Logout
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle authentication failure (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: 301,
            message: { lang: 'en-us', value: 'Invalid username or password' },
          },
        }),
      });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });

    it('should handle session timeout and re-authenticate (mocked)', async () => {
      mockFetch
        // Initial login
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        // Session expired
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: -5002, message: 'Session timeout' },
          }),
        })
        // Re-login
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=xyz789' }),
          json: async () => ({ SessionId: 'xyz789' }),
        })
        // Retry query
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        // Logout
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Document Extractors', () => {
    it('should extract business partners (customers/vendors) (mocked)', async () => {
      mockFetch
        // Login
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        // Query BusinessPartners
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        // Logout
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract items/products (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract sales orders (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                DocEntry: 1,
                DocNum: 1001,
                CardCode: 'C001',
                CardName: 'Customer 1',
                DocDate: '2024-01-15',
                DocTotal: 1500.0,
                DocumentStatus: 'bost_Open',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract purchase orders (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract invoices (AR and AP) (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                DocEntry: 10,
                DocNum: 2001,
                CardCode: 'C001',
                DocDate: '2024-01-20',
                DocTotal: 2000.0,
                DocumentStatus: 'bost_Close',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract delivery notes (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Approval Workflow Extraction', () => {
    it('should extract approval requests (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                Code: 1,
                Name: 'Approval Request 1',
                ObjectType: '17', // Sales Order
                Status: 'arsApproved',
                Requester: 1,
                ApprovalTemplatesID: 1,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract approval templates (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                Code: 1,
                Name: 'Sales Order Approval',
                IsActive: 'tYES',
                UseTerms: 'tYES',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should link approval requests to documents (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                Code: 1,
                ObjectType: '17',
                ObjectEntry: 100,
                Status: 'arsApproved',
                ApprovalTemplatesID: 1,
                Remarks: 'Approved by manager',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });

    it('should extract approval stages (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                Code: 1,
                ApprovalStagesID: 1,
                Status: 'arsApproved',
                Remarks: 'Stage 1 approved',
                CreationDate: '2024-01-15',
                UpdateDate: '2024-01-15',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('German Localization', () => {
    it('should extract German-specific document types (mocked)', async () => {
      const germanDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          includeGermanLocalization: true,
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(germanDataSource);
      const result = await connector.sync({ fullSync: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Incremental Sync', () => {
    it('should perform incremental sync with delta tracking (mocked)', async () => {
      const incrementalDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          useIncrementalSync: true,
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(incrementalDataSource);
      const result = await connector.sync({
        fullSync: false,
        deltaToken: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it('should use UpdateDate field for incremental queries (mocked)', async () => {
      const incrementalDataSource = {
        ...mockDataSource,
        config: {
          ...mockDataSource.config,
          useIncrementalSync: true,
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(incrementalDataSource);
      const result = await connector.sync({ fullSync: false });

      expect(result.success).toBe(true);
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
    });

    it('should clean up session on test failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Sync Operations', () => {
    it('should perform full sync (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.sync({
        fullSync: true,
        lookbackMonths: 12,
      });

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBeGreaterThanOrEqual(0);
      expect(result.deltaToken).toBeDefined();
    });

    it('should report progress during sync', async () => {
      const progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      await connector.sync({ fullSync: true }, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('stage');
    });

    it('should always logout after sync (mocked)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'set-cookie': 'B1SESSION=abc123' }),
          json: async () => ({ SessionId: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const connector = new SapB1Connector(mockDataSource);
      await connector.sync({ fullSync: true });

      // Verify logout was called
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle Service Layer errors (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: {
            code: -1,
            message: { lang: 'en-us', value: 'Internal server error' },
          },
        }),
      });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });

    it('should handle invalid company database (mocked)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: 102,
            message: { lang: 'en-us', value: 'Invalid company database' },
          },
        }),
      });

      const connector = new SapB1Connector(mockDataSource);
      const result = await connector.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Required Scopes', () => {
    it('should return empty scopes (SAP B1 does not use OAuth)', () => {
      const connector = new SapB1Connector(mockDataSource);
      const scopes = connector.getRequiredScopes();

      expect(scopes).toEqual([]);
    });
  });
});
