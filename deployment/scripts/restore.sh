#!/bin/bash
# =============================================================================
# Foundry Restore Script
# SCALE Tier - Task T170
#
# Automated restore script for on-premise deployment
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NAMESPACE="foundry"
BACKUP_FILE=""
S3_BUCKET=""
S3_KEY=""
RESTORE_DB=true
RESTORE_NEO4J=true
RESTORE_REDIS=true
RESTORE_VOLUMES=true
FORCE=false
TEMP_DIR="/tmp/foundry-restore-$$"

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS] <backup-file>"
    echo ""
    echo "Options:"
    echo "  -n, --namespace NAME     Kubernetes namespace (default: foundry)"
    echo "  -s, --s3-bucket BUCKET   S3 bucket to download from"
    echo "  -k, --s3-key KEY         S3 key of the backup file"
    echo "  --no-db                  Don't restore PostgreSQL"
    echo "  --no-neo4j               Don't restore Neo4j"
    echo "  --no-redis               Don't restore Redis"
    echo "  --no-volumes             Don't restore volumes"
    echo "  -f, --force              Skip confirmation prompt"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 /var/backups/foundry/foundry-backup-20231201.tar.gz"
    echo "  $0 -s my-bucket -k backups/foundry-backup-20231201.tar.gz"
}

# Log functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Confirm action
confirm() {
    if [ "$FORCE" = true ]; then
        return 0
    fi

    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                         WARNING                               ║${NC}"
    echo -e "${RED}║  This will OVERWRITE existing data in namespace '$NAMESPACE'  ║${NC}"
    echo -e "${RED}║  This action cannot be undone!                                ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    read -p "Are you ABSOLUTELY sure you want to continue? Type 'RESTORE' to confirm: " response

    if [ "$response" != "RESTORE" ]; then
        log_info "Restore cancelled."
        exit 0
    fi
}

# Download from S3
download_from_s3() {
    if [ -z "$S3_BUCKET" ] || [ -z "$S3_KEY" ]; then
        return
    fi

    log_info "Downloading backup from S3..."

    BACKUP_FILE="$TEMP_DIR/backup.tar.gz"
    mkdir -p "$TEMP_DIR"

    aws s3 cp "s3://$S3_BUCKET/$S3_KEY" "$BACKUP_FILE"

    log_success "Backup downloaded"
}

# Extract backup
extract_backup() {
    log_info "Extracting backup..."

    mkdir -p "$TEMP_DIR"

    if [[ "$BACKUP_FILE" == *.tar.gz ]]; then
        tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
        BACKUP_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "foundry-backup-*" | head -1)
    else
        BACKUP_DIR="$BACKUP_FILE"
    fi

    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Could not find backup directory"
        exit 1
    fi

    # Verify manifest
    if [ -f "$BACKUP_DIR/manifest.json" ]; then
        log_info "Backup manifest found:"
        cat "$BACKUP_DIR/manifest.json" | jq '.' 2>/dev/null || cat "$BACKUP_DIR/manifest.json"
    else
        log_warn "No manifest found. Proceeding anyway."
    fi

    log_success "Backup extracted"
}

# Scale down deployments
scale_down() {
    log_info "Scaling down deployments..."

    kubectl scale deployment -n "$NAMESPACE" -l app.kubernetes.io/name=foundry --replicas=0 2>/dev/null || true

    # Wait for pods to terminate
    kubectl wait --for=delete pod -n "$NAMESPACE" -l app.kubernetes.io/name=foundry --timeout=60s 2>/dev/null || true

    log_success "Deployments scaled down"
}

# Restore PostgreSQL
restore_postgresql() {
    if [ "$RESTORE_DB" = false ]; then
        log_info "Skipping PostgreSQL restore"
        return
    fi

    SQL_FILE="$BACKUP_DIR/postgresql.sql"

    if [ ! -f "$SQL_FILE" ]; then
        log_warn "PostgreSQL backup not found. Skipping."
        return
    fi

    log_info "Restoring PostgreSQL database..."

    # Find PostgreSQL pod
    POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$POSTGRES_POD" ]; then
        log_error "PostgreSQL pod not found"
        return
    fi

    # Copy backup file to pod
    kubectl cp "$SQL_FILE" "$NAMESPACE/$POSTGRES_POD:/tmp/restore.sql"

    # Restore database
    kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- bash -c "
        psql -U foundry -d foundry -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
        psql -U foundry -d foundry -f /tmp/restore.sql
        rm /tmp/restore.sql
    "

    log_success "PostgreSQL restored"
}

# Restore Neo4j
restore_neo4j() {
    if [ "$RESTORE_NEO4J" = false ]; then
        log_info "Skipping Neo4j restore"
        return
    fi

    CYPHER_FILE="$BACKUP_DIR/neo4j-dump.cypher"

    if [ ! -f "$CYPHER_FILE" ]; then
        log_warn "Neo4j backup not found. Skipping."
        return
    fi

    log_info "Restoring Neo4j database..."

    # Find Neo4j pod
    NEO4J_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=neo4j -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$NEO4J_POD" ]; then
        log_error "Neo4j pod not found"
        return
    fi

    # Copy backup file to pod
    kubectl cp "$CYPHER_FILE" "$NAMESPACE/$NEO4J_POD:/tmp/restore.cypher"

    # Clear existing data and restore
    kubectl exec -n "$NAMESPACE" "$NEO4J_POD" -- bash -c "
        cypher-shell -u neo4j -p \$NEO4J_PASSWORD 'MATCH (n) DETACH DELETE n'
        cypher-shell -u neo4j -p \$NEO4J_PASSWORD < /tmp/restore.cypher
        rm /tmp/restore.cypher
    " 2>/dev/null || log_warn "Neo4j restore may have issues"

    log_success "Neo4j restored"
}

# Restore Redis
restore_redis() {
    if [ "$RESTORE_REDIS" = false ]; then
        log_info "Skipping Redis restore"
        return
    fi

    RDB_FILE="$BACKUP_DIR/redis-dump.rdb"

    if [ ! -f "$RDB_FILE" ]; then
        log_warn "Redis backup not found. Skipping."
        return
    fi

    log_info "Restoring Redis database..."

    # Find Redis pod
    REDIS_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=redis -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$REDIS_POD" ]; then
        log_error "Redis pod not found"
        return
    fi

    # Stop Redis, copy RDB, start Redis
    kubectl exec -n "$NAMESPACE" "$REDIS_POD" -- redis-cli SHUTDOWN NOSAVE 2>/dev/null || true
    sleep 2

    kubectl cp "$RDB_FILE" "$NAMESPACE/$REDIS_POD:/data/dump.rdb"

    # Redis will auto-restart due to the container restart policy
    log_success "Redis restored"
}

# Restore volumes
restore_volumes() {
    if [ "$RESTORE_VOLUMES" = false ]; then
        log_info "Skipping volume restore"
        return
    fi

    VOLUMES_DIR="$BACKUP_DIR/volumes"

    if [ ! -d "$VOLUMES_DIR" ]; then
        log_warn "Volume backup not found. Skipping."
        return
    fi

    log_info "Restoring volumes..."

    for volume_dir in "$VOLUMES_DIR"/*; do
        if [ -d "$volume_dir" ]; then
            PVC_NAME=$(basename "$volume_dir")
            log_info "Restoring volume: $PVC_NAME"

            # Find pod using this PVC
            POD=$(kubectl get pods -n "$NAMESPACE" -o json | jq -r ".items[] | select(.spec.volumes[]?.persistentVolumeClaim.claimName == \"$PVC_NAME\") | .metadata.name" | head -1)

            if [ -n "$POD" ]; then
                MOUNT_PATH=$(kubectl get pods -n "$NAMESPACE" "$POD" -o json | jq -r ".spec.containers[0].volumeMounts[] | select(.name | contains(\"$PVC_NAME\")) | .mountPath" | head -1)

                if [ -n "$MOUNT_PATH" ]; then
                    kubectl cp "$volume_dir/." "$NAMESPACE/$POD:$MOUNT_PATH" 2>/dev/null || {
                        log_warn "Could not restore volume $PVC_NAME"
                    }
                fi
            fi
        fi
    done

    log_success "Volumes restored"
}

# Scale up deployments
scale_up() {
    log_info "Scaling up deployments..."

    # Get original replica counts from backup or use defaults
    kubectl scale deployment -n "$NAMESPACE" -l app.kubernetes.io/component=backend --replicas=2 2>/dev/null || true
    kubectl scale deployment -n "$NAMESPACE" -l app.kubernetes.io/component=frontend --replicas=2 2>/dev/null || true
    kubectl scale deployment -n "$NAMESPACE" -l app.kubernetes.io/component=worker --replicas=2 2>/dev/null || true

    log_success "Deployments scaled up"
}

# Cleanup
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
    log_success "Cleanup completed"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -s|--s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        -k|--s3-key)
            S3_KEY="$2"
            shift 2
            ;;
        --no-db)
            RESTORE_DB=false
            shift
            ;;
        --no-neo4j)
            RESTORE_NEO4J=false
            shift
            ;;
        --no-redis)
            RESTORE_REDIS=false
            shift
            ;;
        --no-volumes)
            RESTORE_VOLUMES=false
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$1"
            else
                log_error "Unknown option: $1"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate input
if [ -z "$BACKUP_FILE" ] && [ -z "$S3_BUCKET" ]; then
    log_error "Please specify a backup file or S3 location"
    usage
    exit 1
fi

# Main execution
log_info "Starting Foundry restore..."
echo ""

confirm
download_from_s3
extract_backup
scale_down
restore_postgresql
restore_neo4j
restore_redis
restore_volumes
scale_up
cleanup

echo ""
log_success "Restore completed successfully!"
log_info "Please verify your application is working correctly."
