/**
 * Cost Breakdown Chart Component
 * Visualization of debt cost distribution
 * T267 - Cost breakdown visualization
 */

import React, { useState, useMemo } from 'react';

interface CostBreakdown {
  dimension: string;
  cost: number;
  percentage: number;
}

interface CostEstimate {
  totalAnnualCost: number;
  currency: string;
  breakdown: CostBreakdown[];
  confidenceLevel: 'low' | 'medium' | 'high';
  assumptions: string[];
}

interface CostBreakdownChartProps {
  costEstimate: CostEstimate;
  width?: number;
  height?: number;
  variant?: 'pie' | 'bar' | 'donut';
  showLegend?: boolean;
  onDimensionClick?: (dimension: string) => void;
}

const DIMENSION_COLORS: Record<string, string> = {
  process: '#8b5cf6',
  knowledge: '#ec4899',
  data: '#06b6d4',
  technical: '#f59e0b',
  communication: '#10b981',
};

const DIMENSION_LABELS: Record<string, string> = {
  process: 'Process',
  knowledge: 'Knowledge',
  data: 'Data',
  technical: 'Technical',
  communication: 'Communication',
};

const CONFIDENCE_COLORS = {
  low: '#fef3c7',
  medium: '#dbeafe',
  high: '#dcfce7',
};

export const CostBreakdownChart: React.FC<CostBreakdownChartProps> = ({
  costEstimate,
  width = 400,
  height = 300,
  variant = 'donut',
  showLegend = true,
  onDimensionClick,
}) => {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const { segments, centerX, centerY, radius } = useMemo(() => {
    const centerX = width / 2;
    const centerY = variant === 'bar' ? 0 : height / 2;
    const radius = Math.min(width, height) / 2 - 40;
    const innerRadius = variant === 'donut' ? radius * 0.6 : 0;

    let startAngle = -Math.PI / 2;
    const segments = costEstimate.breakdown.map((item) => {
      const angle = (item.percentage / 100) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const midAngle = startAngle + angle / 2;

      const segment = {
        dimension: item.dimension,
        cost: item.cost,
        percentage: item.percentage,
        startAngle,
        endAngle,
        midAngle,
        color: DIMENSION_COLORS[item.dimension] || '#6b7280',
        path: describeArc(centerX, centerY, radius, innerRadius, startAngle, endAngle),
        labelX: centerX + (radius + 20) * Math.cos(midAngle),
        labelY: centerY + (radius + 20) * Math.sin(midAngle),
      };

      startAngle = endAngle;
      return segment;
    });

    return { segments, centerX, centerY, radius };
  }, [costEstimate.breakdown, width, height, variant]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: costEstimate.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (variant === 'bar') {
    return (
      <div className="cost-breakdown-chart bar" style={{ width }}>
        <style>{styles}</style>

        <div className="total-cost">
          <span className="label">Estimated Annual Cost</span>
          <span className="value">{formatCurrency(costEstimate.totalAnnualCost)}</span>
          <span
            className="confidence"
            style={{ backgroundColor: CONFIDENCE_COLORS[costEstimate.confidenceLevel] }}
          >
            {costEstimate.confidenceLevel} confidence
          </span>
        </div>

        <div className="bar-chart">
          {costEstimate.breakdown.map((item) => (
            <div
              key={item.dimension}
              className={`bar-row ${hoveredSegment === item.dimension ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredSegment(item.dimension)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => onDimensionClick?.(item.dimension)}
            >
              <div className="bar-label">
                <span
                  className="color-indicator"
                  style={{ backgroundColor: DIMENSION_COLORS[item.dimension] }}
                />
                <span className="name">{DIMENSION_LABELS[item.dimension]}</span>
              </div>
              <div className="bar-container">
                <div
                  className="bar-fill"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: DIMENSION_COLORS[item.dimension],
                  }}
                />
              </div>
              <div className="bar-value">
                <span className="cost">{formatCurrency(item.cost)}</span>
                <span className="percentage">{item.percentage.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>

        <button
          className="assumptions-toggle"
          onClick={() => setShowAssumptions(!showAssumptions)}
        >
          {showAssumptions ? 'Hide' : 'Show'} Assumptions
        </button>

        {showAssumptions && (
          <div className="assumptions-list">
            <ul>
              {costEstimate.assumptions.map((assumption, i) => (
                <li key={i}>{assumption}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cost-breakdown-chart" style={{ width, height: height + (showLegend ? 80 : 0) }}>
      <style>{styles}</style>

      <svg width={width} height={height}>
        {/* Pie/Donut segments */}
        {segments.map((segment) => (
          <g key={segment.dimension}>
            <path
              d={segment.path}
              fill={segment.color}
              stroke="white"
              strokeWidth={2}
              style={{
                cursor: 'pointer',
                opacity: hoveredSegment && hoveredSegment !== segment.dimension ? 0.5 : 1,
                transition: 'opacity 0.2s, transform 0.2s',
                transform:
                  hoveredSegment === segment.dimension
                    ? `translate(${Math.cos(segment.midAngle) * 5}px, ${Math.sin(segment.midAngle) * 5}px)`
                    : 'none',
              }}
              onMouseEnter={() => setHoveredSegment(segment.dimension)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => onDimensionClick?.(segment.dimension)}
            />
          </g>
        ))}

        {/* Center text for donut */}
        {variant === 'donut' && (
          <g>
            <text
              x={centerX}
              y={centerY - 10}
              textAnchor="middle"
              fontSize={12}
              fill="#6b7280"
            >
              Total Cost
            </text>
            <text
              x={centerX}
              y={centerY + 15}
              textAnchor="middle"
              fontSize={18}
              fontWeight="bold"
              fill="#111827"
            >
              {formatCurrency(costEstimate.totalAnnualCost)}
            </text>
          </g>
        )}

        {/* Labels for large segments */}
        {segments
          .filter((s) => s.percentage >= 10)
          .map((segment) => (
            <text
              key={segment.dimension}
              x={centerX + (radius * 0.75) * Math.cos(segment.midAngle)}
              y={centerY + (radius * 0.75) * Math.sin(segment.midAngle)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12}
              fontWeight="600"
              fill="white"
            >
              {segment.percentage.toFixed(0)}%
            </text>
          ))}
      </svg>

      {/* Tooltip */}
      {hoveredSegment && (
        <div className="chart-tooltip">
          <div className="tooltip-header">
            <span
              className="color-dot"
              style={{ backgroundColor: DIMENSION_COLORS[hoveredSegment] }}
            />
            {DIMENSION_LABELS[hoveredSegment]}
          </div>
          <div className="tooltip-content">
            <div className="cost-line">
              <span>Cost:</span>
              <strong>
                {formatCurrency(
                  segments.find((s) => s.dimension === hoveredSegment)?.cost || 0
                )}
              </strong>
            </div>
            <div className="percentage-line">
              <span>Share:</span>
              <strong>
                {segments.find((s) => s.dimension === hoveredSegment)?.percentage.toFixed(1)}%
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div className="chart-legend">
          {segments.map((segment) => (
            <div
              key={segment.dimension}
              className={`legend-item ${hoveredSegment === segment.dimension ? 'active' : ''}`}
              onMouseEnter={() => setHoveredSegment(segment.dimension)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => onDimensionClick?.(segment.dimension)}
            >
              <span
                className="color-indicator"
                style={{ backgroundColor: segment.color }}
              />
              <span className="dimension-name">
                {DIMENSION_LABELS[segment.dimension]}
              </span>
              <span className="dimension-cost">{formatCurrency(segment.cost)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Confidence indicator */}
      <div
        className="confidence-badge"
        style={{ backgroundColor: CONFIDENCE_COLORS[costEstimate.confidenceLevel] }}
      >
        {costEstimate.confidenceLevel} confidence
      </div>
    </div>
  );
};

function describeArc(
  x: number,
  y: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const startOuter = {
    x: x + outerRadius * Math.cos(startAngle),
    y: y + outerRadius * Math.sin(startAngle),
  };
  const endOuter = {
    x: x + outerRadius * Math.cos(endAngle),
    y: y + outerRadius * Math.sin(endAngle),
  };
  const startInner = {
    x: x + innerRadius * Math.cos(endAngle),
    y: y + innerRadius * Math.sin(endAngle),
  };
  const endInner = {
    x: x + innerRadius * Math.cos(startAngle),
    y: y + innerRadius * Math.sin(startAngle),
  };

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  if (innerRadius === 0) {
    return [
      `M ${x} ${y}`,
      `L ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

const styles = `
  .cost-breakdown-chart {
    position: relative;
    background: white;
    border-radius: 12px;
    padding: 16px;
  }

  .cost-breakdown-chart.bar {
    height: auto;
  }

  .total-cost {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 24px;
  }

  .total-cost .label {
    font-size: 14px;
    color: #6b7280;
  }

  .total-cost .value {
    font-size: 32px;
    font-weight: bold;
    color: #111827;
    margin: 4px 0;
  }

  .confidence {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: capitalize;
  }

  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    gap: 12px;
    align-items: center;
    cursor: pointer;
    padding: 4px 0;
    transition: background 0.2s;
  }

  .bar-row:hover, .bar-row.hovered {
    background: #f9fafb;
  }

  .bar-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .name {
    font-size: 14px;
    color: #374151;
  }

  .bar-container {
    height: 24px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease-out;
  }

  .bar-value {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .bar-value .cost {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }

  .bar-value .percentage {
    font-size: 11px;
    color: #6b7280;
  }

  .assumptions-toggle {
    display: block;
    margin: 24px auto 0;
    padding: 8px 16px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 6px;
    font-size: 13px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .assumptions-toggle:hover {
    border-color: #d1d5db;
    color: #374151;
  }

  .assumptions-list {
    margin-top: 16px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .assumptions-list ul {
    margin: 0;
    padding-left: 20px;
  }

  .assumptions-list li {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .chart-tooltip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -120%);
    background: #1f2937;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    pointer-events: none;
    z-index: 10;
    min-width: 160px;
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #374151;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .tooltip-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cost-line, .percentage-line {
    display: flex;
    justify-content: space-between;
  }

  .chart-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .legend-item:hover, .legend-item.active {
    background: #f3f4f6;
  }

  .dimension-name {
    font-size: 12px;
    color: #374151;
  }

  .dimension-cost {
    font-size: 12px;
    font-weight: 600;
    color: #111827;
  }

  .confidence-badge {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: capitalize;
  }
`;

export default CostBreakdownChart;
