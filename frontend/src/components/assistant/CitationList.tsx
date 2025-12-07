/**
 * Citation List Component
 * T091 - Create citation list component
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { type Citation } from '../../services/assistantApi';

interface CitationListProps {
  citations: Citation[];
  language?: 'en' | 'de';
  onCitationClick?: (citation: Citation) => void;
}

export function CitationList({
  citations,
  language = 'en',
  onCitationClick,
}: CitationListProps) {
  if (citations.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        {language === 'de' ? 'Keine Quellen verfügbar' : 'No sources available'}
      </p>
    );
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'process':
        return '⚙️';
      case 'person':
        return '👤';
      case 'document':
        return '📄';
      case 'decision':
        return '⚖️';
      case 'relationship':
        return '🔗';
      case 'metric':
        return '📊';
      default:
        return '📌';
    }
  }

  function getTypeLabel(type: string): string {
    const labels: Record<string, { en: string; de: string }> = {
      process: { en: 'Process', de: 'Prozess' },
      person: { en: 'Person', de: 'Person' },
      document: { en: 'Document', de: 'Dokument' },
      decision: { en: 'Decision', de: 'Entscheidung' },
      relationship: { en: 'Relationship', de: 'Beziehung' },
      metric: { en: 'Metric', de: 'Metrik' },
    };

    return labels[type]?.[language] || type;
  }

  function getRelevanceColor(relevance: number): string {
    if (relevance >= 0.8) return 'bg-green-100 text-green-800';
    if (relevance >= 0.6) return 'bg-blue-100 text-blue-800';
    if (relevance >= 0.4) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  }

  function getSourceLabel(source: string): string {
    const sourceLabels: Record<string, { en: string; de: string }> = {
      knowledge_graph: { en: 'Knowledge Graph', de: 'Wissensgraph' },
      expertise_profile: { en: 'Expertise Profile', de: 'Kompetenzprofil' },
      routing_decisions: { en: 'Routing History', de: 'Routing-Verlauf' },
      documents: { en: 'Documents', de: 'Dokumente' },
    };

    return sourceLabels[source]?.[language] || source;
  }

  return (
    <div className="space-y-3">
      {citations.map((citation, index) => (
        <div
          key={citation.id || index}
          onClick={() => onCitationClick?.(citation)}
          className={`p-3 rounded-lg border bg-gray-50 ${
            onCitationClick ? 'cursor-pointer hover:bg-gray-100' : ''
          }`}
        >
          {/* Header */}
          <div className="flex items-start gap-2">
            <span className="text-lg">{getTypeIcon(citation.type)}</span>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{citation.title}</h4>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {getTypeLabel(citation.type)}
                </Badge>
                <Badge
                  className={`text-xs ${getRelevanceColor(citation.relevance)}`}
                >
                  {(citation.relevance * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="text-xs text-gray-500 mt-2">
            {language === 'de' ? 'Quelle: ' : 'Source: '}
            {getSourceLabel(citation.source)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Compact citation display for inline use
 */
export function CitationBadges({
  citations,
  maxVisible = 3,
  onClick,
}: {
  citations: Citation[];
  maxVisible?: number;
  onClick?: () => void;
}) {
  if (citations.length === 0) return null;

  const visible = citations.slice(0, maxVisible);
  const remaining = citations.length - maxVisible;

  return (
    <div
      className={`flex flex-wrap gap-1 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {visible.map((citation, index) => (
        <Badge
          key={citation.id || index}
          variant="outline"
          className="text-xs"
        >
          {citation.title.slice(0, 20)}
          {citation.title.length > 20 ? '...' : ''}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remaining}
        </Badge>
      )}
    </div>
  );
}

export default CitationList;
