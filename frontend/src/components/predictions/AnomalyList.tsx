/**
 * Anomaly List Component (T127)
 * Display detected anomalies
 */

import React, { useState, useEffect } from 'react';
import { predictionApi } from '../../services/intelligence.api';

interface Anomaly {
  id: string;
  processId: string;
  timestamp: string;
  anomalyScore: number;
  isAnomaly: boolean;
  type: string;
  affectedMetrics: string[];
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
}

interface AnomalyListProps {
  processId: string;
}

export const AnomalyList: React.FC<AnomalyListProps> = ({ processId }) => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnomalies();
  }, [processId]);

  const loadAnomalies = async () => {
    try {
      setLoading(true);
      const response = await predictionApi.getAnomalies(processId);
      setAnomalies(response.data.data);
    } catch (err) {
      setError('Failed to load anomalies');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'duration_spike':
        return '⏱️';
      case 'unusual_pattern':
        return '📊';
      case 'missing_step':
        return '⚠️';
      case 'out_of_order':
        return '🔀';
      case 'resource_anomaly':
        return '💻';
      case 'frequency_anomaly':
        return '📈';
      default:
        return '❓';
    }
  };

  const getSeverityColor = (score: number) => {
    if (score >= 0.8) return 'bg-red-100 text-red-800 border-red-200';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Detected Anomalies</h3>
        <button
          onClick={loadAnomalies}
          className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {anomalies.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <span className="text-4xl">✓</span>
          <p className="mt-2">No anomalies detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.filter(a => a.isAnomaly).map((anomaly) => (
            <div
              key={anomaly.id}
              className={`p-4 rounded-lg border ${getSeverityColor(anomaly.anomalyScore)}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getTypeIcon(anomaly.type)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      {anomaly.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h4>
                    <span className="text-sm">
                      {Math.round(anomaly.anomalyScore * 100)}% severity
                    </span>
                  </div>

                  <p className="text-sm mt-1">{anomaly.description}</p>

                  {anomaly.affectedMetrics.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {anomaly.affectedMetrics.map((metric) => (
                        <span
                          key={metric}
                          className="px-2 py-0.5 bg-white bg-opacity-50 rounded text-xs"
                        >
                          {metric}
                        </span>
                      ))}
                    </div>
                  )}

                  {anomaly.possibleCauses.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium opacity-75">Possible Causes:</p>
                      <ul className="mt-1 text-sm list-disc list-inside">
                        {anomaly.possibleCauses.map((cause, i) => (
                          <li key={i}>{cause}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {anomaly.suggestedActions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium opacity-75">Suggested Actions:</p>
                      <ul className="mt-1 text-sm list-disc list-inside">
                        {anomaly.suggestedActions.map((action, i) => (
                          <li key={i}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs opacity-50 mt-2">
                    Detected: {new Date(anomaly.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnomalyList;
