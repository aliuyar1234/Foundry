/**
 * Command Center API Client
 * Frontend API client for Command Center services
 */

const API_BASE = '/api/command-center';

// ============================================================
// Types
// ============================================================

export interface AggregatedMetrics {
  timestamp: string;
  organizationId: string;
  overview: OverviewMetrics;
  workload: WorkloadMetrics;
  routing: RoutingMetrics;
  compliance: ComplianceMetrics;
  health: HealthMetrics;
}

export interface OverviewMetrics {
  activeProcesses: number;
  pendingApprovals: number;
  activeUsers: number;
  openIssues: number;
  resolvedToday: number;
  avgResponseTime: number;
}

export interface WorkloadMetrics {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  avgWorkloadScore: number;
  highWorkloadUsers: number;
  burnoutRiskCount: number;
  distribution: {
    department: string;
    count: number;
    avgWorkload: number;
  }[];
}

export interface RoutingMetrics {
  totalRoutedToday: number;
  successRate: number;
  avgConfidence: number;
  manualOverrides: number;
  topCategories: {
    category: string;
    count: number;
    successRate: number;
  }[];
}

export interface ComplianceMetrics {
  totalRules: number;
  compliantPercentage: number;
  violations: number;
  pendingReview: number;
  upcomingDeadlines: number;
  riskScore: number;
}

export interface HealthMetrics {
  overallScore: number;
  processHealth: number;
  systemHealth: number;
  dataHealth: number;
  integrationHealth: number;
  bottlenecks: BottleneckInfo[];
}

export interface BottleneckInfo {
  type: 'process' | 'person' | 'system' | 'integration';
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  affectedCount: number;
}

export interface Alert {
  id: string;
  organizationId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  source: {
    type: string;
    id?: string;
    name: string;
  };
  impact: {
    businessImpact: string;
    affectedUsers: number;
    affectedProcesses: number;
    slaRisk: boolean;
  };
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  escalationLevel: number;
  actions: { type: string; label: string; url?: string }[];
  priorityScore?: number;
  priorityRank?: number;
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'suppressed';
export type AlertCategory =
  | 'workload'
  | 'process'
  | 'compliance'
  | 'integration'
  | 'performance'
  | 'security'
  | 'deadline'
  | 'capacity';

export interface AlertStats {
  total: number;
  active: number;
  acknowledged: number;
  resolved: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<AlertCategory, number>;
  avgResolutionTime: number;
}

export interface DrillDownResult {
  metricId: string;
  metricType: string;
  title: string;
  summary: {
    currentValue: number | string;
    unit?: string;
    trend: 'up' | 'down' | 'stable';
    trendValue: number;
    trendPeriod: string;
    status: 'good' | 'warning' | 'critical';
    statusMessage: string;
  };
  details: {
    breakdown: { id: string; name: string; value: number; percentage: number }[];
    timeline: { timestamp: string; value: number }[];
    insights: { type: string; title: string; description: string }[];
  };
  suggestedActions: { id: string; title: string; priority: string }[];
  breadcrumbs: { level: number; title: string; isCurrent: boolean }[];
}

export interface TrendAnalysis {
  organizationId: string;
  timestamp: string;
  timeRange: {
    start: string;
    end: string;
    granularity: string;
  };
  metrics: MetricTrend[];
  patterns: TrendPattern[];
  predictions: TrendPrediction[];
  anomalies: TrendAnomaly[];
}

export interface MetricTrend {
  metricId: string;
  metricName: string;
  category: string;
  dataPoints: { timestamp: string; value: number }[];
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  changePercent: number;
}

export interface TrendPattern {
  id: string;
  type: string;
  description: string;
  confidence: number;
}

export interface TrendPrediction {
  metricId: string;
  metricName: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  direction: 'up' | 'down' | 'stable';
}

export interface TrendAnomaly {
  id: string;
  metricId: string;
  timestamp: string;
  expectedValue: number;
  actualValue: number;
  severity: string;
}

export interface Widget {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; width: number; height: number };
  size: 'small' | 'medium' | 'large' | 'full';
  isVisible: boolean;
  refreshInterval?: number;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: Widget[];
  isDefault: boolean;
}

export interface Bottleneck {
  id: string;
  type: string;
  severity: string;
  name: string;
  description: string;
  metrics: {
    queueLength: number;
    avgWaitTime: number;
    throughput: number;
    trend: string;
  };
  impact: {
    affectedProcesses: number;
    affectedUsers: number;
    estimatedDelay: number;
  };
  recommendations: string[];
}

// ============================================================
// API Functions
// ============================================================

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

// Overview & Metrics

export async function getOverview(
  options: { refresh?: boolean; timeRange?: 'hour' | 'day' | 'week' | 'month' } = {}
): Promise<AggregatedMetrics> {
  const params = new URLSearchParams();
  if (options.refresh) params.set('refresh', 'true');
  if (options.timeRange) params.set('timeRange', options.timeRange);

  return fetchApi(`/overview?${params}`);
}

export async function getMetrics(
  category?: string,
  timeRange: 'day' | 'week' | 'month' = 'week'
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ timeRange });
  if (category) params.set('category', category);

  return fetchApi(`/metrics?${params}`);
}

// Alerts

export async function getAlerts(options: {
  status?: AlertStatus[];
  severity?: AlertSeverity[];
  category?: AlertCategory[];
  limit?: number;
  offset?: number;
  prioritize?: boolean;
} = {}): Promise<{ alerts: Alert[]; total: number }> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status.join(','));
  if (options.severity) params.set('severity', options.severity.join(','));
  if (options.category) params.set('category', options.category.join(','));
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());
  if (options.prioritize === false) params.set('prioritize', 'false');

  return fetchApi(`/alerts?${params}`);
}

export async function getAlert(alertId: string): Promise<Alert> {
  return fetchApi(`/alerts/${alertId}`);
}

export async function createAlert(
  alert: Partial<Alert>
): Promise<Alert> {
  return fetchApi('/alerts', {
    method: 'POST',
    body: JSON.stringify(alert),
  });
}

export async function acknowledgeAlert(alertId: string): Promise<Alert> {
  return fetchApi(`/alerts/${alertId}/acknowledge`, { method: 'POST' });
}

export async function resolveAlert(
  alertId: string,
  notes?: string
): Promise<Alert> {
  return fetchApi(`/alerts/${alertId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function getAlertStats(
  timeRange: 'day' | 'week' | 'month' = 'week'
): Promise<AlertStats> {
  return fetchApi(`/alerts/stats?timeRange=${timeRange}`);
}

// Drill-Down

export async function getDrillDown(
  metricId: string,
  metricType: string,
  depth: 'summary' | 'detailed' | 'full' = 'detailed'
): Promise<DrillDownResult> {
  const params = new URLSearchParams({ type: metricType, depth });
  return fetchApi(`/drill-down/${metricId}?${params}`);
}

// Trends

export async function getTrends(options: {
  timeRange?: 'day' | 'week' | 'month' | 'quarter';
  metrics?: string[];
  patterns?: boolean;
  predictions?: boolean;
  anomalies?: boolean;
} = {}): Promise<TrendAnalysis> {
  const params = new URLSearchParams();
  if (options.timeRange) params.set('timeRange', options.timeRange);
  if (options.metrics) params.set('metrics', options.metrics.join(','));
  if (options.patterns === false) params.set('patterns', 'false');
  if (options.predictions === false) params.set('predictions', 'false');
  if (options.anomalies === false) params.set('anomalies', 'false');

  return fetchApi(`/trends?${params}`);
}

// Widgets

export async function getWidgets(shared: boolean = false): Promise<Widget[]> {
  const params = shared ? '?shared=true' : '';
  return fetchApi(`/widgets${params}`);
}

export async function createWidget(widget: Partial<Widget>): Promise<Widget> {
  return fetchApi('/widgets', {
    method: 'POST',
    body: JSON.stringify(widget),
  });
}

export async function updateWidget(
  widgetId: string,
  updates: Partial<Widget>
): Promise<Widget> {
  return fetchApi(`/widgets/${widgetId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteWidget(widgetId: string): Promise<void> {
  return fetchApi(`/widgets/${widgetId}`, { method: 'DELETE' });
}

export async function updateWidgetPositions(
  positions: { id: string; position: Widget['position'] }[]
): Promise<void> {
  return fetchApi('/widgets/positions', {
    method: 'PUT',
    body: JSON.stringify({ positions }),
  });
}

export async function getWidgetTemplates(): Promise<{
  type: string;
  name: string;
  description: string;
  category: string;
}[]> {
  return fetchApi('/widgets/templates');
}

// Layouts

export async function getDashboardLayout(layoutId?: string): Promise<DashboardLayout> {
  const params = layoutId ? `?id=${layoutId}` : '';
  return fetchApi(`/layouts${params}`);
}

export async function saveDashboardLayout(
  layout: Partial<DashboardLayout>
): Promise<DashboardLayout> {
  return fetchApi('/layouts', {
    method: 'POST',
    body: JSON.stringify(layout),
  });
}

export async function getLayoutPresets(): Promise<{
  id: string;
  name: string;
  description: string;
}[]> {
  return fetchApi('/layouts/presets');
}

// Bottlenecks

export async function getBottlenecks(options: {
  types?: string[];
  minSeverity?: string;
} = {}): Promise<{
  totalBottlenecks: number;
  criticalCount: number;
  highCount: number;
  bottlenecks: Bottleneck[];
}> {
  const params = new URLSearchParams();
  if (options.types) params.set('types', options.types.join(','));
  if (options.minSeverity) params.set('minSeverity', options.minSeverity);

  return fetchApi(`/bottlenecks?${params}`);
}

// Thresholds

export async function getThresholdRules(enabledOnly: boolean = true): Promise<unknown[]> {
  return fetchApi(`/thresholds?enabled=${enabledOnly}`);
}

export async function createThresholdRule(rule: unknown): Promise<unknown> {
  return fetchApi('/thresholds', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function getThresholdTemplates(): Promise<unknown[]> {
  return fetchApi('/thresholds/templates');
}

// SSE Stream

export function subscribeToUpdates(
  channels: string[] = ['metrics', 'alerts'],
  onMessage: (event: { type: string; data: unknown }) => void,
  onError?: (error: Event) => void
): EventSource {
  const params = new URLSearchParams({ channels: channels.join(',') });
  const eventSource = new EventSource(`${API_BASE}/stream?${params}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage({ type: 'message', data });
    } catch {
      console.error('Failed to parse SSE message');
    }
  };

  // Handle specific event types
  const eventTypes = [
    'connected',
    'heartbeat',
    'metrics_update',
    'alert_created',
    'alert_updated',
    'alert_resolved',
    'alerts_update',
    'workload_update',
    'bottleneck_update',
  ];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        onMessage({ type, data });
      } catch {
        console.error(`Failed to parse ${type} event`);
      }
    });
  }

  if (onError) {
    eventSource.onerror = onError;
  }

  return eventSource;
}

export default {
  getOverview,
  getMetrics,
  getAlerts,
  getAlert,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  getAlertStats,
  getDrillDown,
  getTrends,
  getWidgets,
  createWidget,
  updateWidget,
  deleteWidget,
  updateWidgetPositions,
  getWidgetTemplates,
  getDashboardLayout,
  saveDashboardLayout,
  getLayoutPresets,
  getBottlenecks,
  getThresholdRules,
  createThresholdRule,
  getThresholdTemplates,
  subscribeToUpdates,
};
