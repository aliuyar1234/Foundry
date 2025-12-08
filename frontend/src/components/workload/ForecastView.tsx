/**
 * Forecast View Component
 * T235 - Workload forecasting and trend visualization
 *
 * Shows predicted workload trends and burnout risk trajectories
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
interface ForecastDataPoint {
  date: string;
  predicted: number;
  confidence: {
    low: number;
    high: number;
  };
  actual?: number;
}

interface BurnoutForecast {
  personId: string;
  personName: string;
  currentRisk: number;
  predictedRisk: number;
  trajectory: 'increasing' | 'stable' | 'decreasing';
  daysToHighRisk?: number;
  keyFactors: string[];
}

interface TeamForecast {
  teamId: string;
  period: {
    start: string;
    end: string;
  };
  workloadForecast: ForecastDataPoint[];
  burnoutForecasts: BurnoutForecast[];
  capacityForecast: ForecastDataPoint[];
  alerts: ForecastAlert[];
  assumptions: string[];
  accuracy: {
    historical: number;
    recentTrend: 'improving' | 'stable' | 'declining';
  };
}

interface ForecastAlert {
  type: 'overload' | 'burnout' | 'capacity_shortage' | 'deadline_risk';
  severity: 'low' | 'medium' | 'high';
  date: string;
  description: string;
  affectedPersons?: string[];
}

interface ForecastViewProps {
  teamId?: string;
  personId?: string;
  onAlertClick?: (alert: ForecastAlert) => void;
}

export function ForecastView({
  teamId,
  personId,
  onAlertClick,
}: ForecastViewProps) {
  const [forecast, setForecast] = useState<TeamForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastDays, setForecastDays] = useState(30);
  const [selectedMetric, setSelectedMetric] = useState<'workload' | 'capacity' | 'burnout'>('workload');

  const fetchForecast = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = personId
        ? `/api/workload/person/${personId}/forecast?days=${forecastDays}`
        : teamId
        ? `/api/workload/team/${teamId}/forecast?days=${forecastDays}`
        : null;

      if (!endpoint) {
        setError('No team or person specified');
        return;
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch forecast');
      const data = await response.json();

      setForecast(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [teamId, personId, forecastDays]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  if (loading) {
    return (
      <div className="forecast-view loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <div className="forecast-view error">
        <p>{error || 'No data available'}</p>
        <button onClick={fetchForecast} className="btn btn-small">Retry</button>
      </div>
    );
  }

  return (
    <div className="forecast-view">
      {/* Header */}
      <div className="forecast-header">
        <div className="header-info">
          <h3>Workload Forecast</h3>
          <div className="accuracy-badge">
            <span className="accuracy-label">Model Accuracy:</span>
            <span className={`accuracy-value ${getAccuracyClass(forecast.accuracy.historical)}`}>
              {(forecast.accuracy.historical * 100).toFixed(0)}%
            </span>
            <span className={`trend-indicator ${forecast.accuracy.recentTrend}`}>
              {forecast.accuracy.recentTrend === 'improving' ? '↑' :
               forecast.accuracy.recentTrend === 'declining' ? '↓' : '→'}
            </span>
          </div>
        </div>
        <div className="header-controls">
          <select
            value={forecastDays}
            onChange={(e) => setForecastDays(Number(e.target.value))}
            className="days-select"
          >
            <option value={14}>2 Weeks</option>
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
          </select>
          <button onClick={fetchForecast} className="btn btn-outline btn-small">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {forecast.alerts.length > 0 && (
        <div className="forecast-alerts">
          {forecast.alerts
            .filter((a) => a.severity === 'high')
            .slice(0, 3)
            .map((alert, i) => (
              <div
                key={i}
                className={`alert-card ${alert.severity}`}
                onClick={() => onAlertClick?.(alert)}
              >
                <span className="alert-icon">{getAlertIcon(alert.type)}</span>
                <div className="alert-content">
                  <span className="alert-date">
                    {new Date(alert.date).toLocaleDateString()}
                  </span>
                  <span className="alert-description">{alert.description}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Metric Selector */}
      <div className="metric-selector">
        <button
          className={`metric-btn ${selectedMetric === 'workload' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('workload')}
        >
          Workload
        </button>
        <button
          className={`metric-btn ${selectedMetric === 'capacity' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('capacity')}
        >
          Capacity
        </button>
        <button
          className={`metric-btn ${selectedMetric === 'burnout' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('burnout')}
        >
          Burnout Risk
        </button>
      </div>

      {/* Main Chart */}
      <div className="forecast-chart">
        {selectedMetric === 'workload' && (
          <ForecastChart
            data={forecast.workloadForecast}
            label="Workload"
            unit="hours"
            color="#3b82f6"
          />
        )}
        {selectedMetric === 'capacity' && (
          <ForecastChart
            data={forecast.capacityForecast}
            label="Available Capacity"
            unit="hours"
            color="#22c55e"
          />
        )}
        {selectedMetric === 'burnout' && (
          <BurnoutForecastChart forecasts={forecast.burnoutForecasts} />
        )}
      </div>

      {/* Assumptions */}
      <div className="assumptions-section">
        <h4>Forecast Assumptions</h4>
        <ul className="assumptions-list">
          {forecast.assumptions.map((assumption, i) => (
            <li key={i}>{assumption}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Forecast Chart Component
interface ForecastChartProps {
  data: ForecastDataPoint[];
  label: string;
  unit: string;
  color: string;
}

function ForecastChart({ data, label, unit, color }: ForecastChartProps) {
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 30, bottom: 40, left: 60 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate scales
  const allValues = data.flatMap((d) => [d.predicted, d.confidence.low, d.confidence.high, d.actual || 0]);
  const maxValue = Math.max(...allValues.filter((v) => v > 0));
  const minValue = Math.min(...allValues.filter((v) => v > 0));
  const valueRange = maxValue - minValue || 1;

  const xScale = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
  const yScale = (v: number) => padding.top + chartHeight - ((v - minValue) / valueRange) * chartHeight;

  // Build paths
  const predictedPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.predicted)}`)
    .join(' ');

  const confidencePath = [
    ...data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.confidence.high)}`),
    ...data.map((d, i) => `L ${xScale(data.length - 1 - i)} ${yScale(data[data.length - 1 - i].confidence.low)}`),
    'Z',
  ].join(' ');

  const actualData = data.filter((d) => d.actual !== undefined);
  const actualPath = actualData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(data.indexOf(d))} ${yScale(d.actual!)}`)
    .join(' ');

  // Find today's index (roughly where actual data ends)
  const todayIndex = actualData.length > 0 ? data.indexOf(actualData[actualData.length - 1]) : 0;

  return (
    <div className="chart-container">
      <svg viewBox={`0 0 ${width} ${height}`} className="forecast-svg">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + chartHeight * (1 - pct);
          const value = minValue + valueRange * pct;
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4"
              />
              <text
                x={padding.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
                fill="#6b7280"
              >
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Today marker */}
        {todayIndex > 0 && (
          <line
            x1={xScale(todayIndex)}
            y1={padding.top}
            x2={xScale(todayIndex)}
            y2={height - padding.bottom}
            stroke="#6b7280"
            strokeDasharray="4"
          />
        )}

        {/* Confidence band */}
        <path d={confidencePath} fill={color} opacity={0.1} />

        {/* Predicted line */}
        <path d={predictedPath} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 3" />

        {/* Actual line */}
        {actualPath && (
          <path d={actualPath} fill="none" stroke={color} strokeWidth={2} />
        )}

        {/* X-axis labels */}
        {data
          .filter((_, i) => i % Math.ceil(data.length / 7) === 0)
          .map((d, i) => (
            <text
              key={i}
              x={xScale(data.indexOf(d))}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          ))}

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 150}, ${padding.top})`}>
          <line x1={0} y1={5} x2={20} y2={5} stroke={color} strokeWidth={2} />
          <text x={25} y={9} fontSize="11" fill="#374151">Actual</text>
          <line x1={0} y1={25} x2={20} y2={25} stroke={color} strokeWidth={2} strokeDasharray="6 3" />
          <text x={25} y={29} fontSize="11" fill="#374151">Predicted</text>
          <rect x={0} y={40} width={20} height={10} fill={color} opacity={0.1} />
          <text x={25} y={49} fontSize="11" fill="#374151">Confidence</text>
        </g>
      </svg>

      {/* Y-axis label */}
      <div className="y-axis-label">{label} ({unit})</div>
    </div>
  );
}

// Burnout Forecast Chart
interface BurnoutForecastChartProps {
  forecasts: BurnoutForecast[];
}

function BurnoutForecastChart({ forecasts }: BurnoutForecastChartProps) {
  const sortedForecasts = [...forecasts].sort((a, b) => b.predictedRisk - a.predictedRisk);

  return (
    <div className="burnout-forecast-chart">
      <div className="forecast-list">
        {sortedForecasts.map((f) => (
          <div key={f.personId} className={`forecast-item ${getRiskClass(f.predictedRisk)}`}>
            <div className="person-info">
              <span className="person-name">{f.personName}</span>
              <span className={`trajectory ${f.trajectory}`}>
                {f.trajectory === 'increasing' ? '↑' : f.trajectory === 'decreasing' ? '↓' : '→'}
              </span>
            </div>

            <div className="risk-comparison">
              <div className="risk-bar current">
                <div
                  className="bar-fill"
                  style={{
                    width: `${f.currentRisk * 100}%`,
                    backgroundColor: getRiskColor(f.currentRisk),
                  }}
                />
                <span className="bar-label">Now: {(f.currentRisk * 100).toFixed(0)}%</span>
              </div>
              <div className="risk-bar predicted">
                <div
                  className="bar-fill"
                  style={{
                    width: `${f.predictedRisk * 100}%`,
                    backgroundColor: getRiskColor(f.predictedRisk),
                  }}
                />
                <span className="bar-label">Predicted: {(f.predictedRisk * 100).toFixed(0)}%</span>
              </div>
            </div>

            {f.daysToHighRisk && f.daysToHighRisk < 30 && (
              <div className="high-risk-warning">
                ⚠️ High risk in {f.daysToHighRisk} days
              </div>
            )}

            <div className="key-factors">
              {f.keyFactors.slice(0, 2).map((factor, i) => (
                <span key={i} className="factor-tag">
                  {factor}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Risk Scale Legend */}
      <div className="risk-legend">
        <span className="legend-title">Risk Level:</span>
        <div className="legend-scale">
          <span className="scale-low">Low</span>
          <div className="scale-gradient" />
          <span className="scale-high">High</span>
        </div>
      </div>
    </div>
  );
}

// Helper Functions
function getAccuracyClass(accuracy: number): string {
  if (accuracy >= 0.85) return 'high';
  if (accuracy >= 0.7) return 'medium';
  return 'low';
}

function getAlertIcon(type: string): string {
  const icons: Record<string, string> = {
    overload: '📈',
    burnout: '🔥',
    capacity_shortage: '👥',
    deadline_risk: '📅',
  };
  return icons[type] || '⚠️';
}

function getRiskClass(risk: number): string {
  if (risk >= 0.7) return 'high-risk';
  if (risk >= 0.4) return 'medium-risk';
  return 'low-risk';
}

function getRiskColor(risk: number): string {
  if (risk >= 0.7) return '#ef4444';
  if (risk >= 0.4) return '#f59e0b';
  return '#22c55e';
}

export default ForecastView;
