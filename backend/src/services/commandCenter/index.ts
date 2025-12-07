/**
 * Command Center Services Index
 * Exports all command center related services
 */

// Core metrics and aggregation
export * from './metricsAggregator';
export * from './processHealthMetrics';
export * from './workloadDistribution';
export * from './bottleneckDetector';
export * from './trendAnalyzer';

// Alert management
export * from './alertManager';
export * from './alertPrioritizer';
export * from './thresholdMonitor';
export * from './alertDispatcher';

// Drill-down and details
export * from './drilldownService';

// Real-time updates
export * from './ssePublisher';

// Dashboard widgets
export * from './widgetService';

// Default exports as namespace
import * as metricsAggregator from './metricsAggregator';
import * as processHealthMetrics from './processHealthMetrics';
import * as workloadDistribution from './workloadDistribution';
import * as bottleneckDetector from './bottleneckDetector';
import * as trendAnalyzer from './trendAnalyzer';
import * as alertManager from './alertManager';
import * as alertPrioritizer from './alertPrioritizer';
import * as thresholdMonitor from './thresholdMonitor';
import * as alertDispatcher from './alertDispatcher';
import * as drilldownService from './drilldownService';
import * as ssePublisher from './ssePublisher';
import * as widgetService from './widgetService';

export {
  metricsAggregator,
  processHealthMetrics,
  workloadDistribution,
  bottleneckDetector,
  trendAnalyzer,
  alertManager,
  alertPrioritizer,
  thresholdMonitor,
  alertDispatcher,
  drilldownService,
  ssePublisher,
  widgetService,
};

export default {
  metricsAggregator,
  processHealthMetrics,
  workloadDistribution,
  bottleneckDetector,
  trendAnalyzer,
  alertManager,
  alertPrioritizer,
  thresholdMonitor,
  alertDispatcher,
  drilldownService,
  ssePublisher,
  widgetService,
};
