/**
 * Execution History Viewer Component
 * T158 - Create execution history viewer
 *
 * Displays history of automated action executions with filtering and details
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export type ExecutionStatus =
  | 'pending'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export interface ActionExecution {
  id: string;
  actionId: string;
  actionName: string;
  actionType: string;
  status: ExecutionStatus;
  triggeredBy: 'pattern' | 'schedule' | 'manual' | 'event';
  triggeredAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  errorMessage?: string;
  rollbackAvailable: boolean;
  rolledBackAt?: string;
  patternId?: string;
  patternDescription?: string;
  executedBy?: string;
  approvedBy?: string;
}

export interface ExecutionStatistics {
  total: number;
  byStatus: Record<ExecutionStatus, number>;
  byActionType: Record<string, number>;
  successRate: number;
  avgDurationMs: number;
  recentExecutions: ActionExecution[];
}

interface ExecutionHistoryViewerProps {
  organizationId: string;
  actionId?: string;
  onRollback?: (executionId: string) => void;
  onViewDetails?: (execution: ActionExecution) => void;
  limit?: number;
}

// =============================================================================
// Component
// =============================================================================

export function ExecutionHistoryViewer({
  organizationId,
  actionId,
  onRollback,
  onViewDetails,
  limit = 50,
}: ExecutionHistoryViewerProps) {
  const [executions, setExecutions] = useState<ActionExecution[]>([]);
  const [statistics, setStatistics] = useState<ExecutionStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<ExecutionStatus | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // Fetch execution history
  const fetchExecutions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      if (actionId) params.append('actionId', actionId);
      if (selectedStatus) params.append('status', selectedStatus);

      const response = await fetch(
        `/api/self-healing/executions?${params.toString()}`,
        {
          headers: {
            'X-Organization-Id': organizationId,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
        setStatistics(data.statistics || null);
      }
    } catch (error) {
      console.error('Failed to fetch execution history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, actionId, selectedStatus, dateRange, limit]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  // Handle rollback request
  const handleRollback = async (executionId: string) => {
    if (!confirm('Are you sure you want to rollback this execution?')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/self-healing/executions/${executionId}/rollback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': organizationId,
          },
          body: JSON.stringify({ reason: 'Manual rollback from UI' }),
        }
      );

      if (response.ok) {
        onRollback?.(executionId);
        fetchExecutions();
      }
    } catch (error) {
      console.error('Rollback request failed:', error);
    }
  };

  // Filter executions
  const filteredExecutions = executions.filter((e) => {
    if (selectedStatus && e.status !== selectedStatus) return false;
    if (selectedActionType && e.actionType !== selectedActionType) return false;
    return true;
  });

  const statusColors: Record<ExecutionStatus, string> = {
    pending: 'bg-gray-100 text-gray-700',
    approved: 'bg-blue-100 text-blue-700',
    executing: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    rolled_back: 'bg-purple-100 text-purple-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  const actionTypeLabels: Record<string, string> = {
    send_reminder: 'Send Reminder',
    escalate: 'Escalate',
    retry_operation: 'Retry Operation',
    redistribute_workload: 'Redistribute',
    notify: 'Notify',
    custom: 'Custom',
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
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.total}</div>
              <p className="text-sm text-gray-500">Total Executions</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {statistics.byStatus?.completed || 0}
              </div>
              <p className="text-sm text-gray-500">Completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {statistics.byStatus?.failed || 0}
              </div>
              <p className="text-sm text-gray-500">Failed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(statistics.successRate * 100)}%
              </div>
              <p className="text-sm text-gray-500">Success Rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {statistics.avgDurationMs > 1000
                  ? `${(statistics.avgDurationMs / 1000).toFixed(1)}s`
                  : `${Math.round(statistics.avgDurationMs)}ms`}
              </div>
              <p className="text-sm text-gray-500">Avg Duration</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main History View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Execution History</CardTitle>
            <Button variant="outline" onClick={fetchExecutions}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Date Range and Filters */}
          <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-500">From:</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, start: e.target.value }))
                }
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-500">To:</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, end: e.target.value }))
                }
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          {/* Status Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-sm font-medium text-gray-500 self-center mr-2">
              Status:
            </span>
            {(
              [
                'completed',
                'failed',
                'executing',
                'pending',
                'rolled_back',
                'cancelled',
              ] as ExecutionStatus[]
            ).map((status) => (
              <Badge
                key={status}
                className={`cursor-pointer ${
                  selectedStatus === status
                    ? statusColors[status]
                    : 'bg-gray-100 text-gray-600'
                }`}
                onClick={() =>
                  setSelectedStatus(selectedStatus === status ? null : status)
                }
              >
                {status.replace('_', ' ')} ({statistics?.byStatus?.[status] || 0})
              </Badge>
            ))}

            {(selectedStatus || selectedActionType) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedStatus(null);
                  setSelectedActionType(null);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Execution List */}
          {filteredExecutions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No executions found</p>
              <p className="text-sm">
                Adjust the date range or filters to see execution history
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExecutions.map((execution) => (
                <ExecutionCard
                  key={execution.id}
                  execution={execution}
                  statusColors={statusColors}
                  actionTypeLabels={actionTypeLabels}
                  isExpanded={expandedId === execution.id}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === execution.id ? null : execution.id)
                  }
                  onRollback={
                    execution.rollbackAvailable ? () => handleRollback(execution.id) : undefined
                  }
                  onViewDetails={() => onViewDetails?.(execution)}
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
// Execution Card Sub-component
// =============================================================================

interface ExecutionCardProps {
  execution: ActionExecution;
  statusColors: Record<ExecutionStatus, string>;
  actionTypeLabels: Record<string, string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRollback?: () => void;
  onViewDetails?: () => void;
}

function ExecutionCard({
  execution,
  statusColors,
  actionTypeLabels,
  isExpanded,
  onToggleExpand,
  onRollback,
  onViewDetails,
}: ExecutionCardProps) {
  const getDuration = () => {
    if (!execution.startedAt || !execution.completedAt) return null;
    const start = new Date(execution.startedAt).getTime();
    const end = new Date(execution.completedAt).getTime();
    const durationMs = end - start;
    return durationMs > 1000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${durationMs}ms`;
  };

  return (
    <div
      className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
        execution.status === 'failed'
          ? 'border-red-200 bg-red-50'
          : execution.status === 'rolled_back'
          ? 'border-purple-200 bg-purple-50'
          : 'border-gray-200'
      }`}
    >
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={statusColors[execution.status]}>
              {execution.status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">
              {actionTypeLabels[execution.actionType] || execution.actionType}
            </Badge>
            <span className="text-sm text-gray-500">
              {execution.triggeredBy === 'pattern' && '🔍'}
              {execution.triggeredBy === 'schedule' && '⏰'}
              {execution.triggeredBy === 'manual' && '👤'}
              {execution.triggeredBy === 'event' && '⚡'}
            </span>
          </div>
          <p className="font-medium">{execution.actionName}</p>
          <p className="text-sm text-gray-500">
            Triggered: {new Date(execution.triggeredAt).toLocaleString()}
            {getDuration() && <> | Duration: {getDuration()}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRollback && execution.status === 'completed' && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onRollback();
              }}
            >
              Rollback
            </Button>
          )}
          <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t space-y-3">
          {/* Timeline */}
          <div>
            <h5 className="text-sm font-medium mb-2">Timeline:</h5>
            <div className="text-sm space-y-1 pl-4 border-l-2 border-gray-200">
              <p>
                <span className="text-gray-500">Triggered:</span>{' '}
                {new Date(execution.triggeredAt).toLocaleString()}
                {execution.executedBy && ` by ${execution.executedBy}`}
              </p>
              {execution.approvedBy && (
                <p>
                  <span className="text-gray-500">Approved:</span> by{' '}
                  {execution.approvedBy}
                </p>
              )}
              {execution.startedAt && (
                <p>
                  <span className="text-gray-500">Started:</span>{' '}
                  {new Date(execution.startedAt).toLocaleString()}
                </p>
              )}
              {execution.completedAt && (
                <p>
                  <span className="text-gray-500">Completed:</span>{' '}
                  {new Date(execution.completedAt).toLocaleString()}
                </p>
              )}
              {execution.rolledBackAt && (
                <p>
                  <span className="text-gray-500">Rolled back:</span>{' '}
                  {new Date(execution.rolledBackAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Pattern Info */}
          {execution.patternDescription && (
            <div>
              <h5 className="text-sm font-medium mb-1">Triggered by Pattern:</h5>
              <p className="text-sm text-gray-600">{execution.patternDescription}</p>
            </div>
          )}

          {/* Result */}
          {execution.result && Object.keys(execution.result).length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-1">Result:</h5>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error Message */}
          {execution.errorMessage && (
            <div>
              <h5 className="text-sm font-medium mb-1 text-red-600">Error:</h5>
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {execution.errorMessage}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {onViewDetails && (
              <Button size="sm" variant="outline" onClick={onViewDetails}>
                View Full Details
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ExecutionHistoryViewer;
