/**
 * ErrorLogViewer Component (T200)
 * Filterable error log with severity icons and stack trace expansion
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { formatDateTime } from '../../lib/utils';

export interface ErrorLog {
  id: string;
  timestamp: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  source?: string;
  recordId?: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
}

interface ErrorLogViewerProps {
  errors: ErrorLog[];
  isLoading?: boolean;
  maxHeight?: string;
}

const severityColors: Record<ErrorLog['severity'], string> = {
  error: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
};

const severityIcons: Record<ErrorLog['severity'], JSX.Element> = {
  error: (
    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

export function ErrorLogViewer({
  errors,
  isLoading = false,
  maxHeight = '600px',
}: ErrorLogViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<ErrorLog['severity'] | 'all'>('all');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  // Filter errors based on search and severity
  const filteredErrors = useMemo(() => {
    return errors.filter((error) => {
      const matchesSearch =
        searchTerm === '' ||
        error.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        error.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        error.source?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSeverity =
        selectedSeverity === 'all' || error.severity === selectedSeverity;

      return matchesSearch && matchesSeverity;
    });
  }, [errors, searchTerm, selectedSeverity]);

  const toggleExpand = (errorId: string) => {
    setExpandedErrors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(errorId)) {
        newSet.delete(errorId);
      } else {
        newSet.add(errorId);
      }
      return newSet;
    });
  };

  // Count errors by severity
  const errorCounts = useMemo(() => {
    return {
      error: errors.filter((e) => e.severity === 'error').length,
      warning: errors.filter((e) => e.severity === 'warning').length,
      info: errors.filter((e) => e.severity === 'info').length,
    };
  }, [errors]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-gray-100 rounded-lg p-4 h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Error Log</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-red-50">
              {errorCounts.error} Errors
            </Badge>
            <Badge variant="outline" className="bg-yellow-50">
              {errorCounts.warning} Warnings
            </Badge>
            <Badge variant="outline" className="bg-blue-50">
              {errorCounts.info} Info
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Filters */}
        <div className="mb-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Input
              type="text"
              placeholder="Search errors by message, code, or source..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Filter by:</span>
            <button
              onClick={() => setSelectedSeverity('all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedSeverity === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({errors.length})
            </button>
            <button
              onClick={() => setSelectedSeverity('error')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedSeverity === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
            >
              Errors ({errorCounts.error})
            </button>
            <button
              onClick={() => setSelectedSeverity('warning')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedSeverity === 'warning'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
              }`}
            >
              Warnings ({errorCounts.warning})
            </button>
            <button
              onClick={() => setSelectedSeverity('info')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedSeverity === 'info'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              }`}
            >
              Info ({errorCounts.info})
            </button>
          </div>
        </div>

        {/* Error List */}
        {filteredErrors.length === 0 ? (
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-gray-600">
              {searchTerm || selectedSeverity !== 'all'
                ? 'No errors match your filters'
                : 'No errors to display'}
            </p>
          </div>
        ) : (
          <div
            className="space-y-3 overflow-y-auto pr-2"
            style={{ maxHeight }}
          >
            {filteredErrors.map((error) => {
              const isExpanded = expandedErrors.has(error.id);
              const hasExpandableContent = error.stackTrace || error.context;

              return (
                <div
                  key={error.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    {/* Severity Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {severityIcons[error.severity]}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={severityColors[error.severity]}>
                            {error.severity.toUpperCase()}
                          </Badge>
                          {error.code && (
                            <Badge variant="outline" className="text-xs">
                              {error.code}
                            </Badge>
                          )}
                          {error.source && (
                            <span className="text-xs text-gray-500">{error.source}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(error.timestamp)}
                        </span>
                      </div>

                      {/* Message */}
                      <p className="text-sm text-gray-900 mb-2">{error.message}</p>

                      {/* Record ID */}
                      {error.recordId && (
                        <p className="text-xs text-gray-600 mb-2">
                          Record ID: <code className="bg-white px-1 rounded">{error.recordId}</code>
                        </p>
                      )}

                      {/* Expand/Collapse Button */}
                      {hasExpandableContent && (
                        <button
                          onClick={() => toggleExpand(error.id)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Hide Details
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Show Details
                            </>
                          )}
                        </button>
                      )}

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {/* Context */}
                          {error.context && Object.keys(error.context).length > 0 && (
                            <div className="bg-white rounded p-3 border border-gray-200">
                              <p className="text-xs font-medium text-gray-700 mb-2">Context:</p>
                              <pre className="text-xs text-gray-800 overflow-x-auto">
                                {JSON.stringify(error.context, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Stack Trace */}
                          {error.stackTrace && (
                            <div className="bg-white rounded p-3 border border-gray-200">
                              <p className="text-xs font-medium text-gray-700 mb-2">
                                Stack Trace:
                              </p>
                              <pre className="text-xs text-gray-800 overflow-x-auto font-mono whitespace-pre-wrap">
                                {error.stackTrace}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ErrorLogViewer;
