/**
 * Decision Extractor Component (T073)
 * Extract decisions from text using AI
 */

import React, { useState } from 'react';
import { decisionApi } from '../../services/intelligence.api';

interface ExtractedDecision {
  title: string;
  description: string;
  context?: string;
  rationale?: string;
  confidence: number;
  decisionMakers?: string[];
  impactAreas?: string[];
}

interface DecisionExtractorProps {
  onExtracted?: (decisions: ExtractedDecision[]) => void;
}

export const DecisionExtractor: React.FC<DecisionExtractorProps> = ({
  onExtracted,
}) => {
  const [text, setText] = useState('');
  const [sourceType, setSourceType] = useState('document');
  const [autoCreate, setAutoCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedDecision[]>([]);

  const handleExtract = async () => {
    if (!text.trim()) {
      setError('Please enter text to analyze');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await decisionApi.extract({
        text,
        sourceType,
        autoCreate,
      });

      const decisions = response.data.data.extracted;
      setExtracted(decisions);
      onExtracted?.(decisions);
    } catch (err) {
      setError('Failed to extract decisions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Extract Decisions from Text
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Type
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="document">Document</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting Notes</option>
              <option value="chat">Chat/Message</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Text to Analyze
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste meeting notes, emails, documents, or any text that may contain decisions..."
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoCreate"
              checked={autoCreate}
              onChange={(e) => setAutoCreate(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <label htmlFor="autoCreate" className="text-sm text-gray-700">
              Automatically create decision records
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={handleExtract}
            disabled={loading || !text.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Analyzing...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
                Extract Decisions
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Section */}
      {extracted.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Extracted Decisions ({extracted.length})
          </h3>

          <div className="space-y-4">
            {extracted.map((decision, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <h4 className="font-medium text-gray-900">{decision.title}</h4>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      decision.confidence >= 0.8
                        ? 'bg-green-100 text-green-800'
                        : decision.confidence >= 0.5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {Math.round(decision.confidence * 100)}% confident
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-2">
                  {decision.description}
                </p>

                {decision.context && (
                  <div className="mt-3">
                    <span className="text-xs font-medium text-gray-500">
                      Context:
                    </span>
                    <p className="text-sm text-gray-600">{decision.context}</p>
                  </div>
                )}

                {decision.rationale && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500">
                      Rationale:
                    </span>
                    <p className="text-sm text-gray-600">{decision.rationale}</p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {decision.decisionMakers?.map((maker) => (
                    <span
                      key={maker}
                      className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                    >
                      {maker}
                    </span>
                  ))}
                  {decision.impactAreas?.map((area) => (
                    <span
                      key={area}
                      className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {autoCreate && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                {extracted.length} decision record(s) have been created automatically.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DecisionExtractor;
