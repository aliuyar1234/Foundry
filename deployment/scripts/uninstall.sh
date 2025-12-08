#!/bin/bash
# =============================================================================
# Foundry Uninstallation Script
# SCALE Tier - Task T168
#
# Automated uninstallation script for on-premise deployment
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
RELEASE_NAME="foundry"
DELETE_NAMESPACE=false
DELETE_PVCS=false
FORCE=false

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --namespace NAME     Kubernetes namespace (default: foundry)"
    echo "  -r, --release NAME       Helm release name (default: foundry)"
    echo "  --delete-namespace       Delete the namespace after uninstall"
    echo "  --delete-pvcs            Delete persistent volume claims"
    echo "  -f, --force              Skip confirmation prompt"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Uninstall with defaults"
    echo "  $0 --delete-pvcs --delete-namespace  # Full cleanup"
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
    echo -e "${YELLOW}WARNING: This will uninstall Foundry from namespace '$NAMESPACE'${NC}"

    if [ "$DELETE_PVCS" = true ]; then
        echo -e "${RED}WARNING: This will DELETE all persistent data!${NC}"
    fi

    if [ "$DELETE_NAMESPACE" = true ]; then
        echo -e "${RED}WARNING: This will DELETE the entire namespace!${NC}"
    fi

    echo ""
    read -p "Are you sure you want to continue? (yes/no): " response

    if [ "$response" != "yes" ]; then
        log_info "Uninstallation cancelled."
        exit 0
    fi
}

# Uninstall Helm release
uninstall_release() {
    log_info "Uninstalling Helm release '$RELEASE_NAME'..."

    if helm status "$RELEASE_NAME" -n "$NAMESPACE" &> /dev/null; then
        helm uninstall "$RELEASE_NAME" -n "$NAMESPACE"
        log_success "Helm release uninstalled"
    else
        log_warn "Release '$RELEASE_NAME' not found in namespace '$NAMESPACE'"
    fi
}

# Delete PVCs
delete_pvcs() {
    if [ "$DELETE_PVCS" = false ]; then
        log_info "Skipping PVC deletion (use --delete-pvcs to remove)"
        return
    fi

    log_info "Deleting persistent volume claims..."

    # List PVCs before deleting
    PVCS=$(kubectl get pvc -n "$NAMESPACE" -o name 2>/dev/null || true)

    if [ -n "$PVCS" ]; then
        echo "$PVCS" | while read pvc; do
            log_info "Deleting $pvc"
            kubectl delete "$pvc" -n "$NAMESPACE" --wait=false
        done
        log_success "PVCs deleted"
    else
        log_info "No PVCs found"
    fi
}

# Delete namespace
delete_namespace() {
    if [ "$DELETE_NAMESPACE" = false ]; then
        log_info "Skipping namespace deletion (use --delete-namespace to remove)"
        return
    fi

    log_info "Deleting namespace '$NAMESPACE'..."

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl delete namespace "$NAMESPACE" --wait=true
        log_success "Namespace deleted"
    else
        log_warn "Namespace '$NAMESPACE' not found"
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -r|--release)
            RELEASE_NAME="$2"
            shift 2
            ;;
        --delete-namespace)
            DELETE_NAMESPACE=true
            shift
            ;;
        --delete-pvcs)
            DELETE_PVCS=true
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
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
confirm
uninstall_release
delete_pvcs
delete_namespace

echo ""
log_success "Foundry uninstallation complete!"
