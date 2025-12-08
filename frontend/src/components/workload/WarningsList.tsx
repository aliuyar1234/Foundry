/**
 * Warnings List Component
 * T232 - Display and manage early warning alerts
 *
 * Shows active warnings with actions to acknowledge or resolve
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
export interface EarlyWarning {
  id: string;
  personId: string;
  personName: string;
  type: WarningType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  detectedAt: string;
  signals: WarningSignal[];
  suggestedActions: SuggestedAction[];
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export type WarningType =
  | 'workload_spike'
  | 'sustained_overload'
  | 'after_hours_pattern'
  | 'communication_surge'
  | 'deadline_cluster'
  | 'isolation_detected'
  | 'declining_performance'
  | 'missed_breaks'
  | 'response_pressure'
  | 'burnout_trajectory';

export interface WarningSignal {
  metric: string;
  currentValue: number;
  threshold: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
  description: string;
}

export interface SuggestedAction {
  action: string;
  priority: 'immediate' | 'soon' | 'when_possible';
  owner: 'individual' | 'manager' | 'team';
  expectedImpact: string;
}

interface WarningsListProps {
  teamId?: string;
  personId?: string;
  onWarningClick?: (warning: EarlyWarning) => void;
  onPersonClick?: (personId: string) => void;
  showFilters?: boolean;
  compact?: boolean;
}

const WARNING_TYPE_ICONS: Record<WarningType, string> = {
  workload_spike: '📈',
  sustained_overload: '🔥',
  after_hours_pattern: '🌙',
  communication_surge: '💬',
  deadline_cluster: '📅',
  isolation_detected: '🏝️',
  declining_performance: '📉',
  missed_breaks: '☕',
  response_pressure: '⏰',
  burnout_trajectory: '🚨',
};

const SEVERITY_COLORS = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export function WarningsList({
  teamId,
  personId,
  onWarningClick,
  onPersonClick,
  showFilters = true,
  compact = false,
}: WarningsListProps) {
  const [warnings, setWarnings] = useState<EarlyWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [expandedWarningId, setExpandedWarningId] = useState<string | null>(null);

  const fetchWarnings = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = personId
        ? `/api/workload/person/${personId}/warnings`
        : teamId
        ? `/api/workload/team/${teamId}/warnings`
        : null;

      if (!endpoint) {
        setWarnings([]);
        return;
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch warnings');
      const data = await response.json();

      setWarnings(data.data?.warnings || data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [teamId, personId]);

  useEffect(() => {
    fetchWarnings();
  }, [fetchWarnings]);

  const handleAcknowledge = async (warningId: string) => {
    try {
      const response = await fetch(`/api/workload/warnings/${warningId}/acknowledge`, {
        method: 'POST',
      });
      if (response.ok) {
        setWarnings((prev) =>
          prev.map((w) =>
            w.id === warningId ? { ...w, status: 'acknowledged' } : w
          )
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleResolve = async (warningId: string, resolution?: string) => {
    try {
      const response = await fetch(`/api/workload/warnings/${warningId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      if (response.ok) {
        setWarnings((prev) =>
          prev.map((w) =>
            w.id === warningId ? { ...w, status: 'resolved' } : w
          )
        );
      }
    } catch {
      // Ignore
    }
  };

  const filteredWarnings = warnings.filter((w) => {
    if (filterSeverity !== 'all' && w.severity !== filterSeverity) return false;
    if (filterType !== 'all' && w.type !== filterType) return false;
    if (filterStatus !== 'all' && w.status !== filterStatus) return false;
    return true;
  });

  // Group by severity for summary
  const severityCounts = warnings.reduce(
    (acc, w) => {
      if (w.status === 'active' || w.status === 'acknowledged') {
        acc[w.severity] = (acc[w.severity] || 0) + 1;
      }
      return acc;
    },
    { critical: 0, warning: 0, info: 0 }
  );

  if (loading) {
    return (
      <div className={`warnings-list ${compact ? 'compact' : ''} loading`}>
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`warnings-list ${compact ? 'compact' : ''} error`}>
        <p>{error}</p>
        <button onClick={fetchWarnings} className="btn btn-small">Retry</button>
      </div>
    );
  }

  return (
    <div className={`warnings-list ${compact ? 'compact' : ''}`}>
      {/* Header */}
      <div className="list-header">
        <div className="header-info">
          <h3>Early Warnings</h3>
          <div className="severity-summary">
            {severityCounts.critical > 0 && (
              <span className="severity-badge critical">
                {severityCounts.critical} Critical
              </span>
            )}
            {severityCounts.warning > 0 && (
              <span className="severity-badge warning">
                {severityCounts.warning} Warning
              </span>
            )}
            {severityCounts.info > 0 && (
              <span className="severity-badge info">
                {severityCounts.info} Info
              </span>
            )}
          </div>
        </div>
        <button onClick={fetchWarnings} className="btn btn-outline btn-small">
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="list-filters">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Types</option>
            {Object.keys(WARNING_TYPE_ICONS).map((type) => (
              <option key={type} value={type}>
                {formatWarningType(type)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Warnings */}
      <div className="warnings-content">
        {filteredWarnings.length === 0 ? (
          <div className="no-warnings">
            <span className="icon">✓</span>
            <p>No active warnings</p>
          </div>
        ) : (
          filteredWarnings.map((warning) => (
            <WarningCard
              key={warning.id}
              warning={warning}
              expanded={expandedWarningId === warning.id}
              onToggle={() =>
                setExpandedWarningId(
                  expandedWarningId === warning.id ? null : warning.id
                )
              }
              onClick={() => onWarningClick?.(warning)}
              onPersonClick={() => onPersonClick?.(warning.personId)}
              onAcknowledge={() => handleAcknowledge(warning.id)}
              onResolve={(res) => handleResolve(warning.id, res)}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Warning Card
interface WarningCardProps {
  warning: EarlyWarning;
  expanded: boolean;
  onToggle: () => void;
  onClick?: () => void;
  onPersonClick?: () => void;
  onAcknowledge: () => void;
  onResolve: (resolution?: string) => void;
  compact: boolean;
}

function WarningCard({
  warning,
  expanded,
  onToggle,
  onClick,
  onPersonClick,
  onAcknowledge,
  onResolve,
  compact,
}: WarningCardProps) {
  const [showResolveInput, setShowResolveInput] = useState(false);
  const [resolution, setResolution] = useState('');

  return (
    <div
      className={`warning-card ${warning.severity} ${warning.status} ${expanded ? 'expanded' : ''}`}
      onClick={onClick}
    >
      <div className="card-main" onClick={onToggle}>
        <div className="warning-icon">
          {WARNING_TYPE_ICONS[warning.type] || '⚠️'}
        </div>
        <div className="warning-content">
          <div className="warning-header">
            <span className="warning-title">{warning.title}</span>
            <span
              className="severity-indicator"
              style={{ backgroundColor: SEVERITY_COLORS[warning.severity] }}
            />
          </div>
          <p className="warning-description">{warning.description}</p>
          {!compact && (
            <div className="warning-meta">
              <span
                className="person-name"
                onClick={(e) => {
                  e.stopPropagation();
                  onPersonClick?.();
                }}
              >
                👤 {warning.personName}
              </span>
              <span className="detected-at">
                {formatTimeAgo(new Date(warning.detectedAt))}
              </span>
              <span className={`status-badge ${warning.status}`}>
                {warning.status}
              </span>
            </div>
          )}
        </div>
        <button className="expand-btn">{expanded ? '▲' : '▼'}</button>
      </div>

      {/* Expanded Content */}
      {expanded && !compact && (
        <div className="card-expanded">
          {/* Signals */}
          <div className="signals-section">
            <h4>Detection Signals</h4>
            {warning.signals.map((signal, i) => (
              <div key={i} className={`signal-item ${signal.trend}`}>
                <div className="signal-header">
                  <span className="metric">{signal.metric}</span>
                  <span className={`trend ${signal.trend}`}>
                    {signal.trend === 'increasing' ? '↑' : signal.trend === 'decreasing' ? '↓' : '→'}
                  </span>
                </div>
                <div className="signal-bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(100, (signal.currentValue / signal.threshold) * 100)}%`,
                      backgroundColor:
                        signal.currentValue >= signal.threshold ? '#ef4444' : '#22c55e',
                    }}
                  />
                  <div
                    className="threshold-marker"
                    style={{ left: `${Math.min(100, 100)}%` }}
                  />
                </div>
                <div className="signal-values">
                  <span>Current: {signal.currentValue}</span>
                  <span>Threshold: {signal.threshold}</span>
                  <span>{signal.confidence}% confidence</span>
                </div>
                <p className="signal-description">{signal.description}</p>
              </div>
            ))}
          </div>

          {/* Suggested Actions */}
          <div className="actions-section">
            <h4>Suggested Actions</h4>
            {warning.suggestedActions.map((action, i) => (
              <div key={i} className={`action-item ${action.priority}`}>
                <div className="action-header">
                  <span className={`priority-badge ${action.priority}`}>
                    {action.priority}
                  </span>
                  <span className={`owner-badge ${action.owner}`}>
                    {action.owner}
                  </span>
                </div>
                <p className="action-text">{action.action}</p>
                <p className="expected-impact">Impact: {action.expectedImpact}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          {warning.status === 'active' && (
            <div className="card-actions">
              <button
                className="btn btn-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge();
                }}
              >
                Acknowledge
              </button>
              <button
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowResolveInput(true);
                }}
              >
                Resolve
              </button>
            </div>
          )}

          {warning.status === 'acknowledged' && (
            <div className="card-actions">
              <button
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowResolveInput(true);
                }}
              >
                Mark Resolved
              </button>
            </div>
          )}

          {/* Resolve Input */}
          {showResolveInput && (
            <div className="resolve-input" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="What actions were taken? (optional)"
                rows={2}
              />
              <div className="resolve-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => setShowResolveInput(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    onResolve(resolution);
                    setShowResolveInput(false);
                  }}
                >
                  Resolve
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper Functions
function formatWarningType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

// Compact Warning Badge for inline display
interface WarningBadgeProps {
  count: number;
  severity?: 'critical' | 'warning' | 'info';
  onClick?: () => void;
}

export function WarningBadge({ count, severity = 'warning', onClick }: WarningBadgeProps) {
  if (count === 0) return null;

  return (
    <span
      className={`warning-badge ${severity}`}
      onClick={onClick}
      style={{ backgroundColor: SEVERITY_COLORS[severity] }}
    >
      {count}
    </span>
  );
}

export default WarningsList;
