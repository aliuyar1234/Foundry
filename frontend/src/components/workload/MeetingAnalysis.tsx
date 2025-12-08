/**
 * Meeting Analysis Component
 * T233 - Analyze meeting patterns and provide optimization suggestions
 *
 * Displays meeting statistics, patterns, and recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
interface MeetingStats {
  totalMeetings: number;
  totalHours: number;
  avgDuration: number;
  avgPerDay: number;
  avgPerWeek: number;
  busiestDay: string;
  busiestHour: number;
  focusTimeRatio: number;
  backToBackRatio: number;
  recurringRatio: number;
  largeGroupRatio: number;
  afterHoursRatio: number;
}

interface MeetingPattern {
  type: 'excessive_duration' | 'back_to_back' | 'after_hours' | 'too_many_attendees' | 'recurring_overhead' | 'fragmented_focus';
  severity: 'low' | 'medium' | 'high';
  description: string;
  occurrences: number;
  impact: string;
}

interface MeetingOptimization {
  id: string;
  type: 'cancel' | 'shorten' | 'combine' | 'async' | 'reduce_attendees' | 'reschedule';
  title: string;
  description: string;
  meetings: string[];
  potentialSavings: number;
  confidence: number;
  status: 'suggested' | 'applied' | 'dismissed';
}

interface MeetingAnalysisData {
  personId: string;
  period: {
    start: string;
    end: string;
  };
  stats: MeetingStats;
  patterns: MeetingPattern[];
  distribution: {
    byDay: Record<string, number>;
    byHour: Record<string, number>;
    byType: Record<string, number>;
  };
  optimizations: MeetingOptimization[];
}

interface MeetingAnalysisProps {
  personId?: string;
  teamId?: string;
  onOptimizationApply?: (optimization: MeetingOptimization) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MeetingAnalysis({
  personId,
  teamId,
  onOptimizationApply,
}: MeetingAnalysisProps) {
  const [analysis, setAnalysis] = useState<MeetingAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'optimizations'>('overview');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');

  const fetchAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = personId
        ? `/api/workload/person/${personId}/meetings?period=${period}`
        : teamId
        ? `/api/workload/team/${teamId}/meetings?period=${period}`
        : null;

      if (!endpoint) {
        setError('No person or team specified');
        return;
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch meeting analysis');
      const data = await response.json();

      setAnalysis(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [personId, teamId, period]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const handleApplyOptimization = async (optimization: MeetingOptimization) => {
    try {
      const response = await fetch(`/api/workload/optimizations/${optimization.id}/apply`, {
        method: 'POST',
      });
      if (response.ok) {
        setAnalysis((prev) =>
          prev
            ? {
                ...prev,
                optimizations: prev.optimizations.map((o) =>
                  o.id === optimization.id ? { ...o, status: 'applied' } : o
                ),
              }
            : null
        );
        onOptimizationApply?.(optimization);
      }
    } catch {
      // Ignore
    }
  };

  const handleDismissOptimization = async (optimizationId: string) => {
    try {
      await fetch(`/api/workload/optimizations/${optimizationId}/dismiss`, {
        method: 'POST',
      });
      setAnalysis((prev) =>
        prev
          ? {
              ...prev,
              optimizations: prev.optimizations.map((o) =>
                o.id === optimizationId ? { ...o, status: 'dismissed' } : o
              ),
            }
          : null
      );
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <div className="meeting-analysis loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="meeting-analysis error">
        <p>{error || 'No data available'}</p>
        <button onClick={fetchAnalysis} className="btn btn-small">Retry</button>
      </div>
    );
  }

  return (
    <div className="meeting-analysis">
      {/* Header */}
      <div className="analysis-header">
        <h3>Meeting Analysis</h3>
        <div className="header-controls">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'week' | 'month' | 'quarter')}
            className="period-select"
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
          </select>
          <button onClick={fetchAnalysis} className="btn btn-outline btn-small">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="analysis-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'patterns' ? 'active' : ''}`}
          onClick={() => setActiveTab('patterns')}
        >
          Patterns
          {analysis.patterns.filter((p) => p.severity === 'high').length > 0 && (
            <span className="tab-badge">
              {analysis.patterns.filter((p) => p.severity === 'high').length}
            </span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'optimizations' ? 'active' : ''}`}
          onClick={() => setActiveTab('optimizations')}
        >
          Optimizations
          {analysis.optimizations.filter((o) => o.status === 'suggested').length > 0 && (
            <span className="tab-badge">
              {analysis.optimizations.filter((o) => o.status === 'suggested').length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="analysis-content">
        {activeTab === 'overview' && (
          <OverviewTab stats={analysis.stats} distribution={analysis.distribution} />
        )}
        {activeTab === 'patterns' && <PatternsTab patterns={analysis.patterns} />}
        {activeTab === 'optimizations' && (
          <OptimizationsTab
            optimizations={analysis.optimizations}
            onApply={handleApplyOptimization}
            onDismiss={handleDismissOptimization}
          />
        )}
      </div>
    </div>
  );
}

// Overview Tab
interface OverviewTabProps {
  stats: MeetingStats;
  distribution: MeetingAnalysisData['distribution'];
}

function OverviewTab({ stats, distribution }: OverviewTabProps) {
  return (
    <div className="overview-tab">
      {/* Key Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.totalMeetings}</span>
          <span className="stat-label">Total Meetings</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.totalHours.toFixed(1)}h</span>
          <span className="stat-label">Total Hours</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.avgDuration}m</span>
          <span className="stat-label">Avg Duration</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.avgPerDay.toFixed(1)}</span>
          <span className="stat-label">Avg Per Day</span>
        </div>
      </div>

      {/* Health Indicators */}
      <div className="health-indicators">
        <h4>Meeting Health</h4>
        <div className="indicator-grid">
          <HealthIndicator
            label="Focus Time"
            value={stats.focusTimeRatio}
            target={0.4}
            unit="%"
            inverse={false}
          />
          <HealthIndicator
            label="Back-to-Back"
            value={stats.backToBackRatio}
            target={0.2}
            unit="%"
            inverse={true}
          />
          <HealthIndicator
            label="After Hours"
            value={stats.afterHoursRatio}
            target={0.05}
            unit="%"
            inverse={true}
          />
          <HealthIndicator
            label="Large Groups"
            value={stats.largeGroupRatio}
            target={0.15}
            unit="%"
            inverse={true}
          />
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="distribution-section">
        <div className="distribution-chart">
          <h4>By Day of Week</h4>
          <div className="bar-chart horizontal">
            {DAY_NAMES.map((day) => {
              const value = distribution.byDay[day] || 0;
              const maxValue = Math.max(...Object.values(distribution.byDay));
              return (
                <div key={day} className="bar-row">
                  <span className="bar-label">{day}</span>
                  <div className="bar-container">
                    <div
                      className="bar-fill"
                      style={{ width: `${(value / maxValue) * 100}%` }}
                    />
                  </div>
                  <span className="bar-value">{value}h</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="distribution-chart">
          <h4>By Hour of Day</h4>
          <HourlyHeatmap distribution={distribution.byHour} />
        </div>
      </div>

      {/* Meeting Types */}
      <div className="types-section">
        <h4>Meeting Types</h4>
        <div className="types-list">
          {Object.entries(distribution.byType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => {
              const total = Object.values(distribution.byType).reduce((s, v) => s + v, 0);
              const pct = (count / total) * 100;
              return (
                <div key={type} className="type-item">
                  <span className="type-name">{formatMeetingType(type)}</span>
                  <div className="type-bar">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="type-value">{count} ({pct.toFixed(0)}%)</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// Health Indicator
interface HealthIndicatorProps {
  label: string;
  value: number;
  target: number;
  unit: string;
  inverse: boolean;
}

function HealthIndicator({ label, value, target, unit, inverse }: HealthIndicatorProps) {
  const displayValue = (value * 100).toFixed(0);
  const targetValue = (target * 100).toFixed(0);
  const isGood = inverse ? value <= target : value >= target;

  return (
    <div className={`health-indicator ${isGood ? 'good' : 'bad'}`}>
      <div className="indicator-header">
        <span className="indicator-label">{label}</span>
        <span className="indicator-status">{isGood ? '✓' : '⚠'}</span>
      </div>
      <div className="indicator-value">
        <span className="current">{displayValue}{unit}</span>
        <span className="target">target: {inverse ? '<' : '>'}{targetValue}{unit}</span>
      </div>
      <div className="indicator-bar">
        <div
          className="bar-fill"
          style={{
            width: `${Math.min(100, inverse ? (value / target) * 100 : (value / 1) * 100)}%`,
            backgroundColor: isGood ? '#22c55e' : '#ef4444',
          }}
        />
        {!inverse && (
          <div className="target-marker" style={{ left: `${target * 100}%` }} />
        )}
      </div>
    </div>
  );
}

// Hourly Heatmap
interface HourlyHeatmapProps {
  distribution: Record<string, number>;
}

function HourlyHeatmap({ distribution }: HourlyHeatmapProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const maxValue = Math.max(...Object.values(distribution), 1);

  return (
    <div className="hourly-heatmap">
      <div className="heatmap-grid">
        {hours.map((hour) => {
          const value = distribution[hour.toString()] || 0;
          const intensity = value / maxValue;
          return (
            <div
              key={hour}
              className="heatmap-cell"
              style={{
                backgroundColor: `rgba(59, 130, 246, ${intensity})`,
              }}
              title={`${hour}:00 - ${value} hours`}
            >
              {hour % 4 === 0 && <span className="hour-label">{hour}</span>}
            </div>
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span>Low</span>
        <div className="legend-gradient" />
        <span>High</span>
      </div>
    </div>
  );
}

// Patterns Tab
interface PatternsTabProps {
  patterns: MeetingPattern[];
}

function PatternsTab({ patterns }: PatternsTabProps) {
  const sortedPatterns = [...patterns].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  if (patterns.length === 0) {
    return (
      <div className="patterns-tab empty">
        <span className="icon">✓</span>
        <p>No concerning patterns detected</p>
      </div>
    );
  }

  return (
    <div className="patterns-tab">
      <p className="patterns-intro">
        Detected {patterns.length} patterns affecting meeting effectiveness
      </p>
      <div className="patterns-list">
        {sortedPatterns.map((pattern, i) => (
          <div key={i} className={`pattern-card ${pattern.severity}`}>
            <div className="pattern-header">
              <span className={`severity-badge ${pattern.severity}`}>
                {pattern.severity}
              </span>
              <span className="pattern-type">{formatPatternType(pattern.type)}</span>
            </div>
            <p className="pattern-description">{pattern.description}</p>
            <div className="pattern-meta">
              <span className="occurrences">{pattern.occurrences} occurrences</span>
              <span className="impact">{pattern.impact}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Optimizations Tab
interface OptimizationsTabProps {
  optimizations: MeetingOptimization[];
  onApply: (opt: MeetingOptimization) => void;
  onDismiss: (id: string) => void;
}

function OptimizationsTab({ optimizations, onApply, onDismiss }: OptimizationsTabProps) {
  const pendingOptimizations = optimizations.filter((o) => o.status === 'suggested');
  const totalSavings = pendingOptimizations.reduce((sum, o) => sum + o.potentialSavings, 0);

  if (optimizations.length === 0) {
    return (
      <div className="optimizations-tab empty">
        <span className="icon">💡</span>
        <p>No optimization suggestions available</p>
      </div>
    );
  }

  return (
    <div className="optimizations-tab">
      {/* Summary */}
      <div className="optimizations-summary">
        <span className="summary-count">{pendingOptimizations.length} suggestions</span>
        <span className="potential-savings">
          Potential savings: {formatHours(totalSavings)}
        </span>
      </div>

      {/* Optimization Cards */}
      <div className="optimizations-list">
        {optimizations.map((opt) => (
          <div key={opt.id} className={`optimization-card ${opt.status}`}>
            <div className="opt-header">
              <span className={`type-icon ${opt.type}`}>
                {getOptimizationIcon(opt.type)}
              </span>
              <span className="opt-title">{opt.title}</span>
              <span className="confidence">{(opt.confidence * 100).toFixed(0)}% confidence</span>
            </div>
            <p className="opt-description">{opt.description}</p>
            <div className="opt-savings">
              <span className="savings-label">Potential savings:</span>
              <span className="savings-value">{formatHours(opt.potentialSavings)}</span>
            </div>
            {opt.meetings.length > 0 && (
              <div className="affected-meetings">
                <span className="meetings-label">Affected meetings:</span>
                <span className="meetings-count">{opt.meetings.length}</span>
              </div>
            )}
            {opt.status === 'suggested' && (
              <div className="opt-actions">
                <button
                  className="btn btn-outline btn-small"
                  onClick={() => onDismiss(opt.id)}
                >
                  Dismiss
                </button>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => onApply(opt)}
                >
                  Apply
                </button>
              </div>
            )}
            {opt.status !== 'suggested' && (
              <div className={`opt-status ${opt.status}`}>
                {opt.status === 'applied' ? '✓ Applied' : '✗ Dismissed'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper Functions
function formatMeetingType(type: string): string {
  const types: Record<string, string> = {
    '1on1': '1:1 Meetings',
    team: 'Team Meetings',
    client: 'Client Meetings',
    standup: 'Standups',
    review: 'Reviews',
    planning: 'Planning',
    other: 'Other',
  };
  return types[type] || type;
}

function formatPatternType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function getOptimizationIcon(type: string): string {
  const icons: Record<string, string> = {
    cancel: '🗑️',
    shorten: '⏱️',
    combine: '🔗',
    async: '📧',
    reduce_attendees: '👥',
    reschedule: '📅',
  };
  return icons[type] || '💡';
}

export default MeetingAnalysis;
