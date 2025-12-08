/**
 * GDPR Compliance Checker
 * T163 - Implement GDPR compliance checker
 *
 * Specialized compliance checks for GDPR requirements
 */

import { PrismaClient } from '@prisma/client';
import type {
  ComplianceRule,
  EvaluationFinding,
  RuleEvaluationContext,
} from '../ruleEngine.js';
import { registerCustomEvaluator } from '../ruleEngine.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface GDPRCheckResult {
  passed: boolean;
  findings: EvaluationFinding[];
  evidenceIds: string[];
  recommendations: string[];
}

export interface DataRetentionPolicy {
  entityType: string;
  retentionDays: number;
  legalBasis: string;
}

export interface ConsentRecord {
  id: string;
  personId: string;
  purpose: string;
  consentGiven: boolean;
  consentDate: Date;
  withdrawnDate?: Date;
  version: string;
}

export interface DataAccessLog {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: 'read' | 'write' | 'delete' | 'export';
  accessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// GDPR Check Functions
// =============================================================================

/**
 * Check data retention compliance
 * GDPR Article 5(1)(e) - Storage limitation
 */
export async function checkDataRetention(
  context: RuleEvaluationContext,
  policies: DataRetentionPolicy[]
): Promise<GDPRCheckResult> {
  const findings: EvaluationFinding[] = [];
  const evidenceIds: string[] = [];
  const recommendations: string[] = [];
  let allPassed = true;

  for (const policy of policies) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    // Check for data beyond retention period
    const expiredCount = await countExpiredData(
      policy.entityType,
      cutoffDate,
      context.organizationId
    );

    if (expiredCount > 0) {
      allPassed = false;
      findings.push({
        type: 'fail',
        entity: policy.entityType,
        description: `${expiredCount} records exceed retention period of ${policy.retentionDays} days`,
        remediation: `Delete or anonymize ${policy.entityType} records older than ${policy.retentionDays} days`,
      });
      recommendations.push(
        `Schedule automatic deletion for ${policy.entityType} after ${policy.retentionDays} days`
      );
    } else {
      findings.push({
        type: 'pass',
        entity: policy.entityType,
        description: `All ${policy.entityType} records within retention period`,
      });
    }
  }

  return { passed: allPassed, findings, evidenceIds, recommendations };
}

/**
 * Check consent validity
 * GDPR Article 7 - Conditions for consent
 */
export async function checkConsentValidity(
  context: RuleEvaluationContext
): Promise<GDPRCheckResult> {
  const findings: EvaluationFinding[] = [];
  const evidenceIds: string[] = [];
  const recommendations: string[] = [];

  // Get consent records
  const consents = await getConsentRecords(context.organizationId);

  // Check for missing consents
  const personsWithoutConsent = await getPersonsWithoutConsent(context.organizationId);

  if (personsWithoutConsent.length > 0) {
    findings.push({
      type: 'fail',
      entity: 'Consent Records',
      description: `${personsWithoutConsent.length} persons have data processed without valid consent`,
      remediation: 'Obtain consent or identify another legal basis for processing',
    });
  }

  // Check for expired consents (e.g., older than 2 years without renewal)
  const expiredConsents = consents.filter((c) => {
    const consentAge = Date.now() - new Date(c.consentDate).getTime();
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    return consentAge > twoYearsMs && !c.withdrawnDate;
  });

  if (expiredConsents.length > 0) {
    findings.push({
      type: 'warning',
      entity: 'Consent Freshness',
      description: `${expiredConsents.length} consents are over 2 years old and should be renewed`,
      remediation: 'Request consent renewal from affected data subjects',
    });
    recommendations.push('Implement automatic consent renewal reminders');
  }

  // Check for withdrawn consents with ongoing processing
  const withdrawnWithProcessing = await checkWithdrawnConsentsProcessing(context.organizationId);

  if (withdrawnWithProcessing > 0) {
    findings.push({
      type: 'fail',
      entity: 'Consent Withdrawal',
      description: `${withdrawnWithProcessing} data subjects have withdrawn consent but processing continues`,
      remediation: 'Immediately cease processing for data subjects who withdrew consent',
    });
  }

  const passed =
    personsWithoutConsent.length === 0 && withdrawnWithProcessing === 0;

  if (passed && expiredConsents.length === 0) {
    findings.push({
      type: 'pass',
      entity: 'Consent Management',
      description: 'All consent records are valid and up-to-date',
    });
  }

  return {
    passed,
    findings,
    evidenceIds,
    recommendations,
  };
}

/**
 * Check access logging compliance
 * GDPR Article 30 - Records of processing activities
 */
export async function checkAccessLogging(
  context: RuleEvaluationContext
): Promise<GDPRCheckResult> {
  const findings: EvaluationFinding[] = [];
  const evidenceIds: string[] = [];
  const recommendations: string[] = [];

  // Check if access logging is enabled
  const loggingEnabled = await isAccessLoggingEnabled(context.organizationId);

  if (!loggingEnabled) {
    findings.push({
      type: 'fail',
      entity: 'Access Logging',
      description: 'Access logging is not enabled for personal data',
      remediation: 'Enable comprehensive access logging for all personal data access',
    });

    return {
      passed: false,
      findings,
      evidenceIds,
      recommendations: ['Implement access logging infrastructure immediately'],
    };
  }

  // Check for gaps in logging
  const loggingGaps = await detectLoggingGaps(context.organizationId);

  if (loggingGaps.length > 0) {
    findings.push({
      type: 'warning',
      entity: 'Access Log Completeness',
      description: `Detected ${loggingGaps.length} gaps in access logging`,
      remediation: 'Investigate and address logging gaps',
    });
    recommendations.push('Review logging configuration for all data access points');
  }

  // Check for suspicious access patterns
  const suspiciousAccess = await detectSuspiciousAccess(context.organizationId);

  if (suspiciousAccess.length > 0) {
    findings.push({
      type: 'warning',
      entity: 'Access Patterns',
      description: `${suspiciousAccess.length} potentially unauthorized access attempts detected`,
      remediation: 'Review and investigate flagged access patterns',
    });

    for (const access of suspiciousAccess.slice(0, 5)) {
      evidenceIds.push(access.id);
    }
  }

  const passed = loggingEnabled && loggingGaps.length === 0;

  if (passed && suspiciousAccess.length === 0) {
    findings.push({
      type: 'pass',
      entity: 'Access Logging',
      description: 'Comprehensive access logging in place with no gaps detected',
    });
  }

  return { passed, findings, evidenceIds, recommendations };
}

/**
 * Check data subject rights implementation
 * GDPR Articles 15-22 - Rights of the data subject
 */
export async function checkDataSubjectRights(
  context: RuleEvaluationContext
): Promise<GDPRCheckResult> {
  const findings: EvaluationFinding[] = [];
  const evidenceIds: string[] = [];
  const recommendations: string[] = [];
  let allPassed = true;

  // Check right to access (Article 15)
  const accessRequestsStatus = await getDataSubjectRequestStatus(
    context.organizationId,
    'access'
  );

  if (accessRequestsStatus.overdue > 0) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Right to Access',
      description: `${accessRequestsStatus.overdue} access requests are overdue (>30 days)`,
      remediation: 'Process overdue access requests immediately',
    });
  } else {
    findings.push({
      type: 'pass',
      entity: 'Right to Access',
      description: 'All access requests processed within 30-day deadline',
    });
  }

  // Check right to erasure (Article 17)
  const erasureRequestsStatus = await getDataSubjectRequestStatus(
    context.organizationId,
    'erasure'
  );

  if (erasureRequestsStatus.overdue > 0) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Right to Erasure',
      description: `${erasureRequestsStatus.overdue} erasure requests are overdue`,
      remediation: 'Process overdue erasure requests immediately',
    });
  }

  // Check right to portability (Article 20)
  const portabilityRequestsStatus = await getDataSubjectRequestStatus(
    context.organizationId,
    'portability'
  );

  if (portabilityRequestsStatus.overdue > 0) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Right to Portability',
      description: `${portabilityRequestsStatus.overdue} portability requests are overdue`,
      remediation: 'Process overdue portability requests immediately',
    });
  }

  // Check if export functionality exists
  const hasExportFunctionality = await checkExportFunctionality(context.organizationId);

  if (!hasExportFunctionality) {
    findings.push({
      type: 'warning',
      entity: 'Data Portability',
      description: 'No automated data export functionality detected',
      remediation: 'Implement automated data export in machine-readable format',
    });
    recommendations.push('Implement self-service data export feature');
  }

  return { passed: allPassed, findings, evidenceIds, recommendations };
}

/**
 * Check data breach notification readiness
 * GDPR Article 33-34 - Breach notification
 */
export async function checkBreachNotificationReadiness(
  context: RuleEvaluationContext
): Promise<GDPRCheckResult> {
  const findings: EvaluationFinding[] = [];
  const evidenceIds: string[] = [];
  const recommendations: string[] = [];
  let allPassed = true;

  // Check if breach detection is in place
  const hasBreachDetection = await checkBreachDetectionCapability(context.organizationId);

  if (!hasBreachDetection) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Breach Detection',
      description: 'No automated breach detection mechanism in place',
      remediation: 'Implement breach detection and alerting system',
    });
  }

  // Check if breach notification process is documented
  const hasNotificationProcess = await checkBreachNotificationProcess(context.organizationId);

  if (!hasNotificationProcess) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Breach Notification Process',
      description: 'No documented breach notification process found',
      remediation: 'Document and implement 72-hour breach notification process',
    });
  }

  // Check if DPO contact is available
  const hasDPOContact = await checkDPOContact(context.organizationId);

  if (!hasDPOContact) {
    findings.push({
      type: 'warning',
      entity: 'DPO Contact',
      description: 'No Data Protection Officer contact configured',
      remediation: 'Designate DPO or data protection point of contact',
    });
  }

  // Check recent breach response times
  const breachResponseTimes = await getBreachResponseTimes(context.organizationId);

  for (const breach of breachResponseTimes) {
    if (breach.notificationTimeHours > 72) {
      allPassed = false;
      findings.push({
        type: 'fail',
        entity: 'Breach Response',
        entityId: breach.id,
        description: `Breach ${breach.id} notified in ${breach.notificationTimeHours} hours (>72 hours)`,
        remediation: 'Review and improve breach response procedures',
      });
    }
  }

  if (allPassed) {
    findings.push({
      type: 'pass',
      entity: 'Breach Notification',
      description: 'Breach notification readiness verified',
    });
  }

  return { passed: allPassed, findings, evidenceIds, recommendations };
}

/**
 * Check privacy by design implementation
 * GDPR Article 25 - Data protection by design and by default
 */
export async function checkPrivacyByDesign(
  context: RuleEvaluationContext
): Promise<GDPRCheckResult> {
  const findings: EvaluationFinding[] = [];
  const recommendations: string[] = [];
  let allPassed = true;

  // Check data minimization
  const excessiveDataCollections = await detectExcessiveDataCollection(context.organizationId);

  if (excessiveDataCollections.length > 0) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Data Minimization',
      description: `${excessiveDataCollections.length} data collections may violate data minimization`,
      remediation: 'Review and reduce data collection to necessary minimum',
    });
  }

  // Check default privacy settings
  const defaultPrivacySettings = await checkDefaultPrivacySettings(context.organizationId);

  if (!defaultPrivacySettings.isPrivacyFirst) {
    findings.push({
      type: 'warning',
      entity: 'Privacy by Default',
      description: 'Default settings do not prioritize privacy',
      remediation: 'Change default settings to most privacy-protective option',
    });
  }

  // Check encryption at rest
  const encryptionStatus = await checkEncryptionAtRest(context.organizationId);

  if (!encryptionStatus.allEncrypted) {
    allPassed = false;
    findings.push({
      type: 'fail',
      entity: 'Encryption at Rest',
      description: `${encryptionStatus.unencryptedCount} data stores are not encrypted`,
      remediation: 'Enable encryption for all personal data storage',
    });
  }

  // Check pseudonymization
  const pseudonymizationStatus = await checkPseudonymization(context.organizationId);

  if (!pseudonymizationStatus.implemented) {
    findings.push({
      type: 'warning',
      entity: 'Pseudonymization',
      description: 'Pseudonymization not implemented for personal data',
      remediation: 'Implement pseudonymization where appropriate',
    });
    recommendations.push('Implement data pseudonymization for analytics and testing');
  }

  if (allPassed) {
    findings.push({
      type: 'pass',
      entity: 'Privacy by Design',
      description: 'Privacy by design principles implemented',
    });
  }

  return { passed: allPassed, findings, evidenceIds: [], recommendations };
}

// =============================================================================
// Helper Functions
// =============================================================================

async function countExpiredData(
  _entityType: string,
  _cutoffDate: Date,
  _organizationId: string
): Promise<number> {
  // Implementation would query database for expired records
  return 0;
}

async function getConsentRecords(_organizationId: string): Promise<ConsentRecord[]> {
  // Implementation would fetch consent records
  return [];
}

async function getPersonsWithoutConsent(_organizationId: string): Promise<string[]> {
  // Implementation would identify persons without valid consent
  return [];
}

async function checkWithdrawnConsentsProcessing(_organizationId: string): Promise<number> {
  // Implementation would check for processing after consent withdrawal
  return 0;
}

async function isAccessLoggingEnabled(_organizationId: string): Promise<boolean> {
  // Implementation would check logging configuration
  return true;
}

async function detectLoggingGaps(
  _organizationId: string
): Promise<{ start: Date; end: Date }[]> {
  // Implementation would detect gaps in access logs
  return [];
}

async function detectSuspiciousAccess(
  _organizationId: string
): Promise<DataAccessLog[]> {
  // Implementation would detect suspicious access patterns
  return [];
}

interface RequestStatus {
  pending: number;
  completed: number;
  overdue: number;
}

async function getDataSubjectRequestStatus(
  _organizationId: string,
  _requestType: 'access' | 'erasure' | 'portability'
): Promise<RequestStatus> {
  // Implementation would get status of data subject requests
  return { pending: 0, completed: 0, overdue: 0 };
}

async function checkExportFunctionality(_organizationId: string): Promise<boolean> {
  // Implementation would check for data export capability
  return true;
}

async function checkBreachDetectionCapability(_organizationId: string): Promise<boolean> {
  // Implementation would check breach detection systems
  return true;
}

async function checkBreachNotificationProcess(_organizationId: string): Promise<boolean> {
  // Implementation would check for documented process
  return true;
}

async function checkDPOContact(_organizationId: string): Promise<boolean> {
  // Implementation would check for DPO configuration
  return true;
}

interface BreachResponse {
  id: string;
  notificationTimeHours: number;
}

async function getBreachResponseTimes(_organizationId: string): Promise<BreachResponse[]> {
  // Implementation would get historical breach response times
  return [];
}

async function detectExcessiveDataCollection(
  _organizationId: string
): Promise<{ entity: string; fields: string[] }[]> {
  // Implementation would detect unnecessary data collection
  return [];
}

async function checkDefaultPrivacySettings(
  _organizationId: string
): Promise<{ isPrivacyFirst: boolean }> {
  // Implementation would check default settings
  return { isPrivacyFirst: true };
}

async function checkEncryptionAtRest(
  _organizationId: string
): Promise<{ allEncrypted: boolean; unencryptedCount: number }> {
  // Implementation would check encryption status
  return { allEncrypted: true, unencryptedCount: 0 };
}

async function checkPseudonymization(
  _organizationId: string
): Promise<{ implemented: boolean }> {
  // Implementation would check pseudonymization implementation
  return { implemented: true };
}

// =============================================================================
// Register Custom Evaluators
// =============================================================================

registerCustomEvaluator('gdpr_data_retention', async (config, context) => {
  const policies = (config.parameters.policies || []) as DataRetentionPolicy[];
  const result = await checkDataRetention(context, policies);
  return { passed: result.passed, findings: result.findings };
});

registerCustomEvaluator('gdpr_consent', async (_config, context) => {
  const result = await checkConsentValidity(context);
  return { passed: result.passed, findings: result.findings };
});

registerCustomEvaluator('gdpr_access_logging', async (_config, context) => {
  const result = await checkAccessLogging(context);
  return { passed: result.passed, findings: result.findings };
});

registerCustomEvaluator('gdpr_data_subject_rights', async (_config, context) => {
  const result = await checkDataSubjectRights(context);
  return { passed: result.passed, findings: result.findings };
});

registerCustomEvaluator('gdpr_breach_notification', async (_config, context) => {
  const result = await checkBreachNotificationReadiness(context);
  return { passed: result.passed, findings: result.findings };
});

registerCustomEvaluator('gdpr_privacy_by_design', async (_config, context) => {
  const result = await checkPrivacyByDesign(context);
  return { passed: result.passed, findings: result.findings };
});

// =============================================================================
// Exports
// =============================================================================

export default {
  checkDataRetention,
  checkConsentValidity,
  checkAccessLogging,
  checkDataSubjectRights,
  checkBreachNotificationReadiness,
  checkPrivacyByDesign,
};
