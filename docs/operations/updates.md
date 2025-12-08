# Update and Upgrade Guide

Procedures for updating Foundry deployments with minimal downtime.

## Update Strategy

### Version Types

| Type | Format | Frequency | Downtime |
|------|--------|-----------|----------|
| Patch | x.x.Y | Weekly | Zero |
| Minor | x.Y.0 | Monthly | Minimal |
| Major | X.0.0 | Quarterly | Planned |

### Update Channels

```yaml
# Update channel configuration
updates:
  channel: "stable"  # stable, beta, edge

  # Automatic updates (patch only)
  autoUpdate:
    enabled: true
    allowedTypes: ["patch"]
    schedule: "0 3 * * 0"  # Sunday 3 AM
    maintenanceWindow:
      start: "02:00"
      end: "06:00"
      timezone: "UTC"

  # Notifications
  notifications:
    email:
      - admin@acme.com
    slack:
      webhookUrl: "${SLACK_WEBHOOK}"
      channel: "#foundry-updates"
```

## Pre-Update Checklist

### Automated Pre-Flight Check

```bash
#!/bin/bash
# pre-update-check.sh

set -euo pipefail

echo "=== Foundry Pre-Update Check ==="
echo ""

# Check current version
CURRENT_VERSION=$(kubectl get deployment foundry-backend -n foundry -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)
echo "Current Version: ${CURRENT_VERSION}"

# Check target version
TARGET_VERSION="${1:-latest}"
echo "Target Version: ${TARGET_VERSION}"
echo ""

# 1. Check cluster health
echo "1. Checking cluster health..."
UNHEALTHY_PODS=$(kubectl get pods -n foundry --field-selector status.phase!=Running --no-headers | wc -l)
if [ "${UNHEALTHY_PODS}" -gt 0 ]; then
  echo "   WARNING: ${UNHEALTHY_PODS} pods not running"
  kubectl get pods -n foundry --field-selector status.phase!=Running
else
  echo "   OK: All pods healthy"
fi

# 2. Check database connectivity
echo "2. Checking database connectivity..."
kubectl exec deployment/foundry-backend -n foundry -- npm run db:check
echo "   OK: Database connected"

# 3. Check disk space
echo "3. Checking disk space..."
PG_SPACE=$(kubectl exec foundry-postgresql-0 -n foundry -- df -h /var/lib/postgresql/data | tail -1 | awk '{print $5}' | tr -d '%')
if [ "${PG_SPACE}" -gt 80 ]; then
  echo "   WARNING: PostgreSQL disk usage at ${PG_SPACE}%"
else
  echo "   OK: PostgreSQL disk usage at ${PG_SPACE}%"
fi

# 4. Check backup status
echo "4. Checking backup status..."
LAST_BACKUP=$(kubectl get cronjob foundry-backup -n foundry -o jsonpath='{.status.lastSuccessfulTime}')
echo "   Last backup: ${LAST_BACKUP}"

# 5. Check for pending migrations
echo "5. Checking for pending migrations..."
PENDING=$(kubectl exec deployment/foundry-backend -n foundry -- npm run prisma:migrate:status 2>/dev/null | grep -c "not yet applied" || true)
if [ "${PENDING}" -gt 0 ]; then
  echo "   INFO: ${PENDING} pending migrations will be applied"
else
  echo "   OK: No pending migrations"
fi

# 6. Check replica count
echo "6. Checking replica counts..."
BACKEND_REPLICAS=$(kubectl get deployment foundry-backend -n foundry -o jsonpath='{.spec.replicas}')
if [ "${BACKEND_REPLICAS}" -lt 2 ]; then
  echo "   WARNING: Backend has only ${BACKEND_REPLICAS} replica(s)"
else
  echo "   OK: Backend has ${BACKEND_REPLICAS} replicas"
fi

# 7. Check release notes
echo "7. Checking release notes..."
echo "   Release notes: https://foundry.io/releases/${TARGET_VERSION}"

echo ""
echo "=== Pre-Update Check Complete ==="
```

### Manual Checklist

```markdown
## Pre-Update Checklist

### Infrastructure
- [ ] All pods running and healthy
- [ ] Database connectivity verified
- [ ] Redis connectivity verified
- [ ] Sufficient disk space (>20% free)
- [ ] Sufficient memory available

### Backup
- [ ] Recent backup completed successfully
- [ ] Backup verified (test restore if major update)
- [ ] Backup retention policy confirmed

### Communication
- [ ] Users notified of maintenance window
- [ ] Support team informed
- [ ] Rollback plan documented

### Testing
- [ ] Tested in staging environment
- [ ] Breaking changes reviewed
- [ ] Custom integrations compatibility checked

### Documentation
- [ ] Release notes reviewed
- [ ] Migration guide reviewed (if applicable)
- [ ] API changes documented
```

## Helm Update Procedure

### Standard Update

```bash
#!/bin/bash
# helm-update.sh

VERSION="${1:-latest}"
NAMESPACE="${2:-foundry}"

echo "Updating Foundry to version ${VERSION}..."

# Update Helm repo
helm repo update foundry

# Show what will change
echo "Changes to be applied:"
helm diff upgrade foundry foundry/foundry \
  --namespace ${NAMESPACE} \
  --version ${VERSION} \
  -f values.yaml

# Confirm
read -p "Continue with update? (yes/no): " confirm
if [ "${confirm}" != "yes" ]; then
  echo "Update cancelled"
  exit 0
fi

# Create backup before update
echo "Creating pre-update backup..."
kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- \
  /scripts/backup.sh "pre-update-${VERSION}"

# Perform update
echo "Applying update..."
helm upgrade foundry foundry/foundry \
  --namespace ${NAMESPACE} \
  --version ${VERSION} \
  -f values.yaml \
  --wait \
  --timeout 10m

# Wait for rollout
echo "Waiting for rollout..."
kubectl rollout status deployment/foundry-backend -n ${NAMESPACE}
kubectl rollout status deployment/foundry-frontend -n ${NAMESPACE}
kubectl rollout status deployment/foundry-worker -n ${NAMESPACE}

# Verify update
echo "Verifying update..."
NEW_VERSION=$(kubectl get deployment foundry-backend -n ${NAMESPACE} \
  -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)
echo "New version: ${NEW_VERSION}"

# Run health check
kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- curl -s localhost:3000/health

echo "Update complete!"
```

### Blue-Green Update

```bash
#!/bin/bash
# blue-green-update.sh

VERSION="${1}"
NAMESPACE="foundry"

# Deploy new version to green environment
echo "Deploying version ${VERSION} to green environment..."
helm install foundry-green foundry/foundry \
  --namespace ${NAMESPACE} \
  --version ${VERSION} \
  -f values.yaml \
  --set nameOverride=foundry-green \
  --set service.name=foundry-green-backend \
  --wait

# Wait for green to be ready
echo "Waiting for green deployment..."
kubectl rollout status deployment/foundry-green-backend -n ${NAMESPACE}

# Run smoke tests on green
echo "Running smoke tests..."
GREEN_POD=$(kubectl get pod -l app=foundry-green-backend -n ${NAMESPACE} -o jsonpath='{.items[0].metadata.name}')
kubectl exec ${GREEN_POD} -n ${NAMESPACE} -- npm run test:smoke

# Switch traffic to green
echo "Switching traffic to green..."
kubectl patch service foundry-backend -n ${NAMESPACE} \
  -p '{"spec":{"selector":{"app":"foundry-green-backend"}}}'

# Verify traffic switch
echo "Verifying traffic switch..."
sleep 10
curl -s https://foundry.your-company.com/health

# Keep blue for rollback (optional)
echo "Blue deployment kept for rollback. Remove with:"
echo "  helm uninstall foundry-blue -n ${NAMESPACE}"

echo "Blue-green update complete!"
```

### Canary Update

```bash
#!/bin/bash
# canary-update.sh

VERSION="${1}"
NAMESPACE="foundry"
CANARY_WEIGHT=10  # Start with 10% traffic

# Deploy canary
echo "Deploying canary with ${CANARY_WEIGHT}% traffic..."
helm upgrade foundry foundry/foundry \
  --namespace ${NAMESPACE} \
  --version ${VERSION} \
  -f values.yaml \
  --set canary.enabled=true \
  --set canary.weight=${CANARY_WEIGHT} \
  --wait

# Monitor canary
echo "Monitoring canary for 10 minutes..."
for i in {1..10}; do
  ERROR_RATE=$(kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- \
    curl -s localhost:9090/metrics | grep http_requests_total | grep status=\"5 | awk '{sum+=$2} END {print sum}')
  echo "Minute ${i}: Error rate = ${ERROR_RATE:-0}"

  if [ "${ERROR_RATE:-0}" -gt 10 ]; then
    echo "ERROR: High error rate detected. Rolling back canary..."
    helm upgrade foundry foundry/foundry \
      --namespace ${NAMESPACE} \
      -f values.yaml \
      --set canary.enabled=false \
      --wait
    exit 1
  fi

  sleep 60
done

# Gradually increase canary traffic
for weight in 25 50 75 100; do
  echo "Increasing canary to ${weight}%..."
  helm upgrade foundry foundry/foundry \
    --namespace ${NAMESPACE} \
    --version ${VERSION} \
    -f values.yaml \
    --set canary.enabled=true \
    --set canary.weight=${weight} \
    --wait

  sleep 300  # 5 minutes per stage
done

# Finalize update
echo "Finalizing update..."
helm upgrade foundry foundry/foundry \
  --namespace ${NAMESPACE} \
  --version ${VERSION} \
  -f values.yaml \
  --set canary.enabled=false \
  --wait

echo "Canary update complete!"
```

## Database Migrations

### Automatic Migrations

```yaml
# Helm values for automatic migrations
backend:
  migrations:
    enabled: true
    runOnStartup: true
    strategy: "safe"  # safe, force

  initContainers:
    - name: migrations
      image: foundry/backend:{{ .Values.version }}
      command: ["npm", "run", "prisma:migrate:deploy"]
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: foundry-secrets
              key: database-url
```

### Manual Migrations

```bash
# Run migrations manually
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run prisma:migrate:deploy

# Check migration status
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run prisma:migrate:status

# Rollback migration (if needed)
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run prisma:migrate:rollback
```

### Neo4j Migrations

```bash
# Run Neo4j migrations
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run neo4j:migrate

# Verify Neo4j schema
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run neo4j:verify
```

## Rollback Procedures

### Helm Rollback

```bash
# View rollout history
helm history foundry -n foundry

# Rollback to previous version
helm rollback foundry -n foundry

# Rollback to specific revision
helm rollback foundry 5 -n foundry

# Verify rollback
kubectl rollout status deployment/foundry-backend -n foundry
```

### Emergency Rollback

```bash
#!/bin/bash
# emergency-rollback.sh

NAMESPACE="${1:-foundry}"
REVISION="${2}"

echo "=== EMERGENCY ROLLBACK ==="

# Get previous revision if not specified
if [ -z "${REVISION}" ]; then
  REVISION=$(helm history foundry -n ${NAMESPACE} --max 2 -o json | jq '.[1].revision')
fi

echo "Rolling back to revision ${REVISION}..."

# Perform rollback
helm rollback foundry ${REVISION} -n ${NAMESPACE} --wait --timeout 5m

# Force pod restart if needed
kubectl rollout restart deployment/foundry-backend -n ${NAMESPACE}
kubectl rollout restart deployment/foundry-worker -n ${NAMESPACE}

# Wait for rollback
kubectl rollout status deployment/foundry-backend -n ${NAMESPACE} --timeout 5m

# Verify health
echo "Verifying health..."
kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- curl -s localhost:3000/health

echo "Rollback complete!"
```

### Database Rollback

```bash
# Restore from backup
./disaster-recovery.sh 20240115 --namespace foundry

# Or restore specific tables
kubectl exec foundry-postgresql-0 -n foundry -- \
  pg_restore -U foundry -d foundry \
  --table=process \
  --table=insight \
  /backups/foundry_20240115.dump
```

## Air-Gapped Updates

### Prepare Update Package

```bash
#!/bin/bash
# prepare-airgap-update.sh

VERSION="${1}"
OUTPUT_DIR="./foundry-update-${VERSION}"

mkdir -p "${OUTPUT_DIR}/images"

# Pull new images
IMAGES=(
  "foundry/frontend:${VERSION}"
  "foundry/backend:${VERSION}"
)

for IMAGE in "${IMAGES[@]}"; do
  echo "Pulling ${IMAGE}..."
  docker pull "${IMAGE}"
  docker save "${IMAGE}" -o "${OUTPUT_DIR}/images/$(echo ${IMAGE} | tr '/:' '_').tar"
done

# Package Helm chart
helm pull foundry/foundry --version ${VERSION} -d "${OUTPUT_DIR}"

# Create update script
cat > "${OUTPUT_DIR}/update.sh" << 'EOF'
#!/bin/bash
REGISTRY="${1:-localhost:5000}"

# Load images
for tar in ./images/*.tar; do
  docker load -i "${tar}"
  IMAGE=$(docker load -i "${tar}" | grep "Loaded image" | awk '{print $3}')
  docker tag "${IMAGE}" "${REGISTRY}/${IMAGE}"
  docker push "${REGISTRY}/${IMAGE}"
done

# Update Helm
helm upgrade foundry ./foundry-*.tgz \
  --namespace foundry \
  --set global.imageRegistry="${REGISTRY}" \
  -f values-airgap.yaml
EOF

chmod +x "${OUTPUT_DIR}/update.sh"

# Create checksum
tar -czvf "foundry-update-${VERSION}.tar.gz" "${OUTPUT_DIR}"
sha256sum "foundry-update-${VERSION}.tar.gz" > "foundry-update-${VERSION}.tar.gz.sha256"

echo "Update package created: foundry-update-${VERSION}.tar.gz"
```

### Apply Air-Gapped Update

```bash
# Verify package
sha256sum -c foundry-update-v2.0.0.tar.gz.sha256

# Extract
tar -xzf foundry-update-v2.0.0.tar.gz
cd foundry-update-v2.0.0

# Apply update
./update.sh localhost:5000

# Verify
kubectl rollout status deployment/foundry-backend -n foundry
```

## Post-Update Verification

### Automated Verification

```bash
#!/bin/bash
# post-update-verify.sh

NAMESPACE="${1:-foundry}"

echo "=== Post-Update Verification ==="

# 1. Check deployments
echo "1. Checking deployments..."
kubectl get deployments -n ${NAMESPACE}

# 2. Check pod status
echo "2. Checking pods..."
UNHEALTHY=$(kubectl get pods -n ${NAMESPACE} --field-selector status.phase!=Running --no-headers | wc -l)
if [ "${UNHEALTHY}" -gt 0 ]; then
  echo "   ERROR: ${UNHEALTHY} unhealthy pods"
  exit 1
fi
echo "   OK: All pods running"

# 3. Check version
echo "3. Checking version..."
VERSION=$(kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- \
  curl -s localhost:3000/health | jq -r '.version')
echo "   Running version: ${VERSION}"

# 4. Run smoke tests
echo "4. Running smoke tests..."
kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- npm run test:smoke

# 5. Check database migrations
echo "5. Checking migrations..."
kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- npm run prisma:migrate:status

# 6. Check external connectivity
echo "6. Checking external connectivity..."
curl -sf https://foundry.your-company.com/health > /dev/null && echo "   OK" || echo "   FAILED"

# 7. Check metrics
echo "7. Checking metrics..."
kubectl exec deployment/foundry-backend -n ${NAMESPACE} -- \
  curl -s localhost:3000/metrics | head -5

echo ""
echo "=== Verification Complete ==="
```

### Manual Verification

```markdown
## Post-Update Checklist

### Application Health
- [ ] All pods running
- [ ] Health endpoints responding
- [ ] Version correct
- [ ] No error spikes in logs

### Functionality
- [ ] User login works
- [ ] Process creation works
- [ ] AI insights generating
- [ ] Document upload works
- [ ] SSO authentication works

### Performance
- [ ] Response times normal
- [ ] No memory leaks
- [ ] Database queries performant
- [ ] Queue processing normal

### Integrations
- [ ] Email sending works
- [ ] Webhooks firing
- [ ] API integrations working
- [ ] External services connected
```

## Scheduled Maintenance

### Maintenance Window Configuration

```yaml
# Maintenance window settings
maintenance:
  scheduled:
    - name: "weekly-update"
      schedule: "0 3 * * 0"  # Sunday 3 AM
      duration: "2h"
      tasks:
        - "security-patches"
        - "minor-updates"

    - name: "monthly-maintenance"
      schedule: "0 2 1 * *"  # 1st of month 2 AM
      duration: "4h"
      tasks:
        - "database-maintenance"
        - "log-rotation"
        - "certificate-renewal"

  notifications:
    advance:
      - hours: 72
        channels: ["email"]
      - hours: 24
        channels: ["email", "slack", "in-app"]
      - hours: 1
        channels: ["in-app", "banner"]

  maintenancePage:
    enabled: true
    message: "Foundry is undergoing scheduled maintenance. We'll be back shortly."
    estimatedDuration: "2 hours"
```

### Enable Maintenance Mode

```bash
# Enable maintenance mode
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run maintenance:enable --message "Updating to v2.0.0"

# Disable maintenance mode
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run maintenance:disable

# Check maintenance status
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run maintenance:status
```
