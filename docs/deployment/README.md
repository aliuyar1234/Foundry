# Foundry Deployment Guide

This documentation covers all deployment options for Foundry, from quick local development to enterprise-grade production deployments.

## Deployment Options

| Option | Best For | Complexity | Scalability |
|--------|----------|------------|-------------|
| [Docker Compose](./docker-compose.md) | Development, Small Teams | Low | Limited |
| [Kubernetes](./kubernetes.md) | Production, Enterprise | Medium | High |
| [Air-Gapped](./air-gapped.md) | Regulated Industries | High | High |

## Quick Start

### Prerequisites

- Docker 24.0+ and Docker Compose 2.20+
- 8GB RAM minimum (16GB recommended)
- 50GB disk space

### Minimal Deployment

```bash
# Clone repository
git clone https://github.com/your-org/foundry.git
cd foundry

# Copy environment template
cp .env.example .env

# Start services
docker-compose up -d

# Verify deployment
./deployment/scripts/health-check.sh
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
│                    (nginx/traefik)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Frontend    │  │   Backend     │  │   Worker      │
│   (React)     │  │   (Node.js)   │  │   (BullMQ)    │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  PostgreSQL   │  │    Neo4j      │  │    Redis      │
│  (Primary DB) │  │  (Graph DB)   │  │   (Cache)     │
└───────────────┘  └───────────────┘  └───────────────┘
```

## Deployment Guides

### Infrastructure Setup

1. **[Database Configuration](./database-config.md)** - PostgreSQL, Neo4j, Redis setup
2. **[SSL/TLS Setup](./ssl-setup.md)** - Certificate configuration
3. **[Backup & Restore](./backup-restore.md)** - Data protection strategies

### Deployment Methods

4. **[Docker Compose](./docker-compose.md)** - Single-server deployment
5. **[Kubernetes](./kubernetes.md)** - Orchestrated container deployment
6. **[Helm Values Reference](./helm-values.md)** - Helm chart configuration

### Operations

7. **[Monitoring](./monitoring.md)** - Prometheus, Grafana setup
8. **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions
9. **[Air-Gapped Deployment](./air-gapped.md)** - Offline installation

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/foundry` |
| `NEO4J_URI` | Neo4j connection URI | `bolt://neo4j:7687` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-super-secret-key-here` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `MAX_FILE_SIZE` | Max upload size | `50MB` |

See `.env.example` for complete list.

## Security Considerations

### Production Checklist

- [ ] Change all default passwords
- [ ] Enable SSL/TLS for all connections
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Set up backup automation
- [ ] Configure rate limiting
- [ ] Enable WAF (Web Application Firewall)
- [ ] Review RBAC permissions

### Network Security

```yaml
# Recommended network isolation
frontend: public (443)
backend: internal only
databases: internal only, no public access
```

## Scaling Guidelines

### Horizontal Scaling

| Component | Scaling Method | Notes |
|-----------|---------------|-------|
| Frontend | Replicas | Stateless, scale freely |
| Backend | Replicas | Stateless, scale with load |
| Worker | Replicas | Based on queue depth |
| PostgreSQL | Read replicas | Write to primary only |
| Neo4j | Causal cluster | Enterprise license |
| Redis | Sentinel/Cluster | For HA |

### Resource Recommendations

| Environment | Frontend | Backend | Worker | PostgreSQL | Neo4j | Redis |
|-------------|----------|---------|--------|------------|-------|-------|
| Development | 256MB | 512MB | 256MB | 1GB | 1GB | 256MB |
| Staging | 512MB | 1GB | 512MB | 2GB | 2GB | 512MB |
| Production | 1GB | 2GB | 1GB | 8GB | 8GB | 2GB |
| Enterprise | 2GB | 4GB | 2GB | 32GB | 32GB | 8GB |

## Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Enterprise Support: support@foundry.io
