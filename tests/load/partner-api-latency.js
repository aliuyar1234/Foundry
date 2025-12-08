/**
 * Partner API Latency Verification
 * T362 - Verify p95 latency < 100ms for partner API reads
 *
 * Tests partner API read endpoints to verify they meet the 100ms p95 latency target.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, getDefaultOptions } from './k6-config.js';

// Custom metrics per endpoint
const processesLatency = new Trend('latency_processes');
const processDetailLatency = new Trend('latency_process_detail');
const dataSourcesLatency = new Trend('latency_data_sources');
const insightsLatency = new Trend('latency_insights');
const analyticsLatency = new Trend('latency_analytics');
const overallLatency = new Trend('latency_overall');

const successRate = new Rate('success_rate');
const p95Compliance = new Rate('p95_compliance');
const totalRequests = new Counter('total_requests');

// Configuration
const API_KEY = __ENV.API_KEY || 'test-partner-api-key';
const P95_TARGET_MS = 100;

export const options = {
  scenarios: {
    // Scenario 1: Read-heavy workload
    read_workload: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      exec: 'readWorkload',
      tags: { scenario: 'read' },
    },
    // Scenario 2: Mixed read endpoints
    mixed_reads: {
      executor: 'constant-arrival-rate',
      rate: 100, // 100 RPS
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      exec: 'mixedReads',
      tags: { scenario: 'mixed' },
      startTime: '10m30s',
    },
    // Scenario 3: Heavy analytics queries
    analytics_load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',
      exec: 'analyticsQueries',
      tags: { scenario: 'analytics' },
      startTime: '16m',
    },
  },
  thresholds: {
    'latency_overall': ['p(95)<100'], // Main target: p95 < 100ms
    'latency_processes': ['p(95)<100'],
    'latency_process_detail': ['p(95)<100'],
    'latency_data_sources': ['p(95)<100'],
    'latency_insights': ['p(95)<100'],
    'latency_analytics': ['p(95)<200'], // Analytics can be slightly slower
    'success_rate': ['rate>0.99'],
    'p95_compliance': ['rate>0.95'], // 95% of requests should meet target
    http_req_failed: ['rate<0.01'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

function makeRequest(endpoint, metricTrend, name) {
  const url = `${BASE_URL}/api/partner${endpoint}`;
  const startTime = Date.now();

  const response = http.get(url, { headers, tags: { name } });

  const duration = Date.now() - startTime;

  // Record metrics
  metricTrend.add(duration);
  overallLatency.add(duration);
  totalRequests.add(1);

  // Track p95 compliance
  p95Compliance.add(duration <= P95_TARGET_MS ? 1 : 0);

  // Track success
  const success = response.status === 200;
  successRate.add(success ? 1 : 0);

  return { response, duration, success };
}

// Read workload - various GET endpoints
export function readWorkload() {
  const entityId = `entity-${Math.floor(Math.random() * 50) + 1}`;

  group('Partner API Reads', () => {
    // List processes
    const { response: processesRes, duration: processesDur } = makeRequest(
      `/processes?limit=20`,
      processesLatency,
      'list_processes'
    );

    check(processesRes, {
      'processes returned': (r) => r.status === 200,
      'processes list valid': (r) => Array.isArray(r.json('data')),
      'processes under 100ms': () => processesDur <= P95_TARGET_MS,
    });

    // Get single process
    const processId = processesRes.json('data')?.[0]?.id || 'process-1';
    const { response: detailRes, duration: detailDur } = makeRequest(
      `/processes/${processId}`,
      processDetailLatency,
      'get_process'
    );

    check(detailRes, {
      'process detail returned': (r) => r.status === 200 || r.status === 404,
      'detail under 100ms': () => detailDur <= P95_TARGET_MS,
    });

    // List data sources
    const { response: dsRes, duration: dsDur } = makeRequest(
      `/data-sources?limit=10`,
      dataSourcesLatency,
      'list_data_sources'
    );

    check(dsRes, {
      'data sources returned': (r) => r.status === 200,
      'data sources under 100ms': () => dsDur <= P95_TARGET_MS,
    });

    // List insights
    const { response: insightsRes, duration: insightsDur } = makeRequest(
      `/insights?limit=10&type=recommendation`,
      insightsLatency,
      'list_insights'
    );

    check(insightsRes, {
      'insights returned': (r) => r.status === 200,
      'insights under 100ms': () => insightsDur <= P95_TARGET_MS,
    });
  });

  sleep(0.5);
}

// Mixed read endpoints
export function mixedReads() {
  // Randomly select an endpoint
  const endpoints = [
    { path: '/processes?limit=20', metric: processesLatency, name: 'list_processes' },
    { path: '/processes?limit=50', metric: processesLatency, name: 'list_processes_50' },
    { path: '/data-sources?limit=20', metric: dataSourcesLatency, name: 'list_data_sources' },
    { path: '/insights?limit=20', metric: insightsLatency, name: 'list_insights' },
    { path: '/insights?type=recommendation', metric: insightsLatency, name: 'list_recommendations' },
    { path: '/insights?type=warning', metric: insightsLatency, name: 'list_warnings' },
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

  const { response, duration } = makeRequest(endpoint.path, endpoint.metric, endpoint.name);

  check(response, {
    'request successful': (r) => r.status === 200,
    'meets latency target': () => duration <= P95_TARGET_MS,
  });

  // Log slow requests
  if (duration > P95_TARGET_MS) {
    console.log(`Slow request: ${endpoint.name} took ${duration}ms`);
  }

  sleep(0.01);
}

// Analytics queries (potentially heavier)
export function analyticsQueries() {
  group('Analytics Queries', () => {
    // Summary analytics
    const { response: summaryRes, duration: summaryDur } = makeRequest(
      '/analytics/summary',
      analyticsLatency,
      'analytics_summary'
    );

    check(summaryRes, {
      'summary returned': (r) => r.status === 200,
      'summary under 200ms': () => summaryDur <= 200,
    });

    // Process metrics
    const { response: metricsRes, duration: metricsDur } = makeRequest(
      '/analytics/processes/metrics?period=7d',
      analyticsLatency,
      'process_metrics'
    );

    check(metricsRes, {
      'metrics returned': (r) => r.status === 200,
      'metrics under 200ms': () => metricsDur <= 200,
    });

    // Trends
    const { response: trendsRes, duration: trendsDur } = makeRequest(
      '/analytics/trends?metric=processCount&period=30d',
      analyticsLatency,
      'trends'
    );

    check(trendsRes, {
      'trends returned': (r) => r.status === 200,
      'trends under 200ms': () => trendsDur <= 200,
    });
  });

  sleep(1);
}

// Summary handler
export function handleSummary(data) {
  const summary = {
    'Total Requests': data.metrics.total_requests?.values?.count || 0,
    'Success Rate (%)': (data.metrics.success_rate?.values?.rate || 0) * 100,
    'p95 Compliance Rate (%)': (data.metrics.p95_compliance?.values?.rate || 0) * 100,
    'Overall Latency': {
      'p50': data.metrics.latency_overall?.values?.['p(50)'] || 0,
      'p90': data.metrics.latency_overall?.values?.['p(90)'] || 0,
      'p95': data.metrics.latency_overall?.values?.['p(95)'] || 0,
      'p99': data.metrics.latency_overall?.values?.['p(99)'] || 0,
    },
    'By Endpoint (p95)': {
      'Processes List': data.metrics.latency_processes?.values?.['p(95)'] || 0,
      'Process Detail': data.metrics.latency_process_detail?.values?.['p(95)'] || 0,
      'Data Sources': data.metrics.latency_data_sources?.values?.['p(95)'] || 0,
      'Insights': data.metrics.latency_insights?.values?.['p(95)'] || 0,
      'Analytics': data.metrics.latency_analytics?.values?.['p(95)'] || 0,
    },
  };

  console.log('\n=== Partner API Latency Test Summary ===');
  console.log(`Total Requests: ${summary['Total Requests']}`);
  console.log(`Success Rate: ${summary['Success Rate (%)'].toFixed(2)}%`);
  console.log(`p95 Compliance Rate: ${summary['p95 Compliance Rate (%)'].toFixed(2)}%`);

  console.log('\nOverall Latency (ms):');
  for (const [key, value] of Object.entries(summary['Overall Latency'])) {
    console.log(`  ${key}: ${value.toFixed(2)}`);
  }

  console.log('\nBy Endpoint p95 (ms):');
  for (const [key, value] of Object.entries(summary['By Endpoint (p95)'])) {
    const status = value <= P95_TARGET_MS ? 'PASS' : 'FAIL';
    console.log(`  ${key}: ${value.toFixed(2)} [${status}]`);
  }

  // Determine overall pass/fail
  const overallP95 = data.metrics.latency_overall?.values?.['p(95)'] || 0;
  const passed = overallP95 <= P95_TARGET_MS;

  console.log(`\n=== RESULT: ${passed ? 'PASSED' : 'FAILED'} ===`);
  console.log(`Target: p95 < ${P95_TARGET_MS}ms`);
  console.log(`Achieved: p95 = ${overallP95.toFixed(2)}ms`);

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'latency-summary.json': JSON.stringify(data, null, 2),
  };
}

export default function() {
  readWorkload();
}
