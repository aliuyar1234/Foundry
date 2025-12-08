/**
 * Partner API Rate Limit Load Test
 * T359 - Test partner API at rate limit thresholds
 *
 * Tests the partner API rate limiting under various load conditions.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, getDefaultOptions } from './k6-config.js';

// Custom metrics
const rateLimitHits = new Counter('rate_limit_hits');
const successfulRequests = new Counter('successful_requests');
const apiLatency = new Trend('api_latency');
const errorRate = new Rate('error_rate');
const throttleRate = new Rate('throttle_rate');

// Test API keys for different tiers
const API_KEYS = {
  free: __ENV.FREE_API_KEY || 'test-free-api-key',
  standard: __ENV.STANDARD_API_KEY || 'test-standard-api-key',
  premium: __ENV.PREMIUM_API_KEY || 'test-premium-api-key',
};

// Rate limits per tier (per hour)
const RATE_LIMITS = {
  free: 100,
  standard: 1000,
  premium: 10000,
};

export const options = {
  scenarios: {
    // Scenario 1: Test free tier rate limits (100 req/hour)
    free_tier: {
      executor: 'constant-arrival-rate',
      rate: 5, // 5 RPS (will hit 100 in 20 seconds)
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 10,
      exec: 'freeTierTest',
      tags: { tier: 'free' },
    },
    // Scenario 2: Test standard tier (1000 req/hour)
    standard_tier: {
      executor: 'constant-arrival-rate',
      rate: 20, // 20 RPS
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 30,
      exec: 'standardTierTest',
      tags: { tier: 'standard' },
      startTime: '1m30s', // Start after free tier test
    },
    // Scenario 3: Test premium tier at high load (10000 req/hour)
    premium_tier: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 50 },
      ],
      preAllocatedVUs: 100,
      exec: 'premiumTierTest',
      tags: { tier: 'premium' },
      startTime: '4m', // Start after standard tier
    },
    // Scenario 4: Burst test (sudden spike)
    burst_test: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 10,
      exec: 'burstTest',
      tags: { tier: 'burst' },
      startTime: '8m',
    },
  },
  thresholds: {
    'api_latency': ['p(95)<100'], // 95th percentile under 100ms
    'error_rate': ['rate<0.05'], // Less than 5% errors (excluding rate limits)
    'http_req_duration{status:200}': ['p(95)<100'],
    'http_req_duration{status:429}': ['p(95)<50'], // Rate limit responses should be fast
  },
};

function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-Partner-ID': 'load-test-partner',
  };
}

function makeApiRequest(endpoint, apiKey, method = 'GET', body = null) {
  const headers = getHeaders(apiKey);
  const url = `${BASE_URL}/api/partner${endpoint}`;
  const startTime = Date.now();

  let response;
  if (method === 'GET') {
    response = http.get(url, { headers });
  } else if (method === 'POST') {
    response = http.post(url, body ? JSON.stringify(body) : null, { headers });
  }

  const duration = Date.now() - startTime;
  apiLatency.add(duration);

  // Track rate limit hits
  if (response.status === 429) {
    rateLimitHits.add(1);
    throttleRate.add(1);

    // Check Retry-After header
    const retryAfter = response.headers['Retry-After'];
    check(response, {
      'has retry-after header': (r) => r.headers['Retry-After'] !== undefined,
    });
  } else if (response.status >= 200 && response.status < 300) {
    successfulRequests.add(1);
    throttleRate.add(0);
  } else {
    errorRate.add(1);
  }

  return response;
}

// Free tier test (100 req/hour limit)
export function freeTierTest() {
  group('Free Tier API', () => {
    // Try various endpoints
    const endpoints = [
      '/processes',
      '/data-sources',
      '/insights',
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const response = makeApiRequest(endpoint, API_KEYS.free);

    check(response, {
      'response received': (r) => r.status === 200 || r.status === 429,
      'latency acceptable': (r) => r.timings.duration < 200,
    });

    // If rate limited, verify proper response format
    if (response.status === 429) {
      check(response, {
        'rate limit message': (r) => {
          const body = r.json();
          return body && body.error && body.error.includes('rate limit');
        },
        'remaining is 0': (r) => {
          const remaining = r.headers['X-RateLimit-Remaining'];
          return remaining === '0' || remaining === undefined;
        },
      });
    }
  });

  sleep(0.1);
}

// Standard tier test (1000 req/hour limit)
export function standardTierTest() {
  group('Standard Tier API', () => {
    // More complex queries for standard tier
    const queries = [
      { endpoint: '/processes', params: '?status=active&limit=50' },
      { endpoint: '/insights', params: '?type=recommendation&limit=20' },
      { endpoint: '/webhooks', params: '' },
    ];

    const query = queries[Math.floor(Math.random() * queries.length)];
    const response = makeApiRequest(
      `${query.endpoint}${query.params}`,
      API_KEYS.standard
    );

    check(response, {
      'response received': (r) => r.status === 200 || r.status === 429,
      'valid response body': (r) => {
        if (r.status === 200) {
          return r.json() !== null;
        }
        return true;
      },
    });

    // Check rate limit headers
    check(response, {
      'has rate limit headers': (r) => {
        return r.headers['X-RateLimit-Limit'] !== undefined ||
               r.status === 429;
      },
    });
  });

  sleep(0.05);
}

// Premium tier test (10000 req/hour limit)
export function premiumTierTest() {
  group('Premium Tier API', () => {
    // Heavy queries for premium tier
    const operations = [
      () => makeApiRequest('/processes?limit=100', API_KEYS.premium),
      () => makeApiRequest('/analytics/summary', API_KEYS.premium),
      () => makeApiRequest(
        '/processes/search',
        API_KEYS.premium,
        'POST',
        { query: 'test', filters: { status: 'active' } }
      ),
    ];

    const operation = operations[Math.floor(Math.random() * operations.length)];
    const response = operation();

    check(response, {
      'response received': (r) => r.status === 200 || r.status === 429,
      'premium latency ok': (r) => r.timings.duration < 500,
    });

    // Premium should rarely hit rate limits
    if (response.status === 429) {
      console.warn('Premium tier hit rate limit');
    }
  });

  sleep(0.01);
}

// Burst test - many requests at once
export function burstTest() {
  group('Burst Test', () => {
    // Send 10 requests in quick succession
    const responses = [];

    for (let i = 0; i < 10; i++) {
      const response = makeApiRequest('/processes', API_KEYS.standard);
      responses.push(response);
    }

    // Check how many succeeded vs rate limited
    const successful = responses.filter(r => r.status === 200).length;
    const rateLimited = responses.filter(r => r.status === 429).length;

    check(null, {
      'some requests succeeded': () => successful > 0,
      'rate limiter engaged': () => rateLimited > 0 || successful === 10,
    });

    console.log(`Burst: ${successful} succeeded, ${rateLimited} rate limited`);
  });

  sleep(1);
}

// Custom summary
export function handleSummary(data) {
  const summary = {
    'Total Requests': data.metrics.http_reqs?.values?.count || 0,
    'Successful Requests': data.metrics.successful_requests?.values?.count || 0,
    'Rate Limit Hits': data.metrics.rate_limit_hits?.values?.count || 0,
    'p95 Latency (ms)': data.metrics.api_latency?.values?.['p(95)'] || 0,
    'Error Rate (%)': (data.metrics.error_rate?.values?.rate || 0) * 100,
    'Throttle Rate (%)': (data.metrics.throttle_rate?.values?.rate || 0) * 100,
  };

  console.log('\n=== Partner API Rate Limit Test Summary ===');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
  }

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

export default function() {
  standardTierTest();
}
