/**
 * Privacy Policy Configuration
 * Central configuration for all privacy settings
 * T297 - Privacy policy configuration
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export type PrivacyMode = 'standard' | 'strict' | 'minimal' | 'custom';
export type ConsentRequirement = 'none' | 'implicit' | 'explicit' | 'written';
export type DataRetentionPolicy = 'indefinite' | '1_year' | '2_years' | '5_years' | '7_years' | 'custom';

export interface PrivacyPolicyConfig {
  id: string;
  organizationId: string;
  mode: PrivacyMode;

  // Data collection settings
  dataCollection: {
    enabled: boolean;
    metadataOnly: boolean;
    contentAnalysis: boolean;
    behavioralTracking: boolean;
    locationTracking: boolean;
  };

  // Consent settings
  consent: {
    required: ConsentRequirement;
    worksCouncilApproval: boolean;
    individualOptOut: boolean;
    purposeLimitation: boolean;
    granularConsent: boolean;
  };

  // Data retention
  retention: {
    policy: DataRetentionPolicy;
    customDays?: number;
    automaticDeletion: boolean;
    anonymizeOnExpiry: boolean;
  };

  // Anonymization settings
  anonymization: {
    enabled: boolean;
    defaultStrategy: 'hash' | 'mask' | 'pseudonymize' | 'remove';
    piiDetection: boolean;
    autoAnonymize: boolean;
  };

  // Access control
  accessControl: {
    roleBasedAccess: boolean;
    auditAllAccess: boolean;
    justificationRequired: boolean;
    timeBasedAccess: boolean;
  };

  // Reporting settings
  reporting: {
    aggregatedOnly: boolean;
    minimumGroupSize: number;
    excludeOutliers: boolean;
    worksCouncilCompliant: boolean;
  };

  // External sharing
  externalSharing: {
    allowed: boolean;
    anonymizationRequired: boolean;
    approvalRequired: boolean;
    auditRequired: boolean;
  };

  // GDPR specific
  gdpr: {
    dataPortability: boolean;
    rightToErasure: boolean;
    rightToRectification: boolean;
    accessRequests: boolean;
    breachNotification: boolean;
    dpoContact?: string;
  };

  // Audit
  lastReviewedAt?: Date;
  lastReviewedBy?: string;
  nextReviewDue?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyTemplate {
  name: string;
  description: string;
  mode: PrivacyMode;
  config: Partial<PrivacyPolicyConfig>;
}

// Predefined policy templates
const POLICY_TEMPLATES: Record<PrivacyMode, PolicyTemplate> = {
  standard: {
    name: 'Standard GDPR Compliance',
    description: 'Balanced privacy settings suitable for most organizations',
    mode: 'standard',
    config: {
      dataCollection: {
        enabled: true,
        metadataOnly: false,
        contentAnalysis: true,
        behavioralTracking: false,
        locationTracking: false,
      },
      consent: {
        required: 'implicit',
        worksCouncilApproval: false,
        individualOptOut: true,
        purposeLimitation: true,
        granularConsent: false,
      },
      retention: {
        policy: '2_years',
        automaticDeletion: true,
        anonymizeOnExpiry: true,
      },
      anonymization: {
        enabled: true,
        defaultStrategy: 'pseudonymize',
        piiDetection: true,
        autoAnonymize: false,
      },
      accessControl: {
        roleBasedAccess: true,
        auditAllAccess: true,
        justificationRequired: false,
        timeBasedAccess: false,
      },
      reporting: {
        aggregatedOnly: false,
        minimumGroupSize: 5,
        excludeOutliers: false,
        worksCouncilCompliant: false,
      },
      externalSharing: {
        allowed: true,
        anonymizationRequired: true,
        approvalRequired: false,
        auditRequired: true,
      },
      gdpr: {
        dataPortability: true,
        rightToErasure: true,
        rightToRectification: true,
        accessRequests: true,
        breachNotification: true,
      },
    },
  },
  strict: {
    name: 'Strict Privacy (Works Council)',
    description: 'Maximum privacy protection with Betriebsrat compliance',
    mode: 'strict',
    config: {
      dataCollection: {
        enabled: true,
        metadataOnly: true,
        contentAnalysis: false,
        behavioralTracking: false,
        locationTracking: false,
      },
      consent: {
        required: 'explicit',
        worksCouncilApproval: true,
        individualOptOut: true,
        purposeLimitation: true,
        granularConsent: true,
      },
      retention: {
        policy: '1_year',
        automaticDeletion: true,
        anonymizeOnExpiry: true,
      },
      anonymization: {
        enabled: true,
        defaultStrategy: 'hash',
        piiDetection: true,
        autoAnonymize: true,
      },
      accessControl: {
        roleBasedAccess: true,
        auditAllAccess: true,
        justificationRequired: true,
        timeBasedAccess: true,
      },
      reporting: {
        aggregatedOnly: true,
        minimumGroupSize: 10,
        excludeOutliers: true,
        worksCouncilCompliant: true,
      },
      externalSharing: {
        allowed: false,
        anonymizationRequired: true,
        approvalRequired: true,
        auditRequired: true,
      },
      gdpr: {
        dataPortability: true,
        rightToErasure: true,
        rightToRectification: true,
        accessRequests: true,
        breachNotification: true,
      },
    },
  },
  minimal: {
    name: 'Minimal Privacy',
    description: 'Basic privacy controls for internal-only use',
    mode: 'minimal',
    config: {
      dataCollection: {
        enabled: true,
        metadataOnly: false,
        contentAnalysis: true,
        behavioralTracking: true,
        locationTracking: false,
      },
      consent: {
        required: 'none',
        worksCouncilApproval: false,
        individualOptOut: false,
        purposeLimitation: false,
        granularConsent: false,
      },
      retention: {
        policy: 'indefinite',
        automaticDeletion: false,
        anonymizeOnExpiry: false,
      },
      anonymization: {
        enabled: false,
        defaultStrategy: 'mask',
        piiDetection: false,
        autoAnonymize: false,
      },
      accessControl: {
        roleBasedAccess: false,
        auditAllAccess: false,
        justificationRequired: false,
        timeBasedAccess: false,
      },
      reporting: {
        aggregatedOnly: false,
        minimumGroupSize: 1,
        excludeOutliers: false,
        worksCouncilCompliant: false,
      },
      externalSharing: {
        allowed: true,
        anonymizationRequired: false,
        approvalRequired: false,
        auditRequired: false,
      },
      gdpr: {
        dataPortability: true,
        rightToErasure: true,
        rightToRectification: true,
        accessRequests: true,
        breachNotification: true,
      },
    },
  },
  custom: {
    name: 'Custom Configuration',
    description: 'Fully customizable privacy settings',
    mode: 'custom',
    config: {},
  },
};

/**
 * Get privacy policy configuration for an organization
 */
export async function getPrivacyPolicy(
  organizationId: string
): Promise<PrivacyPolicyConfig> {
  const config = await prisma.privacyConfig.findUnique({
    where: { organizationId },
  });

  if (config) {
    return transformConfig(config);
  }

  // Return default standard policy
  return createDefaultPolicy(organizationId);
}

/**
 * Create or update privacy policy
 */
export async function updatePrivacyPolicy(
  organizationId: string,
  updates: Partial<PrivacyPolicyConfig>,
  updatedBy: string
): Promise<PrivacyPolicyConfig> {
  const existing = await getPrivacyPolicy(organizationId);
  const merged = deepMerge(existing, updates);

  const config = await prisma.privacyConfig.upsert({
    where: { organizationId },
    create: {
      id: uuidv4(),
      organizationId,
      mode: merged.mode,
      dataCollection: merged.dataCollection as unknown as Record<string, unknown>,
      consent: merged.consent as unknown as Record<string, unknown>,
      retention: merged.retention as unknown as Record<string, unknown>,
      anonymization: merged.anonymization as unknown as Record<string, unknown>,
      accessControl: merged.accessControl as unknown as Record<string, unknown>,
      reporting: merged.reporting as unknown as Record<string, unknown>,
      externalSharing: merged.externalSharing as unknown as Record<string, unknown>,
      gdpr: merged.gdpr as unknown as Record<string, unknown>,
      lastReviewedBy: updatedBy,
      lastReviewedAt: new Date(),
      nextReviewDue: calculateNextReview(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      mode: merged.mode,
      dataCollection: merged.dataCollection as unknown as Record<string, unknown>,
      consent: merged.consent as unknown as Record<string, unknown>,
      retention: merged.retention as unknown as Record<string, unknown>,
      anonymization: merged.anonymization as unknown as Record<string, unknown>,
      accessControl: merged.accessControl as unknown as Record<string, unknown>,
      reporting: merged.reporting as unknown as Record<string, unknown>,
      externalSharing: merged.externalSharing as unknown as Record<string, unknown>,
      gdpr: merged.gdpr as unknown as Record<string, unknown>,
      lastReviewedBy: updatedBy,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return transformConfig(config);
}

/**
 * Apply a policy template
 */
export async function applyPolicyTemplate(
  organizationId: string,
  mode: PrivacyMode,
  updatedBy: string
): Promise<PrivacyPolicyConfig> {
  const template = POLICY_TEMPLATES[mode];

  if (!template) {
    throw new Error(`Unknown policy mode: ${mode}`);
  }

  return updatePrivacyPolicy(
    organizationId,
    { mode, ...template.config },
    updatedBy
  );
}

/**
 * Get available policy templates
 */
export function getPolicyTemplates(): PolicyTemplate[] {
  return Object.values(POLICY_TEMPLATES);
}

/**
 * Validate policy configuration
 */
export function validatePolicyConfig(
  config: Partial<PrivacyPolicyConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate retention settings
  if (config.retention) {
    if (
      config.retention.policy === 'custom' &&
      (!config.retention.customDays || config.retention.customDays < 1)
    ) {
      errors.push('Custom retention policy requires valid customDays value');
    }
  }

  // Validate reporting settings
  if (config.reporting) {
    if (
      config.reporting.aggregatedOnly &&
      config.reporting.minimumGroupSize < 3
    ) {
      errors.push('Minimum group size must be at least 3 for aggregated reporting');
    }

    if (config.reporting.worksCouncilCompliant && config.reporting.minimumGroupSize < 5) {
      errors.push('Works council compliance requires minimum group size of 5');
    }
  }

  // Validate GDPR settings
  if (config.gdpr) {
    if (!config.gdpr.rightToErasure) {
      errors.push('Right to erasure is required for GDPR compliance');
    }
  }

  // Validate consent settings
  if (config.consent) {
    if (config.consent.worksCouncilApproval && config.consent.required === 'none') {
      errors.push('Works council approval requires at least implicit consent');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a specific operation is allowed
 */
export async function isOperationAllowed(
  organizationId: string,
  operation: 'collect' | 'analyze' | 'share' | 'retain' | 'export',
  context?: { dataType?: string; purpose?: string }
): Promise<{ allowed: boolean; reason?: string }> {
  const policy = await getPrivacyPolicy(organizationId);

  switch (operation) {
    case 'collect':
      if (!policy.dataCollection.enabled) {
        return { allowed: false, reason: 'Data collection is disabled' };
      }
      if (policy.dataCollection.metadataOnly && context?.dataType === 'content') {
        return { allowed: false, reason: 'Only metadata collection is allowed' };
      }
      break;

    case 'analyze':
      if (!policy.dataCollection.contentAnalysis && context?.dataType === 'content') {
        return { allowed: false, reason: 'Content analysis is disabled' };
      }
      break;

    case 'share':
      if (!policy.externalSharing.allowed) {
        return { allowed: false, reason: 'External sharing is disabled' };
      }
      break;

    case 'retain':
      if (policy.retention.policy !== 'indefinite') {
        return {
          allowed: true,
          reason: `Data will be retained for ${policy.retention.policy}`,
        };
      }
      break;

    case 'export':
      if (!policy.gdpr.dataPortability) {
        return { allowed: false, reason: 'Data portability is disabled' };
      }
      break;
  }

  return { allowed: true };
}

/**
 * Get privacy compliance score
 */
export async function getComplianceScore(
  organizationId: string
): Promise<{
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: Record<string, number>;
  recommendations: string[];
}> {
  const policy = await getPrivacyPolicy(organizationId);
  const breakdown: Record<string, number> = {};
  const recommendations: string[] = [];

  // Data minimization score
  let dataMinimization = 50;
  if (policy.dataCollection.metadataOnly) dataMinimization += 30;
  if (!policy.dataCollection.behavioralTracking) dataMinimization += 10;
  if (!policy.dataCollection.locationTracking) dataMinimization += 10;
  breakdown.dataMinimization = dataMinimization;

  // Consent score
  let consent = 40;
  if (policy.consent.required === 'explicit') consent += 30;
  else if (policy.consent.required === 'implicit') consent += 15;
  if (policy.consent.individualOptOut) consent += 15;
  if (policy.consent.purposeLimitation) consent += 15;
  breakdown.consent = Math.min(consent, 100);

  // Anonymization score
  let anonymization = 30;
  if (policy.anonymization.enabled) anonymization += 30;
  if (policy.anonymization.piiDetection) anonymization += 20;
  if (policy.anonymization.autoAnonymize) anonymization += 20;
  breakdown.anonymization = anonymization;

  // Access control score
  let accessControl = 30;
  if (policy.accessControl.roleBasedAccess) accessControl += 25;
  if (policy.accessControl.auditAllAccess) accessControl += 25;
  if (policy.accessControl.justificationRequired) accessControl += 20;
  breakdown.accessControl = accessControl;

  // GDPR compliance score
  let gdpr = 0;
  if (policy.gdpr.rightToErasure) gdpr += 25;
  if (policy.gdpr.dataPortability) gdpr += 20;
  if (policy.gdpr.accessRequests) gdpr += 20;
  if (policy.gdpr.breachNotification) gdpr += 20;
  if (policy.gdpr.dpoContact) gdpr += 15;
  breakdown.gdpr = gdpr;

  // Calculate overall score
  const score = Math.round(
    (breakdown.dataMinimization +
      breakdown.consent +
      breakdown.anonymization +
      breakdown.accessControl +
      breakdown.gdpr) /
      5
  );

  // Generate recommendations
  if (!policy.anonymization.enabled) {
    recommendations.push('Enable anonymization for better privacy protection');
  }
  if (!policy.accessControl.auditAllAccess) {
    recommendations.push('Enable access auditing for compliance');
  }
  if (policy.consent.required === 'none') {
    recommendations.push('Consider implementing consent mechanisms');
  }
  if (!policy.gdpr.dpoContact) {
    recommendations.push('Add Data Protection Officer contact information');
  }
  if (policy.retention.policy === 'indefinite') {
    recommendations.push('Set a data retention limit for compliance');
  }

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return { score, grade, breakdown, recommendations };
}

/**
 * Schedule policy review
 */
export async function scheduleReview(
  organizationId: string,
  reviewDate: Date
): Promise<void> {
  await prisma.privacyConfig.update({
    where: { organizationId },
    data: {
      nextReviewDue: reviewDate,
      updatedAt: new Date(),
    },
  });
}

// Helper functions

function createDefaultPolicy(organizationId: string): PrivacyPolicyConfig {
  const template = POLICY_TEMPLATES.standard;

  return {
    id: '',
    organizationId,
    mode: 'standard',
    dataCollection: template.config.dataCollection!,
    consent: template.config.consent!,
    retention: template.config.retention!,
    anonymization: template.config.anonymization!,
    accessControl: template.config.accessControl!,
    reporting: template.config.reporting!,
    externalSharing: template.config.externalSharing!,
    gdpr: template.config.gdpr!,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PrivacyPolicyConfig;
}

function transformConfig(config: Record<string, unknown>): PrivacyPolicyConfig {
  return {
    id: config.id as string,
    organizationId: config.organizationId as string,
    mode: config.mode as PrivacyMode,
    dataCollection: config.dataCollection as PrivacyPolicyConfig['dataCollection'],
    consent: config.consent as PrivacyPolicyConfig['consent'],
    retention: config.retention as PrivacyPolicyConfig['retention'],
    anonymization: config.anonymization as PrivacyPolicyConfig['anonymization'],
    accessControl: config.accessControl as PrivacyPolicyConfig['accessControl'],
    reporting: config.reporting as PrivacyPolicyConfig['reporting'],
    externalSharing: config.externalSharing as PrivacyPolicyConfig['externalSharing'],
    gdpr: config.gdpr as PrivacyPolicyConfig['gdpr'],
    lastReviewedAt: config.lastReviewedAt as Date | undefined,
    lastReviewedBy: config.lastReviewedBy as string | undefined,
    nextReviewDue: config.nextReviewDue as Date | undefined,
    createdAt: config.createdAt as Date,
    updatedAt: config.updatedAt as Date,
  };
}

function calculateNextReview(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 3); // Review every 3 months
  return date;
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key])
      ) {
        result[key] = deepMerge(
          (target[key] || {}) as Record<string, unknown>,
          source[key] as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

export default {
  getPrivacyPolicy,
  updatePrivacyPolicy,
  applyPolicyTemplate,
  getPolicyTemplates,
  validatePolicyConfig,
  isOperationAllowed,
  getComplianceScore,
  scheduleReview,
};
