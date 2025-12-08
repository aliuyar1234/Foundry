/**
 * Compliance Score Component
 * T196 - Visual compliance score display with trends
 *
 * Shows overall and framework-specific compliance scores
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface ScoreData {
  overallScore: number;
  previousScore: number;
  trend: 'up' | 'down' | 'stable';
  frameworkScores: Record<ComplianceFramework, {
    score: number;
    previousScore: number;
    trend: 'up' | 'down' | 'stable';
    rulesTotal: number;
    rulesPassed: number;
  }>;
  categoryScores: Array<{
    category: string;
    score: number;
    weight: number;
  }>;
  history: Array<{
    date: string;
    score: number;
    framework?: ComplianceFramework;
  }>;
  lastUpdated: string;
}

export interface ScoreBreakdown {
  component: string;
  score: number;
  weight: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  issues: number;
}

interface ComplianceScoreProps {
  organizationId: string;
  framework?: ComplianceFramework;
  showTrend?: boolean;
  showBreakdown?: boolean;
  size?: 'small' | 'medium' | 'large';
  onScoreClick?: (framework?: ComplianceFramework) => void;
}

const SCORE_THRESHOLDS = {
  excellent: 90,
  good: 70,
  fair: 50,
  poor: 0,
};

function getScoreStatus(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= SCORE_THRESHOLDS.excellent) return 'excellent';
  if (score >= SCORE_THRESHOLDS.good) return 'good';
  if (score >= SCORE_THRESHOLDS.fair) return 'fair';
  return 'poor';
}

function getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    default: return '→';
  }
}

export function ComplianceScore({
  organizationId,
  framework,
  showTrend = true,
  showBreakdown = true,
  size = 'medium',
  onScoreClick,
}: ComplianceScoreProps) {
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<ComplianceFramework | undefined>(framework);

  const fetchScore = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId });
      if (selectedFramework) params.append('framework', selectedFramework);

      const response = await fetch(`/api/compliance/summary?${params}`);
      if (!response.ok) throw new Error('Failed to fetch compliance score');
      const data = await response.json();

      // Transform summary to score data
      const summary = data.summary;
      setScoreData({
        overallScore: summary.overallScore || 0,
        previousScore: summary.previousScore || 0,
        trend: summary.trend || 'stable',
        frameworkScores: summary.frameworkScores || {},
        categoryScores: summary.categoryScores || [],
        history: summary.history || [],
        lastUpdated: summary.lastEvaluated || new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedFramework]);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  const handleFrameworkSelect = (fw?: ComplianceFramework) => {
    setSelectedFramework(fw);
    onScoreClick?.(fw);
  };

  if (loading) {
    return (
      <div className={`compliance-score ${size} loading`}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !scoreData) {
    return (
      <div className={`compliance-score ${size} error`}>
        <span>Unable to load score</span>
        <button onClick={fetchScore} className="btn btn-small">Retry</button>
      </div>
    );
  }

  const currentScore = selectedFramework
    ? scoreData.frameworkScores[selectedFramework]?.score ?? 0
    : scoreData.overallScore;

  const currentTrend = selectedFramework
    ? scoreData.frameworkScores[selectedFramework]?.trend ?? 'stable'
    : scoreData.trend;

  const previousScore = selectedFramework
    ? scoreData.frameworkScores[selectedFramework]?.previousScore ?? 0
    : scoreData.previousScore;

  const scoreStatus = getScoreStatus(currentScore);
  const scoreDelta = currentScore - previousScore;

  return (
    <div className={`compliance-score ${size} ${scoreStatus}`}>
      {/* Main Score Display */}
      <div
        className="score-main"
        onClick={() => handleFrameworkSelect(undefined)}
        role="button"
        tabIndex={0}
      >
        <svg viewBox="0 0 100 100" className="score-circle">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            opacity="0.1"
          />
          {/* Score arc */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${currentScore * 2.83} 283`}
            transform="rotate(-90 50 50)"
            className="score-arc"
          />
        </svg>
        <div className="score-content">
          <span className="score-value">{Math.round(currentScore)}</span>
          <span className="score-percent">%</span>
          {showTrend && (
            <span className={`score-trend ${currentTrend}`}>
              {getTrendIcon(currentTrend)}
              {Math.abs(scoreDelta).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Score Label */}
      <div className="score-label">
        <span className="label-text">
          {selectedFramework ? `${selectedFramework} Score` : 'Overall Compliance'}
        </span>
        <span className={`status-badge ${scoreStatus}`}>{scoreStatus}</span>
      </div>

      {/* Framework Breakdown */}
      {showBreakdown && !selectedFramework && (
        <div className="framework-breakdown">
          {Object.entries(scoreData.frameworkScores).map(([fw, data]) => (
            <div
              key={fw}
              className={`framework-item ${getScoreStatus(data.score)}`}
              onClick={() => handleFrameworkSelect(fw as ComplianceFramework)}
              role="button"
              tabIndex={0}
            >
              <span className="framework-name">{fw}</span>
              <div className="framework-score">
                <div className="mini-bar">
                  <div
                    className="mini-fill"
                    style={{ width: `${data.score}%` }}
                  />
                </div>
                <span className="score-text">{Math.round(data.score)}%</span>
                <span className={`trend ${data.trend}`}>
                  {getTrendIcon(data.trend)}
                </span>
              </div>
              <span className="rules-info">
                {data.rulesPassed}/{data.rulesTotal} rules
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selected Framework Details */}
      {showBreakdown && selectedFramework && scoreData.frameworkScores[selectedFramework] && (
        <div className="framework-details">
          <div className="detail-header">
            <button
              onClick={() => handleFrameworkSelect(undefined)}
              className="btn btn-link"
            >
              ← All Frameworks
            </button>
          </div>
          <div className="rules-summary">
            <div className="rules-passed">
              <span className="value">
                {scoreData.frameworkScores[selectedFramework].rulesPassed}
              </span>
              <span className="label">Passed</span>
            </div>
            <div className="rules-total">
              <span className="value">
                {scoreData.frameworkScores[selectedFramework].rulesTotal}
              </span>
              <span className="label">Total Rules</span>
            </div>
          </div>
        </div>
      )}

      {/* Category Scores */}
      {showBreakdown && scoreData.categoryScores.length > 0 && (
        <div className="category-scores">
          <h4>Category Breakdown</h4>
          {scoreData.categoryScores.map((cat) => (
            <div key={cat.category} className="category-item">
              <span className="category-name">{cat.category}</span>
              <div className="category-bar">
                <div
                  className={`category-fill ${getScoreStatus(cat.score)}`}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
              <span className="category-score">{Math.round(cat.score)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Trend Chart (simplified) */}
      {showTrend && scoreData.history.length > 0 && (
        <div className="trend-chart">
          <h4>30-Day Trend</h4>
          <div className="chart-container">
            <TrendSparkline data={scoreData.history} />
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div className="last-updated">
        Last updated: {new Date(scoreData.lastUpdated).toLocaleString()}
      </div>
    </div>
  );
}

// Simple Sparkline Component
interface TrendSparklineProps {
  data: Array<{ date: string; score: number }>;
}

function TrendSparkline({ data }: TrendSparklineProps) {
  if (data.length < 2) return <p>Insufficient data for trend</p>;

  const scores = data.map((d) => d.score);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;

  const width = 200;
  const height = 50;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.score - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="sparkline">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((d.score - min) / range) * height;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="3"
            fill="currentColor"
            className="data-point"
          >
            <title>{`${d.date}: ${d.score}%`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

// Score Badge Component (for inline use)
interface ScoreBadgeProps {
  score: number;
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

export function ScoreBadge({ score, size = 'small', showLabel = false }: ScoreBadgeProps) {
  const status = getScoreStatus(score);

  return (
    <span className={`score-badge ${status} ${size}`}>
      <span className="badge-score">{Math.round(score)}%</span>
      {showLabel && <span className="badge-label">{status}</span>}
    </span>
  );
}

// Score Indicator Component (for tables)
interface ScoreIndicatorProps {
  score: number;
  previousScore?: number;
}

export function ScoreIndicator({ score, previousScore }: ScoreIndicatorProps) {
  const status = getScoreStatus(score);
  const trend = previousScore !== undefined
    ? score > previousScore ? 'up' : score < previousScore ? 'down' : 'stable'
    : 'stable';
  const delta = previousScore !== undefined ? score - previousScore : 0;

  return (
    <div className={`score-indicator ${status}`}>
      <div className="indicator-bar">
        <div className="indicator-fill" style={{ width: `${score}%` }} />
      </div>
      <span className="indicator-value">{Math.round(score)}%</span>
      {previousScore !== undefined && (
        <span className={`indicator-trend ${trend}`}>
          {getTrendIcon(trend)} {Math.abs(delta).toFixed(1)}
        </span>
      )}
    </div>
  );
}

export default ComplianceScore;
