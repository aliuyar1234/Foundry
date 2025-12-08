#!/bin/bash
# =============================================================================
# Foundry Backup Script
# SCALE Tier - Task T169
#
# Automated backup script for on-premise deployment
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
BACKUP_DIR="/var/backups/foundry"
S3_BUCKET=""
S3_PREFIX="foundry-backups"
RETENTION_DAYS=30
COMPRESS=true
INCLUDE_VOLUMES=true
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="foundry-backup-$TIMESTAMP"

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --namespace NAME     Kubernetes namespace (default: foundry)"
    echo "  -d, --backup-dir DIR     Local backup directory (default: /var/backups/foundry)"
    echo "  -s, --s3-bucket BUCKET   S3 bucket for remote backup"
    echo "  -p, --s3-prefix PREFIX   S3 prefix (default: foundry-backups)"
    echo "  -r, --retention DAYS     Retention period in days (default: 30)"
    echo "  --no-compress            Don't compress backups"
    echo "  --no-volumes             Don't backup persistent volumes"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Local backup"
    echo "  $0 -s my-bucket -p prod/backups      # S3 backup"
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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed."
        exit 1
    fi

    # Check pg_dump
    if ! command -v pg_dump &> /dev/null; then
        log_warn "pg_dump not found locally. Will use pod exec."
    fi

    # Check AWS CLI if S3 backup is requested
    if [ -n "$S3_BUCKET" ]; then
        if ! command -v aws &> /dev/null; then
            log_error "aws CLI is not installed but S3 backup was requested."
            exit 1
        fi
    fi

    # Create backup directory
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    log_success "Prerequisites checked"
}

# Get database credentials
get_db_credentials() {
    log_info "Fetching database credentials..."

    # Get PostgreSQL password
    POSTGRES_SECRET=$(kubectl get secret -n "$NAMESPACE" -l app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -n "$POSTGRES_SECRET" ]; then
        POSTGRES_PASSWORD=$(kubectl get secret -n "$NAMESPACE" "$POSTGRES_SECRET" -o jsonpath='{.data.password}' | base64 -d)
    else
        log_warn "PostgreSQL secret not found. Database backup may fail."
    fi
}

# Backup PostgreSQL
backup_postgresql() {
    log_info "Backing up PostgreSQL database..."

    # Find PostgreSQL pod
    POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$POSTGRES_POD" ]; then
        log_warn "PostgreSQL pod not found. Skipping database backup."
        return
    fi

    # Perform backup
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME/postgresql.sql"

    kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- pg_dump \
        -U foundry \
        -d foundry \
        --no-owner \
        --no-privileges \
        > "$BACKUP_FILE"

    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        log_success "PostgreSQL backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        log_error "PostgreSQL backup failed or is empty"
    fi
}

# Backup Neo4j
backup_neo4j() {
    log_info "Backing up Neo4j database..."

    # Find Neo4j pod
    NEO4J_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=neo4j -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$NEO4J_POD" ]; then
        log_warn "Neo4j pod not found. Skipping Neo4j backup."
        return
    fi

    # Export database using cypher-shell
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME/neo4j-dump.cypher"

    # Use APOC export if available
    kubectl exec -n "$NAMESPACE" "$NEO4J_POD" -- cypher-shell \
        -u neo4j \
        -p "$NEO4J_PASSWORD" \
        "CALL apoc.export.cypher.all(null, {streamStatements:true})" \
        > "$BACKUP_FILE" 2>/dev/null || {
            log_warn "APOC export not available. Using basic export."
            # Fall back to basic node/relationship export
            kubectl exec -n "$NAMESPACE" "$NEO4J_POD" -- cypher-shell \
                -u neo4j \
                -p "$NEO4J_PASSWORD" \
                "MATCH (n) RETURN n LIMIT 1000000" \
                > "$BACKUP_FILE"
        }

    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        log_success "Neo4j backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        log_warn "Neo4j backup may be empty"
    fi
}

# Backup Redis
backup_redis() {
    log_info "Backing up Redis..."

    # Find Redis pod
    REDIS_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=redis -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$REDIS_POD" ]; then
        log_warn "Redis pod not found. Skipping Redis backup."
        return
    fi

    # Trigger RDB save
    kubectl exec -n "$NAMESPACE" "$REDIS_POD" -- redis-cli BGSAVE

    # Wait for save to complete
    sleep 5

    # Copy RDB file
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME/redis-dump.rdb"
    kubectl cp "$NAMESPACE/$REDIS_POD:/data/dump.rdb" "$BACKUP_FILE" 2>/dev/null || {
        log_warn "Could not copy Redis dump file"
    }

    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        log_success "Redis backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        log_warn "Redis backup may have failed"
    fi
}

# Backup Kubernetes resources
backup_k8s_resources() {
    log_info "Backing up Kubernetes resources..."

    RESOURCES_DIR="$BACKUP_DIR/$BACKUP_NAME/k8s-resources"
    mkdir -p "$RESOURCES_DIR"

    # Export important resources
    for resource in configmaps secrets services deployments ingresses; do
        kubectl get "$resource" -n "$NAMESPACE" -o yaml > "$RESOURCES_DIR/$resource.yaml" 2>/dev/null || true
    done

    # Export Helm release info
    helm get values foundry -n "$NAMESPACE" > "$RESOURCES_DIR/helm-values.yaml" 2>/dev/null || true
    helm get manifest foundry -n "$NAMESPACE" > "$RESOURCES_DIR/helm-manifest.yaml" 2>/dev/null || true

    log_success "Kubernetes resources backed up"
}

# Backup persistent volumes
backup_volumes() {
    if [ "$INCLUDE_VOLUMES" = false ]; then
        log_info "Skipping volume backup"
        return
    fi

    log_info "Backing up persistent volumes..."

    VOLUMES_DIR="$BACKUP_DIR/$BACKUP_NAME/volumes"
    mkdir -p "$VOLUMES_DIR"

    # Get list of PVCs
    PVCS=$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}')

    for pvc in $PVCS; do
        log_info "Backing up PVC: $pvc"

        # Find pod using this PVC
        POD=$(kubectl get pods -n "$NAMESPACE" -o json | jq -r ".items[] | select(.spec.volumes[]?.persistentVolumeClaim.claimName == \"$pvc\") | .metadata.name" | head -1)

        if [ -n "$POD" ]; then
            # Find mount path
            MOUNT_PATH=$(kubectl get pods -n "$NAMESPACE" "$POD" -o json | jq -r ".spec.containers[0].volumeMounts[] | select(.name | contains(\"$pvc\")) | .mountPath" | head -1)

            if [ -n "$MOUNT_PATH" ]; then
                kubectl cp "$NAMESPACE/$POD:$MOUNT_PATH" "$VOLUMES_DIR/$pvc" 2>/dev/null || {
                    log_warn "Could not backup volume $pvc"
                }
            fi
        fi
    done

    log_success "Volume backup completed"
}

# Compress backup
compress_backup() {
    if [ "$COMPRESS" = false ]; then
        log_info "Skipping compression"
        return
    fi

    log_info "Compressing backup..."

    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
    rm -rf "$BACKUP_NAME"

    log_success "Backup compressed: $(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)"
}

# Upload to S3
upload_to_s3() {
    if [ -z "$S3_BUCKET" ]; then
        log_info "No S3 bucket specified. Skipping remote upload."
        return
    fi

    log_info "Uploading backup to S3..."

    if [ "$COMPRESS" = true ]; then
        BACKUP_FILE="${BACKUP_NAME}.tar.gz"
    else
        BACKUP_FILE="$BACKUP_NAME"
    fi

    aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_FILE"

    log_success "Backup uploaded to s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_FILE"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    # Local cleanup
    find "$BACKUP_DIR" -name "foundry-backup-*" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

    # S3 cleanup
    if [ -n "$S3_BUCKET" ]; then
        # This would require more complex logic to handle S3 lifecycle
        log_info "S3 lifecycle policies should be configured for automatic cleanup"
    fi

    log_success "Cleanup completed"
}

# Create backup manifest
create_manifest() {
    log_info "Creating backup manifest..."

    MANIFEST_FILE="$BACKUP_DIR/$BACKUP_NAME/manifest.json"

    cat > "$MANIFEST_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "backup_name": "$BACKUP_NAME",
  "namespace": "$NAMESPACE",
  "components": {
    "postgresql": $([ -f "$BACKUP_DIR/$BACKUP_NAME/postgresql.sql" ] && echo "true" || echo "false"),
    "neo4j": $([ -f "$BACKUP_DIR/$BACKUP_NAME/neo4j-dump.cypher" ] && echo "true" || echo "false"),
    "redis": $([ -f "$BACKUP_DIR/$BACKUP_NAME/redis-dump.rdb" ] && echo "true" || echo "false"),
    "volumes": $([ -d "$BACKUP_DIR/$BACKUP_NAME/volumes" ] && echo "true" || echo "false"),
    "k8s_resources": $([ -d "$BACKUP_DIR/$BACKUP_NAME/k8s-resources" ] && echo "true" || echo "false")
  },
  "foundry_version": "$(helm get values foundry -n $NAMESPACE -o json 2>/dev/null | jq -r '.image.tag // "unknown"')"
}
EOF

    log_success "Manifest created"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -d|--backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -s|--s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        -p|--s3-prefix)
            S3_PREFIX="$2"
            shift 2
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --no-compress)
            COMPRESS=false
            shift
            ;;
        --no-volumes)
            INCLUDE_VOLUMES=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
log_info "Starting Foundry backup..."
echo ""

check_prerequisites
get_db_credentials
backup_postgresql
backup_neo4j
backup_redis
backup_k8s_resources
backup_volumes
create_manifest
compress_backup
upload_to_s3
cleanup_old_backups

echo ""
log_success "Backup completed successfully!"
log_info "Backup location: $BACKUP_DIR/${BACKUP_NAME}$([ "$COMPRESS" = true ] && echo '.tar.gz')"
