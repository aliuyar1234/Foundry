# Backup and Restore Guide

Comprehensive backup strategies and disaster recovery procedures for Foundry deployments.

## Overview

Foundry requires backups for three data stores:
- **PostgreSQL** - Primary relational data (entities, users, processes)
- **Neo4j** - Graph data (relationships, process intelligence)
- **Redis** - Cache and session data (optional backup)

## Backup Strategy

### Backup Frequency Recommendations

| Data Type | RPO | Frequency | Retention |
|-----------|-----|-----------|-----------|
| PostgreSQL Full | 24h | Daily | 30 days |
| PostgreSQL WAL | 5min | Continuous | 7 days |
| Neo4j Full | 24h | Daily | 30 days |
| Neo4j Incremental | 1h | Hourly | 48 hours |
| Redis RDB | 1h | Hourly | 24 hours |
| Configuration | On change | Event-driven | 90 days |

### Backup Types

1. **Full Backups** - Complete database dump
2. **Incremental Backups** - Changes since last backup
3. **Point-in-Time Recovery (PITR)** - WAL-based for PostgreSQL
4. **Snapshot Backups** - Volume-level snapshots

## PostgreSQL Backup

### pg_dump Full Backup

```bash
#!/bin/bash
# postgres-backup.sh

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-foundry}"
DB_USER="${POSTGRES_USER:-foundry}"
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/foundry_full_${DATE}.dump"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "Starting PostgreSQL backup at $(date)"

# Create custom format backup (supports parallel restore)
pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="${BACKUP_FILE}"

# Verify backup
echo "Verifying backup..."
pg_restore --list "${BACKUP_FILE}" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: Backup verification failed!"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Calculate checksum
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Upload to S3 if configured
if [ -n "${S3_BUCKET}" ]; then
  echo "Uploading to S3..."
  aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/postgres/"
  aws s3 cp "${BACKUP_FILE}.sha256" "s3://${S3_BUCKET}/postgres/"
fi

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "foundry_full_*.dump" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -name "foundry_full_*.sha256" -mtime +${RETENTION_DAYS} -delete

echo "Backup completed successfully at $(date)"
```

### WAL Archiving for PITR

```ini
# postgresql.conf - WAL archiving settings
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
archive_timeout = 300

# For S3 archiving (using wal-g)
# archive_command = 'wal-g wal-push %p'
```

```bash
#!/bin/bash
# postgres-pitr-backup.sh - Base backup for PITR

BACKUP_DIR="/backups/postgres/base"
DATE=$(date +%Y%m%d_%H%M%S)

# Create base backup
pg_basebackup \
  -h "${DB_HOST}" \
  -U replication \
  -D "${BACKUP_DIR}/${DATE}" \
  --format=tar \
  --gzip \
  --checkpoint=fast \
  --progress \
  --wal-method=stream

echo "Base backup created: ${BACKUP_DIR}/${DATE}"
```

### Restore PostgreSQL

```bash
#!/bin/bash
# postgres-restore.sh

set -euo pipefail

BACKUP_FILE="${1}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_NAME="${POSTGRES_DB:-foundry}"
DB_USER="${POSTGRES_USER:-foundry}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: postgres-restore.sh <backup-file>"
  exit 1
fi

# Verify checksum if available
if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "Verifying checksum..."
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

echo "WARNING: This will overwrite the existing database!"
read -p "Continue? (yes/no): " confirm
if [ "${confirm}" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Drop and recreate database
echo "Dropping existing database..."
psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};"

# Restore from backup
echo "Restoring from ${BACKUP_FILE}..."
pg_restore \
  -h "${DB_HOST}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --verbose \
  --jobs=4 \
  "${BACKUP_FILE}"

echo "Restore completed successfully!"

# Run post-restore tasks
echo "Running post-restore migrations..."
npm run prisma:migrate
```

### Point-in-Time Recovery

```bash
#!/bin/bash
# postgres-pitr-restore.sh

TARGET_TIME="${1}"  # Format: '2024-01-15 14:30:00'
BASE_BACKUP_DIR="${2}"
WAL_ARCHIVE="/archive"
DATA_DIR="/var/lib/postgresql/data"

if [ -z "${TARGET_TIME}" ] || [ -z "${BASE_BACKUP_DIR}" ]; then
  echo "Usage: postgres-pitr-restore.sh '<target-time>' <base-backup-dir>"
  exit 1
fi

echo "Stopping PostgreSQL..."
pg_ctl stop -D "${DATA_DIR}"

echo "Restoring base backup..."
rm -rf "${DATA_DIR}/*"
tar -xzf "${BASE_BACKUP_DIR}/base.tar.gz" -C "${DATA_DIR}"

# Create recovery configuration
cat > "${DATA_DIR}/postgresql.auto.conf" << EOF
restore_command = 'cp ${WAL_ARCHIVE}/%f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# Create recovery signal file
touch "${DATA_DIR}/recovery.signal"

echo "Starting PostgreSQL for recovery..."
pg_ctl start -D "${DATA_DIR}"

echo "Recovery in progress. Check logs for completion."
```

## Neo4j Backup

### Full Database Dump

```bash
#!/bin/bash
# neo4j-backup.sh

set -euo pipefail

NEO4J_HOME="${NEO4J_HOME:-/var/lib/neo4j}"
BACKUP_DIR="${BACKUP_DIR:-/backups/neo4j}"
DATABASE="${NEO4J_DATABASE:-neo4j}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/foundry_neo4j_${DATE}.dump"

mkdir -p "${BACKUP_DIR}"

echo "Starting Neo4j backup at $(date)"

# For Community Edition - use dump command
neo4j-admin database dump "${DATABASE}" --to-path="${BACKUP_FILE}"

# For Enterprise Edition - use online backup
# neo4j-admin database backup "${DATABASE}" \
#   --to-path="${BACKUP_DIR}/${DATE}" \
#   --include-metadata=all

# Compress the backup
gzip "${BACKUP_FILE}"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Calculate checksum
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Upload to S3
if [ -n "${S3_BUCKET}" ]; then
  aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/neo4j/"
  aws s3 cp "${BACKUP_FILE}.sha256" "s3://${S3_BUCKET}/neo4j/"
fi

# Cleanup old backups
find "${BACKUP_DIR}" -name "foundry_neo4j_*.dump.gz" -mtime +${RETENTION_DAYS} -delete

echo "Neo4j backup completed at $(date)"
```

### APOC Export (Alternative)

```cypher
// Export all data to JSON
CALL apoc.export.json.all('/backups/neo4j/export.json', {useTypes: true});

// Export specific node types
CALL apoc.export.json.query(
  'MATCH (n) WHERE n.entityId = $entityId RETURN n',
  '/backups/entity_data.json',
  {params: {entityId: 'entity-123'}}
);
```

### Restore Neo4j

```bash
#!/bin/bash
# neo4j-restore.sh

set -euo pipefail

BACKUP_FILE="${1}"
DATABASE="${NEO4J_DATABASE:-neo4j}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: neo4j-restore.sh <backup-file>"
  exit 1
fi

# Decompress if needed
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  echo "Decompressing backup..."
  gunzip -k "${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE%.gz}"
fi

echo "WARNING: This will overwrite the existing database!"
read -p "Continue? (yes/no): " confirm
if [ "${confirm}" != "yes" ]; then
  exit 0
fi

echo "Stopping Neo4j..."
neo4j stop

echo "Restoring from ${BACKUP_FILE}..."
neo4j-admin database load "${DATABASE}" \
  --from-path="${BACKUP_FILE}" \
  --overwrite-destination=true

echo "Starting Neo4j..."
neo4j start

echo "Neo4j restore completed!"
```

## Redis Backup

### RDB Snapshot Backup

```bash
#!/bin/bash
# redis-backup.sh

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-/backups/redis}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"

DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

echo "Starting Redis backup at $(date)"

# Trigger BGSAVE
if [ -n "${REDIS_PASSWORD}" ]; then
  redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" BGSAVE
else
  redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" BGSAVE
fi

# Wait for BGSAVE to complete
echo "Waiting for BGSAVE to complete..."
while true; do
  if [ -n "${REDIS_PASSWORD}" ]; then
    STATUS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" LASTSAVE)
  else
    STATUS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
  fi
  sleep 1

  if [ -n "${REDIS_PASSWORD}" ]; then
    NEW_STATUS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" LASTSAVE)
  else
    NEW_STATUS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
  fi

  if [ "${STATUS}" != "${NEW_STATUS}" ]; then
    break
  fi
done

# Copy RDB file
cp "${REDIS_DATA_DIR}/dump.rdb" "${BACKUP_DIR}/dump_${DATE}.rdb"
gzip "${BACKUP_DIR}/dump_${DATE}.rdb"

echo "Redis backup completed: ${BACKUP_DIR}/dump_${DATE}.rdb.gz"

# Cleanup old backups (keep 24 hours)
find "${BACKUP_DIR}" -name "dump_*.rdb.gz" -mtime +1 -delete
```

### AOF Backup

```bash
#!/bin/bash
# redis-aof-backup.sh

REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"
BACKUP_DIR="${BACKUP_DIR:-/backups/redis}"
DATE=$(date +%Y%m%d_%H%M%S)

# Trigger AOF rewrite
redis-cli BGREWRITEAOF

# Wait for completion
while [ "$(redis-cli INFO persistence | grep aof_rewrite_in_progress | cut -d: -f2 | tr -d '\r')" == "1" ]; do
  sleep 1
done

# Copy AOF file
cp "${REDIS_DATA_DIR}/appendonly.aof" "${BACKUP_DIR}/appendonly_${DATE}.aof"
gzip "${BACKUP_DIR}/appendonly_${DATE}.aof"

echo "AOF backup completed: ${BACKUP_DIR}/appendonly_${DATE}.aof.gz"
```

## Kubernetes Backup with Velero

### Install Velero

```bash
# Install Velero with AWS provider
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket foundry-backups \
  --secret-file ./credentials-velero \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1

# Verify installation
velero version
kubectl get pods -n velero
```

### Backup Schedule

```yaml
# velero-schedule.yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: foundry-daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  template:
    includedNamespaces:
      - foundry
    excludedResources:
      - events
      - events.events.k8s.io
    storageLocation: default
    volumeSnapshotLocations:
      - default
    ttl: 720h  # 30 days retention
    snapshotVolumes: true
---
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: foundry-hourly-backup
  namespace: velero
spec:
  schedule: "0 * * * *"  # Every hour
  template:
    includedNamespaces:
      - foundry
    includedResources:
      - configmaps
      - secrets
    storageLocation: default
    ttl: 168h  # 7 days
    snapshotVolumes: false
```

### Manual Backup

```bash
# Create backup
velero backup create foundry-backup-$(date +%Y%m%d) \
  --include-namespaces foundry \
  --snapshot-volumes

# Check backup status
velero backup describe foundry-backup-20240115

# List backups
velero backup get
```

### Restore from Velero

```bash
# Restore entire namespace
velero restore create --from-backup foundry-backup-20240115

# Restore specific resources
velero restore create --from-backup foundry-backup-20240115 \
  --include-resources deployments,services,configmaps

# Check restore status
velero restore describe foundry-restore-20240115
```

## Automated Backup System

### Backup Orchestration Script

```bash
#!/bin/bash
# full-backup.sh - Orchestrates all backups

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_ROOT}/logs/backup_${DATE}.log"

mkdir -p "${BACKUP_ROOT}/logs"

exec > >(tee -a "${LOG_FILE}") 2>&1

echo "=========================================="
echo "Starting full backup at $(date)"
echo "=========================================="

# Track backup status
POSTGRES_STATUS="FAILED"
NEO4J_STATUS="FAILED"
REDIS_STATUS="FAILED"

# PostgreSQL backup
echo ""
echo "--- PostgreSQL Backup ---"
if ./postgres-backup.sh; then
  POSTGRES_STATUS="SUCCESS"
  echo "PostgreSQL backup: SUCCESS"
else
  echo "PostgreSQL backup: FAILED"
fi

# Neo4j backup
echo ""
echo "--- Neo4j Backup ---"
if ./neo4j-backup.sh; then
  NEO4J_STATUS="SUCCESS"
  echo "Neo4j backup: SUCCESS"
else
  echo "Neo4j backup: FAILED"
fi

# Redis backup
echo ""
echo "--- Redis Backup ---"
if ./redis-backup.sh; then
  REDIS_STATUS="SUCCESS"
  echo "Redis backup: SUCCESS"
else
  echo "Redis backup: FAILED"
fi

# Summary
echo ""
echo "=========================================="
echo "Backup Summary"
echo "=========================================="
echo "PostgreSQL: ${POSTGRES_STATUS}"
echo "Neo4j: ${NEO4J_STATUS}"
echo "Redis: ${REDIS_STATUS}"
echo "Completed at $(date)"

# Send notification
if [ "${POSTGRES_STATUS}" == "FAILED" ] || [ "${NEO4J_STATUS}" == "FAILED" ]; then
  # Send alert (implement your notification method)
  echo "ALERT: Backup failed!" | mail -s "Foundry Backup Alert" ops@company.com
  exit 1
fi
```

### Kubernetes CronJob

```yaml
# backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: foundry-backup
  namespace: foundry
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: foundry/backup-tools:latest
              env:
                - name: POSTGRES_HOST
                  value: foundry-postgresql
                - name: POSTGRES_PASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: foundry-secrets
                      key: postgres-password
                - name: NEO4J_HOST
                  value: foundry-neo4j
                - name: S3_BUCKET
                  value: foundry-backups
              volumeMounts:
                - name: backup-scripts
                  mountPath: /scripts
                - name: backup-storage
                  mountPath: /backups
              command:
                - /scripts/full-backup.sh
          volumes:
            - name: backup-scripts
              configMap:
                name: backup-scripts
                defaultMode: 0755
            - name: backup-storage
              persistentVolumeClaim:
                claimName: backup-pvc
```

## Disaster Recovery

### Recovery Time Objectives

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Single pod failure | 1 min | 0 | Automatic (Kubernetes) |
| Database corruption | 30 min | 5 min | PITR restore |
| Full cluster failure | 2 hours | 24 hours | Full restore from backup |
| Region failure | 4 hours | 1 hour | Cross-region restore |

### Full Disaster Recovery Procedure

```bash
#!/bin/bash
# disaster-recovery.sh

set -euo pipefail

BACKUP_DATE="${1}"
BACKUP_SOURCE="${2:-s3://foundry-backups}"

if [ -z "${BACKUP_DATE}" ]; then
  echo "Usage: disaster-recovery.sh <backup-date> [backup-source]"
  echo "Example: disaster-recovery.sh 20240115 s3://foundry-backups"
  exit 1
fi

echo "=========================================="
echo "Foundry Disaster Recovery"
echo "Backup Date: ${BACKUP_DATE}"
echo "=========================================="

# 1. Create namespace
echo "Creating namespace..."
kubectl create namespace foundry 2>/dev/null || true

# 2. Deploy infrastructure (databases)
echo "Deploying database infrastructure..."
helm install foundry-infra ./charts/foundry-infra \
  --namespace foundry \
  --wait --timeout 10m

# 3. Download backups
echo "Downloading backups from ${BACKUP_SOURCE}..."
aws s3 sync "${BACKUP_SOURCE}/postgres/" /tmp/restore/postgres/ \
  --exclude "*" --include "*${BACKUP_DATE}*"
aws s3 sync "${BACKUP_SOURCE}/neo4j/" /tmp/restore/neo4j/ \
  --exclude "*" --include "*${BACKUP_DATE}*"

# 4. Wait for databases to be ready
echo "Waiting for databases..."
kubectl wait --for=condition=ready pod -l app=postgresql -n foundry --timeout=300s
kubectl wait --for=condition=ready pod -l app=neo4j -n foundry --timeout=300s

# 5. Restore PostgreSQL
echo "Restoring PostgreSQL..."
POSTGRES_POD=$(kubectl get pod -l app=postgresql -n foundry -o jsonpath='{.items[0].metadata.name}')
kubectl cp /tmp/restore/postgres/foundry_full_${BACKUP_DATE}.dump \
  foundry/${POSTGRES_POD}:/tmp/restore.dump
kubectl exec ${POSTGRES_POD} -n foundry -- \
  pg_restore -U foundry -d foundry /tmp/restore.dump

# 6. Restore Neo4j
echo "Restoring Neo4j..."
NEO4J_POD=$(kubectl get pod -l app=neo4j -n foundry -o jsonpath='{.items[0].metadata.name}')
kubectl cp /tmp/restore/neo4j/foundry_neo4j_${BACKUP_DATE}.dump.gz \
  foundry/${NEO4J_POD}:/tmp/restore.dump.gz
kubectl exec ${NEO4J_POD} -n foundry -- bash -c \
  'gunzip /tmp/restore.dump.gz && neo4j-admin database load neo4j --from-path=/tmp/restore.dump --overwrite-destination=true'

# 7. Deploy application
echo "Deploying application..."
helm install foundry ./charts/foundry \
  --namespace foundry \
  --wait --timeout 10m

# 8. Run migrations
echo "Running database migrations..."
kubectl exec deployment/foundry-backend -n foundry -- npm run prisma:migrate

# 9. Verify deployment
echo "Verifying deployment..."
kubectl get pods -n foundry
kubectl exec deployment/foundry-backend -n foundry -- curl -s localhost:3000/health

echo ""
echo "=========================================="
echo "Disaster Recovery Complete"
echo "=========================================="
```

### Recovery Verification Checklist

```bash
#!/bin/bash
# verify-recovery.sh

echo "Recovery Verification Checklist"
echo "================================"

# Check pods
echo "1. Checking pods..."
kubectl get pods -n foundry
echo ""

# Check services
echo "2. Checking services..."
kubectl get svc -n foundry
echo ""

# Check database connectivity
echo "3. Checking PostgreSQL..."
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run prisma:db:push -- --accept-data-loss 2>/dev/null && echo "PostgreSQL: OK" || echo "PostgreSQL: FAILED"

echo "4. Checking Neo4j..."
kubectl exec deployment/foundry-backend -n foundry -- \
  curl -s http://foundry-neo4j:7474 > /dev/null && echo "Neo4j: OK" || echo "Neo4j: FAILED"

echo "5. Checking Redis..."
kubectl exec deployment/foundry-backend -n foundry -- \
  redis-cli -h foundry-redis ping > /dev/null && echo "Redis: OK" || echo "Redis: FAILED"

# Check API health
echo ""
echo "6. Checking API health..."
kubectl exec deployment/foundry-backend -n foundry -- curl -s localhost:3000/health

# Check data integrity
echo ""
echo "7. Checking data integrity..."
kubectl exec deployment/foundry-backend -n foundry -- npm run verify:data

echo ""
echo "Verification complete!"
```

## Backup Monitoring

### Prometheus Metrics

```yaml
# backup-metrics.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backup-metrics-script
  namespace: foundry
data:
  collect-metrics.sh: |
    #!/bin/bash
    # Collect backup metrics for Prometheus

    METRICS_FILE="/tmp/backup_metrics.prom"

    # Last backup timestamp
    LAST_POSTGRES=$(stat -c %Y /backups/postgres/foundry_full_*.dump 2>/dev/null | sort -rn | head -1 || echo 0)
    LAST_NEO4J=$(stat -c %Y /backups/neo4j/foundry_neo4j_*.dump.gz 2>/dev/null | sort -rn | head -1 || echo 0)

    # Backup sizes
    POSTGRES_SIZE=$(du -sb /backups/postgres/foundry_full_*.dump 2>/dev/null | sort -rn | head -1 | cut -f1 || echo 0)
    NEO4J_SIZE=$(du -sb /backups/neo4j/foundry_neo4j_*.dump.gz 2>/dev/null | sort -rn | head -1 | cut -f1 || echo 0)

    cat > ${METRICS_FILE} << EOF
    # HELP foundry_backup_last_success_timestamp Last successful backup timestamp
    # TYPE foundry_backup_last_success_timestamp gauge
    foundry_backup_last_success_timestamp{database="postgresql"} ${LAST_POSTGRES}
    foundry_backup_last_success_timestamp{database="neo4j"} ${LAST_NEO4J}

    # HELP foundry_backup_size_bytes Size of last backup in bytes
    # TYPE foundry_backup_size_bytes gauge
    foundry_backup_size_bytes{database="postgresql"} ${POSTGRES_SIZE}
    foundry_backup_size_bytes{database="neo4j"} ${NEO4J_SIZE}
    EOF
```

### Alerting Rules

```yaml
# backup-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: foundry-backup-alerts
  namespace: foundry
spec:
  groups:
    - name: backup-alerts
      rules:
        - alert: BackupMissing
          expr: time() - foundry_backup_last_success_timestamp > 86400
          for: 1h
          labels:
            severity: critical
          annotations:
            summary: "Backup missing for {{ $labels.database }}"
            description: "No successful backup in the last 24 hours"

        - alert: BackupSizeAnomaly
          expr: |
            abs(foundry_backup_size_bytes - foundry_backup_size_bytes offset 1d)
            / foundry_backup_size_bytes offset 1d > 0.5
          for: 30m
          labels:
            severity: warning
          annotations:
            summary: "Backup size changed significantly for {{ $labels.database }}"
            description: "Backup size changed more than 50% from previous day"
```

## Testing Backups

### Automated Restore Testing

```bash
#!/bin/bash
# test-restore.sh - Weekly restore verification

set -euo pipefail

TEST_NAMESPACE="foundry-restore-test"
BACKUP_DATE=$(date -d "yesterday" +%Y%m%d)

echo "Starting restore test for backup ${BACKUP_DATE}"

# Create test namespace
kubectl create namespace ${TEST_NAMESPACE} 2>/dev/null || true

# Deploy test databases
helm install foundry-test ./charts/foundry-infra \
  --namespace ${TEST_NAMESPACE} \
  --set postgresql.persistence.size=10Gi \
  --set neo4j.volumes.data.size=10Gi \
  --wait --timeout 5m

# Restore and verify
./disaster-recovery.sh ${BACKUP_DATE} --namespace ${TEST_NAMESPACE} --verify-only

# Run data verification
kubectl exec deployment/foundry-backend -n ${TEST_NAMESPACE} -- npm run verify:data

# Cleanup
helm uninstall foundry-test -n ${TEST_NAMESPACE}
kubectl delete namespace ${TEST_NAMESPACE}

echo "Restore test completed successfully!"
```
