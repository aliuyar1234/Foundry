/**
 * Partner API End-to-End Tests (T384)
 * Comprehensive E2E tests for Partner API functionality
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

interface APIKeyConfig {
  apiKey: string;
  tier: 'free' | 'standard' | 'premium' | 'enterprise';
  entityId: string;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const testPartner = {
  email: 'partner@test.com',
  password: 'TestPassword123!',
  entityId: 'partner-entity-1',
};

// Will be populated during tests
let apiKeyConfig: APIKeyConfig;

// =============================================================================
// Helper Functions
// =============================================================================

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${BASE_URL}/dashboard`);
}

async function makeAPIRequest(
  request: APIRequestContext,
  method: string,
  endpoint: string,
  apiKey: string,
  body?: object
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const options: any = {
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.data = body;
  }

  let response;
  switch (method.toUpperCase()) {
    case 'GET':
      response = await request.get(`${API_URL}${endpoint}`, options);
      break;
    case 'POST':
      response = await request.post(`${API_URL}${endpoint}`, options);
      break;
    case 'PUT':
      response = await request.put(`${API_URL}${endpoint}`, options);
      break;
    case 'DELETE':
      response = await request.delete(`${API_URL}${endpoint}`, options);
      break;
    default:
      throw new Error(`Unsupported method: ${method}`);
  }

  const responseHeaders: Record<string, string> = {};
  response.headers().forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
    headers: responseHeaders,
  };
}

// =============================================================================
// Test Suites
// =============================================================================

test.describe('Partner API', () => {
  test.describe('API Key Management', () => {
    test('should generate new API key', async ({ page }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      // Check no API key exists initially or regenerate
      const generateButton = page.locator('[data-testid="generate-api-key"]');
      await generateButton.click();

      // Confirm generation
      await page.click('[data-testid="confirm-generate"]');

      // Wait for key to appear
      await expect(page.locator('[data-testid="api-key-display"]')).toBeVisible();

      // Copy the key
      const apiKey = await page.locator('[data-testid="api-key-value"]').textContent();
      expect(apiKey).toBeTruthy();
      expect(apiKey!.length).toBeGreaterThan(30);

      // Store for later tests
      apiKeyConfig = {
        apiKey: apiKey!,
        tier: 'standard',
        entityId: testPartner.entityId,
      };
    });

    test('should show API key only once', async ({ page }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      // Generate new key
      await page.click('[data-testid="regenerate-api-key"]');
      await page.click('[data-testid="confirm-generate"]');

      // Key should be visible
      const apiKeyValue = page.locator('[data-testid="api-key-value"]');
      await expect(apiKeyValue).toBeVisible();

      // Navigate away and back
      await page.goto(`${BASE_URL}/dashboard`);
      await page.goto(`${BASE_URL}/settings/api`);

      // Key should no longer be visible (masked)
      await expect(page.locator('[data-testid="api-key-masked"]')).toBeVisible();
      await expect(apiKeyValue).not.toBeVisible();
    });

    test('should revoke API key', async ({ page, request }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      // Get current key before revoking
      const currentKey = apiKeyConfig.apiKey;

      // Revoke key
      await page.click('[data-testid="revoke-api-key"]');
      await page.click('[data-testid="confirm-revoke"]');

      // Wait for revocation
      await expect(page.locator('[data-testid="no-api-key"]')).toBeVisible();

      // Verify old key no longer works
      const response = await makeAPIRequest(request, 'GET', '/api/v1/health', currentKey);
      expect(response.status).toBe(401);
    });
  });

  test.describe('Authentication', () => {
    test('should authenticate with valid API key', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/entities',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });

    test('should reject invalid API key', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/entities',
        'invalid-api-key-123'
      );

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INVALID_API_KEY');
    });

    test('should reject requests without API key', async ({ request }) => {
      const response = await request.get(`${API_URL}/api/v1/entities`);
      expect(response.status()).toBe(401);
    });

    test('should include entity context from API key', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/data-sources',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      // All returned data should belong to the API key's entity
      if (response.body.data && response.body.data.length > 0) {
        response.body.data.forEach((item: any) => {
          expect(item.entityId).toBe(apiKeyConfig.entityId);
        });
      }
    });
  });

  test.describe('Rate Limiting', () => {
    test('should return rate limit headers', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/entities',
        apiKeyConfig.apiKey
      );

      expect(response.headers['x-ratelimit-limit']).toBeTruthy();
      expect(response.headers['x-ratelimit-remaining']).toBeTruthy();
      expect(response.headers['x-ratelimit-reset']).toBeTruthy();
    });

    test('should enforce rate limits', async ({ request }) => {
      // Make many requests quickly
      const requests: Promise<any>[] = [];
      const numRequests = 150; // More than typical rate limit

      for (let i = 0; i < numRequests; i++) {
        requests.push(
          makeAPIRequest(request, 'GET', '/api/v1/health', apiKeyConfig.apiKey)
        );
      }

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Rate limited responses should have retry-after header
      if (rateLimited.length > 0) {
        expect(rateLimited[0].headers['retry-after']).toBeTruthy();
      }
    });

    test('should have different limits per tier', async ({ request, page }) => {
      // This test assumes we can access tier info
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/rate-limits',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tier');
      expect(response.body).toHaveProperty('limits');
      expect(response.body.limits).toHaveProperty('requestsPerMinute');
      expect(response.body.limits).toHaveProperty('requestsPerDay');
    });
  });

  test.describe('API Endpoints', () => {
    test('should list entities', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/entities',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get entity details', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        `/api/v1/entities/${apiKeyConfig.entityId}`,
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.id).toBe(apiKeyConfig.entityId);
    });

    test('should list data sources', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/data-sources',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    test('should support pagination', async ({ request }) => {
      const page1 = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/data-sources?page=1&limit=10',
        apiKeyConfig.apiKey
      );

      expect(page1.status).toBe(200);
      expect(page1.body.pagination).toHaveProperty('page', 1);
      expect(page1.body.pagination).toHaveProperty('limit', 10);
      expect(page1.body.pagination).toHaveProperty('total');
      expect(page1.body.pagination).toHaveProperty('totalPages');

      // Get second page if available
      if (page1.body.pagination.totalPages > 1) {
        const page2 = await makeAPIRequest(
          request,
          'GET',
          '/api/v1/data-sources?page=2&limit=10',
          apiKeyConfig.apiKey
        );

        expect(page2.status).toBe(200);
        expect(page2.body.pagination.page).toBe(2);
        // Items should be different from page 1
        expect(page2.body.data[0]?.id).not.toBe(page1.body.data[0]?.id);
      }
    });

    test('should support filtering', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/data-sources?status=active&type=database',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      if (response.body.data.length > 0) {
        response.body.data.forEach((item: any) => {
          expect(item.status).toBe('active');
          expect(item.type).toBe('database');
        });
      }
    });

    test('should create data source via API', async ({ request }) => {
      const newDataSource = {
        name: 'API Test Data Source',
        type: 'database',
        config: {
          host: 'test.db.example.com',
          port: 5432,
        },
      };

      const response = await makeAPIRequest(
        request,
        'POST',
        '/api/v1/data-sources',
        apiKeyConfig.apiKey,
        newDataSource
      );

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(newDataSource.name);
      expect(response.body.data.entityId).toBe(apiKeyConfig.entityId);
    });

    test('should update data source via API', async ({ request }) => {
      // First create a data source
      const createResponse = await makeAPIRequest(
        request,
        'POST',
        '/api/v1/data-sources',
        apiKeyConfig.apiKey,
        { name: 'To Update', type: 'database', config: {} }
      );

      const dataSourceId = createResponse.body.data.id;

      // Update it
      const updateResponse = await makeAPIRequest(
        request,
        'PUT',
        `/api/v1/data-sources/${dataSourceId}`,
        apiKeyConfig.apiKey,
        { name: 'Updated Name' }
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.name).toBe('Updated Name');
    });

    test('should delete data source via API', async ({ request }) => {
      // First create a data source
      const createResponse = await makeAPIRequest(
        request,
        'POST',
        '/api/v1/data-sources',
        apiKeyConfig.apiKey,
        { name: 'To Delete', type: 'database', config: {} }
      );

      const dataSourceId = createResponse.body.data.id;

      // Delete it
      const deleteResponse = await makeAPIRequest(
        request,
        'DELETE',
        `/api/v1/data-sources/${dataSourceId}`,
        apiKeyConfig.apiKey
      );

      expect(deleteResponse.status).toBe(204);

      // Verify it's deleted
      const getResponse = await makeAPIRequest(
        request,
        'GET',
        `/api/v1/data-sources/${dataSourceId}`,
        apiKeyConfig.apiKey
      );

      expect(getResponse.status).toBe(404);
    });
  });

  test.describe('API Versioning', () => {
    test('should support v1 endpoint', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/health',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('version', 'v1');
    });

    test('should return version in response headers', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/entities',
        apiKeyConfig.apiKey
      );

      expect(response.headers['x-api-version']).toBe('v1');
    });

    test('should handle deprecated endpoints gracefully', async ({ request }) => {
      // If there's a deprecated endpoint, it should still work but include deprecation notice
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/legacy-endpoint', // Example deprecated endpoint
        apiKeyConfig.apiKey
      );

      // Either 200 with deprecation warning or 404 if not implemented
      if (response.status === 200) {
        expect(response.headers['x-deprecated']).toBeTruthy();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should return consistent error format', async ({ request }) => {
      const response = await makeAPIRequest(
        request,
        'GET',
        '/api/v1/nonexistent-resource',
        apiKeyConfig.apiKey
      );

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    test('should validate request body', async ({ request }) => {
      const invalidData = {
        // Missing required 'name' field
        type: 'database',
      };

      const response = await makeAPIRequest(
        request,
        'POST',
        '/api/v1/data-sources',
        apiKeyConfig.apiKey,
        invalidData
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error).toHaveProperty('details');
    });

    test('should handle malformed JSON', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/v1/data-sources`, {
        headers: {
          'X-API-Key': apiKeyConfig.apiKey,
          'Content-Type': 'application/json',
        },
        data: 'not valid json {',
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_JSON');
    });
  });

  test.describe('Performance', () => {
    test('should respond within latency SLA (p95 < 100ms)', async ({ request }) => {
      const latencies: number[] = [];
      const numRequests = 20;

      for (let i = 0; i < numRequests; i++) {
        const start = Date.now();
        await makeAPIRequest(request, 'GET', '/api/v1/health', apiKeyConfig.apiKey);
        latencies.push(Date.now() - start);
      }

      // Sort latencies
      latencies.sort((a, b) => a - b);

      // Calculate p95
      const p95Index = Math.ceil(0.95 * latencies.length) - 1;
      const p95Latency = latencies[p95Index];

      expect(p95Latency).toBeLessThan(100);
    });

    test('should handle concurrent requests', async ({ request }) => {
      const concurrentRequests = 50;
      const requests: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          makeAPIRequest(request, 'GET', '/api/v1/entities', apiKeyConfig.apiKey)
        );
      }

      const responses = await Promise.all(requests);

      // All requests should succeed (or be rate limited)
      const successful = responses.filter((r) => r.status === 200).length;
      const rateLimited = responses.filter((r) => r.status === 429).length;

      expect(successful + rateLimited).toBe(concurrentRequests);
    });
  });

  test.describe('API Dashboard UI', () => {
    test('should display usage statistics', async ({ page }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      await expect(page.locator('[data-testid="total-requests"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-rate"]')).toBeVisible();
      await expect(page.locator('[data-testid="avg-latency"]')).toBeVisible();
    });

    test('should show usage chart', async ({ page }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      await expect(page.locator('[data-testid="usage-chart"]')).toBeVisible();

      // Chart should have data points
      const dataPoints = page.locator('[data-testid="chart-data-point"]');
      await expect(dataPoints.first()).toBeVisible();
    });

    test('should display rate limit information', async ({ page }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      await expect(page.locator('[data-testid="rate-limit-tier"]')).toBeVisible();
      await expect(page.locator('[data-testid="rate-limit-used"]')).toBeVisible();
      await expect(page.locator('[data-testid="rate-limit-remaining"]')).toBeVisible();
    });

    test('should link to API documentation', async ({ page }) => {
      await login(page, testPartner.email, testPartner.password);
      await page.goto(`${BASE_URL}/settings/api`);

      const docsLink = page.locator('[data-testid="api-docs-link"]');
      await expect(docsLink).toBeVisible();

      const href = await docsLink.getAttribute('href');
      expect(href).toContain('/api-docs');
    });
  });
});

// =============================================================================
// Cleanup
// =============================================================================

test.afterAll(async ({ request }) => {
  // Clean up test data
  console.log('Cleaning up Partner API test data...');
});
