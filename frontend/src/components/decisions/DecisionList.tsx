/**
 * Decision List Component (T071)
 * Displays list of decisions with filtering
 */

import React, { useState, useEffect } from 'react';
import { decisionApi } from '../../services/intelligence.api';

interface Decision {
  id: string;
  title: string;
  description: string;
  status: string;
  confidence: number;
  decisionDate: string | null;
  impactAreas: string[];
  decisionMakers: string[];
}

interface DecisionListProps {
  onSelect?: (decision: Decision) => void;
}

export const DecisionList: React.FC<DecisionListProps> = ({ onSelect }) => {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    searchText: '',
  });

  useEffect(() => {
    loadDecisions();
  }, [filters]);

  const loadDecisions = async () => {
    try {
      setLoading(true);
      const response = await decisionApi.query({
        status: filters.status || undefined,
        searchText: filters.searchText || undefined,
        limit: 50,
      });
      setDecisions(response.data.data.decisions);
    } catch (err) {
      setError('Failed to load decisions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'PENDING_REVIEW':
        return 'bg-yellow-100 text-yellow-800';
      case 'SUPERSEDED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search decisions..."
          value={filters.searchText}
          onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUPERSEDED">Superseded</option>
        </select>
      </div>

      {/* Decision List */}
      <div className="space-y-3">
        {decisions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No decisions found
          </div>
        ) : (
          decisions.map((decision) => (
            <div
              key={decision.id}
              onClick={() => onSelect?.(decision)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">
                    {decision.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {decision.description}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                    decision.status
                  )}`}
                >
                  {decision.status.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                <span className={getConfidenceColor(decision.confidence)}>
                  {Math.round(decision.confidence * 100)}% confidence
                </span>
                {decision.decisionDate && (
                  <span>
                    {new Date(decision.decisionDate).toLocaleDateString()}
                  </span>
                )}
                {decision.impactAreas.length > 0 && (
                  <span className="flex gap-1">
                    {decision.impactAreas.slice(0, 2).map((area) => (
                      <span
                        key={area}
                        className="px-2 py-0.5 bg-gray-100 rounded text-xs"
                      >
                        {area}
                      </span>
                    ))}
                    {decision.impactAreas.length > 2 && (
                      <span className="text-xs">
                        +{decision.impactAreas.length - 2} more
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DecisionList;
