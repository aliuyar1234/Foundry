/**
 * E2E Tests: Connector Setup Flow
 * Task: T212
 *
 * Tests the complete connector setup flow from marketplace to sync.
 * Uses Playwright for browser automation.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('[data-testid="email-input"]', 'admin@test.com');
  await page.fill('[data-testid="password-input"]', 'testpassword123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');
}

test.describe('Connector Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display connector marketplace with categories', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await expect(page.locator('h1')).toContainText('Connector Marketplace');

    const categories = ['All', 'ERP', 'CRM', 'Communication', 'Accounting', 'DMS'];
    for (const category of categories) {
      await expect(page.locator(`[data-testid="category-${category.toLowerCase()}"]`)).toBeVisible();
    }
  });

  test('should filter connectors by category', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.click('[data-testid="category-crm"]');

    const cards = page.locator('[data-testid="connector-card"]');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('[data-testid="connector-category"]')).toContainText('CRM');
    }
  });

  test('should search for connectors', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.fill('[data-testid="connector-search"]', 'Salesforce');
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="connector-card"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="connector-card"]')).toContainText('Salesforce');
  });
});

test.describe('Connector Setup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should complete Google Workspace setup', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.click('[data-testid="connector-google-workspace"] [data-testid="add-connector-button"]');

    // Step 1: Name
    await page.fill('[data-testid="connector-name"]', 'My Google Workspace');
    await page.click('[data-testid="wizard-next"]');

    // Step 2: Auth
    await expect(page.locator('[data-testid="oauth-button"]')).toBeVisible();
    await page.click('[data-testid="wizard-next"]');

    // Step 3: Scopes
    await page.check('[data-testid="scope-gmail"]');
    await page.check('[data-testid="scope-calendar"]');
    await page.click('[data-testid="wizard-next"]');

    // Step 4: Finish
    await page.click('[data-testid="wizard-finish"]');
    await expect(page.locator('[data-testid="setup-success"]')).toBeVisible();
  });

  test('should complete Salesforce setup', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.click('[data-testid="connector-salesforce"] [data-testid="add-connector-button"]');

    await page.fill('[data-testid="connector-name"]', 'My Salesforce');
    await page.selectOption('[data-testid="salesforce-environment"]', 'production');
    await page.click('[data-testid="wizard-next"]');

    await page.click('[data-testid="wizard-next"]');

    await page.check('[data-testid="object-account"]');
    await page.check('[data-testid="object-contact"]');
    await page.click('[data-testid="wizard-next"]');

    await page.selectOption('[data-testid="sync-frequency"]', 'hourly');
    await page.click('[data-testid="wizard-next"]');

    await page.click('[data-testid="wizard-finish"]');
    await expect(page.locator('[data-testid="setup-success"]')).toBeVisible();
  });

  test('should handle wizard cancellation', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.click('[data-testid="connector-card"]:first-child [data-testid="add-connector-button"]');

    await page.click('[data-testid="wizard-cancel"]');
    await expect(page.locator('[data-testid="cancel-confirmation"]')).toBeVisible();
    await page.click('[data-testid="confirm-cancel"]');
    await expect(page.locator('[data-testid="connector-wizard"]')).not.toBeVisible();
  });
});

test.describe('Connection Testing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should test connection successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/test-instance-1`);
    await page.click('[data-testid="test-connection-button"]');
    await page.waitForSelector('[data-testid="connection-result"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="connection-success"]')).toBeVisible();
  });

  test('should handle connection failure', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/bad-credentials-instance`);
    await page.click('[data-testid="test-connection-button"]');
    await page.waitForSelector('[data-testid="connection-result"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="connection-error"]')).toBeVisible();
  });
});

test.describe('Connector Instance Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display instances list', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances`);
    await expect(page.locator('h1')).toContainText('Connector Instances');
    await expect(page.locator('[data-testid="instance-card"]')).toHaveCount.greaterThan(0);
  });

  test('should trigger manual sync', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/test-instance-1`);
    await page.click('[data-testid="sync-now-button"]');
    await expect(page.locator('[data-testid="sync-in-progress"]')).toBeVisible();
  });

  test('should delete connector with confirmation', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/test-instance-to-delete`);
    await page.click('[data-testid="delete-button"]');
    await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();
    await page.fill('[data-testid="confirm-name-input"]', 'Test Instance To Delete');
    await page.click('[data-testid="confirm-delete"]');
    await page.waitForURL('**/connectors/instances');
  });
});

test.describe('Sync History and Errors', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display sync history', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/test-instance-1`);
    await page.click('[data-testid="tab-sync-history"]');
    await expect(page.locator('[data-testid="sync-timeline"]')).toBeVisible();
  });

  test('should display error log', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/test-instance-with-errors`);
    await page.click('[data-testid="tab-errors"]');
    await expect(page.locator('[data-testid="error-log"]')).toBeVisible();
  });

  test('should filter errors by severity', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/instances/test-instance-with-errors`);
    await page.click('[data-testid="tab-errors"]');
    await page.selectOption('[data-testid="severity-filter"]', 'error');

    const errors = page.locator('[data-testid="error-entry"]');
    const count = await errors.count();
    for (let i = 0; i < count; i++) {
      await expect(errors.nth(i).locator('[data-testid="error-severity"]')).toContainText('error');
    }
  });
});

test.describe('BMD Austrian Connector', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should complete BMD file import', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.click('[data-testid="connector-bmd"] [data-testid="add-connector-button"]');

    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('tests/fixtures/sample-bmd-export.ntcs');
    await expect(page.locator('[data-testid="file-format"]')).toContainText('NTCS');
    await page.click('[data-testid="wizard-next"]');

    await page.click('[data-testid="chart-ekr"]');
    await page.click('[data-testid="wizard-next"]');

    await expect(page.locator('[data-testid="preview-bookings"]')).toBeVisible();
    await page.click('[data-testid="wizard-next"]');

    await page.click('[data-testid="start-import"]');
    await page.waitForSelector('[data-testid="import-complete"]', { timeout: 60000 });
  });
});

test.describe('DMS Connector Setup', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should complete Docuware setup', async ({ page }) => {
    await page.goto(`${BASE_URL}/connectors/marketplace`);
    await page.click('[data-testid="connector-docuware"] [data-testid="add-connector-button"]');

    await page.fill('[data-testid="docuware-url"]', 'https://demo.docuware.cloud');
    await page.click('[data-testid="wizard-next"]');

    await page.fill('[data-testid="username"]', 'demo@example.com');
    await page.fill('[data-testid="password"]', 'demopassword');
    await page.click('[data-testid="wizard-next"]');

    await page.check('[data-testid="cabinet-invoices"]');
    await page.click('[data-testid="wizard-next"]');

    await page.click('[data-testid="wizard-finish"]');
    await expect(page.locator('[data-testid="setup-success"]')).toBeVisible();
  });
});
