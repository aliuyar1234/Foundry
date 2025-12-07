/**
 * Routing Analytics Component
 * T061 - Create routing analytics visualizations
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  getRoutingTrends,
  getCategoryDistribution,
  getHandlerPerformance,
  getLowConfidenceDecisions,
  getRuleEffectiveness,
  type CategoryDistribution,
  type HandlerPerformance,
} from '../../services/routingApi';

interface TrendPoint {
  time: string;
  value: number;
}

interface RoutingTrends {
  volumeOverTime: TrendPoint[];
  confidenceOverTime: TrendPoint[];
  successRateOverTime: TrendPoint[];
  escalationRateOverTime: TrendPoint[];
}

function MiniChart({ data, color }: { data: TrendPoint[]; color: string }) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;

  return (
    <div className="h-16 flex items-end gap-1">
      {data.slice(-14).map((point, i) => {
        const height = ((point.value - min) / range) * 100;
        return (
          <div
            key={i}
            className={`flex-1 ${color} rounded-t`}
            style={{ height: `${Math.max(height, 5)}%` }}
            title={`${new Date(point.time).toLocaleDateString()}: ${point.value.toFixed(2)}`}
          />
        );
      })}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percentage = (value / max) * 100;
  return (
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

export function RoutingAnalytics() {
  const [trends, setTrends] = useState<RoutingTrends | null>(null);
  const [categories, setCategories] = useState<CategoryDistribution[]>([]);
  const [handlers, setHandlers] = useState<HandlerPerformance[]>([]);
  const [lowConfidence, setLowConfidence] = useState<
    Array<{
      decisionId: string;
      requestType: string;
      categories: string[];
      confidence: number;
      handlerId: string;
      createdAt: string;
    }>
  >([]);
  const [ruleEffectiveness, setRuleEffectiveness] = useState<
    Array<{
      ruleId: string;
      ruleName?: string;
      matchCount: number;
      successCount: number;
      averageConfidence: number;
      successRate: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    loadData();
  }, [timeRange]);

  async function loadData() {
    try {
      setLoading(true);

      const now = new Date();
      const startTime =
        timeRange === 'day'
          ? new Date(now.getTime() - 86400000).toISOString()
          : timeRange === 'week'
          ? new Date(now.getTime() - 7 * 86400000).toISOString()
          : new Date(now.getTime() - 30 * 86400000).toISOString();

      const [trendsData, catsData, handlersData, lowConfData, rulesData] =
        await Promise.all([
          getRoutingTrends({
            startTime,
            endTime: now.toISOString(),
            interval: timeRange === 'day' ? 'hour' : 'day',
          }),
          getCategoryDistribution({ startTime, endTime: now.toISOString() }),
          getHandlerPerformance({ startTime, endTime: now.toISOString() }),
          getLowConfidenceDecisions(0.6, 20),
          getRuleEffectiveness({ startTime, endTime: now.toISOString() }),
        ]);

      setTrends(trendsData);
      setCategories(catsData.categories);
      setHandlers(handlersData.handlers);
      setLowConfidence(lowConfData.decisions);
      setRuleEffectiveness(rulesData.rules);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-gray-200 rounded w-32" />
            </CardHeader>
            <CardContent>
              <div className="h-32 bg-gray-100 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex gap-2">
        {(['day', 'week', 'month'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              timeRange === range
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}
      </div>

      {/* Trend Charts */}
      {trends && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniChart data={trends.volumeOverTime} color="bg-blue-500" />
              <p className="text-xl font-bold mt-2">
                {trends.volumeOverTime.reduce((sum, d) => sum + d.value, 0)}
              </p>
              <p className="text-xs text-gray-500">Total decisions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Confidence</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniChart data={trends.confidenceOverTime} color="bg-green-500" />
              <p className="text-xl font-bold mt-2">
                {trends.confidenceOverTime.length > 0
                  ? (
                      (trends.confidenceOverTime.reduce((sum, d) => sum + d.value, 0) /
                        trends.confidenceOverTime.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
              <p className="text-xs text-gray-500">Average confidence</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniChart data={trends.successRateOverTime} color="bg-emerald-500" />
              <p className="text-xl font-bold mt-2">
                {trends.successRateOverTime.length > 0
                  ? (
                      (trends.successRateOverTime.reduce((sum, d) => sum + d.value, 0) /
                        trends.successRateOverTime.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
              <p className="text-xs text-gray-500">Average success rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Escalation Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniChart data={trends.escalationRateOverTime} color="bg-orange-500" />
              <p className="text-xl font-bold mt-2">
                {trends.escalationRateOverTime.length > 0
                  ? (
                      (trends.escalationRateOverTime.reduce((sum, d) => sum + d.value, 0) /
                        trends.escalationRateOverTime.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
              <p className="text-xs text-gray-500">Average escalation rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Category Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categories.slice(0, 10).map((cat) => (
                <div key={cat.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{cat.category}</span>
                    <span className="text-gray-500">
                      {cat.count} ({(cat.percentage * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <ProgressBar
                    value={cat.count}
                    max={categories[0]?.count || 1}
                    color="bg-blue-500"
                  />
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-gray-500 text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Handler Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Handler Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {handlers.slice(0, 10).map((handler) => (
                <div key={handler.handlerId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      {handler.handlerName || handler.handlerId.slice(0, 8)}
                    </span>
                    <div className="flex gap-2">
                      <Badge
                        variant={handler.successRate > 0.8 ? 'default' : 'secondary'}
                      >
                        {(handler.successRate * 100).toFixed(0)}%
                      </Badge>
                      <span className="text-gray-500">
                        {handler.totalAssignments}
                      </span>
                    </div>
                  </div>
                  <ProgressBar
                    value={handler.successRate * 100}
                    max={100}
                    color={
                      handler.successRate > 0.8
                        ? 'bg-green-500'
                        : handler.successRate > 0.6
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }
                  />
                </div>
              ))}
              {handlers.length === 0 && (
                <p className="text-gray-500 text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Low Confidence Decisions */}
        <Card>
          <CardHeader>
            <CardTitle>Low Confidence Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {lowConfidence.map((decision) => (
                <div
                  key={decision.decisionId}
                  className="p-3 bg-red-50 rounded-lg border border-red-100"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium text-sm">
                        {decision.requestType}
                      </span>
                      <div className="flex gap-1 mt-1">
                        {decision.categories.slice(0, 3).map((cat) => (
                          <Badge key={cat} variant="outline" className="text-xs">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge variant="destructive">
                      {(decision.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(decision.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
              {lowConfidence.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No low confidence decisions
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rule Effectiveness */}
        <Card>
          <CardHeader>
            <CardTitle>Rule Effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ruleEffectiveness.slice(0, 10).map((rule) => (
                <div key={rule.ruleId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      {rule.ruleName || rule.ruleId.slice(0, 8)}
                    </span>
                    <div className="flex gap-2">
                      <span className="text-gray-500">{rule.matchCount} matches</span>
                      <Badge
                        variant={rule.successRate > 0.8 ? 'default' : 'secondary'}
                      >
                        {(rule.successRate * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <ProgressBar
                        value={rule.successRate * 100}
                        max={100}
                        color="bg-green-500"
                      />
                    </div>
                    <div className="flex-1">
                      <ProgressBar
                        value={rule.averageConfidence * 100}
                        max={100}
                        color="bg-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 mt-1">
                    <span>Success: {(rule.successRate * 100).toFixed(0)}%</span>
                    <span>
                      Confidence: {(rule.averageConfidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
              {ruleEffectiveness.length === 0 && (
                <p className="text-gray-500 text-center py-4">No rules data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default RoutingAnalytics;
