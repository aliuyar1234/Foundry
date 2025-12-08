# Helm Values Reference

Complete reference for Foundry Helm chart configuration values.

## Installation

```bash
# Add repository
helm repo add foundry https://charts.foundry.io

# Install with default values
helm install foundry foundry/foundry -n foundry

# Install with custom values
helm install foundry foundry/foundry -n foundry -f values.yaml

# Upgrade existing installation
helm upgrade foundry foundry/foundry -n foundry -f values.yaml
```

## Global Configuration

```yaml
global:
  # Environment name (production, staging, development)
  environment: production

  # Base domain for the application
  domain: foundry.example.com

  # Container image registry
  imageRegistry: docker.io

  # Image pull secrets
  imagePullSecrets:
    - name: registry-credentials

  # Storage class for persistent volumes
  storageClass: standard

  # Node selector for all pods
  nodeSelector: {}

  # Tolerations for all pods
  tolerations: []

  # Pod affinity rules
  affinity: {}
```

## Frontend Configuration

```yaml
frontend:
  # Enable/disable frontend deployment
  enabled: true

  # Number of replicas
  replicaCount: 3

  # Container image
  image:
    repository: foundry/frontend
    tag: latest
    pullPolicy: IfNotPresent

  # Service configuration
  service:
    type: ClusterIP
    port: 80
    annotations: {}

  # Resource limits
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

  # Horizontal Pod Autoscaler
  autoscaling:
    enabled: false
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80

  # Pod Disruption Budget
  podDisruptionBudget:
    enabled: true
    minAvailable: 1

  # Node selector
  nodeSelector: {}

  # Tolerations
  tolerations: []

  # Affinity
  affinity: {}

  # Environment variables
  env:
    REACT_APP_API_URL: ""  # Auto-configured if empty
```

## Backend Configuration

```yaml
backend:
  # Enable/disable backend deployment
  enabled: true

  # Number of replicas
  replicaCount: 3

  # Container image
  image:
    repository: foundry/backend
    tag: latest
    pullPolicy: IfNotPresent

  # Service configuration
  service:
    type: ClusterIP
    port: 3000
    annotations: {}

  # Resource limits
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 2Gi

  # Health checks
  livenessProbe:
    enabled: true
    path: /health
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3

  readinessProbe:
    enabled: true
    path: /health/ready
    initialDelaySeconds: 5
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3

  # Horizontal Pod Autoscaler
  autoscaling:
    enabled: false
    minReplicas: 2
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80

  # Pod Disruption Budget
  podDisruptionBudget:
    enabled: true
    minAvailable: 2

  # Environment variables
  env:
    NODE_ENV: production
    LOG_LEVEL: info
    MAX_FILE_SIZE: 50MB
    CORS_ORIGINS: ""
    RATE_LIMIT_WINDOW_MS: 60000
    RATE_LIMIT_MAX_REQUESTS: 100

  # Secret environment variables (from secrets)
  secretEnv:
    JWT_SECRET:
      secretName: foundry-secrets
      key: jwt-secret
    ENCRYPTION_KEY:
      secretName: foundry-secrets
      key: encryption-key
```

## Worker Configuration

```yaml
worker:
  # Enable/disable worker deployment
  enabled: true

  # Number of replicas
  replicaCount: 2

  # Container image (uses backend image by default)
  image:
    repository: foundry/backend
    tag: latest
    pullPolicy: IfNotPresent

  # Command override
  command: ["npm", "run", "worker"]

  # Resource limits
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi

  # Horizontal Pod Autoscaler
  autoscaling:
    enabled: false
    minReplicas: 1
    maxReplicas: 10
    # Custom metrics for queue-based scaling
    metrics:
      - type: External
        external:
          metric:
            name: redis_queue_depth
          target:
            type: AverageValue
            averageValue: 100

  # Pod Disruption Budget
  podDisruptionBudget:
    enabled: true
    minAvailable: 1
```

## PostgreSQL Configuration

```yaml
postgresql:
  # Enable bundled PostgreSQL
  enabled: true

  # Use external PostgreSQL instead
  external:
    enabled: false
    host: ""
    port: 5432
    database: foundry
    username: foundry
    existingSecret: ""
    existingSecretPasswordKey: postgres-password

  # PostgreSQL image
  image:
    registry: docker.io
    repository: bitnami/postgresql
    tag: 15

  # Authentication
  auth:
    username: foundry
    database: foundry
    existingSecret: foundry-secrets
    secretKeys:
      adminPasswordKey: postgres-password
      userPasswordKey: postgres-password

  # Primary configuration
  primary:
    # Persistence
    persistence:
      enabled: true
      size: 100Gi
      storageClass: ""

    # Resources
    resources:
      requests:
        cpu: 500m
        memory: 2Gi
      limits:
        cpu: 2000m
        memory: 8Gi

    # PostgreSQL configuration
    configuration: |
      max_connections = 200
      shared_buffers = 1GB
      effective_cache_size = 3GB
      maintenance_work_mem = 256MB
      checkpoint_completion_target = 0.9
      wal_buffers = 64MB
      default_statistics_target = 100
      random_page_cost = 1.1
      effective_io_concurrency = 200
      work_mem = 5MB
      min_wal_size = 1GB
      max_wal_size = 4GB

  # Read replicas (enterprise)
  readReplicas:
    replicaCount: 0
    persistence:
      enabled: true
      size: 100Gi
```

## Neo4j Configuration

```yaml
neo4j:
  # Enable bundled Neo4j
  enabled: true

  # Use external Neo4j instead
  external:
    enabled: false
    uri: bolt://neo4j:7687
    username: neo4j
    existingSecret: ""
    existingSecretPasswordKey: neo4j-password

  # Neo4j edition (community or enterprise)
  edition: community

  # Authentication
  neo4j:
    name: neo4j
    passwordFromSecret: foundry-secrets
    passwordSecretKey: neo4j-password

  # Resources
  resources:
    requests:
      cpu: 500m
      memory: 2Gi
    limits:
      cpu: 2000m
      memory: 8Gi

  # Volumes
  volumes:
    data:
      mode: defaultStorageClass
      size: 100Gi
    logs:
      mode: defaultStorageClass
      size: 10Gi

  # Configuration
  config:
    dbms.memory.heap.initial_size: 1G
    dbms.memory.heap.max_size: 4G
    dbms.memory.pagecache.size: 2G
```

## Redis Configuration

```yaml
redis:
  # Enable bundled Redis
  enabled: true

  # Use external Redis instead
  external:
    enabled: false
    host: ""
    port: 6379
    password: ""
    existingSecret: ""
    existingSecretPasswordKey: redis-password

  # Architecture (standalone or replication)
  architecture: standalone

  # Authentication
  auth:
    enabled: false
    password: ""

  # Master configuration
  master:
    persistence:
      enabled: true
      size: 10Gi
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 1Gi

  # Replica configuration (if architecture: replication)
  replica:
    replicaCount: 2
    persistence:
      enabled: true
      size: 10Gi
```

## Ingress Configuration

```yaml
ingress:
  # Enable ingress
  enabled: true

  # Ingress class name
  className: nginx

  # Annotations
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: 50m
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"

  # Hosts configuration
  hosts:
    - host: foundry.example.com
      paths:
        - path: /
          pathType: Prefix

  # TLS configuration
  tls:
    - secretName: foundry-tls
      hosts:
        - foundry.example.com
```

## Service Account Configuration

```yaml
serviceAccount:
  # Create service account
  create: true

  # Service account name
  name: foundry

  # Annotations
  annotations: {}

  # RBAC rules
  rbac:
    create: true
    rules: []
```

## Monitoring Configuration

```yaml
monitoring:
  # Enable metrics endpoint
  enabled: true

  # ServiceMonitor for Prometheus Operator
  serviceMonitor:
    enabled: false
    interval: 30s
    scrapeTimeout: 10s
    labels: {}

  # Grafana dashboards
  grafanaDashboards:
    enabled: false
    labels:
      grafana_dashboard: "1"

  # Alerting rules
  prometheusRules:
    enabled: false
    rules: []
```

## Network Policies

```yaml
networkPolicy:
  # Enable network policies
  enabled: false

  # Allow ingress from
  ingress:
    namespaceSelector:
      matchLabels:
        name: ingress-nginx

  # Allow egress to
  egress:
    # Allow DNS
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

## Example Configurations

### Development

```yaml
# values-dev.yaml
global:
  environment: development

frontend:
  replicaCount: 1
  resources:
    requests:
      cpu: 50m
      memory: 128Mi

backend:
  replicaCount: 1
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
  env:
    LOG_LEVEL: debug

worker:
  replicaCount: 1

postgresql:
  primary:
    persistence:
      size: 10Gi

neo4j:
  volumes:
    data:
      size: 10Gi

ingress:
  enabled: false
```

### Production

```yaml
# values-prod.yaml
global:
  environment: production
  domain: foundry.company.com

frontend:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10

backend:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20

worker:
  replicaCount: 3
  autoscaling:
    enabled: true

postgresql:
  primary:
    persistence:
      size: 500Gi
    resources:
      limits:
        memory: 16Gi

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true

networkPolicy:
  enabled: true
```
