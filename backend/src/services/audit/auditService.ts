/**
 * Audit Logging Service
 * Records all significant actions for compliance and debugging
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

const auditLogger = logger.child({ service: 'AuditService' });

export interface AuditLogEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  userId?: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilters {
  organizationId: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogQuery extends AuditLogFilters {
  page?: number;
  pageSize?: number;
  sortOrder?: 'asc' | 'desc';
}

// Audit action constants
export const AuditActions = {
  // Auth
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  LOGIN_FAILED: 'auth.login_failed',

  // Organization
  ORG_CREATE: 'organization.create',
  ORG_UPDATE: 'organization.update',
  ORG_DELETE: 'organization.delete',

  // User
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_ROLE_CHANGE: 'user.role_change',

  // Data Source
  DATASOURCE_CREATE: 'datasource.create',
  DATASOURCE_UPDATE: 'datasource.update',
  DATASOURCE_DELETE: 'datasource.delete',
  DATASOURCE_CONNECT: 'datasource.connect',
  DATASOURCE_DISCONNECT: 'datasource.disconnect',
  DATASOURCE_SYNC_START: 'datasource.sync_start',
  DATASOURCE_SYNC_COMPLETE: 'datasource.sync_complete',
  DATASOURCE_SYNC_FAIL: 'datasource.sync_fail',

  // Discovery
  DISCOVERY_START: 'discovery.start',
  DISCOVERY_COMPLETE: 'discovery.complete',
  DISCOVERY_FAIL: 'discovery.fail',

  // Assessment
  ASSESSMENT_CREATE: 'assessment.create',
  ASSESSMENT_COMPLETE: 'assessment.complete',
  ASSESSMENT_EXPORT: 'assessment.export',

  // SOP
  SOP_CREATE: 'sop.create',
  SOP_UPDATE: 'sop.update',
  SOP_PUBLISH: 'sop.publish',
  SOP_ARCHIVE: 'sop.archive',
  SOP_EXPORT: 'sop.export',

  // Entity Record
  ENTITY_MERGE: 'entity.merge',
  ENTITY_EXPORT: 'entity.export',

  // Simulation
  SIMULATION_RUN: 'simulation.run',

  // GDPR
  GDPR_EXPORT: 'gdpr.export',
  GDPR_DELETE: 'gdpr.delete',

  // Admin
  SETTINGS_UPDATE: 'settings.update',
  ADMIN_CACHE_CLEAR: 'admin.cache_clear',
  ADMIN_QUEUE_MANAGE: 'admin.queue_manage',

  // Security - Session/Token Management
  SESSION_REVOKE: 'security.session_revoke',
  SESSION_REVOKE_ALL: 'security.session_revoke_all',
  TOKEN_REVOKE: 'security.token_revoke',
  ORG_TOKENS_REVOKE: 'security.org_tokens_revoke',
  USER_TOKENS_REVOKE: 'security.user_tokens_revoke',

  // Security - Credentials
  CREDENTIAL_CREATE: 'security.credential_create',
  CREDENTIAL_UPDATE: 'security.credential_update',
  CREDENTIAL_DELETE: 'security.credential_delete',
  CREDENTIAL_ACCESS: 'security.credential_access',

  // Security - Permissions
  PERMISSION_GRANT: 'security.permission_grant',
  PERMISSION_REVOKE: 'security.permission_revoke',
  ROLE_CHANGE: 'security.role_change',

  // Security - Access Control
  IP_ALLOWLIST_UPDATE: 'security.ip_allowlist_update',
  SSO_CONFIG_UPDATE: 'security.sso_config_update',

  // Connector
  CONNECTOR_CREATE: 'connector.create',
  CONNECTOR_UPDATE: 'connector.update',
  CONNECTOR_DELETE: 'connector.delete',
  CONNECTOR_CREDENTIAL_UPDATE: 'connector.credential_update',
  CONNECTOR_TEST: 'connector.test',
  CONNECTOR_SYNC: 'connector.sync',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export class AuditService {
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          details: entry.details || {},
          userId: entry.userId,
          organizationId: entry.organizationId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });

      // Also log security-sensitive actions to structured logger for SIEM integration
      if (entry.action.startsWith('security.') || entry.action.startsWith('admin.')) {
        auditLogger.info(
          {
            action: entry.action,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            userId: entry.userId,
            organizationId: entry.organizationId,
            ipAddress: entry.ipAddress,
          },
          `Security audit: ${entry.action}`
        );
      }
    } catch (error) {
      // Log audit failures but don't throw - auditing should not break the main flow
      auditLogger.error({ error, entry }, 'Failed to write audit log');
    }
  }

  /**
   * Log an action with request context
   */
  async logWithContext(
    entry: Omit<AuditLogEntry, 'ipAddress' | 'userAgent'>,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    return this.log({
      ...entry,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Query audit logs with filters and pagination
   */
  async query(query: AuditLogQuery) {
    const {
      organizationId,
      userId,
      resourceType,
      resourceId,
      action,
      from,
      to,
      page = 1,
      pageSize = 50,
      sortOrder = 'desc',
    } = query;

    const where = {
      organizationId,
      ...(userId && { userId }),
      ...(resourceType && { resourceType }),
      ...(resourceId && { resourceId }),
      ...(action && { action }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceHistory(
    organizationId: string,
    resourceType: string,
    resourceId: string,
    limit = 100
  ) {
    return prisma.auditLog.findMany({
      where: {
        organizationId,
        resourceType,
        resourceId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get user's recent activity
   */
  async getUserActivity(
    organizationId: string,
    userId: string,
    limit = 100
  ) {
    return prisma.auditLog.findMany({
      where: {
        organizationId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Log a security-sensitive action with enhanced context
   */
  async logSecurityAction(
    action: AuditAction,
    entry: Omit<AuditLogEntry, 'action'> & {
      outcome?: 'success' | 'failure' | 'blocked';
      severity?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<void> {
    const { outcome = 'success', severity = 'medium', ...rest } = entry;

    await this.log({
      action,
      ...rest,
      details: {
        ...rest.details,
        outcome,
        severity,
        timestamp: new Date().toISOString(),
      },
    });

    // Critical security events get additional logging
    if (severity === 'critical' || outcome === 'blocked') {
      auditLogger.warn(
        {
          action,
          outcome,
          severity,
          userId: entry.userId,
          organizationId: entry.organizationId,
          ipAddress: entry.ipAddress,
        },
        `Critical security event: ${action}`
      );
    }
  }
}

// Singleton instance
export const auditService = new AuditService();

// Factory function for backwards compatibility
export function createAuditService(): AuditService {
  return auditService;
}
