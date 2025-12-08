# Database Configuration Guide

Configure PostgreSQL, Neo4j, and Redis for optimal Foundry performance.

## PostgreSQL Configuration

### Production Settings

```ini
# postgresql.conf

# Connection Settings
max_connections = 200
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 4GB                    # 25% of RAM
effective_cache_size = 12GB             # 75% of RAM
maintenance_work_mem = 1GB
work_mem = 32MB                         # per operation

# WAL Settings
wal_buffers = 64MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min

# Query Planner
random_page_cost = 1.1                  # SSD storage
effective_io_concurrency = 200          # SSD storage
default_statistics_target = 100

# Parallel Query
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_parallel_maintenance_workers = 4

# Logging
log_min_duration_statement = 1000       # Log queries > 1s
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_temp_files = 0

# Autovacuum
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
```

### Connection Pooling with PgBouncer

```ini
# pgbouncer.ini
[databases]
foundry = host=postgres port=5432 dbname=foundry

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Pool Settings
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
reserve_pool_timeout = 5

# Connection Settings
server_reset_query = DISCARD ALL
server_check_query = select 1
server_check_delay = 30
server_lifetime = 3600
server_idle_timeout = 600
```

### Row-Level Security Setup

```sql
-- Enable RLS on all tenant tables
ALTER TABLE process ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight ENABLE ROW LEVEL SECURITY;
ALTER TABLE document ENABLE ROW LEVEL SECURITY;

-- Create entity context function
CREATE OR REPLACE FUNCTION set_entity_context(entity_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_entity_id', entity_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RLS policies
CREATE POLICY entity_isolation_policy ON process
  USING (entity_id = current_setting('app.current_entity_id')::UUID);

CREATE POLICY entity_isolation_policy ON data_source
  USING (entity_id = current_setting('app.current_entity_id')::UUID);

CREATE POLICY entity_isolation_policy ON insight
  USING (entity_id = current_setting('app.current_entity_id')::UUID);

-- Cross-entity read policy for authorized users
CREATE POLICY cross_entity_read_policy ON process
  FOR SELECT
  USING (
    entity_id IN (
      SELECT entity_id FROM user_entity_permission
      WHERE user_id = current_setting('app.current_user_id')::UUID
      AND permission IN ('read', 'write', 'admin')
    )
  );
```

### Backup Configuration

```bash
#!/bin/bash
# postgres-backup.sh

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_NAME="${POSTGRES_DB:-foundry}"
DB_USER="${POSTGRES_USER:-foundry}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/foundry_${DATE}.sql.gz"

# Create backup
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_FILE"

# Verify backup
pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "Backup successful: $BACKUP_FILE"
else
  echo "Backup verification failed!"
  exit 1
fi

# Cleanup old backups
find "$BACKUP_DIR" -name "foundry_*.sql.gz" -mtime +$RETENTION_DAYS -delete
```

## Neo4j Configuration

### Production Settings

```conf
# neo4j.conf

# Memory Configuration
dbms.memory.heap.initial_size=4g
dbms.memory.heap.max_size=8g
dbms.memory.pagecache.size=4g

# Transaction Settings
dbms.transaction.timeout=60s
dbms.lock.acquisition.timeout=10s

# Query Settings
cypher.min_replan_interval=10s
cypher.statistics_divergence_threshold=0.75

# Logging
dbms.logs.query.enabled=INFO
dbms.logs.query.threshold=1s
dbms.logs.query.parameter_logging_enabled=true

# Security
dbms.security.auth_enabled=true
dbms.security.procedures.unrestricted=apoc.*

# Network
dbms.default_listen_address=0.0.0.0
dbms.connector.bolt.listen_address=:7687
dbms.connector.http.listen_address=:7474

# APOC Configuration
apoc.export.file.enabled=true
apoc.import.file.enabled=true
apoc.import.file.use_neo4j_config=true
```

### Entity-Scoped Indexes

```cypher
// Create entity-scoped indexes for all node types
CREATE INDEX process_entity_idx FOR (p:Process) ON (p.entityId);
CREATE INDEX document_entity_idx FOR (d:Document) ON (d.entityId);
CREATE INDEX insight_entity_idx FOR (i:Insight) ON (i.entityId);
CREATE INDEX metric_entity_idx FOR (m:Metric) ON (m.entityId);

// Composite indexes for common queries
CREATE INDEX process_entity_status_idx FOR (p:Process) ON (p.entityId, p.status);
CREATE INDEX document_entity_type_idx FOR (d:Document) ON (d.entityId, d.type);

// Full-text search indexes
CREATE FULLTEXT INDEX process_search FOR (p:Process) ON EACH [p.name, p.description];
CREATE FULLTEXT INDEX document_search FOR (d:Document) ON EACH [d.name, d.content];

// Verify indexes
SHOW INDEXES;
```

### Query Optimization

```cypher
// Entity-scoped query template
MATCH (p:Process {entityId: $entityId})
WHERE p.status = 'ACTIVE'
WITH p
MATCH (p)-[:HAS_STEP]->(s:Step)
RETURN p, collect(s) as steps
LIMIT 100;

// Cross-entity query (authorized entities only)
MATCH (p:Process)
WHERE p.entityId IN $authorizedEntityIds
RETURN p.entityId, count(p) as processCount
ORDER BY processCount DESC;
```

### Backup Configuration

```bash
#!/bin/bash
# neo4j-backup.sh

NEO4J_HOME="${NEO4J_HOME:-/var/lib/neo4j}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR/neo4j"

# Online backup (Enterprise only)
# neo4j-admin backup --database=neo4j --backup-dir="$BACKUP_DIR/neo4j/$DATE"

# Dump (Community)
neo4j-admin database dump neo4j --to-path="$BACKUP_DIR/neo4j/foundry_${DATE}.dump"

# Export with APOC (alternative)
# cypher-shell "CALL apoc.export.json.all('$BACKUP_DIR/neo4j/export_${DATE}.json', {})"

echo "Neo4j backup complete: $BACKUP_DIR/neo4j/foundry_${DATE}.dump"
```

## Redis Configuration

### Production Settings

```conf
# redis.conf

# Network
bind 0.0.0.0
port 6379
tcp-backlog 511
tcp-keepalive 300

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru
maxmemory-samples 10

# Persistence
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB Snapshots
save 900 1
save 300 10
save 60 10000

# Security
requirepass your-redis-password

# Performance
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes

# Logging
loglevel notice
logfile "/var/log/redis/redis.log"

# Clients
maxclients 10000
timeout 0
```

### Sentinel Configuration (High Availability)

```conf
# sentinel.conf

# Sentinel configuration
sentinel monitor foundry-master redis-master 6379 2
sentinel auth-pass foundry-master your-redis-password
sentinel down-after-milliseconds foundry-master 5000
sentinel failover-timeout foundry-master 60000
sentinel parallel-syncs foundry-master 1

# Notification
sentinel notification-script foundry-master /opt/redis/notify.sh
sentinel client-reconfig-script foundry-master /opt/redis/reconfig.sh
```

### Cluster Configuration

```conf
# redis-cluster.conf

# Cluster mode
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000

# Memory (per node)
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
appendonly yes
appendfsync everysec
```

### Cache Key Design

```typescript
// Cache key patterns for multi-tenant isolation

// Entity-scoped cache keys
const cacheKeys = {
  // User session
  userSession: (userId: string) => `session:${userId}`,

  // Entity data (scoped by entityId)
  entityProcesses: (entityId: string) => `entity:${entityId}:processes`,
  entityMetrics: (entityId: string, period: string) =>
    `entity:${entityId}:metrics:${period}`,

  // Rate limiting (per entity API key)
  rateLimit: (apiKeyId: string) => `ratelimit:${apiKeyId}`,

  // Job queues (entity-scoped)
  jobQueue: (entityId: string, queue: string) => `queue:${entityId}:${queue}`,

  // Benchmarks (anonymized, not entity-scoped)
  benchmarkSegment: (segmentId: string) => `benchmark:segment:${segmentId}`,
};

// TTL configurations
const cacheTTL = {
  session: 3600,        // 1 hour
  processes: 300,       // 5 minutes
  metrics: 900,         // 15 minutes
  rateLimit: 60,        // 1 minute window
  benchmark: 3600 * 24, // 24 hours
};
```

## Connection Strings

### Environment Variables

```bash
# PostgreSQL
DATABASE_URL=postgresql://foundry:password@postgres:5432/foundry?schema=public
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50

# PostgreSQL with PgBouncer
DATABASE_URL=postgresql://foundry:password@pgbouncer:6432/foundry?schema=public

# Neo4j
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j

# Redis
REDIS_URL=redis://:password@redis:6379/0
REDIS_CLUSTER_NODES=redis-0:6379,redis-1:6379,redis-2:6379

# Redis Sentinel
REDIS_SENTINEL_MASTER=foundry-master
REDIS_SENTINEL_NODES=sentinel-0:26379,sentinel-1:26379,sentinel-2:26379
```

### Prisma Configuration

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

## Monitoring Queries

### PostgreSQL Health

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';

-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### Neo4j Health

```cypher
// Database statistics
CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Store sizes")
YIELD attributes
RETURN attributes;

// Cache hit ratio
CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Page cache")
YIELD attributes
RETURN attributes.HitRatio;

// Active queries
CALL dbms.listQueries()
YIELD queryId, username, query, elapsedTimeMillis
WHERE elapsedTimeMillis > 1000
RETURN queryId, username, query, elapsedTimeMillis;
```

### Redis Health

```bash
# Memory usage
redis-cli INFO memory

# Connected clients
redis-cli INFO clients

# Keyspace statistics
redis-cli INFO keyspace

# Slow log
redis-cli SLOWLOG GET 10
```

## Disaster Recovery

### Full Restore Procedure

```bash
#!/bin/bash
# full-restore.sh

BACKUP_DATE="${1}"
BACKUP_DIR="/backups"

echo "Starting full restore from ${BACKUP_DATE}..."

# 1. Stop application
kubectl scale deployment foundry-backend --replicas=0 -n foundry
kubectl scale deployment foundry-worker --replicas=0 -n foundry

# 2. Restore PostgreSQL
echo "Restoring PostgreSQL..."
pg_restore -h postgres -U foundry -d foundry \
  "${BACKUP_DIR}/foundry_${BACKUP_DATE}.sql.gz"

# 3. Restore Neo4j
echo "Restoring Neo4j..."
neo4j-admin database load neo4j \
  --from-path="${BACKUP_DIR}/neo4j/foundry_${BACKUP_DATE}.dump" \
  --overwrite-destination=true

# 4. Clear Redis cache
echo "Clearing Redis cache..."
redis-cli FLUSHALL

# 5. Restart application
kubectl scale deployment foundry-backend --replicas=3 -n foundry
kubectl scale deployment foundry-worker --replicas=2 -n foundry

echo "Restore complete!"
```
