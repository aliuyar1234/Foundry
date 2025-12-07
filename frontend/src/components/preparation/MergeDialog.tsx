/**
 * Merge Dialog Component
 * Confirmation dialog for merging duplicate records with field-level control
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  EntityRecord,
  useMergePreview,
} from '../../hooks/usePreparation';

interface MergeDialogProps {
  organizationId: string;
  records: EntityRecord[];
  suggestedGoldenRecordId?: string;
  onMerge: (
    recordIds: string[],
    targetRecordId: string,
    fieldStrategies: Record<string, string>
  ) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

type MergeStrategy =
  | 'highest_quality'
  | 'most_recent'
  | 'most_complete'
  | 'majority'
  | 'concatenate'
  | 'first';

const STRATEGY_LABELS: Record<MergeStrategy, string> = {
  highest_quality: 'Highest Quality',
  most_recent: 'Most Recent',
  most_complete: 'Most Complete',
  majority: 'Majority Vote',
  concatenate: 'Concatenate',
  first: 'First Value',
};

const STRATEGY_DESCRIPTIONS: Record<MergeStrategy, string> = {
  highest_quality: 'Use value from record with highest quality score',
  most_recent: 'Use most recently updated value',
  most_complete: 'Use the longest/most complete value',
  majority: 'Use the value that appears most often',
  concatenate: 'Combine all unique values',
  first: 'Use value from the selected target record',
};

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-green-100 text-green-800'
      : score >= 60
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-orange-100 text-orange-800';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score.toFixed(0)}%
    </span>
  );
}

export function MergeDialog({
  organizationId,
  records,
  suggestedGoldenRecordId,
  onMerge,
  onClose,
  isLoading,
}: MergeDialogProps) {
  const [targetRecordId, setTargetRecordId] = useState(
    suggestedGoldenRecordId || records[0]?.id || ''
  );
  const [globalStrategy, setGlobalStrategy] = useState<MergeStrategy>('highest_quality');
  const [fieldStrategies, setFieldStrategies] = useState<Record<string, MergeStrategy>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mergePreview = useMergePreview(organizationId);

  // Collect all fields that differ between records
  const differingFields = useMemo(() => {
    const allFields = new Set<string>();
    records.forEach((record) => {
      Object.keys(record.data).forEach((key) => allFields.add(key));
      Object.keys(record.normalizedData || {}).forEach((key) => allFields.add(key));
    });

    return Array.from(allFields).filter((field) => {
      const values = records.map((r) => {
        const data = { ...r.data, ...r.normalizedData };
        return JSON.stringify(data[field]);
      });
      return new Set(values).size > 1;
    });
  }, [records]);

  // Get preview when settings change
  useEffect(() => {
    if (records.length >= 2) {
      mergePreview.mutate({
        recordIds: records.map((r) => r.id),
        targetRecordId,
        fieldStrategies: Object.fromEntries(
          Object.entries(fieldStrategies).map(([k, v]) => [k, v])
        ),
      });
    }
  }, [targetRecordId, fieldStrategies, records]);

  const handleFieldStrategyChange = (field: string, strategy: MergeStrategy) => {
    setFieldStrategies((prev) => ({
      ...prev,
      [field]: strategy,
    }));
  };

  const handleApplyGlobalStrategy = () => {
    const newStrategies: Record<string, MergeStrategy> = {};
    differingFields.forEach((field) => {
      newStrategies[field] = globalStrategy;
    });
    setFieldStrategies(newStrategies);
  };

  const handleMerge = async () => {
    await onMerge(
      records.map((r) => r.id),
      targetRecordId,
      fieldStrategies
    );
  };

  const preview = mergePreview.data;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Merge Records</h2>
              <p className="text-sm text-gray-500 mt-1">
                Combine {records.length} duplicate records into a golden record
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {/* Target Record Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Target Record (Golden Record Base)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {records.map((record, index) => {
                  const displayName =
                    (record.data.name as string) ||
                    (record.data.companyName as string) ||
                    `${record.data.firstName || ''} ${record.data.lastName || ''}`.trim() ||
                    record.externalId;

                  return (
                    <button
                      key={record.id}
                      onClick={() => setTargetRecordId(record.id)}
                      className={`text-left p-3 rounded-lg border-2 transition-colors ${
                        targetRecordId === record.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          Record {index + 1}
                        </span>
                        <QualityBadge score={record.qualityScore} />
                      </div>
                      <div className="text-sm text-gray-700 truncate">{displayName}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Updated: {new Date(record.updatedAt).toLocaleDateString()}
                      </div>
                      {suggestedGoldenRecordId === record.id && (
                        <div className="text-xs text-green-600 mt-1">Recommended</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Global Strategy */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Default Merge Strategy for Conflicting Fields
                </label>
                <button
                  onClick={handleApplyGlobalStrategy}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Apply to all fields
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(Object.keys(STRATEGY_LABELS) as MergeStrategy[]).map((strategy) => (
                  <button
                    key={strategy}
                    onClick={() => setGlobalStrategy(strategy)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      globalStrategy === strategy
                        ? 'border-blue-500 bg-blue-100 text-blue-800'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    title={STRATEGY_DESCRIPTIONS[strategy]}
                  >
                    {STRATEGY_LABELS[strategy]}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Field-Level Strategies */}
            {differingFields.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced: Configure {differingFields.length} conflicting field{differingFields.length > 1 ? 's' : ''} individually
                </button>

                {showAdvanced && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Field
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Current Values
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Strategy
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {differingFields.map((field) => {
                          const values = records.map((r) => {
                            const data = { ...r.data, ...r.normalizedData };
                            return data[field];
                          });

                          return (
                            <tr key={field}>
                              <td className="px-4 py-2 text-sm font-medium text-gray-700">
                                {field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                <div className="flex flex-wrap gap-1">
                                  {values.map((v, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100"
                                      title={`Record ${i + 1}`}
                                    >
                                      {v === null || v === undefined || v === ''
                                        ? 'empty'
                                        : String(v).substring(0, 20)}
                                      {String(v).length > 20 ? '...' : ''}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <select
                                  value={fieldStrategies[field] || globalStrategy}
                                  onChange={(e) =>
                                    handleFieldStrategyChange(field, e.target.value as MergeStrategy)
                                  }
                                  className="text-sm border rounded px-2 py-1"
                                >
                                  {(Object.keys(STRATEGY_LABELS) as MergeStrategy[]).map((strategy) => (
                                    <option key={strategy} value={strategy}>
                                      {STRATEGY_LABELS[strategy]}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Merge Preview</h3>
                <div className="flex items-center gap-4 text-sm text-blue-800">
                  <span>Estimated Quality Score: <strong>{preview.qualityScore?.toFixed(0) || '--'}%</strong></span>
                  {preview.conflicts && (
                    <span>Conflicts to Resolve: <strong>{preview.conflicts.length}</strong></span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {records.length - 1} record{records.length - 1 > 1 ? 's' : ''} will be marked as merged
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || !targetRecordId}
              >
                {isLoading ? 'Merging...' : 'Merge Records'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MergeDialog;
