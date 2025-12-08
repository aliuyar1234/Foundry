/**
 * SSO End-to-End Tests (T387)
 * Comprehensive E2E tests for Single Sign-On functionality
 */

import { test, expect, Page } from '@playwright/test';

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

// Mock IdP URLs for testing (would be real IdP in production)
const MOCK_SAML_IDP = process.env.MOCK_SAML_IDP || 'http://localhost:8080/saml';
const MOCK_OIDC_IDP = process.env.MOCK_OIDC_IDP || 'http://localhost:8080/oidc';

interface SSOConfig {
  entityId: string;
  provider: 'saml' | 'oidc' | 'azure' | 'okta' | 'google';
  config: Record<string, string>;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const testAdmin = {
  email: 'admin@sso-test.com',
  password: 'TestPassword123!',
  entityId: 'sso-test-entity',
};

const samlConfig: SSOConfig = {
  entityId: 'sso-test-entity',
  provider: 'saml',
  config: {
    idpEntityId: 'https://idp.example.com/metadata',
    ssoUrl: `${MOCK_SAML_IDP}/sso`,
    certificate: `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDU+pQ0=
-----END CERTIFICATE-----`,
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  },
};

const oidcConfig: SSOConfig = {
  entityId: 'sso-test-entity',
  provider: 'oidc',
  config: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    discoveryUrl: `${MOCK_OIDC_IDP}/.well-known/openid-configuration`,
    scopes: 'openid profile email',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('[data-testid="email-input"]', testAdmin.email);
  await page.fill('[data-testid="password-input"]', testAdmin.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${BASE_URL}/dashboard`);
}

async function configureSAML(page: Page, config: SSOConfig): Promise<void> {
  await page.goto(`${BASE_URL}/settings/sso`);
  await page.click('[data-testid="provider-saml"]');

  await page.fill('[data-testid="idp-entity-id"]', config.config.idpEntityId);
  await page.fill('[data-testid="sso-url"]', config.config.ssoUrl);
  await page.fill('[data-testid="certificate"]', config.config.certificate);
  await page.selectOption('[data-testid="name-id-format"]', config.config.nameIdFormat);

  await page.click('[data-testid="save-sso-config"]');
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
}

async function configureOIDC(page: Page, config: SSOConfig): Promise<void> {
  await page.goto(`${BASE_URL}/settings/sso`);
  await page.click('[data-testid="provider-oidc"]');

  await page.fill('[data-testid="client-id"]', config.config.clientId);
  await page.fill('[data-testid="client-secret"]', config.config.clientSecret);
  await page.fill('[data-testid="discovery-url"]', config.config.discoveryUrl);
  await page.fill('[data-testid="scopes"]', config.config.scopes);

  await page.click('[data-testid="save-sso-config"]');
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
}

// =============================================================================
// Test Suites
// =============================================================================

test.describe('SSO Configuration', () => {
  test.describe('SAML Configuration', () => {
    test('should configure SAML provider', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);

      // Select SAML provider
      await page.click('[data-testid="provider-saml"]');
      await expect(page.locator('[data-testid="saml-config-form"]')).toBeVisible();

      // Fill configuration
      await page.fill('[data-testid="idp-entity-id"]', samlConfig.config.idpEntityId);
      await page.fill('[data-testid="sso-url"]', samlConfig.config.ssoUrl);
      await page.fill('[data-testid="certificate"]', samlConfig.config.certificate);

      // Save
      await page.click('[data-testid="save-sso-config"]');
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should validate SAML certificate format', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);
      await page.click('[data-testid="provider-saml"]');

      await page.fill('[data-testid="certificate"]', 'invalid-certificate');
      await page.click('[data-testid="save-sso-config"]');

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'Invalid certificate format'
      );
    });

    test('should show SAML metadata URL', async ({ page }) => {
      await loginAsAdmin(page);
      await configureSAML(page, samlConfig);

      await expect(page.locator('[data-testid="sp-metadata-url"]')).toBeVisible();
      const metadataUrl = await page.locator('[data-testid="sp-metadata-url"]').textContent();
      expect(metadataUrl).toContain('/saml/metadata');
    });

    test('should download SP metadata XML', async ({ page }) => {
      await loginAsAdmin(page);
      await configureSAML(page, samlConfig);

      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="download-sp-metadata"]');
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/sp-metadata.*\.xml/);
    });
  });

  test.describe('OIDC Configuration', () => {
    test('should configure OIDC provider', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);

      await page.click('[data-testid="provider-oidc"]');
      await expect(page.locator('[data-testid="oidc-config-form"]')).toBeVisible();

      await page.fill('[data-testid="client-id"]', oidcConfig.config.clientId);
      await page.fill('[data-testid="client-secret"]', oidcConfig.config.clientSecret);
      await page.fill('[data-testid="discovery-url"]', oidcConfig.config.discoveryUrl);

      await page.click('[data-testid="save-sso-config"]');
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should auto-discover OIDC endpoints', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);
      await page.click('[data-testid="provider-oidc"]');

      await page.fill('[data-testid="discovery-url"]', oidcConfig.config.discoveryUrl);
      await page.click('[data-testid="discover-endpoints"]');

      // Should auto-fill endpoints
      await expect(page.locator('[data-testid="authorization-endpoint"]')).not.toBeEmpty();
      await expect(page.locator('[data-testid="token-endpoint"]')).not.toBeEmpty();
      await expect(page.locator('[data-testid="userinfo-endpoint"]')).not.toBeEmpty();
    });

    test('should validate OIDC discovery URL', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);
      await page.click('[data-testid="provider-oidc"]');

      await page.fill('[data-testid="discovery-url"]', 'https://invalid.example.com/no-oidc');
      await page.click('[data-testid="discover-endpoints"]');

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'Failed to discover OIDC endpoints'
      );
    });

    test('should show callback URL for OIDC', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);
      await page.click('[data-testid="provider-oidc"]');

      await expect(page.locator('[data-testid="callback-url"]')).toBeVisible();
      const callbackUrl = await page.locator('[data-testid="callback-url"]').textContent();
      expect(callbackUrl).toContain('/auth/oidc/callback');
    });
  });

  test.describe('Attribute Mapping', () => {
    test('should configure attribute mapping', async ({ page }) => {
      await loginAsAdmin(page);
      await configureSAML(page, samlConfig);

      await page.goto(`${BASE_URL}/settings/sso/attribute-mapping`);

      await page.fill('[data-testid="attr-email"]', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress');
      await page.fill('[data-testid="attr-firstname"]', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname');
      await page.fill('[data-testid="attr-lastname"]', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname');

      await page.click('[data-testid="save-mapping"]');
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should map roles from IdP attributes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/attribute-mapping`);

      // Configure role mapping
      await page.click('[data-testid="add-role-mapping"]');
      await page.fill('[data-testid="idp-role-value"]', 'admin');
      await page.selectOption('[data-testid="app-role"]', 'admin');

      await page.click('[data-testid="add-role-mapping"]');
      await page.fill('[data-testid="idp-role-value-1"]', 'user');
      await page.selectOption('[data-testid="app-role-1"]', 'user');

      await page.click('[data-testid="save-mapping"]');
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should set default role for unmapped users', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/attribute-mapping`);

      await page.selectOption('[data-testid="default-role"]', 'viewer');
      await page.click('[data-testid="save-mapping"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });
  });

  test.describe('Domain Verification', () => {
    test('should add email domain for verification', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/domains`);

      await page.fill('[data-testid="domain-input"]', 'sso-test.com');
      await page.click('[data-testid="add-domain"]');

      await expect(page.locator('[data-testid="domain-sso-test.com"]')).toBeVisible();
      await expect(page.locator('[data-testid="domain-status-sso-test.com"]')).toContainText('Pending');
    });

    test('should display DNS verification record', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/domains`);

      // Assuming domain already added
      await page.click('[data-testid="verify-domain-sso-test.com"]');

      await expect(page.locator('[data-testid="dns-record-type"]')).toContainText('TXT');
      await expect(page.locator('[data-testid="dns-record-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="dns-record-value"]')).toBeVisible();
    });

    test('should verify domain after DNS record added', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/domains`);

      await page.click('[data-testid="check-verification-sso-test.com"]');

      // Wait for verification check
      await page.waitForResponse((response) =>
        response.url().includes('/api/sso/domains/verify') && response.status() === 200
      );

      // In mock environment, this should succeed
      await expect(page.locator('[data-testid="domain-status-sso-test.com"]')).toContainText(
        'Verified'
      );
    });

    test('should prevent duplicate domain verification', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/domains`);

      await page.fill('[data-testid="domain-input"]', 'sso-test.com'); // Already added
      await page.click('[data-testid="add-domain"]');

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'Domain already exists'
      );
    });
  });

  test.describe('SSO Testing', () => {
    test('should test SSO connection', async ({ page }) => {
      await loginAsAdmin(page);
      await configureSAML(page, samlConfig);

      await page.click('[data-testid="test-sso-connection"]');

      // Should open IdP login in new tab/popup or redirect
      const popup = await page.waitForEvent('popup');
      await expect(popup).toHaveURL(new RegExp(MOCK_SAML_IDP));

      // Simulate successful login at IdP
      await popup.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await popup.fill('[data-testid="idp-password"]', 'idppassword');
      await popup.click('[data-testid="idp-login"]');

      // Should redirect back and show success
      await page.waitForLoadState();
      await expect(page.locator('[data-testid="sso-test-result"]')).toContainText('Success');
    });

    test('should show detailed test results', async ({ page }) => {
      await loginAsAdmin(page);
      await configureSAML(page, samlConfig);

      // Run test
      await page.click('[data-testid="test-sso-connection"]');

      // Handle IdP authentication
      const popup = await page.waitForEvent('popup');
      await popup.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await popup.fill('[data-testid="idp-password"]', 'idppassword');
      await popup.click('[data-testid="idp-login"]');

      await page.waitForLoadState();

      // Check detailed results
      await expect(page.locator('[data-testid="test-result-email"]')).toBeVisible();
      await expect(page.locator('[data-testid="test-result-attributes"]')).toBeVisible();
      await expect(page.locator('[data-testid="test-result-roles"]')).toBeVisible();
    });
  });

  test.describe('SSO Login Flow', () => {
    test('should redirect to IdP for SSO login', async ({ page }) => {
      // Navigate to login with SSO
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');

      // Should redirect to IdP
      await expect(page).toHaveURL(new RegExp(MOCK_SAML_IDP));
    });

    test('should complete SSO login and create session', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');

      // Complete IdP login
      await page.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'idppassword');
      await page.click('[data-testid="idp-login"]');

      // Should redirect back to app and be logged in
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Verify session created
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === 'session');
      expect(sessionCookie).toBeTruthy();
    });

    test('should auto-provision user on first SSO login', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');

      // Login with new user
      await page.fill('[data-testid="idp-username"]', 'newuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'idppassword');
      await page.click('[data-testid="idp-login"]');

      // Should be logged in
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // User profile should show IdP-provided info
      await page.goto(`${BASE_URL}/profile`);
      await expect(page.locator('[data-testid="user-email"]')).toContainText('newuser@sso-test.com');
    });

    test('should handle SSO login failure gracefully', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');

      // Fail IdP login
      await page.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'wrongpassword');
      await page.click('[data-testid="idp-login"]');

      // Should show error
      await expect(page.locator('[data-testid="idp-error"]')).toBeVisible();
    });

    test('should enforce SSO-only login when configured', async ({ page }) => {
      // Admin enables SSO-only
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);
      await page.check('[data-testid="enforce-sso"]');
      await page.click('[data-testid="save-sso-config"]');

      // Logout
      await page.click('[data-testid="logout"]');

      // Try password login
      await page.goto(`${BASE_URL}/login`);

      // Password form should be hidden or disabled
      await expect(page.locator('[data-testid="password-input"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="sso-login-button"]')).toBeVisible();
    });
  });

  test.describe('SSO Session Management', () => {
    test('should logout from both app and IdP', async ({ page }) => {
      // Login via SSO
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');
      await page.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'idppassword');
      await page.click('[data-testid="idp-login"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Logout
      await page.click('[data-testid="logout"]');

      // Should be redirected to IdP SLO endpoint
      await expect(page).toHaveURL(new RegExp(`${MOCK_SAML_IDP}/logout|${BASE_URL}/login`));
    });

    test('should handle IdP-initiated logout', async ({ page, context }) => {
      // Login via SSO
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');
      await page.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'idppassword');
      await page.click('[data-testid="idp-login"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Simulate IdP-initiated logout (POST to SLO endpoint)
      const sloPage = await context.newPage();
      await sloPage.goto(`${MOCK_SAML_IDP}/initiate-logout?user=testuser@sso-test.com`);

      // Original page should be logged out
      await page.reload();
      await expect(page).toHaveURL(`${BASE_URL}/login`);
    });

    test('should refresh SSO session before expiry', async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');
      await page.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'idppassword');
      await page.click('[data-testid="idp-login"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Wait for session refresh (would be shorter in test environment)
      await page.waitForTimeout(5000);

      // Make an API call to trigger refresh
      await page.goto(`${BASE_URL}/data-sources`);

      // Session should still be valid
      await expect(page).not.toHaveURL(`${BASE_URL}/login`);
    });
  });

  test.describe('SCIM Provisioning', () => {
    test('should configure SCIM endpoint', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/scim`);

      await expect(page.locator('[data-testid="scim-endpoint"]')).toBeVisible();
      await expect(page.locator('[data-testid="scim-token"]')).toBeVisible();
    });

    test('should generate SCIM bearer token', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso/scim`);

      await page.click('[data-testid="generate-scim-token"]');

      await expect(page.locator('[data-testid="scim-token-value"]')).toBeVisible();
      const token = await page.locator('[data-testid="scim-token-value"]').textContent();
      expect(token!.length).toBeGreaterThan(30);
    });

    test('should provision user via SCIM', async ({ request }) => {
      // Get SCIM token (would normally be from UI)
      const scimToken = 'test-scim-token';

      const newUser = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'scim.user@sso-test.com',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [
          { value: 'scim.user@sso-test.com', primary: true },
        ],
        active: true,
      };

      const response = await request.post(`${API_URL}/scim/v2/Users`, {
        headers: {
          Authorization: `Bearer ${scimToken}`,
          'Content-Type': 'application/scim+json',
        },
        data: newUser,
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.userName).toBe(newUser.userName);
    });

    test('should sync user updates via SCIM', async ({ request }) => {
      const scimToken = 'test-scim-token';

      const updateUser = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        name: {
          givenName: 'Updated',
          familyName: 'Name',
        },
      };

      const response = await request.patch(`${API_URL}/scim/v2/Users/existing-user-id`, {
        headers: {
          Authorization: `Bearer ${scimToken}`,
          'Content-Type': 'application/scim+json',
        },
        data: updateUser,
      });

      expect(response.status()).toBe(200);
    });

    test('should deactivate user via SCIM', async ({ request }) => {
      const scimToken = 'test-scim-token';

      const deactivateUser = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        active: false,
      };

      const response = await request.patch(`${API_URL}/scim/v2/Users/existing-user-id`, {
        headers: {
          Authorization: `Bearer ${scimToken}`,
          'Content-Type': 'application/scim+json',
        },
        data: deactivateUser,
      });

      expect(response.status()).toBe(200);

      // User should no longer be able to login
      // (Would test this with actual login attempt)
    });
  });

  test.describe('SSO Audit Logging', () => {
    test('should log SSO login attempts', async ({ page }) => {
      // Perform SSO login
      await page.goto(`${BASE_URL}/login`);
      await page.click('[data-testid="sso-login-button"]');
      await page.fill('[data-testid="idp-username"]', 'testuser@sso-test.com');
      await page.fill('[data-testid="idp-password"]', 'idppassword');
      await page.click('[data-testid="idp-login"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Check audit log
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/audit`);
      await page.fill('[data-testid="filter-action"]', 'sso_login');

      const auditEntry = page.locator('[data-testid="audit-entry"]').first();
      await expect(auditEntry).toContainText('SSO Login');
      await expect(auditEntry).toContainText('testuser@sso-test.com');
    });

    test('should log SSO configuration changes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/sso`);

      // Make a configuration change
      await page.check('[data-testid="enforce-sso"]');
      await page.click('[data-testid="save-sso-config"]');

      // Check audit log
      await page.goto(`${BASE_URL}/settings/audit`);
      await page.fill('[data-testid="filter-action"]', 'sso_config');

      const auditEntry = page.locator('[data-testid="audit-entry"]').first();
      await expect(auditEntry).toContainText('SSO Configuration');
      await expect(auditEntry).toContainText('enforce_sso');
    });
  });
});

// =============================================================================
// Cleanup
// =============================================================================

test.afterAll(async ({ request }) => {
  console.log('Cleaning up SSO test data...');
});
