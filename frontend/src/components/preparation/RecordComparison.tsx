/**
 * Record Comparison Component
 * Side-by-side comparison of duplicate records with field highlighting
 */

import React, { useState, useMemo } from 'react';
import { EntityRecord } from '../../hooks/usePreparation';

interface RecordComparisonProps {
  records: EntityRecord[];
  matchingFields: string[];
  suggestedGoldenRecordId?: string;
  onSelectRecord?: (recordId: string) => void;
  selectedRecordId?: string;
}

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-green-100 text-green-800'
      : score >= 60
        ? 'bg-yellow-100 text-yellow-800'
        : score >= 40
          ? 'bg-orange-100 text-orange-800'
          : 'bg-red-100 text-red-800';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score.toFixed(0)}%
    </span>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400 italic">empty</span>;
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>;
  }

  if (typeof value === 'object') {
    return <span className="text-gray-500 text-xs font-mono">{JSON.stringify(value)}</span>;
  }

  return <span>{String(value)}</span>;
}

export function RecordComparison({
  records,
  matchingFields,
  suggestedGoldenRecordId,
  onSelectRecord,
  selectedRecordId,
}: RecordComparisonProps) {
  const [showAllFields, setShowAllFields] = useState(false);

  // Collect all unique fields from all records
  const allFields = useMemo(() => {
    const fieldSet = new Set<string>();
    records.forEach((record) => {
      Object.keys(record.data).forEach((key) => fieldSet.add(key));
      Object.keys(record.normalizedData || {}).forEach((key) => fieldSet.add(key));
    });
    // Sort fields with matching fields first
    return Array.from(fieldSet).sort((a, b) => {
      const aMatch = matchingFields.includes(a);
      const bMatch = matchingFields.includes(b);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return a.localeCompare(b);
    });
  }, [records, matchingFields]);

  // Determine which fields to show
  const displayFields = useMemo(() => {
    if (showAllFields) return allFields;

    // Show matching fields plus any fields that differ between records
    const differingFields = allFields.filter((field) => {
      const values = records.map((r) => {
        const data = { ...r.data, ...r.normalizedData };
        return JSON.stringify(data[field]);
      });
      return new Set(values).size > 1;
    });

    return Array.from(new Set([...matchingFields, ...differingFields])).slice(0, 15);
  }, [allFields, matchingFields, records, showAllFields]);

  // Check if values differ for a field
  const fieldsDiffer = (field: string): boolean => {
    const values = records.map((r) => {
      const data = { ...r.data, ...r.normalizedData };
      return JSON.stringify(data[field]);
    });
    return new Set(values).size > 1;
  };

  // Get display name for field
  const formatFieldName = (field: string): string => {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  };

  return (
    <div className="space-y-4">
      {/* Records Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${records.length}, 1fr)` }}>
        <div className="font-medium text-gray-700">Field</div>
        {records.map((record, index) => (
          <div
            key={record.id}
            className={`p-3 rounded-lg border-2 ${
              selectedRecordId === record.id
                ? 'border-blue-500 bg-blue-50'
                : suggestedGoldenRecordId === record.id
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-gray-50'
            } ${onSelectRecord ? 'cursor-pointer hover:border-blue-300' : ''}`}
            onClick={() => onSelectRecord?.(record.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Record {index + 1}</span>
              <QualityBadge score={record.qualityScore} />
            </div>
            <div className="text-xs text-gray-500 font-mono">
              {record.externalId.substring(0, 12)}...
            </div>
            {suggestedGoldenRecordId === record.id && (
              <div className="mt-2 text-xs text-green-700 font-medium">
                Suggested Golden Record
              </div>
            )}
            {selectedRecordId === record.id && (
              <div className="mt-2 text-xs text-blue-700 font-medium">
                Selected as Target
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Fields Comparison */}
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <tbody className="divide-y divide-gray-200">
            {displayFields.map((field) => {
              const isMatching = matchingFields.includes(field);
              const differs = fieldsDiffer(field);

              return (
                <tr
                  key={field}
                  className={`${isMatching ? 'bg-green-50' : differs ? 'bg-yellow-50' : ''}`}
                >
                  <td className="px-4 py-2 w-48 text-sm font-medium text-gray-700 border-r">
                    <div className="flex items-center gap-2">
                      {formatFieldName(field)}
                      {isMatching && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-200 text-green-800">
                          match
                        </span>
                      )}
                      {differs && !isMatching && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-yellow-200 text-yellow-800">
                          differs
                        </span>
                      )}
                    </div>
                  </td>
                  {records.map((record) => {
                    const data = { ...record.data, ...record.normalizedData };
                    const value = data[field];

                    return (
                      <td
                        key={record.id}
                        className={`px-4 py-2 text-sm ${
                          differs && !isMatching ? 'text-yellow-900' : 'text-gray-900'
                        }`}
                      >
                        <FieldValue value={value} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show More/Less */}
      {allFields.length > 15 && (
        <div className="text-center">
          <button
            onClick={() => setShowAllFields(!showAllFields)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showAllFields
              ? `Show fewer fields`
              : `Show all ${allFields.length} fields (+${allFields.length - displayFields.length} more)`}
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-200"></span>
          <span>Matching field</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-200"></span>
          <span>Different values</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-2 border-green-500"></span>
          <span>Suggested golden</span>
        </div>
      </div>
    </div>
  );
}

export default RecordComparison;
