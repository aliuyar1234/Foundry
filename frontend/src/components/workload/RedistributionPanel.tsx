/**
 * Redistribution Panel Component
 * T230 - Task redistribution suggestions and actions
 *
 * Displays and manages task redistribution recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
export interface RedistributionSuggestion {
  id: string;
  type: 'reassign' | 'split' | 'defer' | 'escalate';
  priority: 'critical' | 'high' | 'medium' | 'low';
  task: {
    id: string;
    title: string;
    currentAssignee: string;
    currentAssigneeName: string;
    estimatedHours: number;
    deadline?: string;
    priority: string;
  };
  suggestion: {
    targetAssignee?: string;
    targetAssigneeName?: string;
    newDeadline?: string;
    splitInto?: number;
    reason: string;
  };
  impact: {
    sourceLoadReduction: number;
    targetLoadIncrease?: number;
    riskMitigation: string;
  };
  confidence: number;
  constraints: string[];
}

export interface RedistributionPlan {
  teamId: string;
  generatedAt: string;
  summary: {
    totalSuggestions: number;
    expectedLoadBalancing: number;
    affectedPeople: number;
    criticalActions: number;
  };
  suggestions: RedistributionSuggestion[];
  beforeState: {
    members: Array<{ personId: string; personName: string; currentLoad: number }>;
    balanceScore: number;
  };
  afterState: {
    members: Array<{ personId: string; personName: string; currentLoad: number }>;
    balanceScore: number;
  };
}

interface RedistributionPanelProps {
  teamId: string;
  personId?: string;
  onApply?: (suggestion: RedistributionSuggestion) => void;
  onDismiss?: (suggestionId: string) => void;
}

export function RedistributionPanel({
  teamId,
  personId,
  onApply,
  onDismiss,
}: RedistributionPanelProps) {
  const [plan, setPlan] = useState<RedistributionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [selectedSuggestion, setSelectedSuggestion] = useState<RedistributionSuggestion | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const fetchPlan = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = personId
        ? `/api/workload/person/${personId}/redistribution`
        : `/api/workload/team/${teamId}/redistribution`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch redistribution plan');
      const data = await response.json();
      setPlan(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [teamId, personId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleApply = async (suggestion: RedistributionSuggestion) => {
    try {
      const response = await fetch(`/api/workload/team/${teamId}/redistribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId: suggestion.id,
          suggestion: {
            taskId: suggestion.task.id,
            targetAssignee: suggestion.suggestion.targetAssignee,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to apply redistribution');

      setAppliedSuggestions((prev) => new Set([...prev, suggestion.id]));
      onApply?.(suggestion);
    } catch (err) {
      alert('Failed to apply suggestion: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleDismiss = (suggestionId: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, suggestionId]));
    onDismiss?.(suggestionId);
  };

  const filteredSuggestions = plan?.suggestions.filter((s) => {
    if (appliedSuggestions.has(s.id) || dismissedSuggestions.has(s.id)) return false;
    if (filterPriority !== 'all' && s.priority !== filterPriority) return false;
    if (filterType !== 'all' && s.type !== filterType) return false;
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="redistribution-panel loading">
        <div className="spinner" />
        <p>Generating redistribution recommendations...</p>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="redistribution-panel error">
        <p>{error || 'Unable to load redistribution plan'}</p>
        <button onClick={fetchPlan} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="redistribution-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="header-info">
          <h3>Task Redistribution</h3>
          <span className="generated-at">
            Generated {new Date(plan.generatedAt).toLocaleString()}
          </span>
        </div>
        <button onClick={fetchPlan} className="btn btn-outline">
          ↻ Regenerate
        </button>
      </div>

      {/* Summary */}
      <div className="plan-summary">
        <div className="summary-stat">
          <span className="stat-value">{plan.summary.totalSuggestions}</span>
          <span className="stat-label">Suggestions</span>
        </div>
        <div className="summary-stat highlight">
          <span className="stat-value">+{plan.summary.expectedLoadBalancing}%</span>
          <span className="stat-label">Balance Improvement</span>
        </div>
        <div className="summary-stat">
          <span className="stat-value">{plan.summary.affectedPeople}</span>
          <span className="stat-label">People Affected</span>
        </div>
        <div className="summary-stat critical">
          <span className="stat-value">{plan.summary.criticalActions}</span>
          <span className="stat-label">Critical</span>
        </div>
      </div>

      {/* Before/After Preview */}
      <div className="before-after-preview">
        <div className="state-preview before">
          <h4>Current State</h4>
          <div className="balance-score">
            <span className={`score ${plan.beforeState.balanceScore < 50 ? 'poor' : plan.beforeState.balanceScore < 70 ? 'fair' : 'good'}`}>
              {plan.beforeState.balanceScore}
            </span>
            <span className="label">Balance Score</span>
          </div>
          <div className="member-preview">
            {plan.beforeState.members.slice(0, 5).map((m) => (
              <div key={m.personId} className="member-bar">
                <span className="name">{m.personName}</span>
                <div className="bar">
                  <div
                    className={`fill ${m.currentLoad > 100 ? 'overload' : ''}`}
                    style={{ width: `${Math.min(100, m.currentLoad)}%` }}
                  />
                </div>
                <span className="load">{m.currentLoad}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="arrow">→</div>

        <div className="state-preview after">
          <h4>Projected State</h4>
          <div className="balance-score">
            <span className={`score ${plan.afterState.balanceScore < 50 ? 'poor' : plan.afterState.balanceScore < 70 ? 'fair' : 'good'}`}>
              {plan.afterState.balanceScore}
            </span>
            <span className="label">Balance Score</span>
          </div>
          <div className="member-preview">
            {plan.afterState.members.slice(0, 5).map((m) => (
              <div key={m.personId} className="member-bar">
                <span className="name">{m.personName}</span>
                <div className="bar">
                  <div
                    className={`fill ${m.currentLoad > 100 ? 'overload' : ''}`}
                    style={{ width: `${Math.min(100, m.currentLoad)}%` }}
                  />
                </div>
                <span className="load">{m.currentLoad}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Types</option>
          <option value="reassign">Reassign</option>
          <option value="defer">Defer</option>
          <option value="split">Split</option>
          <option value="escalate">Escalate</option>
        </select>
        <span className="filter-count">
          Showing {filteredSuggestions.length} of {plan.suggestions.length}
        </span>
      </div>

      {/* Suggestions List */}
      <div className="suggestions-list">
        {filteredSuggestions.length === 0 ? (
          <div className="no-suggestions">
            <p>No suggestions match the current filters</p>
          </div>
        ) : (
          filteredSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onApply={() => handleApply(suggestion)}
              onDismiss={() => handleDismiss(suggestion.id)}
              onSelect={() => setSelectedSuggestion(suggestion)}
              isSelected={selectedSuggestion?.id === suggestion.id}
            />
          ))
        )}
      </div>

      {/* Apply All Actions */}
      {filteredSuggestions.length > 0 && (
        <div className="bulk-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              const critical = filteredSuggestions.filter((s) => s.priority === 'critical');
              critical.forEach((s) => handleApply(s));
            }}
          >
            Apply All Critical ({filteredSuggestions.filter((s) => s.priority === 'critical').length})
          </button>
          <button
            className="btn btn-outline"
            onClick={() => filteredSuggestions.forEach((s) => handleDismiss(s.id))}
          >
            Dismiss All
          </button>
        </div>
      )}

      {/* Applied Summary */}
      {appliedSuggestions.size > 0 && (
        <div className="applied-summary">
          <span className="success-icon">✓</span>
          <span>{appliedSuggestions.size} suggestions applied</span>
        </div>
      )}
    </div>
  );
}

// Suggestion Card Component
interface SuggestionCardProps {
  suggestion: RedistributionSuggestion;
  onApply: () => void;
  onDismiss: () => void;
  onSelect: () => void;
  isSelected: boolean;
}

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
  onSelect,
  isSelected,
}: SuggestionCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const typeIcons: Record<string, string> = {
    reassign: '↔️',
    defer: '⏰',
    split: '✂️',
    escalate: '⬆️',
  };

  const priorityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280',
  };

  return (
    <div
      className={`suggestion-card ${suggestion.priority} ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="card-header">
        <span className="type-icon">{typeIcons[suggestion.type]}</span>
        <div className="card-title">
          <span className="task-title">{suggestion.task.title}</span>
          <span className="suggestion-type">{suggestion.type}</span>
        </div>
        <span
          className="priority-badge"
          style={{ backgroundColor: priorityColors[suggestion.priority] }}
        >
          {suggestion.priority}
        </span>
        <span className="confidence">{suggestion.confidence}% confidence</span>
      </div>

      <div className="card-body">
        {/* Transfer Visualization */}
        <div className="transfer-viz">
          <div className="person from">
            <span className="avatar">{suggestion.task.currentAssigneeName.charAt(0)}</span>
            <span className="name">{suggestion.task.currentAssigneeName}</span>
            <span className="load-change">-{suggestion.impact.sourceLoadReduction}%</span>
          </div>

          {suggestion.type === 'reassign' && suggestion.suggestion.targetAssigneeName && (
            <>
              <span className="arrow">→</span>
              <div className="person to">
                <span className="avatar">{suggestion.suggestion.targetAssigneeName.charAt(0)}</span>
                <span className="name">{suggestion.suggestion.targetAssigneeName}</span>
                <span className="load-change">+{suggestion.impact.targetLoadIncrease}%</span>
              </div>
            </>
          )}

          {suggestion.type === 'defer' && suggestion.suggestion.newDeadline && (
            <>
              <span className="arrow">→</span>
              <div className="deadline-change">
                <span className="icon">📅</span>
                <span className="new-date">
                  {new Date(suggestion.suggestion.newDeadline).toLocaleDateString()}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Reason */}
        <p className="reason">{suggestion.suggestion.reason}</p>

        {/* Details Toggle */}
        <button
          className="details-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>

        {/* Expanded Details */}
        {showDetails && (
          <div className="card-details">
            <div className="detail-row">
              <span className="label">Task Priority:</span>
              <span className="value">{suggestion.task.priority}</span>
            </div>
            <div className="detail-row">
              <span className="label">Estimated Hours:</span>
              <span className="value">{suggestion.task.estimatedHours}h</span>
            </div>
            {suggestion.task.deadline && (
              <div className="detail-row">
                <span className="label">Deadline:</span>
                <span className="value">
                  {new Date(suggestion.task.deadline).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="detail-row">
              <span className="label">Risk Mitigation:</span>
              <span className="value">{suggestion.impact.riskMitigation}</span>
            </div>
            {suggestion.constraints.length > 0 && (
              <div className="constraints">
                <span className="label">Constraints:</span>
                <ul>
                  {suggestion.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card-actions">
        <button
          className="btn btn-small btn-outline"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          Dismiss
        </button>
        <button
          className="btn btn-small btn-primary"
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// Quick Suggestions Component
interface QuickSuggestionsProps {
  teamId: string;
  limit?: number;
  onApply?: (suggestion: RedistributionSuggestion) => void;
}

export function QuickSuggestions({ teamId, limit = 3, onApply }: QuickSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<RedistributionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchQuick() {
      try {
        const response = await fetch(`/api/workload/team/${teamId}/optimize/quick?limit=${limit}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.data || []);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    fetchQuick();
  }, [teamId, limit]);

  if (loading || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="quick-suggestions">
      <h4>Quick Wins</h4>
      {suggestions.map((s) => (
        <div key={s.id} className="quick-item">
          <div className="quick-content">
            <span className="task-name">{s.task.title}</span>
            <span className="action">
              {s.type === 'reassign' && s.suggestion.targetAssigneeName
                ? `Move to ${s.suggestion.targetAssigneeName}`
                : s.suggestion.reason}
            </span>
          </div>
          <button
            className="btn btn-small btn-primary"
            onClick={() => onApply?.(s)}
          >
            Apply
          </button>
        </div>
      ))}
    </div>
  );
}

export default RedistributionPanel;
