/**
 * SOP Generator Component (T087)
 * Generate SOPs from processes
 */

import React, { useState } from 'react';
import { sopApi } from '../../services/intelligence.api';

interface SopGeneratorProps {
  processId: string;
  processName: string;
  onGenerated?: (sop: any) => void;
}

export const SopGenerator: React.FC<SopGeneratorProps> = ({
  processId,
  processName,
  onGenerated,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState({
    detailLevel: 'standard' as 'summary' | 'standard' | 'detailed',
    includeDecisions: true,
    includeQualityChecks: true,
    focusAreas: [] as string[],
    customInstructions: '',
  });

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await sopApi.generate({
        processId,
        options: {
          detailLevel: options.detailLevel,
          includeDecisions: options.includeDecisions,
          focusAreas: options.focusAreas.length > 0 ? options.focusAreas : undefined,
        },
      });

      onGenerated?.(response.data.data);
    } catch (err) {
      setError('Failed to generate SOP');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Generate SOP for: {processName}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Detail Level
          </label>
          <select
            value={options.detailLevel}
            onChange={(e) =>
              setOptions({
                ...options,
                detailLevel: e.target.value as 'summary' | 'standard' | 'detailed',
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="summary">Summary - Key steps only</option>
            <option value="standard">Standard - All essential steps</option>
            <option value="detailed">Detailed - Comprehensive with substeps</option>
          </select>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.includeDecisions}
              onChange={(e) =>
                setOptions({ ...options, includeDecisions: e.target.checked })
              }
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Include related decisions</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.includeQualityChecks}
              onChange={(e) =>
                setOptions({ ...options, includeQualityChecks: e.target.checked })
              }
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Include quality checks</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom Instructions (optional)
          </label>
          <textarea
            value={options.customInstructions}
            onChange={(e) =>
              setOptions({ ...options, customInstructions: e.target.value })
            }
            placeholder="Any specific requirements or focus areas..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating SOP...
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Generate SOP
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default SopGenerator;
