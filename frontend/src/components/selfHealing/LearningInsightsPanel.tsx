/**
 * Learning Insights Panel Component
 * T160 - Create learning insights panel
 *
 * Displays learned patterns, suggestions, and system learning insights
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export interface LearnedPattern {
  id: string;
  patternSignature: string;
  description: string;
  occurrenceCount: number;
  lastOccurrence: string;
  avgResolutionTimeMinutes: number;
  successfulResolutions: number;
  failedResolutions: number;
  suggestedActions: string[];
  confidence: number;
  status: 'discovered' | 'validated' | 'active' | 'deprecated';
  trend: 'increasing' | 'stable' | 'decreasing';
  seasonality?: {
    dayOfWeek?: number[];
    hourOfDay?: number[];
    pattern: string;
  };
  correlatedPatterns: string[];
  metadata: Record<string, unknown>;
}

export interface LearningInsight {
  id: string;
  type: 'pattern_trend' | 'action_effectiveness' | 'correlation' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'important';
  createdAt: string;
  data: Record<string, unknown>;
  actionable: boolean;
  suggestedAction?: string;
}

export interface ActionSuggestion {
  id: string;
  patternType: string;
  suggestedActionType: string;
  confidence: number;
  reason: string;
  basedOn: {
    totalOccurrences: number;
    successfulResolutions: number;
    avgImprovementPercent: number;
  };
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
}

export interface LearningStatistics {
  totalLearnedPatterns: number;
  activePatterns: number;
  pendingSuggestions: number;
  overallEffectiveness: number;
  recentInsights: LearningInsight[];
  topPatterns: LearnedPattern[];
}

interface LearningInsightsPanelProps {
  organizationId: string;
  onApproveSuggestion?: (suggestionId: string) => void;
  onApprovePattern?: (patternId: string) => void;
  onRunAnalysis?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function LearningInsightsPanel({
  organizationId,
  onApproveSuggestion,
  onApprovePattern,
  onRunAnalysis,
}: LearningInsightsPanelProps) {
  const [statistics, setStatistics] = useState<LearningStatistics | null>(null);
  const [learnedPatterns, setLearnedPatterns] = useState<LearnedPattern[]>([]);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'patterns' | 'suggestions' | 'insights'>('patterns');
  const [selectedPattern, setSelectedPattern] = useState<LearnedPattern | null>(null);

  // Fetch learning data
  const fetchLearningData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, patternsRes, suggestionsRes, insightsRes] = await Promise.all([
        fetch(`/api/self-healing/learning/statistics`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch(`/api/self-healing/learning/patterns`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch(`/api/self-healing/learning/suggestions`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch(`/api/self-healing/learning/insights`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
      ]);

      if (statsRes.ok) setStatistics(await statsRes.json());
      if (patternsRes.ok) {
        const data = await patternsRes.json();
        setLearnedPatterns(data.patterns || []);
      }
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json();
        setSuggestions(data.suggestions || []);
      }
      if (insightsRes.ok) {
        const data = await insightsRes.json();
        setInsights(data.insights || []);
      }
    } catch (error) {
      console.error('Failed to fetch learning data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchLearningData();
  }, [fetchLearningData]);

  // Run learning analysis
  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/self-healing/learning/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({ analysisWindowDays: 30 }),
      });

      if (response.ok) {
        onRunAnalysis?.();
        fetchLearningData();
      }
    } catch (error) {
      console.error('Learning analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Approve suggestion
  const handleApproveSuggestion = async (suggestionId: string) => {
    try {
      const response = await fetch(
        `/api/self-healing/learning/suggestions/${suggestionId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': organizationId,
          },
        }
      );

      if (response.ok) {
        onApproveSuggestion?.(suggestionId);
        fetchLearningData();
      }
    } catch (error) {
      console.error('Failed to approve suggestion:', error);
    }
  };

  // Approve learned pattern
  const handleApprovePattern = async (patternId: string) => {
    try {
      const response = await fetch(
        `/api/self-healing/learning/patterns/${patternId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': organizationId,
          },
        }
      );

      if (response.ok) {
        onApprovePattern?.(patternId);
        fetchLearningData();
      }
    } catch (error) {
      console.error('Failed to approve pattern:', error);
    }
  };

  const trendIcons: Record<string, string> = {
    increasing: '📈',
    stable: '➡️',
    decreasing: '📉',
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.totalLearnedPatterns}</div>
              <p className="text-sm text-gray-500">Learned Patterns</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {statistics.activePatterns}
              </div>
              <p className="text-sm text-gray-500">Active Patterns</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {statistics.pendingSuggestions}
              </div>
              <p className="text-sm text-gray-500">Pending Suggestions</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {Math.round(statistics.overallEffectiveness * 100)}%
              </div>
              <p className="text-sm text-gray-500">Overall Effectiveness</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Learning Insights</CardTitle>
            <Button onClick={handleRunAnalysis} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex border-b mb-4">
            {[
              { id: 'patterns', label: 'Learned Patterns', count: learnedPatterns.length },
              { id: 'suggestions', label: 'Suggestions', count: suggestions.filter(s => s.status === 'pending').length },
              { id: 'insights', label: 'Insights', count: insights.length },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
                {tab.count > 0 && (
                  <Badge className="ml-2" variant="secondary">
                    {tab.count}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Patterns Tab */}
          {activeTab === 'patterns' && (
            <div className="space-y-3">
              {learnedPatterns.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No learned patterns yet</p>
                  <p className="text-sm">
                    Run analysis to discover patterns from historical data
                  </p>
                </div>
              ) : (
                learnedPatterns.map((pattern) => (
                  <LearnedPatternCard
                    key={pattern.id}
                    pattern={pattern}
                    trendIcons={trendIcons}
                    confidenceColor={confidenceColor}
                    onApprove={
                      pattern.status === 'discovered'
                        ? () => handleApprovePattern(pattern.id)
                        : undefined
                    }
                    onSelect={() => setSelectedPattern(pattern)}
                  />
                ))
              )}
            </div>
          )}

          {/* Suggestions Tab */}
          {activeTab === 'suggestions' && (
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No suggestions available</p>
                  <p className="text-sm">
                    The system will generate suggestions as it learns from patterns
                  </p>
                </div>
              ) : (
                suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    confidenceColor={confidenceColor}
                    onApprove={
                      suggestion.status === 'pending'
                        ? () => handleApproveSuggestion(suggestion.id)
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          )}

          {/* Insights Tab */}
          {activeTab === 'insights' && (
            <div className="space-y-3">
              {insights.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No insights available</p>
                  <p className="text-sm">
                    Insights will appear as the system analyzes patterns and actions
                  </p>
                </div>
              ) : (
                insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pattern Detail Modal */}
      {selectedPattern && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Pattern Details</CardTitle>
                <Button variant="ghost" onClick={() => setSelectedPattern(null)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-1">Description</h4>
                <p className="text-gray-600">{selectedPattern.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-1">Occurrences</h4>
                  <p className="text-2xl font-bold">{selectedPattern.occurrenceCount}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Avg Resolution Time</h4>
                  <p className="text-2xl font-bold">
                    {selectedPattern.avgResolutionTimeMinutes}m
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Success Rate</h4>
                  <p className="text-2xl font-bold text-green-600">
                    {Math.round(
                      (selectedPattern.successfulResolutions /
                        (selectedPattern.successfulResolutions +
                          selectedPattern.failedResolutions)) *
                        100
                    )}%
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Confidence</h4>
                  <p className={`text-2xl font-bold ${confidenceColor(selectedPattern.confidence)}`}>
                    {Math.round(selectedPattern.confidence * 100)}%
                  </p>
                </div>
              </div>

              {selectedPattern.seasonality && (
                <div>
                  <h4 className="font-medium mb-1">Seasonality</h4>
                  <p className="text-gray-600">{selectedPattern.seasonality.pattern}</p>
                  {selectedPattern.seasonality.dayOfWeek && (
                    <p className="text-sm text-gray-500">
                      Peak days: {selectedPattern.seasonality.dayOfWeek.join(', ')}
                    </p>
                  )}
                  {selectedPattern.seasonality.hourOfDay && (
                    <p className="text-sm text-gray-500">
                      Peak hours: {selectedPattern.seasonality.hourOfDay.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {selectedPattern.suggestedActions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Suggested Actions</h4>
                  <ul className="list-disc list-inside text-gray-600">
                    {selectedPattern.suggestedActions.map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedPattern.correlatedPatterns.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Correlated Patterns</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPattern.correlatedPatterns.map((patternId, idx) => (
                      <Badge key={idx} variant="outline">
                        {patternId}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface LearnedPatternCardProps {
  pattern: LearnedPattern;
  trendIcons: Record<string, string>;
  confidenceColor: (confidence: number) => string;
  onApprove?: () => void;
  onSelect: () => void;
}

function LearnedPatternCard({
  pattern,
  trendIcons,
  confidenceColor,
  onApprove,
  onSelect,
}: LearnedPatternCardProps) {
  const statusColors: Record<string, string> = {
    discovered: 'bg-yellow-100 text-yellow-700',
    validated: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    deprecated: 'bg-gray-100 text-gray-500',
  };

  return (
    <div
      className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={statusColors[pattern.status]}>{pattern.status}</Badge>
            <span className="text-lg">{trendIcons[pattern.trend]}</span>
            <span className={`text-sm font-medium ${confidenceColor(pattern.confidence)}`}>
              {Math.round(pattern.confidence * 100)}% confidence
            </span>
          </div>
          <p className="font-medium">{pattern.description}</p>
          <p className="text-sm text-gray-500">
            {pattern.occurrenceCount} occurrences | Avg resolution:{' '}
            {pattern.avgResolutionTimeMinutes}m
          </p>
        </div>
        {onApprove && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
          >
            Validate
          </Button>
        )}
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: ActionSuggestion;
  confidenceColor: (confidence: number) => string;
  onApprove?: () => void;
}

function SuggestionCard({
  suggestion,
  confidenceColor,
  onApprove,
}: SuggestionCardProps) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    implemented: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={statusColors[suggestion.status]}>{suggestion.status}</Badge>
            <Badge variant="outline">{suggestion.suggestedActionType}</Badge>
            <span className={`text-sm font-medium ${confidenceColor(suggestion.confidence)}`}>
              {Math.round(suggestion.confidence * 100)}% confidence
            </span>
          </div>
          <p className="font-medium">
            Suggest "{suggestion.suggestedActionType}" for {suggestion.patternType} patterns
          </p>
          <p className="text-sm text-gray-600">{suggestion.reason}</p>
          <p className="text-xs text-gray-500 mt-1">
            Based on {suggestion.basedOn.totalOccurrences} occurrences,{' '}
            {suggestion.basedOn.successfulResolutions} successful resolutions (
            {suggestion.basedOn.avgImprovementPercent}% avg improvement)
          </p>
        </div>
        {onApprove && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
          >
            Approve
          </Button>
        )}
      </div>
    </div>
  );
}

interface InsightCardProps {
  insight: LearningInsight;
}

function InsightCard({ insight }: InsightCardProps) {
  const severityColors: Record<string, string> = {
    info: 'border-blue-200 bg-blue-50',
    warning: 'border-yellow-200 bg-yellow-50',
    important: 'border-red-200 bg-red-50',
  };

  const typeIcons: Record<string, string> = {
    pattern_trend: '📊',
    action_effectiveness: '✅',
    correlation: '🔗',
    anomaly: '⚠️',
    recommendation: '💡',
  };

  return (
    <div className={`border rounded-lg p-4 ${severityColors[insight.severity]}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{typeIcons[insight.type]}</span>
        <div className="flex-1">
          <p className="font-medium">{insight.title}</p>
          <p className="text-sm text-gray-600">{insight.description}</p>
          {insight.actionable && insight.suggestedAction && (
            <p className="text-sm text-blue-600 mt-2">
              💡 Suggested action: {insight.suggestedAction}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            {new Date(insight.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default LearningInsightsPanel;
