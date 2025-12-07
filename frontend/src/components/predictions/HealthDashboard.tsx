/**
 * Health Dashboard Component (T127)
 * Process health scoring and monitoring
 */

import React, { useState, useEffect } from 'react';
import { predictionApi } from '../../services/intelligence.api';

interface HealthDimension {
  name: string;
  score: number;
  weight: number;
  status: 'healthy' | 'warning' | 'critical';
  description: string;
}

interface HealthTrend {
  dimension: string;
  direction: 'improving' | 'stable' | 'declining';
  magnitude: number;
  period: string;
}

interface HealthAlert {
  severity: 'info' | 'warning' | 'critical';
  dimension: string;
  message: string;
  recommendation: string;
  timestamp: string;
}

interface ProcessHealth {
  processId: string;
  overallScore: number;
  dimensions: HealthDimension[];
  trends: HealthTrend[];
  alerts: HealthAlert[];
  lastUpdated: string;
}

interface HealthDashboardProps {
  processId: string;
}

export const HealthDashboard: React.FC<HealthDashboardProps> = ({ processId }) => {
  const [health, setHealth] = useState<ProcessHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHealth();
  }, [processId]);

  const loadHealth = async () => {
    try {
      setLoading(true);
      const response = await predictionApi.getHealth(processId);
      setHealth(response.data.data);
    } catch (err) {
      setError('Failed to load health data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'improving':
        return '📈';
      case 'declining':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '🟡';
      default:
        return '🔵';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error || 'Failed to load health data'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Process Health</h3>
            <p className="text-sm text-gray-500">
              Last updated: {new Date(health.lastUpdated).toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <div className={`text-5xl font-bold ${getScoreColor(health.overallScore)}`}>
              {Math.round(health.overallScore)}
            </div>
            <div className="text-sm text-gray-500">Overall Score</div>
          </div>
        </div>

        {/* Score Ring Visualization */}
        <div className="mt-6 flex justify-center">
          <svg className="w-48 h-48" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="10"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={health.overallScore >= 80 ? '#22c55e' : health.overallScore >= 50 ? '#eab308' : '#ef4444'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${health.overallScore * 2.83} 283`}
              transform="rotate(-90 50 50)"
            />
          </svg>
        </div>
      </div>

      {/* Dimensions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Health Dimensions</h4>
        <div className="space-y-4">
          {health.dimensions.map((dim) => (
            <div key={dim.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(dim.status)}`} />
                  <span className="font-medium text-gray-700">{dim.name}</span>
                </div>
                <span className={`font-bold ${getScoreColor(dim.score)}`}>
                  {Math.round(dim.score)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getStatusColor(dim.status)}`}
                  style={{ width: `${dim.score}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{dim.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trends */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Trends</h4>
        <div className="grid grid-cols-2 gap-4">
          {health.trends.map((trend, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
            >
              <span className="text-2xl">{getTrendIcon(trend.direction)}</span>
              <div>
                <p className="font-medium text-gray-900">{trend.dimension}</p>
                <p className="text-sm text-gray-500 capitalize">
                  {trend.direction} over {trend.period}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {health.alerts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">Alerts</h4>
          <div className="space-y-3">
            {health.alerts.map((alert, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 border border-red-200'
                    : alert.severity === 'warning'
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getAlertIcon(alert.severity)}</span>
                  <div className="flex-1">
                    <p className={`font-medium ${
                      alert.severity === 'critical'
                        ? 'text-red-800'
                        : alert.severity === 'warning'
                        ? 'text-yellow-800'
                        : 'text-blue-800'
                    }`}>
                      {alert.message}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      💡 {alert.recommendation}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthDashboard;
