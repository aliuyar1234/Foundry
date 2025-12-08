/**
 * Report Generator Service
 * T178-T181 - Compliance report generation
 *
 * Generates various compliance reports and audit documentation
 */

import { prisma } from '../../lib/prisma.js';
import type {
  ComplianceReport,
  ComplianceReportType,
  ComplianceSummary,
  ComplianceReportSection,
  ComplianceFinding,
  ComplianceFramework,
} from 'shared/types/compliance.js';
import { getComplianceSummary } from './ruleEngine.js';
import { getViolationStatistics, getViolations } from './violationDetector.js';
import { getAllEvidenceCollections } from './evidenceCollector.js';
import { getDeadlineSchedule, getDeadlineStatistics } from './deadlineTracker.js';

// =============================================================================
// Types
// =============================================================================

export interface ReportGenerationOptions {
  organizationId: string;
  reportType: ComplianceReportType;
  framework?: ComplianceFramework;
  startDate?: Date;
  endDate?: Date;
  includeEvidence?: boolean;
  format?: 'json' | 'html' | 'pdf';
}

export interface GeneratedReport extends ComplianceReport {
  generatedBy: string;
  fileUrl?: string;
  expiresAt?: Date;
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generate a compliance report
 */
export async function generateReport(
  options: ReportGenerationOptions
): Promise<GeneratedReport> {
  const period = {
    start: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: options.endDate || new Date(),
  };

  let report: ComplianceReport;

  switch (options.reportType) {
    case 'status_report':
      report = await generateStatusReport(options.organizationId, period, options.framework);
      break;
    case 'audit_report':
      report = await generateAuditReport(options.organizationId, period, options.framework);
      break;
    case 'gap_analysis':
      report = await generateGapAnalysis(options.organizationId, period, options.framework);
      break;
    case 'pre_audit_checklist':
      report = await generatePreAuditChecklist(options.organizationId, options.framework);
      break;
    case 'violation_report':
      report = await generateViolationReport(options.organizationId, period, options.framework);
      break;
    default:
      throw new Error(`Unknown report type: ${options.reportType}`);
  }

  // Store report
  const stored = await prisma.complianceReport.create({
    data: {
      type: options.reportType,
      framework: options.framework,
      generatedAt: new Date(),
      periodStart: period.start,
      periodEnd: period.end,
      summary: report.summary as Record<string, unknown>,
      sections: report.sections as Record<string, unknown>[],
      organizationId: options.organizationId,
    },
  });

  return {
    ...report,
    id: stored.id,
    generatedBy: 'system',
  };
}

/**
 * Generate compliance status report (T180)
 */
async function generateStatusReport(
  organizationId: string,
  period: { start: Date; end: Date },
  framework?: ComplianceFramework
): Promise<ComplianceReport> {
  const summary = await getComplianceSummary(organizationId);
  const violationStats = await getViolationStatistics(organizationId, {
    startDate: period.start,
    endDate: period.end,
  });
  const deadlineStats = await getDeadlineStatistics(organizationId);

  const sections: ComplianceReportSection[] = [];

  // Overall Compliance Summary
  sections.push({
    title: 'Executive Summary',
    content: generateExecutiveSummary(summary, violationStats),
    findings: [],
    recommendations: generateRecommendations(summary, violationStats),
  });

  // Compliance by Framework
  if (!framework) {
    for (const [fw, stats] of Object.entries(summary.byFramework)) {
      sections.push({
        title: `${fw} Compliance`,
        framework: fw as ComplianceFramework,
        content: `Compliance rate: ${Math.round((stats.passing / stats.total) * 100)}%`,
        findings: await getFrameworkFindings(organizationId, fw as ComplianceFramework),
        recommendations: [],
      });
    }
  } else {
    const stats = summary.byFramework[framework];
    if (stats) {
      sections.push({
        title: `${framework} Compliance`,
        framework,
        content: `Compliance rate: ${Math.round((stats.passing / stats.total) * 100)}%`,
        findings: await getFrameworkFindings(organizationId, framework),
        recommendations: [],
      });
    }
  }

  // Violations Summary
  sections.push({
    title: 'Violations Summary',
    content: `Total open violations: ${violationStats.total - (violationStats.byStatus.remediated || 0)}`,
    findings: await getViolationFindings(organizationId, period),
    recommendations: ['Address all critical violations within 24 hours'],
  });

  // Deadlines Status
  sections.push({
    title: 'Compliance Deadlines',
    content: `Upcoming deadlines: ${deadlineStats.upcoming + deadlineStats.dueSoon}`,
    findings: [],
    recommendations:
      deadlineStats.overdue > 0
        ? [`Address ${deadlineStats.overdue} overdue deadlines immediately`]
        : [],
  });

  return {
    id: '',
    type: 'status_report',
    framework,
    generatedAt: new Date(),
    period,
    summary: {
      ...summary,
      openViolations: violationStats.total - (violationStats.byStatus.remediated || 0),
      criticalViolations: violationStats.bySeverity.critical || 0,
      evidenceCompleteness: await calculateEvidenceCompleteness(organizationId),
    },
    sections,
    organizationId,
  };
}

/**
 * Generate GDPR audit report (T179)
 */
async function generateAuditReport(
  organizationId: string,
  period: { start: Date; end: Date },
  framework?: ComplianceFramework
): Promise<ComplianceReport> {
  const summary = await getComplianceSummary(organizationId);
  const evidenceCollections = await getAllEvidenceCollections(organizationId);

  const sections: ComplianceReportSection[] = [];

  // Audit Scope
  sections.push({
    title: 'Audit Scope',
    content: `This audit covers the period from ${period.start.toLocaleDateString()} to ${period.end.toLocaleDateString()}. ` +
      `Framework: ${framework || 'All frameworks'}`,
    findings: [],
    recommendations: [],
  });

  // Control Assessment
  sections.push({
    title: 'Control Assessment',
    content: `Total controls assessed: ${summary.activeRules}. ` +
      `Controls passing: ${summary.passingRules}. ` +
      `Controls failing: ${summary.failingRules}.`,
    findings: await getControlFindings(organizationId, framework),
    recommendations: [],
  });

  // Evidence Summary
  sections.push({
    title: 'Evidence Collection',
    content: `Total evidence collections: ${evidenceCollections.length}`,
    findings: evidenceCollections.map((ec) => ({
      type: ec.coveragePercentage >= 80 ? 'pass' : 'warning',
      ruleId: ec.ruleId,
      ruleName: ec.ruleName,
      description: `Evidence coverage: ${ec.coveragePercentage}%`,
    })) as ComplianceFinding[],
    recommendations:
      evidenceCollections.filter((ec) => ec.coveragePercentage < 80).length > 0
        ? ['Improve evidence collection for rules with less than 80% coverage']
        : [],
  });

  // Remediation Status
  const violations = await getViolations({
    organizationId,
    startDate: period.start,
    endDate: period.end,
  });

  sections.push({
    title: 'Remediation Status',
    content: `Violations detected: ${violations.total}. ` +
      `Remediated: ${violations.violations.filter((v) => v.status === 'remediated').length}.`,
    findings: violations.violations.slice(0, 10).map((v) => ({
      type: v.status === 'remediated' ? 'pass' : 'fail',
      ruleId: v.ruleId,
      ruleName: v.ruleName || v.ruleId,
      description: v.description,
      remediation: v.resolutionNotes,
    })) as ComplianceFinding[],
    recommendations: [],
  });

  return {
    id: '',
    type: 'audit_report',
    framework,
    generatedAt: new Date(),
    period,
    summary: {
      ...summary,
      openViolations: violations.violations.filter((v) => v.status === 'open').length,
      criticalViolations: violations.violations.filter((v) => v.severity === 'critical').length,
      evidenceCompleteness: await calculateEvidenceCompleteness(organizationId),
    },
    sections,
    organizationId,
  };
}

/**
 * Generate gap analysis report
 */
async function generateGapAnalysis(
  organizationId: string,
  period: { start: Date; end: Date },
  framework?: ComplianceFramework
): Promise<ComplianceReport> {
  const summary = await getComplianceSummary(organizationId);

  const sections: ComplianceReportSection[] = [];

  // Gap Summary
  sections.push({
    title: 'Gap Analysis Summary',
    content: `This analysis identifies gaps in compliance posture for ${framework || 'all frameworks'}.`,
    findings: [],
    recommendations: [],
  });

  // Control Gaps
  const failingRules = await prisma.complianceRule.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(framework && { framework }),
    },
  });

  const gaps = failingRules.filter((r) => r.failCount > r.passCount);

  sections.push({
    title: 'Control Gaps',
    content: `${gaps.length} controls are currently non-compliant.`,
    findings: gaps.map((r) => ({
      type: 'fail' as const,
      ruleId: r.id,
      ruleName: r.name,
      description: r.description,
      remediation: 'Review and implement required controls',
    })),
    recommendations: gaps.length > 0
      ? [
          'Prioritize remediation of critical control gaps',
          'Assign owners to each gap for remediation tracking',
        ]
      : [],
  });

  // Evidence Gaps
  const evidenceCollections = await getAllEvidenceCollections(organizationId);
  const evidenceGaps = evidenceCollections.filter((ec) => ec.coveragePercentage < 100);

  sections.push({
    title: 'Evidence Gaps',
    content: `${evidenceGaps.length} rules have incomplete evidence collection.`,
    findings: evidenceGaps.map((ec) => ({
      type: 'warning' as const,
      ruleId: ec.ruleId,
      ruleName: ec.ruleName,
      description: `Evidence coverage: ${ec.coveragePercentage}%`,
      remediation: 'Collect additional evidence to achieve full coverage',
    })),
    recommendations: evidenceGaps.length > 0
      ? ['Implement automated evidence collection where possible']
      : [],
  });

  return {
    id: '',
    type: 'gap_analysis',
    framework,
    generatedAt: new Date(),
    period,
    summary: {
      ...summary,
      openViolations: gaps.length,
      criticalViolations: gaps.filter((g) => g.severity === 'critical').length,
      evidenceCompleteness: await calculateEvidenceCompleteness(organizationId),
    },
    sections,
    organizationId,
  };
}

/**
 * Generate pre-audit checklist (T181)
 */
async function generatePreAuditChecklist(
  organizationId: string,
  framework?: ComplianceFramework
): Promise<ComplianceReport> {
  const summary = await getComplianceSummary(organizationId);
  const deadlineSchedule = await getDeadlineSchedule(organizationId);
  const evidenceCollections = await getAllEvidenceCollections(organizationId);

  const sections: ComplianceReportSection[] = [];

  // Pre-Audit Overview
  sections.push({
    title: 'Pre-Audit Checklist',
    content: 'Complete the following items before the compliance audit.',
    findings: [],
    recommendations: [],
  });

  // Documentation Review
  const docChecklist: ComplianceFinding[] = [
    {
      type: 'info',
      ruleId: 'doc-policies',
      ruleName: 'Policy Documentation',
      description: 'Review and ensure all policies are current and approved',
    },
    {
      type: 'info',
      ruleId: 'doc-procedures',
      ruleName: 'Procedure Documentation',
      description: 'Verify all procedures are documented and accessible',
    },
    {
      type: 'info',
      ruleId: 'doc-evidence',
      ruleName: 'Evidence Inventory',
      description: 'Compile evidence for all compliance controls',
    },
  ];

  sections.push({
    title: 'Documentation Review',
    content: 'Ensure all required documentation is complete and current.',
    findings: docChecklist,
    recommendations: [],
  });

  // Evidence Preparation
  const incompleteEvidence = evidenceCollections.filter((ec) => ec.coveragePercentage < 100);

  sections.push({
    title: 'Evidence Preparation',
    content: `${evidenceCollections.length} evidence collections to review. ` +
      `${incompleteEvidence.length} need additional evidence.`,
    findings: incompleteEvidence.map((ec) => ({
      type: 'warning' as const,
      ruleId: ec.ruleId,
      ruleName: ec.ruleName,
      description: `Coverage: ${ec.coveragePercentage}% - needs additional evidence`,
    })),
    recommendations: incompleteEvidence.length > 0
      ? ['Collect missing evidence before audit']
      : ['Evidence collection is complete'],
  });

  // Open Items
  const violations = await getViolations({
    organizationId,
    status: ['open', 'acknowledged', 'in_progress'],
  });

  sections.push({
    title: 'Open Items to Address',
    content: `${violations.total} open violations to address before audit.`,
    findings: violations.violations.slice(0, 20).map((v) => ({
      type: 'fail' as const,
      ruleId: v.ruleId,
      ruleName: v.ruleName || v.ruleId,
      description: v.description,
      remediation: `Status: ${v.status}`,
    })),
    recommendations: violations.total > 0
      ? [
          'Remediate all open violations before audit',
          'Document any exceptions with business justification',
        ]
      : [],
  });

  // Upcoming Deadlines
  const urgentDeadlines = [
    ...deadlineSchedule.overdue,
    ...deadlineSchedule.dueSoon,
  ];

  sections.push({
    title: 'Deadline Status',
    content: `${urgentDeadlines.length} deadlines require attention.`,
    findings: urgentDeadlines.map((d) => ({
      type: d.status === 'overdue' ? 'fail' : 'warning',
      ruleId: d.id,
      ruleName: d.title,
      description: `Due: ${new Date(d.dueDate).toLocaleDateString()} - ${d.status}`,
    })) as ComplianceFinding[],
    recommendations: urgentDeadlines.length > 0
      ? ['Complete all overdue items immediately']
      : [],
  });

  return {
    id: '',
    type: 'pre_audit_checklist',
    framework,
    generatedAt: new Date(),
    period: { start: new Date(), end: new Date() },
    summary: {
      ...summary,
      openViolations: violations.total,
      criticalViolations: violations.violations.filter((v) => v.severity === 'critical').length,
      evidenceCompleteness: await calculateEvidenceCompleteness(organizationId),
    },
    sections,
    organizationId,
  };
}

/**
 * Generate violation report
 */
async function generateViolationReport(
  organizationId: string,
  period: { start: Date; end: Date },
  framework?: ComplianceFramework
): Promise<ComplianceReport> {
  const violations = await getViolations({
    organizationId,
    startDate: period.start,
    endDate: period.end,
    framework,
  });

  const stats = await getViolationStatistics(organizationId, {
    startDate: period.start,
    endDate: period.end,
  });

  const sections: ComplianceReportSection[] = [];

  // Summary
  sections.push({
    title: 'Violation Summary',
    content: `Total violations in period: ${violations.total}. ` +
      `Critical: ${stats.bySeverity.critical || 0}. ` +
      `High: ${stats.bySeverity.high || 0}. ` +
      `Average resolution time: ${stats.avgResolutionTimeHours} hours.`,
    findings: [],
    recommendations: [],
  });

  // Critical Violations
  const criticalViolations = violations.violations.filter((v) => v.severity === 'critical');
  if (criticalViolations.length > 0) {
    sections.push({
      title: 'Critical Violations',
      content: `${criticalViolations.length} critical violations detected.`,
      findings: criticalViolations.map((v) => ({
        type: 'fail' as const,
        ruleId: v.ruleId,
        ruleName: v.ruleName || v.ruleId,
        description: v.description,
        remediation: v.resolutionNotes || 'Immediate action required',
      })),
      recommendations: ['Address all critical violations within 24 hours'],
    });
  }

  // Violation Trends
  sections.push({
    title: 'Violation Trends',
    content: `Overdue violations: ${stats.overdueCount}. ` +
      `Open violations: ${stats.byStatus.open || 0}. ` +
      `Remediated: ${stats.byStatus.remediated || 0}.`,
    findings: [],
    recommendations:
      stats.overdueCount > 0
        ? ['Prioritize remediation of overdue violations']
        : [],
  });

  const summary = await getComplianceSummary(organizationId);

  return {
    id: '',
    type: 'violation_report',
    framework,
    generatedAt: new Date(),
    period,
    summary: {
      ...summary,
      openViolations: stats.byStatus.open || 0,
      criticalViolations: stats.bySeverity.critical || 0,
      evidenceCompleteness: await calculateEvidenceCompleteness(organizationId),
    },
    sections,
    organizationId,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateExecutiveSummary(
  summary: Awaited<ReturnType<typeof getComplianceSummary>>,
  _violationStats: Awaited<ReturnType<typeof getViolationStatistics>>
): string {
  return `Overall compliance score: ${summary.complianceScore}%. ` +
    `Active rules: ${summary.activeRules}. ` +
    `Passing: ${summary.passingRules}. ` +
    `Failing: ${summary.failingRules}.`;
}

function generateRecommendations(
  summary: Awaited<ReturnType<typeof getComplianceSummary>>,
  violationStats: Awaited<ReturnType<typeof getViolationStatistics>>
): string[] {
  const recommendations: string[] = [];

  if (summary.complianceScore < 80) {
    recommendations.push('Focus on improving overall compliance score to at least 80%');
  }

  if (violationStats.overdueCount > 0) {
    recommendations.push(`Address ${violationStats.overdueCount} overdue violations immediately`);
  }

  if (violationStats.bySeverity.critical > 0) {
    recommendations.push(`Prioritize remediation of ${violationStats.bySeverity.critical} critical violations`);
  }

  return recommendations;
}

async function getFrameworkFindings(
  organizationId: string,
  framework: ComplianceFramework
): Promise<ComplianceFinding[]> {
  const rules = await prisma.complianceRule.findMany({
    where: { organizationId, framework, isActive: true },
    take: 20,
  });

  return rules.map((r) => ({
    type: r.passCount >= r.failCount ? 'pass' : 'fail',
    ruleId: r.id,
    ruleName: r.name,
    description: r.description,
  })) as ComplianceFinding[];
}

async function getViolationFindings(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<ComplianceFinding[]> {
  const violations = await getViolations({
    organizationId,
    startDate: period.start,
    endDate: period.end,
    limit: 20,
  });

  return violations.violations.map((v) => ({
    type: v.status === 'remediated' ? 'pass' : 'fail',
    ruleId: v.ruleId,
    ruleName: v.ruleName || v.ruleId,
    description: v.description,
    remediation: v.resolutionNotes,
  })) as ComplianceFinding[];
}

async function getControlFindings(
  organizationId: string,
  framework?: ComplianceFramework
): Promise<ComplianceFinding[]> {
  const rules = await prisma.complianceRule.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(framework && { framework }),
    },
    take: 30,
  });

  return rules.map((r) => ({
    type: r.passCount >= r.failCount ? 'pass' : 'fail',
    ruleId: r.id,
    ruleName: r.name,
    description: r.description,
  })) as ComplianceFinding[];
}

async function calculateEvidenceCompleteness(organizationId: string): Promise<number> {
  const collections = await getAllEvidenceCollections(organizationId);

  if (collections.length === 0) return 100;

  const totalCoverage = collections.reduce(
    (sum, ec) => sum + ec.coveragePercentage,
    0
  );

  return Math.round(totalCoverage / collections.length);
}

// =============================================================================
// Exports
// =============================================================================

export default {
  generateReport,
  generateStatusReport,
  generateAuditReport,
  generateGapAnalysis,
  generatePreAuditChecklist,
  generateViolationReport,
};
