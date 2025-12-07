/**
 * Data Retention Policy Processor (T183)
 * Enforces data retention policies by cleaning up expired data
 */

import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import { neo4jDriver } from '../../graph/connection.js';
import { auditService } from '../../services/audit/auditService.js';

// Retention policy configuration (in days)
const RETENTION_POLICIES = {
  // Communication metadata - 2 years
  communicationEvents: 730,

  // Process mining events - 2 years
  processEvents: 730,

  // Sync job history - 90 days
  syncJobs: 90,

  // Completed simulations - 1 year
  completedSimulations: 365,

  // Failed job records - 30 days
  failedJobs: 30,

  // Soft-deleted records - 30 days
  softDeletedRecords: 30,

  // Audit logs - 7 years (legal requirement)
  auditLogs: 2555,

  // Temporary files/exports - 7 days
  temporaryFiles: 7,

  // Session data - 30 days
  sessionData: 30,
};

interface RetentionJobData {
  organizationId?: string; // If not provided, runs for all organizations
  dryRun?: boolean; // If true, only report what would be deleted
  policies?: Partial<typeof RETENTION_POLICIES>;
}

interface RetentionResult {
  organizationId: string | 'all';
  dryRun: boolean;
  deletedRecords: {
    category: string;
    count: number;
    oldestDate: Date | null;
  }[];
  errors: {
    category: string;
    error: string;
  }[];
  executedAt: Date;
  duration: number;
}

/**
 * Process data retention cleanup job
 */
export async function processRetentionJob(job: Job<RetentionJobData>): Promise<RetentionResult> {
  const startTime = Date.now();
  const { organizationId, dryRun = false, policies = {} } = job.data;

  const effectivePolicies = { ...RETENTION_POLICIES, ...policies };
  const result: RetentionResult = {
    organizationId: organizationId || 'all',
    dryRun,
    deletedRecords: [],
    errors: [],
    executedAt: new Date(),
    duration: 0,
  };

  try {
    // Get organizations to process
    const organizations = organizationId
      ? [{ id: organizationId }]
      : await prisma.organization.findMany({ select: { id: true } });

    for (const org of organizations) {
      await job.updateProgress(
        Math.round((organizations.indexOf(org) / organizations.length) * 100)
      );

      // Clean up PostgreSQL data
      await cleanupPostgresData(org.id, effectivePolicies, dryRun, result);

      // Clean up Neo4j data
      await cleanupNeo4jData(org.id, effectivePolicies, dryRun, result);

      // Clean up TimescaleDB data
      await cleanupTimescaleData(org.id, effectivePolicies, dryRun, result);
    }

    // Log retention execution
    if (!dryRun) {
      await auditService.log({
        organizationId: organizationId || 'system',
        userId: 'system',
        action: 'retention.policy_executed',
        resourceType: 'retention',
        resourceId: job.id || 'manual',
        details: {
          policies: effectivePolicies,
          deletedRecords: result.deletedRecords,
          errors: result.errors,
        },
      });
    }
  } catch (error) {
    result.errors.push({
      category: 'general',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Clean up PostgreSQL data according to retention policies
 */
async function cleanupPostgresData(
  organizationId: string,
  policies: typeof RETENTION_POLICIES,
  dryRun: boolean,
  result: RetentionResult
): Promise<void> {
  const now = new Date();

  // 1. Clean up old sync jobs
  try {
    const syncJobCutoff = new Date(now.getTime() - policies.syncJobs * 24 * 60 * 60 * 1000);

    if (dryRun) {
      const count = await prisma.syncJob.count({
        where: {
          organizationId,
          completedAt: { lt: syncJobCutoff },
        },
      });
      result.deletedRecords.push({
        category: 'Sync Jobs',
        count,
        oldestDate: syncJobCutoff,
      });
    } else {
      const deleted = await prisma.syncJob.deleteMany({
        where: {
          organizationId,
          completedAt: { lt: syncJobCutoff },
        },
      });
      result.deletedRecords.push({
        category: 'Sync Jobs',
        count: deleted.count,
        oldestDate: syncJobCutoff,
      });
    }
  } catch (error) {
    result.errors.push({
      category: 'Sync Jobs',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // 2. Clean up soft-deleted records
  try {
    const softDeleteCutoff = new Date(
      now.getTime() - policies.softDeletedRecords * 24 * 60 * 60 * 1000
    );

    // Clean up soft-deleted entity records
    if (dryRun) {
      const count = await prisma.entityRecord.count({
        where: {
          organizationId,
          deletedAt: { lt: softDeleteCutoff },
        },
      });
      result.deletedRecords.push({
        category: 'Soft-deleted Entity Records',
        count,
        oldestDate: softDeleteCutoff,
      });
    } else {
      const deleted = await prisma.entityRecord.deleteMany({
        where: {
          organizationId,
          deletedAt: { lt: softDeleteCutoff },
        },
      });
      result.deletedRecords.push({
        category: 'Soft-deleted Entity Records',
        count: deleted.count,
        oldestDate: softDeleteCutoff,
      });
    }

    // Clean up soft-deleted SOPs
    if (dryRun) {
      const count = await prisma.sOP.count({
        where: {
          organizationId,
          deletedAt: { lt: softDeleteCutoff },
        },
      });
      result.deletedRecords.push({
        category: 'Soft-deleted SOPs',
        count,
        oldestDate: softDeleteCutoff,
      });
    } else {
      const deleted = await prisma.sOP.deleteMany({
        where: {
          organizationId,
          deletedAt: { lt: softDeleteCutoff },
        },
      });
      result.deletedRecords.push({
        category: 'Soft-deleted SOPs',
        count: deleted.count,
        oldestDate: softDeleteCutoff,
      });
    }
  } catch (error) {
    result.errors.push({
      category: 'Soft-deleted Records',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // 3. Clean up old completed simulations
  try {
    const simulationCutoff = new Date(
      now.getTime() - policies.completedSimulations * 24 * 60 * 60 * 1000
    );

    // Note: Simulations might be stored in a separate table
    // This is a placeholder for when the simulation table is added
    result.deletedRecords.push({
      category: 'Completed Simulations',
      count: 0, // Placeholder
      oldestDate: simulationCutoff,
    });
  } catch (error) {
    result.errors.push({
      category: 'Completed Simulations',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // 4. Clean up audit logs (with legal retention consideration)
  try {
    const auditLogCutoff = new Date(
      now.getTime() - policies.auditLogs * 24 * 60 * 60 * 1000
    );

    if (dryRun) {
      const count = await prisma.auditLog.count({
        where: {
          organizationId,
          createdAt: { lt: auditLogCutoff },
          // Never delete GDPR-related logs
          NOT: {
            action: { startsWith: 'gdpr.' },
          },
        },
      });
      result.deletedRecords.push({
        category: 'Audit Logs',
        count,
        oldestDate: auditLogCutoff,
      });
    } else {
      const deleted = await prisma.auditLog.deleteMany({
        where: {
          organizationId,
          createdAt: { lt: auditLogCutoff },
          NOT: {
            action: { startsWith: 'gdpr.' },
          },
        },
      });
      result.deletedRecords.push({
        category: 'Audit Logs',
        count: deleted.count,
        oldestDate: auditLogCutoff,
      });
    }
  } catch (error) {
    result.errors.push({
      category: 'Audit Logs',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Clean up Neo4j graph data according to retention policies
 */
async function cleanupNeo4jData(
  organizationId: string,
  policies: typeof RETENTION_POLICIES,
  dryRun: boolean,
  result: RetentionResult
): Promise<void> {
  const session = neo4jDriver.session();
  const now = new Date();

  try {
    // 1. Clean up old communication events
    const communicationCutoff = new Date(
      now.getTime() - policies.communicationEvents * 24 * 60 * 60 * 1000
    );

    if (dryRun) {
      const countResult = await session.run(
        `
        MATCH ()-[r:COMMUNICATES_WITH {organizationId: $organizationId}]-()
        WHERE r.lastInteraction < datetime($cutoff)
        RETURN count(r) as count
        `,
        { organizationId, cutoff: communicationCutoff.toISOString() }
      );
      const count = countResult.records[0]?.get('count')?.toNumber() || 0;
      result.deletedRecords.push({
        category: 'Communication Relationships',
        count,
        oldestDate: communicationCutoff,
      });
    } else {
      const deleteResult = await session.run(
        `
        MATCH ()-[r:COMMUNICATES_WITH {organizationId: $organizationId}]-()
        WHERE r.lastInteraction < datetime($cutoff)
        DELETE r
        RETURN count(r) as count
        `,
        { organizationId, cutoff: communicationCutoff.toISOString() }
      );
      const count = deleteResult.records[0]?.get('count')?.toNumber() || 0;
      result.deletedRecords.push({
        category: 'Communication Relationships',
        count,
        oldestDate: communicationCutoff,
      });
    }

    // 2. Clean up orphaned Person nodes (no relationships)
    if (!dryRun) {
      const orphanResult = await session.run(
        `
        MATCH (p:Person {organizationId: $organizationId})
        WHERE NOT (p)--()
        AND p.deletedAt IS NOT NULL
        DELETE p
        RETURN count(p) as count
        `,
        { organizationId }
      );
      const count = orphanResult.records[0]?.get('count')?.toNumber() || 0;
      if (count > 0) {
        result.deletedRecords.push({
          category: 'Orphaned Person Nodes',
          count,
          oldestDate: null,
        });
      }
    }

    // 3. Clean up old process execution data
    const processEventCutoff = new Date(
      now.getTime() - policies.processEvents * 24 * 60 * 60 * 1000
    );

    if (dryRun) {
      const countResult = await session.run(
        `
        MATCH (pe:ProcessExecution {organizationId: $organizationId})
        WHERE pe.completedAt < datetime($cutoff)
        RETURN count(pe) as count
        `,
        { organizationId, cutoff: processEventCutoff.toISOString() }
      );
      const count = countResult.records[0]?.get('count')?.toNumber() || 0;
      result.deletedRecords.push({
        category: 'Process Executions',
        count,
        oldestDate: processEventCutoff,
      });
    } else {
      const deleteResult = await session.run(
        `
        MATCH (pe:ProcessExecution {organizationId: $organizationId})
        WHERE pe.completedAt < datetime($cutoff)
        DETACH DELETE pe
        RETURN count(pe) as count
        `,
        { organizationId, cutoff: processEventCutoff.toISOString() }
      );
      const count = deleteResult.records[0]?.get('count')?.toNumber() || 0;
      result.deletedRecords.push({
        category: 'Process Executions',
        count,
        oldestDate: processEventCutoff,
      });
    }
  } catch (error) {
    result.errors.push({
      category: 'Neo4j Data',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await session.close();
  }
}

/**
 * Clean up TimescaleDB events according to retention policies
 */
async function cleanupTimescaleData(
  organizationId: string,
  policies: typeof RETENTION_POLICIES,
  dryRun: boolean,
  result: RetentionResult
): Promise<void> {
  // TimescaleDB has built-in retention policies via continuous aggregates
  // This function handles manual cleanup of raw events if needed

  const now = new Date();
  const eventCutoff = new Date(
    now.getTime() - policies.processEvents * 24 * 60 * 60 * 1000
  );

  try {
    // Note: This would use a TimescaleDB-specific connection
    // The actual implementation depends on how TimescaleDB is set up

    // Placeholder for TimescaleDB cleanup
    // In a real implementation, this would:
    // 1. Check if data compression policies are in place
    // 2. Drop old chunks beyond retention period
    // 3. Clean up any orphaned data

    result.deletedRecords.push({
      category: 'TimescaleDB Events',
      count: 0, // Placeholder - actual count from TimescaleDB
      oldestDate: eventCutoff,
    });
  } catch (error) {
    result.errors.push({
      category: 'TimescaleDB Events',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get retention policy summary
 */
export function getRetentionPolicySummary(): {
  policies: typeof RETENTION_POLICIES;
  descriptions: Record<keyof typeof RETENTION_POLICIES, string>;
} {
  return {
    policies: RETENTION_POLICIES,
    descriptions: {
      communicationEvents: 'Email and calendar metadata',
      processEvents: 'Process execution events',
      syncJobs: 'Data source synchronization history',
      completedSimulations: 'What-if simulation results',
      failedJobs: 'Failed background job records',
      softDeletedRecords: 'Soft-deleted records awaiting permanent deletion',
      auditLogs: 'System audit trail (legal requirement)',
      temporaryFiles: 'Temporary export files',
      sessionData: 'User session data',
    },
  };
}

export default processRetentionJob;
