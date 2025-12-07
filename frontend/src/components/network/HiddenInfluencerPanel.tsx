/**
 * Hidden Influencer Panel Component
 * Displays hidden influencers and key person risks
 * T248 - Hidden influencer visualization
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface InfluenceIndicator {
  type: string;
  value: number;
  description: string;
  weight: number;
}

export interface HiddenInfluencer {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  influenceScore: number;
  formalLevel: number;
  actualLevel: number;
  hiddenInfluenceType: HiddenInfluenceType;
  indicators: InfluenceIndicator[];
  confidenceScore: number;
  recommendations: string[];
}

export type HiddenInfluenceType =
  | 'shadow-leader'
  | 'knowledge-broker'
  | 'cultural-anchor'
  | 'rising-star'
  | 'quiet-expert'
  | 'connector';

interface RiskAnalysis {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  keyPersonRisks: Array<{
    email: string;
    displayName?: string;
    riskType: string;
    impact: string;
    mitigation: string;
  }>;
  overallRecommendations: string[];
}

interface HiddenInfluencerPanelProps {
  hiddenInfluencers: HiddenInfluencer[];
  stats: {
    totalIdentified: number;
    byType: Record<HiddenInfluenceType, number>;
    avgConfidenceScore: number;
  };
  riskAnalysis?: RiskAnalysis;
  onSelect?: (email: string) => void;
  selectedEmail?: string;
}

const TYPE_CONFIG: Record<HiddenInfluenceType, { color: string; bg: string; icon: string; description: string }> = {
  'shadow-leader': {
    color: 'text-purple-800',
    bg: 'bg-purple-100',
    icon: '👤',
    description: 'High influence without formal authority',
  },
  'knowledge-broker': {
    color: 'text-blue-800',
    bg: 'bg-blue-100',
    icon: '🔗',
    description: 'Key information conduit',
  },
  'cultural-anchor': {
    color: 'text-green-800',
    bg: 'bg-green-100',
    icon: '⚓',
    description: 'Central to informal networks',
  },
  'rising-star': {
    color: 'text-yellow-800',
    bg: 'bg-yellow-100',
    icon: '⭐',
    description: 'Rapidly growing influence',
  },
  'quiet-expert': {
    color: 'text-gray-800',
    bg: 'bg-gray-100',
    icon: '🎯',
    description: 'Technical influence without visibility',
  },
  'connector': {
    color: 'text-cyan-800',
    bg: 'bg-cyan-100',
    icon: '🌉',
    description: 'Bridges organizational silos',
  },
};

const RISK_COLORS = {
  low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500' },
  critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500' },
};

export function HiddenInfluencerPanel({
  hiddenInfluencers,
  stats,
  riskAnalysis,
  onSelect,
  selectedEmail,
}: HiddenInfluencerPanelProps) {
  const [filterType, setFilterType] = useState<HiddenInfluenceType | 'all'>('all');
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

  // Filter influencers
  const filteredInfluencers = useMemo(() => {
    if (filterType === 'all') return hiddenInfluencers;
    return hiddenInfluencers.filter((i) => i.hiddenInfluenceType === filterType);
  }, [hiddenInfluencers, filterType]);

  return (
    <div className="space-y-6">
      {/* Risk Alert Banner */}
      {riskAnalysis && riskAnalysis.riskLevel !== 'low' && (
        <Card className={`border-2 ${RISK_COLORS[riskAnalysis.riskLevel].border}`}>
          <CardContent className={`pt-4 ${RISK_COLORS[riskAnalysis.riskLevel].bg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className={`font-bold ${RISK_COLORS[riskAnalysis.riskLevel].text}`}>
                    {riskAnalysis.riskLevel.toUpperCase()} Key Person Risk
                  </p>
                  <p className="text-sm text-gray-600">
                    {riskAnalysis.keyPersonRisks.length} critical dependencies identified
                  </p>
                </div>
              </div>
              <Badge className={`${RISK_COLORS[riskAnalysis.riskLevel].bg} ${RISK_COLORS[riskAnalysis.riskLevel].text}`}>
                {riskAnalysis.riskLevel}
              </Badge>
            </div>

            {riskAnalysis.overallRecommendations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-1">Recommended Actions:</p>
                <ul className="text-sm text-gray-600 list-disc list-inside">
                  {riskAnalysis.overallRecommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-purple-600">{stats.totalIdentified}</p>
            <p className="text-sm text-gray-500">Hidden Influencers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-blue-600">
              {(stats.avgConfidenceScore * 100).toFixed(0)}%
            </p>
            <p className="text-sm text-gray-500">Avg Confidence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-green-600">
              {Object.values(stats.byType).filter((v) => v > 0).length}
            </p>
            <p className="text-sm text-gray-500">Types Detected</p>
          </CardContent>
        </Card>
      </div>

      {/* Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Influencer Type Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(stats.byType).map(([type, count]) => {
              const config = TYPE_CONFIG[type as HiddenInfluenceType];
              const isFiltered = filterType === type;

              return (
                <div
                  key={type}
                  className={`p-4 rounded-lg cursor-pointer transition-all ${
                    isFiltered
                      ? `${config.bg} ring-2 ring-offset-2`
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  onClick={() => setFilterType(isFiltered ? 'all' : type as HiddenInfluenceType)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{config.icon}</span>
                    <div>
                      <p className={`font-medium ${config.color} capitalize`}>
                        {type.replace('-', ' ')}
                      </p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{config.description}</p>
                </div>
              );
            })}
          </div>
          {filterType !== 'all' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setFilterType('all')}
            >
              Clear Filter
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Influencer List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Hidden Influencers
            {filterType !== 'all' && (
              <Badge className="ml-2" variant="secondary">
                {filterType.replace('-', ' ')}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredInfluencers.map((influencer) => {
              const config = TYPE_CONFIG[influencer.hiddenInfluenceType];
              const isExpanded = expandedPerson === influencer.email;
              const isSelected = selectedEmail === influencer.email;

              return (
                <div
                  key={influencer.email}
                  className={`rounded-lg overflow-hidden border transition-all ${
                    isSelected ? 'border-blue-400 border-2' : 'border-gray-200'
                  }`}
                >
                  {/* Header */}
                  <div
                    className={`p-4 cursor-pointer ${config.bg}`}
                    onClick={() => {
                      setExpandedPerson(isExpanded ? null : influencer.email);
                      onSelect?.(influencer.email);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{config.icon}</span>
                        <div>
                          <p className="font-medium">
                            {influencer.displayName || influencer.email}
                          </p>
                          <p className="text-sm text-gray-600">
                            {influencer.jobTitle || influencer.email}
                          </p>
                          {influencer.department && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {influencer.department}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <Badge className={`${config.bg} ${config.color}`}>
                          {influencer.hiddenInfluenceType.replace('-', ' ')}
                        </Badge>
                        <div className="mt-2">
                          <p className="text-xs text-gray-500">Confidence</p>
                          <div className="flex items-center gap-1">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${influencer.confidenceScore * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">
                              {(influencer.confidenceScore * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="p-4 bg-white border-t">
                      {/* Position Comparison */}
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Position Analysis:</p>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Formal Level</p>
                            <p className="text-lg font-bold text-gray-600">{influencer.formalLevel}</p>
                          </div>
                          <div className="text-2xl text-gray-300">→</div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Actual Level</p>
                            <p className="text-lg font-bold text-blue-600">{influencer.actualLevel}</p>
                          </div>
                          <div className="flex-1 text-right">
                            <p className="text-xs text-gray-500">Influence Score</p>
                            <p className="text-lg font-bold text-purple-600">
                              {(influencer.influenceScore * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Indicators */}
                      {influencer.indicators.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 mb-2">Key Indicators:</p>
                          <div className="space-y-2">
                            {influencer.indicators.map((indicator, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{indicator.description}</span>
                                <Badge variant="outline">
                                  {(indicator.value * 100).toFixed(0)}%
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommendations */}
                      {influencer.recommendations.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-2">Recommendations:</p>
                          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                            {influencer.recommendations.map((rec, i) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredInfluencers.length === 0 && (
              <p className="text-center text-gray-500 py-8">No hidden influencers found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Key Person Risks */}
      {riskAnalysis && riskAnalysis.keyPersonRisks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>⚠️</span> Key Person Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskAnalysis.keyPersonRisks.map((risk, i) => (
                <div
                  key={i}
                  className="p-4 bg-orange-50 border border-orange-200 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-orange-800">
                        {risk.displayName || risk.email}
                      </p>
                      <Badge className="bg-orange-100 text-orange-800 mt-1">
                        {risk.riskType}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-2">
                    <strong>Impact:</strong> {risk.impact}
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    <strong>Mitigation:</strong> {risk.mitigation}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default HiddenInfluencerPanel;
