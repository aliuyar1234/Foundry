/**
 * Entity Isolation Verification Service
 * SCALE Tier - Task T024
 *
 * Verifies and tests data isolation between entities
 */

import { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors/AppError';

export interface IsolationTestResult {
  entityId: string;
  table: string;
  expected: number;
  actual: number;
  passed: boolean;
  error?: string;
}

export interface IsolationVerificationReport {
  timestamp: Date;
  overallPassed: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: IsolationTestResult[];
  crossEntityLeaks: Array<{
    table: string;
    sourceEntityId: string;
    leakedToEntityId: string;
    recordCount: number;
  }>;
}

export interface EntityIsolationConfig {
  prisma: PrismaClient;
}

// Tables that should be entity-scoped
const TENANT_SCOPED_TABLES = [
  'DataSource',
  'Assessment',
  'SOP',
  'EntityRecord',
  'AuditLog',
  'RoutingRule',
  'RoutingDecision',
  'ExpertiseProfile',
  'ConversationSession',
  'AutomatedAction',
  'ActionExecution',
  'ComplianceRule',
  'ComplianceEvidence',
  'ComplianceViolation',
  'DashboardWidget',
];

export class EntityIsolationService {
  private prisma: PrismaClient;

  constructor(config: EntityIsolationConfig) {
    this.prisma = config.prisma;
  }

  /**
   * Verify that RLS is properly configured and working
   */
  async verifyIsolation(entityId: string): Promise<IsolationVerificationReport> {
    const results: IsolationTestResult[] = [];
    const crossEntityLeaks: IsolationVerificationReport['crossEntityLeaks'] = [];
    const timestamp = new Date();

    // Get all entities for comparison
    const allEntities = await this.prisma.entity.findMany({
      select: { id: true },
    });
    const otherEntityIds = allEntities
      .filter(e => e.id !== entityId)
      .map(e => e.id);

    // Test each tenant-scoped table
    for (const table of TENANT_SCOPED_TABLES) {
      try {
        const result = await this.testTableIsolation(entityId, table, otherEntityIds);
        results.push(result);

        // Check for cross-entity leaks
        if (!result.passed && result.actual > result.expected) {
          // Determine which entities leaked
          const leaks = await this.findCrossEntityLeaks(table, entityId);
          crossEntityLeaks.push(...leaks);
        }
      } catch (error) {
        results.push({
          entityId,
          table,
          expected: 0,
          actual: -1,
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const testsPassed = results.filter(r => r.passed).length;
    const testsFailed = results.filter(r => !r.passed).length;

    return {
      timestamp,
      overallPassed: testsFailed === 0,
      testsRun: results.length,
      testsPassed,
      testsFailed,
      results,
      crossEntityLeaks,
    };
  }

  /**
   * Test isolation for a specific table
   */
  private async testTableIsolation(
    entityId: string,
    tableName: string,
    otherEntityIds: string[]
  ): Promise<IsolationTestResult> {
    // Set entity context
    await this.prisma.$executeRawUnsafe(`
      SELECT set_config('app.current_entity_id', $1, true);
      SELECT set_config('app.is_super_admin', 'false', true);
    `, entityId);

    // Query should only return records for current entity
    const visibleRecords = await this.countVisibleRecords(tableName);

    // Get actual count for this entity (bypassing RLS as super admin)
    await this.prisma.$executeRawUnsafe(`
      SELECT set_config('app.is_super_admin', 'true', true);
    `);

    const actualEntityRecords = await this.countEntityRecords(tableName, entityId);
    const otherEntityRecords = await this.countOtherEntityRecords(tableName, otherEntityIds);

    // With RLS, visible records should equal entity records
    // If visible > actual, we have a leak
    const passed = visibleRecords === actualEntityRecords;

    // Reset context
    await this.prisma.$executeRawUnsafe(`
      SELECT set_config('app.is_super_admin', 'false', true);
    `);

    return {
      entityId,
      table: tableName,
      expected: actualEntityRecords,
      actual: visibleRecords,
      passed,
    };
  }

  /**
   * Count visible records (respecting RLS)
   */
  private async countVisibleRecords(tableName: string): Promise<number> {
    const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    return Number(result[0].count);
  }

  /**
   * Count records belonging to specific entity
   */
  private async countEntityRecords(
    tableName: string,
    entityId: string
  ): Promise<number> {
    try {
      const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM "${tableName}" WHERE "organizationId" = $1`,
        entityId
      );
      return Number(result[0].count);
    } catch {
      // Table might use entityId instead of organizationId
      const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM "${tableName}" WHERE "entityId" = $1`,
        entityId
      );
      return Number(result[0].count);
    }
  }

  /**
   * Count records belonging to other entities
   */
  private async countOtherEntityRecords(
    tableName: string,
    entityIds: string[]
  ): Promise<number> {
    if (entityIds.length === 0) return 0;

    try {
      const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM "${tableName}" WHERE "organizationId" = ANY($1::text[])`,
        entityIds
      );
      return Number(result[0].count);
    } catch {
      const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM "${tableName}" WHERE "entityId" = ANY($1::text[])`,
        entityIds
      );
      return Number(result[0].count);
    }
  }

  /**
   * Find specific cross-entity leaks
   */
  private async findCrossEntityLeaks(
    tableName: string,
    currentEntityId: string
  ): Promise<Array<{
    table: string;
    sourceEntityId: string;
    leakedToEntityId: string;
    recordCount: number;
  }>> {
    // As super admin, find all records visible that don't belong to current entity
    await this.prisma.$executeRawUnsafe(`
      SELECT set_config('app.is_super_admin', 'true', true);
    `);

    const leaks: Array<{
      table: string;
      sourceEntityId: string;
      leakedToEntityId: string;
      recordCount: number;
    }> = [];

    try {
      const result = await this.prisma.$queryRawUnsafe<
        Array<{ entity_id: string; count: bigint }>
      >(
        `SELECT "organizationId" as entity_id, COUNT(*) as count
         FROM "${tableName}"
         WHERE "organizationId" != $1
         GROUP BY "organizationId"`,
        currentEntityId
      );

      for (const row of result) {
        leaks.push({
          table: tableName,
          sourceEntityId: row.entity_id,
          leakedToEntityId: currentEntityId,
          recordCount: Number(row.count),
        });
      }
    } catch {
      // Try with entityId column
      const result = await this.prisma.$queryRawUnsafe<
        Array<{ entity_id: string; count: bigint }>
      >(
        `SELECT "entityId" as entity_id, COUNT(*) as count
         FROM "${tableName}"
         WHERE "entityId" != $1
         GROUP BY "entityId"`,
        currentEntityId
      );

      for (const row of result) {
        leaks.push({
          table: tableName,
          sourceEntityId: row.entity_id,
          leakedToEntityId: currentEntityId,
          recordCount: Number(row.count),
        });
      }
    }

    return leaks;
  }

  /**
   * Run comprehensive isolation test between two entities
   */
  async testCrossEntityIsolation(
    entityAId: string,
    entityBId: string
  ): Promise<{
    passed: boolean;
    leaks: Array<{
      table: string;
      direction: 'A_TO_B' | 'B_TO_A';
      recordCount: number;
    }>;
  }> {
    const leaks: Array<{
      table: string;
      direction: 'A_TO_B' | 'B_TO_A';
      recordCount: number;
    }> = [];

    for (const table of TENANT_SCOPED_TABLES) {
      // Test A viewing B's data
      await this.prisma.$executeRawUnsafe(`
        SELECT set_config('app.current_entity_id', $1, true);
        SELECT set_config('app.is_super_admin', 'false', true);
      `, entityAId);

      const visibleFromA = await this.countEntityRecords(table, entityBId);
      if (visibleFromA > 0) {
        leaks.push({
          table,
          direction: 'B_TO_A',
          recordCount: visibleFromA,
        });
      }

      // Test B viewing A's data
      await this.prisma.$executeRawUnsafe(`
        SELECT set_config('app.current_entity_id', $1, true);
        SELECT set_config('app.is_super_admin', 'false', true);
      `, entityBId);

      const visibleFromB = await this.countEntityRecords(table, entityAId);
      if (visibleFromB > 0) {
        leaks.push({
          table,
          direction: 'A_TO_B',
          recordCount: visibleFromB,
        });
      }
    }

    return {
      passed: leaks.length === 0,
      leaks,
    };
  }

  /**
   * Verify RLS policies are enabled on all tenant tables
   */
  async verifyRLSEnabled(): Promise<{
    allEnabled: boolean;
    tables: Array<{
      table: string;
      rlsEnabled: boolean;
    }>;
  }> {
    const tables: Array<{ table: string; rlsEnabled: boolean }> = [];

    for (const table of TENANT_SCOPED_TABLES) {
      const result = await this.prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean }>
      >(
        `SELECT relrowsecurity FROM pg_class
         WHERE relname = $1`,
        table
      );

      tables.push({
        table,
        rlsEnabled: result[0]?.relrowsecurity ?? false,
      });
    }

    return {
      allEnabled: tables.every(t => t.rlsEnabled),
      tables,
    };
  }
}
