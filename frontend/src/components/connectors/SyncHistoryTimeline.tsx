/**
 * SyncHistoryTimeline Component (T199)
 * Timeline of sync events showing records synced, duration, and errors
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatDateTime, formatDuration } from '../../lib/utils';

export interface SyncEvent {
  id: string;
  status: 'completed' | 'failed' | 'partial' | 'running' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  recordsProcessed?: number;
  recordsCreated?: number;
  recordsUpdated?: number;
  recordsDeleted?: number;
  recordsFailed?: number;
  errorCount?: number;
  errors?: SyncError[];
  triggeredBy?: 'manual' | 'scheduled' | 'webhook';
  syncType?: 'full' | 'incremental';
}

export interface SyncError {
  id: string;
  message: string;
  recordId?: string;
  timestamp: string;
  severity?: 'error' | 'warning';
}

interface SyncHistoryTimelineProps {
  events: SyncEvent[];
  isLoading?: boolean;
  onRetry?: (eventId: string) => void;
  onViewDetails?: (eventId: string) => void;
}

const statusColors: Record<SyncEvent['status'], string> = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const statusIcons: Record<SyncEvent['status'], JSX.Element> = {
  completed: (
    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  ),
  failed: (
    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  ),
  partial: (
    <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  ),
  running: (
    <svg
      className="w-5 h-5 text-blue-600 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  ),
  cancelled: (
    <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

export function SyncHistoryTimeline({
  events,
  isLoading = false,
  onRetry,
  onViewDetails,
}: SyncHistoryTimelineProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const toggleExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/4 bg-gray-200 rounded" />
                    <div className="h-3 w-1/2 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-gray-600">No sync history available</p>
            <p className="text-sm text-gray-500 mt-1">
              Sync events will appear here once the connector starts syncing
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

          {/* Events */}
          <div className="space-y-6">
            {events.map((event, index) => {
              const isExpanded = expandedEvents.has(event.id);
              const hasDetails =
                event.errors && event.errors.length > 0;

              return (
                <div key={event.id} className="relative pl-12">
                  {/* Icon */}
                  <div className="absolute left-0 top-0 w-10 h-10 bg-white rounded-full border-2 border-gray-200 flex items-center justify-center">
                    {statusIcons[event.status]}
                  </div>

                  {/* Content */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={statusColors[event.status]}>
                            {event.status}
                          </Badge>
                          {event.syncType && (
                            <Badge variant="outline" className="text-xs">
                              {event.syncType}
                            </Badge>
                          )}
                          {event.triggeredBy && (
                            <span className="text-xs text-gray-500">
                              via {event.triggeredBy}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {formatDateTime(event.startedAt)}
                        </p>
                      </div>

                      {event.duration && (
                        <span className="text-sm text-gray-600">
                          {formatDuration(event.duration)}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      {event.recordsProcessed !== undefined && (
                        <StatItem
                          label="Processed"
                          value={event.recordsProcessed}
                          color="blue"
                        />
                      )}
                      {event.recordsCreated !== undefined && (
                        <StatItem
                          label="Created"
                          value={event.recordsCreated}
                          color="green"
                        />
                      )}
                      {event.recordsUpdated !== undefined && (
                        <StatItem
                          label="Updated"
                          value={event.recordsUpdated}
                          color="blue"
                        />
                      )}
                      {event.recordsFailed !== undefined && event.recordsFailed > 0 && (
                        <StatItem
                          label="Failed"
                          value={event.recordsFailed}
                          color="red"
                        />
                      )}
                    </div>

                    {/* Errors Preview */}
                    {event.errorCount !== undefined && event.errorCount > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                        <p className="text-sm text-red-800">
                          {event.errorCount} error{event.errorCount > 1 ? 's' : ''} occurred
                          during sync
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {hasDetails && (
                        <button
                          onClick={() => toggleExpand(event.id)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {isExpanded ? 'Hide Details' : 'Show Details'}
                        </button>
                      )}
                      {event.status === 'failed' && onRetry && (
                        <button
                          onClick={() => onRetry(event.id)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Retry
                        </button>
                      )}
                      {onViewDetails && (
                        <button
                          onClick={() => onViewDetails(event.id)}
                          className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                        >
                          View Full Details
                        </button>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && hasDetails && event.errors && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-900 mb-2">Errors:</p>
                        <div className="space-y-2">
                          {event.errors.slice(0, 5).map((error) => (
                            <div
                              key={error.id}
                              className="bg-white rounded p-2 text-sm border border-red-200"
                            >
                              <div className="flex items-start gap-2">
                                <svg
                                  className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <div className="flex-1">
                                  <p className="text-gray-900">{error.message}</p>
                                  {error.recordId && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      Record ID: {error.recordId}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {event.errors.length > 5 && (
                            <p className="text-xs text-gray-500 text-center">
                              +{event.errors.length - 5} more errors
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'red';
}) {
  const colorClasses = {
    blue: 'text-blue-900',
    green: 'text-green-900',
    red: 'text-red-900',
  };

  return (
    <div>
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`text-lg font-semibold ${colorClasses[color]}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default SyncHistoryTimeline;
