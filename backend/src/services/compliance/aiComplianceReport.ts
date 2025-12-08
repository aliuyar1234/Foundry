/**
 * AI Compliance Report Service
 * T254 - Create compliance report for AI usage
 *
 * Generates comprehensive reports on AI usage, decisions,
 * and compliance metrics for regulatory and audit purposes
 */

import { PrismaClient } from '@prisma/client';
import { queryAuditRecords, getAuditSummary, type AIDecisionAudit } from '../audit/aiAuditService.js';
import { queryActionRecords, getActionSummary, type ActionAudit } from '../audit/actionAuditService.js';

// Types
interface AIComplianceReport {
  id: string;
  organizationId: string;
  reportType: ReportType;
  period: {
    start: Date;
    end: Date;
  };
  generatedAt: Date;
  generatedBy: string;
  version: string;
  sections: ReportSection[];
  summary: ReportSummary;
  findings: ComplianceFinding[];
  recommendations: string[];
  metadata: Record<string, unknown>;
}

type ReportType =
  | 'ai_usage'
  | 'decision_audit'
  | 'automated_actions'
  | 'data_access'
  | 'compliance_summary'
  | 'risk_assessment'
  | 'regulatory'
  | 'comprehensive';

interface ReportSection {
  id: string;
  title: string;
  description: string;
  data: unknown;
  charts?: ChartData[];
  tables?: TableData[];
}

interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'area';
  title: string;
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
}

interface TableData {
  title: string;
  headers: string[];
  rows: string[][];
}

interface ReportSummary {
  totalAIDecisions: number;
  totalAutomatedActions: number;
  modelUsage: Record<string, number>;
  decisionTypeBreakdown: Record<string, number>;
  averageConfidence: number;
  successRate: number;
  tokenUsage: {
    total: number;
    byModel: Record<string, number>;
    estimatedCost?: number;
  };
  userEngagement: {
    uniqueUsers: number;
    averageQueriesPerUser: number;
    topUsers: Array<{ userId: string; queryCount: number }>;
  };
  riskMetrics: {
    highImpactDecisions: number;
    lowConfidenceDecisions: number;
    failedActions: number;
    rollbacks: number;
  };
}

interface ComplianceFinding {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  title: string;
  description: string;
  evidence: string[];
  remediation: string;
  status: 'open' | 'acknowledged' | 'resolved';
}

interface ReportOptions {
  organizationId: string;
  reportType: ReportType;
  startDate: Date;
  endDate: Date;
  generatedBy: string;
  includeDetails?: boolean;
  includeRecommendations?: boolean;
  frameworks?: string[];
  customSections?: string[];
}

// Report version
const REPORT_VERSION = '1.0.0';

let prisma: PrismaClient | null = null;

/**
 * Initialize the compliance report service
 */
export function initializeComplianceReportService(prismaClient: PrismaClient): void {
  prisma = prismaClient;
}

/**
 * Generate an AI compliance report
 */
export async function generateAIComplianceReport(
  options: ReportOptions
): Promise<AIComplianceReport> {
  const reportId = `report_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // Gather data
  const aiSummary = await getAuditSummary(
    options.organizationId,
    options.startDate,
    options.endDate
  );

  const actionSummary = await getActionSummary(
    options.organizationId,
    options.startDate,
    options.endDate
  );

  // Get detailed records if requested
  let aiDecisions: AIDecisionAudit[] = [];
  let automatedActions: ActionAudit[] = [];

  if (options.includeDetails) {
    aiDecisions = await queryAuditRecords({
      organizationId: options.organizationId,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 1000,
    });

    automatedActions = await queryActionRecords({
      organizationId: options.organizationId,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 1000,
    });
  }

  // Build report sections based on type
  const sections = buildReportSections(options.reportType, {
    aiSummary,
    actionSummary,
    aiDecisions,
    automatedActions,
    options,
  });

  // Calculate summary
  const summary = calculateReportSummary(aiSummary, actionSummary, aiDecisions, automatedActions);

  // Identify compliance findings
  const findings = identifyComplianceFindings(summary, aiDecisions, automatedActions);

  // Generate recommendations
  const recommendations = options.includeRecommendations
    ? generateRecommendations(summary, findings)
    : [];

  const report: AIComplianceReport = {
    id: reportId,
    organizationId: options.organizationId,
    reportType: options.reportType,
    period: {
      start: options.startDate,
      end: options.endDate,
    },
    generatedAt: new Date(),
    generatedBy: options.generatedBy,
    version: REPORT_VERSION,
    sections,
    summary,
    findings,
    recommendations,
    metadata: {
      frameworks: options.frameworks || [],
      customSections: options.customSections || [],
    },
  };

  // Save report to database
  await saveReport(report);

  return report;
}

/**
 * Build report sections based on type
 */
function buildReportSections(
  reportType: ReportType,
  data: {
    aiSummary: Awaited<ReturnType<typeof getAuditSummary>>;
    actionSummary: Awaited<ReturnType<typeof getActionSummary>>;
    aiDecisions: AIDecisionAudit[];
    automatedActions: ActionAudit[];
    options: ReportOptions;
  }
): ReportSection[] {
  const sections: ReportSection[] = [];

  // Executive Summary (always included)
  sections.push({
    id: 'executive_summary',
    title: 'Executive Summary',
    description: 'High-level overview of AI usage and compliance status',
    data: {
      totalDecisions: data.aiSummary.totalDecisions,
      totalActions: data.actionSummary.totalActions,
      successRate: data.actionSummary.successRate,
      periodDays: Math.ceil(
        (data.options.endDate.getTime() - data.options.startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      ),
    },
  });

  // Type-specific sections
  if (reportType === 'ai_usage' || reportType === 'comprehensive') {
    sections.push({
      id: 'ai_usage',
      title: 'AI Usage Statistics',
      description: 'Detailed breakdown of AI model usage and token consumption',
      data: {
        modelUsage: data.aiSummary.modelUsage,
        totalTokens: data.aiSummary.totalTokensUsed,
        averageLatency: data.aiSummary.averageLatencyMs,
      },
      charts: [
        {
          type: 'pie',
          title: 'Usage by Model',
          data: Object.entries(data.aiSummary.modelUsage).map(([model, count]) => ({
            model,
            count,
          })),
          xKey: 'model',
          yKey: 'count',
        },
        {
          type: 'bar',
          title: 'Decision Types',
          data: Object.entries(data.aiSummary.decisionsByType).map(([type, count]) => ({
            type,
            count,
          })),
          xKey: 'type',
          yKey: 'count',
        },
      ],
    });
  }

  if (reportType === 'decision_audit' || reportType === 'comprehensive') {
    sections.push({
      id: 'decision_audit',
      title: 'AI Decision Audit',
      description: 'Audit trail of all AI-powered decisions',
      data: {
        totalDecisions: data.aiSummary.totalDecisions,
        byType: data.aiSummary.decisionsByType,
        averageConfidence: data.aiSummary.averageConfidence,
      },
      tables: [
        {
          title: 'Recent AI Decisions',
          headers: ['Time', 'Type', 'Model', 'Confidence', 'Latency'],
          rows: data.aiDecisions.slice(0, 20).map((d) => [
            d.timestamp.toISOString(),
            d.decisionType,
            d.model,
            d.confidence ? `${(d.confidence * 100).toFixed(1)}%` : 'N/A',
            `${d.latencyMs}ms`,
          ]),
        },
      ],
    });
  }

  if (reportType === 'automated_actions' || reportType === 'comprehensive') {
    sections.push({
      id: 'automated_actions',
      title: 'Automated Actions',
      description: 'Summary of automated system actions and their outcomes',
      data: {
        totalActions: data.actionSummary.totalActions,
        byType: data.actionSummary.actionsByType,
        byStatus: data.actionSummary.actionsByStatus,
        successRate: data.actionSummary.successRate,
        rollbackCount: data.actionSummary.rollbackCount,
      },
      charts: [
        {
          type: 'bar',
          title: 'Actions by Status',
          data: Object.entries(data.actionSummary.actionsByStatus).map(([status, count]) => ({
            status,
            count,
          })),
          xKey: 'status',
          yKey: 'count',
        },
      ],
    });
  }

  if (reportType === 'risk_assessment' || reportType === 'comprehensive') {
    const highImpactActions = data.automatedActions.filter(
      (a) => a.impact === 'high' || a.impact === 'critical'
    );
    const lowConfidenceDecisions = data.aiDecisions.filter(
      (d) => d.confidence !== undefined && d.confidence < 0.7
    );

    sections.push({
      id: 'risk_assessment',
      title: 'Risk Assessment',
      description: 'Analysis of high-risk AI decisions and actions',
      data: {
        highImpactActionsCount: highImpactActions.length,
        lowConfidenceDecisionsCount: lowConfidenceDecisions.length,
        failedActionsCount: data.actionSummary.actionsByStatus['failed'] || 0,
        rollbacksCount: data.actionSummary.rollbackCount,
      },
      tables: [
        {
          title: 'High Impact Actions',
          headers: ['Time', 'Action', 'Target', 'Impact', 'Status'],
          rows: highImpactActions.slice(0, 10).map((a) => [
            a.startedAt.toISOString(),
            a.actionName,
            a.targetName || a.targetId,
            a.impact,
            a.status,
          ]),
        },
      ],
    });
  }

  return sections;
}

/**
 * Calculate report summary
 */
function calculateReportSummary(
  aiSummary: Awaited<ReturnType<typeof getAuditSummary>>,
  actionSummary: Awaited<ReturnType<typeof getActionSummary>>,
  aiDecisions: AIDecisionAudit[],
  automatedActions: ActionAudit[]
): ReportSummary {
  // Calculate user engagement
  const userQueries = new Map<string, number>();
  for (const decision of aiDecisions) {
    if (decision.userId) {
      userQueries.set(decision.userId, (userQueries.get(decision.userId) || 0) + 1);
    }
  }

  const topUsers = Array.from(userQueries.entries())
    .map(([userId, queryCount]) => ({ userId, queryCount }))
    .sort((a, b) => b.queryCount - a.queryCount)
    .slice(0, 10);

  // Calculate token usage by model
  const tokensByModel: Record<string, number> = {};
  for (const decision of aiDecisions) {
    tokensByModel[decision.model] =
      (tokensByModel[decision.model] || 0) + decision.tokensUsed.total;
  }

  // Calculate risk metrics
  const highImpactDecisions = automatedActions.filter(
    (a) => a.impact === 'high' || a.impact === 'critical'
  ).length;
  const lowConfidenceDecisions = aiDecisions.filter(
    (d) => d.confidence !== undefined && d.confidence < 0.7
  ).length;
  const failedActions = actionSummary.actionsByStatus['failed'] || 0;

  return {
    totalAIDecisions: aiSummary.totalDecisions,
    totalAutomatedActions: actionSummary.totalActions,
    modelUsage: aiSummary.modelUsage,
    decisionTypeBreakdown: aiSummary.decisionsByType,
    averageConfidence: aiSummary.averageConfidence,
    successRate: actionSummary.successRate,
    tokenUsage: {
      total: aiSummary.totalTokensUsed,
      byModel: tokensByModel,
      estimatedCost: estimateTokenCost(aiSummary.totalTokensUsed, tokensByModel),
    },
    userEngagement: {
      uniqueUsers: aiSummary.uniqueUsers,
      averageQueriesPerUser:
        aiSummary.uniqueUsers > 0
          ? aiSummary.totalDecisions / aiSummary.uniqueUsers
          : 0,
      topUsers,
    },
    riskMetrics: {
      highImpactDecisions,
      lowConfidenceDecisions,
      failedActions,
      rollbacks: actionSummary.rollbackCount,
    },
  };
}

/**
 * Identify compliance findings
 */
function identifyComplianceFindings(
  summary: ReportSummary,
  aiDecisions: AIDecisionAudit[],
  automatedActions: ActionAudit[]
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  let findingId = 1;

  // Check for high failure rate
  if (summary.successRate < 0.9) {
    findings.push({
      id: `finding_${findingId++}`,
      severity: summary.successRate < 0.8 ? 'critical' : 'warning',
      category: 'Operations',
      title: 'High Action Failure Rate',
      description: `The automated action success rate (${(summary.successRate * 100).toFixed(1)}%) is below the expected threshold of 90%.`,
      evidence: [`Success rate: ${(summary.successRate * 100).toFixed(1)}%`],
      remediation: 'Review failed actions and implement additional validation before execution.',
      status: 'open',
    });
  }

  // Check for low confidence decisions
  if (summary.riskMetrics.lowConfidenceDecisions > summary.totalAIDecisions * 0.1) {
    findings.push({
      id: `finding_${findingId++}`,
      severity: 'warning',
      category: 'AI Quality',
      title: 'High Proportion of Low-Confidence Decisions',
      description: `${summary.riskMetrics.lowConfidenceDecisions} AI decisions (${((summary.riskMetrics.lowConfidenceDecisions / summary.totalAIDecisions) * 100).toFixed(1)}%) had confidence below 70%.`,
      evidence: [
        `Low confidence decisions: ${summary.riskMetrics.lowConfidenceDecisions}`,
        `Total decisions: ${summary.totalAIDecisions}`,
      ],
      remediation: 'Review AI prompts and context quality. Consider human review for low-confidence decisions.',
      status: 'open',
    });
  }

  // Check for high rollback rate
  if (summary.riskMetrics.rollbacks > 0 && summary.totalAutomatedActions > 0) {
    const rollbackRate = summary.riskMetrics.rollbacks / summary.totalAutomatedActions;
    if (rollbackRate > 0.05) {
      findings.push({
        id: `finding_${findingId++}`,
        severity: 'warning',
        category: 'Operations',
        title: 'Elevated Rollback Rate',
        description: `${summary.riskMetrics.rollbacks} automated actions required rollback (${(rollbackRate * 100).toFixed(1)}%).`,
        evidence: [
          `Rollbacks: ${summary.riskMetrics.rollbacks}`,
          `Rollback rate: ${(rollbackRate * 100).toFixed(1)}%`,
        ],
        remediation: 'Implement additional pre-execution validation and testing in non-production environments.',
        status: 'open',
      });
    }
  }

  // Check for data access patterns (if decisions contain sensitive data flags)
  const sensitiveDataDecisions = aiDecisions.filter(
    (d) => d.metadata?.containsSensitiveData === true
  );
  if (sensitiveDataDecisions.length > 0) {
    findings.push({
      id: `finding_${findingId++}`,
      severity: 'info',
      category: 'Data Privacy',
      title: 'Sensitive Data Processed by AI',
      description: `${sensitiveDataDecisions.length} AI decisions involved sensitive data.`,
      evidence: [`Sensitive data decisions: ${sensitiveDataDecisions.length}`],
      remediation: 'Ensure data masking is applied and review data handling procedures.',
      status: 'acknowledged',
    });
  }

  return findings;
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  summary: ReportSummary,
  findings: ComplianceFinding[]
): string[] {
  const recommendations: string[] = [];

  // Success rate recommendations
  if (summary.successRate < 0.95) {
    recommendations.push(
      'Implement additional validation checks before automated actions to improve success rate.'
    );
  }

  // Confidence recommendations
  if (summary.averageConfidence < 0.8) {
    recommendations.push(
      'Review and enhance AI prompts and context retrieval to improve decision confidence.'
    );
  }

  // Token usage recommendations
  if (summary.tokenUsage.total > 1000000) {
    recommendations.push(
      'Consider implementing response caching and prompt optimization to reduce token usage.'
    );
  }

  // Finding-based recommendations
  const criticalFindings = findings.filter((f) => f.severity === 'critical');
  if (criticalFindings.length > 0) {
    recommendations.push(
      `Address ${criticalFindings.length} critical compliance finding(s) as a priority.`
    );
  }

  // User engagement recommendations
  if (summary.userEngagement.averageQueriesPerUser < 5) {
    recommendations.push(
      'Consider AI assistant training or documentation to increase user adoption.'
    );
  }

  return recommendations;
}

/**
 * Estimate token cost
 */
function estimateTokenCost(
  totalTokens: number,
  tokensByModel: Record<string, number>
): number {
  // Simplified cost estimation (actual costs vary by model)
  const modelCosts: Record<string, number> = {
    'claude-3-opus': 0.015 / 1000,
    'claude-3-sonnet': 0.003 / 1000,
    'claude-3-haiku': 0.00025 / 1000,
    default: 0.003 / 1000,
  };

  let totalCost = 0;
  for (const [model, tokens] of Object.entries(tokensByModel)) {
    const modelKey = Object.keys(modelCosts).find((k) => model.includes(k)) || 'default';
    totalCost += tokens * modelCosts[modelKey];
  }

  return totalCost;
}

/**
 * Save report to database
 */
async function saveReport(report: AIComplianceReport): Promise<void> {
  if (!prisma) return;

  await prisma.complianceReport.create({
    data: {
      id: report.id,
      organizationId: report.organizationId,
      reportType: report.reportType,
      periodStart: report.period.start,
      periodEnd: report.period.end,
      generatedAt: report.generatedAt,
      generatedBy: report.generatedBy,
      version: report.version,
      sections: report.sections as unknown as Record<string, unknown>,
      summary: report.summary as unknown as Record<string, unknown>,
      findings: report.findings as unknown as Record<string, unknown>[],
      recommendations: report.recommendations,
      metadata: report.metadata,
    },
  });
}

/**
 * Get report by ID
 */
export async function getReport(reportId: string): Promise<AIComplianceReport | null> {
  if (!prisma) return null;

  const record = await prisma.complianceReport.findUnique({
    where: { id: reportId },
  });

  if (!record) return null;

  return {
    id: record.id,
    organizationId: record.organizationId,
    reportType: record.reportType as ReportType,
    period: {
      start: record.periodStart,
      end: record.periodEnd,
    },
    generatedAt: record.generatedAt,
    generatedBy: record.generatedBy,
    version: record.version,
    sections: record.sections as unknown as ReportSection[],
    summary: record.summary as unknown as ReportSummary,
    findings: record.findings as unknown as ComplianceFinding[],
    recommendations: record.recommendations,
    metadata: record.metadata as Record<string, unknown>,
  };
}

/**
 * List reports for organization
 */
export async function listReports(
  organizationId: string,
  options?: {
    reportType?: ReportType;
    limit?: number;
    offset?: number;
  }
): Promise<AIComplianceReport[]> {
  if (!prisma) return [];

  const records = await prisma.complianceReport.findMany({
    where: {
      organizationId,
      ...(options?.reportType && { reportType: options.reportType }),
    },
    orderBy: { generatedAt: 'desc' },
    take: options?.limit || 20,
    skip: options?.offset || 0,
  });

  return records.map((record) => ({
    id: record.id,
    organizationId: record.organizationId,
    reportType: record.reportType as ReportType,
    period: {
      start: record.periodStart,
      end: record.periodEnd,
    },
    generatedAt: record.generatedAt,
    generatedBy: record.generatedBy,
    version: record.version,
    sections: record.sections as unknown as ReportSection[],
    summary: record.summary as unknown as ReportSummary,
    findings: record.findings as unknown as ComplianceFinding[],
    recommendations: record.recommendations,
    metadata: record.metadata as Record<string, unknown>,
  }));
}

/**
 * Export report to different formats
 */
export async function exportReport(
  reportId: string,
  format: 'json' | 'pdf' | 'html' = 'json'
): Promise<string | Buffer> {
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found');

  switch (format) {
    case 'json':
      return JSON.stringify(report, null, 2);

    case 'html':
      return generateHTMLReport(report);

    case 'pdf':
      // PDF generation would require additional library
      throw new Error('PDF export not implemented');

    default:
      return JSON.stringify(report, null, 2);
  }
}

/**
 * Generate HTML report
 */
function generateHTMLReport(report: AIComplianceReport): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>AI Compliance Report - ${report.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 1px solid #ccc; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .finding { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .finding.critical { border-color: #dc3545; background: #fff5f5; }
    .finding.warning { border-color: #ffc107; background: #fffdf5; }
    .finding.info { border-color: #17a2b8; background: #f5fcff; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>AI Compliance Report</h1>
  <p><strong>Report ID:</strong> ${report.id}</p>
  <p><strong>Period:</strong> ${report.period.start.toISOString()} to ${report.period.end.toISOString()}</p>
  <p><strong>Generated:</strong> ${report.generatedAt.toISOString()}</p>

  <h2>Summary</h2>
  <div class="summary">
    <p><strong>Total AI Decisions:</strong> ${report.summary.totalAIDecisions}</p>
    <p><strong>Total Automated Actions:</strong> ${report.summary.totalAutomatedActions}</p>
    <p><strong>Success Rate:</strong> ${(report.summary.successRate * 100).toFixed(1)}%</p>
    <p><strong>Average Confidence:</strong> ${(report.summary.averageConfidence * 100).toFixed(1)}%</p>
  </div>

  <h2>Findings</h2>
  ${report.findings.map((f) => `
    <div class="finding ${f.severity}">
      <h3>${f.title}</h3>
      <p><strong>Severity:</strong> ${f.severity}</p>
      <p>${f.description}</p>
      <p><strong>Remediation:</strong> ${f.remediation}</p>
    </div>
  `).join('')}

  <h2>Recommendations</h2>
  <ul>
    ${report.recommendations.map((r) => `<li>${r}</li>`).join('')}
  </ul>
</body>
</html>
  `;
}

// Export types
export type {
  AIComplianceReport,
  ReportType,
  ReportSection,
  ReportSummary,
  ComplianceFinding,
  ReportOptions,
};

export default {
  initializeComplianceReportService,
  generateAIComplianceReport,
  getReport,
  listReports,
  exportReport,
};
