/**
 * Debt Gauge Component
 * Circular gauge visualization for debt scores
 * T264 - Debt gauge component
 */

import React from 'react';

interface DebtGaugeProps {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  label?: string;
  trend?: 'improving' | 'stable' | 'degrading';
  animated?: boolean;
}

const GRADE_COLORS = {
  A: { primary: '#22c55e', secondary: '#dcfce7' },
  B: { primary: '#84cc16', secondary: '#ecfccb' },
  C: { primary: '#eab308', secondary: '#fef3c7' },
  D: { primary: '#f97316', secondary: '#ffedd5' },
  F: { primary: '#ef4444', secondary: '#fee2e2' },
};

const SIZES = {
  small: { size: 80, strokeWidth: 6, fontSize: 20, gradeSize: 14 },
  medium: { size: 120, strokeWidth: 8, fontSize: 28, gradeSize: 18 },
  large: { size: 180, strokeWidth: 10, fontSize: 40, gradeSize: 24 },
};

export const DebtGauge: React.FC<DebtGaugeProps> = ({
  score,
  grade,
  size = 'medium',
  showLabel = true,
  label,
  trend,
  animated = true,
}) => {
  const config = SIZES[size];
  const colors = GRADE_COLORS[grade];
  const radius = (config.size - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const trendIcon = trend === 'improving' ? '↗' : trend === 'degrading' ? '↘' : '→';
  const trendColor = trend === 'improving' ? '#22c55e' : trend === 'degrading' ? '#ef4444' : '#6b7280';

  return (
    <div className="debt-gauge" style={{ width: config.size, height: config.size }}>
      <style>{`
        .debt-gauge {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .gauge-svg {
          transform: rotate(-90deg);
        }

        .gauge-bg {
          fill: none;
          stroke: ${colors.secondary};
        }

        .gauge-progress {
          fill: none;
          stroke: ${colors.primary};
          stroke-linecap: round;
          transition: ${animated ? 'stroke-dashoffset 1s ease-out' : 'none'};
        }

        .gauge-content {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .gauge-score {
          font-size: ${config.fontSize}px;
          font-weight: bold;
          color: #111827;
          line-height: 1;
        }

        .gauge-grade {
          font-size: ${config.gradeSize}px;
          font-weight: 600;
          color: ${colors.primary};
          margin-top: 2px;
        }

        .gauge-trend {
          font-size: ${config.gradeSize - 4}px;
          color: ${trendColor};
        }

        .gauge-label {
          font-size: ${config.gradeSize - 6}px;
          color: #6b7280;
          margin-top: 4px;
          text-align: center;
          max-width: ${config.size - 20}px;
        }
      `}</style>

      <svg className="gauge-svg" width={config.size} height={config.size}>
        <circle
          className="gauge-bg"
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          strokeWidth={config.strokeWidth}
        />
        <circle
          className="gauge-progress"
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          strokeWidth={config.strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>

      <div className="gauge-content">
        <span className="gauge-score">{score}</span>
        <span className="gauge-grade">{grade}</span>
        {trend && <span className="gauge-trend">{trendIcon}</span>}
        {showLabel && label && <span className="gauge-label">{label}</span>}
      </div>
    </div>
  );
};

export default DebtGauge;
