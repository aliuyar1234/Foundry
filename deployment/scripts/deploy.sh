#!/bin/bash
# Foundry Deployment Script
# Usage: ./deploy.sh [environment] [version]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Default values
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
NAMESPACE="foundry"
HELM_RELEASE="foundry"
HELM_CHART_PATH="${PROJECT_ROOT}/deployment/helm/foundry"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    # Check helm
    if ! command -v helm &> /dev/null; then
        log_error "helm not found. Please install helm."
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi

    log_info "Prerequisites OK"
}

get_values_file() {
    local env=$1
    local values_file="${PROJECT_ROOT}/deployment/helm/values-${env}.yaml"

    if [ ! -f "$values_file" ]; then
        log_error "Values file not found: $values_file"
        exit 1
    fi

    echo "$values_file"
}

pre_deploy_checks() {
    log_info "Running pre-deploy checks..."

    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Creating namespace $NAMESPACE..."
        kubectl create namespace "$NAMESPACE"
    fi

    # Check secrets exist
    if ! kubectl get secret foundry-secrets -n "$NAMESPACE" &> /dev/null; then
        log_error "Secret 'foundry-secrets' not found in namespace $NAMESPACE"
        log_error "Create it with: kubectl create secret generic foundry-secrets --namespace $NAMESPACE ..."
        exit 1
    fi

    # Check current deployment status
    if helm status "$HELM_RELEASE" -n "$NAMESPACE" &> /dev/null; then
        CURRENT_VERSION=$(kubectl get deployment foundry-backend -n "$NAMESPACE" \
            -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | cut -d: -f2 || echo "unknown")
        log_info "Current deployed version: $CURRENT_VERSION"
    else
        log_info "No existing deployment found"
    fi

    log_info "Pre-deploy checks passed"
}

create_backup() {
    log_info "Creating pre-deploy backup..."

    if kubectl get deployment foundry-backend -n "$NAMESPACE" &> /dev/null; then
        kubectl exec deployment/foundry-backend -n "$NAMESPACE" -- \
            /scripts/backup.sh "pre-deploy-${VERSION}" || true
        log_info "Backup created"
    else
        log_warn "No existing deployment to backup"
    fi
}

deploy() {
    local values_file=$(get_values_file "$ENVIRONMENT")

    log_info "Deploying Foundry version $VERSION to $ENVIRONMENT..."
    log_info "Using values file: $values_file"

    # Update helm dependencies
    helm dependency update "$HELM_CHART_PATH"

    # Deploy
    helm upgrade --install "$HELM_RELEASE" "$HELM_CHART_PATH" \
        --namespace "$NAMESPACE" \
        --values "$values_file" \
        --set global.imageTag="$VERSION" \
        --wait \
        --timeout 10m

    log_info "Helm deployment completed"
}

wait_for_rollout() {
    log_info "Waiting for rollout to complete..."

    kubectl rollout status deployment/foundry-backend -n "$NAMESPACE" --timeout=5m
    kubectl rollout status deployment/foundry-frontend -n "$NAMESPACE" --timeout=5m
    kubectl rollout status deployment/foundry-worker -n "$NAMESPACE" --timeout=5m

    log_info "All deployments rolled out successfully"
}

run_smoke_tests() {
    log_info "Running smoke tests..."

    # Wait for pods to be ready
    sleep 10

    # Health check
    kubectl exec deployment/foundry-backend -n "$NAMESPACE" -- \
        curl -sf localhost:3000/health > /dev/null

    log_info "Smoke tests passed"
}

post_deploy() {
    log_info "Running post-deploy tasks..."

    # Get new version
    NEW_VERSION=$(kubectl get deployment foundry-backend -n "$NAMESPACE" \
        -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)

    # Print deployment info
    echo ""
    echo "==========================================="
    echo "Deployment Summary"
    echo "==========================================="
    echo "Environment: $ENVIRONMENT"
    echo "Version: $NEW_VERSION"
    echo "Namespace: $NAMESPACE"
    echo ""
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/instance=$HELM_RELEASE
    echo ""
    echo "Services:"
    kubectl get svc -n "$NAMESPACE" -l app.kubernetes.io/instance=$HELM_RELEASE
    echo "==========================================="
}

rollback() {
    log_warn "Rolling back deployment..."
    helm rollback "$HELM_RELEASE" -n "$NAMESPACE"
    kubectl rollout status deployment/foundry-backend -n "$NAMESPACE" --timeout=5m
    log_info "Rollback completed"
}

# Main execution
main() {
    echo "==========================================="
    echo "Foundry Deployment Script"
    echo "==========================================="
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "==========================================="
    echo ""

    check_prerequisites
    pre_deploy_checks

    # Confirmation for production
    if [ "$ENVIRONMENT" == "production" ]; then
        echo ""
        read -p "Deploy to PRODUCTION? This is irreversible. (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Deployment cancelled"
            exit 0
        fi
        create_backup
    fi

    # Deploy
    if ! deploy; then
        log_error "Deployment failed"
        if [ "$ENVIRONMENT" == "production" ]; then
            rollback
        fi
        exit 1
    fi

    # Wait for rollout
    if ! wait_for_rollout; then
        log_error "Rollout failed"
        if [ "$ENVIRONMENT" == "production" ]; then
            rollback
        fi
        exit 1
    fi

    # Smoke tests
    if ! run_smoke_tests; then
        log_error "Smoke tests failed"
        if [ "$ENVIRONMENT" == "production" ]; then
            read -p "Rollback? (yes/no): " confirm
            if [ "$confirm" == "yes" ]; then
                rollback
            fi
        fi
        exit 1
    fi

    post_deploy

    log_info "Deployment completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [environment] [version]"
        echo ""
        echo "Environments: staging, production"
        echo "Version: Docker image tag (default: latest)"
        echo ""
        echo "Examples:"
        echo "  $0 staging latest"
        echo "  $0 production v2.0.0"
        exit 0
        ;;
    --rollback)
        ENVIRONMENT="${2:-staging}"
        check_prerequisites
        rollback
        exit 0
        ;;
    *)
        main
        ;;
esac
