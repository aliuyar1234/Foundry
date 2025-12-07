/**
 * Duplicate Review Page
 * Review and resolve duplicate entity record groups
 */

import React, { useState } from 'react';
import {
  useDuplicates,
  useDuplicateGroup,
  useUpdateDuplicateStatus,
  useMergeRecords,
  EntityType,
  DuplicateStatus,
  DuplicateQueryOptions,
} from '../../hooks/usePreparation';
import { RecordComparison } from '../../components/preparation/RecordComparison';
import { MergeDialog } from '../../components/preparation/MergeDialog';

interface DuplicateReviewPageProps {
  organizationId: string;
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  address: 'Address',
  product: 'Product',
  contact: 'Contact',
};

const STATUS_LABELS: Record<DuplicateStatus, string> = {
  pending: 'Pending Review',
  confirmed: 'Confirmed',
  rejected: 'Not Duplicates',
  merged: 'Merged',
};

const STATUS_COLORS: Record<DuplicateStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-gray-100 text-gray-600',
  merged: 'bg-blue-100 text-blue-800',
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percentage = confidence * 100;
  const color =
    percentage >= 90
      ? 'bg-green-100 text-green-800'
      : percentage >= 70
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-orange-100 text-orange-800';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {percentage.toFixed(0)}% match
    </span>
  );
}

export function DuplicateReviewPage({ organizationId }: DuplicateReviewPageProps) {
  const [filters, setFilters] = useState<DuplicateQueryOptions>({
    status: 'pending',
    limit: 20,
    offset: 0,
  });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  const { data: duplicatesData, isLoading, error, refetch } = useDuplicates(organizationId, filters);
  const { data: selectedGroup } = useDuplicateGroup(
    organizationId,
    selectedGroupId || ''
  );
  const updateStatus = useUpdateDuplicateStatus(organizationId);
  const mergeRecords = useMergeRecords(organizationId);

  const groups = duplicatesData?.data || [];
  const pagination = duplicatesData?.pagination;

  const handleStatusChange = async (groupId: string, status: 'confirmed' | 'rejected') => {
    await updateStatus.mutateAsync({ groupId, status });
    refetch();
  };

  const handleMerge = async (
    recordIds: string[],
    targetRecordId: string,
    fieldStrategies: Record<string, string>
  ) => {
    if (!selectedGroupId) return;

    await mergeRecords.mutateAsync({
      groupId: selectedGroupId,
      recordIds,
      targetRecordId,
      fieldStrategies,
    });

    setShowMergeDialog(false);
    setSelectedGroupId(null);
    refetch();
  };

  const handleFilterChange = (key: keyof DuplicateQueryOptions, value: unknown) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      offset: 0,
    }));
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading duplicate groups</h3>
          <p className="text-red-600 text-sm mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Duplicate Review</h1>
          <p className="text-gray-600 mt-1">
            Review potential duplicates and merge records to create golden records
          </p>
        </div>
        <a
          href={`/preparation/records?org=${organizationId}`}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Back to Records
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 flex flex-wrap gap-4 items-center">
        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={filters.status || 'pending'}
            onChange={(e) => handleFilterChange('status', e.target.value as DuplicateStatus)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {(Object.keys(STATUS_LABELS) as DuplicateStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {/* Entity Type Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
          <select
            value={filters.entityType || ''}
            onChange={(e) =>
              handleFilterChange('entityType', e.target.value as EntityType || undefined)
            }
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((type) => (
              <option key={type} value={type}>
                {ENTITY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {/* Confidence Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Confidence</label>
          <select
            value={filters.minConfidence || ''}
            onChange={(e) =>
              handleFilterChange('minConfidence', e.target.value ? parseFloat(e.target.value) : undefined)
            }
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Any</option>
            <option value="0.9">90%+</option>
            <option value="0.8">80%+</option>
            <option value="0.7">70%+</option>
            <option value="0.6">60%+</option>
          </select>
        </div>

        {/* Results Count */}
        {pagination && (
          <div className="ml-auto text-sm text-gray-500">
            {pagination.total} duplicate group{pagination.total !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Duplicate Groups List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Duplicate Groups</h2>

          {isLoading ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              Loading duplicate groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              No duplicate groups found
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`w-full text-left bg-white rounded-lg border p-4 hover:border-blue-300 transition-colors ${
                    selectedGroupId === group.id ? 'border-blue-500 ring-2 ring-blue-200' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {ENTITY_TYPE_LABELS[group.entityType]}
                    </span>
                    <ConfidenceBadge confidence={group.confidence} />
                  </div>

                  <div className="text-sm text-gray-900 font-medium mb-1">
                    {group.records.length} potential duplicates
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    Matching: {group.matchingFields.slice(0, 3).join(', ')}
                    {group.matchingFields.length > 3 && ` +${group.matchingFields.length - 3} more`}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[group.status]}`}>
                      {STATUS_LABELS[group.status]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(group.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.total > (filters.limit || 20) && (
            <div className="flex justify-between items-center pt-4">
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    offset: Math.max(0, (prev.offset || 0) - (prev.limit || 20)),
                  }))
                }
                disabled={(filters.offset || 0) === 0}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1}
              </span>
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    offset: (prev.offset || 0) + (prev.limit || 20),
                  }))
                }
                disabled={!pagination.hasMore}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Selected Group Details */}
        <div className="lg:col-span-2">
          {selectedGroup ? (
            <div className="bg-white rounded-lg border">
              {/* Group Header */}
              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-medium text-gray-900">
                    {ENTITY_TYPE_LABELS[selectedGroup.entityType]} Duplicate Group
                  </h2>
                  <ConfidenceBadge confidence={selectedGroup.confidence} />
                </div>
                <p className="text-sm text-gray-500">
                  {selectedGroup.records.length} records match on:{' '}
                  {selectedGroup.matchingFields.join(', ')}
                </p>
              </div>

              {/* Record Comparison */}
              <div className="p-4">
                <RecordComparison
                  records={selectedGroup.records}
                  matchingFields={selectedGroup.matchingFields}
                  suggestedGoldenRecordId={selectedGroup.suggestedGoldenRecordId}
                />
              </div>

              {/* Actions */}
              {selectedGroup.status === 'pending' && (
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => handleStatusChange(selectedGroup.id, 'rejected')}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                    disabled={updateStatus.isPending}
                  >
                    Not Duplicates
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedGroup.id, 'confirmed')}
                    className="px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50"
                    disabled={updateStatus.isPending}
                  >
                    Confirm Duplicates
                  </button>
                  <button
                    onClick={() => setShowMergeDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    disabled={updateStatus.isPending}
                  >
                    Merge Records
                  </button>
                </div>
              )}

              {selectedGroup.status === 'confirmed' && (
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => setShowMergeDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Merge Records
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-12 text-center">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-500">Select a duplicate group to review</p>
            </div>
          )}
        </div>
      </div>

      {/* Merge Dialog */}
      {showMergeDialog && selectedGroup && (
        <MergeDialog
          organizationId={organizationId}
          records={selectedGroup.records}
          suggestedGoldenRecordId={selectedGroup.suggestedGoldenRecordId}
          onMerge={handleMerge}
          onClose={() => setShowMergeDialog(false)}
          isLoading={mergeRecords.isPending}
        />
      )}
    </div>
  );
}

export default DuplicateReviewPage;
