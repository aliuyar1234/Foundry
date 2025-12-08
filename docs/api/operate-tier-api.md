# OPERATE Tier API Documentation

This document provides comprehensive API documentation for the Foundry OPERATE tier, covering intelligent routing, AI assistant, self-healing automation, compliance monitoring, and workload management.

## Table of Contents

1. [Authentication](#authentication)
2. [Task Routing API](#task-routing-api)
3. [AI Assistant API](#ai-assistant-api)
4. [Self-Healing API](#self-healing-api)
5. [Compliance API](#compliance-api)
6. [Workload Management API](#workload-management-api)
7. [WebSocket Events](#websocket-events)
8. [Error Handling](#error-handling)

---

## Authentication

All API endpoints require authentication using Bearer tokens.

```http
Authorization: Bearer <access_token>
```

### Scopes

| Scope | Description |
|-------|-------------|
| `routing:read` | Read routing rules and decisions |
| `routing:write` | Create/update routing rules |
| `assistant:use` | Use AI assistant |
| `selfhealing:read` | View self-healing status |
| `selfhealing:manage` | Manage playbooks and actions |
| `compliance:read` | View compliance status |
| `compliance:manage` | Manage compliance rules |
| `workload:read` | View workload metrics |
| `workload:manage` | Manage workload settings |

---

## Task Routing API

### Endpoints

#### GET /api/v1/routing/rules

List all routing rules for the organization.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | boolean | Filter by enabled status |
| `type` | string | Filter by rule type |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "rules": [
    {
      "id": "rule_abc123",
      "name": "High Priority Support",
      "description": "Route high priority tickets to senior support",
      "priority": 100,
      "enabled": true,
      "conditions": {
        "all": [
          { "field": "priority", "operator": "equals", "value": "high" },
          { "field": "type", "operator": "equals", "value": "support" }
        ]
      },
      "actions": {
        "assignTeam": "senior-support",
        "setUrgency": "high"
      },
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 25,
  "limit": 50,
  "offset": 0
}
```

#### POST /api/v1/routing/rules

Create a new routing rule.

**Request Body:**
```json
{
  "name": "VIP Customer Routing",
  "description": "Route VIP customer requests to dedicated team",
  "priority": 150,
  "enabled": true,
  "conditions": {
    "all": [
      { "field": "customerTier", "operator": "equals", "value": "vip" }
    ]
  },
  "actions": {
    "assignTeam": "vip-support",
    "setUrgency": "high",
    "notify": ["vip-manager@example.com"]
  }
}
```

#### PUT /api/v1/routing/rules/:ruleId

Update an existing routing rule.

#### DELETE /api/v1/routing/rules/:ruleId

Delete a routing rule.

#### POST /api/v1/routing/route

Route a task using the configured rules.

**Request Body:**
```json
{
  "taskId": "task_xyz789",
  "type": "support",
  "priority": "high",
  "source": "email",
  "metadata": {
    "customerTier": "enterprise",
    "subject": "Integration issue"
  }
}
```

**Response:**
```json
{
  "taskId": "task_xyz789",
  "decision": {
    "assignedTeam": "senior-support",
    "assignedUser": "user_abc123",
    "matchedRule": "rule_abc123",
    "confidence": 0.95,
    "factors": {
      "ruleMatch": 0.4,
      "skillMatch": 0.3,
      "availability": 0.25,
      "historical": 0.05
    }
  },
  "routedAt": "2024-01-15T10:35:00Z"
}
```

#### GET /api/v1/routing/metrics

Get routing performance metrics.

**Response:**
```json
{
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "totalRouted": 1250,
  "accuracy": 92.5,
  "avgRoutingTimeMs": 145,
  "byTeam": {
    "support": { "count": 800, "accuracy": 94.2 },
    "billing": { "count": 300, "accuracy": 89.1 },
    "technical": { "count": 150, "accuracy": 91.8 }
  },
  "reassignmentRate": 7.5
}
```

---

## AI Assistant API

### Endpoints

#### POST /api/v1/assistant/sessions

Create a new chat session.

**Response:**
```json
{
  "sessionId": "session_abc123",
  "createdAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-15T11:30:00Z"
}
```

#### POST /api/v1/assistant/chat

Send a message to the AI assistant.

**Request Body:**
```json
{
  "sessionId": "session_abc123",
  "message": "What is the current team workload?",
  "context": {
    "currentPage": "/dashboard",
    "selectedTeam": "team_xyz"
  }
}
```

**Response:**
```json
{
  "messageId": "msg_def456",
  "response": "Based on current data, the team has a 78% utilization rate...",
  "suggestions": [
    "View detailed workload breakdown",
    "See individual team member status",
    "Forecast next week's capacity"
  ],
  "actions": [
    {
      "label": "View Dashboard",
      "action": "navigate",
      "target": "/workload/dashboard"
    }
  ],
  "usage": {
    "inputTokens": 150,
    "outputTokens": 200
  }
}
```

#### GET /api/v1/assistant/sessions/:sessionId/history

Get conversation history for a session.

#### DELETE /api/v1/assistant/sessions/:sessionId

End a chat session.

#### GET /api/v1/assistant/usage

Get AI assistant usage statistics.

---

## Self-Healing API

### Endpoints

#### GET /api/v1/selfhealing/status

Get current system health status.

**Response:**
```json
{
  "overallHealth": 92,
  "status": "healthy",
  "components": [
    {
      "name": "api",
      "health": 95,
      "status": "healthy",
      "metrics": {
        "latencyP99": 250,
        "errorRate": 0.1
      }
    },
    {
      "name": "database",
      "health": 88,
      "status": "warning",
      "metrics": {
        "connectionPoolUsage": 85,
        "queryLatencyAvg": 45
      }
    }
  ],
  "activeIssues": 2,
  "lastCheck": "2024-01-15T10:30:00Z"
}
```

#### GET /api/v1/selfhealing/issues

List detected issues.

**Response:**
```json
{
  "issues": [
    {
      "id": "issue_abc123",
      "type": "high_latency",
      "severity": "warning",
      "component": "api",
      "detectedAt": "2024-01-15T10:25:00Z",
      "status": "investigating",
      "metrics": {
        "current": 350,
        "threshold": 200,
        "baseline": 150
      }
    }
  ],
  "total": 2
}
```

#### GET /api/v1/selfhealing/playbooks

List available playbooks.

#### POST /api/v1/selfhealing/playbooks

Create a new playbook.

**Request Body:**
```json
{
  "name": "High CPU Response",
  "description": "Automated response to high CPU usage",
  "trigger": {
    "type": "threshold",
    "metric": "cpu_usage",
    "condition": "greaterThan",
    "value": 80
  },
  "steps": [
    {
      "action": "notify",
      "params": { "channel": "ops-alerts" }
    },
    {
      "action": "scale_up",
      "params": { "instances": 1 },
      "condition": "metric > 90"
    }
  ],
  "cooldown": 300
}
```

#### POST /api/v1/selfhealing/actions/:actionId/execute

Manually execute a remediation action.

#### POST /api/v1/selfhealing/actions/:actionId/rollback

Rollback a previous action.

#### GET /api/v1/selfhealing/actions/history

Get action execution history.

---

## Compliance API

### Endpoints

#### GET /api/v1/compliance/rules

List compliance rules.

**Response:**
```json
{
  "rules": [
    {
      "id": "rule_sla_001",
      "name": "Response Time SLA",
      "type": "sla",
      "severity": "high",
      "enabled": true,
      "conditions": [
        {
          "field": "responseTime",
          "operator": "greaterThan",
          "value": 3600
        }
      ],
      "gracePeriod": 300,
      "actions": {
        "escalate": true,
        "notify": ["compliance@example.com"]
      }
    }
  ]
}
```

#### POST /api/v1/compliance/rules

Create a new compliance rule.

#### GET /api/v1/compliance/violations

List compliance violations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (open, resolved, waived) |
| `severity` | string | Filter by severity |
| `type` | string | Filter by rule type |
| `startDate` | datetime | Start of date range |
| `endDate` | datetime | End of date range |

**Response:**
```json
{
  "violations": [
    {
      "id": "viol_abc123",
      "ruleId": "rule_sla_001",
      "ruleName": "Response Time SLA",
      "severity": "high",
      "status": "open",
      "detectedAt": "2024-01-15T10:30:00Z",
      "details": {
        "taskId": "task_xyz",
        "actualValue": 5400,
        "threshold": 3600,
        "breachAmount": 1800
      },
      "remediation": {
        "status": "pending",
        "suggestedAction": "escalate_to_manager"
      }
    }
  ],
  "summary": {
    "total": 15,
    "bySeverity": {
      "critical": 2,
      "high": 5,
      "medium": 8
    }
  }
}
```

#### POST /api/v1/compliance/violations/:violationId/acknowledge

Acknowledge a violation.

#### POST /api/v1/compliance/violations/:violationId/resolve

Mark a violation as resolved.

#### POST /api/v1/compliance/violations/:violationId/waive

Waive a violation with justification.

#### GET /api/v1/compliance/score

Get compliance score and summary.

**Response:**
```json
{
  "score": 87.5,
  "grade": "B",
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "breakdown": {
    "sla": { "score": 92, "weight": 0.4 },
    "security": { "score": 85, "weight": 0.3 },
    "data": { "score": 82, "weight": 0.2 },
    "operational": { "score": 88, "weight": 0.1 }
  },
  "trend": {
    "direction": "improving",
    "change": 3.2
  }
}
```

#### GET /api/v1/compliance/reports

Generate compliance report.

---

## Workload Management API

### Endpoints

#### GET /api/v1/workload/overview

Get workload overview for the organization.

**Response:**
```json
{
  "summary": {
    "totalCapacity": 1600,
    "utilizedCapacity": 1280,
    "availableCapacity": 320,
    "utilizationRate": 80
  },
  "teams": [
    {
      "teamId": "team_abc",
      "name": "Engineering",
      "memberCount": 10,
      "utilization": 85,
      "burnoutRisk": "low"
    }
  ],
  "alerts": [
    {
      "type": "high_utilization",
      "severity": "warning",
      "message": "3 team members approaching capacity",
      "affectedMembers": ["user_1", "user_2", "user_3"]
    }
  ]
}
```

#### GET /api/v1/workload/members

Get individual member workload data.

**Response:**
```json
{
  "members": [
    {
      "userId": "user_abc123",
      "name": "Alice Smith",
      "teamId": "team_xyz",
      "workload": {
        "activeTasks": 8,
        "totalHours": 32,
        "capacity": 40,
        "utilization": 80
      },
      "burnout": {
        "score": 35,
        "level": "low",
        "factors": []
      },
      "metrics": {
        "completedThisWeek": 5,
        "avgTaskDuration": 6.4,
        "overdueTasks": 0
      }
    }
  ]
}
```

#### GET /api/v1/workload/forecast

Get workload forecast.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `weeksAhead` | number | Number of weeks to forecast (1-12) |
| `teamId` | string | Filter by team |

**Response:**
```json
{
  "forecast": [
    {
      "week": 1,
      "startDate": "2024-01-22",
      "predicted": {
        "totalHours": 1350,
        "utilization": 84
      },
      "confidence": 0.85,
      "factors": {
        "plannedPto": 40,
        "scheduledProjects": 200,
        "historicalTrend": 0.02
      }
    }
  ]
}
```

#### GET /api/v1/workload/burnout

Get burnout risk assessment.

**Response:**
```json
{
  "atRisk": [
    {
      "userId": "user_xyz",
      "name": "Bob Johnson",
      "riskScore": 72,
      "riskLevel": "high",
      "factors": [
        "excessive_overtime",
        "weekend_work",
        "no_recent_pto"
      ],
      "recommendations": [
        "Redistribute 2-3 tasks to reduce load",
        "Encourage taking PTO within next 2 weeks"
      ]
    }
  ],
  "summary": {
    "criticalRisk": 1,
    "highRisk": 3,
    "mediumRisk": 5,
    "lowRisk": 20
  }
}
```

#### POST /api/v1/workload/rebalance

Suggest workload rebalancing.

**Request Body:**
```json
{
  "teamId": "team_abc",
  "strategy": "least_busy",
  "constraints": {
    "preserveSkillMatch": true,
    "maxTransfersPerPerson": 3
  }
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "taskId": "task_123",
      "from": "user_overloaded",
      "to": "user_available",
      "reason": "Skill match: 85%, reduces overload",
      "impact": {
        "fromUtilization": { "before": 120, "after": 95 },
        "toUtilization": { "before": 60, "after": 85 }
      }
    }
  ],
  "summary": {
    "tasksToReassign": 5,
    "projectedImprovement": 15
  }
}
```

#### GET /api/v1/workload/meetings

Analyze meeting load.

#### PUT /api/v1/workload/settings

Update workload settings.

---

## WebSocket Events

Connect to the WebSocket endpoint for real-time updates:

```
wss://api.foundry.example.com/ws?token=<access_token>
```

### Events

#### routing.decision
Emitted when a task is routed.

```json
{
  "event": "routing.decision",
  "data": {
    "taskId": "task_abc",
    "assignedTo": "user_xyz",
    "confidence": 0.92
  }
}
```

#### selfhealing.issue.detected
Emitted when an issue is detected.

```json
{
  "event": "selfhealing.issue.detected",
  "data": {
    "issueId": "issue_abc",
    "type": "high_latency",
    "severity": "warning"
  }
}
```

#### selfhealing.action.executed
Emitted when an automated action is executed.

#### compliance.violation.detected
Emitted when a compliance violation is detected.

#### workload.alert.triggered
Emitted when a workload alert is triggered.

---

## Error Handling

All API errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "priority",
        "message": "Must be one of: low, medium, high, critical"
      }
    ]
  },
  "requestId": "req_abc123"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limits

| Endpoint Category | Limit |
|-------------------|-------|
| Routing decisions | 100/min |
| AI Assistant | 30/min |
| Self-healing actions | 10/min |
| Compliance queries | 60/min |
| Workload queries | 60/min |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
