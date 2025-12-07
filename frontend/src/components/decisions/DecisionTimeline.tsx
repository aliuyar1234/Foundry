/**
 * Decision Timeline Component (T072)
 * Visual timeline of organizational decisions
 */

import React, { useState, useEffect } from 'react';
import { decisionApi } from '../../services/intelligence.api';

interface TimelineEntry {
  id: string;
  title: string;
  status: string;
  decisionDate: string | null;
  confidence: number;
  impactAreas: string[];
}

interface DecisionTimelineProps {
  startDate?: string;
  endDate?: string;
  onSelect?: (id: string) => void;
}

export const DecisionTimeline: React.FC<DecisionTimelineProps> = ({
  startDate,
  endDate,
  onSelect,
}) => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTimeline();
  }, [startDate, endDate]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      const response = await decisionApi.getTimeline({
        startDate,
        endDate,
        limit: 100,
      });
      setEntries(response.data.data);
    } catch (err) {
      setError('Failed to load timeline');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-500';
      case 'REJECTED':
        return 'bg-red-500';
      case 'PENDING_REVIEW':
        return 'bg-yellow-500';
      case 'SUPERSEDED':
        return 'bg-gray-500';
      default:
        return 'bg-blue-500';
    }
  };

  const groupByMonth = (entries: TimelineEntry[]) => {
    const groups: Record<string, TimelineEntry[]> = {};

    entries.forEach((entry) => {
      if (!entry.decisionDate) return;
      const date = new Date(entry.decisionDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
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

  const grouped = groupByMonth(entries);

  return (
    <div className="space-y-8">
      {grouped.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No decisions with dates found
        </div>
      ) : (
        grouped.map(([month, monthEntries]) => (
          <div key={month}>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">
              {new Date(month + '-01').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
              })}
            </h3>

            <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
              {monthEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onSelect?.(entry.id)}
                  className="relative pl-8 cursor-pointer group"
                >
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-0 w-4 h-4 rounded-full -translate-x-[9px] ${getStatusColor(
                      entry.status
                    )} ring-4 ring-white`}
                  />

                  {/* Content */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 group-hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {entry.title}
                        </h4>
                        {entry.decisionDate && (
                          <p className="text-sm text-gray-500">
                            {new Date(entry.decisionDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          entry.status === 'APPROVED'
                            ? 'bg-green-100 text-green-800'
                            : entry.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {entry.status.replace('_', ' ')}
                      </span>
                    </div>

                    {entry.impactAreas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.impactAreas.map((area) => (
                          <span
                            key={area}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            entry.confidence >= 0.8
                              ? 'bg-green-500'
                              : entry.confidence >= 0.5
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${entry.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {Math.round(entry.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default DecisionTimeline;
