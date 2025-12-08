/**
 * Entities Page
 * SCALE Tier - Task T042
 *
 * Admin page for managing entities
 */

import React, { useState } from 'react';
import { useEntities } from '../../hooks/useEntities';
import { EntityCard, EntityCardSkeleton } from '../../components/entity/EntityCard';
import { CreateEntityDialog } from '../../components/entity/CreateEntityDialog';
import { Entity, TenantStatus } from '@foundry/shared/types/entity';

type StatusFilter = 'all' | TenantStatus;

export function EntitiesPage() {
  const {
    entities,
    isLoading,
    error,
    total,
    page,
    pageSize,
    loadEntities,
    createEntity,
    archiveEntity,
  } = useEntities();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  // Handle search
  const handleSearch = (term: string) => {
    setSearchTerm(term);
    loadEntities({
      search: term,
      status: statusFilter === 'all' ? undefined : statusFilter,
    });
  };

  // Handle status filter
  const handleStatusFilter = (status: StatusFilter) => {
    setStatusFilter(status);
    loadEntities({
      search: searchTerm,
      status: status === 'all' ? undefined : status,
    });
  };

  // Handle create
  const handleCreate = async (input: Parameters<typeof createEntity>[0]) => {
    await createEntity(input);
    setShowCreateDialog(false);
  };

  // Handle archive
  const handleArchive = async (entity: Entity) => {
    if (window.confirm(`Are you sure you want to archive "${entity.name}"?`)) {
      await archiveEntity(entity.id);
    }
  };

  // Pagination
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Entities</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your organization's entities and subsidiaries
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Entity
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search entities..."
                value={searchTerm}
                onChange={e => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex space-x-2">
            {(['all', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'] as StatusFilter[]).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusFilter(status)}
                className={`
                  px-3 py-2 rounded-md text-sm font-medium transition-colors
                  ${statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                {status === 'all' ? 'All' : status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <EntityCardSkeleton key={i} />
            ))}
          </div>
        ) : entities.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No entities</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new entity.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowCreateDialog(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create Entity
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entities.map(entity => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  onClick={setSelectedEntity}
                  onArchive={handleArchive}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <nav className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => loadEntities({ page: page - 1 })}
                    disabled={page === 1}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-2 text-sm text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadEntities({ page: page + 1 })}
                    disabled={page === totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateEntityDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

export default EntitiesPage;
