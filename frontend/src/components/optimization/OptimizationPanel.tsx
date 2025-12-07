/**
 * Optimization Panel Component (T102)
 * Display and manage optimization suggestions
 */

import React, { useState, useEffect } from 'react';
import { optimizationApi } from '../../services/intelligence.api';

interface OptimizationSuggestion {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string;
  priority: number;
  confidence: number;
  impact: {
    timeReduction?: { value: number; unit: string };
    costReduction?: { value: number; unit: string };
    qualityImprovement?: { value: number; unit: string };
  };
  implementation: {
    effort: string;
    complexity: string;
    steps: Array<{ title: string }>;
  };
}

interface OptimizationPanelProps {
  processId: string;
  onSuggestionSelect?: (suggestion: OptimizationSuggestion) => void;
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  processId,
  onSuggestionSelect,
}) => {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ status: '', type: '' });

  useEffect(() => {
    loadSuggestions();
  }, [processId, filter]);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      const response = await optimizationApi.query({
        processId,
        status: filter.status || undefined,
        type: filter.type || undefined,
      });
      setSuggestions(response.data.data.suggestions);
    } catch (err) {
      setError('Failed to load suggestions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDetect = async () => {
    try {
      setDetecting(true);
      await optimizationApi.detect({ processId });
      await loadSuggestions();
    } catch (err) {
      setError('Failed to detect optimizations');
      console.error(err);
    } finally {
      setDetecting(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'implement') => {
    try {
      if (action === 'approve') {
        await optimizationApi.approve(id);
      } else if (action === 'reject') {
        await optimizationApi.reject(id);
      } else {
        await optimizationApi.implement(id);
      }
      await loadSuggestions();
    } catch (err) {
      console.error(err);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BOTTLENECK':
        return 'bg-red-100 text-red-800';
      case 'AUTOMATION':
        return 'bg-purple-100 text-purple-800';
      case 'CONSOLIDATION':
        return 'bg-blue-100 text-blue-800';
      case 'PARALLELIZATION':
        return 'bg-green-100 text-green-800';
      case 'ELIMINATION':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'text-green-600';
      case 'REJECTED':
        return 'text-red-600';
      case 'IMPLEMENTED':
        return 'text-blue-600';
      default:
        return 'text-yellow-600';
    }
  };

  const getEffortIcon = (effort: string) => {
    switch (effort) {
      case 'low':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'high':
        return '🔴';
      default:
        return '⚪';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          Optimization Suggestions
        </h3>
        <button
          onClick={handleDetect}
          disabled={detecting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
        >
          {detecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Analyzing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Detect Optimizations
            </>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="IMPLEMENTED">Implemented</option>
        </select>
        <select
          value={filter.type}
          onChange={(e) => setFilter({ ...filter, type: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="BOTTLENECK">Bottleneck</option>
          <option value="AUTOMATION">Automation</option>
          <option value="CONSOLIDATION">Consolidation</option>
          <option value="PARALLELIZATION">Parallelization</option>
          <option value="ELIMINATION">Elimination</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Suggestions List */}
      <div className="space-y-4">
        {suggestions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No optimization suggestions found. Click "Detect Optimizations" to analyze the process.
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              onClick={() => onSuggestionSelect?.(suggestion)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getTypeColor(suggestion.type)}`}>
                      {suggestion.type}
                    </span>
                    <span className={`text-xs font-medium ${getStatusColor(suggestion.status)}`}>
                      {suggestion.status}
                    </span>
                  </div>
                  <h4 className="font-medium text-gray-900 mt-2">{suggestion.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">{suggestion.priority}</div>
                  <div className="text-xs text-gray-500">Priority</div>
                </div>
              </div>

              {/* Impact & Effort */}
              <div className="mt-4 flex items-center gap-6 text-sm">
                {suggestion.impact.timeReduction && (
                  <div className="flex items-center gap-1">
                    <span className="text-green-600">⏱️</span>
                    <span>-{suggestion.impact.timeReduction.value}{suggestion.impact.timeReduction.unit}</span>
                  </div>
                )}
                {suggestion.impact.costReduction && (
                  <div className="flex items-center gap-1">
                    <span className="text-green-600">💰</span>
                    <span>-{suggestion.impact.costReduction.value}{suggestion.impact.costReduction.unit}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>{getEffortIcon(suggestion.implementation.effort)}</span>
                  <span className="capitalize">{suggestion.implementation.effort} effort</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">{Math.round(suggestion.confidence * 100)}% confidence</span>
                </div>
              </div>

              {/* Actions */}
              {suggestion.status === 'PENDING' && (
                <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleAction(suggestion.id, 'approve')}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(suggestion.id, 'reject')}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              )}
              {suggestion.status === 'APPROVED' && (
                <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleAction(suggestion.id, 'implement')}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Mark Implemented
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default OptimizationPanel;
