/**
 * Entity RLS Performance Load Test
 * T358 - Test 50+ entities with RLS performance impact
 *
 * Tests Row-Level Security performance with multiple entities.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import {
  BASE_URL,
  getDefaultOptions,
  randomEntityId,
  randomUserId,
} from './k6-config.js';

// Custom metrics
const entityQueryDuration = new Trend('entity_query_duration');
const rlsFilterDuration = new Trend('rls_filter_duration');
const crossEntityDuration = new Trend('cross_entity_duration');
const queryFailures = new Rate('query_failures');
const entitiesProcessed = new Counter('entities_processed');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Single entity queries (baseline)
    single_entity: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      exec: 'singleEntityQueries',
      tags: { scenario: 'single_entity' },
    },
    // Scenario 2: Multi-entity with RLS
    multi_entity_rls: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      exec: 'multiEntityRlsQueries',
      tags: { scenario: 'multi_entity_rls' },
    },
    // Scenario 3: Cross-entity analytics
    cross_entity: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 RPS
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      exec: 'crossEntityAnalytics',
      tags: { scenario: 'cross_entity' },
    },
  },
  thresholds: {
    'entity_query_duration': ['p(95)<100'], // 95th percentile under 100ms
    'rls_filter_duration': ['p(95)<150'], // RLS filtering under 150ms
    'cross_entity_duration': ['p(95)<500'], // Cross-entity under 500ms
    'query_failures': ['rate<0.01'], // Less than 1% failures
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = getDefaultOptions().headers;

// Setup: Create test entities if needed
export function setup() {
  const entities = [];
  for (let i = 1; i <= 50; i++) {
    entities.push({
      id: `entity-${i}`,
      name: `Test Entity ${i}`,
    });
  }
  return { entities };
}

// Scenario 1: Single entity queries
export function singleEntityQueries() {
  const entityId = randomEntityId(50);

  group('Single Entity Operations', () => {
    // Get entity by ID
    const startGetEntity = Date.now();
    const entityRes = http.get(
      `${BASE_URL}/api/entities/${entityId}`,
      { headers, tags: { name: 'get_entity' } }
    );
    entityQueryDuration.add(Date.now() - startGetEntity);

    check(entityRes, {
      'entity returned': (r) => r.status === 200,
      'entity has id': (r) => r.json('id') !== undefined,
    }) || queryFailures.add(1);

    // List entity processes (RLS filtered)
    const startListProcesses = Date.now();
    const processesRes = http.get(
      `${BASE_URL}/api/entities/${entityId}/processes?page=1&pageSize=20`,
      { headers, tags: { name: 'list_processes' } }
    );
    rlsFilterDuration.add(Date.now() - startListProcesses);

    check(processesRes, {
      'processes returned': (r) => r.status === 200,
      'processes array exists': (r) => Array.isArray(r.json('data')),
    }) || queryFailures.add(1);

    // Get entity configuration
    const configRes = http.get(
      `${BASE_URL}/api/entities/${entityId}/config`,
      { headers, tags: { name: 'get_config' } }
    );

    check(configRes, {
      'config returned': (r) => r.status === 200,
    });

    entitiesProcessed.add(1);
  });

  sleep(0.5);
}

// Scenario 2: Multi-entity RLS queries
export function multiEntityRlsQueries() {
  // Simulate user with access to multiple entities
  const userEntityCount = Math.floor(Math.random() * 10) + 1; // 1-10 entities
  const userEntities = [];
  for (let i = 0; i < userEntityCount; i++) {
    userEntities.push(randomEntityId(50));
  }

  group('Multi-Entity RLS Operations', () => {
    // List all accessible entities
    const startListEntities = Date.now();
    const entitiesRes = http.get(
      `${BASE_URL}/api/entities?status=ACTIVE&pageSize=50`,
      { headers, tags: { name: 'list_entities' } }
    );
    const listDuration = Date.now() - startListEntities;

    entityQueryDuration.add(listDuration);

    check(entitiesRes, {
      'entities list returned': (r) => r.status === 200,
      'response time acceptable': () => listDuration < 150,
    }) || queryFailures.add(1);

    // Query each entity's data (tests RLS context switching)
    for (const entityId of userEntities.slice(0, 3)) { // Limit to 3 per iteration
      const startQuery = Date.now();
      const dataRes = http.get(
        `${BASE_URL}/api/entities/${entityId}/dashboard/summary`,
        { headers, tags: { name: 'entity_dashboard' } }
      );
      rlsFilterDuration.add(Date.now() - startQuery);

      check(dataRes, {
        'dashboard returned': (r) => r.status === 200,
      });

      entitiesProcessed.add(1);
    }
  });

  sleep(1);
}

// Scenario 3: Cross-entity analytics
export function crossEntityAnalytics() {
  // Select random subset of entities for analytics
  const analyticsEntityCount = Math.floor(Math.random() * 20) + 5; // 5-25 entities
  const entityIds = [];
  for (let i = 0; i < analyticsEntityCount; i++) {
    entityIds.push(randomEntityId(50));
  }

  group('Cross-Entity Analytics', () => {
    // Cross-entity aggregation
    const startAggregation = Date.now();
    const aggregationRes = http.post(
      `${BASE_URL}/api/analytics/cross-entity`,
      JSON.stringify({
        entityIds: entityIds,
        metrics: ['processCount', 'userCount', 'dataSourceCount'],
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      }),
      { headers, tags: { name: 'cross_entity_aggregation' } }
    );
    const aggregationDuration = Date.now() - startAggregation;

    crossEntityDuration.add(aggregationDuration);

    check(aggregationRes, {
      'aggregation returned': (r) => r.status === 200,
      'aggregation time acceptable': () => aggregationDuration < 1000,
    }) || queryFailures.add(1);

    // Cross-entity comparison
    const startComparison = Date.now();
    const comparisonRes = http.post(
      `${BASE_URL}/api/analytics/compare`,
      JSON.stringify({
        entityIds: entityIds.slice(0, 5),
        metric: 'processEfficiency',
      }),
      { headers, tags: { name: 'entity_comparison' } }
    );
    crossEntityDuration.add(Date.now() - startComparison);

    check(comparisonRes, {
      'comparison returned': (r) => r.status === 200,
    });

    entitiesProcessed.add(entityIds.length);
  });

  sleep(2);
}

// Teardown
export function teardown(data) {
  console.log(`Total entities processed: ${entitiesProcessed}`);
}

export default function() {
  // Default function runs all scenarios
  singleEntityQueries();
}
