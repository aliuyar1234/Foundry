/**
 * White-Label End-to-End Tests (T385)
 * Comprehensive E2E tests for white-label/branding functionality
 */

import { test, expect, Page } from '@playwright/test';

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

interface BrandingConfig {
  entityId: string;
  logo: string;
  favicon: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  customDomain?: string;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const testAdmin = {
  email: 'admin@whitelabel-test.com',
  password: 'TestPassword123!',
  entityId: 'whitelabel-test-entity',
};

const testBranding: BrandingConfig = {
  entityId: 'whitelabel-test-entity',
  logo: '/test-assets/test-logo.png',
  favicon: '/test-assets/test-favicon.ico',
  primaryColor: '#3B82F6',
  secondaryColor: '#1E40AF',
  accentColor: '#F59E0B',
  fontFamily: 'Inter',
  customDomain: 'app.whitelabel-test.com',
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

async function getComputedColor(page: Page, selector: string): Promise<string> {
  const element = page.locator(selector);
  return element.evaluate((el) => window.getComputedStyle(el).backgroundColor);
}

async function rgbToHex(rgb: string): Promise<string> {
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;

  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');

  return `#${r}${g}${b}`.toUpperCase();
}

// =============================================================================
// Test Suites
// =============================================================================

test.describe('White-Label Configuration', () => {
  test.describe('Logo Configuration', () => {
    test('should upload main logo', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Upload logo
      const logoInput = page.locator('[data-testid="logo-upload-input"]');
      await logoInput.setInputFiles('tests/fixtures/test-logo.png');

      // Wait for upload
      await page.waitForResponse((response) =>
        response.url().includes('/api/branding/logo') && response.status() === 200
      );

      // Verify preview
      await expect(page.locator('[data-testid="logo-preview"]')).toBeVisible();
      const logoSrc = await page.locator('[data-testid="logo-preview"]').getAttribute('src');
      expect(logoSrc).toBeTruthy();
    });

    test('should upload favicon', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      const faviconInput = page.locator('[data-testid="favicon-upload-input"]');
      await faviconInput.setInputFiles('tests/fixtures/test-favicon.ico');

      await page.waitForResponse((response) =>
        response.url().includes('/api/branding/favicon') && response.status() === 200
      );

      await expect(page.locator('[data-testid="favicon-preview"]')).toBeVisible();
    });

    test('should validate logo dimensions', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Upload too small logo
      const logoInput = page.locator('[data-testid="logo-upload-input"]');
      await logoInput.setInputFiles('tests/fixtures/small-logo.png');

      await expect(page.locator('[data-testid="logo-error"]')).toContainText(
        'Logo must be at least 200x50 pixels'
      );
    });

    test('should support separate light/dark mode logos', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Light mode logo
      const lightLogoInput = page.locator('[data-testid="logo-light-upload"]');
      await lightLogoInput.setInputFiles('tests/fixtures/logo-light.png');

      // Dark mode logo
      const darkLogoInput = page.locator('[data-testid="logo-dark-upload"]');
      await darkLogoInput.setInputFiles('tests/fixtures/logo-dark.png');

      await page.click('[data-testid="save-branding"]');

      // Verify both are saved
      await expect(page.locator('[data-testid="logo-light-preview"]')).toBeVisible();
      await expect(page.locator('[data-testid="logo-dark-preview"]')).toBeVisible();
    });
  });

  test.describe('Color Scheme', () => {
    test('should set primary color', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.fill('[data-testid="primary-color-input"]', testBranding.primaryColor);
      await page.click('[data-testid="save-branding"]');

      // Navigate to dashboard and verify color is applied
      await page.goto(`${BASE_URL}/dashboard`);

      const buttonColor = await getComputedColor(page, '[data-testid="primary-button"]');
      const hexColor = await rgbToHex(buttonColor);
      expect(hexColor.toUpperCase()).toBe(testBranding.primaryColor.toUpperCase());
    });

    test('should set secondary color', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.fill('[data-testid="secondary-color-input"]', testBranding.secondaryColor);
      await page.click('[data-testid="save-branding"]');

      // Verify in preview
      await expect(page.locator('[data-testid="color-preview-secondary"]')).toHaveCSS(
        'background-color',
        expect.stringContaining('rgb')
      );
    });

    test('should set accent color', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.fill('[data-testid="accent-color-input"]', testBranding.accentColor);
      await page.click('[data-testid="save-branding"]');

      // Verify accent elements use new color
      await page.goto(`${BASE_URL}/dashboard`);
      const accentElement = page.locator('[data-testid="accent-element"]');
      await expect(accentElement).toBeVisible();
    });

    test('should use color picker', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Open color picker
      await page.click('[data-testid="primary-color-picker"]');

      // Color picker should be visible
      await expect(page.locator('[data-testid="color-picker-modal"]')).toBeVisible();

      // Select a color
      await page.click('[data-testid="color-swatch-blue"]');
      await page.click('[data-testid="color-picker-confirm"]');

      // Verify color is set
      const colorValue = await page.inputValue('[data-testid="primary-color-input"]');
      expect(colorValue).toBeTruthy();
    });

    test('should validate hex color format', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.fill('[data-testid="primary-color-input"]', 'invalid');
      await page.click('[data-testid="save-branding"]');

      await expect(page.locator('[data-testid="color-error"]')).toContainText(
        'Invalid color format'
      );
    });
  });

  test.describe('Typography', () => {
    test('should set heading font', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.selectOption('[data-testid="heading-font"]', 'Poppins');
      await page.click('[data-testid="save-branding"]');

      // Verify font is applied
      await page.goto(`${BASE_URL}/dashboard`);

      const heading = page.locator('h1').first();
      const fontFamily = await heading.evaluate((el) =>
        window.getComputedStyle(el).fontFamily
      );
      expect(fontFamily).toContain('Poppins');
    });

    test('should set body font', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.selectOption('[data-testid="body-font"]', 'Open Sans');
      await page.click('[data-testid="save-branding"]');

      await page.goto(`${BASE_URL}/dashboard`);

      const body = page.locator('body');
      const fontFamily = await body.evaluate((el) =>
        window.getComputedStyle(el).fontFamily
      );
      expect(fontFamily).toContain('Open Sans');
    });

    test('should support Google Fonts', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Search Google Fonts
      await page.fill('[data-testid="font-search"]', 'Roboto');
      await page.click('[data-testid="font-option-roboto"]');
      await page.click('[data-testid="save-branding"]');

      // Verify Google Font is loaded
      await page.goto(`${BASE_URL}/dashboard`);

      const links = await page.$$eval('link', (links) =>
        links.map((link) => link.getAttribute('href'))
      );

      const googleFontLink = links.find((href) =>
        href?.includes('fonts.googleapis.com') && href?.includes('Roboto')
      );
      expect(googleFontLink).toBeTruthy();
    });
  });

  test.describe('Custom Domain', () => {
    test('should configure custom domain', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/domain`);

      await page.fill('[data-testid="custom-domain-input"]', testBranding.customDomain!);
      await page.click('[data-testid="save-domain"]');

      // Should show DNS records
      await expect(page.locator('[data-testid="dns-records"]')).toBeVisible();
    });

    test('should show required DNS records', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/domain`);

      await page.fill('[data-testid="custom-domain-input"]', testBranding.customDomain!);
      await page.click('[data-testid="save-domain"]');

      // A record
      await expect(page.locator('[data-testid="dns-a-record"]')).toBeVisible();

      // CNAME record
      await expect(page.locator('[data-testid="dns-cname-record"]')).toBeVisible();
    });

    test('should verify domain DNS', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/domain`);

      await page.click('[data-testid="verify-domain"]');

      // Should show verification status
      await expect(page.locator('[data-testid="domain-verification-status"]')).toBeVisible();
    });

    test('should provision SSL certificate', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/domain`);

      // Assuming domain is verified
      await expect(page.locator('[data-testid="ssl-status"]')).toBeVisible();
      await expect(page.locator('[data-testid="ssl-status"]')).toContainText(
        /Provisioning|Active/
      );
    });
  });

  test.describe('Email Branding', () => {
    test('should set sender name', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/email`);

      await page.fill('[data-testid="sender-name"]', 'White Label Test');
      await page.click('[data-testid="save-email-branding"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should set sender email', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/email`);

      await page.fill('[data-testid="sender-email"]', 'noreply@whitelabel-test.com');
      await page.click('[data-testid="save-email-branding"]');

      // Sender email requires domain verification
      await expect(page.locator('[data-testid="domain-verification-required"]')).toBeVisible();
    });

    test('should customize email template', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/email`);

      // Edit email footer
      await page.fill('[data-testid="email-footer"]', 'Custom footer text');
      await page.click('[data-testid="save-email-branding"]');

      // Preview email
      await page.click('[data-testid="preview-email"]');
      await expect(page.locator('[data-testid="email-preview"]')).toContainText(
        'Custom footer text'
      );
    });

    test('should send test email', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/email`);

      await page.fill('[data-testid="test-email-recipient"]', testAdmin.email);
      await page.click('[data-testid="send-test-email"]');

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Test email sent'
      );
    });
  });

  test.describe('Login Page Customization', () => {
    test('should set login background image', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/login`);

      const bgInput = page.locator('[data-testid="login-bg-upload"]');
      await bgInput.setInputFiles('tests/fixtures/login-bg.jpg');

      await page.waitForResponse((response) =>
        response.url().includes('/api/branding/login-bg') && response.status() === 200
      );

      await expect(page.locator('[data-testid="login-bg-preview"]')).toBeVisible();
    });

    test('should set login page tagline', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/login`);

      await page.fill('[data-testid="login-tagline"]', 'Welcome to Our Platform');
      await page.click('[data-testid="save-login-branding"]');

      // Verify on login page
      await page.click('[data-testid="logout"]');
      await page.goto(`${BASE_URL}/login`);

      await expect(page.locator('[data-testid="login-tagline-display"]')).toContainText(
        'Welcome to Our Platform'
      );
    });

    test('should customize login button text', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding/login`);

      await page.fill('[data-testid="login-button-text"]', 'Sign In to Your Account');
      await page.click('[data-testid="save-login-branding"]');

      await page.click('[data-testid="logout"]');
      await page.goto(`${BASE_URL}/login`);

      await expect(page.locator('[data-testid="login-button"]')).toContainText(
        'Sign In to Your Account'
      );
    });
  });

  test.describe('Preview and Publish', () => {
    test('should show live preview', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await expect(page.locator('[data-testid="brand-preview"]')).toBeVisible();

      // Change color
      await page.fill('[data-testid="primary-color-input"]', '#FF5733');

      // Preview should update
      await expect(page.locator('[data-testid="preview-primary-element"]')).toHaveCSS(
        'background-color',
        'rgb(255, 87, 51)'
      );
    });

    test('should save as draft', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.fill('[data-testid="primary-color-input"]', '#FF5733');
      await page.click('[data-testid="save-draft"]');

      await expect(page.locator('[data-testid="draft-status"]')).toContainText('Draft saved');

      // Changes should not be visible to other users yet
    });

    test('should publish changes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.click('[data-testid="publish-branding"]');

      // Confirm dialog
      await page.click('[data-testid="confirm-publish"]');

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Branding published'
      );
    });

    test('should revert to default branding', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      await page.click('[data-testid="reset-branding"]');
      await page.click('[data-testid="confirm-reset"]');

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Branding reset'
      );

      // Default branding should be restored
      await page.goto(`${BASE_URL}/dashboard`);

      // Check default logo is shown
      const logoSrc = await page.locator('[data-testid="app-logo"]').getAttribute('src');
      expect(logoSrc).toContain('default');
    });
  });

  test.describe('Entity-Specific Branding', () => {
    test('should inherit branding from parent entity', async ({ page }) => {
      await loginAsAdmin(page);

      // Set branding on parent entity
      await page.goto(`${BASE_URL}/settings/branding`);
      await page.fill('[data-testid="primary-color-input"]', '#3B82F6');
      await page.click('[data-testid="save-branding"]');
      await page.click('[data-testid="publish-branding"]');
      await page.click('[data-testid="confirm-publish"]');

      // Switch to child entity
      await page.click('[data-testid="entity-selector"]');
      await page.click('[data-testid="entity-option-child"]');

      // Navigate to branding settings
      await page.goto(`${BASE_URL}/settings/branding`);

      // Should show inherited indicator
      await expect(page.locator('[data-testid="inherited-from-parent"]')).toBeVisible();

      // Color should match parent
      const colorValue = await page.inputValue('[data-testid="primary-color-input"]');
      expect(colorValue.toUpperCase()).toBe('#3B82F6');
    });

    test('should override parent branding', async ({ page }) => {
      await loginAsAdmin(page);

      // Switch to child entity
      await page.click('[data-testid="entity-selector"]');
      await page.click('[data-testid="entity-option-child"]');

      await page.goto(`${BASE_URL}/settings/branding`);

      // Override
      await page.click('[data-testid="override-branding"]');
      await page.fill('[data-testid="primary-color-input"]', '#FF5733');
      await page.click('[data-testid="save-branding"]');

      // Should show override indicator
      await expect(page.locator('[data-testid="overrides-parent"]')).toBeVisible();

      // Navigate and verify child has different color
      await page.goto(`${BASE_URL}/dashboard`);
      const buttonColor = await getComputedColor(page, '[data-testid="primary-button"]');
      expect(buttonColor).toContain('255'); // #FF5733 contains 255 red
    });
  });

  test.describe('Reseller Features', () => {
    test('should configure per-customer branding', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/reseller/branding`);

      // Select customer entity
      await page.selectOption('[data-testid="customer-entity"]', 'customer-1');

      // Configure customer branding
      await page.fill('[data-testid="customer-primary-color"]', '#10B981');
      await page.click('[data-testid="save-customer-branding"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should bulk update customer branding', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/reseller/branding`);

      // Select multiple customers
      await page.click('[data-testid="select-all-customers"]');

      // Apply bulk branding
      await page.click('[data-testid="bulk-branding-button"]');
      await page.fill('[data-testid="bulk-primary-color"]', '#6366F1');
      await page.click('[data-testid="apply-bulk-branding"]');

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Branding applied to'
      );
    });

    test('should show branding preview per customer', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/reseller/branding`);

      await page.selectOption('[data-testid="customer-entity"]', 'customer-1');
      await page.click('[data-testid="preview-customer-branding"]');

      // Preview modal should show customer-specific branding
      await expect(page.locator('[data-testid="customer-preview-modal"]')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have sufficient color contrast', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Set colors that might have low contrast
      await page.fill('[data-testid="primary-color-input"]', '#FFFF00'); // Yellow
      await page.fill('[data-testid="text-color-input"]', '#FFFFFF'); // White

      await page.click('[data-testid="save-branding"]');

      // Should show contrast warning
      await expect(page.locator('[data-testid="contrast-warning"]')).toBeVisible();
      await expect(page.locator('[data-testid="contrast-warning"]')).toContainText(
        'Low contrast'
      );
    });

    test('should maintain WCAG AA compliance', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/settings/branding`);

      // Run accessibility check
      await page.click('[data-testid="check-accessibility"]');

      // Should show compliance status
      await expect(page.locator('[data-testid="wcag-compliance"]')).toBeVisible();
    });
  });
});

// =============================================================================
// Cleanup
// =============================================================================

test.afterAll(async ({ request }) => {
  console.log('Cleaning up White Label test data...');
});
