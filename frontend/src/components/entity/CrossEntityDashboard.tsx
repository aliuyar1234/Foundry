/**
 * Cross-Entity Dashboard Component
 * SCALE Tier - Task T046
 *
 * Dashboard for viewing analytics across multiple entities
 */

import React, { useState } from 'react';
import { useCrossEntityAnalytics } from '../../hooks/useEntities';
import { useEntity } from '../../providers/EntityProvider';
import { EntityAnalytics, CrossEntityAggregation } from '@foundry/shared/types/entity';

interface CrossEntityDashboardProps {
  selectedEntityIds?: string[];
}

export function CrossEntityDashboard({ selectedEntityIds }: CrossEntityDashboardProps) {
  const { accessibleEntities, canAccessMultipleEntities } = useEntity();
  const [selected, setSelected] = useState<string[]>(
    selectedEntityIds || accessibleEntities.slice(0, 5).map(e => e.id)
  );

  const { analytics, isLoading, error } = useCrossEntityAnalytics(selected);

  // Toggle entity selection
  const toggleEntity = (entityId: string) => {
    setSelected(prev =>
      prev.includes(entityId)
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId]
    );
  };

  if (!canAccessMultipleEntities) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <p className="text-gray-500">
          Cross-entity analytics requires access to multiple entities.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Entity Selector */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Select Entities to Compare
        </h3>
        <div className="flex flex-wrap gap-2">
          {accessibleEntities.map(entity => (
            <button
              key={entity.id}
              type="button"
              onClick={() => toggleEntity(entity.id)}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${selected.includes(entity.id)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {entity.name}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : analytics ? (
        <>
          <SummaryCards analytics={analytics} />
          <EntityComparisonTable analytics={analytics} />
        </>
      ) : null}
    </div>
  );
}

// Summary cards component
function SummaryCards({ analytics }: { analytics: CrossEntityAggregation }) {
  const cards = [
    {
      label: 'Total Entities',
      value: analytics.totalEntities,
      subtext: `${analytics.activeEntities} active`,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      label: 'Total Users',
      value: analytics.metrics.totalUsers,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      label: 'Data Sources',
      value: analytics.metrics.totalDataSources,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
    },
    {
      label: 'Avg Compliance',
      value: `${analytics.metrics.averageComplianceScore}%`,
      color: analytics.metrics.averageComplianceScore >= 80 ? 'text-green-600' : 'text-yellow-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <div key={index} className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 ${card.color || 'text-gray-900'}`}>
                {card.value}
              </p>
              {card.subtext && (
                <p className="text-xs text-gray-400 mt-1">{card.subtext}</p>
              )}
            </div>
            <div className="text-gray-400">{card.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Entity comparison table
function EntityComparisonTable({ analytics }: { analytics: CrossEntityAggregation }) {
  const [sortField, setSortField] = useState<keyof EntityAnalytics['metrics']>('complianceScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedEntities = [...analytics.byEntity].sort((a, b) => {
    const aVal = a.metrics[sortField];
    const bVal = b.metrics[sortField];
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (field: keyof EntityAnalytics['metrics']) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Entity Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity
              </th>
              {['userCount', 'dataSourceCount', 'processCount', 'complianceScore'].map(field => (
                <th
                  key={field}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort(field as keyof EntityAnalytics['metrics'])}
                >
                  <div className="flex items-center space-x-1">
                    <span>
                      {field === 'userCount' ? 'Users' :
                       field === 'dataSourceCount' ? 'Data Sources' :
                       field === 'processCount' ? 'Processes' :
                       'Compliance'}
                    </span>
                    {sortField === field && (
                      <svg className={`w-4 h-4 ${sortDir === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Growth
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedEntities.map(entity => (
              <tr key={entity.entityId} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {entity.entityName}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entity.metrics.userCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entity.metrics.dataSourceCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entity.metrics.processCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-16 h-2 bg-gray-200 rounded-full mr-2">
                      <div
                        className={`h-2 rounded-full ${
                          entity.metrics.complianceScore >= 80
                            ? 'bg-green-500'
                            : entity.metrics.complianceScore >= 60
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${entity.metrics.complianceScore}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500">
                      {entity.metrics.complianceScore}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center text-sm ${
                      entity.trends.userGrowth > 0
                        ? 'text-green-600'
                        : entity.trends.userGrowth < 0
                          ? 'text-red-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {entity.trends.userGrowth > 0 && '+'}
                    {entity.trends.userGrowth}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CrossEntityDashboard;
