/**
 * SSO Authentication Load Test
 * T360 - Test concurrent SSO authentications
 *
 * Tests SSO authentication flows under concurrent load.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL } from './k6-config.js';

// Custom metrics
const authLatency = new Trend('auth_latency');
const tokenExchangeLatency = new Trend('token_exchange_latency');
const sessionCreationLatency = new Trend('session_creation_latency');
const authSuccessRate = new Rate('auth_success_rate');
const tokenValidationRate = new Rate('token_validation_rate');
const concurrentSessions = new Counter('concurrent_sessions');

// Test users (simulated)
const TEST_USERS_COUNT = 100;

export const options = {
  scenarios: {
    // Scenario 1: Normal authentication flow
    normal_auth: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      exec: 'normalAuthFlow',
      tags: { scenario: 'normal' },
    },
    // Scenario 2: Peak login time (many concurrent logins)
    peak_login: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 logins per second
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 100,
      exec: 'peakLoginFlow',
      tags: { scenario: 'peak' },
      startTime: '7m30s',
    },
    // Scenario 3: Token refresh under load
    token_refresh: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
      exec: 'tokenRefreshFlow',
      tags: { scenario: 'refresh' },
      startTime: '11m',
    },
    // Scenario 4: Concurrent session management
    session_management: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 40 },
        { duration: '1m', target: 0 },
      ],
      exec: 'sessionManagement',
      tags: { scenario: 'sessions' },
      startTime: '16m30s',
    },
  },
  thresholds: {
    'auth_latency': ['p(95)<500'], // 95% of auth under 500ms
    'token_exchange_latency': ['p(95)<300'],
    'session_creation_latency': ['p(95)<200'],
    'auth_success_rate': ['rate>0.99'], // 99%+ success rate
    'token_validation_rate': ['rate>0.999'], // 99.9%+ token validity
    http_req_failed: ['rate<0.01'],
  },
};

const defaultHeaders = {
  'Content-Type': 'application/json',
};

function getRandomUser() {
  const userId = Math.floor(Math.random() * TEST_USERS_COUNT) + 1;
  return {
    id: `user-${userId}`,
    email: `testuser${userId}@example.com`,
    entityId: `entity-${Math.floor(userId / 10) + 1}`,
  };
}

// Simulate SAML assertion (in real test, would use actual IdP)
function createMockSamlAssertion(user) {
  return Buffer.from(JSON.stringify({
    nameId: user.email,
    attributes: {
      email: user.email,
      firstName: 'Test',
      lastName: `User${user.id.split('-')[1]}`,
      groups: ['Users', 'Employees'],
    },
    issuer: 'https://idp.example.com',
    timestamp: new Date().toISOString(),
  })).toString('base64');
}

// Simulate OIDC token (in real test, would use actual IdP)
function createMockOidcToken(user) {
  return {
    access_token: `mock-access-token-${user.id}-${Date.now()}`,
    id_token: `mock-id-token-${user.id}-${Date.now()}`,
    refresh_token: `mock-refresh-token-${user.id}-${Date.now()}`,
    token_type: 'Bearer',
    expires_in: 3600,
  };
}

// Normal authentication flow
export function normalAuthFlow() {
  const user = getRandomUser();

  group('Normal SSO Auth Flow', () => {
    // Step 1: Initialize SAML authentication
    const startAuth = Date.now();
    const initRes = http.get(
      `${BASE_URL}/api/sso/saml/init?entityId=${user.entityId}`,
      { headers: defaultHeaders, tags: { name: 'saml_init' } }
    );

    check(initRes, {
      'SAML init successful': (r) => r.status === 200 || r.status === 302,
    });

    // Step 2: Simulate IdP response (SAML assertion)
    const samlAssertion = createMockSamlAssertion(user);
    const acsRes = http.post(
      `${BASE_URL}/api/sso/saml/acs`,
      `SAMLResponse=${encodeURIComponent(samlAssertion)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        tags: { name: 'saml_acs' },
      }
    );

    const authDuration = Date.now() - startAuth;
    authLatency.add(authDuration);

    const authSuccess = acsRes.status === 200 || acsRes.status === 302;
    authSuccessRate.add(authSuccess ? 1 : 0);

    check(acsRes, {
      'SAML ACS successful': (r) => authSuccess,
      'session created': (r) => {
        const cookies = r.headers['Set-Cookie'];
        return cookies && cookies.includes('session');
      },
    });

    if (authSuccess) {
      concurrentSessions.add(1);
    }

    // Step 3: Access protected resource
    const session = acsRes.cookies['session'];
    if (session) {
      const profileRes = http.get(
        `${BASE_URL}/api/users/me`,
        {
          headers: {
            ...defaultHeaders,
            'Cookie': `session=${session[0].value}`,
          },
          tags: { name: 'get_profile' },
        }
      );

      check(profileRes, {
        'profile accessible': (r) => r.status === 200,
        'correct user': (r) => r.json('email') === user.email,
      });
    }
  });

  sleep(Math.random() * 2 + 1); // 1-3 second think time
}

// Peak login simulation
export function peakLoginFlow() {
  const user = getRandomUser();

  group('Peak Login Flow', () => {
    // Simulate OIDC flow (faster than SAML)
    const startAuth = Date.now();

    // Step 1: Authorization request
    const authRes = http.get(
      `${BASE_URL}/api/sso/oidc/authorize?entity_id=${user.entityId}&response_type=code&client_id=load-test`,
      { headers: defaultHeaders, tags: { name: 'oidc_authorize' }, redirects: 0 }
    );

    check(authRes, {
      'auth redirect': (r) => r.status === 302,
    });

    // Step 2: Token exchange (simulating callback with code)
    const mockTokens = createMockOidcToken(user);
    const startTokenExchange = Date.now();
    const tokenRes = http.post(
      `${BASE_URL}/api/sso/oidc/callback`,
      JSON.stringify({
        code: `mock-auth-code-${Date.now()}`,
        state: 'load-test-state',
        mockTokens: mockTokens, // For load testing only
      }),
      { headers: defaultHeaders, tags: { name: 'oidc_callback' } }
    );
    tokenExchangeLatency.add(Date.now() - startTokenExchange);

    const authDuration = Date.now() - startAuth;
    authLatency.add(authDuration);

    const success = tokenRes.status === 200;
    authSuccessRate.add(success ? 1 : 0);

    check(tokenRes, {
      'token exchange successful': (r) => success,
      'tokens returned': (r) => {
        if (success) {
          const body = r.json();
          return body && body.access_token;
        }
        return true;
      },
    });

    if (success) {
      concurrentSessions.add(1);
    }
  });

  sleep(0.1); // Minimal delay during peak
}

// Token refresh flow
export function tokenRefreshFlow() {
  const user = getRandomUser();

  group('Token Refresh Flow', () => {
    // Simulate existing session with expiring token
    const mockRefreshToken = `mock-refresh-${user.id}-${Date.now()}`;

    const startRefresh = Date.now();
    const refreshRes = http.post(
      `${BASE_URL}/api/sso/token/refresh`,
      JSON.stringify({
        refresh_token: mockRefreshToken,
        grant_type: 'refresh_token',
      }),
      { headers: defaultHeaders, tags: { name: 'token_refresh' } }
    );

    const refreshDuration = Date.now() - startRefresh;
    tokenExchangeLatency.add(refreshDuration);

    const success = refreshRes.status === 200;
    tokenValidationRate.add(success ? 1 : 0);

    check(refreshRes, {
      'refresh successful': (r) => success,
      'new tokens returned': (r) => {
        if (success) {
          const body = r.json();
          return body && body.access_token && body.refresh_token;
        }
        return true;
      },
      'refresh fast enough': () => refreshDuration < 500,
    });
  });

  sleep(1);
}

// Session management
export function sessionManagement() {
  const user = getRandomUser();
  const sessionId = `session-${user.id}-${Date.now()}`;

  group('Session Management', () => {
    // Create session
    const startCreate = Date.now();
    const createRes = http.post(
      `${BASE_URL}/api/sso/sessions`,
      JSON.stringify({
        userId: user.id,
        entityId: user.entityId,
        mockSession: true, // For load testing
      }),
      { headers: defaultHeaders, tags: { name: 'create_session' } }
    );
    sessionCreationLatency.add(Date.now() - startCreate);

    const createSuccess = createRes.status === 200 || createRes.status === 201;
    check(createRes, {
      'session created': (r) => createSuccess,
    });

    if (createSuccess) {
      concurrentSessions.add(1);

      // Validate session
      const validateRes = http.get(
        `${BASE_URL}/api/sso/sessions/validate`,
        {
          headers: {
            ...defaultHeaders,
            'Authorization': `Bearer ${createRes.json('session_token') || 'mock-token'}`,
          },
          tags: { name: 'validate_session' },
        }
      );

      check(validateRes, {
        'session valid': (r) => r.status === 200,
      });

      // List active sessions
      const listRes = http.get(
        `${BASE_URL}/api/sso/sessions?userId=${user.id}`,
        { headers: defaultHeaders, tags: { name: 'list_sessions' } }
      );

      check(listRes, {
        'sessions listed': (r) => r.status === 200,
      });

      // Terminate session
      const terminateRes = http.delete(
        `${BASE_URL}/api/sso/sessions/${createRes.json('id') || sessionId}`,
        { headers: defaultHeaders, tags: { name: 'terminate_session' } }
      );

      check(terminateRes, {
        'session terminated': (r) => r.status === 200 || r.status === 204,
      });
    }
  });

  sleep(2);
}

// Summary handler
export function handleSummary(data) {
  const summary = {
    'Total Auth Attempts': data.metrics.http_reqs?.values?.count || 0,
    'Auth Success Rate (%)': (data.metrics.auth_success_rate?.values?.rate || 0) * 100,
    'p95 Auth Latency (ms)': data.metrics.auth_latency?.values?.['p(95)'] || 0,
    'p95 Token Exchange (ms)': data.metrics.token_exchange_latency?.values?.['p(95)'] || 0,
    'Token Validation Rate (%)': (data.metrics.token_validation_rate?.values?.rate || 0) * 100,
    'Concurrent Sessions': data.metrics.concurrent_sessions?.values?.count || 0,
  };

  console.log('\n=== SSO Authentication Load Test Summary ===');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
  }

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'sso-summary.json': JSON.stringify(data, null, 2),
  };
}

export default function() {
  normalAuthFlow();
}
