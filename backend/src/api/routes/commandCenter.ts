/**
 * Command Center API Routes
 * T110-T120 - Command Center REST API endpoints
 */

import { Router, Request, Response } from 'express';
import {
  metricsAggregator,
  processHealthMetrics,
  workloadDistribution,
  bottleneckDetector,
  trendAnalyzer,
  alertManager,
  alertPrioritizer,
  thresholdMonitor,
  drilldownService,
  ssePublisher,
  widgetService,
} from '../../services/commandCenter';

const router = Router();

// Middleware to extract organization ID
function getOrganizationId(req: Request): string {
  // In production, this would come from authenticated user context
  return (req.headers['x-organization-id'] as string) || 'default-org';
}

function getUserId(req: Request): string {
  return (req.headers['x-user-id'] as string) || 'default-user';
}

// ============================================================
// Overview & Metrics (T110-T111)
// ============================================================

/**
 * GET /command-center/overview
 * Get comprehensive overview of operational metrics
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const forceRefresh = req.query.refresh === 'true';
    const timeRange = (req.query.timeRange as 'hour' | 'day' | 'week' | 'month') || 'day';

    const metrics = await metricsAggregator.getAggregatedMetrics(organizationId, {
      forceRefresh,
      timeRange,
    });

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Error getting overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get overview metrics',
    });
  }
});

/**
 * GET /command-center/metrics
 * Get detailed metrics with optional filtering
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const category = req.query.category as string;
    const timeRange = (req.query.timeRange as 'day' | 'week' | 'month') || 'week';

    const [metrics, processHealth, workload, bottlenecks] = await Promise.all([
      metricsAggregator.getAggregatedMetrics(organizationId),
      processHealthMetrics.getProcessHealthSummary(organizationId, { timeRange }),
      workloadDistribution.getWorkloadDistribution(organizationId, { timeRange }),
      bottleneckDetector.detectBottlenecks(organizationId),
    ]);

    let result: Record<string, unknown> = {};

    if (!category || category === 'all') {
      result = {
        overview: metrics.overview,
        workload: metrics.workload,
        routing: metrics.routing,
        compliance: metrics.compliance,
        health: metrics.health,
        processHealth: processHealth,
        workloadDistribution: workload,
        bottlenecks: bottlenecks.bottlenecks,
      };
    } else {
      switch (category) {
        case 'workload':
          result = { workload: metrics.workload, distribution: workload };
          break;
        case 'routing':
          result = { routing: metrics.routing };
          break;
        case 'compliance':
          result = { compliance: metrics.compliance };
          break;
        case 'health':
          result = { health: metrics.health, processHealth };
          break;
        case 'bottlenecks':
          result = { bottlenecks: bottlenecks.bottlenecks };
          break;
        default:
          result = metrics;
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
    });
  }
});

// ============================================================
// Alerts (T112)
// ============================================================

/**
 * GET /command-center/alerts
 * Get alerts with filtering and prioritization
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const status = req.query.status
      ? (req.query.status as string).split(',') as alertManager.AlertStatus[]
      : undefined;
    const severity = req.query.severity
      ? (req.query.severity as string).split(',') as alertManager.AlertSeverity[]
      : undefined;
    const category = req.query.category
      ? (req.query.category as string).split(',') as alertManager.AlertCategory[]
      : undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const prioritize = req.query.prioritize !== 'false';

    const { alerts, total } = await alertManager.queryAlerts({
      organizationId,
      status,
      severity,
      category,
      limit,
      offset,
    });

    let result = alerts;
    if (prioritize && alerts.length > 0) {
      result = await alertPrioritizer.prioritizeAlerts(alerts, organizationId);
    }

    res.json({
      success: true,
      data: {
        alerts: result,
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts',
    });
  }
});

/**
 * POST /command-center/alerts
 * Create a new alert
 */
router.post('/alerts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const alertData = {
      ...req.body,
      organizationId,
    };

    const alert = await alertManager.createAlert(alertData);

    res.status(201).json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create alert',
    });
  }
});

/**
 * GET /command-center/alerts/:id
 * Get alert details
 */
router.get('/alerts/:id', async (req: Request, res: Response) => {
  try {
    const alert = await alertManager.getAlert(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('Error getting alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alert',
    });
  }
});

/**
 * POST /command-center/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const alert = await alertManager.acknowledgeAlert(req.params.id, userId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alert',
    });
  }
});

/**
 * POST /command-center/alerts/:id/resolve
 * Resolve an alert
 */
router.post('/alerts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const notes = req.body.notes;
    const alert = await alertManager.resolveAlert(req.params.id, userId, notes);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
    });
  }
});

/**
 * GET /command-center/alerts/stats
 * Get alert statistics
 */
router.get('/alerts/stats', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const timeRange = (req.query.timeRange as 'day' | 'week' | 'month') || 'week';

    const stats = await alertManager.getAlertStats(organizationId, timeRange);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting alert stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alert statistics',
    });
  }
});

// ============================================================
// Drill-Down (T113)
// ============================================================

/**
 * GET /command-center/drill-down/:metricId
 * Get drill-down details for a metric
 */
router.get('/drill-down/:metricId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const metricId = req.params.metricId;
    const metricType = req.query.type as string || 'overview';
    const depth = (req.query.depth as 'summary' | 'detailed' | 'full') || 'detailed';

    const drillDown = await drilldownService.getDrillDown({
      organizationId,
      metricId,
      metricType: metricType as 'overview' | 'workload' | 'routing' | 'compliance' | 'health' | 'bottleneck' | 'alert',
      depth,
    });

    res.json({
      success: true,
      data: drillDown,
    });
  } catch (error) {
    console.error('Error getting drill-down:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get drill-down details',
    });
  }
});

// ============================================================
// Trends (T114)
// ============================================================

/**
 * GET /command-center/trends
 * Get trend analysis
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const timeRange = (req.query.timeRange as 'day' | 'week' | 'month' | 'quarter') || 'week';
    const metrics = req.query.metrics ? (req.query.metrics as string).split(',') : undefined;
    const includePatterns = req.query.patterns !== 'false';
    const includePredictions = req.query.predictions !== 'false';
    const includeAnomalies = req.query.anomalies !== 'false';

    const trends = await trendAnalyzer.analyzeTrends(organizationId, {
      timeRange,
      metrics,
      includePatterns,
      includePredictions,
      includeAnomalies,
    });

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trend analysis',
    });
  }
});

// ============================================================
// Real-Time Stream (T115)
// ============================================================

/**
 * GET /command-center/stream
 * SSE endpoint for real-time updates
 */
router.get('/stream', (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const userId = getUserId(req);
  const channels = req.query.channels
    ? (req.query.channels as string).split(',') as ssePublisher.EventChannel[]
    : ['metrics', 'alerts'];

  // Register SSE connection
  ssePublisher.registerConnection(userId, organizationId, res, channels);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`SSE connection closed for user ${userId}`);
  });
});

// ============================================================
// Widgets (T116-T120)
// ============================================================

/**
 * GET /command-center/widgets
 * Get user's widgets
 */
router.get('/widgets', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.query.shared === 'true' ? undefined : getUserId(req);

    const widgets = await widgetService.getWidgets(organizationId, userId);

    res.json({
      success: true,
      data: widgets,
    });
  } catch (error) {
    console.error('Error getting widgets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get widgets',
    });
  }
});

/**
 * POST /command-center/widgets
 * Create a new widget
 */
router.post('/widgets', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const widget = await widgetService.createWidget({
      ...req.body,
      organizationId,
      userId,
    });

    res.status(201).json({
      success: true,
      data: widget,
    });
  } catch (error) {
    console.error('Error creating widget:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create widget',
    });
  }
});

/**
 * PUT /command-center/widgets/:id
 * Update a widget
 */
router.put('/widgets/:id', async (req: Request, res: Response) => {
  try {
    const widget = await widgetService.updateWidget(req.params.id, req.body);

    if (!widget) {
      return res.status(404).json({
        success: false,
        error: 'Widget not found',
      });
    }

    res.json({
      success: true,
      data: widget,
    });
  } catch (error) {
    console.error('Error updating widget:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update widget',
    });
  }
});

/**
 * DELETE /command-center/widgets/:id
 * Delete a widget
 */
router.delete('/widgets/:id', async (req: Request, res: Response) => {
  try {
    const success = await widgetService.deleteWidget(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Widget not found',
      });
    }

    res.json({
      success: true,
      message: 'Widget deleted',
    });
  } catch (error) {
    console.error('Error deleting widget:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete widget',
    });
  }
});

/**
 * PUT /command-center/widgets/positions
 * Update widget positions (bulk)
 */
router.put('/widgets/positions', async (req: Request, res: Response) => {
  try {
    const positions = req.body.positions as { id: string; position: widgetService.WidgetPosition }[];

    await widgetService.updateWidgetPositions(positions);

    res.json({
      success: true,
      message: 'Positions updated',
    });
  } catch (error) {
    console.error('Error updating positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update positions',
    });
  }
});

/**
 * GET /command-center/widgets/templates
 * Get available widget templates
 */
router.get('/widgets/templates', (_req: Request, res: Response) => {
  try {
    const templates = widgetService.getWidgetTemplates();

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get templates',
    });
  }
});

/**
 * GET /command-center/layouts
 * Get dashboard layout
 */
router.get('/layouts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const layoutId = req.query.id as string;

    const layout = await widgetService.getDashboardLayout(organizationId, userId, layoutId);

    res.json({
      success: true,
      data: layout,
    });
  } catch (error) {
    console.error('Error getting layout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get layout',
    });
  }
});

/**
 * POST /command-center/layouts
 * Save dashboard layout
 */
router.post('/layouts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const layout = await widgetService.saveDashboardLayout({
      ...req.body,
      organizationId,
      userId,
    });

    res.status(201).json({
      success: true,
      data: layout,
    });
  } catch (error) {
    console.error('Error saving layout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save layout',
    });
  }
});

/**
 * GET /command-center/layouts/presets
 * Get layout presets
 */
router.get('/layouts/presets', (_req: Request, res: Response) => {
  try {
    const presets = widgetService.getLayoutPresets();

    res.json({
      success: true,
      data: presets,
    });
  } catch (error) {
    console.error('Error getting presets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get presets',
    });
  }
});

// ============================================================
// Threshold Rules
// ============================================================

/**
 * GET /command-center/thresholds
 * Get threshold rules
 */
router.get('/thresholds', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const enabledOnly = req.query.enabled !== 'false';

    const rules = await thresholdMonitor.getThresholdRules(organizationId, enabledOnly);

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error('Error getting thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get threshold rules',
    });
  }
});

/**
 * POST /command-center/thresholds
 * Create threshold rule
 */
router.post('/thresholds', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const rule = await thresholdMonitor.createThresholdRule({
      ...req.body,
      organizationId,
    });

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error creating threshold:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create threshold rule',
    });
  }
});

/**
 * PUT /command-center/thresholds/:id
 * Update threshold rule
 */
router.put('/thresholds/:id', async (req: Request, res: Response) => {
  try {
    const rule = await thresholdMonitor.updateThresholdRule(req.params.id, req.body);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Threshold rule not found',
      });
    }

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error updating threshold:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update threshold rule',
    });
  }
});

/**
 * DELETE /command-center/thresholds/:id
 * Delete threshold rule
 */
router.delete('/thresholds/:id', async (req: Request, res: Response) => {
  try {
    const success = await thresholdMonitor.deleteThresholdRule(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Threshold rule not found',
      });
    }

    res.json({
      success: true,
      message: 'Threshold rule deleted',
    });
  } catch (error) {
    console.error('Error deleting threshold:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete threshold rule',
    });
  }
});

/**
 * GET /command-center/thresholds/templates
 * Get threshold rule templates
 */
router.get('/thresholds/templates', (_req: Request, res: Response) => {
  try {
    const templates = thresholdMonitor.getThresholdTemplates();

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error getting threshold templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get threshold templates',
    });
  }
});

/**
 * POST /command-center/thresholds/evaluate
 * Manually trigger threshold evaluation
 */
router.post('/thresholds/evaluate', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const evaluations = await thresholdMonitor.evaluateThresholds(organizationId);

    res.json({
      success: true,
      data: evaluations,
    });
  } catch (error) {
    console.error('Error evaluating thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate thresholds',
    });
  }
});

// ============================================================
// Bottlenecks
// ============================================================

/**
 * GET /command-center/bottlenecks
 * Get detected bottlenecks
 */
router.get('/bottlenecks', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const types = req.query.types
      ? (req.query.types as string).split(',') as bottleneckDetector.Bottleneck['type'][]
      : undefined;
    const minSeverity = req.query.minSeverity as bottleneckDetector.Bottleneck['severity'] | undefined;

    const report = await bottleneckDetector.detectBottlenecks(organizationId, {
      types,
      minSeverity,
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Error getting bottlenecks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bottlenecks',
    });
  }
});

export default router;
