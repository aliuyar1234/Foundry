/**
 * Assessments Page
 * Main page for browsing and managing assessments
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAssessments,
  useAssessmentSummary,
  useDeleteAssessment,
  type AssessmentSummary,
  type AssessmentType,
  type AssessmentQueryOptions,
} from '../../hooks/useAssessments';

// Type configuration
const TYPE_CONFIG: Record<AssessmentType, { label: string; color: string; bgColor: string; icon: string }> = {
  erp: { label: 'ERP Readiness', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: '🏢' },
  ai: { label: 'AI Readiness', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: '🤖' },
  data_quality: { label: 'Data Quality', color: 'text-green-700', bgColor: 'bg-green-100', icon: '📊' },
  process_maturity: { label: 'Process Maturity', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: '⚙️' },
  comprehensive: { label: 'Comprehensive', color: 'text-indigo-700', bgColor: 'bg-indigo-100', icon: '📋' },
};

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  processing: { label: 'Processing', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  completed: { label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100' },
  failed: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-100' },
};

interface AssessmentsPageProps {
  organizationId: string;
}

export function AssessmentsPage({ organizationId }: AssessmentsPageProps) {
  const navigate = useNavigate();

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<AssessmentType[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'createdAt' | 'completedAt' | 'overallScore'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // Build query options
  const queryOptions: AssessmentQueryOptions = useMemo(() => ({
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses as never : undefined,
    sortBy,
    sortOrder,
    limit: pageSize,
    offset: page * pageSize,
  }), [selectedTypes, selectedStatuses, sortBy, sortOrder, page, pageSize]);

  // Data queries
  const { data: assessmentsData, isLoading, error } = useAssessments(organizationId, queryOptions);
  const { data: summary } = useAssessmentSummary(organizationId);

  // Mutations
  const deleteAssessment = useDeleteAssessment(organizationId);

  // Handlers
  const handleNewAssessment = () => {
    navigate('/assessments/new');
  };

  const handleViewAssessment = (assessmentId: string) => {
    navigate(`/assessments/${assessmentId}`);
  };

  const handleDeleteAssessment = async (assessment: AssessmentSummary) => {
    if (window.confirm(`Are you sure you want to delete "${assessment.name}"?`)) {
      await deleteAssessment.mutateAsync(assessment.id);
    }
  };

  const toggleType = (type: AssessmentType) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
    setPage(0);
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setPage(0);
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setSelectedStatuses([]);
    setPage(0);
  };

  const hasActiveFilters = selectedTypes.length > 0 || selectedStatuses.length > 0;

  // Score color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error loading assessments</h3>
        <p className="text-red-600 text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  const assessments = assessmentsData?.data || [];
  const pagination = assessmentsData?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Readiness Assessments</h1>
          <p className="text-gray-600 mt-1">
            Evaluate your organization&apos;s readiness for ERP, AI, and digital transformation
          </p>
        </div>
        <button
          onClick={handleNewAssessment}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Assessment
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-sm text-gray-600">Total Assessments</div>
          </div>
          {Object.entries(TYPE_CONFIG).map(([type, config]) => {
            const count = summary.byType[type] || 0;
            const avgScore = summary.averageScores[type];
            return (
              <div
                key={type}
                className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                  selectedTypes.includes(type as AssessmentType)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => toggleType(type as AssessmentType)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{config.icon}</span>
                  {avgScore !== undefined && (
                    <span className={`text-lg font-bold ${getScoreColor(avgScore)}`}>
                      {avgScore}%
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold text-gray-900 mt-1">{count}</div>
                <div className={`text-xs ${config.color}`}>{config.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Status:</span>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedStatuses.includes(status)
                    ? 'bg-blue-600 text-white'
                    : `${config.bgColor} ${config.color}`
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
              }}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="completedAt-desc">Recently Completed</option>
              <option value="overallScore-desc">Highest Score</option>
              <option value="overallScore-asc">Lowest Score</option>
            </select>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Assessment List */}
      {assessments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No assessments found</h3>
          <p className="text-gray-600 mb-6">
            {hasActiveFilters
              ? 'Try adjusting your filters'
              : 'Get started by running your first readiness assessment'}
          </p>
          {!hasActiveFilters && (
            <button
              onClick={handleNewAssessment}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Run First Assessment
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {assessments.map((assessment) => (
            <AssessmentListItem
              key={assessment.id}
              assessment={assessment}
              onView={() => handleViewAssessment(assessment.id)}
              onDelete={() => handleDeleteAssessment(assessment)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, pagination.total)} of {pagination.total} assessments
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page + 1} of {Math.ceil(pagination.total / pageSize)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!pagination.hasMore}
              className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Assessment List Item Component
interface AssessmentListItemProps {
  assessment: AssessmentSummary;
  onView: () => void;
  onDelete: () => void;
}

function AssessmentListItem({ assessment, onView, onDelete }: AssessmentListItemProps) {
  const typeConfig = TYPE_CONFIG[assessment.type];
  const statusConfig = STATUS_CONFIG[assessment.status];

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

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Type Icon */}
          <div className={`w-12 h-12 rounded-lg ${typeConfig.bgColor} flex items-center justify-center text-2xl`}>
            {typeConfig.icon}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3
                className="font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
                onClick={onView}
              >
                {assessment.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bgColor}`}>
                {statusConfig.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
              <span className={typeConfig.color}>{typeConfig.label}</span>
              <span>
                Created {new Date(assessment.createdAt).toLocaleDateString()}
              </span>
              {assessment.completedAt && (
                <span>
                  Completed {new Date(assessment.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="text-center px-4">
          {assessment.status === 'completed' && assessment.overallScore !== null ? (
            <>
              <div className={`text-3xl font-bold ${getScoreColor(assessment.overallScore)}`}>
                {assessment.overallScore}
              </div>
              <div className={`text-sm font-medium ${getScoreColor(assessment.overallScore)}`}>
                Grade {getScoreGrade(assessment.overallScore)}
              </div>
            </>
          ) : assessment.status === 'processing' ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          ) : (
            <div className="text-gray-400 text-sm">-</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onView}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="View Details"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssessmentsPage;
