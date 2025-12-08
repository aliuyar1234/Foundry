# Air-Gapped Deployment Guide

Deploy Foundry in isolated networks without internet connectivity for regulated industries and high-security environments.

## Overview

Air-gapped deployments require:
1. Pre-packaged container images
2. Offline license activation
3. Local AI model fallback
4. Manual update procedures

## Prerequisites

### Transfer System
- USB drive or secure file transfer mechanism (minimum 20GB)
- Access to internet-connected build system
- Access to air-gapped target environment

### Target Environment
- Kubernetes cluster 1.25+ OR Docker Compose
- Container registry (Harbor, Docker Registry, etc.)
- 32GB+ RAM for AI workloads
- 200GB+ storage

## Preparation (Internet-Connected System)

### 1. Package Container Images

```bash
#!/bin/bash
# package-images.sh

VERSION="${1:-latest}"
OUTPUT_DIR="./foundry-airgap-${VERSION}"

mkdir -p "${OUTPUT_DIR}/images"

# List of required images
IMAGES=(
  "foundry/frontend:${VERSION}"
  "foundry/backend:${VERSION}"
  "postgres:15-alpine"
  "neo4j:5-community"
  "redis:7-alpine"
  "nginx:alpine"
)

# Pull and save images
for IMAGE in "${IMAGES[@]}"; do
  echo "Pulling ${IMAGE}..."
  docker pull "${IMAGE}"

  FILENAME=$(echo "${IMAGE}" | tr '/:' '_').tar
  echo "Saving to ${FILENAME}..."
  docker save "${IMAGE}" -o "${OUTPUT_DIR}/images/${FILENAME}"
done

# Create manifest
cat > "${OUTPUT_DIR}/manifest.json" << EOF
{
  "version": "${VERSION}",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "images": [
$(printf '    "%s",\n' "${IMAGES[@]}" | sed '$ s/,$//')
  ]
}
EOF

echo "Package complete: ${OUTPUT_DIR}"
```

### 2. Package Helm Charts

```bash
#!/bin/bash
# package-helm.sh

VERSION="${1:-latest}"
OUTPUT_DIR="./foundry-airgap-${VERSION}"

mkdir -p "${OUTPUT_DIR}/helm"

# Package main chart
helm package ./deployment/kubernetes/helm/foundry \
  --destination "${OUTPUT_DIR}/helm" \
  --version "${VERSION}"

# Package dependencies
helm dependency update ./deployment/kubernetes/helm/foundry
cp -r ./deployment/kubernetes/helm/foundry/charts/* "${OUTPUT_DIR}/helm/"

echo "Helm charts packaged to ${OUTPUT_DIR}/helm"
```

### 3. Package Offline AI Models (Optional)

```bash
#!/bin/bash
# package-models.sh

OUTPUT_DIR="./foundry-airgap-models"
mkdir -p "${OUTPUT_DIR}"

# Download Ollama models for offline use
MODELS=(
  "llama3:8b"
  "codellama:7b"
  "mistral:7b"
)

for MODEL in "${MODELS[@]}"; do
  echo "Pulling ${MODEL}..."
  ollama pull "${MODEL}"

  # Export model
  ollama export "${MODEL}" > "${OUTPUT_DIR}/${MODEL//[:\/]/_}.model"
done

echo "Models packaged to ${OUTPUT_DIR}"
```

### 4. Create Transfer Package

```bash
#!/bin/bash
# create-transfer-package.sh

VERSION="${1:-latest}"
PACKAGE_NAME="foundry-airgap-${VERSION}"

# Combine all components
tar -czvf "${PACKAGE_NAME}.tar.gz" \
  "${PACKAGE_NAME}/" \
  ./deployment/scripts/ \
  ./docs/deployment/ \
  ./CHANGELOG.md

# Create checksum
sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"

echo "Transfer package created: ${PACKAGE_NAME}.tar.gz"
echo "Checksum: $(cat ${PACKAGE_NAME}.tar.gz.sha256)"
```

## Installation (Air-Gapped Environment)

### 1. Verify Package Integrity

```bash
#!/bin/bash
# verify-package.sh

PACKAGE="${1}"

if [ -z "${PACKAGE}" ]; then
  echo "Usage: verify-package.sh <package.tar.gz>"
  exit 1
fi

# Verify checksum
echo "Verifying checksum..."
sha256sum -c "${PACKAGE}.sha256"
if [ $? -ne 0 ]; then
  echo "ERROR: Checksum verification failed!"
  exit 1
fi

echo "Package verified successfully"

# Extract
tar -xzvf "${PACKAGE}"
```

### 2. Load Container Images

```bash
#!/bin/bash
# load-images.sh

IMAGES_DIR="${1:-./foundry-airgap-latest/images}"
REGISTRY="${2:-localhost:5000}"

# Load images to local Docker
for IMAGE_FILE in "${IMAGES_DIR}"/*.tar; do
  echo "Loading ${IMAGE_FILE}..."
  docker load -i "${IMAGE_FILE}"
done

# Tag and push to local registry
IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep foundry)
for IMAGE in ${IMAGES}; do
  LOCAL_IMAGE="${REGISTRY}/${IMAGE}"
  echo "Pushing ${IMAGE} to ${LOCAL_IMAGE}..."
  docker tag "${IMAGE}" "${LOCAL_IMAGE}"
  docker push "${LOCAL_IMAGE}"
done
```

### 3. Configure Local Registry

```yaml
# registry-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registry
  namespace: registry
spec:
  replicas: 1
  selector:
    matchLabels:
      app: registry
  template:
    metadata:
      labels:
        app: registry
    spec:
      containers:
        - name: registry
          image: registry:2
          ports:
            - containerPort: 5000
          volumeMounts:
            - name: registry-data
              mountPath: /var/lib/registry
      volumes:
        - name: registry-data
          persistentVolumeClaim:
            claimName: registry-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: registry
  namespace: registry
spec:
  selector:
    app: registry
  ports:
    - port: 5000
      targetPort: 5000
```

### 4. Install Foundry

```bash
#!/bin/bash
# install-airgap.sh

REGISTRY="${1:-localhost:5000}"
NAMESPACE="${2:-foundry}"

# Create namespace
kubectl create namespace "${NAMESPACE}" 2>/dev/null || true

# Create secrets
kubectl create secret generic foundry-secrets \
  --namespace "${NAMESPACE}" \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  --from-literal=postgres-password="$(openssl rand -base64 24)" \
  --from-literal=neo4j-password="$(openssl rand -base64 24)" \
  --from-literal=encryption-key="$(openssl rand -base64 32)"

# Install with air-gapped values
helm install foundry ./helm/foundry-*.tgz \
  --namespace "${NAMESPACE}" \
  --set global.imageRegistry="${REGISTRY}" \
  --set global.environment=production \
  --values values-airgap.yaml
```

### 5. Air-Gapped Values File

```yaml
# values-airgap.yaml
global:
  environment: production
  imageRegistry: localhost:5000  # Local registry
  imagePullSecrets: []  # No secrets needed for local registry

frontend:
  image:
    repository: foundry/frontend
    pullPolicy: Never  # Don't try to pull from internet

backend:
  image:
    repository: foundry/backend
    pullPolicy: Never
  env:
    OFFLINE_MODE: "true"
    AI_PROVIDER: "ollama"
    OLLAMA_HOST: "http://ollama:11434"

worker:
  image:
    repository: foundry/backend
    pullPolicy: Never

# Use bundled databases
postgresql:
  enabled: true
  image:
    repository: postgres
    tag: 15-alpine
    pullPolicy: Never

neo4j:
  enabled: true
  image:
    repository: neo4j
    tag: 5-community
    pullPolicy: Never

redis:
  enabled: true
  image:
    repository: redis
    tag: 7-alpine
    pullPolicy: Never

# Disable external dependencies
ingress:
  enabled: true
  annotations:
    # No cert-manager (manual certs)
    kubernetes.io/tls-acme: "false"

monitoring:
  enabled: true
  serviceMonitor:
    enabled: false  # Manual Prometheus config
```

## Offline License Activation

### Generate Hardware Fingerprint

```bash
# On the air-gapped system
./foundry-cli license fingerprint > fingerprint.txt

# Contents example:
# {
#   "machineId": "abc123...",
#   "hostname": "foundry-prod-01",
#   "cpuId": "...",
#   "timestamp": "2024-01-15T10:30:00Z"
# }
```

### Obtain Offline License

1. Transfer `fingerprint.txt` to internet-connected system
2. Submit to licensing portal or contact sales
3. Receive `license.key` file
4. Transfer `license.key` to air-gapped system

### Activate License

```bash
# Install license
kubectl create secret generic foundry-license \
  --namespace foundry \
  --from-file=license.key=./license.key

# Verify activation
kubectl exec -it deployment/foundry-backend -n foundry -- \
  ./foundry-cli license verify
```

## Offline AI Configuration

### Deploy Ollama for Local AI

```yaml
# ollama-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama
  namespace: foundry
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ollama
  template:
    metadata:
      labels:
        app: ollama
    spec:
      containers:
        - name: ollama
          image: localhost:5000/ollama/ollama:latest
          ports:
            - containerPort: 11434
          volumeMounts:
            - name: models
              mountPath: /root/.ollama
          resources:
            limits:
              nvidia.com/gpu: 1  # If GPU available
              memory: 16Gi
            requests:
              memory: 8Gi
      volumes:
        - name: models
          persistentVolumeClaim:
            claimName: ollama-models-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: foundry
spec:
  selector:
    app: ollama
  ports:
    - port: 11434
      targetPort: 11434
```

### Load Offline Models

```bash
# Copy model files to PVC
kubectl cp ./models/ foundry/ollama-pod:/root/.ollama/models/

# Verify models
kubectl exec -it deployment/ollama -n foundry -- ollama list
```

## Update Procedures

### Prepare Update Package

On internet-connected system:

```bash
./package-images.sh v2.0.0
./package-helm.sh v2.0.0
./create-transfer-package.sh v2.0.0
```

### Apply Update

On air-gapped system:

```bash
# Verify and extract
./verify-package.sh foundry-airgap-v2.0.0.tar.gz

# Load new images
./load-images.sh ./foundry-airgap-v2.0.0/images localhost:5000

# Upgrade Helm release
helm upgrade foundry ./helm/foundry-v2.0.0.tgz \
  --namespace foundry \
  --values values-airgap.yaml \
  --set global.imageRegistry=localhost:5000

# Verify upgrade
kubectl rollout status deployment/foundry-backend -n foundry
```

## Data Sync (Optional)

For environments that periodically connect:

### Export Data Package

```bash
# Create sync package
kubectl exec -it deployment/foundry-backend -n foundry -- \
  ./foundry-cli sync export --output /tmp/sync-package.zip

# Copy to transfer medium
kubectl cp foundry/foundry-backend-pod:/tmp/sync-package.zip ./sync-package.zip
```

### Import Data Package

```bash
# Copy to pod
kubectl cp ./sync-package.zip foundry/foundry-backend-pod:/tmp/sync-package.zip

# Import
kubectl exec -it deployment/foundry-backend -n foundry -- \
  ./foundry-cli sync import --input /tmp/sync-package.zip
```

## Security Considerations

### Network Isolation

```yaml
# network-policy-airgap.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-external
  namespace: foundry
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    # Only allow internal cluster traffic
    - to:
        - podSelector: {}
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
```

### Certificate Management

```bash
# Generate self-signed CA
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/CN=Foundry Internal CA"

# Generate server certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/CN=foundry.internal"
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt

# Create TLS secret
kubectl create secret tls foundry-tls \
  --namespace foundry \
  --cert=server.crt \
  --key=server.key
```

## Troubleshooting

### Image Pull Errors

```bash
# Verify images in local registry
curl http://localhost:5000/v2/_catalog

# Check image tags
curl http://localhost:5000/v2/foundry/backend/tags/list

# Verify pod image pull policy
kubectl get pod -n foundry -o yaml | grep imagePullPolicy
```

### License Validation Failures

```bash
# Check license status
kubectl exec -it deployment/foundry-backend -n foundry -- \
  ./foundry-cli license status

# Regenerate fingerprint if hardware changed
./foundry-cli license fingerprint --force
```

### Offline AI Not Working

```bash
# Verify Ollama is running
kubectl logs deployment/ollama -n foundry

# Test Ollama directly
kubectl exec -it deployment/ollama -n foundry -- \
  curl http://localhost:11434/api/generate \
  -d '{"model": "llama3:8b", "prompt": "Hello"}'
```
