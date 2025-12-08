#!/bin/bash
# =============================================================================
# Foundry Installation Script
# SCALE Tier - Task T167
#
# Automated installation script for on-premise deployment
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
VALUES_FILE=""
DRY_RUN=false
SKIP_DEPS=false
WAIT=true
TIMEOUT="10m"

# Print banner
print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║   ███████╗ ██████╗ ██╗   ██╗███╗   ██╗██████╗ ██████╗ ██╗   ║"
    echo "║   ██╔════╝██╔═══██╗██║   ██║████╗  ██║██╔══██╗██╔══██╗╚██╗  ║"
    echo "║   █████╗  ██║   ██║██║   ██║██╔██╗ ██║██║  ██║██████╔╝ ██║  ║"
    echo "║   ██╔══╝  ██║   ██║██║   ██║██║╚██╗██║██║  ██║██╔══██╗ ██║  ║"
    echo "║   ██║     ╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝██║  ██║██╔╝  ║"
    echo "║   ╚═╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝   ║"
    echo "║                                                               ║"
    echo "║         Enterprise AI Foundation - Installation              ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --namespace NAME     Kubernetes namespace (default: foundry)"
    echo "  -r, --release NAME       Helm release name (default: foundry)"
    echo "  -f, --values FILE        Custom values file"
    echo "  -d, --dry-run            Perform a dry run"
    echo "  -s, --skip-deps          Skip dependency update"
    echo "  --no-wait                Don't wait for resources to be ready"
    echo "  -t, --timeout DURATION   Timeout for waiting (default: 10m)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Install with defaults"
    echo "  $0 -n my-namespace -f custom.yaml    # Custom namespace and values"
    echo "  $0 --dry-run                          # Preview installation"
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
        log_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    log_success "kubectl found: $(kubectl version --client --short 2>/dev/null || kubectl version --client)"

    # Check helm
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed. Please install helm first."
        exit 1
    fi
    log_success "helm found: $(helm version --short)"

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    log_success "Connected to Kubernetes cluster"

    # Check if we have necessary permissions
    if ! kubectl auth can-i create deployments -n "$NAMESPACE" &> /dev/null; then
        log_warn "You may not have sufficient permissions in namespace '$NAMESPACE'"
    fi
}

# Create namespace if it doesn't exist
create_namespace() {
    log_info "Checking namespace '$NAMESPACE'..."

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Namespace '$NAMESPACE' already exists"
    else
        log_info "Creating namespace '$NAMESPACE'..."
        kubectl create namespace "$NAMESPACE"
        log_success "Namespace '$NAMESPACE' created"
    fi
}

# Update Helm dependencies
update_dependencies() {
    if [ "$SKIP_DEPS" = true ]; then
        log_info "Skipping dependency update"
        return
    fi

    log_info "Updating Helm dependencies..."

    CHART_DIR="$(dirname "$0")/../kubernetes/helm/foundry"

    if [ ! -d "$CHART_DIR" ]; then
        log_error "Chart directory not found: $CHART_DIR"
        exit 1
    fi

    helm dependency update "$CHART_DIR"
    log_success "Dependencies updated"
}

# Install or upgrade Foundry
install_foundry() {
    log_info "Installing Foundry..."

    CHART_DIR="$(dirname "$0")/../kubernetes/helm/foundry"

    HELM_CMD="helm upgrade --install $RELEASE_NAME $CHART_DIR"
    HELM_CMD="$HELM_CMD --namespace $NAMESPACE"

    if [ -n "$VALUES_FILE" ]; then
        if [ ! -f "$VALUES_FILE" ]; then
            log_error "Values file not found: $VALUES_FILE"
            exit 1
        fi
        HELM_CMD="$HELM_CMD --values $VALUES_FILE"
    fi

    if [ "$DRY_RUN" = true ]; then
        HELM_CMD="$HELM_CMD --dry-run"
    fi

    if [ "$WAIT" = true ]; then
        HELM_CMD="$HELM_CMD --wait --timeout $TIMEOUT"
    fi

    log_info "Running: $HELM_CMD"

    eval "$HELM_CMD"

    if [ "$DRY_RUN" = true ]; then
        log_info "Dry run completed. No changes were made."
    else
        log_success "Foundry installed successfully!"
    fi
}

# Post-installation information
print_post_install() {
    if [ "$DRY_RUN" = true ]; then
        return
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                    Installation Complete!                      ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Foundry has been installed in the '$NAMESPACE' namespace."
    echo ""
    echo "To check the status of your deployment:"
    echo "  kubectl get pods -n $NAMESPACE"
    echo ""
    echo "To get the application URL:"
    echo "  kubectl get ingress -n $NAMESPACE"
    echo ""
    echo "To view logs:"
    echo "  kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=foundry -f"
    echo ""
    echo "For more information, visit:"
    echo "  https://docs.foundry.dev/deployment/kubernetes"
    echo ""
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
        -f|--values)
            VALUES_FILE="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -s|--skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --no-wait)
            WAIT=false
            shift
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
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
print_banner
check_prerequisites
create_namespace
update_dependencies
install_foundry
print_post_install
