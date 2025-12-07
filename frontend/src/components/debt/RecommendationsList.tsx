/**
 * Recommendations List Component
 * Displays prioritized debt reduction recommendations
 * T268 - Recommendations list component
 */

import React, { useState } from 'react';

interface Recommendation {
  id: string;
  priority: number;
  title: string;
  description: string;
  dimension: string;
  estimatedImpact: {
    scoreReduction: number;
    costSavings: number;
    timeToValue: string;
  };
  effort: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'moderate' | 'complex';
  prerequisites: string[];
  relatedIssues: string[];
}

interface RecommendationsListProps {
  recommendations: Recommendation[];
  currency?: string;
  onRecommendationClick?: (recommendation: Recommendation) => void;
  onImplementClick?: (recommendation: Recommendation) => void;
  maxItems?: number;
  showFilters?: boolean;
}

const DIMENSION_LABELS: Record<string, string> = {
  process: 'Process',
  knowledge: 'Knowledge',
  data: 'Data',
  technical: 'Technical',
  communication: 'Communication',
};

const DIMENSION_COLORS: Record<string, string> = {
  process: '#8b5cf6',
  knowledge: '#ec4899',
  data: '#06b6d4',
  technical: '#f59e0b',
  communication: '#10b981',
};

const EFFORT_CONFIG = {
  low: { color: '#22c55e', bg: '#dcfce7', label: 'Low Effort' },
  medium: { color: '#eab308', bg: '#fef3c7', label: 'Medium Effort' },
  high: { color: '#ef4444', bg: '#fee2e2', label: 'High Effort' },
};

const COMPLEXITY_CONFIG = {
  simple: { color: '#22c55e', label: 'Simple' },
  moderate: { color: '#eab308', label: 'Moderate' },
  complex: { color: '#ef4444', label: 'Complex' },
};

export const RecommendationsList: React.FC<RecommendationsListProps> = ({
  recommendations,
  currency = 'EUR',
  onRecommendationClick,
  onImplementClick,
  maxItems,
  showFilters = true,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterDimension, setFilterDimension] = useState<string>('all');
  const [filterEffort, setFilterEffort] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'impact' | 'effort'>('priority');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const filteredRecommendations = recommendations
    .filter((rec) => {
      if (filterDimension !== 'all' && rec.dimension !== filterDimension) return false;
      if (filterEffort !== 'all' && rec.effort !== filterEffort) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'impact':
          return b.estimatedImpact.costSavings - a.estimatedImpact.costSavings;
        case 'effort':
          const effortOrder = { low: 0, medium: 1, high: 2 };
          return effortOrder[a.effort] - effortOrder[b.effort];
        default:
          return a.priority - b.priority;
      }
    })
    .slice(0, maxItems);

  const dimensions = [...new Set(recommendations.map((r) => r.dimension))];

  return (
    <div className="recommendations-list">
      <style>{styles}</style>

      {/* Filters */}
      {showFilters && (
        <div className="filters-bar">
          <div className="filter-group">
            <label>Dimension</label>
            <select
              value={filterDimension}
              onChange={(e) => setFilterDimension(e.target.value)}
            >
              <option value="all">All Dimensions</option>
              {dimensions.map((dim) => (
                <option key={dim} value={dim}>
                  {DIMENSION_LABELS[dim]}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Effort</label>
            <select
              value={filterEffort}
              onChange={(e) => setFilterEffort(e.target.value)}
            >
              <option value="all">All Effort Levels</option>
              <option value="low">Low Effort</option>
              <option value="medium">Medium Effort</option>
              <option value="high">High Effort</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="priority">Priority</option>
              <option value="impact">Highest Impact</option>
              <option value="effort">Lowest Effort</option>
            </select>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-value">{filteredRecommendations.length}</span>
          <span className="stat-label">Recommendations</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {formatCurrency(
              filteredRecommendations.reduce(
                (sum, r) => sum + r.estimatedImpact.costSavings,
                0
              )
            )}
          </span>
          <span className="stat-label">Potential Savings</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {filteredRecommendations.reduce(
              (sum, r) => sum + r.estimatedImpact.scoreReduction,
              0
            )}{' '}
            pts
          </span>
          <span className="stat-label">Score Reduction</span>
        </div>
      </div>

      {/* Recommendations */}
      <div className="recommendations-container">
        {filteredRecommendations.map((rec) => {
          const isExpanded = expandedId === rec.id;
          const effortConfig = EFFORT_CONFIG[rec.effort];
          const complexityConfig = COMPLEXITY_CONFIG[rec.complexity];

          return (
            <div
              key={rec.id}
              className={`recommendation-card ${isExpanded ? 'expanded' : ''}`}
            >
              <div
                className="card-header"
                onClick={() => {
                  setExpandedId(isExpanded ? null : rec.id);
                  onRecommendationClick?.(rec);
                }}
              >
                <div className="priority-badge">#{rec.priority}</div>

                <div className="card-content">
                  <h3 className="card-title">{rec.title}</h3>
                  <div className="card-meta">
                    <span
                      className="dimension-tag"
                      style={{
                        backgroundColor: `${DIMENSION_COLORS[rec.dimension]}20`,
                        color: DIMENSION_COLORS[rec.dimension],
                      }}
                    >
                      {DIMENSION_LABELS[rec.dimension]}
                    </span>
                    <span
                      className="effort-tag"
                      style={{
                        backgroundColor: effortConfig.bg,
                        color: effortConfig.color,
                      }}
                    >
                      {effortConfig.label}
                    </span>
                    <span className="time-tag">{rec.estimatedImpact.timeToValue}</span>
                  </div>
                </div>

                <div className="impact-preview">
                  <div className="savings">
                    {formatCurrency(rec.estimatedImpact.costSavings)}
                    <span>/year</span>
                  </div>
                  <div className="score-reduction">
                    -{rec.estimatedImpact.scoreReduction} pts
                  </div>
                </div>

                <div className="expand-icon">{isExpanded ? '−' : '+'}</div>
              </div>

              {isExpanded && (
                <div className="card-details">
                  <div className="description">
                    <h4>Description</h4>
                    <p>{rec.description}</p>
                  </div>

                  <div className="details-grid">
                    <div className="detail-item">
                      <span className="detail-label">Complexity</span>
                      <span
                        className="detail-value"
                        style={{ color: complexityConfig.color }}
                      >
                        {complexityConfig.label}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Time to Value</span>
                      <span className="detail-value">
                        {rec.estimatedImpact.timeToValue}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Score Impact</span>
                      <span className="detail-value score-impact">
                        -{rec.estimatedImpact.scoreReduction} points
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Cost Savings</span>
                      <span className="detail-value cost-savings">
                        {formatCurrency(rec.estimatedImpact.costSavings)}/year
                      </span>
                    </div>
                  </div>

                  {rec.prerequisites.length > 0 && (
                    <div className="prerequisites">
                      <h4>Prerequisites</h4>
                      <ul>
                        {rec.prerequisites.map((prereq, i) => (
                          <li key={i}>{prereq}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rec.relatedIssues.length > 0 && (
                    <div className="related-issues">
                      <h4>Related Issues</h4>
                      <div className="issue-tags">
                        {rec.relatedIssues.map((issue, i) => (
                          <span key={i} className="issue-tag">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {onImplementClick && (
                    <button
                      className="implement-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onImplementClick(rec);
                      }}
                    >
                      Start Implementation
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredRecommendations.length === 0 && (
          <div className="empty-state">
            <p>No recommendations match your filters.</p>
            <button onClick={() => {
              setFilterDimension('all');
              setFilterEffort('all');
            }}>
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = `
  .recommendations-list {
    background: white;
    border-radius: 12px;
    padding: 24px;
  }

  .filters-bar {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .filter-group label {
    font-size: 12px;
    color: #6b7280;
  }

  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    min-width: 160px;
  }

  .filter-group select:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .summary-stats {
    display: flex;
    gap: 24px;
    padding: 16px 0;
    margin-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .stat {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 24px;
    font-weight: bold;
    color: #111827;
  }

  .stat-label {
    font-size: 12px;
    color: #6b7280;
  }

  .recommendations-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .recommendation-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .recommendation-card:hover {
    border-color: #d1d5db;
  }

  .recommendation-card.expanded {
    border-color: #3b82f6;
  }

  .card-header {
    display: grid;
    grid-template-columns: 48px 1fr 140px 32px;
    align-items: center;
    gap: 16px;
    padding: 16px;
    cursor: pointer;
    background: #f9fafb;
  }

  .recommendation-card.expanded .card-header {
    background: #eff6ff;
  }

  .priority-badge {
    width: 48px;
    height: 48px;
    background: #3b82f6;
    color: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: bold;
  }

  .card-content {
    min-width: 0;
  }

  .card-title {
    margin: 0 0 8px;
    font-size: 16px;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dimension-tag, .effort-tag, .time-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .time-tag {
    background: #f3f4f6;
    color: #6b7280;
  }

  .impact-preview {
    text-align: right;
  }

  .savings {
    font-size: 18px;
    font-weight: bold;
    color: #059669;
  }

  .savings span {
    font-size: 12px;
    font-weight: normal;
    color: #6b7280;
  }

  .score-reduction {
    font-size: 12px;
    color: #22c55e;
  }

  .expand-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: #6b7280;
    background: white;
    border-radius: 50%;
    border: 1px solid #e5e7eb;
  }

  .card-details {
    padding: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .description {
    margin-bottom: 16px;
  }

  .description h4, .prerequisites h4, .related-issues h4 {
    margin: 0 0 8px;
    font-size: 14px;
    color: #374151;
  }

  .description p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
    line-height: 1.6;
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-label {
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }

  .detail-value.score-impact {
    color: #22c55e;
  }

  .detail-value.cost-savings {
    color: #059669;
  }

  .prerequisites ul {
    margin: 0;
    padding-left: 20px;
  }

  .prerequisites li {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .related-issues {
    margin-top: 16px;
  }

  .issue-tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .issue-tag {
    font-size: 11px;
    padding: 4px 8px;
    background: #f3f4f6;
    border-radius: 4px;
    color: #6b7280;
  }

  .implement-btn {
    margin-top: 16px;
    padding: 12px 24px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .implement-btn:hover {
    background: #2563eb;
  }

  .empty-state {
    text-align: center;
    padding: 48px;
    color: #6b7280;
  }

  .empty-state button {
    margin-top: 12px;
    padding: 8px 16px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 6px;
    color: #3b82f6;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .card-header {
      grid-template-columns: 40px 1fr 32px;
    }

    .impact-preview {
      display: none;
    }

    .details-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .filters-bar {
      flex-direction: column;
    }

    .filter-group select {
      width: 100%;
    }
  }
`;

export default RecommendationsList;
