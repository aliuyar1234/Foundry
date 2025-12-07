/**
 * Recommendations List Component
 * Displays assessment recommendations as an interactive checklist
 */

import React, { useState } from 'react';

interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  timeframe?: string;
  dependencies?: string[];
  resources?: string[];
}

interface RecommendationsListProps {
  recommendations: Record<string, unknown>;
}

export function RecommendationsList({ recommendations }: RecommendationsListProps) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Extract recommendations from various formats
  const allRecommendations: Recommendation[] = extractRecommendations(recommendations);

  // Filter recommendations
  const filteredRecommendations = filter === 'all'
    ? allRecommendations
    : allRecommendations.filter((r) => r.priority === filter);

  // Group by category
  const groupedRecommendations = filteredRecommendations.reduce(
    (acc, rec) => {
      const category = rec.category || 'General';
      if (!acc[category]) acc[category] = [];
      acc[category].push(rec);
      return acc;
    },
    {} as Record<string, Recommendation[]>
  );

  // Toggle completion
  const toggleCompleted = (id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle expanded
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Priority styles
  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Effort/Impact indicator
  const getIndicatorDots = (level: string) => {
    const count = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
    return Array.from({ length: 3 }, (_, i) => (
      <div
        key={i}
        className={`w-2 h-2 rounded-full ${i < count ? 'bg-current' : 'bg-gray-300'}`}
      />
    ));
  };

  // Calculate progress
  const completedCount = allRecommendations.filter((r) => completedIds.has(r.id)).length;
  const totalCount = allRecommendations.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (allRecommendations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">No Recommendations</h3>
        <p className="text-gray-600 mt-1">
          No recommendations were generated for this assessment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Implementation Progress</h3>
          <span className="text-sm text-gray-600">
            {completedCount} of {totalCount} completed
          </span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>{progressPercent}% complete</span>
          <span>{totalCount - completedCount} remaining</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600">Filter:</span>
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map((priority) => {
          const count = priority === 'all'
            ? allRecommendations.length
            : allRecommendations.filter((r) => r.priority === priority).length;

          return (
            <button
              key={priority}
              onClick={() => setFilter(priority)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filter === priority
                  ? priority === 'all'
                    ? 'bg-blue-600 text-white'
                    : getPriorityStyles(priority)
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {priority.charAt(0).toUpperCase() + priority.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Recommendations by Category */}
      {Object.entries(groupedRecommendations).map(([category, recs]) => (
        <div key={category} className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h4 className="font-medium text-gray-900">{category}</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {recs.filter((r) => completedIds.has(r.id)).length} of {recs.length} completed
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {recs.map((rec) => {
              const isCompleted = completedIds.has(rec.id);
              const isExpanded = expandedIds.has(rec.id);

              return (
                <div
                  key={rec.id}
                  className={`p-4 transition-colors ${isCompleted ? 'bg-gray-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleCompleted(rec.id)}
                      className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 transition-colors ${
                        isCompleted
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 hover:border-blue-500'
                      }`}
                    >
                      {isCompleted && (
                        <svg className="w-full h-full text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h5
                          className={`font-medium ${
                            isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'
                          }`}
                        >
                          {rec.title}
                        </h5>
                        <span
                          className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded border ${getPriorityStyles(
                            rec.priority
                          )}`}
                        >
                          {rec.priority}
                        </span>
                      </div>

                      <p
                        className={`text-sm mt-1 ${
                          isCompleted ? 'text-gray-400' : 'text-gray-600'
                        }`}
                      >
                        {rec.description}
                      </p>

                      {/* Effort/Impact */}
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <span>Effort:</span>
                          <div className="flex items-center gap-0.5">
                            {getIndicatorDots(rec.effort)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <span>Impact:</span>
                          <div className="flex items-center gap-0.5 text-green-600">
                            {getIndicatorDots(rec.impact)}
                          </div>
                        </div>
                        {rec.timeframe && (
                          <span className="text-gray-500">
                            Timeline: {rec.timeframe}
                          </span>
                        )}
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          {rec.dependencies && rec.dependencies.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-gray-700">Dependencies:</span>
                              <ul className="mt-1 space-y-1">
                                {rec.dependencies.map((dep, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-center gap-1">
                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                    {dep}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {rec.resources && rec.resources.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-gray-700">Resources Needed:</span>
                              <ul className="mt-1 space-y-1">
                                {rec.resources.map((res, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-center gap-1">
                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {res}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expand/Collapse Button */}
                      {(rec.dependencies?.length || rec.resources?.length) && (
                        <button
                          onClick={() => toggleExpanded(rec.id)}
                          className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Quick Wins Section */}
      {allRecommendations.some((r) => r.effort === 'low' && r.impact === 'high') && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <h4 className="font-medium text-green-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Quick Wins
          </h4>
          <p className="text-sm text-green-700 mt-1">
            These recommendations have high impact with low effort - consider prioritizing them:
          </p>
          <ul className="mt-2 space-y-1">
            {allRecommendations
              .filter((r) => r.effort === 'low' && r.impact === 'high')
              .map((r) => (
                <li key={r.id} className="text-sm text-green-800 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                  {r.title}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Helper function to extract recommendations from various formats
function extractRecommendations(recommendations: Record<string, unknown>): Recommendation[] {
  const result: Recommendation[] = [];
  let idCounter = 0;

  // Handle array format
  if (Array.isArray(recommendations)) {
    return recommendations.map((r, i) => normalizeRecommendation(r, i));
  }

  // Handle categorized format
  const categories = ['strategic', 'tactical', 'quickWins', 'immediate', 'shortTerm', 'longTerm'];

  for (const category of categories) {
    const items = recommendations[category];
    if (Array.isArray(items)) {
      for (const item of items) {
        result.push(normalizeRecommendation(item, idCounter++, formatCategoryName(category)));
      }
    }
  }

  // Handle nested recommendations object
  if (recommendations.recommendations && typeof recommendations.recommendations === 'object') {
    const nested = extractRecommendations(recommendations.recommendations as Record<string, unknown>);
    result.push(...nested);
  }

  // Handle items array
  if (Array.isArray(recommendations.items)) {
    for (const item of recommendations.items) {
      result.push(normalizeRecommendation(item, idCounter++));
    }
  }

  return result;
}

function normalizeRecommendation(
  item: unknown,
  index: number,
  defaultCategory = 'General'
): Recommendation {
  const rec = item as Record<string, unknown>;

  return {
    id: (rec.id as string) || `rec-${index}`,
    title: (rec.title as string) || (rec.name as string) || `Recommendation ${index + 1}`,
    description: (rec.description as string) || (rec.details as string) || '',
    priority: normalizePriority(rec.priority as string),
    category: (rec.category as string) || defaultCategory,
    effort: normalizeLevel(rec.effort as string),
    impact: normalizeLevel(rec.impact as string),
    timeframe: rec.timeframe as string | undefined,
    dependencies: rec.dependencies as string[] | undefined,
    resources: rec.resources as string[] | undefined,
  };
}

function normalizePriority(priority: string | undefined): 'critical' | 'high' | 'medium' | 'low' {
  const p = priority?.toLowerCase();
  if (p === 'critical' || p === 'urgent') return 'critical';
  if (p === 'high') return 'high';
  if (p === 'medium' || p === 'moderate') return 'medium';
  return 'low';
}

function normalizeLevel(level: string | undefined): 'low' | 'medium' | 'high' {
  const l = level?.toLowerCase();
  if (l === 'high' || l === 'significant') return 'high';
  if (l === 'medium' || l === 'moderate') return 'medium';
  return 'low';
}

function formatCategoryName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export default RecommendationsList;
