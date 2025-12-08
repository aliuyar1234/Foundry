# SOC 2 Control Mapping

Service Organization Control (SOC 2) Type II compliance mapping for Foundry.

## Overview

Foundry implements controls aligned with the SOC 2 Trust Services Criteria:
- **Security** - Protection against unauthorized access
- **Availability** - System availability for operation
- **Processing Integrity** - System processing is complete and accurate
- **Confidentiality** - Information designated as confidential is protected
- **Privacy** - Personal information is collected and used appropriately

## Trust Services Criteria Mapping

### CC1: Control Environment

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC1.1 - Commitment to integrity and ethics | Code of conduct, security policies | `/docs/policies/code-of-conduct.md` |
| CC1.2 - Board oversight | Security governance committee | Quarterly security reviews |
| CC1.3 - Management structure | Defined roles and responsibilities | Organization chart, RACI matrix |
| CC1.4 - Commitment to competence | Security training program | Training records, certifications |
| CC1.5 - Accountability | Performance evaluations | HR documentation |

### CC2: Communication and Information

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC2.1 - Information quality | Data validation, input sanitization | Code review, testing |
| CC2.2 - Internal communication | Security awareness program | Training materials, newsletters |
| CC2.3 - External communication | Security documentation, incident response | Public docs, incident reports |

### CC3: Risk Assessment

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC3.1 - Risk identification | Annual risk assessment | Risk register |
| CC3.2 - Risk analysis | Threat modeling, vulnerability assessment | Assessment reports |
| CC3.3 - Fraud risk | Segregation of duties, access controls | Access matrix |
| CC3.4 - Change risk | Change management process | Change logs |

### CC4: Monitoring Activities

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC4.1 - Monitoring controls | Continuous security monitoring | Prometheus/Grafana dashboards |
| CC4.2 - Deficiency evaluation | Incident response, post-mortems | Incident reports |

### CC5: Control Activities

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC5.1 - Control selection | Security architecture review | Architecture documentation |
| CC5.2 - General IT controls | Infrastructure security | Configuration documentation |
| CC5.3 - Technology controls | Technical security measures | Security configurations |

### CC6: Logical and Physical Access

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC6.1 - Access provisioning | RBAC, SCIM provisioning | User management system |
| CC6.2 - Access removal | Automated deprovisioning, access reviews | Audit logs |
| CC6.3 - Access authorization | Least privilege, approval workflows | Access policies |
| CC6.4 - Physical access | Cloud provider controls (AWS/GCP/Azure) | Provider SOC 2 reports |
| CC6.5 - Access modification | Change management for access | Change logs |
| CC6.6 - Malicious software | Endpoint protection, container scanning | Security scan reports |
| CC6.7 - Infrastructure security | Network segmentation, firewalls | Network architecture |
| CC6.8 - Third-party access | Vendor security assessment | Vendor assessments |

### CC7: System Operations

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC7.1 - Vulnerability management | Automated scanning, patching | Trivy/Snyk reports |
| CC7.2 - Anomaly detection | SIEM, alerting | Alert configurations |
| CC7.3 - Security incidents | Incident response process | Incident runbooks |
| CC7.4 - Incident recovery | Disaster recovery procedures | DR documentation |
| CC7.5 - Business continuity | High availability architecture | Architecture documentation |

### CC8: Change Management

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC8.1 - Change authorization | PR review, approval process | GitHub/GitLab workflow |

### CC9: Risk Mitigation

| Control | Foundry Implementation | Evidence |
|---------|----------------------|----------|
| CC9.1 - Risk mitigation | Security controls, monitoring | Control documentation |
| CC9.2 - Vendor management | Third-party risk assessment | Vendor assessments |

## Security-Specific Controls

### S1: Security Policies

**Implementation:**
- Information Security Policy
- Acceptable Use Policy
- Access Control Policy
- Incident Response Policy
- Data Classification Policy

**Evidence:** `/docs/policies/`

### S2: System Protection

**Implementation:**
```yaml
# Network Security
- TLS 1.3 for all external connections
- mTLS for internal service communication
- Network segmentation via Kubernetes NetworkPolicies
- Web Application Firewall (WAF)
- DDoS protection

# Application Security
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding, CSP)
- CSRF protection
- Rate limiting
```

**Evidence:** Security architecture documentation, penetration test reports

### S3: Authentication & Authorization

**Implementation:**
```yaml
Authentication:
  - Multi-factor authentication (MFA)
  - SSO integration (SAML 2.0, OIDC)
  - Strong password policies
  - Session management
  - Account lockout

Authorization:
  - Role-based access control (RBAC)
  - Row-level security (RLS)
  - API key management
  - Principle of least privilege
```

**Evidence:** Access control matrix, authentication logs

### S4: Encryption

**Implementation:**
```yaml
Encryption at Rest:
  - PostgreSQL: AES-256 (TDE)
  - Neo4j: Encrypted volumes
  - Redis: Encrypted at rest
  - Object storage: SSE-S3/SSE-KMS
  - Backups: AES-256 encryption

Encryption in Transit:
  - TLS 1.3 minimum
  - Perfect forward secrecy
  - Strong cipher suites only
  - Certificate management (cert-manager)
```

**Evidence:** Encryption configuration, certificate inventory

### S5: Logging & Monitoring

**Implementation:**
```yaml
Logging:
  - Centralized log aggregation (Loki/ELK)
  - Structured JSON logging
  - Log retention: 90 days online, 1 year archive
  - Log integrity protection

Monitoring:
  - Infrastructure metrics (Prometheus)
  - Application metrics (custom metrics)
  - Real-time alerting (Alertmanager)
  - Security event monitoring
```

**Evidence:** Logging configuration, sample logs, alert rules

## Availability-Specific Controls

### A1: System Availability

**Implementation:**
```yaml
High Availability:
  - Multi-region deployment option
  - Kubernetes auto-scaling
  - Database replication
  - Load balancing
  - Health checks and self-healing

Recovery:
  - RPO: 5 minutes (PostgreSQL WAL)
  - RTO: 2 hours (full restoration)
  - Daily automated backups
  - Tested disaster recovery procedures
```

**Evidence:** Architecture diagrams, DR test results, uptime reports

### A2: Capacity Planning

**Implementation:**
- Auto-scaling policies
- Resource monitoring
- Capacity forecasting
- Load testing results

**Evidence:** Scaling configuration, capacity reports

## Processing Integrity Controls

### PI1: Data Quality

**Implementation:**
```yaml
Input Validation:
  - Schema validation (Zod/Joi)
  - Type checking (TypeScript)
  - Business rule validation
  - Referential integrity

Processing Controls:
  - Idempotent operations
  - Transaction management
  - Error handling
  - Retry mechanisms
```

**Evidence:** Validation schemas, test coverage reports

### PI2: Processing Accuracy

**Implementation:**
- Unit test coverage > 80%
- Integration testing
- End-to-end testing
- Reconciliation processes

**Evidence:** Test reports, code coverage

## Confidentiality Controls

### C1: Data Classification

**Implementation:**
```yaml
Classification Levels:
  - Public: Documentation, marketing
  - Internal: Employee information
  - Confidential: Customer data
  - Restricted: Credentials, encryption keys

Handling Requirements:
  - Encryption requirements per level
  - Access restrictions
  - Retention periods
  - Disposal procedures
```

**Evidence:** Data classification policy, data inventory

### C2: Data Protection

**Implementation:**
- Entity-level data isolation
- Row-level security
- Encryption at rest and in transit
- Secure key management

**Evidence:** Security architecture, RLS policies

## Privacy Controls

See [GDPR Compliance Documentation](./gdpr.md) for detailed privacy controls.

## Control Testing Schedule

| Control Category | Testing Frequency | Last Tested | Next Test |
|-----------------|-------------------|-------------|-----------|
| Access Controls | Quarterly | 2024-01-15 | 2024-04-15 |
| Change Management | Monthly | 2024-02-01 | 2024-03-01 |
| Incident Response | Semi-annually | 2023-10-01 | 2024-04-01 |
| Backup/Recovery | Quarterly | 2024-01-01 | 2024-04-01 |
| Vulnerability Scanning | Weekly | Continuous | Continuous |
| Penetration Testing | Annually | 2023-12-01 | 2024-12-01 |

## Audit Evidence Repository

| Evidence Type | Location | Retention |
|---------------|----------|-----------|
| Access Logs | Loki/CloudWatch | 1 year |
| Change Records | GitHub/GitLab | Indefinite |
| Incident Reports | JIRA/Linear | 3 years |
| Security Scans | Trivy/Snyk Dashboard | 1 year |
| Training Records | HR System | Duration of employment |
| Policy Documents | `/docs/policies/` | Version controlled |

## Third-Party Services

| Service | Purpose | SOC 2 Report | Last Reviewed |
|---------|---------|--------------|---------------|
| AWS | Cloud infrastructure | Available | 2024-01-01 |
| GitHub | Source control | Available | 2024-01-01 |
| Datadog/Grafana | Monitoring | Available | 2024-01-01 |
| Stripe | Billing | Available | 2024-01-01 |
| SendGrid | Email | Available | 2024-01-01 |

## Gap Analysis

### Current Gaps

| Gap | Severity | Remediation Plan | Target Date |
|-----|----------|-----------------|-------------|
| None identified | - | - | - |

### Remediation Tracking

All identified gaps are tracked in the security remediation backlog with assigned owners and target completion dates.

## Certification Status

| Certification | Status | Valid Until |
|---------------|--------|-------------|
| SOC 2 Type I | Obtained | 2024-06-30 |
| SOC 2 Type II | In Progress | Expected 2024-12-31 |
| ISO 27001 | Planned | 2025 |

## Contact

**Security Team:** security@foundry.io
**Compliance Team:** compliance@foundry.io
