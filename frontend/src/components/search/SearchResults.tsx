/**
 * SearchResults Component (T040)
 * Displays search results with highlighting
 */

import React from 'react';
import {
  FileText,
  Mail,
  MessageSquare,
  Calendar,
  User,
  Clock,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { SearchResult, SourceType } from '../../services/search.api';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading?: boolean;
  query?: string;
  onResultClick?: (result: SearchResult) => void;
  onFindSimilar?: (sourceId: string) => void;
}

const SOURCE_TYPE_ICONS: Record<SourceType, React.FC<{ size?: number; className?: string }>> = {
  DOCUMENT: FileText,
  EMAIL: Mail,
  MESSAGE: MessageSquare,
  MEETING: Calendar,
};

const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  DOCUMENT: 'bg-blue-100 text-blue-700',
  EMAIL: 'bg-green-100 text-green-700',
  MESSAGE: 'bg-purple-100 text-purple-700',
  MEETING: 'bg-orange-100 text-orange-700',
};

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  DOCUMENT: 'Document',
  EMAIL: 'Email',
  MESSAGE: 'Message',
  MEETING: 'Meeting',
};

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

/**
 * Format relevance score
 */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Render highlighted content
 */
function renderHighlightedContent(content: string): React.ReactNode {
  // Split by ** markers for highlighting
  const parts = content.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <mark key={index} className="bg-yellow-200 px-0.5 rounded">
          {part.slice(2, -2)}
        </mark>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/**
 * Loading skeleton
 */
const ResultSkeleton: React.FC = () => (
  <div className="p-4 bg-white rounded-lg border border-gray-200 animate-pulse">
    <div className="flex items-start space-x-4">
      <div className="w-10 h-10 bg-gray-200 rounded-lg" />
      <div className="flex-1">
        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-full mb-2" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
      </div>
    </div>
  </div>
);

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  isLoading = false,
  query,
  onResultClick,
  onFindSimilar,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <ResultSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
        <p className="text-gray-500">
          {query
            ? `No matches for "${query}". Try different keywords or adjust your filters.`
            : 'Enter a search query to find relevant content.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Found {results.length} result{results.length !== 1 ? 's' : ''}
      </p>

      {results.map((result, index) => {
        const Icon = SOURCE_TYPE_ICONS[result.sourceType];
        const colorClass = SOURCE_TYPE_COLORS[result.sourceType];
        const typeLabel = SOURCE_TYPE_LABELS[result.sourceType];

        return (
          <div
            key={result.id}
            className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300
                     hover:shadow-md transition-all cursor-pointer group"
            onClick={() => onResultClick?.(result)}
          >
            <div className="flex items-start space-x-4">
              {/* Icon */}
              <div className={`p-2 rounded-lg ${colorClass}`}>
                <Icon size={20} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
                      {typeLabel}
                    </span>
                    {result.metadata.title && (
                      <h4 className="font-medium text-gray-900 truncate">
                        {result.metadata.title}
                      </h4>
                    )}
                  </div>
                  <span
                    className="text-sm font-medium text-blue-600"
                    title="Relevance score"
                  >
                    {formatScore(result.score)}
                  </span>
                </div>

                {/* Content Preview */}
                <p className="text-gray-600 text-sm line-clamp-2 mb-2">
                  {result.content}
                </p>

                {/* Highlights */}
                {result.highlights.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {result.highlights.slice(0, 2).map((highlight, hIndex) => (
                      <p
                        key={hIndex}
                        className="text-sm text-gray-500 italic pl-3 border-l-2 border-yellow-300"
                      >
                        {renderHighlightedContent(highlight)}
                      </p>
                    ))}
                  </div>
                )}

                {/* Metadata */}
                <div className="flex items-center space-x-4 text-xs text-gray-400">
                  {result.metadata.authorName && (
                    <span className="flex items-center">
                      <User size={12} className="mr-1" />
                      {result.metadata.authorName}
                    </span>
                  )}
                  {result.metadata.createdAt && (
                    <span className="flex items-center">
                      <Clock size={12} className="mr-1" />
                      {formatDate(result.metadata.createdAt)}
                    </span>
                  )}
                  {result.metadata.category && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                      {result.metadata.category}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-2 flex items-center space-x-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResultClick?.(result);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    View details
                    <ChevronRight size={14} className="ml-1" />
                  </button>
                  {onFindSimilar && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFindSimilar(result.sourceId);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                    >
                      Find similar
                      <ExternalLink size={14} className="ml-1" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SearchResults;
