# Docker Compose Deployment Guide

Quick deployment using Docker Compose for development and small production environments.

## Prerequisites

- Docker 24.0+
- Docker Compose 2.20+
- 8GB RAM minimum
- 50GB disk space

## Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/foundry.git
cd foundry

# Create environment file
cp .env.example .env

# Edit configuration
nano .env

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

## Docker Compose Configuration

### Production Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    image: foundry/frontend:latest
    ports:
      - "80:80"
      - "443:443"
    environment:
      - REACT_APP_API_URL=http://backend:3000
    depends_on:
      - backend
    restart: unless-stopped
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro

  backend:
    image: foundry/backend:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - NEO4J_URI=${NEO4J_URI}
      - NEO4J_USER=${NEO4J_USER}
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - neo4j
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    image: foundry/backend:latest
    command: ["npm", "run", "worker"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-foundry}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB:-foundry}
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U foundry"]
      interval: 10s
      timeout: 5s
      retries: 5

  neo4j:
    image: neo4j:5-community
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    environment:
      - NEO4J_AUTH=${NEO4J_USER}/${NEO4J_PASSWORD}
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_memory_heap_initial__size=512m
      - NEO4J_dbms_memory_heap_max__size=2G
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  neo4j_data:
  neo4j_logs:
  redis_data:

networks:
  default:
    driver: bridge
```

## Environment Configuration

### Required Variables

```bash
# .env file

# Database
DATABASE_URL=postgresql://foundry:your-password@postgres:5432/foundry
POSTGRES_USER=foundry
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=foundry

# Neo4j
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password

# Redis
REDIS_URL=redis://redis:6379

# Security
JWT_SECRET=your-jwt-secret-minimum-32-characters-long
ENCRYPTION_KEY=your-encryption-key-32-chars

# Application
NODE_ENV=production
LOG_LEVEL=info
```

## Scaling with Docker Compose

### Horizontal Scaling

```bash
# Scale backend to 3 instances
docker-compose up -d --scale backend=3

# Scale workers
docker-compose up -d --scale worker=5
```

### With Load Balancer

```yaml
# docker-compose.override.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend

  backend:
    ports: []  # Remove direct port exposure
```

## Backup Configuration

### Automated Backups

```yaml
# Add to docker-compose.yml
services:
  backup:
    image: foundry/backup:latest
    volumes:
      - ./backups:/backups
      - postgres_data:/var/lib/postgresql/data:ro
    environment:
      - BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
      - RETENTION_DAYS=30
      - S3_BUCKET=${S3_BACKUP_BUCKET}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
```

## SSL/TLS Configuration

### Using Let's Encrypt

```yaml
services:
  certbot:
    image: certbot/certbot
    volumes:
      - ./certs:/etc/letsencrypt
      - ./certbot-webroot:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
```

### Nginx SSL Configuration

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Database Access

```bash
# PostgreSQL
docker-compose exec postgres psql -U foundry

# Neo4j (via browser)
open http://localhost:7474

# Redis CLI
docker-compose exec redis redis-cli
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend

# Recreate without downtime
docker-compose up -d --no-deps backend
```

### Update Images

```bash
# Pull latest images
docker-compose pull

# Recreate containers with new images
docker-compose up -d --force-recreate
```

## Health Checks

```bash
# Check all services
docker-compose ps

# Check specific health
docker inspect --format='{{.State.Health.Status}}' foundry-backend-1

# Run health check script
./deployment/scripts/health-check.sh
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs backend

# Check resource usage
docker stats

# Verify environment
docker-compose config
```

### Database Connection Issues

```bash
# Verify network
docker network ls
docker network inspect foundry_default

# Test connectivity
docker-compose exec backend ping postgres
```

### Performance Issues

```bash
# Monitor resources
docker stats

# Check disk usage
docker system df

# Clean up
docker system prune -a
```

## Migration from Development

1. Export development data
2. Update `.env` for production
3. Start production services
4. Import data
5. Verify functionality

```bash
# Export from dev
docker-compose exec postgres pg_dump -U foundry > backup.sql

# Import to prod
cat backup.sql | docker-compose exec -T postgres psql -U foundry
```
