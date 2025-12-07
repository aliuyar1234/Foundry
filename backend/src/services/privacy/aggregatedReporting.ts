/**
 * Works Council (Betriebsrat) Compatible Reporting
 * Provides aggregated, anonymized reports that comply with German works council requirements
 * T298 - Works council compatible reporting
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AggregationConfig {
  minGroupSize: number; // Minimum individuals before data can be shown (default: 5 for k-anonymity)
  aggregationLevel: 'team' | 'department' | 'division' | 'organization';
  excludeFields: string[];
  roundingPrecision: number;
  suppressSmallGroups: boolean;
}

export interface AggregatedMetric {
  name: string;
  value: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  comparisonPeriod?: string;
  suppressed?: boolean;
  reason?: string;
}

export interface AggregatedReport {
  id: string;
  organizationId: string;
  reportType: ReportType;
  title: string;
  description: string;
  period: { start: Date; end: Date };
  aggregationLevel: string;
  metrics: AggregatedMetric[];
  groups: AggregatedGroup[];
  methodology: string;
  generatedAt: Date;
  generatedBy: string;
  approvalStatus: 'draft' | 'pending_review' | 'approved' | 'rejected';
  worksCouncilApproved?: boolean;
}

export interface AggregatedGroup {
  name: string;
  memberCount: number;
  metrics: AggregatedMetric[];
  subgroups?: AggregatedGroup[];
  suppressed?: boolean;
}

export type ReportType =
  | 'workload_analysis'
  | 'communication_patterns'
  | 'collaboration_metrics'
  | 'tool_usage'
  | 'meeting_statistics'
  | 'response_time_analysis'
  | 'custom';

export interface WorksCouncilReportRequest {
  reportType: ReportType;
  period: { start: Date; end: Date };
  aggregationLevel: 'team' | 'department' | 'division' | 'organization';
  includeMetrics: string[];
  excludeMetrics?: string[];
  customTitle?: string;
  requestedBy: string;
  justification?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  reportType: ReportType;
  defaultMetrics: string[];
  requiredAggregationLevel: 'team' | 'department' | 'division' | 'organization';
  minGroupSize: number;
  worksCouncilApproved: boolean;
}

// Default configuration for works council compliance
const DEFAULT_CONFIG: AggregationConfig = {
  minGroupSize: 5, // k-anonymity requirement
  aggregationLevel: 'department',
  excludeFields: [
    'userId',
    'email',
    'name',
    'personalId',
    'employeeId',
    'ipAddress',
  ],
  roundingPrecision: 1,
  suppressSmallGroups: true,
};

// Pre-approved report templates
const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'workload-dept',
    name: 'Department Workload Overview',
    description: 'Aggregated workload metrics at department level',
    reportType: 'workload_analysis',
    defaultMetrics: ['avgTasksPerDay', 'avgMeetingHours', 'avgResponseTime'],
    requiredAggregationLevel: 'department',
    minGroupSize: 5,
    worksCouncilApproved: true,
  },
  {
    id: 'collab-org',
    name: 'Organization Collaboration Patterns',
    description: 'Cross-department collaboration analysis',
    reportType: 'collaboration_metrics',
    defaultMetrics: ['crossDeptMeetings', 'sharedProjects', 'communicationVolume'],
    requiredAggregationLevel: 'organization',
    minGroupSize: 10,
    worksCouncilApproved: true,
  },
  {
    id: 'meeting-dept',
    name: 'Meeting Statistics by Department',
    description: 'Meeting patterns and efficiency metrics',
    reportType: 'meeting_statistics',
    defaultMetrics: ['avgMeetingsPerWeek', 'avgDuration', 'recurringRatio'],
    requiredAggregationLevel: 'department',
    minGroupSize: 5,
    worksCouncilApproved: true,
  },
  {
    id: 'tool-org',
    name: 'Tool Adoption Overview',
    description: 'Aggregated tool usage across organization',
    reportType: 'tool_usage',
    defaultMetrics: ['activeUsers', 'adoptionRate', 'featureUsage'],
    requiredAggregationLevel: 'organization',
    minGroupSize: 10,
    worksCouncilApproved: true,
  },
];

/**
 * Get aggregation configuration for an organization
 */
export async function getAggregationConfig(
  organizationId: string
): Promise<AggregationConfig> {
  const config = await prisma.privacyConfig.findUnique({
    where: { organizationId },
  });

  if (!config?.aggregationConfig) {
    return DEFAULT_CONFIG;
  }

  const stored = config.aggregationConfig as Record<string, unknown>;

  return {
    minGroupSize: (stored.minGroupSize as number) ?? DEFAULT_CONFIG.minGroupSize,
    aggregationLevel:
      (stored.aggregationLevel as AggregationConfig['aggregationLevel']) ??
      DEFAULT_CONFIG.aggregationLevel,
    excludeFields:
      (stored.excludeFields as string[]) ?? DEFAULT_CONFIG.excludeFields,
    roundingPrecision:
      (stored.roundingPrecision as number) ?? DEFAULT_CONFIG.roundingPrecision,
    suppressSmallGroups:
      (stored.suppressSmallGroups as boolean) ?? DEFAULT_CONFIG.suppressSmallGroups,
  };
}

/**
 * Update aggregation configuration
 */
export async function updateAggregationConfig(
  organizationId: string,
  config: Partial<AggregationConfig>
): Promise<AggregationConfig> {
  const existing = await getAggregationConfig(organizationId);
  const updated = { ...existing, ...config };

  // Enforce minimum group size for works council compliance
  if (updated.minGroupSize < 5) {
    updated.minGroupSize = 5;
  }

  await prisma.privacyConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      aggregationConfig: updated as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    },
    update: {
      aggregationConfig: updated as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    },
  });

  return updated;
}

/**
 * Get available report templates
 */
export function getReportTemplates(): ReportTemplate[] {
  return REPORT_TEMPLATES;
}

/**
 * Get a specific report template
 */
export function getReportTemplate(templateId: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Generate aggregated report for works council
 */
export async function generateWorksCouncilReport(
  organizationId: string,
  request: WorksCouncilReportRequest
): Promise<AggregatedReport> {
  const config = await getAggregationConfig(organizationId);

  // Validate aggregation level
  validateAggregationLevel(request.aggregationLevel, config);

  // Get raw data based on report type
  const rawData = await fetchReportData(organizationId, request);

  // Aggregate data
  const aggregatedGroups = await aggregateData(rawData, request, config);

  // Calculate metrics
  const metrics = calculateOverallMetrics(aggregatedGroups, request.includeMetrics);

  // Generate report
  const report: AggregatedReport = {
    id: generateReportId(),
    organizationId,
    reportType: request.reportType,
    title: request.customTitle || getDefaultTitle(request.reportType),
    description: getReportDescription(request.reportType),
    period: request.period,
    aggregationLevel: request.aggregationLevel,
    metrics,
    groups: aggregatedGroups,
    methodology: generateMethodologyText(config),
    generatedAt: new Date(),
    generatedBy: request.requestedBy,
    approvalStatus: 'draft',
    worksCouncilApproved: false,
  };

  // Store report
  await storeReport(report);

  return report;
}

/**
 * Get reports for an organization
 */
export async function getReports(
  organizationId: string,
  options?: {
    reportType?: ReportType;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }
): Promise<AggregatedReport[]> {
  const where: Record<string, unknown> = { organizationId };

  if (options?.reportType) {
    where.reportType = options.reportType;
  }

  if (options?.status) {
    where.approvalStatus = options.status;
  }

  if (options?.fromDate || options?.toDate) {
    where.generatedAt = {};
    if (options.fromDate) {
      (where.generatedAt as Record<string, Date>).gte = options.fromDate;
    }
    if (options.toDate) {
      (where.generatedAt as Record<string, Date>).lte = options.toDate;
    }
  }

  const reports = await prisma.aggregatedReport.findMany({
    where,
    orderBy: { generatedAt: 'desc' },
    take: options?.limit || 50,
  });

  return reports.map(transformReport);
}

/**
 * Get a specific report
 */
export async function getReport(
  organizationId: string,
  reportId: string
): Promise<AggregatedReport | null> {
  const report = await prisma.aggregatedReport.findFirst({
    where: {
      id: reportId,
      organizationId,
    },
  });

  return report ? transformReport(report) : null;
}

/**
 * Update report approval status
 */
export async function updateReportStatus(
  organizationId: string,
  reportId: string,
  status: 'pending_review' | 'approved' | 'rejected',
  worksCouncilApproved?: boolean
): Promise<AggregatedReport> {
  const report = await prisma.aggregatedReport.update({
    where: { id: reportId },
    data: {
      approvalStatus: status,
      worksCouncilApproved: worksCouncilApproved ?? undefined,
      updatedAt: new Date(),
    },
  });

  return transformReport(report);
}

/**
 * Generate workload analysis report
 */
export async function generateWorkloadReport(
  organizationId: string,
  period: { start: Date; end: Date },
  aggregationLevel: 'team' | 'department' | 'division' | 'organization'
): Promise<AggregatedReport> {
  return generateWorksCouncilReport(organizationId, {
    reportType: 'workload_analysis',
    period,
    aggregationLevel,
    includeMetrics: [
      'avgTasksPerDay',
      'avgMeetingHours',
      'avgResponseTime',
      'overtimeIndicator',
      'focusTimeRatio',
    ],
    requestedBy: 'system',
  });
}

/**
 * Generate meeting statistics report
 */
export async function generateMeetingReport(
  organizationId: string,
  period: { start: Date; end: Date },
  aggregationLevel: 'team' | 'department' | 'division' | 'organization'
): Promise<AggregatedReport> {
  return generateWorksCouncilReport(organizationId, {
    reportType: 'meeting_statistics',
    period,
    aggregationLevel,
    includeMetrics: [
      'avgMeetingsPerWeek',
      'avgDuration',
      'recurringRatio',
      'afterHoursRatio',
      'avgParticipants',
    ],
    requestedBy: 'system',
  });
}

/**
 * Generate collaboration metrics report
 */
export async function generateCollaborationReport(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<AggregatedReport> {
  return generateWorksCouncilReport(organizationId, {
    reportType: 'collaboration_metrics',
    period,
    aggregationLevel: 'organization',
    includeMetrics: [
      'crossDeptCollaboration',
      'communicationDensity',
      'responseLatency',
      'teamCohesion',
    ],
    requestedBy: 'system',
  });
}

/**
 * Check if data can be shown (k-anonymity check)
 */
export function checkKAnonymity(
  groupSize: number,
  minGroupSize: number
): { canShow: boolean; reason?: string } {
  if (groupSize >= minGroupSize) {
    return { canShow: true };
  }

  return {
    canShow: false,
    reason: `Group size (${groupSize}) is below minimum threshold (${minGroupSize}) for privacy protection`,
  };
}

/**
 * Suppress small groups in aggregated data
 */
export function suppressSmallGroups(
  groups: AggregatedGroup[],
  minGroupSize: number
): AggregatedGroup[] {
  return groups.map((group) => {
    const check = checkKAnonymity(group.memberCount, minGroupSize);

    if (!check.canShow) {
      return {
        ...group,
        metrics: group.metrics.map((m) => ({
          ...m,
          value: 0,
          suppressed: true,
          reason: check.reason,
        })),
        suppressed: true,
        subgroups: group.subgroups
          ? suppressSmallGroups(group.subgroups, minGroupSize)
          : undefined,
      };
    }

    return {
      ...group,
      subgroups: group.subgroups
        ? suppressSmallGroups(group.subgroups, minGroupSize)
        : undefined,
    };
  });
}

/**
 * Round values for privacy (prevents re-identification through precise values)
 */
export function roundForPrivacy(
  value: number,
  precision: number
): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Add noise to aggregated values (differential privacy)
 */
export function addDifferentialPrivacyNoise(
  value: number,
  epsilon: number = 0.1,
  sensitivity: number = 1
): number {
  // Laplace mechanism
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + noise;
}

// Helper functions

function validateAggregationLevel(
  level: string,
  config: AggregationConfig
): void {
  const levels = ['team', 'department', 'division', 'organization'];
  const configIndex = levels.indexOf(config.aggregationLevel);
  const requestIndex = levels.indexOf(level);

  if (requestIndex < configIndex) {
    throw new Error(
      `Aggregation level '${level}' is more granular than allowed ('${config.aggregationLevel}')`
    );
  }
}

async function fetchReportData(
  organizationId: string,
  request: WorksCouncilReportRequest
): Promise<Array<Record<string, unknown>>> {
  // Fetch data based on report type
  // In production, this would query various data sources

  switch (request.reportType) {
    case 'workload_analysis':
      return fetchWorkloadData(organizationId, request.period);
    case 'meeting_statistics':
      return fetchMeetingData(organizationId, request.period);
    case 'communication_patterns':
      return fetchCommunicationData(organizationId, request.period);
    case 'collaboration_metrics':
      return fetchCollaborationData(organizationId, request.period);
    case 'tool_usage':
      return fetchToolUsageData(organizationId, request.period);
    default:
      return [];
  }
}

async function fetchWorkloadData(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<Array<Record<string, unknown>>> {
  // Placeholder - in production, query actual workload data
  const events = await prisma.metadataEvent.findMany({
    where: {
      organizationId,
      timestamp: {
        gte: period.start,
        lte: period.end,
      },
    },
    select: {
      metadata: true,
      eventType: true,
      sourceType: true,
    },
  });

  return events.map((e) => ({
    ...e.metadata as Record<string, unknown>,
    eventType: e.eventType,
    sourceType: e.sourceType,
  }));
}

async function fetchMeetingData(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<Array<Record<string, unknown>>> {
  const events = await prisma.metadataEvent.findMany({
    where: {
      organizationId,
      eventType: 'meeting',
      timestamp: {
        gte: period.start,
        lte: period.end,
      },
    },
    select: {
      metadata: true,
    },
  });

  return events.map((e) => e.metadata as Record<string, unknown>);
}

async function fetchCommunicationData(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<Array<Record<string, unknown>>> {
  const events = await prisma.metadataEvent.findMany({
    where: {
      organizationId,
      eventType: { in: ['email', 'message', 'chat'] },
      timestamp: {
        gte: period.start,
        lte: period.end,
      },
    },
    select: {
      metadata: true,
      eventType: true,
    },
  });

  return events.map((e) => ({
    ...e.metadata as Record<string, unknown>,
    type: e.eventType,
  }));
}

async function fetchCollaborationData(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<Array<Record<string, unknown>>> {
  // Placeholder for collaboration data
  return [];
}

async function fetchToolUsageData(
  organizationId: string,
  period: { start: Date; end: Date }
): Promise<Array<Record<string, unknown>>> {
  // Placeholder for tool usage data
  return [];
}

async function aggregateData(
  rawData: Array<Record<string, unknown>>,
  request: WorksCouncilReportRequest,
  config: AggregationConfig
): Promise<AggregatedGroup[]> {
  // Group data by aggregation level
  const grouped = new Map<string, Array<Record<string, unknown>>>();

  for (const item of rawData) {
    const groupKey = getGroupKey(item, request.aggregationLevel);
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push(item);
  }

  // Calculate aggregated metrics for each group
  const groups: AggregatedGroup[] = [];

  for (const [name, items] of grouped.entries()) {
    const metrics = calculateGroupMetrics(items, request.includeMetrics, config);

    groups.push({
      name,
      memberCount: countUniqueMembers(items),
      metrics,
    });
  }

  // Apply k-anonymity suppression
  if (config.suppressSmallGroups) {
    return suppressSmallGroups(groups, config.minGroupSize);
  }

  return groups;
}

function getGroupKey(
  item: Record<string, unknown>,
  level: string
): string {
  switch (level) {
    case 'team':
      return (item.teamId as string) || (item.team as string) || 'Unknown Team';
    case 'department':
      return (item.departmentId as string) || (item.department as string) || 'Unknown Department';
    case 'division':
      return (item.divisionId as string) || (item.division as string) || 'Unknown Division';
    case 'organization':
      return 'Organization';
    default:
      return 'Unknown';
  }
}

function countUniqueMembers(items: Array<Record<string, unknown>>): number {
  const uniqueIds = new Set<string>();

  for (const item of items) {
    const id = (item.userId as string) || (item.participantId as string);
    if (id) {
      uniqueIds.add(id);
    }
  }

  return uniqueIds.size || items.length;
}

function calculateGroupMetrics(
  items: Array<Record<string, unknown>>,
  metricNames: string[],
  config: AggregationConfig
): AggregatedMetric[] {
  const metrics: AggregatedMetric[] = [];

  for (const metricName of metricNames) {
    const metric = calculateMetric(items, metricName, config);
    if (metric) {
      metrics.push(metric);
    }
  }

  return metrics;
}

function calculateMetric(
  items: Array<Record<string, unknown>>,
  metricName: string,
  config: AggregationConfig
): AggregatedMetric | null {
  const values = items
    .map((item) => item[metricName])
    .filter((v) => typeof v === 'number') as number[];

  if (values.length === 0) {
    // Calculate derived metrics
    return calculateDerivedMetric(items, metricName, config);
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  return {
    name: formatMetricName(metricName),
    value: roundForPrivacy(avg, config.roundingPrecision),
    unit: getMetricUnit(metricName),
    trend: 'stable',
  };
}

function calculateDerivedMetric(
  items: Array<Record<string, unknown>>,
  metricName: string,
  config: AggregationConfig
): AggregatedMetric | null {
  switch (metricName) {
    case 'avgMeetingsPerWeek':
      const meetingCount = items.filter((i) => i.eventType === 'meeting').length;
      return {
        name: 'Avg Meetings/Week',
        value: roundForPrivacy(meetingCount / 4, config.roundingPrecision), // Assuming 4-week period
        unit: 'meetings',
        trend: 'stable',
      };

    case 'avgDuration':
      const durations = items
        .map((i) => i.duration as number)
        .filter((d) => d !== undefined);
      if (durations.length === 0) return null;
      return {
        name: 'Avg Duration',
        value: roundForPrivacy(
          durations.reduce((a, b) => a + b, 0) / durations.length,
          config.roundingPrecision
        ),
        unit: 'minutes',
        trend: 'stable',
      };

    case 'avgParticipants':
      const participants = items
        .map((i) => i.participantCount as number)
        .filter((p) => p !== undefined);
      if (participants.length === 0) return null;
      return {
        name: 'Avg Participants',
        value: roundForPrivacy(
          participants.reduce((a, b) => a + b, 0) / participants.length,
          config.roundingPrecision
        ),
        unit: 'people',
        trend: 'stable',
      };

    default:
      return null;
  }
}

function calculateOverallMetrics(
  groups: AggregatedGroup[],
  metricNames: string[]
): AggregatedMetric[] {
  const overallMetrics: AggregatedMetric[] = [];

  for (const metricName of metricNames) {
    const groupMetrics = groups
      .flatMap((g) => g.metrics)
      .filter((m) => m.name === formatMetricName(metricName) && !m.suppressed);

    if (groupMetrics.length > 0) {
      const avgValue =
        groupMetrics.reduce((sum, m) => sum + m.value, 0) / groupMetrics.length;

      overallMetrics.push({
        name: formatMetricName(metricName),
        value: avgValue,
        unit: groupMetrics[0].unit,
        trend: 'stable',
      });
    }
  }

  return overallMetrics;
}

function formatMetricName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function getMetricUnit(metricName: string): string {
  const units: Record<string, string> = {
    avgTasksPerDay: 'tasks',
    avgMeetingHours: 'hours',
    avgResponseTime: 'minutes',
    avgMeetingsPerWeek: 'meetings',
    avgDuration: 'minutes',
    avgParticipants: 'people',
    recurringRatio: '%',
    afterHoursRatio: '%',
    focusTimeRatio: '%',
    crossDeptCollaboration: 'interactions',
    communicationDensity: 'messages',
    responseLatency: 'minutes',
    teamCohesion: 'score',
  };

  return units[metricName] || 'units';
}

function getDefaultTitle(reportType: ReportType): string {
  const titles: Record<ReportType, string> = {
    workload_analysis: 'Workload Analysis Report',
    communication_patterns: 'Communication Patterns Report',
    collaboration_metrics: 'Collaboration Metrics Report',
    tool_usage: 'Tool Usage Report',
    meeting_statistics: 'Meeting Statistics Report',
    response_time_analysis: 'Response Time Analysis Report',
    custom: 'Custom Report',
  };

  return titles[reportType] || 'Report';
}

function getReportDescription(reportType: ReportType): string {
  const descriptions: Record<ReportType, string> = {
    workload_analysis:
      'Aggregated analysis of workload patterns across the organization',
    communication_patterns:
      'Analysis of communication volume and patterns without content',
    collaboration_metrics:
      'Cross-team and cross-department collaboration indicators',
    tool_usage: 'Aggregated tool adoption and usage statistics',
    meeting_statistics:
      'Meeting frequency, duration, and participation patterns',
    response_time_analysis:
      'Response time distributions for various communication channels',
    custom: 'Custom aggregated report',
  };

  return descriptions[reportType] || '';
}

function generateMethodologyText(config: AggregationConfig): string {
  return `This report uses k-anonymity with minimum group size of ${config.minGroupSize} individuals. ` +
    `Data is aggregated at the ${config.aggregationLevel} level. ` +
    `Values are rounded to ${config.roundingPrecision} decimal places. ` +
    `Groups smaller than the minimum threshold are suppressed to protect individual privacy. ` +
    `No personally identifiable information is included in this report.`;
}

function generateReportId(): string {
  return `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function storeReport(report: AggregatedReport): Promise<void> {
  await prisma.aggregatedReport.create({
    data: {
      id: report.id,
      organizationId: report.organizationId,
      reportType: report.reportType,
      title: report.title,
      description: report.description,
      periodStart: report.period.start,
      periodEnd: report.period.end,
      aggregationLevel: report.aggregationLevel,
      metrics: report.metrics as unknown as Record<string, unknown>,
      groups: report.groups as unknown as Record<string, unknown>,
      methodology: report.methodology,
      generatedAt: report.generatedAt,
      generatedBy: report.generatedBy,
      approvalStatus: report.approvalStatus,
      worksCouncilApproved: report.worksCouncilApproved || false,
    },
  });
}

function transformReport(record: Record<string, unknown>): AggregatedReport {
  return {
    id: record.id as string,
    organizationId: record.organizationId as string,
    reportType: record.reportType as ReportType,
    title: record.title as string,
    description: record.description as string,
    period: {
      start: record.periodStart as Date,
      end: record.periodEnd as Date,
    },
    aggregationLevel: record.aggregationLevel as string,
    metrics: record.metrics as AggregatedMetric[],
    groups: record.groups as AggregatedGroup[],
    methodology: record.methodology as string,
    generatedAt: record.generatedAt as Date,
    generatedBy: record.generatedBy as string,
    approvalStatus: record.approvalStatus as AggregatedReport['approvalStatus'],
    worksCouncilApproved: record.worksCouncilApproved as boolean,
  };
}

export default {
  getAggregationConfig,
  updateAggregationConfig,
  getReportTemplates,
  getReportTemplate,
  generateWorksCouncilReport,
  getReports,
  getReport,
  updateReportStatus,
  generateWorkloadReport,
  generateMeetingReport,
  generateCollaborationReport,
  checkKAnonymity,
  suppressSmallGroups,
  roundForPrivacy,
  addDifferentialPrivacyNoise,
};
