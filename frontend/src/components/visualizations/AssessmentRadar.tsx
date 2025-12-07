/**
 * Assessment Radar Chart
 * Visualizes assessment scores in a radar/spider chart format
 */

import React, { useMemo } from 'react';

interface RadarDataPoint {
  category: string;
  score: number;
}

interface AssessmentRadarProps {
  data: RadarDataPoint[];
  size?: number;
  maxValue?: number;
  showLabels?: boolean;
  showValues?: boolean;
  color?: string;
  backgroundColor?: string;
}

export function AssessmentRadar({
  data,
  size = 300,
  maxValue = 100,
  showLabels = true,
  showValues = true,
  color = '#3b82f6',
  backgroundColor = 'rgba(59, 130, 246, 0.2)',
}: AssessmentRadarProps) {
  const center = size / 2;
  const radius = (size / 2) * 0.7; // Leave space for labels
  const numPoints = data.length;

  // Calculate angle for each point
  const angleStep = (2 * Math.PI) / numPoints;
  const startAngle = -Math.PI / 2; // Start from top

  // Generate points for the data polygon
  const dataPoints = useMemo(() => {
    return data.map((point, index) => {
      const angle = startAngle + index * angleStep;
      const r = (point.score / maxValue) * radius;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        category: point.category,
        score: point.score,
        labelX: center + (radius + 25) * Math.cos(angle),
        labelY: center + (radius + 25) * Math.sin(angle),
      };
    });
  }, [data, center, radius, angleStep, startAngle, maxValue]);

  // Generate grid lines
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];
  const gridLines = useMemo(() => {
    return gridLevels.map((level) => {
      const points = [];
      for (let i = 0; i < numPoints; i++) {
        const angle = startAngle + i * angleStep;
        const r = level * radius;
        points.push({
          x: center + r * Math.cos(angle),
          y: center + r * Math.sin(angle),
        });
      }
      return points;
    });
  }, [numPoints, center, radius, angleStep, startAngle]);

  // Generate axis lines
  const axisLines = useMemo(() => {
    return Array.from({ length: numPoints }, (_, i) => {
      const angle = startAngle + i * angleStep;
      return {
        x1: center,
        y1: center,
        x2: center + radius * Math.cos(angle),
        y2: center + radius * Math.sin(angle),
      };
    });
  }, [numPoints, center, radius, angleStep, startAngle]);

  // Create polygon path for data
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Create polygon paths for grid
  const createGridPath = (points: Array<{ x: number; y: number }>) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e'; // Green
    if (score >= 60) return '#3b82f6'; // Blue
    if (score >= 40) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  // Get label anchor based on position
  const getLabelAnchor = (x: number) => {
    if (Math.abs(x - center) < 10) return 'middle';
    return x > center ? 'start' : 'end';
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid circles */}
        {gridLines.map((points, level) => (
          <path
            key={`grid-${level}`}
            d={createGridPath(points)}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={`axis-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#d1d5db"
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <path d={dataPath} fill={backgroundColor} stroke={color} strokeWidth={2} />

        {/* Data points */}
        {dataPoints.map((point, i) => (
          <circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={getScoreColor(point.score)}
            stroke="white"
            strokeWidth={2}
          />
        ))}

        {/* Labels */}
        {showLabels &&
          dataPoints.map((point, i) => (
            <g key={`label-${i}`}>
              <text
                x={point.labelX}
                y={point.labelY}
                textAnchor={getLabelAnchor(point.labelX)}
                dominantBaseline="middle"
                className="text-xs fill-gray-700"
              >
                {point.category}
              </text>
              {showValues && (
                <text
                  x={point.labelX}
                  y={point.labelY + 14}
                  textAnchor={getLabelAnchor(point.labelX)}
                  dominantBaseline="middle"
                  className="text-xs font-medium"
                  fill={getScoreColor(point.score)}
                >
                  {Math.round(point.score)}%
                </text>
              )}
            </g>
          ))}

        {/* Grid level labels */}
        {gridLevels.map((level, i) => (
          <text
            key={`level-${i}`}
            x={center + 3}
            y={center - level * radius + 3}
            className="text-xs fill-gray-400"
          >
            {level * maxValue}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-gray-600">Excellent (80+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">Good (60-79)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span className="text-gray-600">Fair (40-59)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-600">Poor (&lt;40)</span>
        </div>
      </div>
    </div>
  );
}

export default AssessmentRadar;
