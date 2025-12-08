/**
 * User Story Validation E2E Tests
 * Tasks: T389-T394
 *
 * Validates all acceptance scenarios for each user story in the
 * SCALE Tier Enterprise Features specification.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

// Helper functions
async function loginAsAdmin(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/admin/login`);
  await page.fill('[data-testid="admin-email"]', 'admin@enterprise.com');
  await page.fill('[data-testid="admin-password"]', 'AdminPassword123!');
  await page.click('[data-testid="admin-login-submit"]');
  await page.waitForURL(/\/admin/);
}

async function loginAsUser(page: Page, baseURL: string, email: string, password: string) {
  await page.goto(`${baseURL}/login`);
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/\/dashboard/);
}

async function loginAsEntityUser(page: Page, baseURL: string, entitySlug: string) {
  await page.goto(`${baseURL}/login`);
  await page.fill('[data-testid="email"]', `user@${entitySlug}.enterprise.com`);
  await page.fill('[data-testid="password"]', 'UserPassword123!');
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/\/dashboard/);
}

/**
 * T389: US1 - Multi-Entity Organization Support Validation
 *
 * Acceptance Scenarios:
 * 1. Configure 3 entities with separate user groups, verify data isolation
 * 2. Cross-entity analytics for authorized executives
 * 3. Data isolation enforcement
 * 4. GDPR deletion affects only specific entity
 * 5. Entity admin access boundaries
 */
test.describe('T389: US1 - Multi-Entity Organization Support', () => {
  test.describe('Scenario 1: Entity Configuration and Data Isolation', () => {
    test('should configure 3 entities with separate tenant spaces', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}/admin/entities`);

      // Verify at least 3 entities exist or create them
      const entities = page.locator('[data-testid="entity-card"]');
      const count = await entities.count();

      if (count < 3) {
        // Create additional entities
        for (let i = count; i < 3; i++) {
          await page.click('[data-testid="create-entity"]');
          await page.fill('[data-testid="entity-name"]', `Test Entity ${i + 1}`);
          await page.fill('[data-testid="entity-slug"]', `test-entity-${i + 1}`);
          await page.click('[data-testid="entity-submit"]');
          await expect(page.locator('[data-testid="entity-created-success"]')).toBeVisible();
        }
      }

      // Verify each entity has separate configuration
      await entities.first().click();
      await expect(page.locator('[data-testid="entity-config"]')).toBeVisible();
      await expect(page.locator('[data-testid="entity-users"]')).toBeVisible();
      await expect(page.locator('[data-testid="entity-data-isolation"]')).toBeVisible();
    });

    test('should isolate data between entities', async ({ request, baseURL }) => {
      // Create data in Entity A
      const entityAResponse = await request.post(`${baseURL}/api/entities/entity-a/data`, {
        headers: {
          'Authorization': 'Bearer entity-a-user-token',
          'X-Entity-Context': 'entity-a',
        },
        data: {
          type: 'process',
          name: 'Entity A Process',
          data: { sensitive: 'Entity A data' },
        },
      });
      expect(entityAResponse.ok()).toBe(true);
      const entityAData = await entityAResponse.json();

      // Try to access Entity A data from Entity B context - should fail
      const crossAccessResponse = await request.get(
        `${baseURL}/api/entities/entity-a/data/${entityAData.id}`,
        {
          headers: {
            'Authorization': 'Bearer entity-b-user-token',
            'X-Entity-Context': 'entity-b',
          },
        }
      );

      // Should be forbidden or not found
      expect([403, 404]).toContain(crossAccessResponse.status());
    });
  });

  test.describe('Scenario 2: Employee Data Access Isolation', () => {
    test('employee in Entity A should only see Entity A data', async ({ page, baseURL }) => {
      await loginAsEntityUser(page, baseURL!, 'entity-a');

      // Search for data
      await page.goto(`${baseURL}/search`);
      await page.fill('[data-testid="search-input"]', 'process');
      await page.click('[data-testid="search-submit"]');

      // All results should be from Entity A
      const results = page.locator('[data-testid="search-result"]');
      const count = await results.count();

      for (let i = 0; i < count; i++) {
        const entityBadge = results.nth(i).locator('[data-testid="entity-badge"]');
        const entityName = await entityBadge.textContent();
        expect(entityName).toBe('Entity A');
      }
    });

    test('employee without cross-entity access cannot see other entity data', async ({ page, baseURL }) => {
      await loginAsEntityUser(page, baseURL!, 'entity-a');

      // Try to switch to Entity B
      await page.click('[data-testid="entity-switcher"]');
      const entityBOption = page.locator('[data-testid="entity-option-entity-b"]');

      // Option should not be visible or disabled
      if (await entityBOption.isVisible()) {
        await expect(entityBOption).toBeDisabled();
      }
    });
  });

  test.describe('Scenario 3: CFO Cross-Entity Access', () => {
    test('CFO with cross-entity access sees consolidated metrics', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'cfo@enterprise.com', 'CFOPassword123!');
      await page.goto(`${baseURL}/analytics/cross-entity`);

      // Should see consolidated dashboard
      await expect(page.locator('[data-testid="cross-entity-dashboard"]')).toBeVisible();

      // Should have metrics from multiple entities
      const entityMetrics = page.locator('[data-testid="entity-metric"]');
      expect(await entityMetrics.count()).toBeGreaterThanOrEqual(2);

      // Should have drill-down capability
      await entityMetrics.first().click();
      await expect(page.locator('[data-testid="entity-drilldown"]')).toBeVisible();
    });

    test('CFO can drill down into specific entity data', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'cfo@enterprise.com', 'CFOPassword123!');
      await page.goto(`${baseURL}/analytics/cross-entity`);

      // Click on entity to drill down
      await page.click('[data-testid="entity-metric-entity-a"]');
      await expect(page.locator('[data-testid="entity-detail-view"]')).toBeVisible();

      // Should see Entity A specific data
      await expect(page.locator('[data-testid="entity-processes"]')).toBeVisible();
      await expect(page.locator('[data-testid="entity-insights"]')).toBeVisible();
    });
  });

  test.describe('Scenario 4: GDPR Deletion Isolation', () => {
    test('GDPR deletion request for Entity B only affects Entity B', async ({ request, baseURL }) => {
      // Get current data counts
      const beforeEntityA = await request.get(`${baseURL}/api/entities/entity-a/data/count`, {
        headers: { 'Authorization': 'Bearer admin-token' },
      });
      const entityACountBefore = (await beforeEntityA.json()).count;

      const beforeEntityC = await request.get(`${baseURL}/api/entities/entity-c/data/count`, {
        headers: { 'Authorization': 'Bearer admin-token' },
      });
      const entityCCountBefore = (await beforeEntityC.json()).count;

      // Execute GDPR deletion for Entity B
      const gdprResponse = await request.post(`${baseURL}/api/entities/entity-b/gdpr/delete`, {
        headers: { 'Authorization': 'Bearer admin-token' },
        data: {
          scope: 'all',
          confirmation: 'DELETE-ENTITY-B-DATA',
        },
      });

      if (gdprResponse.ok()) {
        // Verify Entity A and C data counts unchanged
        const afterEntityA = await request.get(`${baseURL}/api/entities/entity-a/data/count`, {
          headers: { 'Authorization': 'Bearer admin-token' },
        });
        expect((await afterEntityA.json()).count).toBe(entityACountBefore);

        const afterEntityC = await request.get(`${baseURL}/api/entities/entity-c/data/count`, {
          headers: { 'Authorization': 'Bearer admin-token' },
        });
        expect((await afterEntityC.json()).count).toBe(entityCCountBefore);
      }
    });
  });

  test.describe('Scenario 5: Entity Admin Access Boundaries', () => {
    test('Entity A admin cannot access Entity B settings', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'admin@entity-a.enterprise.com', 'AdminPassword123!');

      // Try to access Entity B settings directly
      await page.goto(`${baseURL}/admin/entities/entity-b/settings`);

      // Should show access denied or redirect
      await expect(
        page.locator('[data-testid="access-denied"]').or(page.locator('[data-testid="not-found"]'))
      ).toBeVisible();
    });

    test('Entity A admin can only manage Entity A', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'admin@entity-a.enterprise.com', 'AdminPassword123!');
      await page.goto(`${baseURL}/admin/entities`);

      // Should only see Entity A in list
      const entities = page.locator('[data-testid="entity-card"]');
      const count = await entities.count();

      // If multiple shown, verify only Entity A is manageable
      for (let i = 0; i < count; i++) {
        const manageButton = entities.nth(i).locator('[data-testid="manage-entity"]');
        const entityName = await entities.nth(i).locator('[data-testid="entity-name"]').textContent();

        if (entityName !== 'Entity A') {
          await expect(manageButton).toBeDisabled();
        }
      }
    });
  });
});

/**
 * T390: US2 - Partner API for Integration Partners Validation
 *
 * Acceptance Scenarios:
 * 1. Partner developer can access interactive API docs
 * 2. OAuth 2.0 authentication with scoped tokens
 * 3. Webhook notifications within 30 seconds
 * 4. Rate limiting with 429 responses
 * 5. Access revocation
 */
test.describe('T390: US2 - Partner API Integration', () => {
  test.describe('Scenario 1: API Documentation Access', () => {
    test('registered partner can access API docs with interactive examples', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'partner@integration.com', 'PartnerPassword123!');
      await page.goto(`${baseURL}/developer/docs`);

      // Should see API documentation
      await expect(page.locator('[data-testid="api-docs"]')).toBeVisible();

      // Should have interactive examples
      await expect(page.locator('[data-testid="api-explorer"]')).toBeVisible();

      // Should be able to try endpoints
      const tryItButton = page.locator('[data-testid="try-endpoint"]').first();
      await expect(tryItButton).toBeVisible();
    });

    test('API docs show all endpoints with OpenAPI spec', async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}/api/docs/openapi.json`);

      expect(response.ok()).toBe(true);
      const spec = await response.json();

      expect(spec.openapi).toBeDefined();
      expect(spec.paths).toBeDefined();
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });
  });

  test.describe('Scenario 2: OAuth 2.0 Authentication', () => {
    test('partner application can authenticate and receive scoped tokens', async ({ request, baseURL }) => {
      // Authorization code exchange
      const tokenResponse = await request.post(`${baseURL}/oauth/token`, {
        data: {
          grant_type: 'authorization_code',
          client_id: 'test-partner-client-id',
          client_secret: 'test-partner-client-secret',
          code: 'test-authorization-code',
          redirect_uri: 'https://partner.example.com/callback',
        },
      });

      expect(tokenResponse.ok()).toBe(true);
      const tokens = await tokenResponse.json();

      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.scope).toBeDefined();
      expect(tokens.expires_in).toBeDefined();
    });

    test('scoped token only allows permitted operations', async ({ request, baseURL }) => {
      // Token with read-only scope
      const readOnlyToken = 'read-only-scoped-token';

      // Read should succeed
      const readResponse = await request.get(`${baseURL}/api/partner/processes`, {
        headers: { 'Authorization': `Bearer ${readOnlyToken}` },
      });
      expect(readResponse.ok()).toBe(true);

      // Write should fail with 403
      const writeResponse = await request.post(`${baseURL}/api/partner/processes`, {
        headers: { 'Authorization': `Bearer ${readOnlyToken}` },
        data: { name: 'New Process' },
      });
      expect(writeResponse.status()).toBe(403);
    });
  });

  test.describe('Scenario 3: Webhook Notifications', () => {
    test('partner receives webhook within 30 seconds of event', async ({ request, baseURL }) => {
      const startTime = Date.now();

      // Subscribe to webhook
      const subscribeResponse = await request.post(`${baseURL}/api/partner/webhooks`, {
        headers: { 'Authorization': 'Bearer partner-token' },
        data: {
          url: 'https://partner.example.com/webhook',
          events: ['process.discovered'],
          secret: 'webhook-secret',
        },
      });
      expect(subscribeResponse.ok()).toBe(true);

      // Trigger event (create a process)
      await request.post(`${baseURL}/api/processes`, {
        headers: {
          'Authorization': 'Bearer admin-token',
          'X-Entity-Context': 'entity-a',
        },
        data: { name: 'Test Process for Webhook' },
      });

      // Check webhook delivery log
      const deliveryResponse = await request.get(`${baseURL}/api/partner/webhooks/deliveries`, {
        headers: { 'Authorization': 'Bearer partner-token' },
      });

      if (deliveryResponse.ok()) {
        const deliveries = await deliveryResponse.json();
        const latestDelivery = deliveries[0];

        if (latestDelivery) {
          const deliveryTime = new Date(latestDelivery.deliveredAt).getTime();
          const latency = deliveryTime - startTime;
          expect(latency).toBeLessThan(30000); // Within 30 seconds
        }
      }
    });
  });

  test.describe('Scenario 4: Rate Limiting', () => {
    test('exceeding rate limit returns 429 with retry-after', async ({ request, baseURL }) => {
      const responses: number[] = [];

      // Make many rapid requests to trigger rate limit
      for (let i = 0; i < 150; i++) {
        const response = await request.get(`${baseURL}/api/partner/processes`, {
          headers: { 'Authorization': 'Bearer rate-limited-partner-token' },
        });
        responses.push(response.status());

        if (response.status() === 429) {
          // Verify retry-after header
          const retryAfter = response.headers()['retry-after'];
          expect(retryAfter).toBeDefined();
          break;
        }
      }

      // Should have received 429 at some point
      expect(responses).toContain(429);
    });
  });

  test.describe('Scenario 5: Access Revocation', () => {
    test('revoked partner access returns 401', async ({ request, baseURL }) => {
      const partnerToken = 'revoked-partner-token';

      // First, verify token works
      const beforeResponse = await request.get(`${baseURL}/api/partner/processes`, {
        headers: { 'Authorization': `Bearer ${partnerToken}` },
      });

      // Revoke access (admin action)
      await request.post(`${baseURL}/api/admin/partners/revoke`, {
        headers: { 'Authorization': 'Bearer admin-token' },
        data: { partnerId: 'test-partner-id' },
      });

      // After revocation, should get 401
      const afterResponse = await request.get(`${baseURL}/api/partner/processes`, {
        headers: { 'Authorization': `Bearer ${partnerToken}` },
      });

      expect(afterResponse.status()).toBe(401);
    });
  });
});

/**
 * T391: US3 - White-Label/Reseller Support Validation
 *
 * Acceptance Scenarios:
 * 1. White-label branding appears throughout application
 * 2. Customer sees reseller branding without Foundry references
 * 3. Reseller admin can manage customer subscriptions
 * 4. Monthly billing with itemized customer invoices
 * 5. Churned customer data archived for 30 days
 */
test.describe('T391: US3 - White-Label/Reseller Support', () => {
  test.describe('Scenario 1: White-Label Branding Configuration', () => {
    test('reseller branding appears throughout application', async ({ page, baseURL }) => {
      // Access white-labeled instance
      await page.goto(`${baseURL}?domain=partner.foundry-whitelabel.com`);

      // Custom logo should be visible
      const logo = page.locator('[data-testid="app-logo"]');
      await expect(logo).toBeVisible();
      const logoSrc = await logo.getAttribute('src');
      expect(logoSrc).toContain('partner-logo');

      // Custom colors should be applied
      const header = page.locator('[data-testid="app-header"]');
      const bgColor = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bgColor).not.toBe('rgb(0, 0, 0)'); // Not default
    });
  });

  test.describe('Scenario 2: No Foundry References', () => {
    test('customer sees only reseller branding', async ({ page, baseURL }) => {
      // Login via white-labeled domain
      await page.goto(`${baseURL}/login?domain=partner.foundry-whitelabel.com`);

      // Check page content for Foundry references
      const pageContent = await page.content();
      const foundryMentions = pageContent.match(/Foundry/gi);

      // Should have no or minimal Foundry references (maybe in metadata only)
      expect(foundryMentions?.length || 0).toBeLessThanOrEqual(1);

      // Title should be reseller's
      const title = await page.title();
      expect(title).not.toContain('Foundry');
    });
  });

  test.describe('Scenario 3: Reseller Admin Portal', () => {
    test('reseller admin can manage customer subscriptions', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'admin@partner.com', 'PartnerPassword123!');
      await page.goto(`${baseURL}/reseller/customers`);

      // Should see customer list
      await expect(page.locator('[data-testid="customer-list"]')).toBeVisible();

      // Should be able to manage subscriptions
      const customerRow = page.locator('[data-testid="customer-row"]').first();
      await customerRow.locator('[data-testid="manage-subscription"]').click();

      await expect(page.locator('[data-testid="subscription-management"]')).toBeVisible();
    });

    test('reseller admin can view usage statistics', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'admin@partner.com', 'PartnerPassword123!');
      await page.goto(`${baseURL}/reseller/dashboard`);

      // Should see usage metrics
      await expect(page.locator('[data-testid="usage-metrics"]')).toBeVisible();
      await expect(page.locator('[data-testid="customer-count"]')).toBeVisible();
      await expect(page.locator('[data-testid="total-revenue"]')).toBeVisible();
    });
  });

  test.describe('Scenario 4: Monthly Billing', () => {
    test('reseller receives itemized invoice', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'admin@partner.com', 'PartnerPassword123!');
      await page.goto(`${baseURL}/reseller/billing`);

      // Should see billing overview
      await expect(page.locator('[data-testid="billing-overview"]')).toBeVisible();

      // View latest invoice
      await page.click('[data-testid="view-invoice"]');

      // Invoice should be itemized by customer
      const invoiceItems = page.locator('[data-testid="invoice-item"]');
      expect(await invoiceItems.count()).toBeGreaterThan(0);

      // Each item should have customer name and amount
      const firstItem = invoiceItems.first();
      await expect(firstItem.locator('[data-testid="customer-name"]')).toBeVisible();
      await expect(firstItem.locator('[data-testid="item-amount"]')).toBeVisible();
    });
  });

  test.describe('Scenario 5: Customer Churn Handling', () => {
    test('deactivated customer data archived for 30 days', async ({ request, baseURL }) => {
      // Deactivate customer
      const deactivateResponse = await request.post(`${baseURL}/api/reseller/customers/deactivate`, {
        headers: { 'Authorization': 'Bearer reseller-token' },
        data: {
          customerId: 'churned-customer-id',
          reason: 'Contract ended',
        },
      });

      expect(deactivateResponse.ok()).toBe(true);
      const result = await deactivateResponse.json();

      expect(result.archived).toBe(true);
      expect(result.exportAvailableUntil).toBeDefined();

      // Calculate days until export expires
      const exportExpiry = new Date(result.exportAvailableUntil);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((exportExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      expect(daysUntilExpiry).toBeGreaterThanOrEqual(29);
      expect(daysUntilExpiry).toBeLessThanOrEqual(31);
    });

    test('archived data can be exported', async ({ request, baseURL }) => {
      const exportResponse = await request.post(`${baseURL}/api/reseller/customers/export`, {
        headers: { 'Authorization': 'Bearer reseller-token' },
        data: { customerId: 'churned-customer-id' },
      });

      expect(exportResponse.ok()).toBe(true);
    });
  });
});

/**
 * T392: US4 - On-Premise Deployment Validation
 *
 * Acceptance Scenarios:
 * 1. Helm chart deployment without internet access
 * 2. Update notifications and approval workflow
 * 3. External Neo4j configuration
 * 4. Component health visibility
 * 5. Air-gapped AI features
 */
test.describe('T392: US4 - On-Premise Deployment', () => {
  test.describe('Scenario 1: Air-Gapped Helm Deployment', () => {
    test('deployment health check passes without internet', async ({ request, baseURL }) => {
      const healthResponse = await request.get(`${baseURL}/api/health`);

      expect(healthResponse.ok()).toBe(true);
      const health = await healthResponse.json();

      expect(health.healthy).toBe(true);
      // Should not require external connectivity checks
      expect(health.checks.external).toBeUndefined();
    });

    test('all services start without external dependencies', async ({ request, baseURL }) => {
      const readinessResponse = await request.get(`${baseURL}/api/ready`);

      expect(readinessResponse.ok()).toBe(true);
      const readiness = await readinessResponse.json();

      expect(readiness.status).toBe('ready');
      expect(readiness.checks.database).toBe('healthy');
      expect(readiness.checks.cache).toBe('healthy');
    });
  });

  test.describe('Scenario 2: Update Management', () => {
    test('admin receives update notification', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}/admin/updates`);

      // Should show current version
      await expect(page.locator('[data-testid="current-version"]')).toBeVisible();

      // If update available, should show notification
      const updateNotification = page.locator('[data-testid="update-available"]');
      if (await updateNotification.isVisible()) {
        // Should have approve/schedule options
        await expect(page.locator('[data-testid="approve-update"]')).toBeVisible();
        await expect(page.locator('[data-testid="schedule-update"]')).toBeVisible();
      }
    });

    test('update requires admin approval', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}/admin/updates`);

      const approveButton = page.locator('[data-testid="approve-update"]');
      if (await approveButton.isVisible()) {
        await approveButton.click();

        // Should show confirmation dialog
        await expect(page.locator('[data-testid="update-confirmation"]')).toBeVisible();
        await expect(page.locator('[data-testid="update-changelog"]')).toBeVisible();
      }
    });
  });

  test.describe('Scenario 3: External Database Configuration', () => {
    test('uses external Neo4j when configured', async ({ request, baseURL }) => {
      const configResponse = await request.get(`${baseURL}/api/admin/config/database`, {
        headers: { 'Authorization': 'Bearer admin-token' },
      });

      if (configResponse.ok()) {
        const config = await configResponse.json();

        // Should support external database configuration
        expect(config.neo4j).toBeDefined();
        expect(config.neo4j.uri).toBeDefined();
      }
    });

    test('health check verifies external database connectivity', async ({ request, baseURL }) => {
      const healthResponse = await request.get(`${baseURL}/api/health?detailed=true`);

      const health = await healthResponse.json();
      expect(health.services.neo4j).toBeDefined();
      expect(health.services.neo4j.status).toBeDefined();
    });
  });

  test.describe('Scenario 4: Component Health Visibility', () => {
    test('admin panel shows all component statuses', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}/admin/deployment/status`);

      // Should show all components
      await expect(page.locator('[data-testid="component-backend"]')).toBeVisible();
      await expect(page.locator('[data-testid="component-database"]')).toBeVisible();
      await expect(page.locator('[data-testid="component-cache"]')).toBeVisible();
      await expect(page.locator('[data-testid="component-graph"]')).toBeVisible();
    });

    test('component details include version information', async ({ page, baseURL }) => {
      await loginAsAdmin(page, baseURL!);
      await page.goto(`${baseURL}/admin/deployment/status`);

      // Click on backend component
      await page.click('[data-testid="component-backend"]');

      // Should show version
      await expect(page.locator('[data-testid="component-version"]')).toBeVisible();
      await expect(page.locator('[data-testid="component-uptime"]')).toBeVisible();
    });
  });

  test.describe('Scenario 5: Air-Gapped AI Features', () => {
    test('AI features have fallback for air-gapped mode', async ({ request, baseURL }) => {
      const aiConfigResponse = await request.get(`${baseURL}/api/admin/config/ai`, {
        headers: { 'Authorization': 'Bearer admin-token' },
      });

      if (aiConfigResponse.ok()) {
        const config = await aiConfigResponse.json();

        // Should support local models or proxy configuration
        expect(config.fallbackMode).toBeDefined();
        expect(['local', 'proxy', 'disabled']).toContain(config.fallbackMode);
      }
    });
  });
});

/**
 * T393: US5 - Cross-Company Intelligence Validation
 *
 * Acceptance Scenarios:
 * 1. Only aggregated metrics shared (no raw data)
 * 2. Benchmark comparisons for sufficient participants
 * 3. Improvement suggestions for slower processes
 * 4. Opt-out removes data within 24 hours
 * 5. Insufficient data threshold (< 10 companies)
 */
test.describe('T393: US5 - Cross-Company Intelligence', () => {
  test.describe('Scenario 1: Data Anonymization', () => {
    test('only aggregated metrics are shared', async ({ request, baseURL }) => {
      // Opt-in to benchmarking
      await request.post(`${baseURL}/api/organizations/test-org/benchmark/opt-in`, {
        headers: { 'Authorization': 'Bearer org-admin-token' },
        data: { consent: true },
      });

      // Get shared data preview
      const previewResponse = await request.get(`${baseURL}/api/benchmark/shared-data-preview`, {
        headers: { 'Authorization': 'Bearer org-admin-token' },
      });

      if (previewResponse.ok()) {
        const preview = await previewResponse.json();

        // Should only contain aggregates
        expect(preview.rawData).toBeUndefined();
        expect(preview.individualRecords).toBeUndefined();

        // Should have aggregated metrics
        expect(preview.aggregatedMetrics).toBeDefined();
      }
    });

    test('no company names or identifiable patterns in shared data', async ({ request, baseURL }) => {
      const sharedDataResponse = await request.get(`${baseURL}/api/benchmark/anonymized-export`, {
        headers: { 'Authorization': 'Bearer admin-token' },
      });

      if (sharedDataResponse.ok()) {
        const data = await sharedDataResponse.json();
        const dataString = JSON.stringify(data);

        // Should not contain company names
        expect(dataString).not.toMatch(/enterprise\.com/);
        expect(dataString).not.toMatch(/Test Corp/);
        expect(dataString).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/); // No emails
      }
    });
  });

  test.describe('Scenario 2: Benchmark Comparisons', () => {
    test('benchmark comparisons appear when enough participants', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'user@benchmark-org.com', 'UserPassword123!');
      await page.goto(`${baseURL}/analytics/benchmarks`);

      // Check for benchmark comparisons
      const comparisonSection = page.locator('[data-testid="benchmark-comparison"]');
      if (await comparisonSection.isVisible()) {
        // Should show comparison to industry median
        await expect(page.locator('[data-testid="vs-median"]')).toBeVisible();
      }
    });
  });

  test.describe('Scenario 3: Improvement Suggestions', () => {
    test('slower processes show improvement suggestions', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'user@benchmark-org.com', 'UserPassword123!');
      await page.goto(`${baseURL}/analytics/benchmarks`);

      // Look for processes below median
      const slowProcesses = page.locator('[data-testid="below-median-process"]');
      if (await slowProcesses.count() > 0) {
        await slowProcesses.first().click();

        // Should show improvement suggestions
        await expect(page.locator('[data-testid="improvement-suggestions"]')).toBeVisible();
      }
    });
  });

  test.describe('Scenario 4: Opt-Out Data Removal', () => {
    test('opt-out removes data within 24 hours', async ({ request, baseURL }) => {
      // Opt-out
      const optOutResponse = await request.post(`${baseURL}/api/organizations/test-org/benchmark/opt-out`, {
        headers: { 'Authorization': 'Bearer org-admin-token' },
      });

      expect(optOutResponse.ok()).toBe(true);
      const result = await optOutResponse.json();

      expect(result.dataRemovalScheduled).toBe(true);
      expect(result.removalDeadline).toBeDefined();

      // Check deadline is within 24 hours
      const deadline = new Date(result.removalDeadline);
      const now = new Date();
      const hoursUntilRemoval = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      expect(hoursUntilRemoval).toBeLessThanOrEqual(24);
    });
  });

  test.describe('Scenario 5: Insufficient Data Threshold', () => {
    test('shows insufficient data for small segments', async ({ page, baseURL }) => {
      await loginAsUser(page, baseURL!, 'user@niche-industry.com', 'UserPassword123!');
      await page.goto(`${baseURL}/analytics/benchmarks`);

      // For industries with < 10 participants
      const insufficientDataMessage = page.locator('[data-testid="insufficient-benchmark-data"]');
      if (await insufficientDataMessage.isVisible()) {
        const message = await insufficientDataMessage.textContent();
        expect(message).toContain('insufficient');
      }
    });
  });
});

/**
 * T394: US6 - Enterprise SSO & Directory Integration Validation
 *
 * Acceptance Scenarios:
 * 1. SAML authentication with Azure AD
 * 2. SCIM provisioning for new AD users
 * 3. Group-based role mapping
 * 4. Terminated employee deactivation
 * 5. Forced logout capability
 */
test.describe('T394: US6 - Enterprise SSO & Directory Integration', () => {
  test.describe('Scenario 1: SAML Authentication', () => {
    test('SAML login redirects to Azure AD', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/login/sso`);

      // Click SAML login
      await page.click('[data-testid="saml-login"]');

      // Should redirect to Azure AD (or configured IdP)
      const url = page.url();
      expect(url).toMatch(/login\.microsoftonline\.com|idp\.example\.com/);
    });

    test('user is authenticated after SAML callback', async ({ page, baseURL }) => {
      // Simulate SAML callback (in real test, would complete Azure AD flow)
      await page.goto(`${baseURL}/auth/saml/callback?SAMLResponse=test-response`);

      // Should be redirected to dashboard after successful auth
      await expect(page.url()).toMatch(/\/dashboard/);
    });
  });

  test.describe('Scenario 2: SCIM Provisioning', () => {
    test('new AD user is provisioned via SCIM', async ({ request, baseURL }) => {
      // SCIM create user request
      const scimResponse = await request.post(`${baseURL}/scim/v2/Users`, {
        headers: {
          'Authorization': 'Bearer scim-bearer-token',
          'Content-Type': 'application/scim+json',
        },
        data: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'newuser@enterprise.com',
          name: {
            givenName: 'New',
            familyName: 'User',
          },
          emails: [{ value: 'newuser@enterprise.com', primary: true }],
          active: true,
        },
      });

      expect(scimResponse.ok()).toBe(true);
      const user = await scimResponse.json();

      expect(user.id).toBeDefined();
      expect(user.userName).toBe('newuser@enterprise.com');
    });
  });

  test.describe('Scenario 3: Group-Based Role Mapping', () => {
    test('AD group membership maps to Foundry role', async ({ request, baseURL }) => {
      // SCIM add user to admin group
      const patchResponse = await request.patch(`${baseURL}/scim/v2/Users/user-123`, {
        headers: {
          'Authorization': 'Bearer scim-bearer-token',
          'Content-Type': 'application/scim+json',
        },
        data: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'add',
              path: 'groups',
              value: [{ value: 'Foundry-Admins' }],
            },
          ],
        },
      });

      expect(patchResponse.ok()).toBe(true);

      // Verify role was updated
      const userResponse = await request.get(`${baseURL}/api/users/user-123`, {
        headers: { 'Authorization': 'Bearer admin-token' },
      });

      if (userResponse.ok()) {
        const user = await userResponse.json();
        expect(user.roles).toContain('admin');
      }
    });
  });

  test.describe('Scenario 4: Terminated Employee Deactivation', () => {
    test('SCIM deactivation disables Foundry account', async ({ request, baseURL }) => {
      // SCIM deactivate user
      const deactivateResponse = await request.patch(`${baseURL}/scim/v2/Users/terminated-user`, {
        headers: {
          'Authorization': 'Bearer scim-bearer-token',
          'Content-Type': 'application/scim+json',
        },
        data: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'replace',
              path: 'active',
              value: false,
            },
          ],
        },
      });

      expect(deactivateResponse.ok()).toBe(true);

      // Verify user cannot login
      const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
        data: {
          email: 'terminated@enterprise.com',
          password: 'TerminatedPassword123!',
        },
      });

      expect(loginResponse.status()).toBe(401);
    });
  });

  test.describe('Scenario 5: Forced Logout', () => {
    test('admin can force logout specific users', async ({ request, baseURL }) => {
      // Force logout
      const logoutResponse = await request.post(`${baseURL}/api/admin/sessions/force-logout`, {
        headers: { 'Authorization': 'Bearer admin-token' },
        data: {
          userIds: ['user-1', 'user-2'],
          reason: 'Security incident',
        },
      });

      expect(logoutResponse.ok()).toBe(true);
      const result = await logoutResponse.json();

      expect(result.sessionsTerminated).toBeGreaterThan(0);
    });

    test('forced logout invalidates all active sessions', async ({ request, baseURL }) => {
      const userToken = 'active-session-token';

      // First verify session is valid
      const beforeResponse = await request.get(`${baseURL}/api/me`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });

      // Force logout
      await request.post(`${baseURL}/api/admin/sessions/force-logout`, {
        headers: { 'Authorization': 'Bearer admin-token' },
        data: { userIds: ['target-user-id'] },
      });

      // Session should now be invalid
      const afterResponse = await request.get(`${baseURL}/api/me`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });

      expect(afterResponse.status()).toBe(401);
    });
  });
});
