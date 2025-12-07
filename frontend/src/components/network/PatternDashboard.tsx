/**
 * Pattern Dashboard Component
 * Displays communication patterns and organizational health
 * T249 - Pattern analysis visualization
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface TemporalPattern {
  peakHours: number[];
  peakDays: number[];
  avgResponseTime: number;
  afterHoursRatio: number;
  weekendRatio: number;
  consistencyScore: number;
}

export interface BehavioralPattern {
  initiationRatio: number;
  avgThreadLength: number;
  broadcastRatio: number;
  reciprocityScore: number;
  urgencyLevel: number;
}

export interface RelationalPattern {
  strongTies: number;
  weakTies: number;
  bridgingConnections: number;
  concentrationScore: number;
  networkReach: number;
}

export interface PatternAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation?: string;
}

export interface CommunicationPattern {
  email: string;
  displayName?: string;
  department?: string;
  patterns: {
    temporal: TemporalPattern;
    behavioral: BehavioralPattern;
    relational: RelationalPattern;
  };
  anomalies: PatternAnomaly[];
  healthScore: number;
}

export interface OrganizationTrends {
  avgAfterHoursRatio: number;
  avgResponseTime: number;
  avgNetworkReach: number;
  communicationHealth: 'healthy' | 'warning' | 'concerning';
  siloRisk: number;
  collaborationScore: number;
  temporalDistribution: Array<{ hour: number; volume: number }>;
}

export interface PatternAlert {
  type: string;
  affectedPeople: string[];
  severity: 'info' | 'warning' | 'critical';
  message: string;
  recommendation: string;
}

interface PatternDashboardProps {
  patterns: CommunicationPattern[];
  organizationTrends: OrganizationTrends;
  alerts: PatternAlert[];
  onPersonSelect?: (email: string) => void;
  selectedPerson?: string;
}

const HEALTH_COLORS = {
  healthy: { bg: 'bg-green-100', text: 'text-green-800', label: 'Healthy' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Warning' },
  concerning: { bg: 'bg-red-100', text: 'text-red-800', label: 'Concerning' },
};

const SEVERITY_COLORS = {
  info: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PatternDashboard({
  patterns,
  organizationTrends,
  alerts,
  onPersonSelect,
  selectedPerson,
}: PatternDashboardProps) {
  const [viewMode, setViewMode] = useState<'overview' | 'people' | 'alerts'>('overview');
  const [sortBy, setSortBy] = useState<'health' | 'afterHours' | 'networkReach'>('health');

  // Sort patterns
  const sortedPatterns = useMemo(() => {
    const sorted = [...patterns];
    if (sortBy === 'health') {
      sorted.sort((a, b) => a.healthScore - b.healthScore);
    } else if (sortBy === 'afterHours') {
      sorted.sort((a, b) => b.patterns.temporal.afterHoursRatio - a.patterns.temporal.afterHoursRatio);
    } else {
      sorted.sort((a, b) => b.patterns.relational.networkReach - a.patterns.relational.networkReach);
    }
    return sorted;
  }, [patterns, sortBy]);

  const healthConfig = HEALTH_COLORS[organizationTrends.communicationHealth];

  return (
    <div className="space-y-6">
      {/* Organization Health Overview */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Communication Health</p>
                <p className="text-2xl font-bold mt-1">{healthConfig.label}</p>
              </div>
              <div className={`w-12 h-12 rounded-full ${healthConfig.bg} ${healthConfig.text} flex items-center justify-center text-2xl`}>
                {organizationTrends.communicationHealth === 'healthy' ? '✓' :
                 organizationTrends.communicationHealth === 'warning' ? '!' : '✗'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">After Hours Work</p>
            <p className="text-2xl font-bold text-orange-600">
              {(organizationTrends.avgAfterHoursRatio * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-gray-400">of communication</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Silo Risk</p>
            <p className="text-2xl font-bold text-purple-600">
              {(organizationTrends.siloRisk * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-gray-400">isolation level</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Collaboration Score</p>
            <p className="text-2xl font-bold text-blue-600">
              {organizationTrends.collaborationScore.toFixed(0)}
            </p>
            <p className="text-xs text-gray-400">out of 100</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span>⚠️</span> Active Alerts
                <Badge variant="secondary">{alerts.length}</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert, i) => {
                const config = SEVERITY_COLORS[alert.severity];
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${config.border} ${config.bg}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${config.bg} ${config.text}`}>
                            {alert.severity}
                          </Badge>
                          <p className="font-medium text-sm">{alert.message}</p>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{alert.recommendation}</p>
                      </div>
                      <Badge variant="outline">{alert.affectedPeople.length} affected</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('overview')}
          >
            Activity Heatmap
          </Button>
          <Button
            variant={viewMode === 'people' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('people')}
          >
            People Analysis
          </Button>
        </div>

        {viewMode === 'people' && (
          <select
            className="text-sm border rounded px-2 py-1"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="health">By Health Score</option>
            <option value="afterHours">By After Hours</option>
            <option value="networkReach">By Network Reach</option>
          </select>
        )}
      </div>

      {viewMode === 'overview' ? (
        /* Temporal Activity Heatmap */
        <Card>
          <CardHeader>
            <CardTitle>Communication Activity Pattern</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Hour-of-day chart */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Activity by Hour</p>
              <div className="flex items-end justify-between h-32 gap-1">
                {organizationTrends.temporalDistribution.map((item) => {
                  const height = (item.volume / 100) * 100;
                  const isBusinessHour = item.hour >= 9 && item.hour <= 17;

                  return (
                    <div
                      key={item.hour}
                      className="flex flex-col items-center flex-1"
                      title={`${item.hour}:00 - ${item.volume}% activity`}
                    >
                      <div
                        className={`w-full rounded-t transition-all ${
                          isBusinessHour ? 'bg-blue-400' : 'bg-orange-400'
                        }`}
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-xs text-gray-400 mt-1">
                        {item.hour.toString().padStart(2, '0')}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-400 rounded"></div>
                  <span>Business Hours (9-17)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-400 rounded"></div>
                  <span>After Hours</span>
                </div>
              </div>
            </div>

            {/* Weekly pattern */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Weekly Pattern Summary</p>
              <div className="grid grid-cols-7 gap-2">
                {DAY_LABELS.map((day, index) => {
                  const isWeekend = index === 0 || index === 6;
                  const intensity = isWeekend ? 20 : 80 + Math.random() * 20;

                  return (
                    <div key={day} className="text-center">
                      <p className="text-xs text-gray-500 mb-1">{day}</p>
                      <div
                        className={`h-8 rounded ${
                          isWeekend ? 'bg-orange-200' : 'bg-blue-400'
                        }`}
                        style={{ opacity: intensity / 100 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* People Analysis */
        <Card>
          <CardHeader>
            <CardTitle>Individual Communication Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedPatterns.slice(0, 20).map((person) => {
                const isSelected = selectedPerson === person.email;
                const healthColor = person.healthScore >= 70
                  ? 'text-green-600'
                  : person.healthScore >= 50
                    ? 'text-yellow-600'
                    : 'text-red-600';

                return (
                  <div
                    key={person.email}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 border-2'
                        : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                    }`}
                    onClick={() => onPersonSelect?.(person.email)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium">{person.displayName || person.email}</p>
                        {person.department && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {person.department}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${healthColor}`}>
                          {person.healthScore.toFixed(0)}
                        </p>
                        <p className="text-xs text-gray-500">Health Score</p>
                      </div>
                    </div>

                    {/* Pattern indicators */}
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-500">After Hours</p>
                        <p className={`font-medium ${
                          person.patterns.temporal.afterHoursRatio > 0.3
                            ? 'text-orange-600'
                            : 'text-gray-700'
                        }`}>
                          {(person.patterns.temporal.afterHoursRatio * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Network Reach</p>
                        <p className="font-medium text-gray-700">
                          {person.patterns.relational.networkReach}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Strong Ties</p>
                        <p className="font-medium text-blue-600">
                          {person.patterns.relational.strongTies}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Bridging</p>
                        <p className="font-medium text-purple-600">
                          {person.patterns.relational.bridgingConnections}
                        </p>
                      </div>
                    </div>

                    {/* Anomalies */}
                    {person.anomalies.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex flex-wrap gap-2">
                          {person.anomalies.map((anomaly, i) => {
                            const config = SEVERITY_COLORS[anomaly.severity === 'high' ? 'critical' :
                              anomaly.severity === 'medium' ? 'warning' : 'info'];
                            return (
                              <Badge
                                key={i}
                                className={`${config.bg} ${config.text} text-xs`}
                                title={anomaly.recommendation}
                              >
                                {anomaly.type.replace(/-/g, ' ')}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Legend */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Understanding the Metrics:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-700">Health Score</p>
              <p className="text-gray-500">Overall communication health (0-100)</p>
            </div>
            <div>
              <p className="font-medium text-gray-700">After Hours</p>
              <p className="text-gray-500">% of communication outside 9-5</p>
            </div>
            <div>
              <p className="font-medium text-gray-700">Network Reach</p>
              <p className="text-gray-500">Number of unique contacts</p>
            </div>
            <div>
              <p className="font-medium text-gray-700">Bridging Connections</p>
              <p className="text-gray-500">Cross-department links</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PatternDashboard;
