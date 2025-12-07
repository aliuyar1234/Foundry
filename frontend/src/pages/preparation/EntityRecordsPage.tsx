/**
 * Entity Records List Page
 * Browse and manage entity records with filtering and quality scores
 */

import React, { useState, useMemo } from 'react';
import {
  useEntityRecords,
  useEntityStats,
  useDeleteEntityRecord,
  EntityType,
  EntityStatus,
  EntityRecordQueryOptions,
} from '../../hooks/usePreparation';

interface EntityRecordsPageProps {
  organizationId: string;
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  address: 'Address',
  product: 'Product',
  contact: 'Contact',
};

const STATUS_LABELS: Record<EntityStatus, string> = {
  active: 'Active',
  pending_review: 'Pending Review',
  duplicate: 'Duplicate',
  merged: 'Merged',
  deleted: 'Deleted',
  golden: 'Golden Record',
};

const STATUS_COLORS: Record<EntityStatus, string> = {
  active: 'bg-green-100 text-green-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  duplicate: 'bg-orange-100 text-orange-800',
  merged: 'bg-blue-100 text-blue-800',
  deleted: 'bg-gray-100 text-gray-500',
  golden: 'bg-purple-100 text-purple-800',
};

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-green-100 text-green-800'
      : score >= 60
        ? 'bg-yellow-100 text-yellow-800'
        : score >= 40
          ? 'bg-orange-100 text-orange-800'
          : 'bg-red-100 text-red-800';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score.toFixed(0)}%
    </span>
  );
}

export function EntityRecordsPage({ organizationId }: EntityRecordsPageProps) {
  const [filters, setFilters] = useState<EntityRecordQueryOptions>({
    limit: 25,
    offset: 0,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<EntityStatus[]>(['active', 'pending_review', 'golden']);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  const queryOptions = useMemo(() => ({
    ...filters,
    entityTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    search: searchTerm || undefined,
  }), [filters, selectedTypes, selectedStatuses, searchTerm]);

  const { data: recordsData, isLoading, error, refetch } = useEntityRecords(organizationId, queryOptions);
  const { data: stats } = useEntityStats(organizationId);
  const deleteRecord = useDeleteEntityRecord(organizationId);

  const records = recordsData?.data || [];
  const pagination = recordsData?.pagination;

  const handleTypeToggle = (type: EntityType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setFilters((prev) => ({ ...prev, offset: 0 }));
  };

  const handleStatusToggle = (status: EntityStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setFilters((prev) => ({ ...prev, offset: 0 }));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, offset: 0 }));
  };

  const handlePageChange = (newOffset: number) => {
    setFilters((prev) => ({ ...prev, offset: newOffset }));
  };

  const handleSort = (field: 'createdAt' | 'updatedAt' | 'qualityScore') => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleSelectRecord = (recordId: string) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedRecords.size === records.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(records.map((r) => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Delete ${selectedRecords.size} selected records?`)) return;

    for (const recordId of selectedRecords) {
      await deleteRecord.mutateAsync(recordId);
    }
    setSelectedRecords(new Set());
    refetch();
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading entity records</h3>
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
          <h1 className="text-2xl font-bold text-gray-900">Entity Records</h1>
          <p className="text-gray-600 mt-1">
            Manage and review entity records from connected data sources
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedRecords.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete {selectedRecords.size} Selected
            </button>
          )}
          <a
            href={`/preparation/duplicates?org=${organizationId}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Review Duplicates
          </a>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">Total Records</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">Avg Quality</p>
            <p className="text-2xl font-bold text-gray-900">{stats.avgQualityScore.toFixed(1)}%</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">Pending Review</p>
            <p className="text-2xl font-bold text-yellow-600">
              {stats.byStatus?.pending_review || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">Duplicate Groups</p>
            <p className="text-2xl font-bold text-orange-600">{stats.duplicateGroups}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500">Golden Records</p>
            <p className="text-2xl font-bold text-purple-600">{stats.byStatus?.golden || 0}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search records..."
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Search
          </button>
        </form>

        {/* Entity Type Filters */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Entity Types</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeToggle(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedTypes.includes(type)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {ENTITY_TYPE_LABELS[type]}
                {stats?.byType?.[type] && (
                  <span className="ml-1.5 opacity-75">({stats.byType[type]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filters */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABELS) as EntityStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => handleStatusToggle(status)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedStatuses.includes(status)
                    ? STATUS_COLORS[status]
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedRecords.size === records.length && records.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                External ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Name / Identifier
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('qualityScore')}
              >
                Quality {filters.sortBy === 'qualityScore' && (filters.sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('updatedAt')}
              >
                Updated {filters.sortBy === 'updatedAt' && (filters.sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Loading records...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No records found matching your criteria
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const displayName =
                  (record.data.name as string) ||
                  (record.data.companyName as string) ||
                  (record.data.productName as string) ||
                  `${record.data.firstName || ''} ${record.data.lastName || ''}`.trim() ||
                  record.externalId;

                return (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(record.id)}
                        onChange={() => handleSelectRecord(record.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {ENTITY_TYPE_LABELS[record.entityType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                      {record.externalId.substring(0, 12)}...
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{displayName}</div>
                      {record.data.email && (
                        <div className="text-xs text-gray-500">{record.data.email as string}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[record.status]}`}>
                        {STATUS_LABELS[record.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <QualityBadge score={record.qualityScore} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(record.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/preparation/records/${record.id}?org=${organizationId}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t">
            <div className="text-sm text-gray-500">
              Showing {pagination.offset + 1} to{' '}
              {Math.min(pagination.offset + records.length, pagination.total)} of{' '}
              {pagination.total} records
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(Math.max(0, pagination.offset - (filters.limit || 25)))}
                disabled={pagination.offset === 0}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(pagination.offset + (filters.limit || 25))}
                disabled={!pagination.hasMore}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EntityRecordsPage;
