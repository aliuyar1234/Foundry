/**
 * Audit Logging Service
 * Records all significant actions for compliance and debugging
 */

import { PrismaClient } from '@prisma/client';

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
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
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
    } catch (error) {
      // Log audit failures but don't throw - auditing should not break the main flow
      console.error('Failed to write audit log:', error);
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
      this.prisma.auditLog.findMany({
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
      this.prisma.auditLog.count({ where }),
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
    return this.prisma.auditLog.findMany({
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
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

// Factory function
let auditServiceInstance: AuditService | null = null;

export function createAuditService(prisma: PrismaClient): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new AuditService(prisma);
  }
  return auditServiceInstance;
}
