# Multi-Entity Operations Guide

Configure and manage multi-tenant deployments with entity isolation, cross-entity features, and entity administration.

## Overview

Foundry's multi-entity architecture enables:
- **Complete data isolation** between entities (tenants)
- **Shared infrastructure** for cost efficiency
- **Cross-entity intelligence** with anonymization
- **Entity-specific customization** (branding, features)

## Entity Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Foundry Platform                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Entity A   │  │   Entity B   │  │   Entity C   │          │
│  │  (Tenant 1)  │  │  (Tenant 2)  │  │  (Tenant 3)  │          │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤          │
│  │ Users        │  │ Users        │  │ Users        │          │
│  │ Processes    │  │ Processes    │  │ Processes    │          │
│  │ Documents    │  │ Documents    │  │ Documents    │          │
│  │ Insights     │  │ Insights     │  │ Insights     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     Shared Services                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Cross-Entity Intelligence (Anonymized Benchmarks)       │   │
│  │  Partner API Gateway                                     │   │
│  │  Platform Administration                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Management

### Creating an Entity

```bash
# CLI command
foundry entity create \
  --name "Acme Corporation" \
  --slug "acme-corp" \
  --tier "enterprise" \
  --admin-email "admin@acme.com"

# API request
curl -X POST "https://foundry.your-company.com/api/admin/entities" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "tier": "enterprise",
    "settings": {
      "maxUsers": 100,
      "maxProcesses": 1000,
      "features": ["ai-insights", "cross-entity-benchmarks"]
    },
    "adminUser": {
      "email": "admin@acme.com",
      "firstName": "Admin",
      "lastName": "User"
    }
  }'
```

### Entity Configuration

```yaml
# Entity settings schema
entity:
  id: "entity-uuid-123"
  name: "Acme Corporation"
  slug: "acme-corp"
  tier: "enterprise"

  # Feature flags
  features:
    aiInsights: true
    crossEntityBenchmarks: true
    customBranding: true
    apiAccess: true
    ssoEnabled: true

  # Resource limits
  limits:
    maxUsers: 100
    maxProcesses: 1000
    maxDocuments: 10000
    maxStorageGB: 100
    apiRequestsPerMinute: 1000

  # Branding
  branding:
    logoUrl: "https://acme.com/logo.png"
    primaryColor: "#1E40AF"
    faviconUrl: "https://acme.com/favicon.ico"

  # SSO configuration
  sso:
    type: "saml"
    configurationId: "saml-okta-acme"

  # Data retention
  dataRetention:
    processHistoryDays: 365
    auditLogDays: 730
    deletedDataDays: 30
```

### Entity Lifecycle

```bash
# Suspend entity (disable access, preserve data)
foundry entity suspend "acme-corp" --reason "Non-payment"

# Reactivate entity
foundry entity activate "acme-corp"

# Archive entity (read-only, reduced storage)
foundry entity archive "acme-corp"

# Delete entity (permanent, with data export)
foundry entity delete "acme-corp" \
  --export-to "s3://backups/acme-corp-export.zip" \
  --confirm
```

## Data Isolation

### PostgreSQL Row-Level Security

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('process', 'document', 'insight', 'user_entity');

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';

-- Test entity isolation
SET app.current_entity_id = 'entity-123';
SELECT count(*) FROM process; -- Should only show entity-123 data

SET app.current_entity_id = 'entity-456';
SELECT count(*) FROM process; -- Should only show entity-456 data
```

### Neo4j Entity Scoping

```cypher
// Verify entity indexes exist
SHOW INDEXES
WHERE labelsOrTypes IN ['Process', 'Document', 'Insight']
AND properties = ['entityId'];

// Query with entity scope
MATCH (p:Process {entityId: $entityId})
WHERE p.status = 'ACTIVE'
RETURN p;

// Admin query across entities (platform admin only)
MATCH (p:Process)
RETURN p.entityId, count(p) as processCount
ORDER BY processCount DESC;
```

### Redis Key Namespacing

```typescript
// Entity-scoped cache keys
const cacheKey = `entity:${entityId}:processes:${processId}`;
const sessionKey = `session:${entityId}:${userId}`;
const rateLimitKey = `ratelimit:${entityId}:${apiKeyId}`;

// Verify key isolation
redis.keys('entity:entity-123:*'); // Only entity-123 keys
redis.keys('entity:entity-456:*'); // Only entity-456 keys
```

## Cross-Entity Features

### Anonymized Benchmarks

```yaml
# Benchmark configuration
benchmarks:
  enabled: true

  # Data anonymization settings
  anonymization:
    minEntitiesForBenchmark: 5
    aggregationLevel: "industry"
    excludeOutliers: true
    noiseInjection: true

  # Benchmark categories
  categories:
    - name: "process_efficiency"
      metrics:
        - "avg_cycle_time"
        - "automation_rate"
        - "error_rate"

    - name: "resource_utilization"
      metrics:
        - "cpu_per_process"
        - "cost_per_transaction"

  # Opt-out settings
  entityOptOut:
    enabled: true
    default: false
```

### Enabling Cross-Entity Intelligence

```bash
# Enable for entity
foundry entity update "acme-corp" \
  --enable-feature "cross-entity-benchmarks"

# Check benchmark eligibility
foundry benchmark check-eligibility "acme-corp"

# View available benchmarks
foundry benchmark list --entity "acme-corp"
```

### Partner Data Sharing

```yaml
# Partner API configuration
partnerApi:
  enabled: true

  # Data sharing agreements
  agreements:
    - partnerId: "partner-123"
      partnerName: "Consulting Firm"
      entities:
        - entityId: "acme-corp"
          permissions:
            - "read:processes"
            - "read:insights"
          dataFilters:
            excludeFields: ["sensitiveData", "internalNotes"]
            dateRange: "last-90-days"

  # Rate limiting per partner
  rateLimits:
    requestsPerMinute: 100
    requestsPerDay: 10000
```

## Entity Administration

### User Management

```bash
# List entity users
foundry entity users list "acme-corp"

# Add user to entity
foundry entity users add "acme-corp" \
  --email "user@acme.com" \
  --role "analyst"

# Update user role
foundry entity users update "acme-corp" \
  --email "user@acme.com" \
  --role "admin"

# Remove user from entity
foundry entity users remove "acme-corp" \
  --email "user@acme.com"
```

### Role-Based Access Control

```yaml
# Entity roles
roles:
  admin:
    description: "Full entity administration"
    permissions:
      - "entity:manage"
      - "users:manage"
      - "processes:*"
      - "documents:*"
      - "insights:*"
      - "settings:manage"

  analyst:
    description: "Create and analyze processes"
    permissions:
      - "processes:create"
      - "processes:read"
      - "processes:update"
      - "documents:read"
      - "insights:read"

  viewer:
    description: "Read-only access"
    permissions:
      - "processes:read"
      - "documents:read"
      - "insights:read"

  api_user:
    description: "API-only access"
    permissions:
      - "api:access"
      - "processes:read"
      - "insights:read"
```

### API Key Management

```bash
# Create API key for entity
foundry entity apikey create "acme-corp" \
  --name "Integration Key" \
  --role "api_user" \
  --expires "2025-12-31"

# List API keys
foundry entity apikey list "acme-corp"

# Revoke API key
foundry entity apikey revoke "acme-corp" --key-id "key-123"

# Rotate API key
foundry entity apikey rotate "acme-corp" --key-id "key-123"
```

## Resource Management

### Usage Monitoring

```bash
# View entity usage
foundry entity usage "acme-corp"

# Output:
# Entity: Acme Corporation (acme-corp)
# Tier: Enterprise
#
# Resource Usage:
#   Users: 45/100 (45%)
#   Processes: 523/1000 (52%)
#   Documents: 2341/10000 (23%)
#   Storage: 34GB/100GB (34%)
#   API Requests (today): 4523/unlimited
#
# Feature Usage:
#   AI Insights: 234 generated this month
#   Benchmarks: 12 accessed this month
```

### Quota Management

```bash
# Update entity quotas
foundry entity quota update "acme-corp" \
  --max-users 200 \
  --max-processes 2000 \
  --max-storage-gb 200

# Set usage alerts
foundry entity alerts set "acme-corp" \
  --threshold 80 \
  --notify "admin@acme.com"
```

### Resource Allocation

```yaml
# Entity resource allocation
resources:
  entityId: "acme-corp"

  # Compute allocation
  compute:
    workerPriority: "high"
    maxConcurrentJobs: 10
    dedicatedWorkers: false

  # Storage allocation
  storage:
    tier: "standard"
    replicationFactor: 3
    backupFrequency: "daily"

  # AI allocation
  ai:
    priority: "standard"
    monthlyTokenLimit: 1000000
    modelAccess: ["gpt-4", "claude-3"]
```

## Billing Integration

### Usage Metering

```typescript
// Meter usage events
interface UsageEvent {
  entityId: string;
  eventType: 'api_request' | 'ai_tokens' | 'storage_gb' | 'user_active';
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, string>;
}

// Example metering call
await meteringService.recordUsage({
  entityId: 'acme-corp',
  eventType: 'ai_tokens',
  quantity: 1500,
  timestamp: new Date(),
  metadata: {
    model: 'gpt-4',
    feature: 'process-analysis',
  },
});
```

### Billing Export

```bash
# Export usage for billing
foundry billing export \
  --start "2024-01-01" \
  --end "2024-01-31" \
  --format "csv" \
  --output "january-usage.csv"

# Generate invoice data
foundry billing invoice-data \
  --entity "acme-corp" \
  --period "2024-01" \
  --format "json"
```

## Monitoring & Alerts

### Entity Health Dashboard

```yaml
# Grafana dashboard queries
panels:
  - title: "Active Users by Entity"
    query: |
      sum by (entity_id) (
        foundry_active_users{job="foundry-backend"}
      )

  - title: "API Requests by Entity"
    query: |
      sum by (entity_id) (
        rate(foundry_http_requests_total[5m])
      )

  - title: "Storage Usage by Entity"
    query: |
      sum by (entity_id) (
        foundry_storage_bytes{job="foundry-backend"}
      )

  - title: "Error Rate by Entity"
    query: |
      sum by (entity_id) (
        rate(foundry_http_requests_total{status=~"5.."}[5m])
      ) / sum by (entity_id) (
        rate(foundry_http_requests_total[5m])
      )
```

### Entity Alerts

```yaml
# Alert rules
alerts:
  - name: EntityQuotaWarning
    condition: |
      foundry_entity_usage_percent > 80
    severity: warning
    message: "Entity {{ $labels.entity_id }} is at {{ $value }}% of quota"

  - name: EntityQuotaCritical
    condition: |
      foundry_entity_usage_percent > 95
    severity: critical
    message: "Entity {{ $labels.entity_id }} is at {{ $value }}% of quota"

  - name: EntityHighErrorRate
    condition: |
      sum by (entity_id) (rate(foundry_http_requests_total{status=~"5.."}[5m]))
      / sum by (entity_id) (rate(foundry_http_requests_total[5m])) > 0.05
    severity: warning
    message: "High error rate for entity {{ $labels.entity_id }}"
```

## Troubleshooting

### Data Isolation Verification

```bash
# Verify RLS is working
foundry entity verify-isolation "acme-corp"

# Check for cross-entity data leakage
foundry entity audit-isolation --full-scan

# Test entity switching
foundry entity test-context-switch "acme-corp" "other-corp"
```

### Common Issues

**"Entity not found" errors:**
```bash
# Check entity exists and is active
foundry entity show "acme-corp"

# Check user has access to entity
foundry entity users check "acme-corp" --email "user@acme.com"
```

**Quota exceeded errors:**
```bash
# Check current usage
foundry entity usage "acme-corp" --detailed

# Temporarily increase quota (admin only)
foundry entity quota override "acme-corp" \
  --resource "processes" \
  --value 1500 \
  --duration "24h"
```

**Cross-entity access issues:**
```bash
# Check cross-entity permissions
foundry entity cross-access check "acme-corp" --target "partner-corp"

# View data sharing agreements
foundry entity data-sharing list "acme-corp"
```
