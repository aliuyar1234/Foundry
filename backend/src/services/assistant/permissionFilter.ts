/**
 * Permission Filter Service
 * T075 - Create permission-aware context filter
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { type RetrievedContext } from './contextRetriever.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

interface UserPermissions {
  userId: string;
  organizationId: string;
  roles: string[];
  departments: string[];
  accessLevel: 'public' | 'internal' | 'confidential' | 'restricted';
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Filter retrieved context by user permissions
 */
export async function filterByPermissions(
  context: RetrievedContext[],
  userId: string,
  organizationId: string
): Promise<RetrievedContext[]> {
  // Get user permissions
  const permissions = await getUserPermissions(userId, organizationId);

  // Filter context based on permissions
  const filtered = context.filter(ctx => {
    return hasAccessToContext(ctx, permissions);
  });

  logger.debug({
    userId,
    originalCount: context.length,
    filteredCount: filtered.length,
  }, 'Context filtered by permissions');

  return filtered;
}

/**
 * Get user permissions
 */
async function getUserPermissions(
  userId: string,
  organizationId: string
): Promise<UserPermissions> {
  // In a full implementation, this would query user roles and permissions
  // For now, return default permissions

  // Try to get user's expertise profile for department info
  const profile = await prisma.expertiseProfile.findFirst({
    where: { personId: userId, organizationId },
  });

  const availability = profile?.availability as Record<string, unknown> | null;

  return {
    userId,
    organizationId,
    roles: ['employee'], // Default role
    departments: availability?.department ? [availability.department as string] : [],
    accessLevel: 'internal', // Default access level
  };
}

/**
 * Check if user has access to specific context
 */
function hasAccessToContext(
  context: RetrievedContext,
  permissions: UserPermissions
): boolean {
  // Check context metadata for access restrictions
  const metadata = context.metadata;

  // Check explicit access level
  const requiredAccess = metadata.accessLevel as string | undefined;
  if (requiredAccess) {
    const accessLevels = ['public', 'internal', 'confidential', 'restricted'];
    const userLevel = accessLevels.indexOf(permissions.accessLevel);
    const requiredLevel = accessLevels.indexOf(requiredAccess);

    if (requiredLevel > userLevel) {
      return false;
    }
  }

  // Check department restrictions
  const restrictedDepartments = metadata.restrictedToDepartments as string[] | undefined;
  if (restrictedDepartments && restrictedDepartments.length > 0) {
    const hasAccess = restrictedDepartments.some(dept =>
      permissions.departments.includes(dept)
    );
    if (!hasAccess) {
      return false;
    }
  }

  // Check role restrictions
  const requiredRoles = metadata.requiredRoles as string[] | undefined;
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRole = requiredRoles.some(role =>
      permissions.roles.includes(role)
    );
    if (!hasRole) {
      return false;
    }
  }

  // Check if context contains sensitive data markers
  if (context.type === 'person') {
    // Limit what personal information is exposed
    return filterSensitivePersonData(context, permissions);
  }

  return true;
}

/**
 * Filter sensitive personal data from context
 */
function filterSensitivePersonData(
  context: RetrievedContext,
  permissions: UserPermissions
): boolean {
  const metadata = context.metadata;

  // Don't expose salary information unless HR
  if (metadata.salary && !permissions.roles.includes('hr')) {
    delete metadata.salary;
  }

  // Don't expose personal contact info unless same team
  const personDepartment = metadata.department as string | undefined;
  if (personDepartment && !permissions.departments.includes(personDepartment)) {
    if (metadata.personalPhone) delete metadata.personalPhone;
    if (metadata.personalEmail) delete metadata.personalEmail;
  }

  return true;
}

/**
 * Check if query itself requires special permissions
 */
export async function validateQueryPermissions(
  query: string,
  userId: string,
  organizationId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const permissions = await getUserPermissions(userId, organizationId);

  // Check for restricted query patterns
  const restrictedPatterns = [
    {
      pattern: /salary|gehalt|compensation|vergütung/i,
      requiredRoles: ['hr', 'finance', 'manager'],
      message: 'Salary information requires HR or Finance access',
    },
    {
      pattern: /security|password|credentials|zugangsdaten/i,
      requiredRoles: ['it', 'security', 'admin'],
      message: 'Security-related queries require IT or Security access',
    },
    {
      pattern: /confidential|vertraulich|geheim|secret/i,
      requiredAccess: 'confidential' as const,
      message: 'This information requires confidential access level',
    },
  ];

  for (const restriction of restrictedPatterns) {
    if (restriction.pattern.test(query)) {
      if (restriction.requiredRoles) {
        const hasRole = restriction.requiredRoles.some(role =>
          permissions.roles.includes(role)
        );
        if (!hasRole) {
          return { allowed: false, reason: restriction.message };
        }
      }

      if (restriction.requiredAccess) {
        const accessLevels = ['public', 'internal', 'confidential', 'restricted'];
        const userLevel = accessLevels.indexOf(permissions.accessLevel);
        const requiredLevel = accessLevels.indexOf(restriction.requiredAccess);

        if (requiredLevel > userLevel) {
          return { allowed: false, reason: restriction.message };
        }
      }
    }
  }

  return { allowed: true };
}

/**
 * Redact sensitive information from response
 */
export function redactSensitiveInfo(
  content: string,
  permissions: UserPermissions
): string {
  let result = content;

  // Redact patterns based on access level
  if (permissions.accessLevel === 'public') {
    // Redact email addresses
    result = result.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      '[EMAIL REDACTED]'
    );

    // Redact phone numbers
    result = result.replace(
      /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
      '[PHONE REDACTED]'
    );
  }

  // Redact monetary amounts unless finance
  if (!permissions.roles.includes('finance') && !permissions.roles.includes('hr')) {
    result = result.replace(
      /€\s*[\d,.]+|[\d,.]+\s*€|\$\s*[\d,.]+|[\d,.]+\s*(?:EUR|USD)/gi,
      '[AMOUNT REDACTED]'
    );
  }

  return result;
}

export default {
  filterByPermissions,
  validateQueryPermissions,
  redactSensitiveInfo,
};
