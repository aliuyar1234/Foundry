/**
 * SOPs Page
 * Main page for browsing and managing SOPs
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useSOPs,
  useSOPStats,
  useDeleteSOP,
  useUpdateSOPStatus,
  type SOP,
  type SOPStatus,
  type SOPQueryOptions,
} from '../../hooks/useSOPs';
import { useProcesses } from '../../hooks/useProcesses';

// Status configuration
const STATUS_CONFIG: Record<SOPStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  review: { label: 'In Review', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  approved: { label: 'Approved', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  published: { label: 'Published', color: 'text-green-700', bgColor: 'bg-green-100' },
  archived: { label: 'Archived', color: 'text-red-700', bgColor: 'bg-red-100' },
};

// Status workflow transitions
const STATUS_TRANSITIONS: Record<SOPStatus, SOPStatus[]> = {
  draft: ['review'],
  review: ['draft', 'approved'],
  approved: ['review', 'published'],
  published: ['archived'],
  archived: ['draft'],
};

interface SOPsPageProps {
  organizationId: string;
}

export function SOPsPage({ organizationId }: SOPsPageProps) {
  const navigate = useNavigate();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<SOPStatus[]>([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'createdAt' | 'updatedAt' | 'title'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // Build query options
  const queryOptions: SOPQueryOptions = useMemo(() => ({
    search: searchQuery || undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    processIds: selectedProcessIds.length > 0 ? selectedProcessIds : undefined,
    languages: selectedLanguages.length > 0 ? selectedLanguages : undefined,
    sortBy,
    sortOrder,
    limit: pageSize,
    offset: page * pageSize,
  }), [searchQuery, selectedStatuses, selectedProcessIds, selectedLanguages, sortBy, sortOrder, page, pageSize]);

  // Data queries
  const { data: sopsData, isLoading, error } = useSOPs(organizationId, queryOptions);
  const { data: stats } = useSOPStats(organizationId);
  const { data: processesData } = useProcesses(organizationId);

  // Mutations
  const deleteSOP = useDeleteSOP(organizationId);
  const updateStatus = useUpdateSOPStatus(organizationId);

  // Handlers
  const handleCreateNew = () => {
    navigate('/sops/generate');
  };

  const handleViewSOP = (sopId: string) => {
    navigate(`/sops/${sopId}`);
  };

  const handleEditSOP = (sopId: string) => {
    navigate(`/sops/${sopId}/edit`);
  };

  const handleDeleteSOP = async (sop: SOP) => {
    if (window.confirm(`Are you sure you want to delete "${sop.title}"?`)) {
      await deleteSOP.mutateAsync(sop.id);
    }
  };

  const handleStatusChange = async (sop: SOP, newStatus: SOPStatus) => {
    await updateStatus.mutateAsync({ sopId: sop.id, status: newStatus });
  };

  const handleExport = (sopId: string) => {
    navigate(`/sops/${sopId}/export`);
  };

  const toggleStatus = (status: SOPStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setPage(0);
  };

  const toggleProcess = (processId: string) => {
    setSelectedProcessIds(prev =>
      prev.includes(processId)
        ? prev.filter(p => p !== processId)
        : [...prev, processId]
    );
    setPage(0);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedStatuses([]);
    setSelectedProcessIds([]);
    setSelectedLanguages([]);
    setPage(0);
  };

  const hasActiveFilters = searchQuery || selectedStatuses.length > 0 || selectedProcessIds.length > 0 || selectedLanguages.length > 0;

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
        <h3 className="text-red-800 font-medium">Error loading SOPs</h3>
        <p className="text-red-600 text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  const sops = sopsData?.data || [];
  const pagination = sopsData?.pagination;
  const processes = processesData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Standard Operating Procedures</h1>
          <p className="text-gray-600 mt-1">
            Manage AI-generated SOPs for your business processes
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Generate SOP
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total SOPs</div>
          </div>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div
              key={status}
              className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedStatuses.includes(status as SOPStatus)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onClick={() => toggleStatus(status as SOPStatus)}
            >
              <div className="text-2xl font-bold text-gray-900">
                {stats.byStatus[status] || 0}
              </div>
              <div className={`text-sm ${config.color}`}>{config.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search SOPs..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Process Filter */}
          <select
            value=""
            onChange={(e) => e.target.value && toggleProcess(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Filter by Process</option>
            {processes.map((process) => (
              <option key={process.id} value={process.id}>
                {process.name}
              </option>
            ))}
          </select>

          {/* Language Filter */}
          <select
            value={selectedLanguages[0] || ''}
            onChange={(e) => {
              setSelectedLanguages(e.target.value ? [e.target.value] : []);
              setPage(0);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Languages</option>
            <option value="en">English</option>
            <option value="de">German</option>
          </select>

          {/* Sort */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
              setSortBy(newSortBy);
              setSortOrder(newSortOrder);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="updatedAt-desc">Recently Updated</option>
            <option value="updatedAt-asc">Oldest Updated</option>
            <option value="createdAt-desc">Recently Created</option>
            <option value="createdAt-asc">Oldest Created</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
          </select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Active Process Filters */}
        {selectedProcessIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
            {selectedProcessIds.map((processId) => {
              const process = processes.find(p => p.id === processId);
              return (
                <span
                  key={processId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                >
                  {process?.name || processId}
                  <button
                    onClick={() => toggleProcess(processId)}
                    className="hover:text-blue-900"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* SOP List */}
      {sops.length === 0 ? (
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No SOPs found</h3>
          <p className="text-gray-600 mb-6">
            {hasActiveFilters
              ? 'Try adjusting your filters to find SOPs'
              : 'Get started by generating your first SOP from a discovered process'}
          </p>
          {!hasActiveFilters && (
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Generate First SOP
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {sops.map((sop) => (
            <SOPListItem
              key={sop.id}
              sop={sop}
              onView={() => handleViewSOP(sop.id)}
              onEdit={() => handleEditSOP(sop.id)}
              onDelete={() => handleDeleteSOP(sop)}
              onExport={() => handleExport(sop.id)}
              onStatusChange={(status) => handleStatusChange(sop, status)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, pagination.total)} of {pagination.total} SOPs
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

// SOP List Item Component
interface SOPListItemProps {
  sop: SOP;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
  onStatusChange: (status: SOPStatus) => void;
}

function SOPListItem({ sop, onView, onEdit, onDelete, onExport, onStatusChange }: SOPListItemProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const statusConfig = STATUS_CONFIG[sop.status];
  const availableTransitions = STATUS_TRANSITIONS[sop.status];

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3
              className="text-lg font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
              onClick={onView}
            >
              {sop.title}
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bgColor}`}>
              {statusConfig.label}
            </span>
            <span className="text-xs text-gray-500">v{sop.version}</span>
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            {sop.process && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                {sop.process.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {sop.language.toUpperCase()}
            </span>
            {sop.confidence !== undefined && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {Math.round(sop.confidence * 100)}% confidence
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {new Date(sop.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Change */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Change Status"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
            {showStatusMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowStatusMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                  {availableTransitions.map((status) => {
                    const config = STATUS_CONFIG[status];
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          onStatusChange(status);
                          setShowStatusMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        <span className={`inline-block w-2 h-2 rounded-full ${config.bgColor} mr-2`}></span>
                        Move to {config.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Actions Menu */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {showActions && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowActions(false)}
                />
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                  <button
                    onClick={() => {
                      onView();
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-t-lg flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  <button
                    onClick={() => {
                      onEdit();
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      onExport();
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export
                  </button>
                  <button
                    onClick={() => {
                      onDelete();
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-b-lg flex items-center gap-2 text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SOPsPage;
