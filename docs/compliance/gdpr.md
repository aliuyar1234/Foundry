# GDPR Compliance Documentation

General Data Protection Regulation (GDPR) compliance guide for Foundry deployments.

## Overview

Foundry is designed with privacy by default and provides comprehensive tools for GDPR compliance. This document outlines how Foundry supports data subject rights and organizational obligations under GDPR.

## Data Subject Rights

### Right to Access (Article 15)

**Implementation:**
- Users can request a full export of their personal data via the UI or API
- Admins can export data for any user within their entity
- Export includes all personal data, activity history, and associated content

**API Endpoint:**
```bash
# User requests their own data
POST /api/gdpr/export/me

# Admin requests user data
POST /api/gdpr/export/user/:userId
```

**Data Included:**
- User profile information
- Login history and session data
- Audit logs of user actions
- Created/owned processes and documents
- Preferences and settings

### Right to Erasure (Article 17)

**Implementation:**
- Users can request deletion of their account and data
- 30-day grace period allows cancellation
- Cascading deletion removes all user-associated data
- Anonymization used where deletion would break data integrity

**API Endpoint:**
```bash
# User requests deletion
POST /api/gdpr/delete/me

# Admin requests user deletion
POST /api/gdpr/delete/user/:userId
```

**Deletion Process:**
1. Request submitted with 30-day scheduled execution
2. User notified via email
3. Grace period allows cancellation
4. Data archived for compliance (if required)
5. Personal data deleted or anonymized
6. Confirmation sent to user

### Right to Data Portability (Article 20)

**Implementation:**
- Data exported in machine-readable JSON format
- Includes all personal data in structured format
- Download available for 7 days after export completion

**Export Format:**
```json
{
  "exportedAt": "2024-01-15T10:30:00Z",
  "targetType": "USER",
  "user": {
    "profile": {
      "id": "user-123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "createdAt": "2023-06-01T00:00:00Z"
    },
    "auditLogs": [...],
    "sessions": [...]
  }
}
```

### Right to Rectification (Article 16)

**Implementation:**
- Users can update their profile information at any time
- Changes are logged for audit purposes
- Admins can correct data on behalf of users

**UI Access:**
- Settings > Profile > Edit Personal Information

### Right to Restriction (Article 18)

**Implementation:**
- Account suspension feature restricts processing
- Data remains stored but not processed
- Reactivation restores full processing

### Right to Object (Article 21)

**Implementation:**
- Users can opt-out of analytics and benchmarking
- Processing objections logged and enforced
- Entity-wide opt-out available for admins

## Organizational Obligations

### Lawful Basis for Processing

Foundry processes personal data under the following lawful bases:

| Data Type | Lawful Basis | Purpose |
|-----------|--------------|---------|
| Account data | Contract performance | Service delivery |
| Activity logs | Legitimate interest | Security, troubleshooting |
| Analytics | Consent | Product improvement |
| Benchmark data | Consent | Cross-entity insights |

### Data Protection by Design (Article 25)

**Technical Measures:**
- Row-Level Security (RLS) for data isolation
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Pseudonymization of benchmark data
- Automatic data minimization

**Organizational Measures:**
- Privacy impact assessments for new features
- Regular security audits
- Staff training on data protection
- Incident response procedures

### Records of Processing Activities (Article 30)

Foundry maintains processing records including:
- Categories of data subjects
- Categories of personal data
- Processing purposes
- Data recipients
- Retention periods
- Technical/organizational measures

**Access:**
- Admin Dashboard > Compliance > Processing Records

### Data Protection Impact Assessment (DPIA)

DPIA required for:
- New data processing activities
- Changes to existing processing
- High-risk processing operations

**Template available at:** `/docs/compliance/dpia-template.md`

### Breach Notification (Articles 33-34)

**Detection:**
- Real-time security monitoring
- Automated anomaly detection
- Audit log analysis

**Response Process:**
1. Incident detected and classified
2. Impact assessment (72 hours for supervisory authority)
3. Affected users notified (if high risk)
4. Remediation actions taken
5. Post-incident review

**Notification Template:**
```
Subject: Security Incident Notification

Dear [User],

We are writing to inform you of a security incident that may have affected your personal data.

What happened: [Description]
When it occurred: [Date/Time]
Data potentially affected: [Categories]
Actions we've taken: [Remediation]
Actions you should take: [Recommendations]

Contact: [DPO contact information]
```

### Data Retention

**Default Retention Periods:**

| Data Category | Retention Period | Justification |
|---------------|------------------|---------------|
| Account data | Account lifetime + 30 days | Service delivery |
| Audit logs | 2 years | Security/compliance |
| Process data | 1 year (configurable) | Business purpose |
| Deleted data archive | 30 days | Recovery period |
| Compliance archive | 7 years | Legal requirement |

**Configuration:**
```bash
PUT /api/gdpr/retention
{
  "processHistoryDays": 365,
  "auditLogDays": 730,
  "deletedDataDays": 30,
  "documentRetentionDays": 365
}
```

### International Transfers

**Supported Transfer Mechanisms:**
- Standard Contractual Clauses (SCCs)
- Adequacy decisions
- Binding Corporate Rules (on-premise)

**Configuration:**
- Admin Dashboard > Compliance > Data Transfers
- Select approved transfer mechanisms
- Configure data residency requirements

## Technical Implementation

### Data Isolation

```
┌─────────────────────────────────────────────────────────────┐
│                    Foundry Platform                          │
├─────────────────────────────────────────────────────────────┤
│  Entity A (Data Controller)   │   Entity B (Data Controller) │
│  ┌─────────────────────────┐  │   ┌─────────────────────────┐│
│  │ Users, Processes, Docs  │  │   │ Users, Processes, Docs  ││
│  │ (RLS enforced)          │  │   │ (RLS enforced)          ││
│  └─────────────────────────┘  │   └─────────────────────────┘│
│                               │                               │
│  Data never crosses boundary unless explicitly authorized     │
└─────────────────────────────────────────────────────────────┘
```

### Encryption

**At Rest:**
- Database: AES-256 encryption
- File storage: AES-256 encryption
- Backups: Encrypted with separate keys

**In Transit:**
- TLS 1.3 for all connections
- Certificate pinning for mobile apps
- mTLS for service-to-service communication

### Audit Logging

All personal data access is logged:

```typescript
interface AuditLogEntry {
  timestamp: Date;
  entityId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, any>;
}
```

**Log Retention:** 2 years (configurable)

### Anonymization

Benchmark data is anonymized before cross-entity aggregation:

```typescript
interface AnonymizationProcess {
  // Remove direct identifiers
  removeFields: ['email', 'name', 'userId'];

  // Generalize quasi-identifiers
  generalize: {
    date: 'month',
    department: 'category',
  };

  // Add statistical noise
  differentialPrivacy: {
    epsilon: 1.0,
    sensitivity: 1,
  };

  // Ensure k-anonymity
  kAnonymity: {
    k: 5,
    quasiIdentifiers: ['industry', 'size', 'region'],
  };
}
```

## Compliance Checklist

### For Entity Administrators

- [ ] Review and accept Data Processing Agreement
- [ ] Configure data retention policies
- [ ] Set up user consent collection
- [ ] Enable audit logging
- [ ] Configure IP allowlist (if required)
- [ ] Review third-party integrations
- [ ] Assign Data Protection Officer contact
- [ ] Test data export functionality
- [ ] Test data deletion functionality
- [ ] Document lawful basis for processing

### For Platform Administrators

- [ ] Enable encryption at rest
- [ ] Configure TLS certificates
- [ ] Set up breach notification process
- [ ] Configure backup encryption
- [ ] Enable security monitoring
- [ ] Document data flows
- [ ] Perform regular security audits
- [ ] Train staff on GDPR requirements
- [ ] Maintain processing records
- [ ] Review sub-processor agreements

## API Reference

### Data Export

```bash
# Request export
POST /api/gdpr/export/me
Response: { requestId, status, estimatedCompletion }

# Check status
GET /api/gdpr/export/:requestId
Response: { status, downloadUrl, expiresAt }

# Download
GET /api/gdpr/exports/:requestId/download
Response: JSON export file
```

### Data Deletion

```bash
# Request deletion
POST /api/gdpr/delete/me
Body: { scheduledFor?: ISO8601 }
Response: { requestId, scheduledFor }

# Cancel deletion
DELETE /api/gdpr/delete/:requestId
Response: { message: "Cancelled" }
```

### Retention Policy

```bash
# Get policy
GET /api/gdpr/retention
Response: { processHistoryDays, auditLogDays, ... }

# Update policy
PUT /api/gdpr/retention
Body: { processHistoryDays: 365, auditLogDays: 730 }

# Apply policy (cleanup old data)
POST /api/gdpr/retention/apply
```

## Contact

**Data Protection Officer:**
- Email: dpo@foundry.io
- Address: [Company Address]

**Supervisory Authority:**
- [Relevant Data Protection Authority]

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-15 | Initial release |
| 1.1 | 2024-03-01 | Added benchmark anonymization details |
| 1.2 | 2024-06-01 | Updated retention policies |
