/**
 * SemanticSearch Component (T039)
 * Main search input with filters and options
 */

import React, { useState, useCallback } from 'react';
import { Search, Filter, Calendar, X } from 'lucide-react';
import { SourceType, SearchOptions } from '../../services/search.api';

interface SemanticSearchProps {
  onSearch: (query: string, options: SearchOptions) => void;
  isLoading?: boolean;
  placeholder?: string;
}

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'DOCUMENT', label: 'Documents' },
  { value: 'EMAIL', label: 'Emails' },
  { value: 'MESSAGE', label: 'Messages' },
  { value: 'MEETING', label: 'Meetings' },
];

export const SemanticSearch: React.FC<SemanticSearchProps> = ({
  onSearch,
  isLoading = false,
  placeholder = 'Search your organization\'s knowledge...',
}) => {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<SourceType[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState('');

  const handleSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!query.trim()) return;

      const options: SearchOptions = {};

      if (selectedTypes.length > 0) {
        options.sourceTypes = selectedTypes;
      }
      if (dateFrom) {
        options.dateFrom = dateFrom;
      }
      if (dateTo) {
        options.dateTo = dateTo;
      }
      if (category) {
        options.category = category;
      }

      onSearch(query, options);
    },
    [query, selectedTypes, dateFrom, dateTo, category, onSearch]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSearch();
    }
  };

  const toggleSourceType = (type: SourceType) => {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setDateFrom('');
    setDateTo('');
    setCategory('');
  };

  const hasActiveFilters =
    selectedTypes.length > 0 || dateFrom || dateTo || category;

  return (
    <div className="w-full">
      {/* Main Search Input */}
      <form onSubmit={handleSearch} className="relative">
        <div className="relative flex items-center">
          <Search
            className="absolute left-4 text-gray-400 pointer-events-none"
            size={20}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-12 pr-24 py-4 text-lg border border-gray-300 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder-gray-400 bg-white shadow-sm"
            disabled={isLoading}
          />
          <div className="absolute right-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                hasActiveFilters
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-100 text-gray-500'
              }`}
              title="Filters"
            >
              <Filter size={20} />
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {selectedTypes.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                </span>
              )}
            </button>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </form>

      {/* Filters Panel */}
      {showFilters && (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-700">Filter Results</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <X size={14} className="mr-1" />
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Source Types */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Source Types
              </label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleSourceType(option.value)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      selectedTypes.includes(option.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                From Date
              </label>
              <div className="relative">
                <Calendar
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                To Date
              </label>
              <div className="relative">
                <Calendar
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Finance, HR"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SemanticSearch;
