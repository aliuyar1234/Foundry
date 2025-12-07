/**
 * Debt Trend Chart Component
 * Line chart showing debt score trends over time
 * T266 - Debt trend visualization
 */

import React, { useState, useMemo } from 'react';

interface DebtHistoryEntry {
  date: string;
  overallScore: number;
  dimensionScores: {
    process: number;
    knowledge: number;
    data: number;
    technical: number;
    communication: number;
  };
}

interface DebtTrendChartProps {
  history: DebtHistoryEntry[];
  width?: number;
  height?: number;
  showDimensions?: boolean;
  selectedDimensions?: string[];
  onPointClick?: (entry: DebtHistoryEntry) => void;
}

const DIMENSION_COLORS: Record<string, string> = {
  overall: '#3b82f6',
  process: '#8b5cf6',
  knowledge: '#ec4899',
  data: '#06b6d4',
  technical: '#f59e0b',
  communication: '#10b981',
};

const DIMENSION_LABELS: Record<string, string> = {
  overall: 'Overall',
  process: 'Process',
  knowledge: 'Knowledge',
  data: 'Data',
  technical: 'Technical',
  communication: 'Communication',
};

export const DebtTrendChart: React.FC<DebtTrendChartProps> = ({
  history,
  width = 800,
  height = 400,
  showDimensions = true,
  selectedDimensions = ['overall'],
  onPointClick,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    entry: DebtHistoryEntry;
    dimension: string;
    x: number;
    y: number;
  } | null>(null);
  const [activeDimensions, setActiveDimensions] = useState<Set<string>>(
    new Set(selectedDimensions)
  );

  const padding = { top: 40, right: 120, bottom: 60, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { xScale, yScale, lines } = useMemo(() => {
    if (history.length === 0) {
      return { xScale: () => 0, yScale: () => 0, lines: [] };
    }

    const sortedHistory = [...history].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const xScale = (index: number) =>
      padding.left + (index / Math.max(1, sortedHistory.length - 1)) * chartWidth;

    const yScale = (value: number) =>
      padding.top + ((100 - value) / 100) * chartHeight;

    const lines: { dimension: string; points: string; color: string }[] = [];

    // Overall line
    if (activeDimensions.has('overall')) {
      const points = sortedHistory
        .map((entry, i) => `${xScale(i)},${yScale(entry.overallScore)}`)
        .join(' ');
      lines.push({ dimension: 'overall', points, color: DIMENSION_COLORS.overall });
    }

    // Dimension lines
    if (showDimensions) {
      Object.keys(DIMENSION_COLORS)
        .filter((dim) => dim !== 'overall' && activeDimensions.has(dim))
        .forEach((dim) => {
          const points = sortedHistory
            .map((entry, i) => {
              const score = entry.dimensionScores[dim as keyof typeof entry.dimensionScores];
              return `${xScale(i)},${yScale(score)}`;
            })
            .join(' ');
          lines.push({ dimension: dim, points, color: DIMENSION_COLORS[dim] });
        });
    }

    return { xScale, yScale, lines };
  }, [history, activeDimensions, showDimensions, chartWidth, chartHeight]);

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [history]
  );

  const toggleDimension = (dimension: string) => {
    setActiveDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(dimension)) {
        next.delete(dimension);
      } else {
        next.add(dimension);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (history.length === 0) {
    return (
      <div className="debt-trend-chart empty" style={{ width, height }}>
        <style>{styles}</style>
        <div className="empty-state">
          <p>No historical data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="debt-trend-chart">
      <style>{styles}</style>

      <svg width={width} height={height}>
        {/* Grid lines */}
        <g className="grid-lines">
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1={padding.left}
                y1={yScale(value)}
                x2={width - padding.right}
                y2={yScale(value)}
                stroke="#e5e7eb"
                strokeDasharray={value === 0 || value === 100 ? 'none' : '4,4'}
              />
              <text
                x={padding.left - 10}
                y={yScale(value)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={12}
                fill="#6b7280"
              >
                {value}
              </text>
            </g>
          ))}
        </g>

        {/* X-axis labels */}
        <g className="x-axis">
          {sortedHistory.map((entry, i) => {
            const x = xScale(i);
            const showLabel =
              sortedHistory.length <= 6 ||
              i === 0 ||
              i === sortedHistory.length - 1 ||
              i % Math.ceil(sortedHistory.length / 6) === 0;

            return showLabel ? (
              <g key={i}>
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={height - padding.bottom + 5}
                  stroke="#9ca3af"
                />
                <text
                  x={x}
                  y={height - padding.bottom + 20}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#6b7280"
                >
                  {formatDate(entry.date)}
                </text>
              </g>
            ) : null;
          })}
        </g>

        {/* Axis labels */}
        <text
          x={padding.left - 45}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="#374151"
          transform={`rotate(-90, ${padding.left - 45}, ${height / 2})`}
        >
          Debt Score
        </text>

        {/* Lines */}
        {lines.map((line) => (
          <polyline
            key={line.dimension}
            points={line.points}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {/* Data points */}
        {sortedHistory.map((entry, i) => {
          const x = xScale(i);
          return (
            <g key={i}>
              {activeDimensions.has('overall') && (
                <circle
                  cx={x}
                  cy={yScale(entry.overallScore)}
                  r={4}
                  fill={DIMENSION_COLORS.overall}
                  stroke="white"
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) =>
                    setHoveredPoint({
                      entry,
                      dimension: 'overall',
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseLeave={() => setHoveredPoint(null)}
                  onClick={() => onPointClick?.(entry)}
                />
              )}
              {showDimensions &&
                Object.keys(DIMENSION_COLORS)
                  .filter((dim) => dim !== 'overall' && activeDimensions.has(dim))
                  .map((dim) => {
                    const score = entry.dimensionScores[dim as keyof typeof entry.dimensionScores];
                    return (
                      <circle
                        key={dim}
                        cx={x}
                        cy={yScale(score)}
                        r={3}
                        fill={DIMENSION_COLORS[dim]}
                        stroke="white"
                        strokeWidth={1.5}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) =>
                          setHoveredPoint({
                            entry,
                            dimension: dim,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                        onClick={() => onPointClick?.(entry)}
                      />
                    );
                  })}
            </g>
          );
        })}

        {/* Reference zones */}
        <defs>
          <linearGradient id="healthyZone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="criticalZone" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x={padding.left}
          y={yScale(20)}
          width={chartWidth}
          height={yScale(0) - yScale(20)}
          fill="url(#healthyZone)"
        />
        <rect
          x={padding.left}
          y={yScale(100)}
          width={chartWidth}
          height={yScale(80) - yScale(100)}
          fill="url(#criticalZone)"
        />
      </svg>

      {/* Legend */}
      <div className="legend">
        {Object.entries(DIMENSION_LABELS).map(([dim, label]) => {
          if (dim !== 'overall' && !showDimensions) return null;
          const isActive = activeDimensions.has(dim);
          return (
            <button
              key={dim}
              className={`legend-item ${isActive ? 'active' : ''}`}
              onClick={() => toggleDimension(dim)}
            >
              <span
                className="color-dot"
                style={{
                  backgroundColor: isActive ? DIMENSION_COLORS[dim] : '#d1d5db',
                }}
              />
              <span className="label">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="tooltip"
          style={{
            left: hoveredPoint.x + 10,
            top: hoveredPoint.y - 10,
          }}
        >
          <div className="tooltip-date">
            {new Date(hoveredPoint.entry.date).toLocaleDateString()}
          </div>
          <div className="tooltip-value">
            <span
              className="dot"
              style={{ backgroundColor: DIMENSION_COLORS[hoveredPoint.dimension] }}
            />
            {DIMENSION_LABELS[hoveredPoint.dimension]}:{' '}
            <strong>
              {hoveredPoint.dimension === 'overall'
                ? hoveredPoint.entry.overallScore
                : hoveredPoint.entry.dimensionScores[
                    hoveredPoint.dimension as keyof typeof hoveredPoint.entry.dimensionScores
                  ]}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = `
  .debt-trend-chart {
    position: relative;
    background: white;
    border-radius: 12px;
    padding: 16px;
  }

  .debt-trend-chart.empty {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-state {
    color: #9ca3af;
    font-size: 14px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: white;
    cursor: pointer;
    font-size: 12px;
    color: #6b7280;
    transition: all 0.2s;
  }

  .legend-item:hover {
    border-color: #d1d5db;
  }

  .legend-item.active {
    border-color: #3b82f6;
    color: #374151;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .tooltip {
    position: fixed;
    background: #1f2937;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }

  .tooltip-date {
    color: #9ca3af;
    margin-bottom: 4px;
  }

  .tooltip-value {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tooltip .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  svg circle {
    transition: r 0.2s;
  }

  svg circle:hover {
    r: 6;
  }
`;

export default DebtTrendChart;
