<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge" alt="License" />
</p>

<h1 align="center">Foundry</h1>

<p align="center">
  <strong>Enterprise AI-First Operations Platform</strong>
</p>

<p align="center">
  Transform your business operations with intelligent automation, AI-powered insights, and seamless integrations.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-documentation">Docs</a> •
  <a href="#-security">Security</a>
</p>

---

## Why Foundry?

| Challenge | Foundry Solution |
|-----------|-----------------|
| **Information Silos** | Unified data layer connecting 10+ enterprise systems |
| **Manual Routing** | AI-powered intelligent request routing with 95%+ accuracy |
| **Reactive Operations** | Proactive monitoring with predictive insights |
| **Knowledge Loss** | Automated documentation and institutional knowledge capture |
| **Compliance Burden** | Built-in GDPR, SOX, ISO 27001 compliance tools |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/aliuyar1234/Foundry.git
cd Foundry

# Set up environment
cp .env.example .env

# Start infrastructure
docker-compose up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Initialize database
cd ../backend
npx prisma generate
npx prisma db push

# Start development servers
npm run dev  # Backend on :3000
cd ../frontend && npm run dev  # Frontend on :5173
```

---

## Features

### Core Platform

<table>
<tr>
<td width="50%">

#### Intelligent Routing Engine
- AI-powered request classification (NLP)
- Expertise matching with confidence scoring
- Workload balancing with capacity awareness
- Automatic escalation management
- Explainable routing decisions

</td>
<td width="50%">

#### AI Operations Assistant
- Natural language interface
- Multi-language support (auto-detection)
- Context-aware responses
- Citation & source verification
- Permission-aware data access

</td>
</tr>
<tr>
<td width="50%">

#### Enterprise Command Center
- Real-time dashboards with drill-down
- Trend analysis & anomaly detection
- Multi-channel alert management
- Bottleneck identification
- Customizable widget layouts

</td>
<td width="50%">

#### Process Discovery & Mining
- Automated process extraction
- BPMN export capability
- Conformance checking
- SLA compliance tracking
- Deviation detection & alerts

</td>
</tr>
</table>

### Data Connectors

| Category | Integrations |
|----------|--------------|
| **Productivity** | Microsoft 365, Google Workspace, Slack |
| **CRM** | Salesforce, HubSpot |
| **ERP** | SAP Business One, Odoo |
| **Accounting** | DATEV, BMD (Austrian) |
| **DMS** | DocuWare, M-Files |

### Enterprise Features (SCALE Tier)

<details>
<summary><strong>Multi-Entity Organization</strong></summary>

- Hierarchical entity management (holding companies, subsidiaries)
- Row-Level Security (RLS) for complete data isolation
- Cross-entity analytics with drill-down
- Entity-specific configuration & branding
- GDPR-compliant entity-scoped deletion
</details>

<details>
<summary><strong>Partner API & Ecosystem</strong></summary>

- OAuth 2.0 authentication
- OpenAPI 3.0 interactive documentation
- Webhook system with HMAC signing
- Tiered rate limiting (100/hr - 10,000/hr)
- Self-service developer portal
</details>

<details>
<summary><strong>White-Label & Reseller</strong></summary>

- Complete branding control (logos, colors, CSS)
- Custom domain support with SSL
- Reseller portal with customer management
- Revenue tracking & commission calculation
- Multi-tenant branding isolation
</details>

<details>
<summary><strong>Enterprise SSO</strong></summary>

- SAML 2.0 (Azure AD, Okta)
- OpenID Connect (OIDC)
- SCIM 2.0 user provisioning
- Group-based role mapping
- Session management & forced logout
</details>

<details>
<summary><strong>On-Premise Deployment</strong></summary>

- Docker Compose production deployment
- Kubernetes Helm charts
- Air-gapped installation support
- External database connectivity
- Offline license validation
</details>

---

## Architecture

<p align="center">
  <img src="./docs/architecture/Foundry-architecture.png" alt="Foundry Architecture" width="100%" />
</p>

---

## Tech Stack

<table>
<tr>
<td>

### Backend
| Tech | Version |
|------|---------|
| Node.js | 18+ |
| TypeScript | 5.x |
| Fastify | 4.x |
| Prisma | 5.x |
| BullMQ | 4.x |

</td>
<td>

### Frontend
| Tech | Version |
|------|---------|
| React | 18 |
| TypeScript | 5.x |
| Tailwind CSS | 3.x |
| React Query | 5.x |
| Vite | 6.x |

</td>
<td>

### Databases
| Tech | Purpose |
|------|---------|
| PostgreSQL | Primary DB |
| TimescaleDB | Time-series |
| Neo4j | Graph DB |
| Redis | Cache/Queue |
| Qdrant | Vectors |

</td>
</tr>
</table>

### AI/ML
- **Claude (Anthropic)** - LLM for assistant and analysis
- **OpenAI** - Embeddings generation
- **Custom ML** - Routing and prediction models

---

## Security

Foundry implements enterprise-grade security with A++ hardening:

| Layer | Protection |
|-------|------------|
| **Authentication** | JWT via JWKS (Auth0 compatible) |
| **Authorization** | RBAC with role hierarchy (VIEWER → OWNER) |
| **Rate Limiting** | Redis-backed sliding window (configurable tiers) |
| **Input Validation** | 50+ Fastify JSON schemas |
| **SQL Injection** | Parameterized queries + whitelist |
| **Credentials** | AES-256-GCM encryption |
| **Token Revocation** | Redis-backed blacklist (fail-closed) |
| **Security Headers** | CSP, HSTS, X-Frame-Options, etc. |
| **Circuit Breakers** | Resilience pattern for external services |
| **Audit Logging** | SIEM-compatible with severity levels |
| **Dependencies** | 0 known vulnerabilities |

---

## Project Structure

```
foundry/
├── backend/
│   ├── prisma/                 # Database schema & migrations
│   ├── src/
│   │   ├── api/
│   │   │   ├── middleware/     # Auth, rate limiting, validation
│   │   │   └── routes/         # API endpoints
│   │   ├── connectors/         # External integrations
│   │   │   ├── m365/           # Microsoft 365
│   │   │   ├── google/         # Google Workspace
│   │   │   ├── salesforce/     # Salesforce CRM
│   │   │   ├── sap-b1/         # SAP Business One
│   │   │   ├── datev/          # DATEV
│   │   │   ├── bmd/            # BMD (Austrian)
│   │   │   └── dms/            # DocuWare, M-Files
│   │   ├── services/
│   │   │   ├── assistant/      # AI assistant
│   │   │   ├── routing/        # Intelligent routing
│   │   │   ├── compliance/     # Compliance checks
│   │   │   ├── security/       # Token revocation, encryption
│   │   │   └── audit/          # Audit logging
│   │   └── lib/                # Shared utilities
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom hooks
│   │   └── stores/             # State management
│   └── tests/
├── docs/                       # Documentation
└── docker-compose.yml          # Infrastructure
```

---

## API Overview

### Core Endpoints

```http
# Routing
POST   /api/v1/routing/route           # Route a request
GET    /api/v1/routing/decisions       # Routing history
GET    /api/v1/routing/analytics       # Analytics

# AI Assistant
POST   /api/v1/assistant/chat          # Send message
GET    /api/v1/assistant/conversations # List conversations

# Command Center
GET    /api/v1/command-center/metrics  # Aggregated metrics
GET    /api/v1/command-center/alerts   # Active alerts
GET    /api/v1/command-center/stream   # SSE real-time

# Process Discovery
GET    /api/v1/discovery/processes     # List processes
POST   /api/v1/discovery/mine          # Start discovery

# Health
GET    /api/v1/health                  # Health check + circuit breaker stats
```

### Authentication

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.foundry.example.com/api/v1/routing/route
```

---

## Configuration

### Required Environment Variables

```bash
# Database (REQUIRED)
DATABASE_URL=postgresql://user:pass@localhost:5432/foundry
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<secure-password>

# Security (REQUIRED in production)
CREDENTIAL_MASTER_KEY=<64-hex-chars>  # openssl rand -hex 32

# Authentication
AUTH_DOMAIN=your-auth0-domain.auth0.com
AUTH_AUDIENCE=your-api-audience

# Redis (recommended)
REDIS_URL=redis://localhost:6379

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## Deployment

### Docker Compose

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes (Helm)

```bash
helm install foundry ./deployment/kubernetes/helm/foundry \
  --set postgresql.external.enabled=true \
  --set postgresql.external.host=your-db-host
```

### System Requirements

| Component | Minimum | Recommended | Enterprise |
|-----------|---------|-------------|------------|
| CPU | 4 cores | 8 cores | 16+ cores |
| RAM | 16 GB | 32 GB | 64+ GB |
| Storage | 100 GB SSD | 500 GB SSD | 1+ TB SSD |

---

## Development

```bash
# Lint
npm run lint

# Test
npm test

# Test with coverage
npm run test:coverage

# Database migrations
cd backend
npx prisma migrate dev --name <description>
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](./docs/api/) | Complete API documentation |
| [Architecture](./docs/architecture/) | System design & patterns |
| [Deployment Guide](./docs/deployment/) | Production deployment |
| [MCP Setup](./docs/mcp-setup.md) | Model Context Protocol |

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary software. All rights reserved.

---

## Author

**Ali Uyar**

[![Email](https://img.shields.io/badge/Email-ali.uyar1%40hotmail.com-blue?style=flat-square&logo=microsoft-outlook)](mailto:ali.uyar1@hotmail.com)
[![GitHub](https://img.shields.io/badge/GitHub-aliuyar1234-181717?style=flat-square&logo=github)](https://github.com/aliuyar1234)

---

<p align="center">
  <sub>Built for the AI-first enterprise</sub>
</p>
