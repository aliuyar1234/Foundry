/**
 * Entity Switcher Component
 * SCALE Tier - Task T041
 *
 * Dropdown component for switching between entities
 */

import React, { useState, useRef, useEffect } from 'react';
import { useEntity } from '../../providers/EntityProvider';
import { Entity, TenantStatus } from '@foundry/shared/types/entity';

interface EntitySwitcherProps {
  className?: string;
  compact?: boolean;
  showStatus?: boolean;
}

export function EntitySwitcher({
  className = '',
  compact = false,
  showStatus = true,
}: EntitySwitcherProps) {
  const {
    currentEntity,
    accessibleEntities,
    switchEntity,
    isLoading,
    canAccessMultipleEntities,
  } = useEntity();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter entities by search term
  const filteredEntities = accessibleEntities.filter(
    entity =>
      entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entity.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle entity switch
  const handleSwitch = async (entity: Entity) => {
    if (entity.id === currentEntity?.id) {
      setIsOpen(false);
      return;
    }

    setSwitching(true);
    try {
      await switchEntity(entity.id);
      setIsOpen(false);
      setSearchTerm('');
    } catch (error) {
      console.error('Failed to switch entity:', error);
    } finally {
      setSwitching(false);
    }
  };

  // Status indicator colors
  const statusColors: Record<TenantStatus, string> = {
    ACTIVE: 'bg-green-500',
    SUSPENDED: 'bg-yellow-500',
    ARCHIVED: 'bg-gray-500',
  };

  // Don't show if user only has access to one entity
  if (!canAccessMultipleEntities) {
    return compact ? null : (
      <div className={`flex items-center ${className}`}>
        <span className="text-sm text-gray-600">
          {currentEntity?.name || 'No entity selected'}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || switching}
        className={`
          flex items-center justify-between w-full px-3 py-2
          bg-white border border-gray-300 rounded-md shadow-sm
          hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${compact ? 'text-sm' : 'text-base'}
        `}
      >
        <div className="flex items-center space-x-2">
          {showStatus && currentEntity && (
            <span
              className={`w-2 h-2 rounded-full ${statusColors[currentEntity.status as TenantStatus]}`}
            />
          )}
          <span className="truncate">
            {currentEntity?.name || 'Select Entity'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          {/* Search Input */}
          {accessibleEntities.length > 5 && (
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search entities..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Entity List */}
          <ul className="max-h-60 overflow-auto py-1">
            {filteredEntities.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">
                No entities found
              </li>
            ) : (
              filteredEntities.map(entity => (
                <li key={entity.id}>
                  <button
                    type="button"
                    onClick={() => handleSwitch(entity)}
                    disabled={switching}
                    className={`
                      w-full flex items-center px-3 py-2 text-left
                      hover:bg-blue-50 transition-colors
                      ${entity.id === currentEntity?.id ? 'bg-blue-100' : ''}
                      ${switching ? 'opacity-50 cursor-wait' : ''}
                    `}
                  >
                    {showStatus && (
                      <span
                        className={`w-2 h-2 rounded-full mr-2 ${statusColors[entity.status as TenantStatus]}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {entity.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {entity.slug}
                      </p>
                    </div>
                    {entity.id === currentEntity?.id && (
                      <svg
                        className="w-4 h-4 text-blue-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Compact entity indicator for headers
 */
export function EntityIndicator({ className = '' }: { className?: string }) {
  const { currentEntity } = useEntity();

  if (!currentEntity) return null;

  const statusColors: Record<TenantStatus, string> = {
    ACTIVE: 'bg-green-500',
    SUSPENDED: 'bg-yellow-500',
    ARCHIVED: 'bg-gray-500',
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span
        className={`w-2 h-2 rounded-full ${statusColors[currentEntity.status as TenantStatus]}`}
      />
      <span className="text-sm font-medium text-gray-700">
        {currentEntity.name}
      </span>
    </div>
  );
}

export default EntitySwitcher;
