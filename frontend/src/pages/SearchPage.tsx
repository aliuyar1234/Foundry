/**
 * SearchPage (T042)
 * Main search page with semantic and conversational search
 */

import React, { useState, useCallback } from 'react';
import { Search as SearchIcon, MessageSquare, Grid, List } from 'lucide-react';
import { SemanticSearch } from '../components/search/SemanticSearch';
import { SearchResults } from '../components/search/SearchResults';
import { ConversationalSearch } from '../components/search/ConversationalSearch';
import { searchApi, SearchResult, SearchOptions } from '../services/search.api';

type SearchMode = 'search' | 'chat';
type ViewMode = 'list' | 'grid';

export const SearchPage: React.FC = () => {
  const [mode, setMode] = useState<SearchMode>('search');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // Handle search
  const handleSearch = useCallback(async (query: string, options: SearchOptions) => {
    setIsLoading(true);
    setError(null);
    setLastQuery(query);

    try {
      const response = await searchApi.search(query, options);

      if (response.success && response.data) {
        setResults(response.data.results);
      } else {
        setError(response.error || 'Search failed');
        setResults([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle finding similar documents
  const handleFindSimilar = useCallback(async (sourceId: string) => {
    setIsLoading(true);
    setError(null);
    setLastQuery(`Similar to: ${sourceId}`);

    try {
      const response = await searchApi.findSimilar(sourceId, 10);

      if (response.success && response.data) {
        setResults(response.data.similarDocuments);
      } else {
        setError(response.error || 'Find similar failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Find similar failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle result click
  const handleResultClick = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    // Could open a modal or navigate to detail page
    console.log('Selected result:', result);
  }, []);

  // Handle source click from conversation
  const handleSourceClick = useCallback((result: SearchResult) => {
    // Switch to search mode and show the result
    setMode('search');
    setResults([result]);
    setLastQuery('');
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Knowledge Search</h1>
              <p className="mt-1 text-sm text-gray-500">
                Search across your organization's documents, emails, and messages
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setMode('search')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  mode === 'search'
                    ? 'bg-white shadow text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <SearchIcon size={18} />
                <span>Search</span>
              </button>
              <button
                onClick={() => setMode('chat')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  mode === 'chat'
                    ? 'bg-white shadow text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <MessageSquare size={18} />
                <span>AI Chat</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {mode === 'search' ? (
          <div className="space-y-6">
            {/* Search Input */}
            <SemanticSearch
              onSearch={handleSearch}
              isLoading={isLoading}
              placeholder="Ask a question or search for topics..."
            />

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            {/* Results Header */}
            {(results.length > 0 || lastQuery) && !error && (
              <div className="flex items-center justify-between">
                <div>
                  {lastQuery && (
                    <p className="text-sm text-gray-500">
                      {isLoading ? 'Searching for' : 'Results for'}:{' '}
                      <span className="font-medium text-gray-700">"{lastQuery}"</span>
                    </p>
                  )}
                </div>

                {/* View Toggle */}
                {results.length > 0 && (
                  <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded ${
                        viewMode === 'list'
                          ? 'bg-white shadow'
                          : 'hover:bg-gray-200'
                      }`}
                      title="List view"
                    >
                      <List size={18} />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded ${
                        viewMode === 'grid'
                          ? 'bg-white shadow'
                          : 'hover:bg-gray-200'
                      }`}
                      title="Grid view"
                    >
                      <Grid size={18} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            <SearchResults
              results={results}
              isLoading={isLoading}
              query={lastQuery}
              onResultClick={handleResultClick}
              onFindSimilar={handleFindSimilar}
            />
          </div>
        ) : (
          /* Chat Mode */
          <div className="h-[calc(100vh-16rem)]">
            <ConversationalSearch onSourceClick={handleSourceClick} />
          </div>
        )}
      </main>

      {/* Result Detail Modal (simplified) */}
      {selectedResult && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {selectedResult.metadata.title || 'Document Details'}
              </h3>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Type</label>
                <p className="text-gray-900">{selectedResult.sourceType}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Content Preview
                </label>
                <p className="text-gray-900 whitespace-pre-wrap">
                  {selectedResult.content}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Relevance Score
                </label>
                <p className="text-gray-900">
                  {Math.round(selectedResult.score * 100)}%
                </p>
              </div>

              {selectedResult.highlights.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Matching Excerpts
                  </label>
                  <ul className="mt-1 space-y-2">
                    {selectedResult.highlights.map((h, i) => (
                      <li
                        key={i}
                        className="text-gray-700 text-sm pl-3 border-l-2 border-yellow-400"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex space-x-2 pt-4">
                <button
                  onClick={() => handleFindSimilar(selectedResult.sourceId)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Find Similar
                </button>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
