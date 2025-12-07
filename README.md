# Foundry

**Enterprise AI-First Operations Platform**

Foundry is a comprehensive enterprise platform that leverages artificial intelligence to transform business operations. It provides intelligent routing, real-time operational insights, AI-powered assistance, and automated process optimization for modern organizations.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

---

## Overview

Foundry addresses the critical challenges modern enterprises face in managing complex operations:

- **Information Silos**: Unified data layer connecting disparate business systems
- **Manual Routing**: AI-powered intelligent request routing to the right person
- **Reactive Operations**: Proactive monitoring with predictive insights
- **Knowledge Loss**: Automated documentation and institutional knowledge capture
- **Compliance Burden**: Automated compliance monitoring and reporting

---

## Features

### Intelligent Routing Engine
- **AI-Powered Classification**: Automatically categorizes incoming requests using NLP
- **Expertise Matching**: Routes to team members based on skills, experience, and past performance
- **Workload Balancing**: Distributes work evenly while respecting capacity constraints
- **Escalation Management**: Automatic escalation paths with configurable rules
- **Confidence Scoring**: Transparent routing decisions with explainable AI

### AI Operations Assistant
- **Natural Language Interface**: Query your business data conversationally
- **Multi-Language Support**: Automatic language detection and response
- **Context-Aware Responses**: Understands organizational context and terminology
- **Citation & Sources**: Every response backed by verifiable data sources
- **Permission-Aware**: Respects data access controls in all responses

### Enterprise Command Center
- **Real-Time Dashboards**: Live operational metrics with drill-down capability
- **Trend Analysis**: Pattern detection, predictions, and anomaly alerts
- **Alert Management**: Configurable thresholds with multi-channel notifications
- **Bottleneck Detection**: Identifies process, resource, and approval bottlenecks
- **Customizable Widgets**: Personalized dashboard layouts and views

### Process Discovery & Mining
- **Automated Process Discovery**: Extracts processes from event logs
- **BPMN Export**: Generate standard process diagrams
- **Conformance Checking**: Compare actual vs. expected process flows
- **Process Health Metrics**: SLA compliance, cycle times, bottleneck analysis
- **Deviation Detection**: Identify and alert on process anomalies

### Data Connectors
Seamless integration with enterprise systems:

| Category | Connectors |
|----------|------------|
| **Productivity** | Microsoft 365, Google Workspace, Slack |
| **CRM** | Salesforce, HubSpot |
| **ERP** | SAP Business One, Odoo |
| **Accounting** | DATEV, BMD |

### Advanced Analytics
- **Network Analysis**: Discover informal communication patterns and hidden influencers
- **Bus Factor Analysis**: Identify knowledge concentration risks
- **Organizational Debt Scoring**: Quantify process, knowledge, and technical debt
- **Predictive Insights**: ML-powered forecasting and risk prediction
- **What-If Simulations**: Model organizational changes before implementation

### Privacy & Compliance
- **Data Anonymization**: Configurable PII protection
- **Audit Logging**: Complete trail of all data access
- **GDPR Support**: Built-in data subject rights management
- **Role-Based Access**: Granular permission controls
- **Metadata Mode**: Analyze patterns without exposing content

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React 18)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  Command    │ │    AI       │ │  Routing    │ │  Discovery  │   │
│  │  Center     │ │  Assistant  │ │  Dashboard  │ │  Views      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API Gateway (Express)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │    Auth     │ │    Rate     │ │   Caching   │ │ Validation  │   │
│  │ Middleware  │ │   Limiting  │ │  (Redis)    │ │             │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Service Layer                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Routing Engine  │  │  AI Assistant    │  │  Command Center  │  │
│  │  - Categorizer   │  │  - Chat Service  │  │  - Metrics Agg   │  │
│  │  - Matcher       │  │  - Context       │  │  - Alerts        │  │
│  │  - Balancer      │  │  - Formatter     │  │  - Trends        │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Process Mining  │  │  Network Analysis│  │   Connectors     │  │
│  │  - Discovery     │  │  - Centrality    │  │  - M365/Google   │  │
│  │  - Conformance   │  │  - Communities   │  │  - Salesforce    │  │
│  │  - Metrics       │  │  - Patterns      │  │  - SAP/DATEV     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Layer                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ PostgreSQL  │ │   Neo4j     │ │   Redis     │ │  Qdrant     │   │
│  │   + Prisma  │ │  (Graph)    │ │  (Cache)    │ │  (Vectors)  │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐   │
│  │       TimescaleDB           │ │        BullMQ               │   │
│  │    (Time-Series Metrics)    │ │     (Job Queue)             │   │
│  └─────────────────────────────┘ └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **TypeScript** | Type-safe development |
| **Express** | HTTP server and routing |
| **Prisma** | Database ORM |
| **BullMQ** | Background job processing |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type-safe development |
| **Tailwind CSS** | Utility-first styling |
| **React Query** | Server state management |
| **Vite** | Build tool and dev server |

### Databases
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary relational database |
| **TimescaleDB** | Time-series metrics storage |
| **Neo4j** | Graph database for relationships |
| **Redis** | Caching and pub/sub |
| **Qdrant** | Vector database for embeddings |

### AI/ML
| Technology | Purpose |
|------------|---------|
| **Claude (Anthropic)** | LLM for assistant and analysis |
| **OpenAI** | Embeddings generation |
| **Custom ML** | Routing and prediction models |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **Docker** | Containerization |
| **Docker Compose** | Local orchestration |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/aliuyar1234/Foundry.git
   cd Foundry
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start infrastructure services**
   ```bash
   docker-compose up -d
   ```

4. **Install dependencies**
   ```bash
   # Root dependencies
   npm install

   # Backend dependencies
   cd backend && npm install

   # Frontend dependencies
   cd ../frontend && npm install
   ```

5. **Set up the database**
   ```bash
   cd backend
   npx prisma generate
   npx prisma db push
   ```

6. **Start the development servers**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev

   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```

7. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - API Documentation: http://localhost:3000/api/docs

---

## Project Structure

```
foundry/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema
│   │   └── timescale/             # TimescaleDB migrations
│   ├── src/
│   │   ├── api/
│   │   │   ├── middleware/        # Auth, rate limiting, etc.
│   │   │   └── routes/            # API endpoints
│   │   ├── connectors/            # External system integrations
│   │   │   ├── m365/              # Microsoft 365
│   │   │   ├── google/            # Google Workspace
│   │   │   ├── salesforce/        # Salesforce CRM
│   │   │   ├── hubspot/           # HubSpot
│   │   │   ├── sap-b1/            # SAP Business One
│   │   │   ├── datev/             # DATEV
│   │   │   ├── bmd/               # BMD
│   │   │   └── slack/             # Slack
│   │   ├── graph/                 # Neo4j graph models
│   │   ├── jobs/                  # Background job processors
│   │   ├── lib/                   # Shared utilities
│   │   ├── models/                # Data models
│   │   ├── services/
│   │   │   ├── assistant/         # AI assistant service
│   │   │   ├── commandCenter/     # Command center metrics
│   │   │   ├── routing/           # Intelligent routing
│   │   │   ├── analysis/          # Network & debt analysis
│   │   │   ├── discovery/         # Process discovery
│   │   │   ├── privacy/           # Privacy controls
│   │   │   └── ...
│   │   └── server.ts              # Application entry point
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── assistant/         # AI chat components
│   │   │   ├── command-center/    # Dashboard widgets
│   │   │   ├── routing/           # Routing UI
│   │   │   ├── discovery/         # Process visualization
│   │   │   └── ui/                # Base UI components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── pages/                 # Page components
│   │   ├── services/              # API clients
│   │   └── stores/                # State management
│   └── tests/
├── shared/
│   └── src/
│       └── types/                 # Shared TypeScript types
├── docs/                          # Documentation
├── docker-compose.yml             # Docker services
└── package.json                   # Root package.json
```

---

## API Documentation

### Core Endpoints

#### Routing
```
POST   /api/routing/route          # Route a request
GET    /api/routing/decisions      # Get routing history
POST   /api/routing/rules          # Create routing rule
GET    /api/routing/analytics      # Routing analytics
```

#### AI Assistant
```
POST   /api/assistant/chat         # Send message
GET    /api/assistant/conversations # List conversations
GET    /api/assistant/suggestions  # Get suggested questions
```

#### Command Center
```
GET    /api/command-center/metrics      # Aggregated metrics
GET    /api/command-center/alerts       # Active alerts
GET    /api/command-center/trends       # Trend analysis
GET    /api/command-center/stream       # SSE real-time updates
POST   /api/command-center/widgets      # Create widget
```

#### Process Discovery
```
GET    /api/discovery/processes         # List processes
GET    /api/discovery/processes/:id     # Process details
POST   /api/discovery/mine              # Start discovery job
GET    /api/discovery/export/bpmn/:id   # Export as BPMN
```

#### Data Sources
```
GET    /api/data-sources                # List connected sources
POST   /api/data-sources                # Connect new source
POST   /api/data-sources/:id/sync       # Trigger sync
DELETE /api/data-sources/:id            # Disconnect source
```

### Authentication

All API requests require authentication via JWT tokens:

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.foundry.example.com/api/routing/route
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/foundry
TIMESCALE_URL=postgresql://user:pass@localhost:5433/foundry_ts

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379

# Vector Database
QDRANT_URL=http://localhost:6333

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# External Connectors
M365_CLIENT_ID=...
M365_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
```

---

## Development

### Code Style

The project uses ESLint and Prettier for consistent code formatting:

```bash
# Lint code
npm run lint

# Format code
npm run format
```

### Database Migrations

```bash
cd backend

# Create migration
npx prisma migrate dev --name description

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset
```

### Adding a New Connector

1. Create connector directory in `backend/src/connectors/<name>/`
2. Implement the base connector interface
3. Add extractors for relevant data types
4. Register in connector factory
5. Add sync processor job
6. Create frontend wizard component

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/services/routing/routing.test.ts
```

### Frontend Tests

```bash
cd frontend

# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui
```

### Integration Tests

```bash
# Start test infrastructure
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration
```

---

## Deployment

### Docker Deployment

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 16 GB | 32+ GB |
| Storage | 100 GB SSD | 500+ GB SSD |
| Network | 100 Mbps | 1 Gbps |

### Scaling Considerations

- **Horizontal Scaling**: Backend services are stateless and can be scaled horizontally
- **Database Scaling**: Use read replicas for PostgreSQL and Neo4j
- **Caching**: Redis cluster for high availability
- **Job Processing**: Scale BullMQ workers based on queue depth

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Contribution Guidelines

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Keep commits atomic and well-described

---

## License

This project is proprietary software. All rights reserved.

---

## Author

**Ali Uyar**
Email: ali.uyar1@hotmail.com
GitHub: [@aliuyar1234](https://github.com/aliuyar1234)

---

## Support

For support inquiries, please contact:
- Email: ali.uyar1@hotmail.com
- GitHub Issues: [Create an issue](https://github.com/aliuyar1234/Foundry/issues)

---

## Acknowledgments

- Built with modern open-source technologies
- Inspired by enterprise operational excellence principles
- Designed for the AI-first enterprise
