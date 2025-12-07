/**
 * Trend Chart Component
 * T124 - Create trend chart component
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TrendChartProps {
  title: string;
  data: TrendDataPoint[];
  type?: 'line' | 'bar' | 'area';
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
  color?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    value: number;
  };
  annotations?: { timestamp: string; label: string }[];
}

export function TrendChart({
  title,
  data,
  type = 'line',
  height = 200,
  showGrid = true,
  showLabels = true,
  color = '#3b82f6',
  trend,
  annotations,
}: TrendChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return { points: [], min: 0, max: 100 };

    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padding = range * 0.1;

    const normalizedMin = min - padding;
    const normalizedMax = max + padding;
    const normalizedRange = normalizedMax - normalizedMin;

    const points = data.map((d, i) => ({
      x: (i / (data.length - 1 || 1)) * 100,
      y: ((d.value - normalizedMin) / normalizedRange) * 100,
      value: d.value,
      timestamp: d.timestamp,
      label: d.label,
    }));

    return { points, min: normalizedMin, max: normalizedMax };
  }, [data]);

  const svgPath = useMemo(() => {
    if (chartData.points.length < 2) return '';

    if (type === 'line' || type === 'area') {
      const pathData = chartData.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${100 - p.y}`)
        .join(' ');

      if (type === 'area') {
        return `${pathData} L ${chartData.points[chartData.points.length - 1].x} 100 L 0 100 Z`;
      }
      return pathData;
    }

    return '';
  }, [chartData.points, type]);

  const trendIcon = {
    up: '↑',
    down: '↓',
    stable: '→',
  };

  const trendColor = trend
    ? trend.direction === 'up'
      ? trend.value >= 0
        ? 'text-green-600'
        : 'text-red-600'
      : trend.direction === 'down'
      ? trend.value <= 0
        ? 'text-green-600'
        : 'text-red-600'
      : 'text-gray-500'
    : '';

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-gray-400"
            style={{ height }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {trend && (
            <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
              <span>{trendIcon[trend.direction]}</span>
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Grid lines */}
            {showGrid && (
              <g className="stroke-gray-200" strokeWidth="0.2">
                <line x1="0" y1="25" x2="100" y2="25" />
                <line x1="0" y1="50" x2="100" y2="50" />
                <line x1="0" y1="75" x2="100" y2="75" />
              </g>
            )}

            {/* Area fill */}
            {type === 'area' && svgPath && (
              <path
                d={svgPath}
                fill={color}
                fillOpacity="0.1"
              />
            )}

            {/* Line */}
            {(type === 'line' || type === 'area') && svgPath && (
              <path
                d={svgPath.replace(/ L \d+ 100 L 0 100 Z$/, '')}
                fill="none"
                stroke={color}
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Bar chart */}
            {type === 'bar' && chartData.points.map((p, i) => {
              const barWidth = 100 / chartData.points.length * 0.7;
              const barX = p.x - barWidth / 2;
              return (
                <rect
                  key={i}
                  x={barX}
                  y={100 - p.y}
                  width={barWidth}
                  height={p.y}
                  fill={color}
                  fillOpacity="0.8"
                  rx="0.5"
                />
              );
            })}

            {/* Data points */}
            {(type === 'line' || type === 'area') && chartData.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={100 - p.y}
                r="1"
                fill={color}
              />
            ))}
          </svg>

          {/* Y-axis labels */}
          {showLabels && (
            <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs text-gray-400 -ml-12">
              <span>{chartData.max.toFixed(0)}</span>
              <span>{((chartData.max + chartData.min) / 2).toFixed(0)}</span>
              <span>{chartData.min.toFixed(0)}</span>
            </div>
          )}

          {/* X-axis labels */}
          {showLabels && data.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-400 -mb-5">
              <span>
                {new Date(data[0].timestamp).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span>
                {new Date(data[data.length - 1].timestamp).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}

          {/* Annotations */}
          {annotations && annotations.map((ann, i) => {
            const point = chartData.points.find(
              p => new Date(p.timestamp).toDateString() === new Date(ann.timestamp).toDateString()
            );
            if (!point) return null;

            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${point.x}%`,
                  top: `${100 - point.y}%`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <Badge variant="secondary" className="text-xs whitespace-nowrap">
                  {ann.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mini sparkline chart for inline display
 */
export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = '#3b82f6',
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const path = useMemo(() => {
    if (data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [data, width, height]);

  if (data.length < 2) return null;

  return (
    <svg width={width} height={height} className="inline-block">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Multiple series trend chart
 */
export function MultiSeriesTrendChart({
  title,
  series,
  height = 200,
}: {
  title: string;
  series: {
    name: string;
    data: TrendDataPoint[];
    color: string;
  }[];
  height?: number;
}) {
  const allValues = series.flatMap(s => s.data.map(d => d.value));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const padding = range * 0.1;
  const normalizedMin = min - padding;
  const normalizedMax = max + padding;
  const normalizedRange = normalizedMax - normalizedMin;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex gap-3">
            {series.map(s => (
              <div key={s.name} className="flex items-center gap-1 text-xs">
                <span
                  className="w-3 h-1 rounded"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-gray-500">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Grid lines */}
            <g className="stroke-gray-200" strokeWidth="0.2">
              <line x1="0" y1="25" x2="100" y2="25" />
              <line x1="0" y1="50" x2="100" y2="50" />
              <line x1="0" y1="75" x2="100" y2="75" />
            </g>

            {/* Series lines */}
            {series.map((s, seriesIndex) => {
              if (s.data.length < 2) return null;

              const pathData = s.data
                .map((d, i) => {
                  const x = (i / (s.data.length - 1)) * 100;
                  const y = ((d.value - normalizedMin) / normalizedRange) * 100;
                  return `${i === 0 ? 'M' : 'L'} ${x} ${100 - y}`;
                })
                .join(' ');

              return (
                <path
                  key={seriesIndex}
                  d={pathData}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="0.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export default TrendChart;
