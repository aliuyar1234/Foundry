/**
 * Routing Dashboard Component
 * T057 - Create routing dashboard widget
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  getRoutingSummary,
  type RoutingSummary,
  type RoutingStats,
} from '../../services/routingApi';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

function StatCard({ title, value, subtitle, trend, trendValue }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{value}</span>
          {trend && trendValue && (
            <span
              className={`text-sm ${
                trend === 'up'
                  ? 'text-green-600'
                  : trend === 'down'
                  ? 'text-red-600'
                  : 'text-gray-500'
              }`}
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function StatsRow({ stats, label }: { stats: RoutingStats; label: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-600">{label}</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-lg font-semibold">{stats.totalDecisions}</div>
          <div className="text-xs text-gray-500">Decisions</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-lg font-semibold">
            {(stats.successRate * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Success Rate</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-lg font-semibold">
            {(stats.averageConfidence * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">Avg Confidence</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-lg font-semibold">
            {(stats.escalationRate * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Escalation Rate</div>
        </div>
      </div>
    </div>
  );
}

export function RoutingDashboard() {
  const [summary, setSummary] = useState<RoutingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      try {
        setLoading(true);
        const data = await getRoutingSummary();
        setSummary(data);
        setError(null);
      } catch (err) {
        setError('Failed to load routing summary');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
    // Refresh every 30 seconds
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-24" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Decisions Today"
          value={summary.today.totalDecisions}
          subtitle={`${summary.today.successfulDecisions} successful`}
        />
        <StatCard
          title="Success Rate"
          value={`${(summary.today.successRate * 100).toFixed(1)}%`}
          trend={
            summary.today.successRate > summary.thisWeek.successRate
              ? 'up'
              : summary.today.successRate < summary.thisWeek.successRate
              ? 'down'
              : 'neutral'
          }
          trendValue="vs week"
        />
        <StatCard
          title="Avg Confidence"
          value={`${(summary.today.averageConfidence * 100).toFixed(0)}%`}
        />
        <StatCard
          title="Escalation Rate"
          value={`${(summary.today.escalationRate * 100).toFixed(1)}%`}
          subtitle={`${summary.today.escalatedDecisions} escalated`}
        />
      </div>

      {/* Time Period Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Routing Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatsRow stats={summary.today} label="Today" />
          <StatsRow stats={summary.thisWeek} label="This Week" />
          <StatsRow stats={summary.thisMonth} label="This Month" />
        </CardContent>
      </Card>

      {/* Top Categories & Handlers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.topCategories.map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{cat.category}</Badge>
                    <span className="text-sm text-gray-500">
                      {(cat.percentage * 100).toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-sm font-medium">{cat.count}</span>
                </div>
              ))}
              {summary.topCategories.length === 0 && (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Handlers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Handlers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.topHandlers.map((handler) => (
                <div
                  key={handler.handlerId}
                  className="flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium">
                      {handler.handlerName || handler.handlerId}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                      {handler.totalAssignments} assignments
                    </span>
                  </div>
                  <Badge
                    variant={handler.successRate > 0.8 ? 'default' : 'secondary'}
                  >
                    {(handler.successRate * 100).toFixed(0)}%
                  </Badge>
                </div>
              ))}
              {summary.topHandlers.length === 0 && (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default RoutingDashboard;
