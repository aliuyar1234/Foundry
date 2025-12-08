# OPERATE Tier Architecture Documentation

This document describes the architecture of the Foundry OPERATE tier, including system design, component interactions, data flows, and deployment considerations.

## Table of Contents

1. [Overview](#overview)
2. [System Components](#system-components)
3. [Data Architecture](#data-architecture)
4. [Integration Patterns](#integration-patterns)
5. [Security Architecture](#security-architecture)
6. [Scalability & Performance](#scalability--performance)
7. [Monitoring & Observability](#monitoring--observability)
8. [Deployment Architecture](#deployment-architecture)

---

## Overview

The OPERATE tier provides intelligent operations management capabilities built on top of the DISCOVER tier foundation. It enables organizations to:

- **Route tasks intelligently** using AI-powered decision making
- **Interact with an AI assistant** for operational queries and actions
- **Automate self-healing** to maintain system health
- **Monitor compliance** automatically against defined rules
- **Manage workload** to prevent burnout and optimize capacity

### Architecture Principles

1. **Event-Driven**: Components communicate through events for loose coupling
2. **Microservices**: Independent services with clear boundaries
3. **API-First**: All functionality exposed through well-defined APIs
4. **Real-Time**: Support for real-time updates via WebSockets/SSE
5. **Audit Trail**: Complete traceability of all decisions and actions

---

## System Components

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Routing  │ │Assistant │ │Self-Heal │ │Compliance│ │ Workload │  │
│  │   UI     │ │   UI     │ │   UI     │ │   UI     │ │   UI     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
└───────┼────────────┼────────────┼────────────┼────────────┼─────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API Gateway (Fastify)                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Authentication │ Rate Limiting │ Request Validation         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────┬────────────┬────────────┬────────────┬────────────┬─────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│  Routing  │ │ Assistant │ │Self-Heal  │ │Compliance │ │ Workload  │
│  Service  │ │  Service  │ │  Service  │ │  Service  │ │  Service  │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
      │             │             │             │             │
      ▼             ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Shared Services Layer                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Claude  │ │  Cache   │ │  Queue   │ │  Events  │ │  Audit   │  │
│  │   API    │ │ (Redis)  │ │(BullMQ)  │ │  (SSE)   │ │  Trail   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Data Layer                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  PostgreSQL  │  │  TimescaleDB │  │    Qdrant    │               │
│  │   (Primary)  │  │  (Metrics)   │  │  (Vectors)   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Services

#### 1. Routing Service

**Purpose**: Intelligent task assignment and workload distribution

**Components**:
- Rule Engine: Evaluates routing rules against incoming tasks
- AI Router: Uses Claude for complex routing decisions
- Capacity Manager: Tracks team and member availability
- Skill Matcher: Matches task requirements to member skills

**Key Flows**:
```
Task Created → Rule Evaluation → AI Classification →
Capacity Check → Skill Match → Assignment → Audit Log
```

#### 2. AI Assistant Service

**Purpose**: Natural language interface for operational queries

**Components**:
- Session Manager: Handles conversation state
- Context Builder: Assembles relevant context for queries
- Response Generator: Interfaces with Claude API
- Data Masker: Protects sensitive information

**Key Flows**:
```
User Query → Context Assembly → Claude API Call →
Response Processing → Data Masking → Client Response
```

#### 3. Self-Healing Service

**Purpose**: Automated issue detection and remediation

**Components**:
- Health Monitor: Continuous system health checks
- Anomaly Detector: Statistical and ML-based detection
- Playbook Engine: Executes remediation playbooks
- Action Manager: Tracks and controls automated actions

**Key Flows**:
```
Metric Collection → Anomaly Detection → Issue Creation →
Playbook Match → Action Execution → Verification → Audit Log
```

#### 4. Compliance Service

**Purpose**: Automated compliance monitoring and enforcement

**Components**:
- Rule Evaluator: Checks compliance rules against data
- Violation Manager: Tracks and manages violations
- SLA Tracker: Monitors SLA adherence
- Report Generator: Creates compliance reports

**Key Flows**:
```
Data Change → Rule Evaluation → Violation Detection →
Grace Period Check → Alert Generation → Remediation → Resolution
```

#### 5. Workload Service

**Purpose**: Team capacity planning and burnout prevention

**Components**:
- Metrics Collector: Gathers workload metrics
- Burnout Detector: Calculates burnout risk scores
- Capacity Planner: Forecasts future capacity needs
- Alert Generator: Creates workload alerts

**Key Flows**:
```
Activity Data → Metric Calculation → Risk Assessment →
Alert Evaluation → Notification → Dashboard Update
```

---

## Data Architecture

### Primary Database (PostgreSQL)

```sql
-- Core OPERATE Tables

-- Routing
CREATE TABLE routing_rules (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL,
    enabled BOOLEAN DEFAULT true,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE routing_decisions (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL,
    rule_id UUID REFERENCES routing_rules(id),
    assigned_team VARCHAR(255),
    assigned_user UUID,
    confidence DECIMAL(3,2),
    factors JSONB,
    decided_at TIMESTAMPTZ DEFAULT NOW()
);

-- Self-Healing
CREATE TABLE playbooks (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    trigger JSONB NOT NULL,
    steps JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    cooldown INTEGER DEFAULT 300
);

CREATE TABLE healing_actions (
    id UUID PRIMARY KEY,
    playbook_id UUID REFERENCES playbooks(id),
    issue_id UUID,
    status VARCHAR(50) NOT NULL,
    params JSONB,
    result JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Compliance
CREATE TABLE compliance_rules (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    conditions JSONB NOT NULL,
    grace_period INTEGER,
    enabled BOOLEAN DEFAULT true
);

CREATE TABLE violations (
    id UUID PRIMARY KEY,
    rule_id UUID REFERENCES compliance_rules(id),
    entity_type VARCHAR(100),
    entity_id UUID,
    severity VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open',
    details JSONB,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Workload
CREATE TABLE workload_snapshots (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    snapshot_date DATE NOT NULL,
    active_tasks INTEGER,
    total_hours DECIMAL(5,2),
    utilization DECIMAL(5,2),
    burnout_score DECIMAL(5,2),
    metrics JSONB
);
```

### Time-Series Database (TimescaleDB)

```sql
-- Metrics hypertables
CREATE TABLE system_metrics (
    time TIMESTAMPTZ NOT NULL,
    organization_id UUID NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION,
    tags JSONB
);

SELECT create_hypertable('system_metrics', 'time');

-- Continuous aggregates for dashboards
CREATE MATERIALIZED VIEW hourly_metrics
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    organization_id,
    metric_name,
    AVG(value) as avg_value,
    MAX(value) as max_value,
    MIN(value) as min_value
FROM system_metrics
GROUP BY bucket, organization_id, metric_name;
```

### Vector Database (Qdrant)

Collections for AI context retrieval:
- `assistant_context`: Document chunks for RAG
- `routing_history`: Historical routing decisions for similarity search
- `issue_patterns`: Historical issue patterns for anomaly detection

---

## Integration Patterns

### Event Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Service   │───▶│    Redis    │───▶│  Consumers  │
│  (Producer) │    │   Streams   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
       │                                      │
       ▼                                      ▼
┌─────────────┐                      ┌─────────────┐
│   BullMQ    │                      │    SSE      │
│   (Jobs)    │                      │  (Clients)  │
└─────────────┘                      └─────────────┘
```

### Event Types

| Event | Producer | Consumers |
|-------|----------|-----------|
| `task.created` | Task Service | Routing Service |
| `task.routed` | Routing Service | Audit, Analytics |
| `issue.detected` | Self-Healing | Alerts, Dashboard |
| `action.executed` | Self-Healing | Audit, Notifications |
| `violation.detected` | Compliance | Alerts, Dashboard |
| `workload.alert` | Workload | Notifications, Dashboard |

### External Integrations

```
┌──────────────────────────────────────────────────────────────┐
│                    External Services                          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Claude  │  │  Slack   │  │  Email   │  │ Calendar │     │
│  │   API    │  │  API     │  │  SMTP    │  │   API    │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
│       │             │             │             │            │
└───────┼─────────────┼─────────────┼─────────────┼────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌──────────────────────────────────────────────────────────────┐
│                  Integration Layer                            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Rate Limiting │ Circuit Breaker │ Retry Logic      │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

### Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layer                            │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │    JWT      │  │   RBAC      │  │   Audit     │          │
│  │  Tokens     │  │  Policies   │  │   Trail     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Data Masking │ Encryption │ Input Validation        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Role Hierarchy

```
ADMIN
  └── MANAGER
        └── OPERATOR
              └── VIEWER
```

### Permission Matrix

| Resource | VIEWER | OPERATOR | MANAGER | ADMIN |
|----------|--------|----------|---------|-------|
| Routing Rules | Read | Read | CRUD | CRUD |
| AI Assistant | Use | Use | Use | Use + Configure |
| Self-Healing | View | View | Execute | Full |
| Compliance | View | View | Manage | Full |
| Workload | View | View | Manage | Full |

### Data Protection

1. **At Rest**: AES-256 encryption for sensitive fields
2. **In Transit**: TLS 1.3 for all connections
3. **AI Responses**: Automatic PII masking
4. **Audit Logs**: Immutable, tamper-evident storage

---

## Scalability & Performance

### Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Cache Layers                              │
│                                                              │
│  L1: In-Memory (Node.js LRU)                                │
│      - Hot configuration                                     │
│      - Session data                                          │
│      TTL: 60 seconds                                         │
│                                                              │
│  L2: Redis Cluster                                           │
│      - Routing decisions                                     │
│      - AI context                                            │
│      - Compliance state                                      │
│      TTL: 5-60 minutes                                       │
│                                                              │
│  L3: Database Query Cache                                    │
│      - Aggregate queries                                     │
│      - Report data                                           │
│      TTL: 15-60 minutes                                      │
└─────────────────────────────────────────────────────────────┘
```

### Horizontal Scaling

```
                    ┌───────────────┐
                    │  Load Balancer │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   API Node 1  │   │   API Node 2  │   │   API Node N  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    ┌───────▼───────┐
                    │ Redis Cluster │
                    └───────────────┘
```

### Performance Targets

| Operation | Target Latency | SLA |
|-----------|---------------|-----|
| Routing Decision | < 200ms | P99 |
| AI Assistant Response | < 3s | P95 |
| Health Check | < 100ms | P99 |
| Compliance Check | < 500ms | P99 |
| Dashboard Load | < 2s | P95 |

---

## Monitoring & Observability

### Metrics Collection

```
┌─────────────────────────────────────────────────────────────┐
│                    Observability Stack                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Prometheus │  │    Loki     │  │   Jaeger    │          │
│  │  (Metrics)  │  │   (Logs)    │  │  (Traces)   │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│                   ┌──────▼──────┐                            │
│                   │   Grafana   │                            │
│                   │ (Dashboards)│                            │
│                   └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Key Metrics

**Routing Service**
- `routing_decisions_total` - Total routing decisions
- `routing_accuracy_ratio` - Correct routing percentage
- `routing_latency_seconds` - Decision latency histogram

**AI Assistant**
- `assistant_requests_total` - Total requests
- `assistant_tokens_used` - Token consumption
- `assistant_response_latency` - Response time

**Self-Healing**
- `selfhealing_issues_detected` - Issues detected
- `selfhealing_actions_executed` - Automated actions
- `selfhealing_success_rate` - Action success rate

**Compliance**
- `compliance_violations_total` - Total violations
- `compliance_score_gauge` - Current compliance score
- `sla_breach_count` - SLA breaches

### Alerting Rules

```yaml
groups:
  - name: operate-tier-alerts
    rules:
      - alert: HighRoutingLatency
        expr: histogram_quantile(0.99, routing_latency_seconds) > 0.5
        for: 5m
        labels:
          severity: warning

      - alert: LowComplianceScore
        expr: compliance_score_gauge < 70
        for: 15m
        labels:
          severity: critical

      - alert: SelfHealingFailure
        expr: rate(selfhealing_actions_failed[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
```

---

## Deployment Architecture

### Container Structure

```dockerfile
# Base image for all services
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Service-specific images
FROM base AS routing-service
COPY dist/services/routing ./
CMD ["node", "index.js"]

FROM base AS assistant-service
COPY dist/services/assistant ./
CMD ["node", "index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: routing-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: routing-service
  template:
    spec:
      containers:
        - name: routing
          image: foundry/routing-service:latest
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
```

### Environment Configuration

```env
# Core
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
TIMESCALE_URL=postgresql://...

# AI
ANTHROPIC_API_KEY=sk-...
CLAUDE_MODEL=claude-3-sonnet-20240229

# Feature Flags
ENABLE_AI_ROUTING=true
ENABLE_AUTO_HEALING=true
ENABLE_COMPLIANCE_AUTOMATION=true
```

---

## Future Considerations

1. **Multi-Region Deployment**: Active-active setup for global operations
2. **ML Model Training**: Custom models for routing and anomaly detection
3. **Advanced Analytics**: Predictive insights using historical data
4. **Plugin Architecture**: Extensibility for custom integrations
5. **Mobile App**: Native mobile experience for operators

---

## References

- [API Documentation](./operate-tier-api.md)
- [Database Schema](./database-schema.md)
- [Deployment Guide](./deployment-guide.md)
- [Security Policies](./security-policies.md)
