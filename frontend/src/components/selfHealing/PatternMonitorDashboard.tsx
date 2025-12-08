/**
 * Pattern Monitor Dashboard Component
 * T156 - Create pattern monitoring dashboard component
 *
 * Displays detected patterns and their status
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export interface DetectedPattern {
  id: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedEntities: Array<{
    type: string;
    id: string;
    name: string;
    impact: 'direct' | 'indirect';
  }>;
  occurrences: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  suggestedActions: string[];
  matchedActions: string[];
}

export interface PatternStatistics {
  totalDetected: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  recentPatterns: DetectedPattern[];
}

interface PatternMonitorDashboardProps {
  organizationId: string;
  onRefresh?: () => void;
  onPatternSelect?: (pattern: DetectedPattern) => void;
  onTriggerScan?: () => void;
  autoRefreshInterval?: number;
}

// =============================================================================
// Component
// =============================================================================

export function PatternMonitorDashboard({
  organizationId,
  onRefresh,
  onPatternSelect,
  onTriggerScan,
  autoRefreshInterval = 60000,
}: PatternMonitorDashboardProps) {
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [statistics, setStatistics] = useState<PatternStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Fetch pattern statistics
  const fetchStatistics = useCallback(async () => {
    try {
      const response = await fetch(`/api/self-healing/patterns/statistics`, {
        headers: {
          'X-Organization-Id': organizationId,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data);
        setPatterns(data.recentPatterns || []);
      }
    } catch (error) {
      console.error('Failed to fetch pattern statistics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  // Trigger pattern scan
  const handleScan = async () => {
    setIsScanning(true);
    try {
      const response = await fetch(`/api/self-healing/patterns/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({
          timeWindowMinutes: 60,
          autoExecute: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPatterns(data.patterns || []);
        setLastScanTime(new Date());
        onTriggerScan?.();
      }
    } catch (error) {
      console.error('Pattern scan failed:', error);
    } finally {
      setIsScanning(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    fetchStatistics();

    if (autoRefreshInterval > 0) {
      const interval = setInterval(fetchStatistics, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchStatistics, autoRefreshInterval]);

  // Filter patterns
  const filteredPatterns = patterns.filter((p) => {
    if (selectedSeverity && p.severity !== selectedSeverity) return false;
    if (selectedType && p.type !== selectedType) return false;
    return true;
  });

  const severityColors = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  const patternTypeLabels: Record<string, string> = {
    stuck_process: 'Stuck Process',
    integration_failure: 'Integration Failure',
    workload_imbalance: 'Workload Imbalance',
    approval_bottleneck: 'Approval Bottleneck',
    response_delay: 'Response Delay',
    repeated_errors: 'Repeated Errors',
    communication_gap: 'Communication Gap',
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{statistics?.totalDetected || 0}</div>
            <p className="text-sm text-gray-500">Patterns Detected</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {(statistics?.bySeverity?.critical || 0) + (statistics?.bySeverity?.high || 0)}
            </div>
            <p className="text-sm text-gray-500">High Priority</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">
              {statistics?.bySeverity?.medium || 0}
            </div>
            <p className="text-sm text-gray-500">Medium Priority</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {statistics?.bySeverity?.low || 0}
            </div>
            <p className="text-sm text-gray-500">Low Priority</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pattern Monitor</CardTitle>
            <div className="flex items-center gap-2">
              {lastScanTime && (
                <span className="text-sm text-gray-500">
                  Last scan: {lastScanTime.toLocaleTimeString()}
                </span>
              )}
              <Button onClick={handleScan} disabled={isScanning}>
                {isScanning ? 'Scanning...' : 'Scan Now'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b">
            <span className="text-sm font-medium text-gray-500 self-center mr-2">
              Filter:
            </span>

            {/* Severity Filters */}
            {['critical', 'high', 'medium', 'low'].map((severity) => (
              <Badge
                key={severity}
                className={`cursor-pointer ${
                  selectedSeverity === severity
                    ? severityColors[severity as keyof typeof severityColors]
                    : 'bg-gray-100 text-gray-600'
                }`}
                onClick={() =>
                  setSelectedSeverity(selectedSeverity === severity ? null : severity)
                }
              >
                {severity} ({statistics?.bySeverity?.[severity] || 0})
              </Badge>
            ))}

            {/* Type Filters */}
            {Object.entries(statistics?.byType || {}).map(([type, count]) => (
              <Badge
                key={type}
                className={`cursor-pointer ${
                  selectedType === type
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
                onClick={() => setSelectedType(selectedType === type ? null : type)}
              >
                {patternTypeLabels[type] || type} ({count})
              </Badge>
            ))}

            {(selectedSeverity || selectedType) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedSeverity(null);
                  setSelectedType(null);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Pattern List */}
          {filteredPatterns.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No patterns detected</p>
              <p className="text-sm">
                Click "Scan Now" to check for operational patterns
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  severityColors={severityColors}
                  patternTypeLabels={patternTypeLabels}
                  onClick={() => onPatternSelect?.(pattern)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Pattern Card Sub-component
// =============================================================================

interface PatternCardProps {
  pattern: DetectedPattern;
  severityColors: Record<string, string>;
  patternTypeLabels: Record<string, string>;
  onClick?: () => void;
}

function PatternCard({
  pattern,
  severityColors,
  patternTypeLabels,
  onClick,
}: PatternCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
        pattern.severity === 'critical'
          ? 'border-red-300 bg-red-50'
          : pattern.severity === 'high'
          ? 'border-orange-300 bg-orange-50'
          : 'border-gray-200'
      }`}
      onClick={() => {
        setIsExpanded(!isExpanded);
        onClick?.();
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={severityColors[pattern.severity]}>
              {pattern.severity}
            </Badge>
            <Badge variant="outline">
              {patternTypeLabels[pattern.type] || pattern.type}
            </Badge>
            {pattern.occurrences > 1 && (
              <Badge variant="secondary">{pattern.occurrences}x</Badge>
            )}
          </div>
          <p className="font-medium">{pattern.description}</p>
          <p className="text-sm text-gray-500 mt-1">
            First detected:{' '}
            {new Date(pattern.firstDetectedAt).toLocaleString()}
            {pattern.occurrences > 1 && (
              <>
                {' '}
                | Last:{' '}
                {new Date(pattern.lastDetectedAt).toLocaleString()}
              </>
            )}
          </p>
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t space-y-3">
          {/* Affected Entities */}
          {pattern.affectedEntities.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-2">Affected Entities:</h5>
              <div className="flex flex-wrap gap-2">
                {pattern.affectedEntities.map((entity, idx) => (
                  <Badge
                    key={idx}
                    variant={entity.impact === 'direct' ? 'default' : 'outline'}
                  >
                    {entity.name} ({entity.type})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Actions */}
          {pattern.suggestedActions.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-2">Suggested Actions:</h5>
              <ul className="text-sm text-gray-600 list-disc list-inside">
                {pattern.suggestedActions.map((action, idx) => (
                  <li key={idx}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Matched Automated Actions */}
          {pattern.matchedActions.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-2">Matched Automations:</h5>
              <div className="flex gap-2">
                {pattern.matchedActions.map((actionId) => (
                  <Badge key={actionId} variant="secondary">
                    Action: {actionId.substring(0, 8)}...
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PatternMonitorDashboard;
