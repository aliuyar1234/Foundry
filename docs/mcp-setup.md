# MCP Server Setup Guide

This document explains how to configure and use the Foundry MCP (Model Context Protocol) server with Claude Desktop and other MCP-compatible clients.

## Overview

The Foundry MCP server exposes organizational knowledge and tools to AI assistants like Claude. It provides:

- **Tools**: Search organization, query knowledge graph, analyze decisions
- **Resources**: Access to processes, people, and documents
- **Security**: Session-based authentication with scoped permissions

## Prerequisites

1. Foundry backend running with:
   - PostgreSQL database
   - Redis for session caching
   - Neo4j for knowledge graph (optional but recommended)

2. Node.js 18+ installed

3. Claude Desktop or compatible MCP client

## Configuration Methods

### Method 1: Claude Desktop Integration (Stdio Transport)

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "foundry": {
      "command": "node",
      "args": [
        "/path/to/foundry/backend/dist/mcp-server.js",
        "--userId=your-user-id",
        "--tenantId=your-tenant-id"
      ],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/foundry",
        "REDIS_URL": "redis://localhost:6379",
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "password"
      }
    }
  }
}
```

### Method 2: HTTP/SSE Transport (Web Clients)

For web-based integrations, use the HTTP endpoints:

```
Base URL: http://localhost:3000/mcp
```

#### Create a Session

```bash
curl -X POST http://localhost:3000/api/v1/mcp/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientName": "my-client",
    "scopes": ["foundry:read:org", "foundry:read:graph"],
    "ttlSeconds": 3600
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "sessionId": "mcp_abc123...",
    "expiresAt": "2024-01-01T12:00:00Z",
    "scopes": ["foundry:read:org", "foundry:read:graph"]
  }
}
```

#### Use the Session

Include the session ID in requests:

```bash
curl http://localhost:3000/mcp/tools \
  -H "Authorization: Bearer mcp_abc123..."
```

## Available Tools

### search_organization

Search across all organizational knowledge.

```json
{
  "name": "search_organization",
  "arguments": {
    "query": "onboarding process",
    "types": ["process", "document"],
    "limit": 10
  }
}
```

### get_person

Get details about a person.

```json
{
  "name": "get_person",
  "arguments": {
    "personId": "person-uuid"
  }
}
```

### get_process

Get details about a process.

```json
{
  "name": "get_process",
  "arguments": {
    "processId": "process-uuid"
  }
}
```

### list_documents

List documents with optional filtering.

```json
{
  "name": "list_documents",
  "arguments": {
    "type": "sop",
    "limit": 20
  }
}
```

### query_graph

Execute read-only Cypher queries against the knowledge graph.

```json
{
  "name": "query_graph",
  "arguments": {
    "query": "MATCH (p:Person)-[:OWNS]->(proc:Process) RETURN p.name, proc.name LIMIT 10"
  }
}
```

**Security Note**: Only read operations (MATCH, RETURN) are allowed. Write operations are blocked.

### analyze_decision

Get AI analysis of a decision.

```json
{
  "name": "analyze_decision",
  "arguments": {
    "decisionId": "decision-uuid"
  }
}
```

## Available Resources

Resources are accessed via URIs:

| URI Pattern | Description |
|-------------|-------------|
| `foundry://processes` | List all processes |
| `foundry://processes/{id}` | Get specific process |
| `foundry://people` | List all people |
| `foundry://people/{id}` | Get specific person |
| `foundry://documents` | List all documents |
| `foundry://documents/{id}` | Get specific document |

## Scopes

Sessions require scopes to access different features:

| Scope | Description |
|-------|-------------|
| `foundry:read:org` | Read organization data |
| `foundry:read:graph` | Query knowledge graph |
| `foundry:read:docs` | Read documents |
| `foundry:write:docs` | Create/update documents |
| `foundry:analyze` | Run AI analysis |
| `foundry:admin:all` | Full administrative access |

### Scope Groups

For convenience, use predefined scope groups:

- **STANDARD**: `read:org`, `read:graph`, `read:docs`
- **ANALYST**: Standard + `analyze`
- **FULL_ACCESS**: All scopes

## Rate Limiting

Sessions have rate limits to prevent abuse:

- **Default**: 100 requests per minute
- **Per-tool limits**:
  - `analyze_decision`: 10/minute
  - `query_graph`: 30/minute
  - Others: 100/minute

Rate limit headers are included in HTTP responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704110400
```

## Audit Logging

All tool calls are logged for compliance:

```json
{
  "id": "audit-uuid",
  "sessionId": "mcp_abc123...",
  "userId": "user-uuid",
  "toolName": "search_organization",
  "parameters": { "query": "..." },
  "success": true,
  "durationMs": 150,
  "timestamp": "2024-01-01T10:00:00Z"
}
```

Access audit logs via API:

```bash
curl http://localhost:3000/api/v1/mcp/audit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

### Session Expired

```json
{ "error": "Session expired" }
```

Create a new session or use `--createSession` flag for stdio server.

### Rate Limited

```json
{ "error": "Rate limit exceeded", "resetAt": "2024-01-01T10:01:00Z" }
```

Wait until the reset time or reduce request frequency.

### Scope Denied

```json
{ "error": "Access denied: Missing required scope for query_graph" }
```

Request a new session with the required scopes.

### Connection Issues

1. Verify the backend is running: `curl http://localhost:3000/health`
2. Check Redis is accessible: `redis-cli ping`
3. Verify database connection in logs
4. For stdio, check stderr output for session info

## Development

### Running the MCP Server Standalone

```bash
# Build the backend
cd backend
npm run build

# Run with stdio transport
node dist/mcp-server.js --userId=dev-user --tenantId=default

# Or with custom session
node dist/mcp-server.js --sessionId=existing-session-id
```

### Testing Tools

Use the MCP Inspector or Claude Desktop to test tools interactively.

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Connect to running server
mcp-inspector stdio node dist/mcp-server.js
```

## Security Best Practices

1. **Limit Scopes**: Only request scopes your application needs
2. **Short TTL**: Use short session TTLs for untrusted clients
3. **Rotate Sessions**: Create new sessions periodically
4. **Monitor Audit Logs**: Review logs for suspicious activity
5. **Network Security**: Use HTTPS for HTTP transport in production
6. **Environment Variables**: Never commit credentials to source control
