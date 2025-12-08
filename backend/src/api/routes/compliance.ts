/**
 * Compliance API Routes
 * T183-T191 - Compliance REST API endpoints
 *
 * Endpoints for compliance rules, violations, evidence, deadlines, and reports
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  evaluateRule,
  evaluateAllRules,
  getComplianceSummary,
} from '../../services/compliance/ruleEngine.js';
import {
  detectViolations,
  getViolations,
  getViolationById,
  getViolationStatistics,
  resolveViolation,
  assignViolation,
  updateViolationStatus,
} from '../../services/compliance/violationDetector.js';
import {
  collectEvidenceForRule,
  getEvidenceForRule,
  getAllEvidenceCollections,
} from '../../services/compliance/evidenceCollector.js';
import {
  createDeadline,
  updateDeadline,
  completeDeadline,
  deleteDeadline,
  getDeadlines,
  getDeadlineSchedule,
  getDeadlineStatistics,
  getDeadlineAlerts,
} from '../../services/compliance/deadlineTracker.js';
import { generateReport } from '../../services/compliance/reportGenerator.js';
import {
  getRetentionPolicies,
  createRetentionPolicy,
  getRetentionReport,
} from '../../services/compliance/retentionTracker.js';
import type {
  ComplianceFramework,
  ComplianceCategory,
  Severity,
  ViolationStatus,
  ComplianceReportType,
} from 'shared/types/compliance.js';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  framework: z.enum(['GDPR', 'SOX', 'ISO27001', 'DSGVO', 'custom']),
  category: z.enum([
    'data_retention',
    'access_control',
    'process_compliance',
    'audit_trail',
    'data_protection',
    'segregation_of_duties',
    'approval_workflows',
  ]),
  ruleLogic: z.object({
    type: z.enum(['query', 'threshold', 'pattern', 'workflow', 'custom']),
    config: z.record(z.unknown()),
    gracePeriodHours: z.number().optional(),
    exceptions: z.array(z.record(z.unknown())).optional(),
  }),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  checkFrequency: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'monthly']),
  isActive: z.boolean().default(true),
});

const updateRuleSchema = createRuleSchema.partial();

const resolveViolationSchema = z.object({
  status: z.enum(['remediated', 'accepted_risk', 'false_positive']),
  notes: z.string().min(1).max(2000),
  evidenceIds: z.array(z.string()).optional(),
});

const createDeadlineSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000),
  framework: z.enum(['GDPR', 'SOX', 'ISO27001', 'DSGVO', 'custom']),
  dueDate: z.string().datetime(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.string().optional(),
  assignedTo: z.string().optional(),
  relatedRuleIds: z.array(z.string()).default([]),
});

const generateReportSchema = z.object({
  reportType: z.enum([
    'status_report',
    'audit_report',
    'gap_analysis',
    'pre_audit_checklist',
    'violation_report',
  ]),
  framework: z.enum(['GDPR', 'SOX', 'ISO27001', 'DSGVO', 'custom']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  includeEvidence: z.boolean().optional(),
});

// =============================================================================
// Middleware
// =============================================================================

function getOrganizationId(req: Request): string {
  return req.headers['x-organization-id'] as string || 'default';
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// =============================================================================
// Rules API (T183-T186)
// =============================================================================

// GET /compliance/rules - List compliance rules
router.get(
  '/rules',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { framework, category, isActive, limit, offset } = req.query;

    const where: Record<string, unknown> = { organizationId };

    if (framework) where.framework = framework;
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [rules, total] = await Promise.all([
      prisma.complianceRule.findMany({
        where,
        take: Number(limit) || 50,
        skip: Number(offset) || 0,
        orderBy: [{ severity: 'asc' }, { name: 'asc' }],
      }),
      prisma.complianceRule.count({ where }),
    ]);

    res.json({ rules, total, limit: Number(limit) || 50, offset: Number(offset) || 0 });
  })
);

// GET /compliance/rules/:id - Get rule by ID
router.get(
  '/rules/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const rule = await prisma.complianceRule.findFirst({
      where: { id, organizationId },
    });

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json(rule);
  })
);

// POST /compliance/rules - Create rule
router.post(
  '/rules',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const data = createRuleSchema.parse(req.body);

    const rule = await prisma.complianceRule.create({
      data: {
        ...data,
        ruleLogic: data.ruleLogic as Record<string, unknown>,
        organizationId,
        createdBy: req.headers['x-user-id'] as string || 'system',
        passCount: 0,
        failCount: 0,
      },
    });

    res.status(201).json(rule);
  })
);

// PUT /compliance/rules/:id - Update rule
router.put(
  '/rules/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const data = updateRuleSchema.parse(req.body);

    const existing = await prisma.complianceRule.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const rule = await prisma.complianceRule.update({
      where: { id },
      data: {
        ...data,
        ruleLogic: data.ruleLogic as Record<string, unknown> | undefined,
      },
    });

    res.json(rule);
  })
);

// DELETE /compliance/rules/:id - Delete rule
router.delete(
  '/rules/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const existing = await prisma.complianceRule.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    await prisma.complianceRule.delete({ where: { id } });

    res.status(204).send();
  })
);

// POST /compliance/rules/:id/evaluate - Evaluate a specific rule
router.post(
  '/rules/:id/evaluate',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const rule = await prisma.complianceRule.findFirst({
      where: { id, organizationId },
    });

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const result = await evaluateRule(rule as any, {
      organizationId,
      evaluationTime: new Date(),
    });

    res.json(result);
  })
);

// POST /compliance/rules/evaluate - Evaluate all rules
router.post(
  '/rules/evaluate',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { framework, category, dryRun } = req.body;

    const result = await evaluateAllRules(organizationId, {
      framework,
      category,
      dryRun,
    });

    res.json(result);
  })
);

// =============================================================================
// Violations API (T187-T188)
// =============================================================================

// GET /compliance/violations - List violations
router.get(
  '/violations',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { status, severity, framework, ruleId, assignedTo, overdue, limit, offset } = req.query;

    const result = await getViolations({
      organizationId,
      status: status as ViolationStatus,
      severity: severity as Severity,
      framework: framework as ComplianceFramework,
      ruleId: ruleId as string,
      assignedTo: assignedTo as string,
      overdue: overdue === 'true',
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });

    res.json(result);
  })
);

// GET /compliance/violations/statistics - Get violation statistics
router.get(
  '/violations/statistics',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { startDate, endDate } = req.query;

    const stats = await getViolationStatistics(organizationId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(stats);
  })
);

// GET /compliance/violations/:id - Get violation by ID
router.get(
  '/violations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const violation = await getViolationById(id, organizationId);

    if (!violation) {
      res.status(404).json({ error: 'Violation not found' });
      return;
    }

    res.json(violation);
  })
);

// POST /compliance/violations/:id/resolve - Resolve violation
router.post(
  '/violations/:id/resolve',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const data = resolveViolationSchema.parse(req.body);

    const violation = await getViolationById(id, organizationId);

    if (!violation) {
      res.status(404).json({ error: 'Violation not found' });
      return;
    }

    const resolved = await resolveViolation(
      id,
      data,
      req.headers['x-user-id'] as string || 'system'
    );

    res.json(resolved);
  })
);

// POST /compliance/violations/:id/assign - Assign violation
router.post(
  '/violations/:id/assign',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { assignedTo } = req.body;

    const violation = await getViolationById(id, organizationId);

    if (!violation) {
      res.status(404).json({ error: 'Violation not found' });
      return;
    }

    const updated = await assignViolation(id, assignedTo);

    res.json(updated);
  })
);

// POST /compliance/detect - Trigger violation detection
router.post(
  '/detect',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { framework } = req.body;

    const result = await detectViolations(organizationId, { framework });

    res.json(result);
  })
);

// =============================================================================
// Evidence API (T189)
// =============================================================================

// GET /compliance/evidence - Get all evidence collections
router.get(
  '/evidence',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);

    const collections = await getAllEvidenceCollections(organizationId);

    res.json({ collections });
  })
);

// GET /compliance/evidence/:ruleId - Get evidence for rule
router.get(
  '/evidence/:ruleId',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { ruleId } = req.params;
    const { limit, offset, evidenceType, startDate, endDate } = req.query;

    const result = await getEvidenceForRule(ruleId, organizationId, {
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
      evidenceType: evidenceType as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(result);
  })
);

// POST /compliance/evidence/:ruleId/collect - Collect evidence for rule
router.post(
  '/evidence/:ruleId/collect',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { ruleId } = req.params;

    const result = await collectEvidenceForRule(ruleId, organizationId);

    res.json(result);
  })
);

// =============================================================================
// Deadlines API (T191)
// =============================================================================

// GET /compliance/deadlines - List deadlines
router.get(
  '/deadlines',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { status, framework, assignedTo, limit, offset } = req.query;

    const result = await getDeadlines(organizationId, {
      status: status as string,
      framework: framework as ComplianceFramework,
      assignedTo: assignedTo as string,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });

    res.json(result);
  })
);

// GET /compliance/deadlines/schedule - Get deadline schedule
router.get(
  '/deadlines/schedule',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);

    const schedule = await getDeadlineSchedule(organizationId);

    res.json(schedule);
  })
);

// GET /compliance/deadlines/statistics - Get deadline statistics
router.get(
  '/deadlines/statistics',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);

    const stats = await getDeadlineStatistics(organizationId);

    res.json(stats);
  })
);

// GET /compliance/deadlines/alerts - Get deadline alerts
router.get(
  '/deadlines/alerts',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { assignedTo } = req.query;

    const alerts = await getDeadlineAlerts(organizationId, {
      assignedTo: assignedTo as string,
    });

    res.json({ alerts });
  })
);

// POST /compliance/deadlines - Create deadline
router.post(
  '/deadlines',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const data = createDeadlineSchema.parse(req.body);

    const deadline = await createDeadline({
      ...data,
      dueDate: new Date(data.dueDate),
      organizationId,
    });

    res.status(201).json(deadline);
  })
);

// PUT /compliance/deadlines/:id - Update deadline
router.put(
  '/deadlines/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const data = createDeadlineSchema.partial().parse(req.body);

    const deadline = await updateDeadline(id, {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    });

    res.json(deadline);
  })
);

// POST /compliance/deadlines/:id/complete - Complete deadline
router.post(
  '/deadlines/:id/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const deadline = await completeDeadline(id);

    res.json(deadline);
  })
);

// DELETE /compliance/deadlines/:id - Delete deadline
router.delete(
  '/deadlines/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await deleteDeadline(id);

    res.status(204).send();
  })
);

// =============================================================================
// Reports API (T190)
// =============================================================================

// POST /compliance/reports/generate - Generate report
router.post(
  '/reports/generate',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const data = generateReportSchema.parse(req.body);

    const report = await generateReport({
      organizationId,
      reportType: data.reportType,
      framework: data.framework,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      includeEvidence: data.includeEvidence,
    });

    res.json(report);
  })
);

// GET /compliance/reports - List generated reports
router.get(
  '/reports',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { reportType, framework, limit, offset } = req.query;

    const where: Record<string, unknown> = { organizationId };
    if (reportType) where.type = reportType;
    if (framework) where.framework = framework;

    const [reports, total] = await Promise.all([
      prisma.complianceReport.findMany({
        where,
        take: Number(limit) || 20,
        skip: Number(offset) || 0,
        orderBy: { generatedAt: 'desc' },
      }),
      prisma.complianceReport.count({ where }),
    ]);

    res.json({ reports, total });
  })
);

// GET /compliance/reports/:id - Get report by ID
router.get(
  '/reports/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const report = await prisma.complianceReport.findFirst({
      where: { id, organizationId },
    });

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.json(report);
  })
);

// =============================================================================
// Summary API
// =============================================================================

// GET /compliance/summary - Get compliance summary
router.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);

    const summary = await getComplianceSummary(organizationId);

    res.json(summary);
  })
);

// =============================================================================
// Retention API
// =============================================================================

// GET /compliance/retention - Get retention policies
router.get(
  '/retention',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);
    const { framework, isActive } = req.query;

    const policies = await getRetentionPolicies(organizationId, {
      framework: framework as ComplianceFramework,
      isActive: isActive === 'true',
    });

    res.json({ policies });
  })
);

// POST /compliance/retention - Create retention policy
router.post(
  '/retention',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);

    const policy = await createRetentionPolicy({
      ...req.body,
      organizationId,
    });

    res.status(201).json(policy);
  })
);

// GET /compliance/retention/report - Get retention report
router.get(
  '/retention/report',
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = getOrganizationId(req);

    const report = await getRetentionReport(organizationId);

    res.json(report);
  })
);

// =============================================================================
// Export Router
// =============================================================================

export default router;
