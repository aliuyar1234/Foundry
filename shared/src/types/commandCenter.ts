/**
 * Command Center Types for OPERATE Tier
 * T026 - Define DashboardWidget types
 */

// =============================================================================
// Dashboard Widget Types
// =============================================================================

export type WidgetType =
  | 'metric'
  | 'chart'
  | 'alert_list'
  | 'process_health'
  | 'team_workload'
  | 'routing_accuracy'
  | 'compliance_status'
  | 'trend'
  | 'activity_feed'
  | 'custom';

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  userId: string;
  widgetType: WidgetType;
  title: string;
  config: WidgetConfig;
  position: WidgetPosition;
  refreshInterval: number; // seconds
  isVisible: boolean;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WidgetConfig =
  | MetricWidgetConfig
  | ChartWidgetConfig
  | AlertListWidgetConfig
  | ProcessHealthWidgetConfig
  | TeamWorkloadWidgetConfig
  | RoutingAccuracyWidgetConfig
  | ComplianceStatusWidgetConfig
  | TrendWidgetConfig
  | ActivityFeedWidgetConfig
  | CustomWidgetConfig;

// =============================================================================
// Widget Configuration Types
// =============================================================================

export interface MetricWidgetConfig {
  type: 'metric';
  metricId: string;
  metricName: string;
  unit?: string;
  format?: 'number' | 'percentage' | 'currency' | 'duration';
  thresholds?: {
    warning: number;
    critical: number;
  };
  comparison?: {
    type: 'previous_period' | 'target' | 'baseline';
    value?: number;
  };
  sparkline?: boolean;
}

export interface ChartWidgetConfig {
  type: 'chart';
  chartType: 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'heatmap';
  dataSource: ChartDataSource;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  legend?: boolean;
  stacked?: boolean;
  colors?: string[];
}

export interface ChartDataSource {
  type: 'metric' | 'query' | 'aggregation';
  metricIds?: string[];
  query?: string;
  aggregation?: {
    field: string;
    function: 'count' | 'sum' | 'avg' | 'min' | 'max';
    groupBy?: string;
  };
  timeRange: TimeRange;
}

export interface AxisConfig {
  label?: string;
  min?: number;
  max?: number;
  format?: string;
}

export interface TimeRange {
  type: 'relative' | 'absolute';
  relative?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  absolute?: {
    start: Date;
    end: Date;
  };
}

export interface AlertListWidgetConfig {
  type: 'alert_list';
  maxItems: number;
  severities: ('info' | 'warning' | 'critical')[];
  categories?: string[];
  showAcknowledged: boolean;
}

export interface ProcessHealthWidgetConfig {
  type: 'process_health';
  processIds?: string[]; // Empty = all processes
  showMetrics: ('throughput' | 'cycle_time' | 'error_rate' | 'bottlenecks')[];
  sortBy: 'health_score' | 'volume' | 'issues';
  maxItems: number;
}

export interface TeamWorkloadWidgetConfig {
  type: 'team_workload';
  teamId?: string; // Empty = all teams
  showMetrics: ('workload' | 'burnout_risk' | 'capacity' | 'response_time')[];
  showIndividuals: boolean;
  maxItems: number;
}

export interface RoutingAccuracyWidgetConfig {
  type: 'routing_accuracy';
  timeRange: TimeRange;
  showByRequestType: boolean;
  showByHandler: boolean;
  includeEscalations: boolean;
}

export interface ComplianceStatusWidgetConfig {
  type: 'compliance_status';
  frameworks?: string[];
  showViolations: boolean;
  showDeadlines: boolean;
  showScore: boolean;
}

export interface TrendWidgetConfig {
  type: 'trend';
  metricId: string;
  metricName: string;
  timeRange: TimeRange;
  granularity: 'hour' | 'day' | 'week' | 'month';
  showForecast: boolean;
  showAnomaly: boolean;
}

export interface ActivityFeedWidgetConfig {
  type: 'activity_feed';
  activityTypes: string[];
  maxItems: number;
  showUser: boolean;
}

export interface CustomWidgetConfig {
  type: 'custom';
  componentName: string;
  props: Record<string, unknown>;
}

// =============================================================================
// Dashboard Types
// =============================================================================

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isShared: boolean;
  sharedWith?: string[]; // User IDs or 'all'
  layout: DashboardLayout;
  userId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  compactType: 'vertical' | 'horizontal' | null;
}

export interface DashboardPreset {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  widgets: Omit<DashboardWidget, 'id' | 'dashboardId' | 'userId' | 'organizationId' | 'createdAt' | 'updatedAt'>[];
  layout: DashboardLayout;
}

// =============================================================================
// Command Center Overview Types
// =============================================================================

export interface CommandCenterOverview {
  timestamp: Date;
  organizationId: string;

  // Overall health
  healthScore: number; // 0-100
  healthTrend: 'improving' | 'stable' | 'declining';

  // Key metrics
  activeProcesses: number;
  activeAlerts: number;
  criticalAlerts: number;
  pendingApprovals: number;

  // Routing metrics
  routingAccuracy: number;
  avgRoutingTime: number;

  // Workload metrics
  avgTeamWorkload: number;
  highRiskPersonCount: number;

  // Compliance metrics
  complianceScore: number;
  openViolations: number;

  // Trend data
  trends: {
    metric: string;
    direction: 'up' | 'down' | 'stable';
    percentChange: number;
  }[];
}

// =============================================================================
// Alert Types
// =============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory =
  | 'process'
  | 'routing'
  | 'workload'
  | 'compliance'
  | 'integration'
  | 'system';

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  source: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  isAcknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  organizationId: string;
  createdAt: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  category: AlertCategory;
  notifyChannels: ('in_app' | 'email' | 'slack')[];
  notifyRoles: string[];
  isActive: boolean;
  cooldownMinutes: number; // Don't re-alert within this period
  organizationId: string;
}

export interface AlertCondition {
  type: 'threshold' | 'pattern' | 'absence';
  metric?: string;
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value?: number;
  pattern?: string;
  durationMinutes?: number;
}

// =============================================================================
// Drill-Down Types
// =============================================================================

export interface DrillDownRequest {
  metricId: string;
  dimensions?: string[];
  filters?: Record<string, unknown>;
  timeRange: TimeRange;
}

export interface DrillDownResult {
  metricId: string;
  metricName: string;
  currentValue: number;
  breakdown: DrillDownBreakdown[];
  rootCauses?: RootCause[];
  recommendations?: string[];
}

export interface DrillDownBreakdown {
  dimension: string;
  value: string;
  contribution: number; // percentage
  trend: 'up' | 'down' | 'stable';
  details?: Record<string, unknown>;
}

export interface RootCause {
  description: string;
  confidence: number;
  affectedEntities: string[];
  suggestedAction?: string;
}

// =============================================================================
// Real-Time Update Types
// =============================================================================

export interface RealTimeUpdate {
  type: 'metric' | 'alert' | 'status';
  timestamp: Date;
  data: MetricUpdate | AlertUpdate | StatusUpdate;
}

export interface MetricUpdate {
  metricId: string;
  value: number;
  previousValue?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface AlertUpdate {
  action: 'created' | 'acknowledged' | 'resolved';
  alert: Alert;
}

export interface StatusUpdate {
  entityType: string;
  entityId: string;
  status: string;
  previousStatus?: string;
}
