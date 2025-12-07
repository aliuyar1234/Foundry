/**
 * Command Center Page
 * T121 - Create command center page
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { MetricCard, HealthGauge } from '../../components/command-center/MetricCard';
import { AlertList, AlertSummaryBadges } from '../../components/command-center/AlertList';
import { TrendChart } from '../../components/command-center/TrendChart';
import { DrilldownPanel, DrilldownTrigger } from '../../components/command-center/DrilldownPanel';
import { useRealTimeMetrics } from '../../hooks/useRealTimeMetrics';
import {
  getBottlenecks,
  getTrends,
  type Bottleneck,
  type TrendAnalysis,
} from '../../services/commandCenterApi';

export function CommandCenterPage() {
  const { metrics, alerts, isConnected, lastUpdate, refresh } = useRealTimeMetrics();
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [trends, setTrends] = useState<TrendAnalysis | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<{ id: string; type: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdditionalData();
  }, []);

  async function loadAdditionalData() {
    try {
      const [bottleneckData, trendData] = await Promise.all([
        getBottlenecks({ minSeverity: 'medium' }),
        getTrends({ timeRange: 'week' }),
      ]);
      setBottlenecks(bottleneckData.bottlenecks);
      setTrends(trendData);
    } catch (error) {
      console.error('Failed to load additional data:', error);
    } finally {
      setLoading(false);
    }
  }

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const activeAlerts = alerts.filter(a => a.status === 'active');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Command Center</h1>
              <p className="text-sm text-gray-500">
                Real-time operational overview
              </p>
            </div>
            <div className="flex items-center gap-4">
              <AlertSummaryBadges
                alerts={activeAlerts}
                onClick={() => {}}
              />
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-500">
                  {isConnected ? 'Live' : 'Disconnected'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={refresh}>
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Critical Alerts Banner */}
        {criticalAlerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🚨</span>
              <h2 className="font-semibold text-red-800">
                {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''}
              </h2>
            </div>
            <div className="space-y-2">
              {criticalAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="text-sm text-red-700">
                  <span className="font-medium">{alert.title}</span>
                  {' — '}
                  <span>{alert.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overview Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DrilldownTrigger metricId="activeProcesses" metricType="overview">
            <MetricCard
              title="Active Processes"
              value={metrics?.overview.activeProcesses || 0}
              status="neutral"
              loading={!metrics}
            />
          </DrilldownTrigger>

          <DrilldownTrigger metricId="pendingApprovals" metricType="overview">
            <MetricCard
              title="Pending Approvals"
              value={metrics?.overview.pendingApprovals || 0}
              status={
                (metrics?.overview.pendingApprovals || 0) > 25 ? 'critical' :
                (metrics?.overview.pendingApprovals || 0) > 10 ? 'warning' : 'good'
              }
              thresholds={{ warning: 10, critical: 25 }}
              loading={!metrics}
            />
          </DrilldownTrigger>

          <DrilldownTrigger metricId="activeUsers" metricType="overview">
            <MetricCard
              title="Active Users"
              value={metrics?.overview.activeUsers || 0}
              status="good"
              loading={!metrics}
            />
          </DrilldownTrigger>

          <DrilldownTrigger metricId="avgResponseTime" metricType="overview">
            <MetricCard
              title="Avg Response Time"
              value={metrics?.overview.avgResponseTime.toFixed(0) || 0}
              unit="min"
              status={
                (metrics?.overview.avgResponseTime || 0) > 120 ? 'critical' :
                (metrics?.overview.avgResponseTime || 0) > 60 ? 'warning' : 'good'
              }
              loading={!metrics}
            />
          </DrilldownTrigger>
        </div>

        {/* Health & Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Health Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <HealthGauge
                  score={metrics?.health.overallScore || 0}
                  size="large"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {metrics?.health.processHealth || 0}%
                  </div>
                  <div className="text-xs text-gray-500">Process Health</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {metrics?.health.systemHealth || 0}%
                  </div>
                  <div className="text-xs text-gray-500">System Health</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {metrics?.health.dataHealth || 0}%
                  </div>
                  <div className="text-xs text-gray-500">Data Health</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {metrics?.health.integrationHealth || 0}%
                  </div>
                  <div className="text-xs text-gray-500">Integration</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alerts */}
          <div className="lg:col-span-2">
            <AlertList
              alerts={activeAlerts}
              title="Active Alerts"
              maxVisible={5}
              onAlertUpdate={(alert) => {
                refresh();
              }}
            />
          </div>
        </div>

        {/* Workload & Routing Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Workload Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Workload Distribution</CardTitle>
                <DrilldownTrigger metricId="avgWorkloadScore" metricType="workload">
                  <Button variant="ghost" size="sm">
                    Details →
                  </Button>
                </DrilldownTrigger>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold">
                    {((metrics?.workload.avgWorkloadScore || 0) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Avg Workload</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {metrics?.workload.burnoutRiskCount || 0}
                  </div>
                  <div className="text-xs text-gray-500">Burnout Risk</div>
                </div>
              </div>

              {metrics?.workload.distribution && metrics.workload.distribution.length > 0 ? (
                <div className="space-y-2">
                  {metrics.workload.distribution.slice(0, 5).map((dept, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{dept.department}</span>
                        <span className="font-medium">
                          {(dept.avgWorkload * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            dept.avgWorkload > 0.85 ? 'bg-red-500' :
                            dept.avgWorkload > 0.7 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${dept.avgWorkload * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-4">
                  No department data
                </div>
              )}
            </CardContent>
          </Card>

          {/* Routing Performance */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Routing Performance</CardTitle>
                <DrilldownTrigger metricId="successRate" metricType="routing">
                  <Button variant="ghost" size="sm">
                    Details →
                  </Button>
                </DrilldownTrigger>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {(metrics?.routing.successRate || 0).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Success Rate</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold">
                    {metrics?.routing.totalRoutedToday || 0}
                  </div>
                  <div className="text-xs text-gray-500">Routed Today</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {(metrics?.routing.avgConfidence || 0).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Confidence</div>
                </div>
              </div>

              {metrics?.routing.topCategories && metrics.routing.topCategories.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-500">Top Categories</h4>
                  {metrics.routing.topCategories.map((cat, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded"
                    >
                      <span>{cat.category}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{cat.count}</Badge>
                        <span className={
                          cat.successRate >= 90 ? 'text-green-600' :
                          cat.successRate >= 70 ? 'text-yellow-600' :
                          'text-red-600'
                        }>
                          {cat.successRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-4">
                  No routing data today
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Trends & Bottlenecks Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Trends */}
          {trends && trends.metrics.length > 0 && (
            <TrendChart
              title="Weekly Trends"
              data={trends.metrics[0]?.dataPoints.map(dp => ({
                timestamp: dp.timestamp,
                value: dp.value,
              })) || []}
              type="area"
              height={200}
              trend={trends.metrics[0] ? {
                direction: trends.metrics[0].trend === 'increasing' ? 'up' :
                          trends.metrics[0].trend === 'decreasing' ? 'down' : 'stable',
                value: trends.metrics[0].changePercent,
              } : undefined}
            />
          )}

          {/* Bottlenecks */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Bottlenecks</CardTitle>
                <Badge variant="secondary">{bottlenecks.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {bottlenecks.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>No bottlenecks detected</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bottlenecks.slice(0, 5).map((bottleneck, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border ${
                        bottleneck.severity === 'critical' ? 'bg-red-50 border-red-200' :
                        bottleneck.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                        'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{bottleneck.name}</span>
                        <Badge
                          variant={
                            bottleneck.severity === 'critical' ? 'destructive' :
                            bottleneck.severity === 'high' ? 'default' :
                            'secondary'
                          }
                        >
                          {bottleneck.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {bottleneck.description}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span>Queue: {bottleneck.metrics.queueLength}</span>
                        <span>Wait: {bottleneck.metrics.avgWaitTime.toFixed(1)}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Compliance Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Compliance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {(metrics?.compliance.compliantPercentage || 0).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">Compliant</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">
                  {metrics?.compliance.totalRules || 0}
                </div>
                <div className="text-xs text-gray-500">Rules</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className={`text-2xl font-bold ${
                  (metrics?.compliance.violations || 0) > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics?.compliance.violations || 0}
                </div>
                <div className="text-xs text-gray-500">Violations</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {metrics?.compliance.pendingReview || 0}
                </div>
                <div className="text-xs text-gray-500">Pending Review</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">
                  {metrics?.compliance.upcomingDeadlines || 0}
                </div>
                <div className="text-xs text-gray-500">Deadlines (7d)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Update Footer */}
        <div className="text-center text-xs text-gray-400 pb-4">
          Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
        </div>
      </main>

      {/* Drill-down Panel */}
      {selectedMetric && (
        <DrilldownPanel
          metricId={selectedMetric.id}
          metricType={selectedMetric.type}
          isOpen={!!selectedMetric}
          onClose={() => setSelectedMetric(null)}
        />
      )}
    </div>
  );
}

export default CommandCenterPage;
