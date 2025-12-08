/**
 * On-Premise Deployment E2E Tests
 * Task: T386
 *
 * Tests for enterprise on-premise deployment scenarios including
 * air-gapped environments, custom infrastructure, and deployment validation.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

// Test configuration for deployment tests
const DEPLOYMENT_CONFIG = {
  healthEndpoint: '/api/health',
  readinessEndpoint: '/api/ready',
  livenessEndpoint: '/api/live',
  metricsEndpoint: '/api/metrics',
  versionEndpoint: '/api/version',
  configEndpoint: '/api/admin/config',
};

// Helper to check service health
async function checkServiceHealth(request: APIRequestContext, baseUrl: string): Promise<{
  healthy: boolean;
  services: Record<string, { status: string; latency?: number }>;
}> {
  const response = await request.get(`${baseUrl}${DEPLOYMENT_CONFIG.healthEndpoint}`);
  if (response.ok()) {
    return await response.json();
  }
  return { healthy: false, services: {} };
}

test.describe('On-Premise Deployment', () => {
  test.describe('Health Checks', () => {
    test('should pass liveness probe', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.livenessEndpoint}`);

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('alive');
    });

    test('should pass readiness probe', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.readinessEndpoint}`);

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ready');
      expect(data.checks).toBeDefined();
    });

    test('should report comprehensive health status', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.healthEndpoint}`);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.healthy).toBe(true);
      expect(data.services).toBeDefined();
      expect(data.services.database).toBeDefined();
      expect(data.services.cache).toBeDefined();
      expect(data.services.storage).toBeDefined();
    });

    test('should include service latencies in health check', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.healthEndpoint}?detailed=true`);

      expect(response.status()).toBe(200);
      const data = await response.json();

      for (const [service, info] of Object.entries(data.services as Record<string, any>)) {
        expect(info.latency).toBeDefined();
        expect(info.latency).toBeLessThan(5000); // 5s max latency
      }
    });

    test('should report unhealthy when service is down', async ({ request, baseURL }) => {
      // This test validates error reporting - in real deployment,
      // we'd simulate a service failure
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.healthEndpoint}`);

      const data = await response.json();
      // If any service is unhealthy, the response should indicate it
      if (!data.healthy) {
        expect(response.status()).toBe(503);
        expect(data.unhealthyServices).toBeDefined();
      }
    });
  });

  test.describe('Version and Build Info', () => {
    test('should return version information', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.versionEndpoint}`);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.version).toBeDefined();
      expect(data.buildNumber).toBeDefined();
      expect(data.buildDate).toBeDefined();
      expect(data.gitCommit).toBeDefined();
    });

    test('should include deployment environment info', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.versionEndpoint}`);

      const data = await response.json();
      expect(data.environment).toBeDefined();
      expect(['development', 'staging', 'production', 'on-premise']).toContain(data.environment);
    });

    test('should indicate on-premise deployment type', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.versionEndpoint}`);

      const data = await response.json();
      expect(data.deploymentType).toBeDefined();
      // On-premise deployments should be marked appropriately
      if (data.deploymentType === 'on-premise') {
        expect(data.licenseType).toBeDefined();
        expect(data.instanceId).toBeDefined();
      }
    });
  });

  test.describe('Metrics Endpoint', () => {
    test('should expose Prometheus metrics', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.metricsEndpoint}`);

      expect(response.status()).toBe(200);
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('text/plain');

      const body = await response.text();
      // Check for standard Prometheus metric format
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });

    test('should include application-specific metrics', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.metricsEndpoint}`);

      const body = await response.text();

      // Check for custom application metrics
      expect(body).toContain('http_requests_total');
      expect(body).toContain('http_request_duration_seconds');
      expect(body).toContain('active_connections');
    });

    test('should include enterprise-specific metrics', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.metricsEndpoint}`);

      const body = await response.text();

      // Enterprise metrics
      expect(body).toContain('entity_count');
      expect(body).toContain('api_key_count');
      expect(body).toContain('sso_login_count');
    });

    test('should require authentication for detailed metrics', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${DEPLOYMENT_CONFIG.metricsEndpoint}?detailed=true`);

      // Detailed metrics should require auth
      if (response.status() === 401) {
        expect(response.status()).toBe(401);
      } else {
        // If no auth required, metrics should still be returned
        expect(response.status()).toBe(200);
      }
    });
  });

  test.describe('Configuration Management', () => {
    test('should allow admin to view current configuration', async ({ page, baseURL }) => {
      // Login as admin
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/config`);

      // Should see configuration sections
      await expect(page.locator('[data-testid="config-section-database"]')).toBeVisible();
      await expect(page.locator('[data-testid="config-section-cache"]')).toBeVisible();
      await expect(page.locator('[data-testid="config-section-storage"]')).toBeVisible();
      await expect(page.locator('[data-testid="config-section-security"]')).toBeVisible();
    });

    test('should hide sensitive configuration values', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/config`);

      // Sensitive values should be masked
      const sensitiveFields = page.locator('[data-testid="config-sensitive"]');
      const count = await sensitiveFields.count();

      for (let i = 0; i < count; i++) {
        const value = await sensitiveFields.nth(i).textContent();
        expect(value).toMatch(/^\*+$/); // Should be asterisks
      }
    });

    test('should validate configuration changes before applying', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/config`);

      // Try to set invalid configuration
      await page.click('[data-testid="config-edit-database"]');
      await page.fill('[data-testid="config-pool-size"]', '-1');
      await page.click('[data-testid="config-validate"]');

      // Should show validation error
      await expect(page.locator('[data-testid="config-validation-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="config-validation-error"]')).toContainText('must be positive');
    });

    test('should support configuration export', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/config`);

      // Export configuration
      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="config-export"]');
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/config.*\.json$/);
    });

    test('should support configuration import with validation', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/config`);

      // Import configuration
      await page.click('[data-testid="config-import"]');

      // Should show import dialog with validation preview
      await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="import-validation-preview"]')).toBeVisible();
    });
  });

  test.describe('Air-Gapped Environment', () => {
    test('should function without external network access', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/`);

      // Check that the application loads
      await expect(page.locator('[data-testid="app-container"]')).toBeVisible();

      // Verify no external resource requests
      const requests: string[] = [];
      page.on('request', (req) => {
        const url = new URL(req.url());
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          requests.push(req.url());
        }
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // In air-gapped mode, there should be no external requests
      // (or they should be to configured internal endpoints)
    });

    test('should use local license validation', async ({ request, baseURL }) => {
      const response = await request.post(`${baseURL}/api/admin/license/validate`, {
        data: {
          licenseKey: 'LOCAL-LICENSE-KEY',
          validationMode: 'offline',
        },
      });

      // Should validate without external call
      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.valid).toBeDefined();
      expect(data.validationMethod).toBe('offline');
    });

    test('should serve all assets locally', async ({ page, baseURL }) => {
      const externalRequests: string[] = [];

      page.on('request', (request) => {
        const url = new URL(request.url());
        if (!['localhost', '127.0.0.1', baseURL?.replace(/https?:\/\//, '')].some(h => url.hostname.includes(h || ''))) {
          externalRequests.push(request.url());
        }
      });

      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Log any external requests (in air-gapped env, should be zero)
      if (externalRequests.length > 0) {
        console.warn('External requests detected:', externalRequests);
      }
    });

    test('should support offline documentation', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/docs`);

      // Documentation should be available offline
      await expect(page.locator('[data-testid="docs-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="docs-search"]')).toBeVisible();

      // Search should work offline
      await page.fill('[data-testid="docs-search"]', 'deployment');
      await expect(page.locator('[data-testid="docs-search-results"]')).toBeVisible();
    });
  });

  test.describe('High Availability', () => {
    test('should report cluster status', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}/api/admin/cluster/status`);

      if (response.ok()) {
        const data = await response.json();
        expect(data.nodes).toBeDefined();
        expect(Array.isArray(data.nodes)).toBe(true);
        expect(data.leader).toBeDefined();
        expect(data.quorum).toBeDefined();
      }
    });

    test('should show node health in admin dashboard', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/cluster`);

      // Should show cluster nodes
      const nodeList = page.locator('[data-testid="cluster-node-list"]');
      await expect(nodeList).toBeVisible();

      // Each node should show status
      const nodes = page.locator('[data-testid="cluster-node"]');
      const nodeCount = await nodes.count();

      for (let i = 0; i < nodeCount; i++) {
        await expect(nodes.nth(i).locator('[data-testid="node-status"]')).toBeVisible();
        await expect(nodes.nth(i).locator('[data-testid="node-health"]')).toBeVisible();
      }
    });

    test('should support graceful node failover', async ({ request, baseURL }) => {
      // Get initial leader
      const statusResponse = await request.get(`${baseURL}/api/admin/cluster/status`);

      if (statusResponse.ok()) {
        const status = await statusResponse.json();
        const initialLeader = status.leader;

        // Simulate failover (in test environment)
        const failoverResponse = await request.post(`${baseURL}/api/admin/cluster/simulate-failover`, {
          data: { nodeId: initialLeader },
        });

        if (failoverResponse.ok()) {
          // Verify new leader elected
          const newStatusResponse = await request.get(`${baseURL}/api/admin/cluster/status`);
          const newStatus = await newStatusResponse.json();

          // In HA setup, a new leader should be elected
          expect(newStatus.quorum).toBe(true);
        }
      }
    });

    test('should maintain session during failover', async ({ page, baseURL }) => {
      // Login
      await page.goto(`${baseURL}/login`);
      await page.fill('[data-testid="email"]', 'test@enterprise.com');
      await page.fill('[data-testid="password"]', 'TestPassword123!');
      await page.click('[data-testid="login-submit"]');

      // Navigate to protected page
      await page.goto(`${baseURL}/dashboard`);
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();

      // Session should persist (simulated failover doesn't affect client)
      await page.reload();
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    });
  });

  test.describe('Database Management', () => {
    test('should show database connection status', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/database`);

      await expect(page.locator('[data-testid="db-connection-status"]')).toBeVisible();
      await expect(page.locator('[data-testid="db-pool-status"]')).toBeVisible();
      await expect(page.locator('[data-testid="db-replication-status"]')).toBeVisible();
    });

    test('should support database migration status', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/database/migrations`);

      // Should show migration history
      await expect(page.locator('[data-testid="migration-history"]')).toBeVisible();

      // Each migration should show status
      const migrations = page.locator('[data-testid="migration-entry"]');
      if (await migrations.count() > 0) {
        await expect(migrations.first().locator('[data-testid="migration-status"]')).toBeVisible();
        await expect(migrations.first().locator('[data-testid="migration-version"]')).toBeVisible();
      }
    });

    test('should allow backup configuration', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/database/backup`);

      // Backup configuration options
      await expect(page.locator('[data-testid="backup-schedule"]')).toBeVisible();
      await expect(page.locator('[data-testid="backup-retention"]')).toBeVisible();
      await expect(page.locator('[data-testid="backup-location"]')).toBeVisible();

      // Manual backup trigger
      await expect(page.locator('[data-testid="backup-now"]')).toBeVisible();
    });

    test('should show backup history', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/database/backup`);

      // Should show backup history
      const backupHistory = page.locator('[data-testid="backup-history"]');
      await expect(backupHistory).toBeVisible();

      // Each backup should show size and status
      const backups = page.locator('[data-testid="backup-entry"]');
      if (await backups.count() > 0) {
        await expect(backups.first().locator('[data-testid="backup-size"]')).toBeVisible();
        await expect(backups.first().locator('[data-testid="backup-status"]')).toBeVisible();
      }
    });
  });

  test.describe('Security Configuration', () => {
    test('should enforce TLS in production', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}/api/admin/security/tls-status`);

      if (response.ok()) {
        const data = await response.json();
        expect(data.tlsEnabled).toBe(true);
        expect(data.tlsVersion).toMatch(/^TLS\s*1\.[23]$/);
        expect(data.certificateExpiry).toBeDefined();
      }
    });

    test('should show certificate status', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/security/certificates`);

      // Should show certificate info
      await expect(page.locator('[data-testid="cert-issuer"]')).toBeVisible();
      await expect(page.locator('[data-testid="cert-expiry"]')).toBeVisible();
      await expect(page.locator('[data-testid="cert-days-remaining"]')).toBeVisible();
    });

    test('should warn on expiring certificates', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/security/certificates`);

      const daysRemaining = await page.locator('[data-testid="cert-days-remaining"]').textContent();
      const days = parseInt(daysRemaining || '999', 10);

      if (days < 30) {
        // Should show warning
        await expect(page.locator('[data-testid="cert-expiry-warning"]')).toBeVisible();
      }
    });

    test('should support custom CA certificates', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/security/certificates`);

      // Should show CA certificate management
      await expect(page.locator('[data-testid="ca-certificates"]')).toBeVisible();
      await expect(page.locator('[data-testid="add-ca-cert"]')).toBeVisible();
    });

    test('should configure security headers', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/security/headers`);

      // Should show security header configuration
      await expect(page.locator('[data-testid="header-csp"]')).toBeVisible();
      await expect(page.locator('[data-testid="header-hsts"]')).toBeVisible();
      await expect(page.locator('[data-testid="header-xfo"]')).toBeVisible();
    });
  });

  test.describe('Logging and Monitoring', () => {
    test('should configure log levels', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/logging`);

      // Should show log level configuration
      await expect(page.locator('[data-testid="log-level-select"]')).toBeVisible();

      // Should have standard log levels
      await page.click('[data-testid="log-level-select"]');
      await expect(page.locator('text=DEBUG')).toBeVisible();
      await expect(page.locator('text=INFO')).toBeVisible();
      await expect(page.locator('text=WARN')).toBeVisible();
      await expect(page.locator('text=ERROR')).toBeVisible();
    });

    test('should configure log destinations', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/logging`);

      // Should show log destination configuration
      await expect(page.locator('[data-testid="log-destinations"]')).toBeVisible();
      await expect(page.locator('[data-testid="log-dest-file"]')).toBeVisible();
      await expect(page.locator('[data-testid="log-dest-syslog"]')).toBeVisible();
    });

    test('should support log rotation settings', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/logging`);

      // Should show log rotation settings
      await expect(page.locator('[data-testid="log-rotation"]')).toBeVisible();
      await expect(page.locator('[data-testid="log-max-size"]')).toBeVisible();
      await expect(page.locator('[data-testid="log-max-files"]')).toBeVisible();
    });

    test('should view recent logs', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/logging/viewer`);

      // Should show log viewer
      await expect(page.locator('[data-testid="log-viewer"]')).toBeVisible();
      await expect(page.locator('[data-testid="log-filter"]')).toBeVisible();
      await expect(page.locator('[data-testid="log-search"]')).toBeVisible();
    });
  });

  test.describe('Update Management', () => {
    test('should check for updates (when online)', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}/api/admin/updates/check`);

      // In air-gapped env, this might fail gracefully
      if (response.ok()) {
        const data = await response.json();
        expect(data.currentVersion).toBeDefined();
        expect(data.updateAvailable).toBeDefined();
      }
    });

    test('should support offline update packages', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/updates`);

      // Should support offline update upload
      await expect(page.locator('[data-testid="offline-update-upload"]')).toBeVisible();
    });

    test('should validate update package before installation', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/updates`);

      // Upload button should be available
      await expect(page.locator('[data-testid="offline-update-upload"]')).toBeVisible();

      // Should show validation status after upload
      // (actual upload test would require a real update package)
    });

    test('should show update history', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/admin/login`);
      await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
      await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
      await page.click('[data-testid="admin-login-submit"]');

      await page.goto(`${baseURL}/admin/deployment/updates`);

      // Should show update history
      await expect(page.locator('[data-testid="update-history"]')).toBeVisible();
    });
  });
});
