/**
 * Benchmark Opt-in/Opt-out E2E Tests
 * Task: T388
 *
 * Tests for anonymous benchmark data sharing functionality including
 * opt-in/opt-out controls, data anonymization, and compliance.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

// Test configuration
const BENCHMARK_CONFIG = {
  settingsPage: '/settings/privacy/benchmarks',
  adminSettingsPage: '/admin/settings/benchmarks',
  dataPreviewEndpoint: '/api/benchmarks/preview',
  optInEndpoint: '/api/benchmarks/opt-in',
  optOutEndpoint: '/api/benchmarks/opt-out',
  statusEndpoint: '/api/benchmarks/status',
};

// Helper to login as regular user
async function loginAsUser(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/login`);
  await page.fill('[data-testid="email"]', 'user@enterprise.com');
  await page.fill('[data-testid="password"]', 'UserPassword123!');
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/\/dashboard/);
}

// Helper to login as admin
async function loginAsAdmin(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/admin/login`);
  await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
  await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
  await page.click('[data-testid="admin-login-submit"]');
  await page.waitForURL(/\/admin/);
}

test.describe('Benchmark Opt-in/Opt-out', () => {
  test.describe('User Opt-in Flow', () => {
    test('should display benchmark settings page', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Should show benchmark settings
      await expect(page.locator('[data-testid="benchmark-settings"]')).toBeVisible();
      await expect(page.locator('[data-testid="benchmark-description"]')).toBeVisible();
      await expect(page.locator('[data-testid="benchmark-toggle"]')).toBeVisible();
    });

    test('should show opt-in benefits explanation', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Should explain what benchmarks are
      await expect(page.locator('[data-testid="benchmark-benefits"]')).toBeVisible();

      // Check for key benefit points
      const benefits = page.locator('[data-testid="benefit-item"]');
      expect(await benefits.count()).toBeGreaterThan(0);
    });

    test('should allow user to opt-in to benchmarks', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Initially not opted in
      const toggle = page.locator('[data-testid="benchmark-toggle"]');
      const isOptedIn = await toggle.getAttribute('aria-checked');

      if (isOptedIn === 'false') {
        await toggle.click();

        // Should show confirmation dialog
        await expect(page.locator('[data-testid="opt-in-confirmation"]')).toBeVisible();

        // Confirm opt-in
        await page.click('[data-testid="confirm-opt-in"]');

        // Should show success
        await expect(page.locator('[data-testid="opt-in-success"]')).toBeVisible();

        // Toggle should now be on
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
      }
    });

    test('should allow user to opt-out of benchmarks', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      const toggle = page.locator('[data-testid="benchmark-toggle"]');
      const isOptedIn = await toggle.getAttribute('aria-checked');

      if (isOptedIn === 'true') {
        await toggle.click();

        // Should show confirmation dialog
        await expect(page.locator('[data-testid="opt-out-confirmation"]')).toBeVisible();

        // Confirm opt-out
        await page.click('[data-testid="confirm-opt-out"]');

        // Should show success
        await expect(page.locator('[data-testid="opt-out-success"]')).toBeVisible();

        // Toggle should now be off
        await expect(toggle).toHaveAttribute('aria-checked', 'false');
      }
    });

    test('should require explicit consent for opt-in', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      const toggle = page.locator('[data-testid="benchmark-toggle"]');
      await toggle.click();

      // Confirmation dialog should appear
      const dialog = page.locator('[data-testid="opt-in-confirmation"]');
      await expect(dialog).toBeVisible();

      // Should have checkbox for consent
      const consentCheckbox = dialog.locator('[data-testid="consent-checkbox"]');
      await expect(consentCheckbox).toBeVisible();

      // Confirm button should be disabled until consent is given
      const confirmButton = dialog.locator('[data-testid="confirm-opt-in"]');
      await expect(confirmButton).toBeDisabled();

      // Check consent
      await consentCheckbox.click();
      await expect(confirmButton).toBeEnabled();
    });
  });

  test.describe('Data Preview', () => {
    test('should show preview of data to be shared', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Click preview button
      await page.click('[data-testid="preview-data-button"]');

      // Should show preview modal
      await expect(page.locator('[data-testid="data-preview-modal"]')).toBeVisible();
    });

    test('should display anonymization explanation', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      await page.click('[data-testid="preview-data-button"]');
      const modal = page.locator('[data-testid="data-preview-modal"]');

      // Should explain how data is anonymized
      await expect(modal.locator('[data-testid="anonymization-explanation"]')).toBeVisible();
    });

    test('should show sample anonymized data', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      await page.click('[data-testid="preview-data-button"]');
      const modal = page.locator('[data-testid="data-preview-modal"]');

      // Should show data categories
      await expect(modal.locator('[data-testid="data-category-usage"]')).toBeVisible();
      await expect(modal.locator('[data-testid="data-category-performance"]')).toBeVisible();
      await expect(modal.locator('[data-testid="data-category-features"]')).toBeVisible();

      // Data should be anonymized (no PII)
      const previewContent = await modal.locator('[data-testid="preview-content"]').textContent();

      // Should not contain email patterns
      expect(previewContent).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/);
      // Should not contain names
      expect(previewContent).not.toContain('user@enterprise.com');
    });

    test('should show what data is NOT shared', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      await page.click('[data-testid="preview-data-button"]');
      const modal = page.locator('[data-testid="data-preview-modal"]');

      // Should list excluded data
      await expect(modal.locator('[data-testid="excluded-data"]')).toBeVisible();

      const excludedItems = modal.locator('[data-testid="excluded-item"]');
      expect(await excludedItems.count()).toBeGreaterThan(0);
    });
  });

  test.describe('API Opt-in/Opt-out', () => {
    test('should opt-in via API', async ({ request, baseURL }) => {
      const response = await request.post(`${baseURL}${BENCHMARK_CONFIG.optInEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
        data: {
          consent: true,
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.status).toBe('opted-in');
      expect(data.consentRecorded).toBe(true);
    });

    test('should opt-out via API', async ({ request, baseURL }) => {
      const response = await request.post(`${baseURL}${BENCHMARK_CONFIG.optOutEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.status).toBe('opted-out');
    });

    test('should get current opt-in status via API', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${BENCHMARK_CONFIG.statusEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.optedIn).toBeDefined();
      expect(typeof data.optedIn).toBe('boolean');
      if (data.optedIn) {
        expect(data.consentDate).toBeDefined();
      }
    });

    test('should return preview data via API', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${BENCHMARK_CONFIG.dataPreviewEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.preview).toBeDefined();
      expect(data.anonymizationMethod).toBeDefined();
    });
  });

  test.describe('Admin Controls', () => {
    test('should show benchmark admin settings', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Should show admin controls
      await expect(page.locator('[data-testid="admin-benchmark-settings"]')).toBeVisible();
    });

    test('should allow admin to disable benchmarks organization-wide', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Organization-wide toggle
      const orgToggle = page.locator('[data-testid="org-benchmark-toggle"]');
      await expect(orgToggle).toBeVisible();

      // Should be able to disable
      if (await orgToggle.getAttribute('aria-checked') === 'true') {
        await orgToggle.click();
        await expect(page.locator('[data-testid="org-benchmarks-disabled-confirmation"]')).toBeVisible();
        await page.click('[data-testid="confirm-disable"]');
      }
    });

    test('should show participation statistics', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Should show participation stats
      await expect(page.locator('[data-testid="benchmark-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="opted-in-count"]')).toBeVisible();
      await expect(page.locator('[data-testid="opted-out-count"]')).toBeVisible();
    });

    test('should allow admin to view aggregated benchmark data', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // View aggregated data
      await page.click('[data-testid="view-aggregated-data"]');

      // Should show aggregated data
      await expect(page.locator('[data-testid="aggregated-data-view"]')).toBeVisible();
    });

    test('should show data retention settings', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Should show retention settings
      await expect(page.locator('[data-testid="data-retention-settings"]')).toBeVisible();
      await expect(page.locator('[data-testid="retention-period"]')).toBeVisible();
    });
  });

  test.describe('Data Anonymization Verification', () => {
    test('should verify no PII in benchmark data', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${BENCHMARK_CONFIG.dataPreviewEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      const data = await response.json();
      const jsonString = JSON.stringify(data.preview);

      // Check for common PII patterns
      // Email addresses
      expect(jsonString).not.toMatch(/[\w.-]+@[\w.-]+\.\w{2,}/);
      // Phone numbers
      expect(jsonString).not.toMatch(/\+?\d{1,4}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/);
      // IP addresses (should be anonymized)
      expect(jsonString).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
      // Credit card numbers
      expect(jsonString).not.toMatch(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/);
    });

    test('should use k-anonymity for aggregate data', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}/api/benchmarks/anonymization-info`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.methods).toContain('k-anonymity');
        expect(data.kValue).toBeGreaterThanOrEqual(5);
      }
    });

    test('should hash identifiable fields', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${BENCHMARK_CONFIG.dataPreviewEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      const data = await response.json();

      // Identifiable fields should be hashed
      if (data.preview.userId) {
        // Should be a hash, not the actual ID
        expect(data.preview.userId).toMatch(/^[a-f0-9]{64}$/); // SHA-256 format
      }
    });

    test('should generalize location data', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${BENCHMARK_CONFIG.dataPreviewEndpoint}`, {
        headers: {
          'Authorization': 'Bearer test-user-token',
        },
      });

      const data = await response.json();

      // Location should be generalized (region/country level only)
      if (data.preview.location) {
        expect(data.preview.location.precision).toBe('region');
        expect(data.preview.location.city).toBeUndefined();
        expect(data.preview.location.address).toBeUndefined();
      }
    });
  });

  test.describe('Compliance', () => {
    test('should record consent timestamp', async ({ request, baseURL }) => {
      // Opt-in
      await request.post(`${baseURL}${BENCHMARK_CONFIG.optInEndpoint}`, {
        headers: { 'Authorization': 'Bearer test-user-token' },
        data: { consent: true },
      });

      // Check status
      const response = await request.get(`${baseURL}${BENCHMARK_CONFIG.statusEndpoint}`, {
        headers: { 'Authorization': 'Bearer test-user-token' },
      });

      const data = await response.json();
      if (data.optedIn) {
        expect(data.consentDate).toBeDefined();
        expect(new Date(data.consentDate).getTime()).toBeLessThanOrEqual(Date.now());
      }
    });

    test('should allow data export request', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Request data export
      await page.click('[data-testid="request-data-export"]');

      // Should show confirmation
      await expect(page.locator('[data-testid="export-request-confirmation"]')).toBeVisible();
    });

    test('should allow data deletion request', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Request data deletion
      await page.click('[data-testid="request-data-deletion"]');

      // Should show confirmation dialog
      await expect(page.locator('[data-testid="deletion-confirmation-dialog"]')).toBeVisible();

      // Confirm deletion
      await page.fill('[data-testid="confirm-deletion-input"]', 'DELETE');
      await page.click('[data-testid="confirm-deletion-button"]');

      // Should show success
      await expect(page.locator('[data-testid="deletion-request-success"]')).toBeVisible();
    });

    test('should show GDPR information', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Should show GDPR info link
      await page.click('[data-testid="gdpr-info-link"]');

      // Should show GDPR information
      await expect(page.locator('[data-testid="gdpr-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="data-controller-info"]')).toBeVisible();
      await expect(page.locator('[data-testid="legal-basis"]')).toBeVisible();
    });

    test('should display privacy policy link', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Privacy policy link should be visible
      const privacyLink = page.locator('[data-testid="privacy-policy-link"]');
      await expect(privacyLink).toBeVisible();
      await expect(privacyLink).toHaveAttribute('href');
    });
  });

  test.describe('Multi-Entity Support', () => {
    test('should allow per-entity benchmark settings', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Should show per-entity controls
      await expect(page.locator('[data-testid="per-entity-benchmark-settings"]')).toBeVisible();

      // Should list entities
      const entityList = page.locator('[data-testid="entity-benchmark-list"]');
      await expect(entityList).toBeVisible();
    });

    test('should inherit parent entity settings by default', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Child entities should show inheritance
      const inheritanceIndicator = page.locator('[data-testid="settings-inherited"]');
      if (await inheritanceIndicator.count() > 0) {
        await expect(inheritanceIndicator.first()).toBeVisible();
      }
    });

    test('should allow entity to override parent settings', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.adminSettingsPage}`);

      // Click on an entity
      const entityRow = page.locator('[data-testid="entity-benchmark-row"]').first();
      if (await entityRow.count() > 0) {
        await entityRow.click();

        // Should show override option
        await expect(page.locator('[data-testid="override-parent-settings"]')).toBeVisible();
      }
    });
  });

  test.describe('Benchmark Data Types', () => {
    test('should allow selection of data types to share', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Should show data type selection
      await expect(page.locator('[data-testid="data-type-selection"]')).toBeVisible();

      // Check for available data types
      await expect(page.locator('[data-testid="data-type-usage"]')).toBeVisible();
      await expect(page.locator('[data-testid="data-type-performance"]')).toBeVisible();
      await expect(page.locator('[data-testid="data-type-features"]')).toBeVisible();
    });

    test('should allow partial opt-in', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Select specific data types
      const usageCheckbox = page.locator('[data-testid="data-type-usage"] input');
      const performanceCheckbox = page.locator('[data-testid="data-type-performance"] input');

      // Enable only usage data
      if (!(await usageCheckbox.isChecked())) {
        await usageCheckbox.click();
      }

      // Disable performance data
      if (await performanceCheckbox.isChecked()) {
        await performanceCheckbox.click();
      }

      // Save settings
      await page.click('[data-testid="save-benchmark-settings"]');

      // Should show success
      await expect(page.locator('[data-testid="settings-saved"]')).toBeVisible();
    });

    test('should show description for each data type', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      // Each data type should have description
      const dataTypes = page.locator('[data-testid^="data-type-"]');
      const count = await dataTypes.count();

      for (let i = 0; i < count; i++) {
        const description = dataTypes.nth(i).locator('[data-testid="data-type-description"]');
        await expect(description).toBeVisible();
      }
    });
  });

  test.describe('Notifications', () => {
    test('should notify user of opt-in status changes', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);

      const toggle = page.locator('[data-testid="benchmark-toggle"]');
      await toggle.click();

      // Handle confirmation if needed
      const confirmButton = page.locator('[data-testid="confirm-opt-in"], [data-testid="confirm-opt-out"]');
      if (await confirmButton.isVisible()) {
        // Check consent if needed
        const consentCheckbox = page.locator('[data-testid="consent-checkbox"]');
        if (await consentCheckbox.isVisible()) {
          await consentCheckbox.click();
        }
        await confirmButton.click();
      }

      // Should show notification
      await expect(page.locator('[data-testid="notification"]')).toBeVisible();
    });

    test('should send email notification on opt-in status change', async ({ request, baseURL }) => {
      // Opt-in
      const response = await request.post(`${baseURL}${BENCHMARK_CONFIG.optInEndpoint}`, {
        headers: { 'Authorization': 'Bearer test-user-token' },
        data: { consent: true, sendNotification: true },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.notificationSent).toBe(true);
    });
  });

  test.describe('Benchmarks Dashboard', () => {
    test('should show benchmark dashboard for opted-in users', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}/benchmarks/dashboard`);

      // Should show benchmark dashboard
      await expect(page.locator('[data-testid="benchmarks-dashboard"]')).toBeVisible();
    });

    test('should show comparison with industry benchmarks', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}/benchmarks/dashboard`);

      // Should show industry comparison
      await expect(page.locator('[data-testid="industry-comparison"]')).toBeVisible();
    });

    test('should show trend data', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);
      await page.goto(`${baseURL}/benchmarks/dashboard`);

      // Should show trend charts
      await expect(page.locator('[data-testid="trend-chart"]')).toBeVisible();
    });

    test('should show opt-in prompt for non-participating users', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!);

      // Opt-out first
      await page.goto(`${baseURL}${BENCHMARK_CONFIG.settingsPage}`);
      const toggle = page.locator('[data-testid="benchmark-toggle"]');
      if (await toggle.getAttribute('aria-checked') === 'true') {
        await toggle.click();
        const confirmButton = page.locator('[data-testid="confirm-opt-out"]');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }
      }

      // Go to dashboard
      await page.goto(`${baseURL}/benchmarks/dashboard`);

      // Should show opt-in prompt
      await expect(page.locator('[data-testid="opt-in-prompt"]')).toBeVisible();
    });

    test('should allow filtering by entity', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}/benchmarks/dashboard`);

      // Should show entity filter
      const entityFilter = page.locator('[data-testid="entity-filter"]');
      await expect(entityFilter).toBeVisible();

      // Select different entity
      await entityFilter.click();
      await page.locator('[data-testid="entity-option"]').first().click();
    });
  });
});
