/**
 * Score Comparison Component
 * Displays before/after score comparison between assessments
 */

import React from 'react';

interface AssessmentScore {
  id: string;
  name: string;
  type: string;
  overallScore: number | null;
  completedAt: string | null;
  categoryScores?: Record<string, number>;
}

interface ScoreComparisonProps {
  baseline: AssessmentScore;
  current: AssessmentScore;
  showCategories?: boolean;
}

export function ScoreComparison({
  baseline,
  current,
  showCategories = true,
}: ScoreComparisonProps) {
  const scoreDiff = (current.overallScore ?? 0) - (baseline.overallScore ?? 0);
  const isImprovement = scoreDiff > 0;
  const isDecline = scoreDiff < 0;

  // Get trend icon
  const getTrendIcon = (diff: number) => {
    if (diff > 0) {
      return (
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    }
    if (diff < 0) {
      return (
        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    );
  };

  // Get score color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get diff color
  const getDiffColor = (diff: number) => {
    if (diff > 0) return 'text-green-600 bg-green-100';
    if (diff < 0) return 'text-red-600 bg-red-100';
    return 'text-gray-600 bg-gray-100';
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate days between assessments
  const daysBetween = () => {
    if (!baseline.completedAt || !current.completedAt) return null;
    const diff = new Date(current.completedAt).getTime() - new Date(baseline.completedAt).getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  const days = daysBetween();

  // Merge category scores
  const allCategories = new Set([
    ...Object.keys(baseline.categoryScores || {}),
    ...Object.keys(current.categoryScores || {}),
  ]);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Score Comparison</h3>
        {days !== null && (
          <p className="text-sm text-gray-600 mt-1">
            {days} days between assessments
          </p>
        )}
      </div>

      {/* Overall Score Comparison */}
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 items-center">
          {/* Baseline */}
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Baseline</div>
            <div className={`text-4xl font-bold ${getScoreColor(baseline.overallScore)}`}>
              {baseline.overallScore ?? '-'}
            </div>
            <div className="text-sm text-gray-600 mt-1 truncate" title={baseline.name}>
              {baseline.name}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {formatDate(baseline.completedAt)}
            </div>
          </div>

          {/* Arrow and Difference */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
            <div
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full mt-2 ${getDiffColor(scoreDiff)}`}
            >
              {getTrendIcon(scoreDiff)}
              <span className="font-medium">
                {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {isImprovement ? 'Improved' : isDecline ? 'Declined' : 'No Change'}
            </div>
          </div>

          {/* Current */}
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current</div>
            <div className={`text-4xl font-bold ${getScoreColor(current.overallScore)}`}>
              {current.overallScore ?? '-'}
            </div>
            <div className="text-sm text-gray-600 mt-1 truncate" title={current.name}>
              {current.name}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {formatDate(current.completedAt)}
            </div>
          </div>
        </div>

        {/* Trend Summary */}
        <div className={`mt-6 p-4 rounded-lg ${
          isImprovement ? 'bg-green-50' : isDecline ? 'bg-red-50' : 'bg-gray-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isImprovement ? 'bg-green-100' : isDecline ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              {getTrendIcon(scoreDiff)}
            </div>
            <div>
              <h4 className={`font-medium ${
                isImprovement ? 'text-green-900' : isDecline ? 'text-red-900' : 'text-gray-900'
              }`}>
                {isImprovement
                  ? 'Positive Progress'
                  : isDecline
                  ? 'Areas Need Attention'
                  : 'Stable Performance'}
              </h4>
              <p className={`text-sm ${
                isImprovement ? 'text-green-700' : isDecline ? 'text-red-700' : 'text-gray-600'
              }`}>
                {isImprovement
                  ? `Score improved by ${scoreDiff.toFixed(1)} points (${((scoreDiff / (baseline.overallScore || 1)) * 100).toFixed(1)}% increase)`
                  : isDecline
                  ? `Score decreased by ${Math.abs(scoreDiff).toFixed(1)} points. Review recommendations to address gaps.`
                  : 'Score remained consistent between assessments.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {showCategories && allCategories.size > 0 && (
        <div className="border-t border-gray-200 p-4">
          <h4 className="font-medium text-gray-900 mb-4">Category Breakdown</h4>
          <div className="space-y-3">
            {Array.from(allCategories).map((category) => {
              const baselineScore = baseline.categoryScores?.[category] ?? 0;
              const currentScore = current.categoryScores?.[category] ?? 0;
              const diff = currentScore - baselineScore;

              return (
                <div key={category} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-700 truncate" title={formatCategoryName(category)}>
                    {formatCategoryName(category)}
                  </div>

                  {/* Progress bars */}
                  <div className="flex-1 space-y-1">
                    {/* Baseline bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-12 text-xs text-gray-400">Base</div>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-400 rounded-full"
                          style={{ width: `${baselineScore}%` }}
                        />
                      </div>
                      <div className="w-10 text-xs text-gray-500 text-right">
                        {Math.round(baselineScore)}%
                      </div>
                    </div>

                    {/* Current bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-12 text-xs text-gray-500">Now</div>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            currentScore >= 80
                              ? 'bg-green-500'
                              : currentScore >= 60
                              ? 'bg-blue-500'
                              : currentScore >= 40
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${currentScore}%` }}
                        />
                      </div>
                      <div className="w-10 text-xs text-gray-700 text-right font-medium">
                        {Math.round(currentScore)}%
                      </div>
                    </div>
                  </div>

                  {/* Diff indicator */}
                  <div className={`w-16 text-right text-sm font-medium ${
                    diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact comparison card for lists
interface ComparisonCardProps {
  assessments: Array<{
    id: string;
    name: string;
    overallScore: number | null;
    completedAt: string | null;
  }>;
  trend: 'improving' | 'stable' | 'declining';
  scoreChange: number;
}

export function ComparisonCard({ assessments, trend, scoreChange }: ComparisonCardProps) {
  const getTrendStyles = () => {
    switch (trend) {
      case 'improving':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          ),
        };
      case 'declining':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          ),
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
          ),
        };
    }
  };

  const styles = getTrendStyles();
  const sorted = [...assessments].sort(
    (a, b) => new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()
  );

  return (
    <div className={`p-4 rounded-lg border ${styles.bg} ${styles.border}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900">Trend Analysis</h4>
        <div className={`flex items-center gap-1 ${styles.text}`}>
          {styles.icon}
          <span className="font-medium capitalize">{trend}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {/* Score sparkline */}
        <div className="flex items-end gap-1 h-8">
          {sorted.map((a, i) => {
            const height = ((a.overallScore ?? 0) / 100) * 100;
            return (
              <div
                key={a.id}
                className={`w-6 rounded-t transition-all ${
                  i === sorted.length - 1 ? 'bg-blue-600' : 'bg-gray-300'
                }`}
                style={{ height: `${Math.max(height, 10)}%` }}
                title={`${a.name}: ${a.overallScore ?? '-'}%`}
              />
            );
          })}
        </div>

        {/* Change indicator */}
        <div className={`text-2xl font-bold ${styles.text}`}>
          {scoreChange > 0 ? '+' : ''}{scoreChange.toFixed(1)}
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {assessments.length} assessments compared
      </p>
    </div>
  );
}

function formatCategoryName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export default ScoreComparison;
