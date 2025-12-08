/**
 * Webhook Delivery Load Test
 * T361 - Test webhook delivery at scale (1000+ events/min)
 *
 * Tests webhook system's ability to handle high-volume event delivery.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { BASE_URL } from './k6-config.js';

// Custom metrics
const webhookCreated = new Counter('webhook_events_created');
const webhookDelivered = new Counter('webhook_events_delivered');
const webhookFailed = new Counter('webhook_events_failed');
const webhookLatency = new Trend('webhook_delivery_latency');
const webhookQueueSize = new Gauge('webhook_queue_size');
const deliverySuccessRate = new Rate('delivery_success_rate');
const retryRate = new Rate('retry_rate');

// Test configuration
const WEBHOOK_ENDPOINT = __ENV.WEBHOOK_ENDPOINT || 'https://webhook.site/test';
const TARGET_EVENTS_PER_MINUTE = 1000;
const EVENTS_PER_SECOND = Math.ceil(TARGET_EVENTS_PER_MINUTE / 60);

// Event types to simulate
const EVENT_TYPES = [
  'process.created',
  'process.updated',
  'process.completed',
  'insight.created',
  'insight.dismissed',
  'data_source.synced',
  'data_source.error',
  'user.created',
  'user.deactivated',
  'entity.updated',
];

export const options = {
  scenarios: {
    // Scenario 1: Steady event generation (target: 1000 events/min)
    steady_events: {
      executor: 'constant-arrival-rate',
      rate: EVENTS_PER_SECOND,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      exec: 'generateEvent',
      tags: { scenario: 'steady' },
    },
    // Scenario 2: Burst event generation
    burst_events: {
      executor: 'ramping-arrival-rate',
      startRate: EVENTS_PER_SECOND,
      timeUnit: '1s',
      stages: [
        { duration: '1m', target: EVENTS_PER_SECOND },
        { duration: '30s', target: EVENTS_PER_SECOND * 5 }, // 5x burst
        { duration: '1m', target: EVENTS_PER_SECOND * 5 },
        { duration: '30s', target: EVENTS_PER_SECOND },
        { duration: '1m', target: EVENTS_PER_SECOND },
      ],
      preAllocatedVUs: 100,
      exec: 'generateEvent',
      tags: { scenario: 'burst' },
      startTime: '6m',
    },
    // Scenario 3: Monitor delivery status
    delivery_monitor: {
      executor: 'constant-vus',
      vus: 5,
      duration: '12m',
      exec: 'monitorDelivery',
      tags: { scenario: 'monitor' },
    },
    // Scenario 4: Subscription management under load
    subscription_management: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 20,
      exec: 'manageSubscriptions',
      tags: { scenario: 'subscriptions' },
      startTime: '10m',
    },
  },
  thresholds: {
    'webhook_delivery_latency': ['p(95)<5000'], // 95% delivered within 5s
    'delivery_success_rate': ['rate>0.95'], // 95%+ delivery success
    'retry_rate': ['rate<0.1'], // Less than 10% retries
    http_req_failed: ['rate<0.01'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${__ENV.AUTH_TOKEN || 'test-token'}`,
};

function getRandomEventType() {
  return EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
}

function getRandomEntityId() {
  return `entity-${Math.floor(Math.random() * 50) + 1}`;
}

function generateEventPayload() {
  const eventType = getRandomEventType();
  const [resource, action] = eventType.split('.');

  return {
    type: eventType,
    timestamp: new Date().toISOString(),
    entityId: getRandomEntityId(),
    data: {
      resourceType: resource,
      action: action,
      resourceId: `${resource}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      metadata: {
        triggeredBy: `user-${Math.floor(Math.random() * 100) + 1}`,
        source: 'load-test',
        correlationId: `corr-${Date.now()}`,
      },
    },
  };
}

// Generate webhook events
export function generateEvent() {
  const payload = generateEventPayload();

  group('Event Generation', () => {
    const startTime = Date.now();

    // Trigger event (simulates internal event emission)
    const createRes = http.post(
      `${BASE_URL}/api/webhooks/events`,
      JSON.stringify(payload),
      { headers, tags: { name: 'create_event' } }
    );

    const success = createRes.status === 200 || createRes.status === 202;

    check(createRes, {
      'event accepted': (r) => success,
      'event id returned': (r) => {
        if (success) {
          return r.json('eventId') !== undefined;
        }
        return true;
      },
    });

    if (success) {
      webhookCreated.add(1);

      // Track event for delivery monitoring
      const eventId = createRes.json('eventId');
      if (eventId) {
        __ENV[`event_${eventId}`] = startTime;
      }
    }
  });

  // Minimal sleep to allow sustained rate
  sleep(0.01);
}

// Monitor webhook delivery status
export function monitorDelivery() {
  group('Delivery Monitoring', () => {
    // Check queue status
    const queueRes = http.get(
      `${BASE_URL}/api/webhooks/queue/status`,
      { headers, tags: { name: 'queue_status' } }
    );

    check(queueRes, {
      'queue status retrieved': (r) => r.status === 200,
    });

    if (queueRes.status === 200) {
      const status = queueRes.json();
      webhookQueueSize.add(status.pending || 0);

      check(null, {
        'queue not overflowing': () => (status.pending || 0) < 10000,
      });
    }

    // Check recent delivery stats
    const statsRes = http.get(
      `${BASE_URL}/api/webhooks/stats?interval=1m`,
      { headers, tags: { name: 'delivery_stats' } }
    );

    if (statsRes.status === 200) {
      const stats = statsRes.json();

      webhookDelivered.add(stats.delivered || 0);
      webhookFailed.add(stats.failed || 0);

      const totalAttempted = (stats.delivered || 0) + (stats.failed || 0);
      if (totalAttempted > 0) {
        const successRate = (stats.delivered || 0) / totalAttempted;
        deliverySuccessRate.add(successRate);
      }

      if (stats.retried) {
        retryRate.add(stats.retried / (stats.delivered || 1));
      }

      // Check average latency
      if (stats.avgLatencyMs) {
        webhookLatency.add(stats.avgLatencyMs);
      }

      check(stats, {
        'delivery rate healthy': (s) => {
          const rate = s.deliveredPerMinute || 0;
          return rate > 0 || totalAttempted === 0;
        },
        'failure rate acceptable': (s) => {
          if (totalAttempted === 0) return true;
          return (s.failed || 0) / totalAttempted < 0.05;
        },
      });
    }
  });

  sleep(5); // Check every 5 seconds
}

// Manage webhook subscriptions under load
export function manageSubscriptions() {
  const entityId = getRandomEntityId();

  group('Subscription Management', () => {
    // Create subscription
    const createRes = http.post(
      `${BASE_URL}/api/webhooks/subscriptions`,
      JSON.stringify({
        entityId: entityId,
        url: `${WEBHOOK_ENDPOINT}/${entityId}`,
        events: EVENT_TYPES.slice(0, 5), // Subscribe to first 5 event types
        secret: `secret-${Date.now()}`,
        active: true,
      }),
      { headers, tags: { name: 'create_subscription' } }
    );

    const createSuccess = createRes.status === 200 || createRes.status === 201;
    check(createRes, {
      'subscription created': (r) => createSuccess,
    });

    if (createSuccess) {
      const subscriptionId = createRes.json('id');

      // Update subscription
      const updateRes = http.put(
        `${BASE_URL}/api/webhooks/subscriptions/${subscriptionId}`,
        JSON.stringify({
          events: EVENT_TYPES, // Subscribe to all events
        }),
        { headers, tags: { name: 'update_subscription' } }
      );

      check(updateRes, {
        'subscription updated': (r) => r.status === 200,
      });

      // Test subscription (manual trigger)
      const testRes = http.post(
        `${BASE_URL}/api/webhooks/subscriptions/${subscriptionId}/test`,
        null,
        { headers, tags: { name: 'test_subscription' } }
      );

      check(testRes, {
        'test delivery triggered': (r) => r.status === 200 || r.status === 202,
      });

      // Get subscription delivery log
      const logsRes = http.get(
        `${BASE_URL}/api/webhooks/subscriptions/${subscriptionId}/logs?limit=10`,
        { headers, tags: { name: 'get_logs' } }
      );

      check(logsRes, {
        'logs retrieved': (r) => r.status === 200,
      });

      // Delete subscription
      const deleteRes = http.del(
        `${BASE_URL}/api/webhooks/subscriptions/${subscriptionId}`,
        null,
        { headers, tags: { name: 'delete_subscription' } }
      );

      check(deleteRes, {
        'subscription deleted': (r) => r.status === 200 || r.status === 204,
      });
    }
  });

  sleep(1);
}

// Verify delivery of specific events
export function verifyDelivery(eventId) {
  const verifyRes = http.get(
    `${BASE_URL}/api/webhooks/events/${eventId}/status`,
    { headers, tags: { name: 'verify_delivery' } }
  );

  if (verifyRes.status === 200) {
    const status = verifyRes.json();
    const deliveryTime = status.deliveredAt
      ? new Date(status.deliveredAt).getTime()
      : null;
    const createdAt = __ENV[`event_${eventId}`];

    if (deliveryTime && createdAt) {
      webhookLatency.add(deliveryTime - createdAt);
    }

    return status.status === 'delivered';
  }

  return false;
}

// Summary handler
export function handleSummary(data) {
  const created = data.metrics.webhook_events_created?.values?.count || 0;
  const delivered = data.metrics.webhook_events_delivered?.values?.count || 0;

  const summary = {
    'Events Created': created,
    'Events Delivered': delivered,
    'Events Failed': data.metrics.webhook_events_failed?.values?.count || 0,
    'Events/Minute': created / ((data.state?.testRunDurationMs || 1) / 60000),
    'Delivery Success Rate (%)': (data.metrics.delivery_success_rate?.values?.rate || 0) * 100,
    'p95 Delivery Latency (ms)': data.metrics.webhook_delivery_latency?.values?.['p(95)'] || 0,
    'Max Queue Size': data.metrics.webhook_queue_size?.values?.max || 0,
    'Retry Rate (%)': (data.metrics.retry_rate?.values?.rate || 0) * 100,
  };

  console.log('\n=== Webhook Delivery Load Test Summary ===');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
  }

  // Check if we met the 1000+ events/min target
  const eventsPerMin = summary['Events/Minute'];
  console.log(`\nTarget: ${TARGET_EVENTS_PER_MINUTE} events/min`);
  console.log(`Achieved: ${eventsPerMin.toFixed(0)} events/min`);
  console.log(`Target Met: ${eventsPerMin >= TARGET_EVENTS_PER_MINUTE ? 'YES' : 'NO'}`);

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'webhook-summary.json': JSON.stringify(data, null, 2),
  };
}

export default function() {
  generateEvent();
}
