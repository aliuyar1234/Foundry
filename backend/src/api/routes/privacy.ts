/**
 * Privacy API Routes
 * REST endpoints for privacy management, configuration, and compliance
 * T300-T302 - Privacy API implementation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getPrivacyPolicy,
  updatePrivacyPolicy,
  getComplianceScore,
  validatePolicyCompliance,
  POLICY_TEMPLATES,
} from '../../services/privacy/policyConfig.js';
import {
  getMetadataModeConfig,
  updateMetadataModeConfig,
  isMetadataModeEnabled,
  processEventsMetadataOnly,
  extractCommunicationPatterns,
  getMetadataAnalyticsSummary,
} from '../../services/privacy/metadataMode.js';
import {
  anonymizeText,
  anonymizeRecord,
  anonymizeRecords,
  detectPii,
  detectPiiInRecord,
} from '../../services/privacy/anonymizer.js';
import {
  getVisibilityRules,
  createVisibilityRule,
  updateVisibilityRule,
  deleteVisibilityRule,
  checkDataAccess,
  filterDataForVisibility,
  getRoleVisibilitySummary,
  createDefaultRules,
} from '../../services/privacy/dataVisibility.js';
import {
  getAggregationConfig,
  updateAggregationConfig,
  getReportTemplates,
  generateWorksCouncilReport,
  getReports,
  getReport,
  updateReportStatus,
} from '../../services/privacy/aggregatedReporting.js';
import {
  logAuditEntry,
  queryAuditLog,
  getAuditStatistics,
  getDataAccessHistory,
  getConsentHistory,
  exportAuditLog,
  logConfigChange,
} from '../../services/privacy/privacyAudit.js';

interface OrgParams {
  organizationId: string;
}

interface RuleParams extends OrgParams {
  ruleId: string;
}

interface ReportParams extends OrgParams {
  reportId: string;
}

export default async function privacyRoutes(fastify: FastifyInstance) {
  // ==========================================
  // Privacy Policy Configuration (T300)
  // ==========================================

  // Get privacy policy
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/config',
    async (request, reply) => {
      const { organizationId } = request.params;

      const policy = await getPrivacyPolicy(organizationId);

      return reply.send({
        success: true,
        data: policy,
      });
    }
  );

  // Update privacy policy
  fastify.put<{ Params: OrgParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/config',
    async (request, reply) => {
      const { organizationId } = request.params;
      const updates = request.body;

      // Get previous config for audit
      const previousPolicy = await getPrivacyPolicy(organizationId);

      const policy = await updatePrivacyPolicy(organizationId, updates);

      // Log configuration change
      await logConfigChange(organizationId, {
        actorId: (request as any).user?.id || 'system',
        configType: 'privacy_policy',
        previousValue: previousPolicy as unknown as Record<string, unknown>,
        newValue: policy as unknown as Record<string, unknown>,
      });

      return reply.send({
        success: true,
        data: policy,
      });
    }
  );

  // Get compliance score
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/compliance',
    async (request, reply) => {
      const { organizationId } = request.params;

      const compliance = await getComplianceScore(organizationId);

      return reply.send({
        success: true,
        data: compliance,
      });
    }
  );

  // Validate policy compliance
  fastify.post<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/validate',
    async (request, reply) => {
      const { organizationId } = request.params;

      const validation = await validatePolicyCompliance(organizationId);

      return reply.send({
        success: true,
        data: validation,
      });
    }
  );

  // Get policy templates
  fastify.get('/privacy/templates', async (request, reply) => {
    return reply.send({
      success: true,
      data: POLICY_TEMPLATES,
    });
  });

  // ==========================================
  // Metadata Mode Configuration
  // ==========================================

  // Get metadata mode config
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/metadata-mode',
    async (request, reply) => {
      const { organizationId } = request.params;

      const config = await getMetadataModeConfig(organizationId);

      return reply.send({
        success: true,
        data: config,
      });
    }
  );

  // Update metadata mode config
  fastify.put<{ Params: OrgParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/metadata-mode',
    async (request, reply) => {
      const { organizationId } = request.params;
      const updates = request.body;

      const config = await updateMetadataModeConfig(organizationId, updates);

      return reply.send({
        success: true,
        data: config,
      });
    }
  );

  // Check if metadata mode is enabled
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/metadata-mode/status',
    async (request, reply) => {
      const { organizationId } = request.params;

      const enabled = await isMetadataModeEnabled(organizationId);

      return reply.send({
        success: true,
        data: { enabled },
      });
    }
  );

  // Get communication patterns (metadata only)
  fastify.get<{ Params: OrgParams; Querystring: { fromDate?: string; toDate?: string } }>(
    '/organizations/:organizationId/privacy/metadata-mode/patterns',
    async (request, reply) => {
      const { organizationId } = request.params;
      const { fromDate, toDate } = request.query;

      const patterns = await extractCommunicationPatterns(organizationId, {
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
      });

      return reply.send({
        success: true,
        data: patterns,
      });
    }
  );

  // Get metadata analytics summary
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/metadata-mode/analytics',
    async (request, reply) => {
      const { organizationId } = request.params;

      const analytics = await getMetadataAnalyticsSummary(organizationId);

      return reply.send({
        success: true,
        data: analytics,
      });
    }
  );

  // ==========================================
  // Anonymization (T301)
  // ==========================================

  // Anonymize text
  fastify.post<{
    Params: OrgParams;
    Body: { text: string; includeGerman?: boolean; config?: Record<string, unknown> };
  }>(
    '/organizations/:organizationId/privacy/anonymize/text',
    async (request, reply) => {
      const { text, includeGerman, config } = request.body;

      const result = anonymizeText(
        text,
        config as any,
        { includeGerman }
      );

      // Log anonymization
      await logAuditEntry(request.params.organizationId, {
        action: 'anonymization',
        category: 'data_lifecycle',
        actorId: (request as any).user?.id || 'api',
        actorType: 'api',
        description: `Anonymized text (${result.anonymizedCount} items)`,
        metadata: { anonymizedCount: result.anonymizedCount },
      });

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Anonymize record
  fastify.post<{
    Params: OrgParams;
    Body: {
      record: Record<string, unknown>;
      includeGerman?: boolean;
      config?: Record<string, unknown>;
    };
  }>(
    '/organizations/:organizationId/privacy/anonymize/record',
    async (request, reply) => {
      const { record, includeGerman, config } = request.body;

      const result = anonymizeRecord(
        record,
        config as any,
        { includeGerman }
      );

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Bulk anonymize records
  fastify.post<{
    Params: OrgParams;
    Body: {
      records: Array<Record<string, unknown>>;
      includeGerman?: boolean;
      config?: Record<string, unknown>;
    };
  }>(
    '/organizations/:organizationId/privacy/anonymize/bulk',
    async (request, reply) => {
      const { records, includeGerman, config } = request.body;

      const results = anonymizeRecords(
        records,
        config as any,
        { includeGerman }
      );

      // Log bulk anonymization
      await logAuditEntry(request.params.organizationId, {
        action: 'anonymization',
        category: 'data_lifecycle',
        actorId: (request as any).user?.id || 'api',
        actorType: 'api',
        description: `Bulk anonymized ${records.length} records`,
        metadata: {
          recordCount: records.length,
          totalAnonymizedFields: results.reduce(
            (sum, r) => sum + r.anonymizedFields.length,
            0
          ),
        },
      });

      return reply.send({
        success: true,
        data: results,
      });
    }
  );

  // Detect PII in text
  fastify.post<{
    Params: OrgParams;
    Body: { text: string; includeGerman?: boolean };
  }>(
    '/organizations/:organizationId/privacy/detect-pii/text',
    async (request, reply) => {
      const { text, includeGerman } = request.body;

      const detections = detectPii(text, { includeGerman });

      return reply.send({
        success: true,
        data: {
          detections,
          count: detections.length,
        },
      });
    }
  );

  // Detect PII in record
  fastify.post<{
    Params: OrgParams;
    Body: { record: Record<string, unknown>; includeGerman?: boolean };
  }>(
    '/organizations/:organizationId/privacy/detect-pii/record',
    async (request, reply) => {
      const { record, includeGerman } = request.body;

      const detections = detectPiiInRecord(record, { includeGerman });

      return reply.send({
        success: true,
        data: {
          detections,
          count: detections.length,
        },
      });
    }
  );

  // ==========================================
  // Data Visibility Rules
  // ==========================================

  // Get visibility rules
  fastify.get<{
    Params: OrgParams;
    Querystring: { role?: string; dataCategory?: string };
  }>(
    '/organizations/:organizationId/privacy/visibility-rules',
    async (request, reply) => {
      const { organizationId } = request.params;
      const { role, dataCategory } = request.query;

      const rules = await getVisibilityRules(organizationId, {
        role,
        dataCategory: dataCategory as any,
      });

      return reply.send({
        success: true,
        data: rules,
      });
    }
  );

  // Create visibility rule
  fastify.post<{ Params: OrgParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/visibility-rules',
    async (request, reply) => {
      const { organizationId } = request.params;
      const input = request.body;

      const rule = await createVisibilityRule(organizationId, input as any);

      return reply.status(201).send({
        success: true,
        data: rule,
      });
    }
  );

  // Update visibility rule
  fastify.put<{ Params: RuleParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/visibility-rules/:ruleId',
    async (request, reply) => {
      const { organizationId, ruleId } = request.params;
      const updates = request.body;

      const rule = await updateVisibilityRule(organizationId, ruleId, updates as any);

      return reply.send({
        success: true,
        data: rule,
      });
    }
  );

  // Delete visibility rule
  fastify.delete<{ Params: RuleParams }>(
    '/organizations/:organizationId/privacy/visibility-rules/:ruleId',
    async (request, reply) => {
      const { organizationId, ruleId } = request.params;

      await deleteVisibilityRule(organizationId, ruleId);

      return reply.send({
        success: true,
        message: 'Rule deleted successfully',
      });
    }
  );

  // Check data access
  fastify.post<{ Params: OrgParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/check-access',
    async (request, reply) => {
      const { organizationId } = request.params;
      const accessRequest = request.body;

      const decision = await checkDataAccess(organizationId, accessRequest as any);

      return reply.send({
        success: true,
        data: decision,
      });
    }
  );

  // Filter data for visibility
  fastify.post<{
    Params: OrgParams;
    Body: { data: Record<string, unknown> | Array<Record<string, unknown>>; request: Record<string, unknown> };
  }>(
    '/organizations/:organizationId/privacy/filter-data',
    async (request, reply) => {
      const { organizationId } = request.params;
      const { data, request: accessRequest } = request.body;

      const filtered = await filterDataForVisibility(
        organizationId,
        data,
        accessRequest as any
      );

      return reply.send({
        success: true,
        data: filtered,
      });
    }
  );

  // Get role visibility summary
  fastify.get<{ Params: OrgParams & { role: string } }>(
    '/organizations/:organizationId/privacy/visibility-summary/:role',
    async (request, reply) => {
      const { organizationId, role } = request.params;

      const summary = await getRoleVisibilitySummary(organizationId, role);

      return reply.send({
        success: true,
        data: summary,
      });
    }
  );

  // Create default visibility rules
  fastify.post<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/visibility-rules/defaults',
    async (request, reply) => {
      const { organizationId } = request.params;

      const rules = await createDefaultRules(organizationId);

      return reply.status(201).send({
        success: true,
        data: rules,
        message: `Created ${rules.length} default rules`,
      });
    }
  );

  // ==========================================
  // Aggregated Reporting
  // ==========================================

  // Get aggregation config
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/aggregation-config',
    async (request, reply) => {
      const { organizationId } = request.params;

      const config = await getAggregationConfig(organizationId);

      return reply.send({
        success: true,
        data: config,
      });
    }
  );

  // Update aggregation config
  fastify.put<{ Params: OrgParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/aggregation-config',
    async (request, reply) => {
      const { organizationId } = request.params;
      const updates = request.body;

      const config = await updateAggregationConfig(organizationId, updates as any);

      return reply.send({
        success: true,
        data: config,
      });
    }
  );

  // Get report templates
  fastify.get('/privacy/report-templates', async (request, reply) => {
    const templates = getReportTemplates();

    return reply.send({
      success: true,
      data: templates,
    });
  });

  // Generate works council report
  fastify.post<{ Params: OrgParams; Body: Record<string, unknown> }>(
    '/organizations/:organizationId/privacy/reports/generate',
    async (request, reply) => {
      const { organizationId } = request.params;
      const reportRequest = request.body;

      const report = await generateWorksCouncilReport(
        organizationId,
        reportRequest as any
      );

      return reply.status(201).send({
        success: true,
        data: report,
      });
    }
  );

  // Get reports
  fastify.get<{
    Params: OrgParams;
    Querystring: {
      reportType?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      limit?: string;
    };
  }>(
    '/organizations/:organizationId/privacy/reports',
    async (request, reply) => {
      const { organizationId } = request.params;
      const { reportType, status, fromDate, toDate, limit } = request.query;

      const reports = await getReports(organizationId, {
        reportType: reportType as any,
        status,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      });

      return reply.send({
        success: true,
        data: reports,
      });
    }
  );

  // Get specific report
  fastify.get<{ Params: ReportParams }>(
    '/organizations/:organizationId/privacy/reports/:reportId',
    async (request, reply) => {
      const { organizationId, reportId } = request.params;

      const report = await getReport(organizationId, reportId);

      if (!report) {
        return reply.status(404).send({
          success: false,
          error: 'Report not found',
        });
      }

      return reply.send({
        success: true,
        data: report,
      });
    }
  );

  // Update report status
  fastify.patch<{
    Params: ReportParams;
    Body: { status: string; worksCouncilApproved?: boolean };
  }>(
    '/organizations/:organizationId/privacy/reports/:reportId/status',
    async (request, reply) => {
      const { organizationId, reportId } = request.params;
      const { status, worksCouncilApproved } = request.body;

      const report = await updateReportStatus(
        organizationId,
        reportId,
        status as any,
        worksCouncilApproved
      );

      return reply.send({
        success: true,
        data: report,
      });
    }
  );

  // ==========================================
  // Privacy Audit (T302)
  // ==========================================

  // Query audit log
  fastify.get<{
    Params: OrgParams;
    Querystring: {
      action?: string;
      category?: string;
      severity?: string;
      actorId?: string;
      targetId?: string;
      fromDate?: string;
      toDate?: string;
      success?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    '/organizations/:organizationId/privacy/audit',
    async (request, reply) => {
      const { organizationId } = request.params;
      const {
        action,
        category,
        severity,
        actorId,
        targetId,
        fromDate,
        toDate,
        success,
        limit,
        offset,
      } = request.query;

      const result = await queryAuditLog(organizationId, {
        action: action as any,
        category: category as any,
        severity: severity as any,
        actorId,
        targetId,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        success: success ? success === 'true' : undefined,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return reply.send({
        success: true,
        data: result.entries,
        pagination: {
          total: result.total,
          limit: parseInt(limit || '100'),
          offset: parseInt(offset || '0'),
        },
      });
    }
  );

  // Get audit statistics
  fastify.get<{
    Params: OrgParams;
    Querystring: { fromDate?: string; toDate?: string };
  }>(
    '/organizations/:organizationId/privacy/audit/statistics',
    async (request, reply) => {
      const { organizationId } = request.params;
      const { fromDate, toDate } = request.query;

      const period =
        fromDate && toDate
          ? { start: new Date(fromDate), end: new Date(toDate) }
          : undefined;

      const statistics = await getAuditStatistics(organizationId, period);

      return reply.send({
        success: true,
        data: statistics,
      });
    }
  );

  // Get data access history for a user
  fastify.get<{
    Params: OrgParams & { userId: string };
    Querystring: { fromDate?: string; toDate?: string; limit?: string };
  }>(
    '/organizations/:organizationId/privacy/audit/access-history/:userId',
    async (request, reply) => {
      const { organizationId, userId } = request.params;
      const { fromDate, toDate, limit } = request.query;

      const history = await getDataAccessHistory(organizationId, userId, {
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      });

      return reply.send({
        success: true,
        data: history,
      });
    }
  );

  // Get consent history for a user
  fastify.get<{ Params: OrgParams & { userId: string } }>(
    '/organizations/:organizationId/privacy/audit/consent-history/:userId',
    async (request, reply) => {
      const { organizationId, userId } = request.params;

      const history = await getConsentHistory(organizationId, userId);

      return reply.send({
        success: true,
        data: history,
      });
    }
  );

  // Export audit log
  fastify.post<{
    Params: OrgParams;
    Body: {
      fromDate: string;
      toDate: string;
      format: 'json' | 'csv';
      includeMetadata?: boolean;
    };
  }>(
    '/organizations/:organizationId/privacy/audit/export',
    async (request, reply) => {
      const { organizationId } = request.params;
      const { fromDate, toDate, format, includeMetadata } = request.body;

      const result = await exportAuditLog(organizationId, {
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        format,
        includeMetadata: includeMetadata ?? true,
      });

      const contentType =
        format === 'csv' ? 'text/csv' : 'application/json';

      return reply
        .header('Content-Type', contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="${result.filename}"`
        )
        .send(result.data);
    }
  );

  // ==========================================
  // Privacy Dashboard Data
  // ==========================================

  // Get privacy dashboard overview
  fastify.get<{ Params: OrgParams }>(
    '/organizations/:organizationId/privacy/dashboard',
    async (request, reply) => {
      const { organizationId } = request.params;

      const [policy, compliance, auditStats, metadataConfig] =
        await Promise.all([
          getPrivacyPolicy(organizationId),
          getComplianceScore(organizationId),
          getAuditStatistics(organizationId),
          getMetadataModeConfig(organizationId),
        ]);

      return reply.send({
        success: true,
        data: {
          policy: {
            mode: policy.mode,
            lastUpdated: policy.updatedAt,
          },
          compliance,
          auditStats: {
            totalEntries: auditStats.totalEntries,
            criticalEvents: auditStats.criticalEvents,
            successRate: auditStats.successRate,
          },
          metadataMode: {
            enabled: metadataConfig.enabled,
          },
        },
      });
    }
  );
}
