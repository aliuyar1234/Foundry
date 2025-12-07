/**
 * Widget Service
 * T116 - Create dashboard widget service
 *
 * Manages customizable dashboard widgets for the command center
 */

import { prisma } from '../../lib/prisma';

export type WidgetType =
  | 'metric_card'
  | 'chart'
  | 'table'
  | 'alert_list'
  | 'activity_feed'
  | 'bottleneck_list'
  | 'workload_heatmap'
  | 'process_health'
  | 'quick_actions'
  | 'custom';

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export interface Widget {
  id: string;
  organizationId: string;
  userId?: string; // null for org-wide widgets
  type: WidgetType;
  title: string;
  description?: string;
  config: WidgetConfig;
  position: WidgetPosition;
  size: WidgetSize;
  isVisible: boolean;
  refreshInterval?: number; // seconds
  createdAt: Date;
  updatedAt: Date;
}

export interface WidgetConfig {
  metricId?: string;
  chartType?: 'line' | 'bar' | 'pie' | 'area' | 'donut';
  dataSource?: string;
  filters?: Record<string, unknown>;
  thresholds?: WidgetThreshold[];
  displayOptions?: DisplayOptions;
  actions?: WidgetAction[];
}

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetThreshold {
  value: number;
  color: string;
  label?: string;
}

export interface DisplayOptions {
  showTrend?: boolean;
  showComparison?: boolean;
  comparisonPeriod?: string;
  colorScheme?: string;
  animate?: boolean;
  showLegend?: boolean;
}

export interface WidgetAction {
  id: string;
  label: string;
  icon?: string;
  url?: string;
  handler?: string;
}

export interface DashboardLayout {
  id: string;
  organizationId: string;
  userId?: string;
  name: string;
  description?: string;
  widgets: Widget[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WidgetTemplate {
  type: WidgetType;
  name: string;
  description: string;
  defaultConfig: WidgetConfig;
  defaultSize: WidgetSize;
  previewImage?: string;
  category: string;
}

/**
 * Create a new widget
 */
export async function createWidget(
  input: Omit<Widget, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Widget> {
  const widget = await prisma.dashboardWidget.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      config: {
        ...input.config,
        description: input.description,
        position: input.position,
        size: input.size,
        isVisible: input.isVisible,
        refreshInterval: input.refreshInterval,
      } as Record<string, unknown>,
      position: input.position.x * 100 + input.position.y, // Encode position as single number
      size: input.size,
    },
  });

  return mapToWidget(widget);
}

/**
 * Get widget by ID
 */
export async function getWidget(widgetId: string): Promise<Widget | null> {
  const widget = await prisma.dashboardWidget.findUnique({
    where: { id: widgetId },
  });

  if (!widget) return null;
  return mapToWidget(widget);
}

/**
 * Get widgets for an organization/user
 */
export async function getWidgets(
  organizationId: string,
  userId?: string
): Promise<Widget[]> {
  const widgets = await prisma.dashboardWidget.findMany({
    where: {
      organizationId,
      ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
      type: { notIn: ['alert', 'threshold_rule'] }, // Exclude non-widget types
    },
    orderBy: { position: 'asc' },
  });

  return widgets.map(mapToWidget);
}

/**
 * Update a widget
 */
export async function updateWidget(
  widgetId: string,
  updates: Partial<Widget>
): Promise<Widget | null> {
  const existing = await prisma.dashboardWidget.findUnique({
    where: { id: widgetId },
  });

  if (!existing) return null;

  const existingConfig = existing.config as Record<string, unknown>;

  const widget = await prisma.dashboardWidget.update({
    where: { id: widgetId },
    data: {
      title: updates.title,
      type: updates.type,
      config: updates.config ? {
        ...existingConfig,
        ...updates.config,
        description: updates.description ?? existingConfig.description,
        position: updates.position ?? existingConfig.position,
        size: updates.size ?? existingConfig.size,
        isVisible: updates.isVisible ?? existingConfig.isVisible,
        refreshInterval: updates.refreshInterval ?? existingConfig.refreshInterval,
      } : existingConfig,
      position: updates.position
        ? updates.position.x * 100 + updates.position.y
        : existing.position,
      size: updates.size ?? existing.size,
    },
  });

  return mapToWidget(widget);
}

/**
 * Delete a widget
 */
export async function deleteWidget(widgetId: string): Promise<boolean> {
  try {
    await prisma.dashboardWidget.delete({
      where: { id: widgetId },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Update widget positions (bulk update for drag-and-drop)
 */
export async function updateWidgetPositions(
  widgetPositions: { id: string; position: WidgetPosition }[]
): Promise<void> {
  await prisma.$transaction(
    widgetPositions.map(({ id, position }) =>
      prisma.dashboardWidget.update({
        where: { id },
        data: {
          position: position.x * 100 + position.y,
          config: {
            position,
          },
        },
      })
    )
  );
}

/**
 * Get dashboard layout
 */
export async function getDashboardLayout(
  organizationId: string,
  userId?: string,
  layoutId?: string
): Promise<DashboardLayout | null> {
  // If layoutId provided, fetch specific layout
  if (layoutId) {
    const layout = await prisma.dashboardWidget.findFirst({
      where: {
        id: layoutId,
        type: 'layout',
        organizationId,
      },
    });

    if (!layout) return null;
    return mapToLayout(layout, organizationId);
  }

  // Otherwise get default layout
  const layout = await prisma.dashboardWidget.findFirst({
    where: {
      type: 'layout',
      organizationId,
      ...(userId ? { userId } : { userId: null }),
    },
  });

  if (!layout) {
    // Create default layout
    return createDefaultLayout(organizationId, userId);
  }

  return mapToLayout(layout, organizationId);
}

/**
 * Save dashboard layout
 */
export async function saveDashboardLayout(
  layout: Omit<DashboardLayout, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DashboardLayout> {
  // Save the layout metadata
  const saved = await prisma.dashboardWidget.create({
    data: {
      organizationId: layout.organizationId,
      userId: layout.userId,
      type: 'layout',
      title: layout.name,
      config: {
        description: layout.description,
        isDefault: layout.isDefault,
        widgetIds: layout.widgets.map(w => w.id),
      } as Record<string, unknown>,
      position: 0,
      size: 'full',
    },
  });

  // Save each widget
  for (const widget of layout.widgets) {
    if (!widget.id.startsWith('new-')) {
      await updateWidget(widget.id, widget);
    } else {
      await createWidget({
        ...widget,
        organizationId: layout.organizationId,
        userId: layout.userId,
      });
    }
  }

  return {
    id: saved.id,
    organizationId: layout.organizationId,
    userId: layout.userId || undefined,
    name: layout.name,
    description: layout.description,
    widgets: layout.widgets,
    isDefault: layout.isDefault,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

/**
 * Create default layout for new users/organizations
 */
async function createDefaultLayout(
  organizationId: string,
  userId?: string
): Promise<DashboardLayout> {
  const defaultWidgets = getDefaultWidgets();

  const layout: DashboardLayout = {
    id: 'default',
    organizationId,
    userId,
    name: 'Default Dashboard',
    description: 'Default command center layout',
    widgets: [],
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Create default widgets
  for (const widgetDef of defaultWidgets) {
    const widget = await createWidget({
      ...widgetDef,
      organizationId,
      userId,
    });
    layout.widgets.push(widget);
  }

  return layout;
}

/**
 * Get default widgets configuration
 */
function getDefaultWidgets(): Omit<Widget, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>[] {
  return [
    {
      type: 'metric_card',
      title: 'Active Processes',
      config: {
        metricId: 'activeProcesses',
        displayOptions: { showTrend: true },
      },
      position: { x: 0, y: 0, width: 1, height: 1 },
      size: 'small',
      isVisible: true,
      refreshInterval: 60,
    },
    {
      type: 'metric_card',
      title: 'Pending Approvals',
      config: {
        metricId: 'pendingApprovals',
        displayOptions: { showTrend: true },
        thresholds: [
          { value: 10, color: 'yellow', label: 'Warning' },
          { value: 25, color: 'red', label: 'Critical' },
        ],
      },
      position: { x: 1, y: 0, width: 1, height: 1 },
      size: 'small',
      isVisible: true,
      refreshInterval: 60,
    },
    {
      type: 'metric_card',
      title: 'Active Users',
      config: {
        metricId: 'activeUsers',
        displayOptions: { showTrend: true },
      },
      position: { x: 2, y: 0, width: 1, height: 1 },
      size: 'small',
      isVisible: true,
      refreshInterval: 60,
    },
    {
      type: 'metric_card',
      title: 'Avg Response Time',
      config: {
        metricId: 'avgResponseTime',
        displayOptions: { showTrend: true },
        thresholds: [
          { value: 60, color: 'yellow', label: 'Warning' },
          { value: 120, color: 'red', label: 'Slow' },
        ],
      },
      position: { x: 3, y: 0, width: 1, height: 1 },
      size: 'small',
      isVisible: true,
      refreshInterval: 60,
    },
    {
      type: 'alert_list',
      title: 'Active Alerts',
      config: {
        filters: { status: ['active', 'acknowledged'] },
        displayOptions: { showTrend: false },
      },
      position: { x: 0, y: 1, width: 2, height: 2 },
      size: 'medium',
      isVisible: true,
      refreshInterval: 30,
    },
    {
      type: 'chart',
      title: 'Workload Distribution',
      config: {
        chartType: 'bar',
        dataSource: 'workload_by_department',
        displayOptions: { showLegend: true, animate: true },
      },
      position: { x: 2, y: 1, width: 2, height: 2 },
      size: 'medium',
      isVisible: true,
      refreshInterval: 300,
    },
    {
      type: 'bottleneck_list',
      title: 'Bottlenecks',
      config: {
        filters: { severity: ['critical', 'high'] },
      },
      position: { x: 0, y: 3, width: 2, height: 1 },
      size: 'medium',
      isVisible: true,
      refreshInterval: 120,
    },
    {
      type: 'process_health',
      title: 'Process Health',
      config: {
        displayOptions: { showTrend: true },
      },
      position: { x: 2, y: 3, width: 2, height: 1 },
      size: 'medium',
      isVisible: true,
      refreshInterval: 300,
    },
  ];
}

/**
 * Get available widget templates
 */
export function getWidgetTemplates(): WidgetTemplate[] {
  return [
    {
      type: 'metric_card',
      name: 'Metric Card',
      description: 'Display a single metric with optional trend indicator',
      defaultConfig: {
        displayOptions: { showTrend: true },
      },
      defaultSize: 'small',
      category: 'Metrics',
    },
    {
      type: 'chart',
      name: 'Chart',
      description: 'Visualize data with various chart types',
      defaultConfig: {
        chartType: 'line',
        displayOptions: { animate: true, showLegend: true },
      },
      defaultSize: 'medium',
      category: 'Visualization',
    },
    {
      type: 'table',
      name: 'Data Table',
      description: 'Display tabular data with sorting and filtering',
      defaultConfig: {},
      defaultSize: 'large',
      category: 'Data',
    },
    {
      type: 'alert_list',
      name: 'Alert List',
      description: 'Show active alerts with severity indicators',
      defaultConfig: {
        filters: { status: ['active'] },
      },
      defaultSize: 'medium',
      category: 'Monitoring',
    },
    {
      type: 'activity_feed',
      name: 'Activity Feed',
      description: 'Real-time stream of organizational activities',
      defaultConfig: {},
      defaultSize: 'medium',
      category: 'Activity',
    },
    {
      type: 'bottleneck_list',
      name: 'Bottleneck List',
      description: 'Display detected operational bottlenecks',
      defaultConfig: {},
      defaultSize: 'medium',
      category: 'Monitoring',
    },
    {
      type: 'workload_heatmap',
      name: 'Workload Heatmap',
      description: 'Visualize workload distribution across time/teams',
      defaultConfig: {
        displayOptions: { colorScheme: 'heat' },
      },
      defaultSize: 'large',
      category: 'Workload',
    },
    {
      type: 'process_health',
      name: 'Process Health',
      description: 'Overview of process health scores',
      defaultConfig: {
        displayOptions: { showTrend: true },
      },
      defaultSize: 'medium',
      category: 'Processes',
    },
    {
      type: 'quick_actions',
      name: 'Quick Actions',
      description: 'Shortcuts to common operations',
      defaultConfig: {
        actions: [
          { id: 'new-routing', label: 'New Routing Rule', icon: 'route' },
          { id: 'new-alert', label: 'Create Alert', icon: 'bell' },
          { id: 'view-reports', label: 'View Reports', icon: 'chart' },
        ],
      },
      defaultSize: 'small',
      category: 'Actions',
    },
  ];
}

/**
 * Get layout presets
 */
export function getLayoutPresets(): {
  id: string;
  name: string;
  description: string;
  widgets: Partial<Widget>[];
}[] {
  return [
    {
      id: 'executive',
      name: 'Executive Overview',
      description: 'High-level KPIs and trends for leadership',
      widgets: [
        { type: 'metric_card', title: 'Overall Health', size: 'medium' },
        { type: 'chart', title: 'Weekly Trends', size: 'large' },
        { type: 'alert_list', title: 'Critical Alerts', size: 'medium' },
      ],
    },
    {
      id: 'operations',
      name: 'Operations Dashboard',
      description: 'Detailed operational metrics and bottlenecks',
      widgets: [
        { type: 'bottleneck_list', title: 'Active Bottlenecks', size: 'large' },
        { type: 'workload_heatmap', title: 'Team Workload', size: 'large' },
        { type: 'process_health', title: 'Process Status', size: 'medium' },
      ],
    },
    {
      id: 'compliance',
      name: 'Compliance Monitor',
      description: 'Focus on compliance metrics and violations',
      widgets: [
        { type: 'metric_card', title: 'Compliance Rate', size: 'medium' },
        { type: 'alert_list', title: 'Compliance Alerts', size: 'large' },
        { type: 'table', title: 'Pending Reviews', size: 'large' },
      ],
    },
  ];
}

// Helper functions

function mapToWidget(record: {
  id: string;
  organizationId: string;
  userId: string | null;
  type: string;
  title: string;
  config: unknown;
  position: number;
  size: string;
  createdAt: Date;
  updatedAt: Date;
}): Widget {
  const config = record.config as Record<string, unknown>;

  return {
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId || undefined,
    type: record.type as WidgetType,
    title: record.title,
    description: config.description as string | undefined,
    config: config as WidgetConfig,
    position: (config.position as WidgetPosition) || {
      x: Math.floor(record.position / 100),
      y: record.position % 100,
      width: 1,
      height: 1,
    },
    size: record.size as WidgetSize,
    isVisible: (config.isVisible as boolean) ?? true,
    refreshInterval: config.refreshInterval as number | undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapToLayout(
  record: {
    id: string;
    userId: string | null;
    title: string;
    config: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  organizationId: string
): DashboardLayout {
  const config = record.config as Record<string, unknown>;

  return {
    id: record.id,
    organizationId,
    userId: record.userId || undefined,
    name: record.title,
    description: config.description as string | undefined,
    widgets: [], // Will be populated separately
    isDefault: (config.isDefault as boolean) ?? false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default {
  createWidget,
  getWidget,
  getWidgets,
  updateWidget,
  deleteWidget,
  updateWidgetPositions,
  getDashboardLayout,
  saveDashboardLayout,
  getWidgetTemplates,
  getLayoutPresets,
};
