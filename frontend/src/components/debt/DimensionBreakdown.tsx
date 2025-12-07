/**
 * Dimension Breakdown Component
 * Detailed view of a single debt dimension
 * T265 - Dimension breakdown component
 */

import React, { useState } from 'react';

interface SubDimension {
  name: string;
  score: number;
  description: string;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface DebtIssue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost?: number;
  affectedEntities: string[];
  suggestedAction: string;
}

interface DimensionData {
  name: string;
  score: number;
  weight: number;
  trend: 'improving' | 'stable' | 'degrading';
  subDimensions: SubDimension[];
  topIssues: DebtIssue[];
  recommendations: string[];
  metrics?: Record<string, number | string>;
}

interface DimensionBreakdownProps {
  dimension: DimensionData;
  onIssueClick?: (issue: DebtIssue) => void;
  expanded?: boolean;
}

const IMPACT_COLORS = {
  low: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  medium: { bg: '#fef3c7', text: '#92400e', border: '#eab308' },
  high: { bg: '#ffedd5', text: '#9a3412', border: '#f97316' },
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

const TREND_INFO = {
  improving: { icon: '↗', color: '#22c55e', label: 'Improving' },
  stable: { icon: '→', color: '#6b7280', label: 'Stable' },
  degrading: { icon: '↘', color: '#ef4444', label: 'Degrading' },
};

export const DimensionBreakdown: React.FC<DimensionBreakdownProps> = ({
  dimension,
  onIssueClick,
  expanded = true,
}) => {
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [activeTab, setActiveTab] = useState<'subdimensions' | 'issues' | 'recommendations'>('subdimensions');

  const trend = TREND_INFO[dimension.trend];
  const displayedIssues = showAllIssues ? dimension.topIssues : dimension.topIssues.slice(0, 3);

  const getScoreColor = (score: number): string => {
    if (score <= 20) return '#22c55e';
    if (score <= 40) return '#84cc16';
    if (score <= 60) return '#eab308';
    if (score <= 80) return '#f97316';
    return '#ef4444';
  };

  return (
    <div className="dimension-breakdown">
      <style>{styles}</style>

      {/* Header */}
      <div className="breakdown-header">
        <div className="dimension-info">
          <h2 className="dimension-name">{dimension.name} Debt</h2>
          <div className="dimension-meta">
            <span className="weight">Weight: {(dimension.weight * 100).toFixed(0)}%</span>
            <span className="trend" style={{ color: trend.color }}>
              {trend.icon} {trend.label}
            </span>
          </div>
        </div>

        <div className="score-display">
          <div
            className="score-circle"
            style={{ borderColor: getScoreColor(dimension.score) }}
          >
            <span className="score-value">{dimension.score}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'subdimensions' ? 'active' : ''}`}
          onClick={() => setActiveTab('subdimensions')}
        >
          Sub-Dimensions ({dimension.subDimensions.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'issues' ? 'active' : ''}`}
          onClick={() => setActiveTab('issues')}
        >
          Issues ({dimension.topIssues.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          Recommendations ({dimension.recommendations.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'subdimensions' && (
          <div className="subdimensions-panel">
            {dimension.subDimensions.map((sub, i) => {
              const colors = IMPACT_COLORS[sub.impactLevel];
              return (
                <div
                  key={i}
                  className="subdimension-row"
                  style={{ borderLeftColor: colors.border }}
                >
                  <div className="subdim-header">
                    <span className="subdim-name">{sub.name}</span>
                    <span
                      className="impact-badge"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {sub.impactLevel}
                    </span>
                  </div>

                  <div className="subdim-score-bar">
                    <div
                      className="score-fill"
                      style={{
                        width: `${sub.score}%`,
                        backgroundColor: getScoreColor(sub.score),
                      }}
                    />
                    <span className="score-text">{sub.score}</span>
                  </div>

                  <p className="subdim-description">{sub.description}</p>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="issues-panel">
            {displayedIssues.map((issue) => {
              const colors = IMPACT_COLORS[issue.severity];
              return (
                <div
                  key={issue.id}
                  className="issue-row"
                  style={{ borderLeftColor: colors.border }}
                  onClick={() => onIssueClick?.(issue)}
                >
                  <div className="issue-header">
                    <span
                      className="severity-badge"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {issue.severity}
                    </span>
                    <h4 className="issue-title">{issue.title}</h4>
                  </div>

                  <p className="issue-description">{issue.description}</p>

                  <div className="issue-action">
                    <strong>Suggested Action:</strong> {issue.suggestedAction}
                  </div>

                  {issue.estimatedCost && (
                    <div className="issue-cost">
                      Estimated Annual Impact: EUR {issue.estimatedCost.toLocaleString()}
                    </div>
                  )}

                  {issue.affectedEntities.length > 0 && (
                    <div className="affected-entities">
                      <strong>Affected:</strong>
                      <ul>
                        {issue.affectedEntities.slice(0, 3).map((entity, i) => (
                          <li key={i}>{entity}</li>
                        ))}
                        {issue.affectedEntities.length > 3 && (
                          <li className="more">
                            +{issue.affectedEntities.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}

            {dimension.topIssues.length > 3 && (
              <button
                className="show-more-btn"
                onClick={() => setShowAllIssues(!showAllIssues)}
              >
                {showAllIssues
                  ? 'Show Less'
                  : `Show ${dimension.topIssues.length - 3} More Issues`}
              </button>
            )}
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="recommendations-panel">
            {dimension.recommendations.map((rec, i) => (
              <div key={i} className="recommendation-row">
                <span className="rec-number">{i + 1}</span>
                <p className="rec-text">{rec}</p>
              </div>
            ))}

            {dimension.recommendations.length === 0 && (
              <div className="empty-state">
                <p>No specific recommendations for this dimension.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metrics (if available) */}
      {dimension.metrics && Object.keys(dimension.metrics).length > 0 && (
        <div className="metrics-section">
          <h3>Key Metrics</h3>
          <div className="metrics-grid">
            {Object.entries(dimension.metrics).map(([key, value]) => (
              <div key={key} className="metric-item">
                <span className="metric-label">{formatMetricLabel(key)}</span>
                <span className="metric-value">
                  {typeof value === 'number' ? formatMetricValue(key, value) : value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function formatMetricLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function formatMetricValue(key: string, value: number): string {
  if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('percentage')) {
    return `${value.toFixed(1)}%`;
  }
  if (key.toLowerCase().includes('count')) {
    return value.toFixed(0);
  }
  if (key.toLowerCase().includes('score')) {
    return value.toFixed(0);
  }
  return value.toFixed(2);
}

const styles = `
  .dimension-breakdown {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .breakdown-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .dimension-name {
    margin: 0 0 8px;
    font-size: 24px;
    color: #111827;
  }

  .dimension-meta {
    display: flex;
    gap: 16px;
    font-size: 14px;
  }

  .weight {
    color: #6b7280;
  }

  .trend {
    font-weight: 500;
  }

  .score-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 6px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
  }

  .score-value {
    font-size: 28px;
    font-weight: bold;
    color: #111827;
  }

  .tab-nav {
    display: flex;
    gap: 4px;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 20px;
  }

  .tab-btn {
    padding: 12px 20px;
    border: none;
    background: none;
    font-size: 14px;
    color: #6b7280;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: #374151;
  }

  .tab-btn.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }

  .subdimension-row, .issue-row {
    padding: 16px;
    margin-bottom: 12px;
    border-radius: 8px;
    background: #f9fafb;
    border-left: 4px solid;
  }

  .subdim-header, .issue-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .subdim-name {
    font-weight: 600;
    color: #374151;
  }

  .impact-badge, .severity-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .subdim-score-bar {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    position: relative;
    margin-bottom: 8px;
  }

  .score-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .score-text {
    position: absolute;
    right: 0;
    top: -20px;
    font-size: 12px;
    font-weight: 600;
    color: #374151;
  }

  .subdim-description, .issue-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .issue-row {
    cursor: pointer;
    transition: background 0.2s;
  }

  .issue-row:hover {
    background: #f3f4f6;
  }

  .issue-title {
    margin: 0;
    font-size: 16px;
    color: #374151;
  }

  .issue-action {
    font-size: 13px;
    color: #374151;
    margin-top: 12px;
    padding: 8px;
    background: white;
    border-radius: 4px;
  }

  .issue-cost {
    font-size: 13px;
    color: #ef4444;
    margin-top: 8px;
    font-weight: 500;
  }

  .affected-entities {
    font-size: 12px;
    color: #6b7280;
    margin-top: 8px;
  }

  .affected-entities ul {
    margin: 4px 0 0;
    padding-left: 16px;
  }

  .affected-entities .more {
    color: #9ca3af;
    font-style: italic;
  }

  .show-more-btn {
    width: 100%;
    padding: 12px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 8px;
    color: #3b82f6;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
  }

  .show-more-btn:hover {
    background: #f9fafb;
  }

  .recommendation-row {
    display: flex;
    gap: 12px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .rec-number {
    width: 28px;
    height: 28px;
    background: #3b82f6;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .rec-text {
    margin: 0;
    color: #374151;
    line-height: 1.5;
  }

  .empty-state {
    text-align: center;
    padding: 32px;
    color: #9ca3af;
  }

  .metrics-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
  }

  .metrics-section h3 {
    margin: 0 0 16px;
    font-size: 16px;
    color: #374151;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }

  .metric-item {
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .metric-label {
    display: block;
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .metric-value {
    font-size: 20px;
    font-weight: 600;
    color: #111827;
  }
`;

export default DimensionBreakdown;
