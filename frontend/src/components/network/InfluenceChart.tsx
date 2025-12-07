/**
 * Influence Chart Component
 * Visualizes influence scores and rankings
 * T245 - Influence visualization
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';

export interface InfluenceScore {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  overallScore: number;
  rank: number;
  percentile: number;
  components: {
    networkInfluence: number;
    communicationVolume: number;
    responseInfluence: number;
    bridgingInfluence: number;
    temporalInfluence: number;
  };
}

interface InfluenceChartProps {
  influencers: InfluenceScore[];
  onSelect?: (email: string) => void;
  selectedEmail?: string;
  showTop?: number;
}

const COMPONENT_LABELS: Record<string, { label: string; color: string }> = {
  networkInfluence: { label: 'Network', color: '#3B82F6' },
  communicationVolume: { label: 'Volume', color: '#10B981' },
  responseInfluence: { label: 'Response', color: '#F59E0B' },
  bridgingInfluence: { label: 'Bridging', color: '#8B5CF6' },
  temporalInfluence: { label: 'Recency', color: '#EC4899' },
};

export function InfluenceChart({
  influencers,
  onSelect,
  selectedEmail,
  showTop = 20,
}: InfluenceChartProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'network' | 'bridging'>('rank');

  // Filter and sort
  const filteredInfluencers = useMemo(() => {
    let result = [...influencers];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (i) =>
          i.email.toLowerCase().includes(term) ||
          i.displayName?.toLowerCase().includes(term) ||
          i.department?.toLowerCase().includes(term)
      );
    }

    if (sortBy === 'network') {
      result.sort((a, b) => b.components.networkInfluence - a.components.networkInfluence);
    } else if (sortBy === 'bridging') {
      result.sort((a, b) => b.components.bridgingInfluence - a.components.bridgingInfluence);
    }

    return result.slice(0, showTop);
  }, [influencers, searchTerm, sortBy, showTop]);

  const maxScore = Math.max(...influencers.map((i) => i.overallScore), 0.01);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Influence Leaderboard</CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="text-sm border rounded px-2 py-1"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="rank">Overall Rank</option>
              <option value="network">Network Influence</option>
              <option value="bridging">Bridging Influence</option>
            </select>
          </div>
        </div>
        <Input
          placeholder="Search by name, email, or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mt-2"
        />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredInfluencers.map((person) => (
            <div
              key={person.email}
              className={`p-4 rounded-lg cursor-pointer transition-all ${
                selectedEmail === person.email
                  ? 'bg-blue-50 border-blue-300 border-2'
                  : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
              }`}
              onClick={() => onSelect?.(person.email)}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm">
                    #{person.rank}
                  </div>
                  <div>
                    <p className="font-medium">{person.displayName || person.email}</p>
                    <p className="text-xs text-gray-500">
                      {person.jobTitle || person.email}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    className={
                      person.percentile >= 90
                        ? 'bg-green-100 text-green-800'
                        : person.percentile >= 75
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }
                  >
                    Top {(100 - person.percentile).toFixed(0)}%
                  </Badge>
                  {person.department && (
                    <p className="text-xs text-gray-400 mt-1">{person.department}</p>
                  )}
                </div>
              </div>

              {/* Overall score bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Overall Influence</span>
                  <span>{(person.overallScore * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all"
                    style={{ width: `${(person.overallScore / maxScore) * 100}%` }}
                  />
                </div>
              </div>

              {/* Component breakdown */}
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(person.components).map(([key, value]) => {
                  const config = COMPONENT_LABELS[key];
                  return (
                    <div key={key} className="text-center">
                      <div className="h-12 flex items-end justify-center">
                        <div
                          className="w-4 rounded-t transition-all"
                          style={{
                            height: `${value * 100}%`,
                            backgroundColor: config.color,
                          }}
                          title={`${config.label}: ${(value * 100).toFixed(0)}%`}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {config.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredInfluencers.length === 0 && (
            <p className="text-center text-gray-500 py-8">No results found</p>
          )}
        </div>

        {/* Component Legend */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-gray-500 mb-2">Influence Components:</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(COMPONENT_LABELS).map(([key, { label, color }]) => (
              <div key={key} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default InfluenceChart;
