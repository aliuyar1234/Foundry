/**
 * Burnout Risk Panel Component
 * T228 - Display burnout risk analysis for individuals
 *
 * Shows detailed burnout risk factors and recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
export interface BurnoutPrediction {
  personId: string;
  personName: string;
  currentRiskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  predictedRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
  confidence: number;
  daysUntilHighRisk?: number;
  trajectory: 'improving' | 'stable' | 'declining';
}

export interface BurnoutFactorScore {
  factor: string;
  category: 'workload' | 'communication' | 'schedule' | 'engagement' | 'social';
  score: number;
  weight: number;
  weightedScore: number;
  trend: 'improving' | 'stable' | 'declining';
  indicators: Array<{
    name: string;
    value: number;
    threshold: number;
    status: 'healthy' | 'warning' | 'critical';
    description: string;
  }>;
}

export interface BurnoutRecommendation {
  priority: 'immediate' | 'short_term' | 'long_term';
  category: string;
  action: string;
  expectedImpact: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface BurnoutRiskPanelProps {
  personId: string;
  onActionClick?: (action: string, personId: string) => void;
  expanded?: boolean;
}

const RISK_COLORS = {
  low: '#22c55e',
  moderate: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

export function BurnoutRiskPanel({
  personId,
  onActionClick,
  expanded = false,
}: BurnoutRiskPanelProps) {
  const [prediction, setPrediction] = useState<BurnoutPrediction | null>(null);
  const [factors, setFactors] = useState<BurnoutFactorScore[]>([]);
  const [recommendations, setRecommendations] = useState<BurnoutRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [activeSection, setActiveSection] = useState<'factors' | 'recommendations' | 'history'>('factors');

  const fetchBurnoutData = useCallback(async () => {
    try {
      setLoading(true);
      const [burnoutRes, historyRes] = await Promise.all([
        fetch(`/api/workload/person/${personId}/burnout?includeFactors=true&includeRecommendations=true`),
        fetch(`/api/workload/person/${personId}/burnout/history?periodDays=30`),
      ]);

      if (!burnoutRes.ok) throw new Error('Failed to fetch burnout data');

      const burnoutData = await burnoutRes.json();
      setPrediction(burnoutData.data.prediction);
      setFactors(burnoutData.data.score?.factorScores || []);
      setRecommendations(burnoutData.data.score?.recommendations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    fetchBurnoutData();
  }, [fetchBurnoutData]);

  if (loading) {
    return (
      <div className="burnout-panel loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="burnout-panel error">
        <p>Unable to load burnout data</p>
        <button onClick={fetchBurnoutData} className="btn btn-small">Retry</button>
      </div>
    );
  }

  const riskColor = RISK_COLORS[prediction.riskLevel];

  return (
    <div className={`burnout-panel ${prediction.riskLevel} ${isExpanded ? 'expanded' : ''}`}>
      {/* Header */}
      <div className="panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="header-content">
          <div className="risk-indicator">
            <svg viewBox="0 0 100 100" className="risk-gauge">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#e5e5e5"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={riskColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${prediction.currentRiskScore * 2.83} 283`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="risk-value">
              <span className="score">{prediction.currentRiskScore}</span>
              <span className="max">/100</span>
            </div>
          </div>
          <div className="header-info">
            <h3>{prediction.personName}</h3>
            <span className={`risk-badge ${prediction.riskLevel}`}>
              {prediction.riskLevel.toUpperCase()} RISK
            </span>
            <span className={`trajectory ${prediction.trajectory}`}>
              {prediction.trajectory === 'improving' ? '↓ Improving' :
               prediction.trajectory === 'declining' ? '↑ Declining' : '→ Stable'}
            </span>
          </div>
        </div>
        <button className="expand-toggle">
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Prediction Alert */}
      {prediction.daysUntilHighRisk && prediction.daysUntilHighRisk < 30 && (
        <div className="prediction-alert">
          <span className="alert-icon">⚠️</span>
          <span>
            Predicted to reach {prediction.predictedRiskLevel} risk in{' '}
            <strong>{prediction.daysUntilHighRisk} days</strong> if current trends continue
          </span>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="panel-content">
          {/* Section Tabs */}
          <div className="section-tabs">
            <button
              className={`tab ${activeSection === 'factors' ? 'active' : ''}`}
              onClick={() => setActiveSection('factors')}
            >
              Risk Factors
            </button>
            <button
              className={`tab ${activeSection === 'recommendations' ? 'active' : ''}`}
              onClick={() => setActiveSection('recommendations')}
            >
              Recommendations ({recommendations.length})
            </button>
            <button
              className={`tab ${activeSection === 'history' ? 'active' : ''}`}
              onClick={() => setActiveSection('history')}
            >
              History
            </button>
          </div>

          {/* Risk Factors Section */}
          {activeSection === 'factors' && (
            <div className="factors-section">
              {factors.sort((a, b) => b.score - a.score).map((factor) => (
                <div key={factor.factor} className={`factor-item ${factor.score >= 70 ? 'high' : factor.score >= 50 ? 'moderate' : 'low'}`}>
                  <div className="factor-header">
                    <span className="factor-name">{formatFactorName(factor.factor)}</span>
                    <span className="factor-category">{factor.category}</span>
                    <span className={`factor-trend ${factor.trend}`}>
                      {factor.trend === 'improving' ? '↓' : factor.trend === 'declining' ? '↑' : '→'}
                    </span>
                  </div>
                  <div className="factor-bar">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${factor.score}%`,
                        backgroundColor: factor.score >= 70 ? '#ef4444' : factor.score >= 50 ? '#f59e0b' : '#22c55e',
                      }}
                    />
                  </div>
                  <div className="factor-details">
                    <span className="score">{factor.score}/100</span>
                    <span className="weight">Weight: {(factor.weight * 100).toFixed(0)}%</span>
                  </div>
                  {/* Indicators */}
                  <div className="indicators">
                    {factor.indicators.map((indicator, idx) => (
                      <div key={idx} className={`indicator ${indicator.status}`}>
                        <span className="indicator-name">{indicator.name}</span>
                        <span className="indicator-value">{indicator.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations Section */}
          {activeSection === 'recommendations' && (
            <div className="recommendations-section">
              {recommendations.length === 0 ? (
                <p className="no-recommendations">No recommendations at this time</p>
              ) : (
                <>
                  {/* Group by priority */}
                  {['immediate', 'short_term', 'long_term'].map((priority) => {
                    const filtered = recommendations.filter((r) => r.priority === priority);
                    if (filtered.length === 0) return null;

                    return (
                      <div key={priority} className="recommendation-group">
                        <h4 className={`group-title ${priority}`}>
                          {priority === 'immediate' ? '🚨 Immediate Actions' :
                           priority === 'short_term' ? '📋 Short Term' : '📅 Long Term'}
                        </h4>
                        {filtered.map((rec, idx) => (
                          <div key={idx} className={`recommendation-item ${rec.difficulty}`}>
                            <div className="rec-content">
                              <span className="rec-category">{rec.category}</span>
                              <p className="rec-action">{rec.action}</p>
                              <p className="rec-impact">
                                <strong>Impact:</strong> {rec.expectedImpact}
                              </p>
                            </div>
                            <div className="rec-meta">
                              <span className={`difficulty ${rec.difficulty}`}>
                                {rec.difficulty}
                              </span>
                              <button
                                className="btn btn-small btn-outline"
                                onClick={() => onActionClick?.(rec.action, personId)}
                              >
                                Take Action
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* History Section */}
          {activeSection === 'history' && (
            <div className="history-section">
              <BurnoutHistoryChart personId={personId} />
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="panel-actions">
        <button
          className="btn btn-outline"
          onClick={() => onActionClick?.('schedule_checkin', personId)}
        >
          Schedule Check-in
        </button>
        <button
          className="btn btn-outline"
          onClick={() => onActionClick?.('redistribute_tasks', personId)}
        >
          Redistribute Tasks
        </button>
        <button className="btn btn-primary">
          View Full Analysis
        </button>
      </div>
    </div>
  );
}

// Burnout History Chart
interface HistoryChartProps {
  personId: string;
}

function BurnoutHistoryChart({ personId }: HistoryChartProps) {
  const [history, setHistory] = useState<Array<{ date: string; score: number; riskLevel: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const response = await fetch(`/api/workload/person/${personId}/burnout/trend?periodDays=90&dataPoints=12`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data.data || []);
        }
      } catch {
        // Ignore errors for now
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [personId]);

  if (loading) {
    return <div className="chart-loading">Loading history...</div>;
  }

  if (history.length < 2) {
    return <p className="no-history">Insufficient data for trend chart</p>;
  }

  const scores = history.map((h) => h.score);
  const min = Math.min(...scores) - 10;
  const max = Math.max(...scores) + 10;
  const range = max - min || 1;

  const width = 300;
  const height = 100;

  const points = history.map((h, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - ((h.score - min) / range) * height;
    return { x, y, ...h };
  });

  return (
    <div className="history-chart">
      <h4>90-Day Risk Trend</h4>
      <svg viewBox={`0 0 ${width} ${height + 20}`} className="trend-svg">
        {/* Threshold lines */}
        {[30, 50, 70].map((threshold) => {
          const y = height - ((threshold - min) / range) * height;
          return (
            <g key={threshold}>
              <line
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="#e5e5e5"
                strokeDasharray="4"
              />
              <text x={width - 20} y={y - 5} fontSize="10" fill="#888">
                {threshold}
              </text>
            </g>
          );
        })}

        {/* Line */}
        <polyline
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        />

        {/* Points */}
        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill={RISK_COLORS[point.riskLevel as keyof typeof RISK_COLORS] || '#6366f1'}
            >
              <title>{`${new Date(point.date).toLocaleDateString()}: ${point.score} (${point.riskLevel})`}</title>
            </circle>
          </g>
        ))}

        {/* X-axis labels */}
        {[0, Math.floor(history.length / 2), history.length - 1].map((i) => {
          const point = points[i];
          if (!point) return null;
          return (
            <text
              key={i}
              x={point.x}
              y={height + 15}
              fontSize="10"
              textAnchor="middle"
              fill="#888"
            >
              {new Date(history[i].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// Helper Functions
function formatFactorName(factor: string): string {
  return factor
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Team Burnout Summary Component
interface TeamBurnoutSummaryProps {
  teamId: string;
  onMemberClick?: (personId: string) => void;
}

export function TeamBurnoutSummary({ teamId, onMemberClick }: TeamBurnoutSummaryProps) {
  const [summary, setSummary] = useState<{
    averageScore: number;
    distribution: { low: number; moderate: number; high: number; critical: number };
    topRiskFactors: Array<{ factor: string; affectedCount: number; averageScore: number }>;
    memberScores: Array<{
      personId: string;
      personName: string;
      overallScore: number;
      riskLevel: string;
      trendDirection: string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const response = await fetch(`/api/workload/team/${teamId}/burnout`);
        if (response.ok) {
          const data = await response.json();
          setSummary(data.data.score);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [teamId]);

  if (loading) {
    return <div className="team-burnout loading"><div className="spinner" /></div>;
  }

  if (!summary) {
    return <div className="team-burnout error">Unable to load team burnout data</div>;
  }

  return (
    <div className="team-burnout-summary">
      {/* Distribution Chart */}
      <div className="distribution-chart">
        <h4>Risk Distribution</h4>
        <div className="dist-bars">
          {(['low', 'moderate', 'high', 'critical'] as const).map((level) => (
            <div key={level} className={`dist-bar ${level}`}>
              <div
                className="bar-fill"
                style={{
                  height: `${(summary.distribution[level] / Math.max(
                    summary.distribution.low,
                    summary.distribution.moderate,
                    summary.distribution.high,
                    summary.distribution.critical,
                    1
                  )) * 100}%`,
                }}
              />
              <span className="bar-label">{summary.distribution[level]}</span>
              <span className="bar-level">{level}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Risk Factors */}
      <div className="top-factors">
        <h4>Top Team Risk Factors</h4>
        {summary.topRiskFactors.slice(0, 3).map((factor) => (
          <div key={factor.factor} className="factor-row">
            <span className="factor-name">{formatFactorName(factor.factor)}</span>
            <span className="factor-affected">{factor.affectedCount} affected</span>
            <span className="factor-score">{Math.round(factor.averageScore)}</span>
          </div>
        ))}
      </div>

      {/* At-Risk Members */}
      <div className="at-risk-members">
        <h4>Members Needing Attention</h4>
        {summary.memberScores
          .filter((m) => m.riskLevel === 'high' || m.riskLevel === 'critical')
          .slice(0, 5)
          .map((member) => (
            <div
              key={member.personId}
              className={`member-row ${member.riskLevel}`}
              onClick={() => onMemberClick?.(member.personId)}
            >
              <span className="member-name">{member.personName}</span>
              <span className={`risk-level ${member.riskLevel}`}>{member.riskLevel}</span>
              <span className={`trend ${member.trendDirection}`}>
                {member.trendDirection === 'improving' ? '↓' :
                 member.trendDirection === 'declining' ? '↑' : '→'}
              </span>
              <span className="score">{member.overallScore}</span>
            </div>
          ))}
        {summary.memberScores.filter((m) => m.riskLevel === 'high' || m.riskLevel === 'critical').length === 0 && (
          <p className="no-at-risk">No team members at high risk</p>
        )}
      </div>
    </div>
  );
}

export default BurnoutRiskPanel;
