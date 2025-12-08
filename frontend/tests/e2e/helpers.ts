/**
 * E2E Test Helpers
 * Common utilities for E2E testing with Playwright
 */

import { Page, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

/**
 * Login helper
 */
export async function login(
  page: Page,
  email: string = process.env.TEST_USER_EMAIL || 'admin@test.com',
  password: string = process.env.TEST_USER_PASSWORD || 'TestPassword123!'
): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10000 });
}

/**
 * Wait for element to be visible
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  method: string = 'GET',
  timeout: number = 10000
): Promise<void> {
  await page.waitForResponse(
    (response) => {
      const matchesUrl =
        typeof urlPattern === 'string'
          ? response.url().includes(urlPattern)
          : urlPattern.test(response.url());
      const matchesMethod = response.request().method() === method;
      return matchesUrl && matchesMethod;
    },
    { timeout }
  );
}

/**
 * Fill form with data
 */
export async function fillForm(
  page: Page,
  formData: Record<string, string>
): Promise<void> {
  for (const [field, value] of Object.entries(formData)) {
    await page.fill(`[data-testid="${field}"]`, value);
  }
}

/**
 * Click and wait for navigation
 */
export async function clickAndNavigate(
  page: Page,
  selector: string,
  expectedUrl?: string
): Promise<void> {
  await page.click(selector);
  if (expectedUrl) {
    await page.waitForURL(expectedUrl, { timeout: 5000 });
  } else {
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Check if element exists
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get text content of element
 */
export async function getTextContent(page: Page, selector: string): Promise<string> {
  const element = page.locator(selector);
  return (await element.textContent()) || '';
}

/**
 * Take screenshot on failure
 */
export async function screenshotOnFailure(
  page: Page,
  testName: string
): Promise<void> {
  const screenshotPath = `./test-results/screenshots/${testName}-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved: ${screenshotPath}`);
}

/**
 * Wait for specific time
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry action until success or timeout
 */
export async function retry<T>(
  action: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, timeout = 30000 } = options;
  const startTime = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Retry timeout after ${timeout}ms`);
    }

    try {
      return await action();
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      await wait(delayMs);
    }
  }

  throw new Error('Retry failed');
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  responseData: unknown,
  status: number = 200
): Promise<void> {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(responseData),
    });
  });
}

/**
 * Clear all mocked routes
 */
export async function clearApiMocks(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}

/**
 * Assert element has text
 */
export async function assertElementText(
  page: Page,
  selector: string,
  expectedText: string | RegExp
): Promise<void> {
  const element = page.locator(selector);
  if (typeof expectedText === 'string') {
    await expect(element).toHaveText(expectedText);
  } else {
    const text = await element.textContent();
    expect(text).toMatch(expectedText);
  }
}

/**
 * Assert element is visible
 */
export async function assertVisible(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeVisible();
}

/**
 * Assert element is hidden
 */
export async function assertHidden(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).not.toBeVisible();
}

/**
 * Get element count
 */
export async function getElementCount(page: Page, selector: string): Promise<number> {
  return await page.locator(selector).count();
}

/**
 * Select option from dropdown
 */
export async function selectDropdownOption(
  page: Page,
  dropdownSelector: string,
  optionValue: string
): Promise<void> {
  await page.selectOption(dropdownSelector, optionValue);
}

/**
 * Upload file
 */
export async function uploadFile(
  page: Page,
  fileInputSelector: string,
  filePath: string
): Promise<void> {
  await page.setInputFiles(fileInputSelector, filePath);
}

/**
 * Get local storage item
 */
export async function getLocalStorageItem(
  page: Page,
  key: string
): Promise<string | null> {
  return await page.evaluate((key) => localStorage.getItem(key), key);
}

/**
 * Set local storage item
 */
export async function setLocalStorageItem(
  page: Page,
  key: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key, value }
  );
}

/**
 * Clear local storage
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

/**
 * Get session storage item
 */
export async function getSessionStorageItem(
  page: Page,
  key: string
): Promise<string | null> {
  return await page.evaluate((key) => sessionStorage.getItem(key), key);
}

/**
 * Set session storage item
 */
export async function setSessionStorageItem(
  page: Page,
  key: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => sessionStorage.setItem(key, value),
    { key, value }
  );
}

/**
 * Get cookies
 */
export async function getCookies(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  return cookies.reduce(
    (acc, cookie) => {
      acc[cookie.name] = cookie.value;
      return acc;
    },
    {} as Record<string, string>
  );
}

/**
 * Set cookie
 */
export async function setCookie(
  page: Page,
  name: string,
  value: string,
  options?: { domain?: string; path?: string; expires?: number }
): Promise<void> {
  await page.context().addCookies([
    {
      name,
      value,
      domain: options?.domain || 'localhost',
      path: options?.path || '/',
      expires: options?.expires,
    },
  ]);
}

/**
 * Clear cookies
 */
export async function clearCookies(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/**
 * Hover over element
 */
export async function hover(page: Page, selector: string): Promise<void> {
  await page.hover(selector);
}

/**
 * Double click element
 */
export async function doubleClick(page: Page, selector: string): Promise<void> {
  await page.dblclick(selector);
}

/**
 * Right click element
 */
export async function rightClick(page: Page, selector: string): Promise<void> {
  await page.click(selector, { button: 'right' });
}

/**
 * Press keyboard key
 */
export async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

/**
 * Type text with delay
 */
export async function typeText(
  page: Page,
  selector: string,
  text: string,
  delayMs: number = 50
): Promise<void> {
  await page.type(selector, text, { delay: delayMs });
}

/**
 * Scroll to element
 */
export async function scrollToElement(page: Page, selector: string): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Get element attribute
 */
export async function getAttribute(
  page: Page,
  selector: string,
  attribute: string
): Promise<string | null> {
  return await page.locator(selector).getAttribute(attribute);
}

/**
 * Check checkbox
 */
export async function checkCheckbox(page: Page, selector: string): Promise<void> {
  await page.check(selector);
}

/**
 * Uncheck checkbox
 */
export async function uncheckCheckbox(page: Page, selector: string): Promise<void> {
  await page.uncheck(selector);
}

/**
 * Assert URL contains
 */
export async function assertUrlContains(page: Page, text: string): Promise<void> {
  expect(page.url()).toContain(text);
}

/**
 * Assert URL matches
 */
export async function assertUrlMatches(
  page: Page,
  pattern: RegExp
): Promise<void> {
  expect(page.url()).toMatch(pattern);
}

/**
 * Navigate back
 */
export async function goBack(page: Page): Promise<void> {
  await page.goBack();
}

/**
 * Navigate forward
 */
export async function goForward(page: Page): Promise<void> {
  await page.goForward();
}

/**
 * Reload page
 */
export async function reload(page: Page): Promise<void> {
  await page.reload();
}

/**
 * Get current URL
 */
export function getCurrentUrl(page: Page): string {
  return page.url();
}

/**
 * Execute custom JavaScript
 */
export async function executeScript<T>(
  page: Page,
  script: string | ((...args: unknown[]) => T),
  ...args: unknown[]
): Promise<T> {
  if (typeof script === 'string') {
    return await page.evaluate(script);
  }
  return await page.evaluate(script, ...args);
}

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/**
 * Get network requests
 */
export function captureNetworkRequests(page: Page): {
  requests: string[];
  clear: () => void;
} {
  const requests: string[] = [];

  page.on('request', (request) => {
    requests.push(request.url());
  });

  return {
    requests,
    clear: () => (requests.length = 0),
  };
}

/**
 * Get console logs
 */
export function captureConsoleLogs(page: Page): {
  logs: Array<{ type: string; text: string }>;
  clear: () => void;
} {
  const logs: Array<{ type: string; text: string }> = [];

  page.on('console', (message) => {
    logs.push({
      type: message.type(),
      text: message.text(),
    });
  });

  return {
    logs,
    clear: () => (logs.length = 0),
  };
}

export { BASE_URL, API_URL };
