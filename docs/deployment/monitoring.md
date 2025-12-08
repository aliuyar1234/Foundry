# Monitoring and Observability Guide

Comprehensive monitoring setup for Foundry deployments using Prometheus, Grafana, and alerting.

## Overview

Foundry monitoring covers:
- **Metrics** - Application and infrastructure metrics via Prometheus
- **Logs** - Centralized logging with structured JSON output
- **Traces** - Distributed tracing with OpenTelemetry
- **Alerts** - Proactive alerting for issues

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Grafana Dashboard                         │
└────────────────────────────────┬────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
    ┌───────────┐         ┌───────────┐         ┌───────────┐
    │Prometheus │         │   Loki    │         │  Jaeger   │
    │ (Metrics) │         │  (Logs)   │         │ (Traces)  │
    └───────────┘         └───────────┘         └───────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    │                            │                            │
    ▼                            ▼                            ▼
┌─────────┐              ┌─────────────┐              ┌─────────┐
│ Backend │              │   Worker    │              │ Frontend│
│ /metrics│              │  /metrics   │              │ /metrics│
└─────────┘              └─────────────┘              └─────────┘
```

## Prometheus Setup

### Install Prometheus Stack

```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values prometheus-values.yaml
```

### Prometheus Values

```yaml
# prometheus-values.yaml
prometheus:
  prometheusSpec:
    retention: 30d
    retentionSize: 50GB

    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi

    # Scrape Foundry metrics
    additionalScrapeConfigs:
      - job_name: 'foundry-backend'
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - foundry
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_app]
            regex: foundry-backend
            action: keep
          - source_labels: [__meta_kubernetes_pod_container_port_number]
            regex: "3000"
            action: keep

grafana:
  enabled: true
  adminPassword: "admin-password"

  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
        - name: 'foundry'
          orgId: 1
          folder: 'Foundry'
          type: file
          disableDeletion: false
          editable: true
          options:
            path: /var/lib/grafana/dashboards/foundry

alertmanager:
  enabled: true
  config:
    global:
      resolve_timeout: 5m
    route:
      group_by: ['alertname', 'namespace']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: 'default'
      routes:
        - match:
            severity: critical
          receiver: 'pagerduty'
        - match:
            severity: warning
          receiver: 'slack'
    receivers:
      - name: 'default'
        email_configs:
          - to: 'ops@company.com'
      - name: 'slack'
        slack_configs:
          - api_url: 'https://hooks.slack.com/services/xxx'
            channel: '#foundry-alerts'
      - name: 'pagerduty'
        pagerduty_configs:
          - service_key: 'your-pagerduty-key'
```

### ServiceMonitor for Foundry

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: foundry-backend
  namespace: foundry
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: foundry-backend
  namespaceSelector:
    matchNames:
      - foundry
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
      scrapeTimeout: 10s
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: foundry-worker
  namespace: foundry
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: foundry-worker
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

## Application Metrics

### Backend Metrics Implementation

```typescript
// src/metrics/metricsService.ts
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export class MetricsService {
  private registry: Registry;

  // HTTP metrics
  public httpRequestsTotal: Counter;
  public httpRequestDuration: Histogram;
  public httpRequestsInFlight: Gauge;

  // Business metrics
  public processesCreated: Counter;
  public insightsGenerated: Counter;
  public aiRequestsTotal: Counter;
  public aiRequestDuration: Histogram;

  // Entity metrics
  public activeEntities: Gauge;
  public usersPerEntity: Gauge;

  // Queue metrics
  public jobsProcessed: Counter;
  public jobsInQueue: Gauge;
  public jobProcessingDuration: Histogram;

  constructor() {
    this.registry = new Registry();

    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.registry });

    // HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: 'foundry_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status', 'entity_id'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'foundry_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'foundry_http_requests_in_flight',
      help: 'Number of HTTP requests currently being processed',
      registers: [this.registry],
    });

    // Business metrics
    this.processesCreated = new Counter({
      name: 'foundry_processes_created_total',
      help: 'Total number of processes created',
      labelNames: ['entity_id', 'type'],
      registers: [this.registry],
    });

    this.insightsGenerated = new Counter({
      name: 'foundry_insights_generated_total',
      help: 'Total number of insights generated',
      labelNames: ['entity_id', 'type', 'severity'],
      registers: [this.registry],
    });

    this.aiRequestsTotal = new Counter({
      name: 'foundry_ai_requests_total',
      help: 'Total number of AI API requests',
      labelNames: ['provider', 'model', 'status'],
      registers: [this.registry],
    });

    this.aiRequestDuration = new Histogram({
      name: 'foundry_ai_request_duration_seconds',
      help: 'AI request duration in seconds',
      labelNames: ['provider', 'model'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    // Entity metrics
    this.activeEntities = new Gauge({
      name: 'foundry_active_entities',
      help: 'Number of active entities',
      registers: [this.registry],
    });

    this.usersPerEntity = new Gauge({
      name: 'foundry_users_per_entity',
      help: 'Number of users per entity',
      labelNames: ['entity_id'],
      registers: [this.registry],
    });

    // Queue metrics
    this.jobsProcessed = new Counter({
      name: 'foundry_jobs_processed_total',
      help: 'Total number of jobs processed',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    this.jobsInQueue = new Gauge({
      name: 'foundry_jobs_in_queue',
      help: 'Number of jobs currently in queue',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });

    this.jobProcessingDuration = new Histogram({
      name: 'foundry_job_processing_duration_seconds',
      help: 'Job processing duration in seconds',
      labelNames: ['queue'],
      buckets: [1, 5, 10, 30, 60, 300, 600],
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

export const metricsService = new MetricsService();
```

### Metrics Middleware

```typescript
// src/middleware/metricsMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { metricsService } from '../metrics/metricsService';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  metricsService.httpRequestsInFlight.inc();

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const path = normalizePath(req.route?.path || req.path);
    const entityId = req.headers['x-entity-id'] as string || 'unknown';

    metricsService.httpRequestsTotal.inc({
      method: req.method,
      path,
      status: res.statusCode.toString(),
      entity_id: entityId,
    });

    metricsService.httpRequestDuration.observe(
      { method: req.method, path, status: res.statusCode.toString() },
      duration
    );

    metricsService.httpRequestsInFlight.dec();
  });

  next();
}

function normalizePath(path: string): string {
  // Replace IDs with placeholders
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id');
}
```

### Metrics Endpoint

```typescript
// src/routes/metricsRoutes.ts
import { Router } from 'express';
import { metricsService } from '../metrics/metricsService';

const router = Router();

router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsService.getContentType());
    res.end(await metricsService.getMetrics());
  } catch (error) {
    res.status(500).end();
  }
});

export default router;
```

## Grafana Dashboards

### Foundry Overview Dashboard

```json
{
  "dashboard": {
    "title": "Foundry Overview",
    "uid": "foundry-overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum(rate(foundry_http_requests_total[5m])) by (status)",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "title": "Request Latency (p95)",
        "type": "graph",
        "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(foundry_http_request_duration_seconds_bucket[5m])) by (le, path))",
            "legendFormat": "{{path}}"
          }
        ]
      },
      {
        "title": "Active Entities",
        "type": "stat",
        "gridPos": { "x": 0, "y": 8, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "foundry_active_entities"
          }
        ]
      },
      {
        "title": "Processes Created (24h)",
        "type": "stat",
        "gridPos": { "x": 6, "y": 8, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(increase(foundry_processes_created_total[24h]))"
          }
        ]
      },
      {
        "title": "AI Requests",
        "type": "graph",
        "gridPos": { "x": 0, "y": 12, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum(rate(foundry_ai_requests_total[5m])) by (provider, status)",
            "legendFormat": "{{provider}} - {{status}}"
          }
        ]
      },
      {
        "title": "AI Request Latency",
        "type": "heatmap",
        "gridPos": { "x": 12, "y": 12, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum(rate(foundry_ai_request_duration_seconds_bucket[5m])) by (le)",
            "format": "heatmap"
          }
        ]
      },
      {
        "title": "Job Queue Depth",
        "type": "graph",
        "gridPos": { "x": 0, "y": 20, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "foundry_jobs_in_queue",
            "legendFormat": "{{queue}} - {{state}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "gridPos": { "x": 12, "y": 20, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum(rate(foundry_http_requests_total{status=~\"5..\"}[5m])) / sum(rate(foundry_http_requests_total[5m])) * 100",
            "legendFormat": "Error %"
          }
        ]
      }
    ]
  }
}
```

### Entity Dashboard

```json
{
  "dashboard": {
    "title": "Foundry Entity Metrics",
    "uid": "foundry-entity",
    "templating": {
      "list": [
        {
          "name": "entity_id",
          "type": "query",
          "query": "label_values(foundry_http_requests_total, entity_id)",
          "refresh": 2
        }
      ]
    },
    "panels": [
      {
        "title": "Request Rate by Entity",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(foundry_http_requests_total{entity_id=\"$entity_id\"}[5m])) by (path)",
            "legendFormat": "{{path}}"
          }
        ]
      },
      {
        "title": "Users in Entity",
        "type": "stat",
        "targets": [
          {
            "expr": "foundry_users_per_entity{entity_id=\"$entity_id\"}"
          }
        ]
      },
      {
        "title": "Processes Created",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(foundry_processes_created_total{entity_id=\"$entity_id\"}[5m])) by (type)",
            "legendFormat": "{{type}}"
          }
        ]
      },
      {
        "title": "Insights Generated",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(foundry_insights_generated_total{entity_id=\"$entity_id\"}[5m])) by (severity)",
            "legendFormat": "{{severity}}"
          }
        ]
      }
    ]
  }
}
```

## Alerting Rules

### Foundry Alert Rules

```yaml
# foundry-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: foundry-alerts
  namespace: foundry
  labels:
    release: prometheus
spec:
  groups:
    - name: foundry.availability
      rules:
        - alert: FoundryBackendDown
          expr: up{job="foundry-backend"} == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Foundry backend is down"
            description: "Backend pod {{ $labels.pod }} has been down for more than 2 minutes"

        - alert: FoundryHighErrorRate
          expr: |
            sum(rate(foundry_http_requests_total{status=~"5.."}[5m]))
            / sum(rate(foundry_http_requests_total[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate detected"
            description: "Error rate is {{ $value | humanizePercentage }}"

        - alert: FoundryHighLatency
          expr: |
            histogram_quantile(0.95, sum(rate(foundry_http_request_duration_seconds_bucket[5m])) by (le)) > 2
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High request latency"
            description: "95th percentile latency is {{ $value }}s"

    - name: foundry.resources
      rules:
        - alert: FoundryHighMemoryUsage
          expr: |
            container_memory_usage_bytes{container="backend"}
            / container_spec_memory_limit_bytes{container="backend"} > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High memory usage"
            description: "Backend memory usage is {{ $value | humanizePercentage }}"

        - alert: FoundryHighCPUUsage
          expr: |
            rate(container_cpu_usage_seconds_total{container="backend"}[5m])
            / container_spec_cpu_quota{container="backend"} * 100000 > 0.8
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "High CPU usage"
            description: "Backend CPU usage is {{ $value | humanizePercentage }}"

    - name: foundry.database
      rules:
        - alert: PostgreSQLDown
          expr: pg_up == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "PostgreSQL is down"

        - alert: PostgreSQLHighConnections
          expr: |
            pg_stat_activity_count / pg_settings_max_connections > 0.8
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "PostgreSQL connections high"
            description: "{{ $value | humanizePercentage }} of max connections used"

        - alert: Neo4jDown
          expr: neo4j_database_state != 1
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "Neo4j is down"

        - alert: RedisDown
          expr: redis_up == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "Redis is down"

        - alert: RedisHighMemory
          expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Redis memory usage high"

    - name: foundry.business
      rules:
        - alert: FoundryNoProcessesCreated
          expr: |
            sum(increase(foundry_processes_created_total[1h])) == 0
          for: 2h
          labels:
            severity: warning
          annotations:
            summary: "No processes created"
            description: "No new processes have been created in the last 2 hours"

        - alert: FoundryAIRequestsFailing
          expr: |
            sum(rate(foundry_ai_requests_total{status="error"}[5m]))
            / sum(rate(foundry_ai_requests_total[5m])) > 0.1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "AI requests failing"
            description: "{{ $value | humanizePercentage }} of AI requests are failing"

        - alert: FoundryJobQueueBacklog
          expr: foundry_jobs_in_queue{state="waiting"} > 1000
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Job queue backlog"
            description: "{{ $value }} jobs waiting in {{ $labels.queue }} queue"
```

## Logging

### Structured Logging Configuration

```typescript
// src/logging/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'foundry-backend',
    version: process.env.APP_VERSION,
    environment: process.env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['password', 'token', 'apiKey', 'secret', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
});

// Request logging
export function createRequestLogger(req: any) {
  return logger.child({
    requestId: req.id,
    entityId: req.headers['x-entity-id'],
    userId: req.user?.id,
    path: req.path,
    method: req.method,
  });
}
```

### Loki Configuration

```yaml
# loki-values.yaml
loki:
  enabled: true
  persistence:
    enabled: true
    size: 50Gi

  config:
    auth_enabled: false

    ingester:
      chunk_idle_period: 3m
      chunk_block_size: 262144
      chunk_retain_period: 1m
      max_transfer_retries: 0
      lifecycler:
        ring:
          kvstore:
            store: inmemory
          replication_factor: 1

    limits_config:
      enforce_metric_name: false
      reject_old_samples: true
      reject_old_samples_max_age: 168h

    schema_config:
      configs:
        - from: 2020-10-24
          store: boltdb-shipper
          object_store: filesystem
          schema: v11
          index:
            prefix: index_
            period: 24h

    storage_config:
      boltdb_shipper:
        active_index_directory: /data/loki/boltdb-shipper-active
        cache_location: /data/loki/boltdb-shipper-cache
        cache_ttl: 24h
        shared_store: filesystem
      filesystem:
        directory: /data/loki/chunks

promtail:
  enabled: true
  config:
    clients:
      - url: http://loki:3100/loki/api/v1/push

    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_app]
            target_label: app
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
        pipeline_stages:
          - json:
              expressions:
                level: level
                msg: msg
                requestId: requestId
                entityId: entityId
          - labels:
              level:
              requestId:
              entityId:
```

## Distributed Tracing

### OpenTelemetry Configuration

```typescript
// src/tracing/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'foundry-backend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});

export { sdk };
```

### Jaeger Deployment

```yaml
# jaeger-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
        - name: jaeger
          image: jaegertracing/all-in-one:1.50
          ports:
            - containerPort: 16686  # UI
            - containerPort: 4318   # OTLP HTTP
            - containerPort: 14268  # Collector
          env:
            - name: COLLECTOR_OTLP_ENABLED
              value: "true"
          resources:
            limits:
              memory: 1Gi
---
apiVersion: v1
kind: Service
metadata:
  name: jaeger
  namespace: monitoring
spec:
  selector:
    app: jaeger
  ports:
    - name: ui
      port: 16686
    - name: otlp
      port: 4318
    - name: collector
      port: 14268
```

## Health Checks

### Health Check Endpoints

```typescript
// src/routes/healthRoutes.ts
import { Router } from 'express';
import { prisma } from '../db/prisma';
import { neo4jDriver } from '../db/neo4j';
import { redis } from '../db/redis';

const router = Router();

// Liveness probe
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe
router.get('/health/ready', async (req, res) => {
  const checks: Record<string, boolean> = {};

  try {
    // Check PostgreSQL
    await prisma.$queryRaw`SELECT 1`;
    checks.postgresql = true;
  } catch {
    checks.postgresql = false;
  }

  try {
    // Check Neo4j
    const session = neo4jDriver.session();
    await session.run('RETURN 1');
    await session.close();
    checks.neo4j = true;
  } catch {
    checks.neo4j = false;
  }

  try {
    // Check Redis
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const allHealthy = Object.values(checks).every(v => v);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Detailed health
router.get('/health/details', async (req, res) => {
  const details: any = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.APP_VERSION,
    nodeVersion: process.version,
  };

  res.json(details);
});

export default router;
```

## Runbook Integration

### Common Alert Responses

```markdown
## Alert: FoundryBackendDown

### Symptoms
- Backend pods showing as down in monitoring
- 5xx errors from load balancer
- No API responses

### Investigation
1. Check pod status: `kubectl get pods -n foundry -l app=foundry-backend`
2. Check pod logs: `kubectl logs -l app=foundry-backend -n foundry --tail=100`
3. Check events: `kubectl get events -n foundry --sort-by='.lastTimestamp'`
4. Check node status: `kubectl get nodes`

### Resolution
1. If OOMKilled: Increase memory limits
2. If CrashLoopBackOff: Check logs for startup errors
3. If Pending: Check resource availability
4. Manual restart: `kubectl rollout restart deployment/foundry-backend -n foundry`

---

## Alert: FoundryHighErrorRate

### Symptoms
- Error rate > 5%
- Users reporting failures

### Investigation
1. Check error logs: `kubectl logs -l app=foundry-backend -n foundry | grep error`
2. Check which endpoints: Query Prometheus for status codes by path
3. Check database connectivity
4. Check external service status (AI providers)

### Resolution
1. If database errors: Check database health
2. If timeout errors: Check resource limits, scale up
3. If external service errors: Check provider status, enable fallback
```

## SLA Monitoring

### SLO Configuration

```yaml
# slo.yaml
apiVersion: sloth.slok.dev/v1
kind: PrometheusServiceLevel
metadata:
  name: foundry-api-availability
  namespace: foundry
spec:
  service: foundry-backend
  labels:
    team: platform
  slos:
    - name: requests-availability
      objective: 99.9
      description: "99.9% of requests should be successful"
      sli:
        events:
          errorQuery: sum(rate(foundry_http_requests_total{status=~"5.."}[{{.window}}]))
          totalQuery: sum(rate(foundry_http_requests_total[{{.window}}]))
      alerting:
        name: FoundryAvailabilitySLOBreach
        pageAlert:
          labels:
            severity: critical
        ticketAlert:
          labels:
            severity: warning

    - name: requests-latency
      objective: 99
      description: "99% of requests should complete within 500ms"
      sli:
        events:
          errorQuery: |
            sum(rate(foundry_http_request_duration_seconds_bucket{le="0.5"}[{{.window}}]))
          totalQuery: |
            sum(rate(foundry_http_request_duration_seconds_count[{{.window}}]))
      alerting:
        name: FoundryLatencySLOBreach
```
