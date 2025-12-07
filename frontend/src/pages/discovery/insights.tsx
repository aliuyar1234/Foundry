/**
 * Insights Page
 * Main page for viewing and managing organizational insights
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { InsightCard } from '../../components/discovery/InsightCard';
import { BusFactorChart } from '../../components/visualizations/BusFactorChart';
import { RiskHeatmap } from '../../components/visualizations/RiskHeatmap';
import {
  useInsights,
  useInsightSummary,
  useUrgentInsights,
  Insight,
  InsightSeverity,
  InsightStatus,
  InsightCategory,
} from '../../hooks/useInsights';

type ViewTab = 'all' | 'urgent' | 'busFactor' | 'riskExposure';

const severityOptions: InsightSeverity[] = ['critical', 'high', 'medium', 'low'];
const statusOptions: InsightStatus[] = ['new', 'acknowledged', 'in_progress', 'resolved', 'dismissed'];
const categoryOptions: InsightCategory[] = ['people', 'process', 'risk', 'opportunity'];

export function InsightsPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [selectedSeverities, setSelectedSeverities] = useState<InsightSeverity[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<InsightStatus[]>(['new', 'acknowledged']);
  const [selectedCategories, setSelectedCategories] = useState<InsightCategory[]>([]);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  const { data: summary, isLoading: summaryLoading } = useInsightSummary();
  const { data: urgentInsights } = useUrgentInsights(5);
  const { data: insights, isLoading: insightsLoading } = useInsights({
    severities: selectedSeverities.length > 0 ? selectedSeverities : undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    categories: selectedCategories.length > 0 ? selectedCategories : undefined,
    limit: 50,
  });

  const toggleFilter = <T extends string>(
    current: T[],
    value: T,
    setter: (v: T[]) => void
  ) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      setter([...current, value]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/discovery"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Discovery
          </Link>
          <h1 className="text-2xl font-bold mt-2">Organizational Insights</h1>
          <p className="text-gray-500">
            Proactive identification of risks and opportunities
          </p>
        </div>
        <Link to="/settings/alerts">
          <Button variant="outline">Configure Alerts</Button>
        </Link>
      </div>

      {/* Summary Stats */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-5 gap-4">
          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              activeTab === 'urgent' ? 'ring-2 ring-red-500' : ''
            }`}
            onClick={() => setActiveTab('urgent')}
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{summary.urgentCount}</p>
                <p className="text-sm text-gray-500">Urgent</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              activeTab === 'all' ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setActiveTab('all')}
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{summary.total}</p>
                <p className="text-sm text-gray-500">Total Insights</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{summary.newThisWeek}</p>
                <p className="text-sm text-gray-500">New This Week</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              activeTab === 'busFactor' ? 'ring-2 ring-orange-500' : ''
            }`}
            onClick={() => setActiveTab('busFactor')}
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">
                  {summary.byType?.bus_factor_risk || 0}
                </p>
                <p className="text-sm text-gray-500">Bus Factor Risks</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              activeTab === 'riskExposure' ? 'ring-2 ring-green-500' : ''
            }`}
            onClick={() => setActiveTab('riskExposure')}
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{summary.resolvedThisWeek}</p>
                <p className="text-sm text-gray-500">Resolved This Week</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'all' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('all')}
        >
          All Insights
        </Button>
        <Button
          variant={activeTab === 'urgent' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('urgent')}
        >
          Urgent
          {urgentInsights && urgentInsights.length > 0 && (
            <Badge className="ml-2 bg-red-500 text-white">{urgentInsights.length}</Badge>
          )}
        </Button>
        <Button
          variant={activeTab === 'busFactor' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('busFactor')}
        >
          Bus Factor
        </Button>
        <Button
          variant={activeTab === 'riskExposure' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('riskExposure')}
        >
          Risk Exposure
        </Button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'all' && (
        <div className="grid grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Severity</p>
                  <div className="flex flex-wrap gap-1">
                    {severityOptions.map((severity) => (
                      <Badge
                        key={severity}
                        variant="outline"
                        className={`cursor-pointer ${
                          selectedSeverities.includes(severity)
                            ? 'bg-blue-100 border-blue-500'
                            : ''
                        }`}
                        onClick={() =>
                          toggleFilter(selectedSeverities, severity, setSelectedSeverities)
                        }
                      >
                        {severity}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Status</p>
                  <div className="flex flex-wrap gap-1">
                    {statusOptions.map((status) => (
                      <Badge
                        key={status}
                        variant="outline"
                        className={`cursor-pointer ${
                          selectedStatuses.includes(status)
                            ? 'bg-blue-100 border-blue-500'
                            : ''
                        }`}
                        onClick={() =>
                          toggleFilter(selectedStatuses, status, setSelectedStatuses)
                        }
                      >
                        {status.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Category</p>
                  <div className="flex flex-wrap gap-1">
                    {categoryOptions.map((category) => (
                      <Badge
                        key={category}
                        variant="outline"
                        className={`cursor-pointer ${
                          selectedCategories.includes(category)
                            ? 'bg-blue-100 border-blue-500'
                            : ''
                        }`}
                        onClick={() =>
                          toggleFilter(selectedCategories, category, setSelectedCategories)
                        }
                      >
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedSeverities([]);
                    setSelectedStatuses(['new', 'acknowledged']);
                    setSelectedCategories([]);
                  }}
                >
                  Reset Filters
                </Button>
              </CardContent>
            </Card>

            {/* Breakdown by Severity */}
            {summary && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">By Severity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {severityOptions.map((severity) => {
                      const count = summary.bySeverity?.[severity] || 0;
                      const total = summary.total || 1;
                      return (
                        <div key={severity} className="flex items-center gap-2">
                          <div className="w-20 text-xs text-gray-600">{severity}</div>
                          <div className="flex-1 h-2 bg-gray-100 rounded">
                            <div
                              className={`h-full rounded ${
                                severity === 'critical'
                                  ? 'bg-red-500'
                                  : severity === 'high'
                                  ? 'bg-orange-500'
                                  : severity === 'medium'
                                  ? 'bg-yellow-500'
                                  : 'bg-blue-500'
                              }`}
                              style={{ width: `${(count / total) * 100}%` }}
                            />
                          </div>
                          <div className="w-8 text-xs text-right text-gray-600">{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Insights List */}
          <div className="col-span-3 space-y-4">
            {insightsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="pt-6">
                      <div className="h-6 w-48 bg-gray-200 rounded mb-2"></div>
                      <div className="h-4 w-full bg-gray-200 rounded"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : insights && insights.length > 0 ? (
              insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onViewDetail={setSelectedInsight}
                />
              ))
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No insights found
                    </h3>
                    <p className="text-gray-500">
                      Try adjusting your filters or run pattern detection
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === 'urgent' && (
        <div className="space-y-4">
          <Card className="bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="text-red-800">Urgent Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-700 text-sm">
                These insights require immediate attention based on their severity and potential impact.
              </p>
            </CardContent>
          </Card>

          {urgentInsights && urgentInsights.length > 0 ? (
            urgentInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onViewDetail={setSelectedInsight}
              />
            ))
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <h3 className="text-lg font-medium text-green-700 mb-2">
                    No urgent insights
                  </h3>
                  <p className="text-gray-500">
                    All critical issues have been addressed
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'busFactor' && <BusFactorChart showDetails={true} />}

      {activeTab === 'riskExposure' && <RiskHeatmap />}

      {/* Detail Modal would go here */}
      {selectedInsight && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedInsight(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-bold">{selectedInsight.title}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInsight(null)}
                >
                  Close
                </Button>
              </div>
              <InsightCard insight={selectedInsight} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InsightsPage;
