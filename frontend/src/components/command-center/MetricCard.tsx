/**
 * Metric Card Component
 * T122 - Create metric card component
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

export interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    value: number;
    period?: string;
  };
  status?: 'good' | 'warning' | 'critical' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
  onClick?: () => void;
  loading?: boolean;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

export function MetricCard({
  title,
  value,
  unit,
  trend,
  status = 'neutral',
  icon,
  subtitle,
  onClick,
  loading = false,
  thresholds,
}: MetricCardProps) {
  // Determine status from thresholds if provided
  let computedStatus = status;
  if (thresholds && typeof value === 'number') {
    if (thresholds.critical && value >= thresholds.critical) {
      computedStatus = 'critical';
    } else if (thresholds.warning && value >= thresholds.warning) {
      computedStatus = 'warning';
    } else {
      computedStatus = 'good';
    }
  }

  const statusColors = {
    good: 'text-green-600',
    warning: 'text-yellow-600',
    critical: 'text-red-600',
    neutral: 'text-gray-600',
  };

  const statusBg = {
    good: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    critical: 'bg-red-50 border-red-200',
    neutral: 'bg-white border-gray-200',
  };

  const trendIcon = {
    up: '↑',
    down: '↓',
    stable: '→',
  };

  const trendColor = {
    up: trend?.value && trend.value > 0 ? 'text-green-600' : 'text-red-600',
    down: trend?.value && trend.value < 0 ? 'text-green-600' : 'text-red-600',
    stable: 'text-gray-500',
  };

  return (
    <Card
      className={`${statusBg[computedStatus]} border ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-600">
            {title}
          </CardTitle>
          {icon && <span className="text-gray-400">{icon}</span>}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-20 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-bold ${statusColors[computedStatus]}`}>
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              {unit && (
                <span className="text-sm text-gray-500">{unit}</span>
              )}
            </div>

            {trend && (
              <div className={`flex items-center gap-1 mt-1 text-sm ${trendColor[trend.direction]}`}>
                <span>{trendIcon[trend.direction]}</span>
                <span>{Math.abs(trend.value).toFixed(1)}%</span>
                {trend.period && (
                  <span className="text-gray-400">{trend.period}</span>
                )}
              </div>
            )}

            {subtitle && (
              <p className="text-xs text-gray-500 mt-2">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact metric display for dashboards
 */
export function CompactMetric({
  label,
  value,
  status = 'neutral',
}: {
  label: string;
  value: string | number;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
}) {
  const statusColors = {
    good: 'text-green-600',
    warning: 'text-yellow-600',
    critical: 'text-red-600',
    neutral: 'text-gray-900',
  };

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`font-medium ${statusColors[status]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

/**
 * Health score gauge display
 */
export function HealthGauge({
  score,
  label = 'Health Score',
  size = 'medium',
}: {
  score: number;
  label?: string;
  size?: 'small' | 'medium' | 'large';
}) {
  const getColor = (value: number) => {
    if (value >= 80) return '#22c55e'; // green
    if (value >= 60) return '#eab308'; // yellow
    if (value >= 40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const sizes = {
    small: { width: 80, stroke: 6, fontSize: 'text-lg' },
    medium: { width: 120, stroke: 8, fontSize: 'text-2xl' },
    large: { width: 160, stroke: 10, fontSize: 'text-3xl' },
  };

  const { width, stroke, fontSize } = sizes[size];
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = `${(score / 100) * circumference} ${circumference}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width, height: width }}>
        {/* Background circle */}
        <svg width={width} height={width} className="transform -rotate-90">
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
          />
          {/* Progress circle */}
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            fill="none"
            stroke={getColor(score)}
            strokeWidth={stroke}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${fontSize}`}>{score}</span>
        </div>
      </div>
      <span className="text-sm text-gray-500 mt-2">{label}</span>
    </div>
  );
}

export default MetricCard;
