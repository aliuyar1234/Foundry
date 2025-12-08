/**
 * GDPR Compliance Service
 *
 * Handles data subject rights:
 * - Right to access (data export)
 * - Right to erasure (data deletion)
 * - Right to data portability
 * - Data retention policies
 */

import { prisma } from '../../db/prisma';
import { neo4jDriver } from '../../db/neo4j';
import { redis } from '../../db/redis';
import archiver from 'archiver';
import { Writable } from 'stream';

export interface DataExportRequest {
  id: string;
  entityId: string;
  requestedBy: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  downloadUrl?: string;
  expiresAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface DeletionRequest {
  id: string;
  entityId: string;
  requestedBy: string;
  scope: 'USER' | 'ENTITY';
  targetId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  scheduledFor?: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface RetentionPolicy {
  entityId: string;
  processHistoryDays: number;
  auditLogDays: number;
  deletedDataDays: number;
  documentRetentionDays: number;
}

export class GdprService {
  /**
   * Create data export request for a user
   */
  async requestUserDataExport(
    entityId: string,
    userId: string,
    requestedBy: string
  ): Promise<DataExportRequest> {
    const request = await prisma.gdprDataExportRequest.create({
      data: {
        entityId,
        targetType: 'USER',
        targetId: userId,
        requestedBy,
        status: 'PENDING',
      },
    });

    // Queue export job
    await this.queueExportJob(request.id);

    // Audit log
    await this.logAudit(entityId, 'DATA_EXPORT_REQUESTED', {
      targetType: 'USER',
      targetId: userId,
      requestedBy,
    });

    return request;
  }

  /**
   * Create data export request for entire entity
   */
  async requestEntityDataExport(
    entityId: string,
    requestedBy: string
  ): Promise<DataExportRequest> {
    const request = await prisma.gdprDataExportRequest.create({
      data: {
        entityId,
        targetType: 'ENTITY',
        targetId: entityId,
        requestedBy,
        status: 'PENDING',
      },
    });

    // Queue export job
    await this.queueExportJob(request.id);

    // Audit log
    await this.logAudit(entityId, 'DATA_EXPORT_REQUESTED', {
      targetType: 'ENTITY',
      requestedBy,
    });

    return request;
  }

  /**
   * Process data export
   */
  async processDataExport(requestId: string): Promise<void> {
    const request = await prisma.gdprDataExportRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error('Export request not found');
    }

    await prisma.gdprDataExportRequest.update({
      where: { id: requestId },
      data: { status: 'PROCESSING' },
    });

    try {
      const exportData = await this.collectExportData(
        request.entityId,
        request.targetType,
        request.targetId
      );

      // Create archive
      const { url, expiresAt } = await this.createExportArchive(
        requestId,
        exportData
      );

      await prisma.gdprDataExportRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          downloadUrl: url,
          expiresAt,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.gdprDataExportRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          error: (error as Error).message,
        },
      });
      throw error;
    }
  }

  /**
   * Collect all data for export
   */
  private async collectExportData(
    entityId: string,
    targetType: string,
    targetId: string
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {
      exportedAt: new Date().toISOString(),
      targetType,
    };

    if (targetType === 'USER') {
      // Export user-specific data
      data.user = await this.exportUserData(entityId, targetId);
    } else {
      // Export entire entity data
      data.entity = await this.exportEntityData(entityId);
    }

    return data;
  }

  /**
   * Export user-specific data
   */
  private async exportUserData(entityId: string, userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        settings: true,
      },
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityId,
        userId,
      },
      select: {
        action: true,
        timestamp: true,
        ipAddress: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    const sessions = await prisma.userSession.findMany({
      where: { userId },
      select: {
        createdAt: true,
        lastActiveAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return {
      profile: user,
      auditLogs,
      sessions,
    };
  }

  /**
   * Export entire entity data
   */
  private async exportEntityData(entityId: string): Promise<any> {
    // Entity info
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        name: true,
        slug: true,
        settings: true,
        createdAt: true,
      },
    });

    // Users
    const users = await prisma.user.findMany({
      where: {
        entityMemberships: {
          some: { entityId },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    // Processes
    const processes = await prisma.process.findMany({
      where: { entityId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Documents
    const documents = await prisma.document.findMany({
      where: { entityId },
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
      },
    });

    // Insights
    const insights = await prisma.insight.findMany({
      where: { entityId },
      select: {
        id: true,
        title: true,
        type: true,
        severity: true,
        createdAt: true,
      },
    });

    // Audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId },
      select: {
        action: true,
        userId: true,
        timestamp: true,
        details: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 10000, // Limit for large entities
    });

    return {
      entity,
      users,
      processes,
      documents,
      insights,
      auditLogs,
    };
  }

  /**
   * Create export archive
   */
  private async createExportArchive(
    requestId: string,
    data: Record<string, any>
  ): Promise<{ url: string; expiresAt: Date }> {
    // In production, this would upload to S3 or similar
    // For now, store in database as JSON

    const filename = `gdpr-export-${requestId}.json`;
    const content = JSON.stringify(data, null, 2);

    // Store export (in production, use cloud storage)
    await prisma.gdprDataExportFile.create({
      data: {
        requestId,
        filename,
        content,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      url: `/api/gdpr/exports/${requestId}/download`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Request user deletion
   */
  async requestUserDeletion(
    entityId: string,
    userId: string,
    requestedBy: string,
    scheduledFor?: Date
  ): Promise<DeletionRequest> {
    const request = await prisma.gdprDeletionRequest.create({
      data: {
        entityId,
        scope: 'USER',
        targetId: userId,
        requestedBy,
        status: 'PENDING',
        scheduledFor: scheduledFor || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      },
    });

    // Audit log
    await this.logAudit(entityId, 'DELETION_REQUESTED', {
      scope: 'USER',
      targetId: userId,
      requestedBy,
      scheduledFor: request.scheduledFor,
    });

    return request;
  }

  /**
   * Request entity deletion (with cascade)
   */
  async requestEntityDeletion(
    entityId: string,
    requestedBy: string,
    scheduledFor?: Date
  ): Promise<DeletionRequest> {
    const request = await prisma.gdprDeletionRequest.create({
      data: {
        entityId,
        scope: 'ENTITY',
        targetId: entityId,
        requestedBy,
        status: 'PENDING',
        scheduledFor: scheduledFor || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      },
    });

    // Audit log (to a separate permanent log for compliance)
    await this.logPermanentAudit('ENTITY_DELETION_REQUESTED', {
      entityId,
      requestedBy,
      scheduledFor: request.scheduledFor,
    });

    return request;
  }

  /**
   * Process user deletion
   */
  async processUserDeletion(requestId: string): Promise<void> {
    const request = await prisma.gdprDeletionRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.scope !== 'USER') {
      throw new Error('Deletion request not found');
    }

    await prisma.gdprDeletionRequest.update({
      where: { id: requestId },
      data: { status: 'PROCESSING' },
    });

    try {
      const userId = request.targetId;
      const entityId = request.entityId;

      // 1. Delete user sessions
      await prisma.userSession.deleteMany({ where: { userId } });

      // 2. Delete user audit logs (after archiving)
      await this.archiveUserAuditLogs(entityId, userId);
      await prisma.auditLog.deleteMany({ where: { entityId, userId } });

      // 3. Anonymize user references in other tables
      await this.anonymizeUserReferences(entityId, userId);

      // 4. Delete user from entity membership
      await prisma.userEntityMembership.deleteMany({
        where: { entityId, userId },
      });

      // 5. Delete user account if no other entity memberships
      const otherMemberships = await prisma.userEntityMembership.count({
        where: { userId },
      });

      if (otherMemberships === 0) {
        await prisma.user.delete({ where: { id: userId } });
      }

      // 6. Delete from Neo4j
      await this.deleteUserFromNeo4j(entityId, userId);

      await prisma.gdprDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Log completion
      await this.logPermanentAudit('USER_DELETION_COMPLETED', {
        entityId,
        userId,
        requestId,
      });
    } catch (error) {
      await prisma.gdprDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          error: (error as Error).message,
        },
      });
      throw error;
    }
  }

  /**
   * Process entity deletion with full cascade
   */
  async processEntityDeletion(requestId: string): Promise<void> {
    const request = await prisma.gdprDeletionRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.scope !== 'ENTITY') {
      throw new Error('Deletion request not found');
    }

    await prisma.gdprDeletionRequest.update({
      where: { id: requestId },
      data: { status: 'PROCESSING' },
    });

    try {
      const entityId = request.entityId;

      // 1. Archive entity data for compliance (if required)
      await this.archiveEntityData(entityId);

      // 2. Delete Neo4j data
      await this.deleteEntityFromNeo4j(entityId);

      // 3. Delete Redis cache
      await this.deleteEntityFromRedis(entityId);

      // 4. Delete PostgreSQL data (cascade order matters)
      await prisma.$transaction([
        prisma.insight.deleteMany({ where: { entityId } }),
        prisma.document.deleteMany({ where: { entityId } }),
        prisma.process.deleteMany({ where: { entityId } }),
        prisma.auditLog.deleteMany({ where: { entityId } }),
        prisma.userSession.deleteMany({
          where: {
            user: {
              entityMemberships: {
                some: { entityId },
              },
            },
          },
        }),
        prisma.userEntityMembership.deleteMany({ where: { entityId } }),
        prisma.partnerApiKey.deleteMany({
          where: { partner: { entityId } },
        }),
        prisma.partner.deleteMany({ where: { entityId } }),
        prisma.ipAllowlistEntry.deleteMany({ where: { entityId } }),
        prisma.entity.delete({ where: { id: entityId } }),
      ]);

      await prisma.gdprDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Log completion (permanent log)
      await this.logPermanentAudit('ENTITY_DELETION_COMPLETED', {
        entityId,
        requestId,
      });
    } catch (error) {
      await prisma.gdprDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          error: (error as Error).message,
        },
      });
      throw error;
    }
  }

  /**
   * Set retention policy for an entity
   */
  async setRetentionPolicy(
    entityId: string,
    policy: Partial<RetentionPolicy>
  ): Promise<RetentionPolicy> {
    const current = await this.getRetentionPolicy(entityId);
    const updated = { ...current, ...policy };

    await prisma.entity.update({
      where: { id: entityId },
      data: {
        settings: {
          ...((await this.getEntitySettings(entityId)) || {}),
          retentionPolicy: updated,
        },
      },
    });

    // Audit log
    await this.logAudit(entityId, 'RETENTION_POLICY_UPDATED', {
      policy: updated,
    });

    return updated;
  }

  /**
   * Get retention policy for an entity
   */
  async getRetentionPolicy(entityId: string): Promise<RetentionPolicy> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { settings: true },
    });

    const settings = entity?.settings as any;
    return settings?.retentionPolicy || {
      entityId,
      processHistoryDays: 365,
      auditLogDays: 730,
      deletedDataDays: 30,
      documentRetentionDays: 365,
    };
  }

  /**
   * Apply retention policy (cleanup old data)
   */
  async applyRetentionPolicy(entityId: string): Promise<void> {
    const policy = await this.getRetentionPolicy(entityId);
    const now = new Date();

    // Delete old audit logs
    const auditCutoff = new Date(now.getTime() - policy.auditLogDays * 24 * 60 * 60 * 1000);
    await prisma.auditLog.deleteMany({
      where: {
        entityId,
        timestamp: { lt: auditCutoff },
      },
    });

    // Archive and delete old process history
    const processCutoff = new Date(now.getTime() - policy.processHistoryDays * 24 * 60 * 60 * 1000);
    // Implementation depends on how process history is stored

    // Delete expired GDPR export files
    await prisma.gdprDataExportFile.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    // Log cleanup
    await this.logAudit(entityId, 'RETENTION_POLICY_APPLIED', {
      policy,
      timestamp: now,
    });
  }

  // Helper methods

  private async queueExportJob(requestId: string): Promise<void> {
    // In production, use a job queue like BullMQ
    // For now, process immediately (async)
    setImmediate(() => this.processDataExport(requestId).catch(console.error));
  }

  private async archiveUserAuditLogs(entityId: string, userId: string): Promise<void> {
    // Archive to cold storage before deletion
    const logs = await prisma.auditLog.findMany({
      where: { entityId, userId },
    });

    await prisma.auditLogArchive.createMany({
      data: logs.map(log => ({
        originalId: log.id,
        entityId: log.entityId,
        userId: log.userId,
        action: log.action,
        timestamp: log.timestamp,
        details: log.details,
        archivedAt: new Date(),
      })),
    });
  }

  private async anonymizeUserReferences(entityId: string, userId: string): Promise<void> {
    // Replace user references with anonymous ID
    const anonymousId = `deleted-user-${Date.now()}`;

    // Update processes created by user
    await prisma.process.updateMany({
      where: { entityId, createdById: userId },
      data: { createdById: null, createdByAnonymousId: anonymousId },
    });

    // Update documents uploaded by user
    await prisma.document.updateMany({
      where: { entityId, uploadedById: userId },
      data: { uploadedById: null, uploadedByAnonymousId: anonymousId },
    });
  }

  private async deleteUserFromNeo4j(entityId: string, userId: string): Promise<void> {
    const session = neo4jDriver.session();
    try {
      await session.run(
        `
        MATCH (u:User {id: $userId, entityId: $entityId})
        DETACH DELETE u
        `,
        { userId, entityId }
      );
    } finally {
      await session.close();
    }
  }

  private async archiveEntityData(entityId: string): Promise<void> {
    // Create compliance archive of entity data before deletion
    const exportData = await this.collectExportData(entityId, 'ENTITY', entityId);

    await prisma.gdprEntityArchive.create({
      data: {
        entityId,
        data: exportData,
        archivedAt: new Date(),
        // Retain for legal compliance period (e.g., 7 years)
        expiresAt: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private async deleteEntityFromNeo4j(entityId: string): Promise<void> {
    const session = neo4jDriver.session();
    try {
      await session.run(
        `
        MATCH (n {entityId: $entityId})
        DETACH DELETE n
        `,
        { entityId }
      );
    } finally {
      await session.close();
    }
  }

  private async deleteEntityFromRedis(entityId: string): Promise<void> {
    const keys = await redis.keys(`entity:${entityId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  private async getEntitySettings(entityId: string): Promise<Record<string, any> | null> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { settings: true },
    });
    return entity?.settings as Record<string, any> | null;
  }

  private async logAudit(
    entityId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        entityId,
        action,
        details,
        timestamp: new Date(),
      },
    });
  }

  private async logPermanentAudit(
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    // Permanent audit log that survives entity deletion
    await prisma.permanentAuditLog.create({
      data: {
        action,
        details,
        timestamp: new Date(),
      },
    });
  }
}

export const gdprService = new GdprService();
