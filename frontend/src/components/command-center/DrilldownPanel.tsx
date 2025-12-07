/**
 * Drill-Down Panel Component
 * T125 - Create drill-down panel
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getDrillDown, type DrillDownResult } from '../../services/commandCenterApi';
import { TrendChart, Sparkline } from './TrendChart';

export interface DrilldownPanelProps {
  metricId: string;
  metricType: string;
  isOpen: boolean;
  onClose: () => void;
  depth?: 'summary' | 'detailed' | 'full';
}

export function DrilldownPanel({
  metricId,
  metricType,
  isOpen,
  onClose,
  depth = 'detailed',
}: DrilldownPanelProps) {
  const [data, setData] = useState<DrillDownResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && metricId) {
      loadDrillDown();
    }
  }, [isOpen, metricId, metricType, depth]);

  async function loadDrillDown() {
    setLoading(true);
    setError(null);
    try {
      const result = await getDrillDown(metricId, metricType, depth);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const statusColors = {
    good: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold">
            {data?.title || 'Loading...'}
          </h2>
          {data?.breadcrumbs && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              {data.breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span>/</span>}
                  <span className={crumb.isCurrent ? 'font-medium' : ''}>
                    {crumb.title}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-24 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={loadDrillDown} className="mt-2">
              Retry
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Summary Card */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl font-bold">
                    {data.summary.currentValue}
                    {data.summary.unit && (
                      <span className="text-lg text-gray-500 ml-1">
                        {data.summary.unit}
                      </span>
                    )}
                  </span>
                  <Badge className={statusColors[data.summary.status]}>
                    {data.summary.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className={
                    data.summary.trend === 'up' ? 'text-green-600' :
                    data.summary.trend === 'down' ? 'text-red-600' :
                    'text-gray-500'
                  }>
                    {data.summary.trend === 'up' ? '↑' :
                     data.summary.trend === 'down' ? '↓' : '→'}
                    {Math.abs(data.summary.trendValue).toFixed(1)}%
                  </span>
                  <span className="text-gray-400">
                    {data.summary.trendPeriod}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-2">
                  {data.summary.statusMessage}
                </p>
              </CardContent>
            </Card>

            {/* Timeline Chart */}
            {data.details.timeline.length > 0 && (
              <TrendChart
                title="Timeline"
                data={data.details.timeline.map(t => ({
                  timestamp: t.timestamp,
                  value: t.value,
                }))}
                type="area"
                height={150}
                showLabels={false}
              />
            )}

            {/* Breakdown */}
            {data.details.breakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.details.breakdown.map((item, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{item.name}</span>
                          <span>{item.value.toLocaleString()}</span>
                        </div>
                        <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(100, item.percentage)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {item.percentage.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Insights */}
            {data.details.insights.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.details.insights.map((insight, i) => (
                      <div key={i} className="p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {insight.type}
                          </Badge>
                          <span className="font-medium text-sm">
                            {insight.title}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {insight.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Suggested Actions */}
            {data.suggestedActions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Suggested Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.suggestedActions.map((action, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                action.priority === 'urgent' ? 'destructive' :
                                action.priority === 'high' ? 'default' :
                                'secondary'
                              }
                              className="text-xs"
                            >
                              {action.priority}
                            </Badge>
                            <span className="font-medium text-sm">
                              {action.title}
                            </span>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button variant="outline" className="w-full" onClick={loadDrillDown}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

/**
 * Drill-down button trigger
 */
export function DrilldownTrigger({
  metricId,
  metricType,
  children,
  className,
}: {
  metricId: string;
  metricType: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className={`cursor-pointer hover:bg-gray-50 rounded transition-colors ${className}`}
        onClick={() => setIsOpen(true)}
      >
        {children}
      </button>
      <DrilldownPanel
        metricId={metricId}
        metricType={metricType}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

export default DrilldownPanel;
