/**
 * Export Preview Component
 * Displays preview of export data with field mappings and statistics
 * T278 - Export preview implementation
 */

import React, { useState } from 'react';
import { useExportPreview, ExportTarget } from '../../hooks/usePreparation';

interface ExportPreviewProps {
  organizationId: string;
  target: ExportTarget;
  entityTypes: string[];
  onClose: () => void;
  onProceed: () => void;
}

interface FieldPreview {
  sourceField: string;
  targetField: string;
  sampleValues: any[];
  uniqueValues: number;
  nullCount: number;
  dataType: string;
  minLength?: number;
  maxLength?: number;
}

interface EntityPreview {
  entityType: string;
  recordCount: number;
  sampleRecords: Record<string, any>[];
  fields: FieldPreview[];
  validation?: {
    valid: boolean;
    errors: { field: string; message: string }[];
    warnings: { field: string; message: string }[];
  };
}

export function ExportPreview({
  organizationId,
  target,
  entityTypes,
  onClose,
  onProceed,
}: ExportPreviewProps) {
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [showSampleData, setShowSampleData] = useState(false);

  const { data: preview, isLoading, error } = useExportPreview(
    organizationId,
    target,
    entityTypes
  );

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeIcon = (dataType: string) => {
    switch (dataType) {
      case 'string':
        return <span className="text-green-600">Aa</span>;
      case 'integer':
      case 'decimal':
        return <span className="text-blue-600">#</span>;
      case 'boolean':
        return <span className="text-purple-600">✓</span>;
      case 'datetime':
        return <span className="text-orange-600">📅</span>;
      case 'email':
        return <span className="text-cyan-600">@</span>;
      case 'url':
        return <span className="text-indigo-600">🔗</span>;
      case 'phone':
        return <span className="text-pink-600">📞</span>;
      default:
        return <span className="text-gray-600">?</span>;
    }
  };

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 90) return 'bg-green-500';
    if (coverage >= 70) return 'bg-yellow-500';
    if (coverage >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Generating preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <div className="text-red-600 text-center mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">Preview Failed</h3>
          <p className="text-gray-500 text-center mb-4">{(error as Error).message}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Export Preview</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Preview data before exporting to {target.toUpperCase().replace('_', ' ')}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="px-6 py-4 bg-gray-50 border-b">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-500">Total Records</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {preview?.totalRecords?.toLocaleString() || 0}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-500">Estimated Size</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {formatBytes(preview?.statistics?.estimatedFileSize || 0)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-500">Data Quality</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {preview?.statistics?.dataQuality?.completeness?.toFixed(0) || 0}%
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-500">Validation</div>
                <div className={`text-2xl font-semibold ${preview?.validation?.valid ? 'text-green-600' : 'text-red-600'}`}>
                  {preview?.validation?.valid ? 'PASS' : 'FAIL'}
                </div>
              </div>
            </div>
          </div>

          {/* Data Quality Indicators */}
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Data Quality Metrics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Completeness</span>
                  <span className="font-medium">{preview?.statistics?.dataQuality?.completeness?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getCoverageColor(preview?.statistics?.dataQuality?.completeness || 0)}`}
                    style={{ width: `${preview?.statistics?.dataQuality?.completeness || 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Uniqueness</span>
                  <span className="font-medium">{preview?.statistics?.dataQuality?.uniqueness?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getCoverageColor(preview?.statistics?.dataQuality?.uniqueness || 0)}`}
                    style={{ width: `${preview?.statistics?.dataQuality?.uniqueness || 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Validity</span>
                  <span className="font-medium">{preview?.statistics?.dataQuality?.validity?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getCoverageColor(preview?.statistics?.dataQuality?.validity || 0)}`}
                    style={{ width: `${preview?.statistics?.dataQuality?.validity || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Entity Previews */}
          <div className="px-6 py-4 overflow-y-auto max-h-[40vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">Field Mappings by Entity</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showSampleData}
                  onChange={(e) => setShowSampleData(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span className="text-gray-600">Show sample data</span>
              </label>
            </div>

            <div className="space-y-4">
              {preview?.entities?.map((entity: EntityPreview) => (
                <div key={entity.entityType} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedEntity(
                      expandedEntity === entity.entityType ? null : entity.entityType
                    )}
                    className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900 capitalize">
                        {entity.entityType}
                      </span>
                      <span className="text-sm text-gray-500">
                        {entity.recordCount.toLocaleString()} records
                      </span>
                      {entity.validation && (
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          entity.validation.valid
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {entity.validation.valid ? 'Valid' : `${entity.validation.errors.length} errors`}
                        </span>
                      )}
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedEntity === entity.entityType ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expandedEntity === entity.entityType && (
                    <div className="p-4">
                      {/* Field Mappings Table */}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2 font-medium">Source Field</th>
                            <th className="pb-2 font-medium">→</th>
                            <th className="pb-2 font-medium">Target Field</th>
                            <th className="pb-2 font-medium">Type</th>
                            <th className="pb-2 font-medium">Coverage</th>
                            {showSampleData && <th className="pb-2 font-medium">Sample</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {entity.fields.map((field: FieldPreview) => {
                            const coverage = ((entity.recordCount - field.nullCount) / entity.recordCount) * 100;
                            return (
                              <tr key={field.sourceField} className="border-b border-gray-100">
                                <td className="py-2 font-mono text-xs">{field.sourceField}</td>
                                <td className="py-2 text-gray-400">→</td>
                                <td className="py-2 font-mono text-xs text-blue-600">{field.targetField}</td>
                                <td className="py-2">
                                  <span className="flex items-center gap-1">
                                    {getTypeIcon(field.dataType)}
                                    <span className="text-gray-600">{field.dataType}</span>
                                  </span>
                                </td>
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${getCoverageColor(coverage)}`}
                                        style={{ width: `${coverage}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-500">{coverage.toFixed(0)}%</span>
                                  </div>
                                </td>
                                {showSampleData && (
                                  <td className="py-2 text-xs text-gray-500 truncate max-w-[150px]">
                                    {field.sampleValues[0] ?? <span className="italic">null</span>}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Validation Issues */}
                      {entity.validation && !entity.validation.valid && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg">
                          <h4 className="text-sm font-medium text-red-800 mb-2">Validation Issues</h4>
                          <ul className="text-sm text-red-700 space-y-1">
                            {entity.validation.errors.slice(0, 5).map((err, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-red-500">•</span>
                                <span><strong>{err.field}:</strong> {err.message}</span>
                              </li>
                            ))}
                            {entity.validation.errors.length > 5 && (
                              <li className="text-red-500">
                                ... and {entity.validation.errors.length - 5} more errors
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      {/* Sample Records */}
                      {showSampleData && entity.sampleRecords.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Sample Output Records</h4>
                          <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                            <pre className="text-xs text-green-400">
                              {JSON.stringify(entity.sampleRecords[0], null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {preview?.validation?.valid ? (
                <span className="text-green-600">All validation checks passed</span>
              ) : (
                <span className="text-amber-600">
                  {preview?.validation?.errors?.length || 0} validation errors found
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Back
              </button>
              <button
                onClick={onProceed}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Proceed with Export
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportPreview;
