# Kubernetes Deployment Guide

Enterprise-grade deployment using Kubernetes for scalability and high availability.

## Prerequisites

- Kubernetes cluster 1.25+
- kubectl configured
- Helm 3.12+
- 16GB+ cluster RAM
- 100GB+ persistent storage

## Quick Start with Helm

```bash
# Add Foundry Helm repository
helm repo add foundry https://charts.foundry.io
helm repo update

# Create namespace
kubectl create namespace foundry

# Create secrets
kubectl create secret generic foundry-secrets \
  --namespace foundry \
  --from-literal=jwt-secret='your-jwt-secret-here' \
  --from-literal=postgres-password='your-db-password' \
  --from-literal=neo4j-password='your-neo4j-password'

# Install Foundry
helm install foundry foundry/foundry \
  --namespace foundry \
  --values values.yaml

# Verify deployment
kubectl get pods -n foundry
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Ingress Controller                       │
│                    (nginx-ingress/traefik)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌───────────┐     ┌───────────┐     ┌───────────┐
    │ Frontend  │     │  Backend  │     │  Worker   │
    │ Deployment│     │ Deployment│     │ Deployment│
    │ (3 pods)  │     │ (3 pods)  │     │ (2 pods)  │
    └───────────┘     └───────────┘     └───────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌───────────┐     ┌───────────┐     ┌───────────┐
    │PostgreSQL │     │   Neo4j   │     │   Redis   │
    │StatefulSet│     │StatefulSet│     │StatefulSet│
    │ (Primary) │     │ (Single)  │     │ (Cluster) │
    └───────────┘     └───────────┘     └───────────┘
```

## Helm Values Configuration

### Minimal Production Values

```yaml
# values.yaml
global:
  environment: production
  domain: foundry.your-company.com

frontend:
  replicaCount: 3
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

backend:
  replicaCount: 3
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 2Gi
  env:
    LOG_LEVEL: info
    MAX_FILE_SIZE: 50MB

worker:
  replicaCount: 2
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi

postgresql:
  enabled: true
  auth:
    existingSecret: foundry-secrets
    secretKeys:
      adminPasswordKey: postgres-password
  primary:
    persistence:
      size: 100Gi
    resources:
      requests:
        cpu: 500m
        memory: 2Gi
      limits:
        cpu: 2000m
        memory: 8Gi

neo4j:
  enabled: true
  neo4j:
    password: ""  # Use existing secret
    passwordFromSecret: foundry-secrets
    passwordSecretKey: neo4j-password
  volumes:
    data:
      size: 100Gi

redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false
  master:
    persistence:
      size: 10Gi

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: foundry.your-company.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: foundry-tls
      hosts:
        - foundry.your-company.com
```

### Enterprise High-Availability Values

```yaml
# values-enterprise.yaml
global:
  environment: production
  domain: foundry.enterprise.com

frontend:
  replicaCount: 5
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70

backend:
  replicaCount: 5
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

worker:
  replicaCount: 5
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 15
    targetMemoryUtilizationPercentage: 80

postgresql:
  architecture: replication
  primary:
    persistence:
      size: 500Gi
  readReplicas:
    replicaCount: 2
    persistence:
      size: 500Gi

redis:
  architecture: replication
  replica:
    replicaCount: 2

podDisruptionBudget:
  frontend:
    minAvailable: 2
  backend:
    minAvailable: 2
  worker:
    minAvailable: 1
```

## Manual Kubernetes Deployment

### Namespace and Secrets

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: foundry
  labels:
    app.kubernetes.io/name: foundry
---
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: foundry-secrets
  namespace: foundry
type: Opaque
stringData:
  jwt-secret: "your-jwt-secret-minimum-32-chars"
  postgres-password: "your-secure-password"
  neo4j-password: "your-neo4j-password"
  encryption-key: "your-encryption-key-32-chars"
```

### ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: foundry-config
  namespace: foundry
data:
  NODE_ENV: production
  LOG_LEVEL: info
  CORS_ORIGINS: "https://foundry.your-company.com"
  MAX_FILE_SIZE: "50MB"
```

### Backend Deployment

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: foundry-backend
  namespace: foundry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: foundry-backend
  template:
    metadata:
      labels:
        app: foundry-backend
    spec:
      containers:
        - name: backend
          image: foundry/backend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: foundry-config
                  key: NODE_ENV
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: foundry-secrets
                  key: jwt-secret
            - name: DATABASE_URL
              value: "postgresql://foundry:$(POSTGRES_PASSWORD)@foundry-postgresql:5432/foundry"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: foundry-secrets
                  key: postgres-password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 2Gi
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: foundry-backend
  namespace: foundry
spec:
  selector:
    app: foundry-backend
  ports:
    - port: 3000
      targetPort: 3000
```

## Ingress Configuration

### NGINX Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: foundry-ingress
  namespace: foundry
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
spec:
  tls:
    - hosts:
        - foundry.your-company.com
      secretName: foundry-tls
  rules:
    - host: foundry.your-company.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: foundry-backend
                port:
                  number: 3000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: foundry-frontend
                port:
                  number: 80
```

## Horizontal Pod Autoscaler

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: foundry-backend-hpa
  namespace: foundry
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: foundry-backend
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Network Policies

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: foundry-network-policy
  namespace: foundry
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 80
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector: {}
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

## Operations

### Scaling

```bash
# Manual scaling
kubectl scale deployment foundry-backend --replicas=5 -n foundry

# Check HPA status
kubectl get hpa -n foundry

# View autoscaling events
kubectl describe hpa foundry-backend-hpa -n foundry
```

### Rolling Updates

```bash
# Update image
kubectl set image deployment/foundry-backend \
  backend=foundry/backend:v2.0.0 -n foundry

# Check rollout status
kubectl rollout status deployment/foundry-backend -n foundry

# Rollback if needed
kubectl rollout undo deployment/foundry-backend -n foundry
```

### Logs and Debugging

```bash
# View logs
kubectl logs -f deployment/foundry-backend -n foundry

# View logs from all pods
kubectl logs -f -l app=foundry-backend -n foundry

# Exec into pod
kubectl exec -it deployment/foundry-backend -n foundry -- /bin/sh

# Port forward for debugging
kubectl port-forward svc/foundry-backend 3000:3000 -n foundry
```

### Health Checks

```bash
# Check pod status
kubectl get pods -n foundry

# Check service endpoints
kubectl get endpoints -n foundry

# Describe deployment
kubectl describe deployment foundry-backend -n foundry
```

## Monitoring Integration

### ServiceMonitor for Prometheus

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: foundry-backend
  namespace: foundry
spec:
  selector:
    matchLabels:
      app: foundry-backend
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

## Backup with Velero

```bash
# Install Velero
velero install --provider aws --bucket foundry-backups

# Create backup
velero backup create foundry-backup --include-namespaces foundry

# Restore from backup
velero restore create --from-backup foundry-backup
```

## Troubleshooting

### Pod Not Starting

```bash
# Check events
kubectl get events -n foundry --sort-by='.lastTimestamp'

# Describe pod
kubectl describe pod <pod-name> -n foundry

# Check logs
kubectl logs <pod-name> -n foundry --previous
```

### Service Unreachable

```bash
# Check endpoints
kubectl get endpoints foundry-backend -n foundry

# Test DNS
kubectl run -it --rm debug --image=busybox -- nslookup foundry-backend.foundry

# Test connectivity
kubectl run -it --rm debug --image=curlimages/curl -- curl http://foundry-backend.foundry:3000/health
```
