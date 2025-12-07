/**
 * Debt Score Dashboard
 * Main dashboard component for organizational debt visualization
 * T263 - Debt score dashboard component
 */

import React, { useState, useEffect } from 'react';

interface DebtScore {
  id: string;
  organizationId: string;
  calculatedAt: string;
  overallScore: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  overallTrend: 'improving' | 'stable' | 'degrading';
  dimensions: {
    process: DimensionScore;
    knowledge: DimensionScore;
    data: DimensionScore;
    technical: DimensionScore;
    communication: DimensionScore;
  };
  estimatedAnnualCost: CostEstimate;
  topRecommendations: Recommendation[];
  previousScore?: number;
  scoreChange?: number;
  benchmarkComparison?: 'below' | 'at' | 'above';
}

interface DimensionScore {
  name: string;
  score: number;
  weight: number;
  trend: 'improving' | 'stable' | 'degrading';
  subDimensions: SubDimension[];
  topIssues: DebtIssue[];
  recommendations: string[];
}

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

interface CostEstimate {
  totalAnnualCost: number;
  currency: string;
  breakdown: {
    dimension: string;
    cost: number;
    percentage: number;
  }[];
  confidenceLevel: 'low' | 'medium' | 'high';
}

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
}

interface DebtScoreDashboardProps {
  organizationId: string;
  onDimensionClick?: (dimension: string) => void;
  onRecommendationClick?: (recommendation: Recommendation) => void;
}

const GRADE_COLORS = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
};

const TREND_ICONS = {
  improving: '↗',
  stable: '→',
  degrading: '↘',
};

const DIMENSION_LABELS: Record<string, string> = {
  process: 'Process',
  knowledge: 'Knowledge',
  data: 'Data',
  technical: 'Technical',
  communication: 'Communication',
};

export const DebtScoreDashboard: React.FC<DebtScoreDashboardProps> = ({
  organizationId,
  onDimensionClick,
  onRecommendationClick,
}) => {
  const [score, setScore] = useState<DebtScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);

  useEffect(() => {
    fetchDebtScore();
  }, [organizationId]);

  const fetchDebtScore = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/debt/${organizationId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setScore(null);
          setError('No debt score calculated yet');
        } else {
          throw new Error('Failed to fetch debt score');
        }
        return;
      }
      const data = await response.json();
      setScore(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/debt/calculate/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error('Failed to calculate debt score');
      const data = await response.json();
      setScore(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDimensionClick = (dimension: string) => {
    setSelectedDimension(selectedDimension === dimension ? null : dimension);
    onDimensionClick?.(dimension);
  };

  if (loading) {
    return (
      <div className="debt-dashboard loading">
        <div className="spinner" />
        <p>Loading debt score...</p>
      </div>
    );
  }

  if (error && !score) {
    return (
      <div className="debt-dashboard empty">
        <div className="empty-state">
          <h3>No Debt Score Available</h3>
          <p>{error}</p>
          <button onClick={handleCalculate} className="calculate-btn">
            Calculate Debt Score
          </button>
        </div>
      </div>
    );
  }

  if (!score) return null;

  return (
    <div className="debt-dashboard">
      <style>{styles}</style>

      {/* Header with Overall Score */}
      <div className="dashboard-header">
        <div className="score-card main">
          <div
            className="grade-circle"
            style={{ backgroundColor: GRADE_COLORS[score.overallGrade] }}
          >
            <span className="grade">{score.overallGrade}</span>
          </div>
          <div className="score-info">
            <h2>Organizational Debt Score</h2>
            <div className="score-value">
              <span className="number">{score.overallScore}</span>
              <span className="max">/100</span>
              <span className={`trend ${score.overallTrend}`}>
                {TREND_ICONS[score.overallTrend]}
              </span>
            </div>
            {score.scoreChange !== undefined && (
              <div className={`change ${score.scoreChange < 0 ? 'positive' : 'negative'}`}>
                {score.scoreChange > 0 ? '+' : ''}{score.scoreChange} from previous
              </div>
            )}
            <div className="calculated-at">
              Last calculated: {new Date(score.calculatedAt).toLocaleDateString()}
            </div>
          </div>
          <button onClick={handleCalculate} className="recalculate-btn">
            Recalculate
          </button>
        </div>

        {/* Cost Estimate */}
        <div className="cost-card">
          <h3>Estimated Annual Cost</h3>
          <div className="cost-value">
            {score.estimatedAnnualCost.currency} {' '}
            {score.estimatedAnnualCost.totalAnnualCost.toLocaleString()}
          </div>
          <div className="confidence">
            Confidence: {score.estimatedAnnualCost.confidenceLevel}
          </div>
        </div>

        {/* Benchmark */}
        {score.benchmarkComparison && (
          <div className="benchmark-card">
            <h3>Industry Benchmark</h3>
            <div className={`benchmark-status ${score.benchmarkComparison}`}>
              {score.benchmarkComparison === 'below' && 'Below Average'}
              {score.benchmarkComparison === 'at' && 'At Average'}
              {score.benchmarkComparison === 'above' && 'Above Average'}
            </div>
          </div>
        )}
      </div>

      {/* Dimension Cards */}
      <div className="dimensions-section">
        <h3>Debt Dimensions</h3>
        <div className="dimension-cards">
          {Object.entries(score.dimensions).map(([key, dim]) => (
            <div
              key={key}
              className={`dimension-card ${selectedDimension === key ? 'selected' : ''}`}
              onClick={() => handleDimensionClick(key)}
            >
              <div className="dimension-header">
                <span className="dimension-name">{DIMENSION_LABELS[key]}</span>
                <span className={`trend ${dim.trend}`}>{TREND_ICONS[dim.trend]}</span>
              </div>
              <div className="dimension-score">
                <div
                  className="score-bar"
                  style={{
                    width: `${dim.score}%`,
                    backgroundColor: getScoreColor(dim.score),
                  }}
                />
                <span className="score-label">{dim.score}</span>
              </div>
              <div className="dimension-weight">Weight: {(dim.weight * 100).toFixed(0)}%</div>
              <div className="issue-count">
                {dim.topIssues.length} issues found
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Dimension Details */}
      {selectedDimension && score.dimensions[selectedDimension as keyof typeof score.dimensions] && (
        <div className="dimension-details">
          <h3>{DIMENSION_LABELS[selectedDimension]} Debt Details</h3>

          <div className="subdimensions">
            <h4>Sub-Dimensions</h4>
            <div className="subdimension-grid">
              {score.dimensions[selectedDimension as keyof typeof score.dimensions].subDimensions.map((sub, i) => (
                <div key={i} className={`subdimension-card ${sub.impactLevel}`}>
                  <div className="subdim-name">{sub.name}</div>
                  <div className="subdim-score">{sub.score}</div>
                  <div className="subdim-desc">{sub.description}</div>
                  <span className={`impact-badge ${sub.impactLevel}`}>{sub.impactLevel}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="issues">
            <h4>Top Issues</h4>
            {score.dimensions[selectedDimension as keyof typeof score.dimensions].topIssues.map((issue) => (
              <div key={issue.id} className={`issue-card ${issue.severity}`}>
                <div className="issue-header">
                  <span className={`severity-badge ${issue.severity}`}>{issue.severity}</span>
                  <span className="issue-title">{issue.title}</span>
                </div>
                <p className="issue-description">{issue.description}</p>
                <div className="issue-action">
                  <strong>Suggested:</strong> {issue.suggestedAction}
                </div>
                {issue.estimatedCost && (
                  <div className="issue-cost">
                    Est. Impact: EUR {issue.estimatedCost.toLocaleString()}/year
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="cost-breakdown">
        <h3>Cost Breakdown by Dimension</h3>
        <div className="cost-bars">
          {score.estimatedAnnualCost.breakdown.map((item) => (
            <div key={item.dimension} className="cost-bar-row">
              <span className="dimension-label">{DIMENSION_LABELS[item.dimension]}</span>
              <div className="bar-container">
                <div
                  className="bar"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: getScoreColor(
                      score.dimensions[item.dimension as keyof typeof score.dimensions]?.score ?? 50
                    ),
                  }}
                />
              </div>
              <span className="cost-label">
                {score.estimatedAnnualCost.currency} {item.cost.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Recommendations */}
      <div className="recommendations-section">
        <h3>Priority Recommendations</h3>
        <div className="recommendations-list">
          {score.topRecommendations.slice(0, 5).map((rec) => (
            <div
              key={rec.id}
              className="recommendation-card"
              onClick={() => onRecommendationClick?.(rec)}
            >
              <div className="rec-priority">#{rec.priority}</div>
              <div className="rec-content">
                <h4>{rec.title}</h4>
                <p>{rec.description}</p>
                <div className="rec-meta">
                  <span className="dimension-tag">{DIMENSION_LABELS[rec.dimension]}</span>
                  <span className={`effort ${rec.effort}`}>Effort: {rec.effort}</span>
                  <span className="savings">
                    Saves: EUR {rec.estimatedImpact.costSavings.toLocaleString()}/year
                  </span>
                </div>
              </div>
              <div className="rec-impact">
                <div className="score-reduction">-{rec.estimatedImpact.scoreReduction} pts</div>
                <div className="time-to-value">{rec.estimatedImpact.timeToValue}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function getScoreColor(score: number): string {
  if (score <= 20) return '#22c55e';
  if (score <= 40) return '#84cc16';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#f97316';
  return '#ef4444';
}

const styles = `
  .debt-dashboard {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .debt-dashboard.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    padding: 48px;
  }

  .calculate-btn, .recalculate-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .calculate-btn:hover, .recalculate-btn:hover {
    background: #2563eb;
  }

  .dashboard-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 24px;
    margin-bottom: 32px;
  }

  .score-card.main {
    display: flex;
    align-items: center;
    gap: 24px;
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .grade-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .grade {
    font-size: 36px;
    font-weight: bold;
    color: white;
  }

  .score-info h2 {
    margin: 0 0 8px;
    font-size: 18px;
    color: #374151;
  }

  .score-value {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .score-value .number {
    font-size: 48px;
    font-weight: bold;
    color: #111827;
  }

  .score-value .max {
    font-size: 24px;
    color: #9ca3af;
  }

  .trend {
    font-size: 24px;
    margin-left: 8px;
  }

  .trend.improving { color: #22c55e; }
  .trend.stable { color: #6b7280; }
  .trend.degrading { color: #ef4444; }

  .change {
    font-size: 14px;
    margin-top: 4px;
  }

  .change.positive { color: #22c55e; }
  .change.negative { color: #ef4444; }

  .calculated-at {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .cost-card, .benchmark-card {
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .cost-card h3, .benchmark-card h3 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #6b7280;
    text-transform: uppercase;
  }

  .cost-value {
    font-size: 28px;
    font-weight: bold;
    color: #111827;
  }

  .confidence {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 8px;
  }

  .benchmark-status {
    font-size: 18px;
    font-weight: 600;
  }

  .benchmark-status.below { color: #22c55e; }
  .benchmark-status.at { color: #eab308; }
  .benchmark-status.above { color: #ef4444; }

  .dimensions-section h3 {
    margin: 0 0 16px;
    font-size: 18px;
    color: #374151;
  }

  .dimension-cards {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
  }

  .dimension-card {
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
  }

  .dimension-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .dimension-card.selected {
    border-color: #3b82f6;
  }

  .dimension-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .dimension-name {
    font-weight: 600;
    color: #374151;
  }

  .dimension-score {
    position: relative;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    margin-bottom: 8px;
  }

  .score-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .score-label {
    position: absolute;
    right: 0;
    top: -20px;
    font-size: 14px;
    font-weight: 600;
  }

  .dimension-weight, .issue-count {
    font-size: 12px;
    color: #9ca3af;
  }

  .dimension-details {
    background: white;
    padding: 24px;
    border-radius: 12px;
    margin-top: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .subdimension-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 16px;
  }

  .subdimension-card {
    padding: 16px;
    border-radius: 8px;
    background: #f9fafb;
    border-left: 4px solid;
  }

  .subdimension-card.low { border-color: #22c55e; }
  .subdimension-card.medium { border-color: #eab308; }
  .subdimension-card.high { border-color: #f97316; }
  .subdimension-card.critical { border-color: #ef4444; }

  .subdim-name {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .subdim-score {
    font-size: 24px;
    font-weight: bold;
    color: #374151;
  }

  .subdim-desc {
    font-size: 12px;
    color: #6b7280;
    margin-top: 8px;
  }

  .impact-badge {
    display: inline-block;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    margin-top: 8px;
  }

  .impact-badge.low { background: #dcfce7; color: #166534; }
  .impact-badge.medium { background: #fef3c7; color: #92400e; }
  .impact-badge.high { background: #ffedd5; color: #9a3412; }
  .impact-badge.critical { background: #fee2e2; color: #991b1b; }

  .issues {
    margin-top: 24px;
  }

  .issue-card {
    padding: 16px;
    border-radius: 8px;
    background: #f9fafb;
    margin-top: 12px;
    border-left: 4px solid;
  }

  .issue-card.low { border-color: #22c55e; }
  .issue-card.medium { border-color: #eab308; }
  .issue-card.high { border-color: #f97316; }
  .issue-card.critical { border-color: #ef4444; }

  .issue-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .severity-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .severity-badge.low { background: #dcfce7; color: #166534; }
  .severity-badge.medium { background: #fef3c7; color: #92400e; }
  .severity-badge.high { background: #ffedd5; color: #9a3412; }
  .severity-badge.critical { background: #fee2e2; color: #991b1b; }

  .issue-title {
    font-weight: 600;
    color: #374151;
  }

  .issue-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 8px;
  }

  .issue-action {
    font-size: 12px;
    color: #374151;
  }

  .issue-cost {
    font-size: 12px;
    color: #ef4444;
    margin-top: 8px;
    font-weight: 500;
  }

  .cost-breakdown {
    background: white;
    padding: 24px;
    border-radius: 12px;
    margin-top: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .cost-bars {
    margin-top: 16px;
  }

  .cost-bar-row {
    display: grid;
    grid-template-columns: 120px 1fr 120px;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }

  .bar-container {
    height: 24px;
    background: #e5e7eb;
    border-radius: 4px;
  }

  .bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .cost-label {
    text-align: right;
    font-weight: 500;
  }

  .recommendations-section {
    background: white;
    padding: 24px;
    border-radius: 12px;
    margin-top: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .recommendations-list {
    margin-top: 16px;
  }

  .recommendation-card {
    display: grid;
    grid-template-columns: 48px 1fr 120px;
    gap: 16px;
    padding: 16px;
    border-radius: 8px;
    background: #f9fafb;
    margin-bottom: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .recommendation-card:hover {
    background: #f3f4f6;
  }

  .rec-priority {
    font-size: 24px;
    font-weight: bold;
    color: #3b82f6;
  }

  .rec-content h4 {
    margin: 0 0 4px;
    font-size: 16px;
    color: #374151;
  }

  .rec-content p {
    margin: 0 0 8px;
    font-size: 14px;
    color: #6b7280;
  }

  .rec-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
  }

  .dimension-tag {
    background: #dbeafe;
    color: #1e40af;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .effort {
    padding: 2px 8px;
    border-radius: 4px;
  }

  .effort.low { background: #dcfce7; color: #166534; }
  .effort.medium { background: #fef3c7; color: #92400e; }
  .effort.high { background: #fee2e2; color: #991b1b; }

  .savings {
    color: #059669;
  }

  .rec-impact {
    text-align: center;
  }

  .score-reduction {
    font-size: 20px;
    font-weight: bold;
    color: #22c55e;
  }

  .time-to-value {
    font-size: 12px;
    color: #9ca3af;
  }

  @media (max-width: 1200px) {
    .dashboard-header {
      grid-template-columns: 1fr;
    }

    .dimension-cards {
      grid-template-columns: repeat(3, 1fr);
    }

    .subdimension-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .dimension-cards {
      grid-template-columns: 1fr 1fr;
    }

    .subdimension-grid {
      grid-template-columns: 1fr;
    }

    .recommendation-card {
      grid-template-columns: 1fr;
    }
  }
`;

export default DebtScoreDashboard;
