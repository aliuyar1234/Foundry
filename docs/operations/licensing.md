# Licensing Guide

Configure and manage Foundry licenses for different deployment scenarios.

## License Tiers

### Tier Overview

| Feature | Community | Professional | Enterprise | On-Premise |
|---------|-----------|--------------|------------|------------|
| Users | 5 | 50 | Unlimited | Unlimited |
| Entities | 1 | 5 | Unlimited | Unlimited |
| Processes | 100 | 1,000 | Unlimited | Unlimited |
| AI Insights | Basic | Advanced | Full | Full |
| Cross-Entity | No | No | Yes | Yes |
| SSO | No | OIDC | SAML/OIDC/SCIM | SAML/OIDC/SCIM |
| White-Label | No | Basic | Full | Full |
| Support | Community | Email | Priority | Dedicated |
| Air-Gap | No | No | No | Yes |
| Custom Terms | No | No | Yes | Yes |

### Feature Matrix

```yaml
# License feature configuration
licenseTiers:
  community:
    features:
      - "core_process_mining"
      - "basic_analytics"
      - "document_management"
    limits:
      users: 5
      entities: 1
      processes: 100
      storage_gb: 10
      ai_tokens_monthly: 10000

  professional:
    features:
      - "core_process_mining"
      - "advanced_analytics"
      - "document_management"
      - "ai_insights"
      - "api_access"
      - "oidc_sso"
      - "basic_branding"
    limits:
      users: 50
      entities: 5
      processes: 1000
      storage_gb: 100
      ai_tokens_monthly: 100000

  enterprise:
    features:
      - "core_process_mining"
      - "advanced_analytics"
      - "document_management"
      - "ai_insights"
      - "api_access"
      - "full_sso"
      - "full_branding"
      - "cross_entity_intelligence"
      - "partner_api"
      - "custom_integrations"
      - "audit_logging"
      - "data_export"
    limits:
      users: -1  # unlimited
      entities: -1
      processes: -1
      storage_gb: 1000
      ai_tokens_monthly: -1

  on_premise:
    features:
      - "all_enterprise_features"
      - "air_gap_deployment"
      - "offline_activation"
      - "custom_ai_models"
      - "dedicated_support"
    limits:
      users: -1
      entities: -1
      processes: -1
      storage_gb: -1
      ai_tokens_monthly: -1
```

## Online License Activation

### Automatic Activation

```bash
# Activate with license key
foundry license activate --key "FDRY-XXXX-XXXX-XXXX-XXXX"

# Verify activation
foundry license status

# Output:
# License Status: Active
# Type: Enterprise
# Licensed To: Acme Corporation
# Expiration: 2025-12-31
# Features: All enterprise features enabled
# Entities: 10 active / unlimited allowed
# Users: 245 active / unlimited allowed
```

### Environment Configuration

```bash
# Set license key via environment
export FOUNDRY_LICENSE_KEY="FDRY-XXXX-XXXX-XXXX-XXXX"

# Or in Kubernetes secret
kubectl create secret generic foundry-license \
  --namespace foundry \
  --from-literal=license-key="FDRY-XXXX-XXXX-XXXX-XXXX"
```

### License Renewal

```bash
# Check license expiration
foundry license expiration

# Renew license (if auto-renewal enabled)
foundry license renew

# Update to new license key
foundry license update --key "FDRY-YYYY-YYYY-YYYY-YYYY"
```

## Offline License Activation

### Generate Hardware Fingerprint

```bash
# Generate machine fingerprint
foundry license fingerprint

# Output saved to fingerprint.json:
# {
#   "machineId": "abc123def456...",
#   "hostname": "foundry-prod-01",
#   "platform": "linux",
#   "cpuCount": 16,
#   "memoryGB": 64,
#   "containerized": true,
#   "kubernetesCluster": "prod-cluster-1",
#   "timestamp": "2024-01-15T10:30:00Z",
#   "checksum": "sha256:..."
# }
```

### Obtain Offline License

1. Transfer `fingerprint.json` to internet-connected system
2. Submit to licensing portal: https://license.foundry.io/offline
3. Or contact sales: sales@foundry.io
4. Receive `license.lic` file
5. Transfer `license.lic` to air-gapped system

### Activate Offline License

```bash
# Install offline license
foundry license activate-offline --file "license.lic"

# Verify activation
foundry license status

# Check remaining offline period
foundry license offline-validity
```

### License File Format

```
-----BEGIN FOUNDRY LICENSE-----
Version: 1
Type: on_premise
LicensedTo: Acme Corporation
Contact: admin@acme.com
IssuedAt: 2024-01-15T00:00:00Z
ExpiresAt: 2025-01-15T00:00:00Z
MachineFingerprint: abc123def456...
Features: all_enterprise_features,air_gap_deployment,offline_activation
Limits: users=-1,entities=-1,processes=-1
Signature: base64_encoded_signature...
-----END FOUNDRY LICENSE-----
```

## License Management API

### Check License Status

```typescript
// GET /api/admin/license
interface LicenseStatus {
  active: boolean;
  type: 'community' | 'professional' | 'enterprise' | 'on_premise';
  licensedTo: string;
  expiresAt: string;
  features: string[];
  limits: {
    users: number;
    entities: number;
    processes: number;
    storageGb: number;
    aiTokensMonthly: number;
  };
  usage: {
    users: number;
    entities: number;
    processes: number;
    storageGb: number;
    aiTokensUsed: number;
  };
  daysUntilExpiration: number;
  autoRenewal: boolean;
}
```

### Feature Check

```typescript
// Check if feature is enabled
const isEnabled = await licenseService.hasFeature('cross_entity_intelligence');

// Check limit
const canAddUser = await licenseService.checkLimit('users');

// Get remaining quota
const remaining = await licenseService.getRemainingQuota('ai_tokens_monthly');
```

### License Enforcement

```typescript
// Middleware for license enforcement
async function licenseMiddleware(req: Request, res: Response, next: NextFunction) {
  const license = await licenseService.getStatus();

  // Check if license is active
  if (!license.active) {
    return res.status(402).json({
      error: 'License expired or invalid',
      code: 'LICENSE_INVALID',
    });
  }

  // Check feature access
  const requiredFeature = getRequiredFeature(req.path);
  if (requiredFeature && !license.features.includes(requiredFeature)) {
    return res.status(403).json({
      error: 'Feature not available in current license',
      code: 'FEATURE_NOT_LICENSED',
      feature: requiredFeature,
    });
  }

  next();
}
```

## License Alerts

### Expiration Alerts

```yaml
# Alert configuration
licenseAlerts:
  # Email alerts
  email:
    recipients:
      - admin@acme.com
      - ops@acme.com
    alerts:
      - daysBeforeExpiration: 90
        subject: "Foundry License: 90 days until expiration"
      - daysBeforeExpiration: 30
        subject: "Foundry License: 30 days until expiration"
        priority: high
      - daysBeforeExpiration: 7
        subject: "URGENT: Foundry License expires in 7 days"
        priority: critical

  # Slack alerts
  slack:
    webhookUrl: "${SLACK_WEBHOOK_URL}"
    channel: "#foundry-ops"
    alerts:
      - daysBeforeExpiration: 30
      - daysBeforeExpiration: 7

  # Dashboard banner
  ui:
    showBanner: true
    bannerDaysBeforeExpiration: 30
```

### Usage Alerts

```yaml
# Usage threshold alerts
usageAlerts:
  users:
    warningThreshold: 80
    criticalThreshold: 95

  processes:
    warningThreshold: 80
    criticalThreshold: 95

  storage:
    warningThreshold: 80
    criticalThreshold: 95

  aiTokens:
    warningThreshold: 80
    criticalThreshold: 95
    resetPeriod: monthly
```

## Multi-Instance Licensing

### Cluster License

```yaml
# Cluster license configuration
clusterLicense:
  type: "cluster"
  maxNodes: 10
  nodeValidation:
    method: "kubernetes_api"
    namespace: "foundry"

  # Node registration
  nodes:
    - hostname: "foundry-node-1"
      registeredAt: "2024-01-15T00:00:00Z"
      lastSeen: "2024-01-20T10:30:00Z"
    - hostname: "foundry-node-2"
      registeredAt: "2024-01-15T00:00:00Z"
      lastSeen: "2024-01-20T10:30:00Z"
```

### Development/Production Split

```yaml
# License allocation for multiple environments
environments:
  production:
    licenseKey: "FDRY-PROD-XXXX-XXXX"
    allocation:
      users: 200
      entities: unlimited

  staging:
    licenseKey: "FDRY-STAGE-XXXX-XXXX"
    allocation:
      users: 50
      entities: 5

  development:
    licenseKey: "FDRY-DEV-XXXX-XXXX"
    type: "development"
    restrictions:
      - "no_production_data"
      - "watermark_exports"
```

## License Compliance

### Audit Logging

```typescript
// License audit events
interface LicenseAuditEvent {
  timestamp: string;
  eventType: 'activation' | 'renewal' | 'feature_check' | 'limit_check' | 'violation';
  details: {
    feature?: string;
    limit?: string;
    currentValue?: number;
    limitValue?: number;
    allowed?: boolean;
  };
  userId?: string;
  entityId?: string;
}

// Query audit logs
const events = await licenseAuditService.query({
  eventType: 'violation',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});
```

### Compliance Report

```bash
# Generate compliance report
foundry license compliance-report \
  --start "2024-01-01" \
  --end "2024-01-31" \
  --format "pdf" \
  --output "license-compliance-jan-2024.pdf"

# Report includes:
# - License details
# - Feature usage
# - Limit usage (peak and average)
# - Violations (if any)
# - Recommendations
```

## Troubleshooting

### License Validation Failures

```bash
# Check license details
foundry license debug

# Output:
# License Key: FDRY-XXXX-XXXX-XXXX-XXXX
# Signature: Valid
# Expiration: 2025-12-31 (345 days remaining)
# Machine Match: Yes
# Network Check: Passed
# Time Sync: OK

# Revalidate license
foundry license revalidate
```

### Common Issues

**"License key invalid":**
```bash
# Verify key format
foundry license validate-key "FDRY-XXXX-XXXX-XXXX-XXXX"

# Check for typos or extra characters
echo "FDRY-XXXX-XXXX-XXXX-XXXX" | xxd
```

**"Machine fingerprint mismatch":**
```bash
# Regenerate fingerprint after hardware change
foundry license fingerprint --force

# Request new offline license with updated fingerprint
```

**"License expired":**
```bash
# Check system time
date

# Sync time with NTP
ntpdate pool.ntp.org

# Verify expiration
foundry license expiration --verbose
```

**"Feature not licensed":**
```bash
# List available features
foundry license features

# Check if feature requires upgrade
foundry license feature-info "cross_entity_intelligence"
```

### Grace Period

```yaml
# Grace period configuration (for enterprise licenses)
gracePeriod:
  enabled: true
  days: 30
  restrictions:
    - "no_new_users"
    - "no_new_entities"
    - "read_only_after_15_days"
  notifications:
    - day: 1
      message: "License expired. Grace period active."
    - day: 15
      message: "Grace period: Read-only mode in 15 days."
    - day: 25
      message: "Grace period: System access ends in 5 days."
```

## License Portal

### Self-Service Portal

```
https://license.foundry.io/portal

Features:
- View license details
- Download invoices
- Manage billing
- Request license changes
- Generate offline licenses
- View usage reports
- Contact support
```

### API Access

```bash
# API endpoint for license management
curl -X GET "https://license.foundry.io/api/v1/license" \
  -H "Authorization: Bearer $LICENSE_API_TOKEN"

# Update billing
curl -X POST "https://license.foundry.io/api/v1/billing/update" \
  -H "Authorization: Bearer $LICENSE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethod": "invoice"}'
```
