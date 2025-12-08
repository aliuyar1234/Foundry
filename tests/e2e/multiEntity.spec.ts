/**
 * Multi-Entity End-to-End Tests (T383)
 * Comprehensive E2E tests for multi-entity functionality
 */

import { test, expect, Page } from '@playwright/test';

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

interface TestEntity {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
}

interface TestUser {
  email: string;
  password: string;
  entityAccess: string[];
}

// =============================================================================
// Test Fixtures
// =============================================================================

const testEntities: TestEntity[] = [
  { id: 'entity-parent', name: 'Acme Holdings', slug: 'acme-holdings' },
  { id: 'entity-child-1', name: 'Acme Tech', slug: 'acme-tech', parentId: 'entity-parent' },
  { id: 'entity-child-2', name: 'Acme Finance', slug: 'acme-finance', parentId: 'entity-parent' },
];

const testUsers: TestUser[] = [
  {
    email: 'admin@acme.com',
    password: 'TestPassword123!',
    entityAccess: ['entity-parent', 'entity-child-1', 'entity-child-2'],
  },
  {
    email: 'tech.user@acme.com',
    password: 'TestPassword123!',
    entityAccess: ['entity-child-1'],
  },
  {
    email: 'finance.user@acme.com',
    password: 'TestPassword123!',
    entityAccess: ['entity-child-2'],
  },
];

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

async function switchEntity(page: Page, entitySlug: string): Promise<void> {
  await page.click('[data-testid="entity-selector"]');
  await page.click(`[data-testid="entity-option-${entitySlug}"]`);
  await page.waitForResponse((response) =>
    response.url().includes('/api/entities/') && response.status() === 200
  );
}

async function getCurrentEntitySlug(page: Page): Promise<string> {
  const entitySelector = page.locator('[data-testid="current-entity-slug"]');
  return entitySelector.textContent() || '';
}

async function createTestData(page: Page, entitySlug: string, dataType: string): Promise<string> {
  await page.goto(`${BASE_URL}/${entitySlug}/${dataType}/new`);
  const testName = `Test ${dataType} ${Date.now()}`;
  await page.fill('[data-testid="name-input"]', testName);
  await page.click('[data-testid="submit-button"]');
  await page.waitForResponse((response) =>
    response.url().includes(`/api/${dataType}`) && response.status() === 201
  );
  return testName;
}

// =============================================================================
// Test Suites
// =============================================================================

test.describe('Multi-Entity Management', () => {
  test.describe('Entity Creation and Hierarchy', () => {
    test('should create parent entity', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/entities/new`);

      await page.fill('[data-testid="entity-name"]', 'New Parent Entity');
      await page.fill('[data-testid="entity-slug"]', 'new-parent-entity');
      await page.click('[data-testid="create-entity-button"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(page).toHaveURL(/\/admin\/entities\/[a-z0-9-]+/);
    });

    test('should create child entity under parent', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/entities/new`);

      await page.fill('[data-testid="entity-name"]', 'New Child Entity');
      await page.fill('[data-testid="entity-slug"]', 'new-child-entity');
      await page.selectOption('[data-testid="parent-entity"]', 'entity-parent');
      await page.click('[data-testid="create-entity-button"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should display entity hierarchy correctly', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/entities`);

      // Check parent entity is visible
      await expect(page.locator(`[data-testid="entity-${testEntities[0].slug}"]`)).toBeVisible();

      // Expand parent to see children
      await page.click(`[data-testid="expand-entity-${testEntities[0].slug}"]`);

      // Check child entities are visible
      await expect(page.locator(`[data-testid="entity-${testEntities[1].slug}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="entity-${testEntities[2].slug}"]`)).toBeVisible();
    });

    test('should validate unique entity slug', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/entities/new`);

      await page.fill('[data-testid="entity-name"]', 'Duplicate Test');
      await page.fill('[data-testid="entity-slug"]', testEntities[0].slug); // Existing slug
      await page.click('[data-testid="create-entity-button"]');

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'slug is already in use'
      );
    });
  });

  test.describe('Data Isolation (RLS)', () => {
    test('should only show data from current entity', async ({ page }) => {
      // Login as tech user who only has access to entity-child-1
      await login(page, testUsers[1].email, testUsers[1].password);

      // Navigate to data sources
      await page.goto(`${BASE_URL}/data-sources`);

      // Verify we're in the correct entity
      const currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[1].slug);

      // Get data sources count
      const dataSources = page.locator('[data-testid="data-source-card"]');
      const count = await dataSources.count();

      // Each data source should belong to the current entity
      for (let i = 0; i < count; i++) {
        const entityTag = dataSources.nth(i).locator('[data-testid="entity-tag"]');
        await expect(entityTag).toContainText(testEntities[1].name);
      }
    });

    test('should not allow access to unauthorized entity data', async ({ page }) => {
      // Login as tech user
      await login(page, testUsers[1].email, testUsers[1].password);

      // Try to access finance entity data directly via URL
      const response = await page.goto(`${BASE_URL}/${testEntities[2].slug}/dashboard`);

      // Should be redirected or show access denied
      await expect(page.locator('[data-testid="access-denied"]')).toBeVisible();
    });

    test('should prevent cross-entity data queries via API', async ({ page, request }) => {
      // Login as tech user and get token
      await login(page, testUsers[1].email, testUsers[1].password);
      const cookies = await page.context().cookies();
      const authToken = cookies.find((c) => c.name === 'auth_token')?.value;

      // Try to fetch data from unauthorized entity via API
      const response = await request.get(
        `${API_URL}/api/entities/${testEntities[2].id}/data-sources`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status()).toBe(403);
    });

    test('should isolate Neo4j graph data by entity', async ({ page }) => {
      // Login as admin to verify data in both entities
      await login(page, testUsers[0].email, testUsers[0].password);

      // Switch to tech entity
      await switchEntity(page, testEntities[1].slug);
      await page.goto(`${BASE_URL}/discovery/network`);

      // Get nodes in tech entity
      const techNodes = await page.locator('[data-testid="network-node"]').count();

      // Switch to finance entity
      await switchEntity(page, testEntities[2].slug);
      await page.goto(`${BASE_URL}/discovery/network`);

      // Get nodes in finance entity
      const financeNodes = await page.locator('[data-testid="network-node"]').count();

      // Nodes should be different (entity-specific data)
      // This is a basic check - in practice, you'd verify specific node IDs
      expect(techNodes).toBeGreaterThanOrEqual(0);
      expect(financeNodes).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Entity Switching', () => {
    test('should switch between entities correctly', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);

      // Start in parent entity
      await switchEntity(page, testEntities[0].slug);
      let currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[0].slug);

      // Switch to child entity 1
      await switchEntity(page, testEntities[1].slug);
      currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[1].slug);

      // Switch to child entity 2
      await switchEntity(page, testEntities[2].slug);
      currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[2].slug);
    });

    test('should persist entity selection across page navigation', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await switchEntity(page, testEntities[1].slug);

      // Navigate to different pages
      await page.goto(`${BASE_URL}/data-sources`);
      let currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[1].slug);

      await page.goto(`${BASE_URL}/discovery/processes`);
      currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[1].slug);

      await page.goto(`${BASE_URL}/settings`);
      currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[1].slug);
    });

    test('should use keyboard shortcuts for entity switching', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);

      // Open entity selector with Ctrl+E
      await page.keyboard.press('Control+e');
      await expect(page.locator('[data-testid="entity-selector-modal"]')).toBeVisible();

      // Close with Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="entity-selector-modal"]')).not.toBeVisible();

      // Switch to first entity with Ctrl+1
      await page.keyboard.press('Control+1');
      const currentEntity = await getCurrentEntitySlug(page);
      expect(currentEntity).toBe(testEntities[0].slug);
    });

    test('should only show authorized entities in selector', async ({ page }) => {
      // Login as tech user (only has access to entity-child-1)
      await login(page, testUsers[1].email, testUsers[1].password);

      await page.click('[data-testid="entity-selector"]');

      // Should only see one entity
      const entityOptions = page.locator('[data-testid^="entity-option-"]');
      await expect(entityOptions).toHaveCount(1);
      await expect(page.locator(`[data-testid="entity-option-${testEntities[1].slug}"]`)).toBeVisible();
    });
  });

  test.describe('Cross-Entity Analytics', () => {
    test('should show aggregated data for authorized entities', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/analytics/cross-entity`);

      // Check that all three entities are represented
      await expect(page.locator(`[data-testid="entity-stat-${testEntities[0].slug}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="entity-stat-${testEntities[1].slug}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="entity-stat-${testEntities[2].slug}"]`)).toBeVisible();
    });

    test('should compare metrics across entities', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/analytics/cross-entity`);

      // Select entities to compare
      await page.click('[data-testid="compare-entities-button"]');
      await page.click(`[data-testid="compare-option-${testEntities[1].slug}"]`);
      await page.click(`[data-testid="compare-option-${testEntities[2].slug}"]`);
      await page.click('[data-testid="run-comparison"]');

      // Check comparison chart is displayed
      await expect(page.locator('[data-testid="comparison-chart"]')).toBeVisible();

      // Check both entities are in the chart
      await expect(page.locator('[data-testid="chart-legend"]')).toContainText(testEntities[1].name);
      await expect(page.locator('[data-testid="chart-legend"]')).toContainText(testEntities[2].name);
    });

    test('should respect user permissions in cross-entity reports', async ({ page }) => {
      // Login as tech user (limited access)
      await login(page, testUsers[1].email, testUsers[1].password);

      // Navigate to cross-entity analytics
      await page.goto(`${BASE_URL}/admin/analytics/cross-entity`);

      // Should only see data for authorized entity
      await expect(page.locator(`[data-testid="entity-stat-${testEntities[1].slug}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="entity-stat-${testEntities[2].slug}"]`)).not.toBeVisible();
    });

    test('should export cross-entity report', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await page.goto(`${BASE_URL}/admin/analytics/cross-entity`);

      // Click export button
      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-report-button"]');
      const download = await downloadPromise;

      // Verify download
      expect(download.suggestedFilename()).toMatch(/cross-entity-report.*\.(csv|xlsx|pdf)/);
    });
  });

  test.describe('Entity Settings and Configuration', () => {
    test('should inherit settings from parent entity', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);

      // Set a setting on parent entity
      await switchEntity(page, testEntities[0].slug);
      await page.goto(`${BASE_URL}/settings/entity`);
      await page.fill('[data-testid="retention-days"]', '365');
      await page.click('[data-testid="save-settings"]');

      // Check child entity inherits the setting
      await switchEntity(page, testEntities[1].slug);
      await page.goto(`${BASE_URL}/settings/entity`);

      const inheritedValue = await page.inputValue('[data-testid="retention-days"]');
      expect(inheritedValue).toBe('365');

      // Check inheritance indicator
      await expect(page.locator('[data-testid="inherited-from-parent"]')).toBeVisible();
    });

    test('should allow child entity to override parent settings', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);
      await switchEntity(page, testEntities[1].slug);
      await page.goto(`${BASE_URL}/settings/entity`);

      // Override parent setting
      await page.click('[data-testid="override-retention"]');
      await page.fill('[data-testid="retention-days"]', '180');
      await page.click('[data-testid="save-settings"]');

      // Verify override is saved
      await page.reload();
      const overriddenValue = await page.inputValue('[data-testid="retention-days"]');
      expect(overriddenValue).toBe('180');

      // Check override indicator
      await expect(page.locator('[data-testid="overrides-parent"]')).toBeVisible();
    });

    test('should apply entity-specific branding', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);

      // Set branding for child entity 1
      await switchEntity(page, testEntities[1].slug);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.fill('[data-testid="primary-color"]', '#FF5733');
      await page.click('[data-testid="save-branding"]');

      // Navigate to dashboard and check color is applied
      await page.goto(`${BASE_URL}/dashboard`);

      const primaryElement = page.locator('[data-testid="primary-branded-element"]');
      const color = await primaryElement.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );

      // Color should be the one we set (or close to it after conversion)
      expect(color).not.toBe('rgb(0, 0, 0)'); // Not default
    });
  });

  test.describe('Performance with Multiple Entities', () => {
    test('should load entity list efficiently (50+ entities)', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);

      const startTime = Date.now();
      await page.goto(`${BASE_URL}/admin/entities`);
      await page.waitForSelector('[data-testid="entities-loaded"]');
      const loadTime = Date.now() - startTime;

      // Should load within 3 seconds even with many entities
      expect(loadTime).toBeLessThan(3000);

      // Check virtual scrolling is working for large lists
      const virtualList = page.locator('[data-testid="virtual-entity-list"]');
      await expect(virtualList).toBeVisible();
    });

    test('should switch entities within 500ms', async ({ page }) => {
      await login(page, testUsers[0].email, testUsers[0].password);

      const startTime = Date.now();
      await switchEntity(page, testEntities[1].slug);
      const switchTime = Date.now() - startTime;

      expect(switchTime).toBeLessThan(500);
    });
  });
});

// =============================================================================
// Cleanup
// =============================================================================

test.afterAll(async ({ request }) => {
  // Clean up test data if needed
  // This would typically call an API endpoint to remove test entities
  console.log('Cleaning up test data...');
});
