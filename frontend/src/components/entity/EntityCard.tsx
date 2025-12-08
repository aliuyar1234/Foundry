/**
 * Entity Card Component
 * SCALE Tier - Task T043
 *
 * Card display for entity in list views
 */

import React from 'react';
import { Entity, TenantStatus } from '@foundry/shared/types/entity';

interface EntityCardProps {
  entity: Entity;
  onClick?: (entity: Entity) => void;
  onEdit?: (entity: Entity) => void;
  onArchive?: (entity: Entity) => void;
  isSelected?: boolean;
  showActions?: boolean;
}

export function EntityCard({
  entity,
  onClick,
  onEdit,
  onArchive,
  isSelected = false,
  showActions = true,
}: EntityCardProps) {
  const statusConfig: Record<TenantStatus, { color: string; bg: string; label: string }> = {
    ACTIVE: { color: 'text-green-700', bg: 'bg-green-100', label: 'Active' },
    SUSPENDED: { color: 'text-yellow-700', bg: 'bg-yellow-100', label: 'Suspended' },
    ARCHIVED: { color: 'text-gray-700', bg: 'bg-gray-100', label: 'Archived' },
  };

  const status = statusConfig[entity.status as TenantStatus];

  return (
    <div
      className={`
        relative p-4 bg-white border rounded-lg shadow-sm
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300' : ''}
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
      `}
      onClick={() => onClick?.(entity)}
    >
      {/* Status Badge */}
      <div className="absolute top-3 right-3">
        <span
          className={`
            inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
            ${status.bg} ${status.color}
          `}
        >
          {status.label}
        </span>
      </div>

      {/* Entity Info */}
      <div className="pr-20">
        <h3 className="text-lg font-semibold text-gray-900 truncate">
          {entity.name}
        </h3>
        <p className="text-sm text-gray-500 mt-1">{entity.slug}</p>
      </div>

      {/* Metadata */}
      <div className="mt-4 flex items-center space-x-4 text-sm text-gray-600">
        <div className="flex items-center">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {new Date(entity.createdAt).toLocaleDateString()}
        </div>
        <div className="flex items-center">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          {entity.dataRetentionDays} days retention
        </div>
      </div>

      {/* Actions */}
      {showActions && (onEdit || onArchive) && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end space-x-2">
          {onEdit && entity.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onEdit(entity);
              }}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              Edit
            </button>
          )}
          {onArchive && entity.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onArchive(entity);
              }}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Entity Card Skeleton for loading state
 */
export function EntityCardSkeleton() {
  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="mt-4 flex space-x-4">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="h-4 bg-gray-200 rounded w-32" />
      </div>
    </div>
  );
}

export default EntityCard;
