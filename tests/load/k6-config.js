/**
 * k6 Load Test Configuration
 * T357 - Create load test scenarios with k6
 *
 * Shared configuration for all k6 load test scenarios.
 */

// Base URL for the API
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Authentication
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
export const API_KEY = __ENV.API_KEY || '';

// Test parameters
export const VIRTUAL_USERS = parseInt(__ENV.VIRTUAL_USERS || '10');
export const DURATION = __ENV.DURATION || '5m';
export const RAMP_UP_TIME = __ENV.RAMP_UP_TIME || '1m';

// Thresholds
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ['p(95)<100'], // 95% of requests should be under 100ms
  http_req_failed: ['rate<0.01'], // Less than 1% failure rate
  http_reqs: ['rate>100'], // At least 100 RPS
};

// Default request options
export function getDefaultOptions() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  return { headers };
}

// Standard load profile
export function getStandardLoadProfile() {
  return {
    stages: [
      { duration: RAMP_UP_TIME, target: VIRTUAL_USERS }, // Ramp up
      { duration: DURATION, target: VIRTUAL_USERS }, // Stay at target
      { duration: '30s', target: 0 }, // Ramp down
    ],
    thresholds: DEFAULT_THRESHOLDS,
  };
}

// Stress test profile
export function getStressTestProfile() {
  return {
    stages: [
      { duration: '2m', target: VIRTUAL_USERS },
      { duration: '5m', target: VIRTUAL_USERS * 2 },
      { duration: '2m', target: VIRTUAL_USERS * 3 },
      { duration: '5m', target: VIRTUAL_USERS * 3 },
      { duration: '2m', target: VIRTUAL_USERS * 4 },
      { duration: '5m', target: VIRTUAL_USERS * 4 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<500'], // Allow higher latency under stress
      http_req_failed: ['rate<0.05'], // Allow up to 5% failure under stress
    },
  };
}

// Spike test profile
export function getSpikeTestProfile() {
  return {
    stages: [
      { duration: '1m', target: VIRTUAL_USERS },
      { duration: '10s', target: VIRTUAL_USERS * 10 }, // Spike
      { duration: '1m', target: VIRTUAL_USERS * 10 },
      { duration: '10s', target: VIRTUAL_USERS }, // Back to normal
      { duration: '2m', target: VIRTUAL_USERS },
      { duration: '10s', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<1000'], // Allow up to 1s under spike
      http_req_failed: ['rate<0.1'], // Allow up to 10% failure during spike
    },
  };
}

// Soak test profile (long duration)
export function getSoakTestProfile() {
  return {
    stages: [
      { duration: '5m', target: VIRTUAL_USERS },
      { duration: '4h', target: VIRTUAL_USERS }, // Long duration
      { duration: '5m', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(99)<200'], // Stricter for soak test
      http_req_failed: ['rate<0.001'], // Very low failure rate
    },
  };
}

// Helper to generate random entity IDs
export function randomEntityId(entityCount = 50) {
  return `entity-${Math.floor(Math.random() * entityCount) + 1}`;
}

// Helper to generate random user IDs
export function randomUserId(userCount = 100) {
  return `user-${Math.floor(Math.random() * userCount) + 1}`;
}

// Helper to check response
export function checkResponse(response, checks = {}) {
  const defaultChecks = {
    'status is 200': (r) => r.status === 200,
    'response time < 100ms': (r) => r.timings.duration < 100,
  };

  return { ...defaultChecks, ...checks };
}

export default {
  BASE_URL,
  AUTH_TOKEN,
  API_KEY,
  VIRTUAL_USERS,
  DURATION,
  getDefaultOptions,
  getStandardLoadProfile,
  getStressTestProfile,
  getSpikeTestProfile,
  getSoakTestProfile,
  randomEntityId,
  randomUserId,
  checkResponse,
};
