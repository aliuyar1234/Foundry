/**
 * Assessment Results Page
 * Displays detailed assessment results with visualizations
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useAssessment,
  useExportAssessment,
  type AssessmentType,
} from '../../hooks/useAssessments';
import { AssessmentRadar } from '../../components/visualizations/AssessmentRadar';
import { RecommendationsList } from '../../components/assessments/RecommendationsList';

// Type configuration
const TYPE_CONFIG: Record<AssessmentType, { label: string; icon: string }> = {
  erp: { label: 'ERP Readiness', icon: '🏢' },
  ai: { label: 'AI Readiness', icon: '🤖' },
  data_quality: { label: 'Data Quality', icon: '📊' },
  process_maturity: { label: 'Process Maturity', icon: '⚙️' },
  comprehensive: { label: 'Comprehensive', icon: '📋' },
};

interface AssessmentResultsPageProps {
  organizationId: string;
}

export function AssessmentResultsPage({ organizationId }: AssessmentResultsPageProps) {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'recommendations'>('overview');

  // Data query
  const { data: assessment, isLoading, error } = useAssessment(organizationId, assessmentId || '');
  const exportAssessment = useExportAssessment(organizationId);

  // Handlers
  const handleBack = () => {
    navigate('/assessments');
  };

  const handleExport = async (format: 'pdf' | 'docx' | 'json') => {
    if (!assessmentId) return;

    try {
      const result = await exportAssessment.mutateAsync({
        assessmentId,
        format,
        includeRecommendations: true,
        includeDetails: true,
      });

      if (format === 'json') {
        // Download JSON
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${assessment?.name || 'assessment'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Download binary file
        const blob = result as unknown as Blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${assessment?.name || 'assessment'}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Handle error - could show toast
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Error state
  if (error || !assessment) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error loading assessment</h3>
        <p className="text-red-600 text-sm mt-1">{error?.message || 'Assessment not found'}</p>
        <button onClick={handleBack} className="mt-4 text-blue-600 hover:text-blue-700">
          Back to Assessments
        </button>
      </div>
    );
  }

  const typeConfig = TYPE_CONFIG[assessment.type];
  const results = assessment.results as Record<string, unknown>;
  const recommendations = assessment.recommendations as Record<string, unknown>;

  // Extract scores for radar chart
  const categoryScores = (results?.categoryScores || {}) as Record<
    string,
    { score?: number; percentage?: number }
  >;
  const radarData = Object.entries(categoryScores).map(([key, value]) => ({
    category: formatCategoryName(key),
    score: value.percentage ?? value.score ?? 0,
  }));

  // Get grade color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreGrade = (score: number | null) => {
    if (score === null) return '-';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  };

  const getReadinessLabel = (score: number | null) => {
    if (score === null) return 'Unknown';
    if (score >= 85) return 'Highly Ready';
    if (score >= 70) return 'Ready';
    if (score >= 55) return 'Partially Ready';
    if (score >= 40) return 'Needs Improvement';
    return 'Not Ready';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <button
              onClick={handleBack}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center text-3xl">
              {typeConfig.icon}
            </div>

            <div>
              <h1 className="text-2xl font-bold text-gray-900">{assessment.name}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span>{typeConfig.label}</span>
                <span>|</span>
                <span>Completed {new Date(assessment.completedAt || '').toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Score */}
          <div className="text-center">
            <div className={`text-5xl font-bold ${getScoreColor(assessment.overallScore)}`}>
              {assessment.overallScore ?? '-'}
            </div>
            <div className="text-lg font-medium text-gray-600 mt-1">
              Grade {getScoreGrade(assessment.overallScore)}
            </div>
            <div className={`text-sm ${getScoreColor(assessment.overallScore)}`}>
              {getReadinessLabel(assessment.overallScore)}
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-200">
          <span className="text-sm text-gray-600">Export:</span>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exportAssessment.isPending}
            className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          >
            PDF
          </button>
          <button
            onClick={() => handleExport('docx')}
            disabled={exportAssessment.isPending}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            Word
          </button>
          <button
            onClick={() => handleExport('json')}
            disabled={exportAssessment.isPending}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            JSON
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {(['overview', 'details', 'recommendations'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Radar Chart */}
          {radarData.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Scores</h3>
              <AssessmentRadar data={radarData} />
            </div>
          )}

          {/* Key Findings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Findings</h3>

            {/* Strengths */}
            {(results?.strengths as string[])?.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Strengths
                </h4>
                <ul className="space-y-1">
                  {(results.strengths as string[]).slice(0, 5).map((s, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-green-500 mt-1">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Weaknesses / Gaps */}
            {((results?.weaknesses as string[])?.length > 0 ||
              (results?.gaps as string[])?.length > 0 ||
              (results?.criticalGaps as string[])?.length > 0) && (
              <div>
                <h4 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Areas for Improvement
                </h4>
                <ul className="space-y-1">
                  {[
                    ...((results?.weaknesses as string[]) || []),
                    ...((results?.gaps as string[]) || []),
                    ...((results?.criticalGaps as string[]) || []),
                  ]
                    .slice(0, 5)
                    .map((w, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-red-500 mt-1">-</span>
                        {w}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          {/* Risk Factors */}
          {(results?.riskFactors as Array<{ description: string; severity: string }>)?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Factors</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {(results.riskFactors as Array<{ description: string; severity: string; mitigationStrategy: string }>)
                  .slice(0, 4)
                  .map((risk, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border ${
                        risk.severity === 'critical'
                          ? 'bg-red-50 border-red-200'
                          : risk.severity === 'high'
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            risk.severity === 'critical'
                              ? 'bg-red-200 text-red-700'
                              : risk.severity === 'high'
                              ? 'bg-orange-200 text-orange-700'
                              : 'bg-yellow-200 text-yellow-700'
                          }`}
                        >
                          {risk.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{risk.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{risk.mitigationStrategy}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'details' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Breakdown</h3>

          {/* Category Details */}
          <div className="space-y-6">
            {Object.entries(categoryScores).map(([category, data]) => {
              const details = (data as { details?: Array<{ criterion: string; score: number; maxScore: number; status: string; recommendation?: string }> }).details;
              return (
                <div key={category} className="border-b border-gray-200 pb-6 last:border-0">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">{formatCategoryName(category)}</h4>
                    <span className={`text-lg font-bold ${getScoreColor((data as { percentage?: number }).percentage ?? (data as { score?: number }).score ?? 0)}`}>
                      {Math.round((data as { percentage?: number }).percentage ?? (data as { score?: number }).score ?? 0)}%
                    </span>
                  </div>

                  {details && details.length > 0 && (
                    <div className="space-y-2">
                      {details.map((detail, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">{detail.criterion}</span>
                              <span className="text-gray-900">
                                {detail.score}/{detail.maxScore}
                              </span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  detail.status === 'excellent' || detail.status === 'leading'
                                    ? 'bg-green-500'
                                    : detail.status === 'good' || detail.status === 'maturing'
                                    ? 'bg-blue-500'
                                    : detail.status === 'fair' || detail.status === 'developing'
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${(detail.score / detail.maxScore) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'recommendations' && (
        <RecommendationsList recommendations={recommendations} />
      )}
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

export default AssessmentResultsPage;
