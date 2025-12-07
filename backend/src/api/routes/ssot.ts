/**
 * SSOT Routes (T286-T289)
 * Single Source of Truth API endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requirePermission } from '../middleware/permissions.js';
import {
  getSsotConfig,
  updateSsotConfig,
  transitionSsotMode,
  SsotConfigInput,
  SsotMode,
} from '../../services/ssot/ssotConfig.js';
import {
  createMasterRecord,
  getMasterRecord,
  getMasterRecordByExternalId,
  updateMasterRecord,
  deleteMasterRecord,
  queryMasterRecords,
  addRecordSource,
  removeRecordSource,
  getMasterRecordStats,
  MasterRecordInput,
  MasterRecordUpdate,
  MasterRecordQuery,
  RecordSource,
} from '../../services/ssot/masterRecordService.js';
import {
  trackChange,
  getChangeHistory,
  queryChanges,
  getVersion,
  getVersionHistory,
  compareVersions,
  restoreVersion,
  getChangeStats,
  ChangeQuery,
} from '../../services/ssot/changeTracker.js';
import {
  getConflict,
  queryConflicts,
  resolveConflict,
  autoResolveConflicts,
  ignoreConflict,
  escalateConflict,
  getConflictStats,
  ConflictQuery,
  ResolutionStrategy,
} from '../../services/ssot/conflictResolver.js';
import {
  startSyncJob,
  processInboundSync,
  getOutboundSyncRecords,
  markRecordsSynced,
  getSyncJob,
  getSyncJobs,
  getSyncStatus,
  retrySyncJob,
  SyncDirection,
  SyncRecord,
  OutboundSyncResult,
} from '../../services/ssot/legacySync.js';
import {
  createValidationRule,
  getValidationRule,
  updateValidationRule,
  deleteValidationRule,
  getValidationRules,
  validateRecord,
  validateData,
  toggleRule,
  reorderRules,
  getRuleTemplates,
  createDefaultRules,
  getValidationStats,
  ValidationRuleInput,
} from '../../services/ssot/validationRules.js';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    organizationId: string;
    permissions: string[];
  };
}

export default async function ssotRoutes(fastify: FastifyInstance) {
  // ===========================================
  // SSOT Configuration Routes (T286)
  // ===========================================

  /**
   * GET /ssot/config - Get SSOT configuration
   */
  fastify.get(
    '/ssot/config',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const config = await getSsotConfig(organizationId);
      return reply.send(config);
    }
  );

  /**
   * PUT /ssot/config - Update SSOT configuration
   */
  fastify.put(
    '/ssot/config',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const input = request.body as SsotConfigInput;

      const config = await updateSsotConfig(organizationId, input);
      return reply.send(config);
    }
  );

  /**
   * POST /ssot/config/transition - Transition SSOT mode
   */
  fastify.post(
    '/ssot/config/transition',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { targetMode } = request.body as { targetMode: SsotMode };

      const result = await transitionSsotMode(organizationId, targetMode);

      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      return reply.send(result.config);
    }
  );

  // ===========================================
  // Master Record Routes (T287)
  // ===========================================

  /**
   * POST /ssot/records - Create master record
   */
  fastify.post(
    '/ssot/records',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const input = request.body as MasterRecordInput;

      // Validate before creating
      const validation = await validateData(organizationId, input.entityType, input.data);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Validation failed',
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      const record = await createMasterRecord(organizationId, input, userId);

      return reply.status(201).send({
        record,
        validation: {
          warnings: validation.warnings,
          info: validation.info,
        },
      });
    }
  );

  /**
   * GET /ssot/records/:id - Get master record by ID
   */
  fastify.get(
    '/ssot/records/:id',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const record = await getMasterRecord(organizationId, id);

      if (!record) {
        return reply.status(404).send({ error: 'Master record not found' });
      }

      return reply.send(record);
    }
  );

  /**
   * GET /ssot/records/external/:entityType/:externalId - Get by external ID
   */
  fastify.get(
    '/ssot/records/external/:entityType/:externalId',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { entityType, externalId } = request.params as {
        entityType: string;
        externalId: string;
      };

      const record = await getMasterRecordByExternalId(organizationId, entityType, externalId);

      if (!record) {
        return reply.status(404).send({ error: 'Master record not found' });
      }

      return reply.send(record);
    }
  );

  /**
   * PUT /ssot/records/:id - Update master record
   */
  fastify.put(
    '/ssot/records/:id',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const update = request.body as MasterRecordUpdate;

      // Get existing record for validation
      const existing = await getMasterRecord(organizationId, id);
      if (!existing) {
        return reply.status(404).send({ error: 'Master record not found' });
      }

      // Validate merged data
      if (update.data) {
        const mergedData = { ...existing.data, ...update.data };
        const validation = await validateData(organizationId, existing.entityType, mergedData);
        if (!validation.valid) {
          return reply.status(400).send({
            error: 'Validation failed',
            errors: validation.errors,
            warnings: validation.warnings,
          });
        }
      }

      const record = await updateMasterRecord(organizationId, id, update, userId);
      return reply.send(record);
    }
  );

  /**
   * DELETE /ssot/records/:id - Delete master record
   */
  fastify.delete(
    '/ssot/records/:id',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      await deleteMasterRecord(organizationId, id, userId);
      return reply.status(204).send();
    }
  );

  /**
   * GET /ssot/records - Query master records
   */
  fastify.get(
    '/ssot/records',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const query = request.query as MasterRecordQuery;

      const result = await queryMasterRecords(organizationId, query);
      return reply.send(result);
    }
  );

  /**
   * POST /ssot/records/:id/sources - Add source to record
   */
  fastify.post(
    '/ssot/records/:id/sources',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const source = request.body as RecordSource;

      const record = await addRecordSource(organizationId, id, source, userId);
      return reply.send(record);
    }
  );

  /**
   * DELETE /ssot/records/:id/sources/:sourceId/:externalId - Remove source
   */
  fastify.delete(
    '/ssot/records/:id/sources/:sourceId/:externalId',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id, sourceId, externalId } = request.params as {
        id: string;
        sourceId: string;
        externalId: string;
      };

      const record = await removeRecordSource(organizationId, id, sourceId, externalId);
      return reply.send(record);
    }
  );

  /**
   * GET /ssot/records/stats - Get master record statistics
   */
  fastify.get(
    '/ssot/records/stats',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const stats = await getMasterRecordStats(organizationId);
      return reply.send(stats);
    }
  );

  /**
   * POST /ssot/records/:id/validate - Validate a record
   */
  fastify.post(
    '/ssot/records/:id/validate',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const record = await getMasterRecord(organizationId, id);
      if (!record) {
        return reply.status(404).send({ error: 'Master record not found' });
      }

      const validation = await validateRecord(organizationId, record);
      return reply.send(validation);
    }
  );

  // ===========================================
  // Change Tracking Routes (T288)
  // ===========================================

  /**
   * GET /ssot/records/:id/history - Get change history
   */
  fastify.get(
    '/ssot/records/:id/history',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { limit, offset } = request.query as { limit?: number; offset?: number };

      const history = await getChangeHistory(organizationId, id, { limit, offset });
      return reply.send(history);
    }
  );

  /**
   * GET /ssot/changes - Query all changes
   */
  fastify.get(
    '/ssot/changes',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const query = request.query as ChangeQuery;

      const result = await queryChanges(organizationId, query);
      return reply.send(result);
    }
  );

  /**
   * GET /ssot/records/:id/versions - Get version history
   */
  fastify.get(
    '/ssot/records/:id/versions',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const versions = await getVersionHistory(organizationId, id);
      return reply.send(versions);
    }
  );

  /**
   * GET /ssot/records/:id/versions/:version - Get specific version
   */
  fastify.get(
    '/ssot/records/:id/versions/:version',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id, version } = request.params as { id: string; version: string };

      const snapshot = await getVersion(organizationId, id, parseInt(version, 10));

      if (!snapshot) {
        return reply.status(404).send({ error: 'Version not found' });
      }

      return reply.send(snapshot);
    }
  );

  /**
   * GET /ssot/records/:id/versions/compare - Compare two versions
   */
  fastify.get(
    '/ssot/records/:id/versions/compare',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { v1, v2 } = request.query as { v1: string; v2: string };

      const comparison = await compareVersions(
        organizationId,
        id,
        parseInt(v1, 10),
        parseInt(v2, 10)
      );

      return reply.send(comparison);
    }
  );

  /**
   * POST /ssot/records/:id/restore/:version - Restore to version
   */
  fastify.post(
    '/ssot/records/:id/restore/:version',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id, version } = request.params as { id: string; version: string };

      const record = await restoreVersion(organizationId, id, parseInt(version, 10), userId);
      return reply.send(record);
    }
  );

  /**
   * GET /ssot/changes/stats - Get change statistics
   */
  fastify.get(
    '/ssot/changes/stats',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { fromDate, toDate } = request.query as {
        fromDate?: string;
        toDate?: string;
      };

      const stats = await getChangeStats(
        organizationId,
        fromDate ? new Date(fromDate) : undefined,
        toDate ? new Date(toDate) : undefined
      );

      return reply.send(stats);
    }
  );

  // ===========================================
  // Conflict Resolution Routes (T288)
  // ===========================================

  /**
   * GET /ssot/conflicts - Query conflicts
   */
  fastify.get(
    '/ssot/conflicts',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const query = request.query as ConflictQuery;

      const result = await queryConflicts(organizationId, query);
      return reply.send(result);
    }
  );

  /**
   * GET /ssot/conflicts/:id - Get conflict by ID
   */
  fastify.get(
    '/ssot/conflicts/:id',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const conflict = await getConflict(organizationId, id);

      if (!conflict) {
        return reply.status(404).send({ error: 'Conflict not found' });
      }

      return reply.send(conflict);
    }
  );

  /**
   * POST /ssot/conflicts/:id/resolve - Resolve a conflict
   */
  fastify.post(
    '/ssot/conflicts/:id/resolve',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { resolution, mergedValue, notes } = request.body as {
        resolution: ResolutionStrategy;
        mergedValue?: unknown;
        notes?: string;
      };

      const result = await resolveConflict(organizationId, id, resolution, userId, {
        mergedValue,
        notes,
      });

      return reply.send(result);
    }
  );

  /**
   * POST /ssot/conflicts/auto-resolve - Auto-resolve conflicts
   */
  fastify.post(
    '/ssot/conflicts/auto-resolve',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { conflictIds } = request.body as { conflictIds?: string[] };

      const result = await autoResolveConflicts(organizationId, conflictIds);
      return reply.send(result);
    }
  );

  /**
   * POST /ssot/conflicts/:id/ignore - Ignore a conflict
   */
  fastify.post(
    '/ssot/conflicts/:id/ignore',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };

      const conflict = await ignoreConflict(organizationId, id, userId, reason);
      return reply.send(conflict);
    }
  );

  /**
   * POST /ssot/conflicts/:id/escalate - Escalate a conflict
   */
  fastify.post(
    '/ssot/conflicts/:id/escalate',
    {
      preHandler: [requirePermission('ssot:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };

      const conflict = await escalateConflict(organizationId, id, userId, reason);
      return reply.send(conflict);
    }
  );

  /**
   * GET /ssot/conflicts/stats - Get conflict statistics
   */
  fastify.get(
    '/ssot/conflicts/stats',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const stats = await getConflictStats(organizationId);
      return reply.send(stats);
    }
  );

  // ===========================================
  // Legacy Sync Routes (T289)
  // ===========================================

  /**
   * POST /ssot/sync/jobs - Start a sync job
   */
  fastify.post(
    '/ssot/sync/jobs',
    {
      preHandler: [requirePermission('ssot:sync')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { sourceId, sourceName, direction, entityTypes } = request.body as {
        sourceId: string;
        sourceName: string;
        direction: SyncDirection;
        entityTypes: string[];
      };

      const job = await startSyncJob(organizationId, sourceId, sourceName, direction, entityTypes);
      return reply.status(201).send(job);
    }
  );

  /**
   * GET /ssot/sync/jobs/:id - Get sync job
   */
  fastify.get(
    '/ssot/sync/jobs/:id',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const job = await getSyncJob(organizationId, id);

      if (!job) {
        return reply.status(404).send({ error: 'Sync job not found' });
      }

      return reply.send(job);
    }
  );

  /**
   * GET /ssot/sync/jobs - Get sync jobs
   */
  fastify.get(
    '/ssot/sync/jobs',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const options = request.query as {
        sourceId?: string;
        status?: string;
        direction?: string;
        limit?: number;
        offset?: number;
      };

      const result = await getSyncJobs(organizationId, options as any);
      return reply.send(result);
    }
  );

  /**
   * POST /ssot/sync/jobs/:id/inbound - Process inbound sync
   */
  fastify.post(
    '/ssot/sync/jobs/:id/inbound',
    {
      preHandler: [requirePermission('ssot:sync')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, id: userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { records } = request.body as { records: SyncRecord[] };

      const result = await processInboundSync(organizationId, id, records, userId);
      return reply.send(result);
    }
  );

  /**
   * GET /ssot/sync/outbound/:sourceId - Get outbound sync records
   */
  fastify.get(
    '/ssot/sync/outbound/:sourceId',
    {
      preHandler: [requirePermission('ssot:sync')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { sourceId } = request.params as { sourceId: string };
      const { entityTypes, since, limit, offset } = request.query as {
        entityTypes: string;
        since?: string;
        limit?: number;
        offset?: number;
      };

      const entityTypeList = entityTypes.split(',');

      const result = await getOutboundSyncRecords(organizationId, sourceId, entityTypeList, {
        since: since ? new Date(since) : undefined,
        limit,
        offset,
      });

      return reply.send(result);
    }
  );

  /**
   * POST /ssot/sync/outbound/:sourceId/complete - Mark records synced
   */
  fastify.post(
    '/ssot/sync/outbound/:sourceId/complete',
    {
      preHandler: [requirePermission('ssot:sync')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { sourceId } = request.params as { sourceId: string };
      const { results } = request.body as { results: OutboundSyncResult[] };

      await markRecordsSynced(organizationId, sourceId, results);
      return reply.send({ success: true });
    }
  );

  /**
   * POST /ssot/sync/jobs/:id/retry - Retry failed sync job
   */
  fastify.post(
    '/ssot/sync/jobs/:id/retry',
    {
      preHandler: [requirePermission('ssot:sync')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const job = await retrySyncJob(organizationId, id);
      return reply.send(job);
    }
  );

  /**
   * GET /ssot/sync/status/:sourceId - Get sync status
   */
  fastify.get(
    '/ssot/sync/status/:sourceId',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { sourceId } = request.params as { sourceId: string };

      const status = await getSyncStatus(organizationId, sourceId);
      return reply.send(status);
    }
  );

  // ===========================================
  // Validation Rules Routes (T289)
  // ===========================================

  /**
   * POST /ssot/validation/rules - Create validation rule
   */
  fastify.post(
    '/ssot/validation/rules',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const input = request.body as ValidationRuleInput;

      const rule = await createValidationRule(organizationId, input);
      return reply.status(201).send(rule);
    }
  );

  /**
   * GET /ssot/validation/rules - Get validation rules
   */
  fastify.get(
    '/ssot/validation/rules',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { entityType, enabledOnly } = request.query as {
        entityType?: string;
        enabledOnly?: boolean;
      };

      const rules = await getValidationRules(organizationId, entityType, { enabledOnly });
      return reply.send(rules);
    }
  );

  /**
   * GET /ssot/validation/rules/:id - Get validation rule
   */
  fastify.get(
    '/ssot/validation/rules/:id',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      const rule = await getValidationRule(organizationId, id);

      if (!rule) {
        return reply.status(404).send({ error: 'Validation rule not found' });
      }

      return reply.send(rule);
    }
  );

  /**
   * PUT /ssot/validation/rules/:id - Update validation rule
   */
  fastify.put(
    '/ssot/validation/rules/:id',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const updates = request.body as Partial<ValidationRuleInput>;

      const rule = await updateValidationRule(organizationId, id, updates);
      return reply.send(rule);
    }
  );

  /**
   * DELETE /ssot/validation/rules/:id - Delete validation rule
   */
  fastify.delete(
    '/ssot/validation/rules/:id',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };

      await deleteValidationRule(organizationId, id);
      return reply.status(204).send();
    }
  );

  /**
   * POST /ssot/validation/rules/:id/toggle - Toggle rule enabled
   */
  fastify.post(
    '/ssot/validation/rules/:id/toggle',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { id } = request.params as { id: string };
      const { enabled } = request.body as { enabled: boolean };

      const rule = await toggleRule(organizationId, id, enabled);
      return reply.send(rule);
    }
  );

  /**
   * POST /ssot/validation/rules/reorder - Reorder rules
   */
  fastify.post(
    '/ssot/validation/rules/reorder',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { entityType, ruleIds } = request.body as {
        entityType: string;
        ruleIds: string[];
      };

      const rules = await reorderRules(organizationId, entityType, ruleIds);
      return reply.send(rules);
    }
  );

  /**
   * GET /ssot/validation/templates - Get rule templates
   */
  fastify.get(
    '/ssot/validation/templates',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const templates = getRuleTemplates();
      return reply.send(templates);
    }
  );

  /**
   * POST /ssot/validation/rules/defaults/:entityType - Create default rules
   */
  fastify.post(
    '/ssot/validation/rules/defaults/:entityType',
    {
      preHandler: [requirePermission('ssot:admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { entityType } = request.params as { entityType: string };

      const rules = await createDefaultRules(organizationId, entityType);
      return reply.status(201).send(rules);
    }
  );

  /**
   * POST /ssot/validation/validate - Validate data
   */
  fastify.post(
    '/ssot/validation/validate',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const { entityType, data } = request.body as {
        entityType: string;
        data: Record<string, unknown>;
      };

      const result = await validateData(organizationId, entityType, data);
      return reply.send(result);
    }
  );

  /**
   * GET /ssot/validation/stats - Get validation statistics
   */
  fastify.get(
    '/ssot/validation/stats',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;
      const stats = await getValidationStats(organizationId);
      return reply.send(stats);
    }
  );

  // ===========================================
  // Dashboard Route
  // ===========================================

  /**
   * GET /ssot/dashboard - Get SSOT dashboard data
   */
  fastify.get(
    '/ssot/dashboard',
    {
      preHandler: [requirePermission('ssot:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId } = (request as AuthenticatedRequest).user;

      const [config, recordStats, conflictStats, changeStats, validationStats] = await Promise.all([
        getSsotConfig(organizationId),
        getMasterRecordStats(organizationId),
        getConflictStats(organizationId),
        getChangeStats(organizationId),
        getValidationStats(organizationId),
      ]);

      return reply.send({
        config: {
          mode: config.mode,
          syncDirection: config.syncDirection,
          enabledEntityTypes: config.enabledEntityTypes,
        },
        records: recordStats,
        conflicts: {
          total: conflictStats.total,
          pending: conflictStats.pending,
          resolved: conflictStats.resolved,
        },
        changes: {
          total: changeStats.totalChanges,
          recentActivity: changeStats.timeline.slice(-7),
        },
        validation: {
          totalRules: validationStats.totalRules,
          enabledRules: validationStats.enabledRules,
        },
      });
    }
  );
}
