/**
 * Enrichment Options Component
 * Add enrichment options to entity record pages
 * T312 - Enrichment options for entity records
 */

import React, { useState } from 'react';

interface EnrichmentField {
  id: string;
  name: string;
  description: string;
}

interface EnrichmentSource {
  id: string;
  name: string;
  country: string;
  dataTypes: string[];
}

interface EnrichmentPreview {
  currentData: Record<string, unknown>;
  proposedData: Record<string, unknown>;
  changes: Array<{ field: string; current: unknown; proposed: unknown }>;
  matchConfidence: number;
  source: string;
}

const ENRICHMENT_FIELDS: EnrichmentField[] = [
  { id: 'registration_number', name: 'Registration Number', description: 'Company registration/trade register number' },
  { id: 'vat_id', name: 'VAT ID', description: 'Value Added Tax identification number' },
  { id: 'legal_form', name: 'Legal Form', description: 'Company legal structure (GmbH, AG, etc.)' },
  { id: 'registration_date', name: 'Registration Date', description: 'Date of company registration' },
  { id: 'status', name: 'Company Status', description: 'Active, inactive, dissolved, etc.' },
  { id: 'capital', name: 'Share Capital', description: 'Registered share capital amount' },
  { id: 'executives', name: 'Executives', description: 'Directors, managers, authorized signatories' },
  { id: 'shareholders', name: 'Shareholders', description: 'Ownership structure' },
  { id: 'industry', name: 'Industry', description: 'Business sector classification' },
  { id: 'address', name: 'Registered Address', description: 'Official company address' },
];

interface EnrichmentOptionsProps {
  entityId: string;
  entityType: 'company' | 'organization' | 'supplier' | 'customer';
  entityName: string;
  organizationId: string;
  onEnrichmentComplete?: () => void;
}

export const EnrichmentOptions: React.FC<EnrichmentOptionsProps> = ({
  entityId,
  entityType,
  entityName,
  organizationId,
  onEnrichmentComplete,
}) => {
  const [selectedFields, setSelectedFields] = useState<string[]>(['all']);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<EnrichmentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    fieldsEnriched: string[];
    errors: string[];
  } | null>(null);

  const handleFieldToggle = (fieldId: string) => {
    if (fieldId === 'all') {
      setSelectedFields(['all']);
      return;
    }

    let newFields = selectedFields.filter(f => f !== 'all');
    if (newFields.includes(fieldId)) {
      newFields = newFields.filter(f => f !== fieldId);
    } else {
      newFields.push(fieldId);
    }

    if (newFields.length === 0) {
      newFields = ['all'];
    }

    setSelectedFields(newFields);
  };

  const handlePreview = async () => {
    try {
      setLoading(true);
      // In production: call API
      // const response = await fetch(`/api/v1/organizations/${organizationId}/preparation/enrich/preview`, {
      //   method: 'POST',
      //   body: JSON.stringify({ entityId, entityType, fields: selectedFields })
      // });

      // Mock preview
      await new Promise(resolve => setTimeout(resolve, 800));

      setPreview({
        currentData: {
          name: entityName,
          vatId: null,
          registrationNumber: null,
          legalForm: null,
        },
        proposedData: {
          name: entityName,
          vatId: 'ATU12345678',
          registrationNumber: 'FN 123456 a',
          legalForm: 'GmbH',
          capital: { amount: 35000, currency: 'EUR' },
          status: 'active',
          executives: [
            { name: 'Max Mustermann', role: 'Geschäftsführer' },
          ],
        },
        changes: [
          { field: 'vatId', current: null, proposed: 'ATU12345678' },
          { field: 'registrationNumber', current: null, proposed: 'FN 123456 a' },
          { field: 'legalForm', current: null, proposed: 'GmbH' },
          { field: 'capital', current: null, proposed: { amount: 35000, currency: 'EUR' } },
          { field: 'status', current: null, proposed: 'active' },
        ],
        matchConfidence: 0.92,
        source: 'firmenbuch_at',
      });

      setShowPreview(true);
    } catch (error) {
      console.error('Failed to preview enrichment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async () => {
    try {
      setEnriching(true);
      // In production: call API
      // const response = await fetch(`/api/v1/organizations/${organizationId}/preparation/enrich`, {
      //   method: 'POST',
      //   body: JSON.stringify({ entityIds: [entityId], entityType, fields: selectedFields, overwriteExisting })
      // });

      // Mock enrichment
      await new Promise(resolve => setTimeout(resolve, 1500));

      setResult({
        success: true,
        fieldsEnriched: ['vatId', 'registrationNumber', 'legalForm', 'capital', 'status'],
        errors: [],
      });

      setShowPreview(false);
      onEnrichmentComplete?.();
    } catch (error) {
      setResult({
        success: false,
        fieldsEnriched: [],
        errors: [(error as Error).message],
      });
    } finally {
      setEnriching(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600 bg-green-100';
    if (confidence >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Enrichment</h3>
      <p className="text-gray-600 mb-6">
        Enrich this entity's data with information from external registries.
      </p>

      {/* Field Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Fields to Enrich
        </label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={selectedFields.includes('all')}
              onChange={() => handleFieldToggle('all')}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700 font-medium">All Available Fields</span>
          </label>

          {!selectedFields.includes('all') && (
            <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              {ENRICHMENT_FIELDS.map(field => (
                <label key={field.id} className="flex items-start">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.id)}
                    onChange={() => handleFieldToggle(field.id)}
                    className="h-4 w-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="ml-2">
                    <span className="text-sm text-gray-700">{field.name}</span>
                    <p className="text-xs text-gray-500">{field.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="mb-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(e) => setOverwriteExisting(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="ml-2 text-sm text-gray-700">
            Overwrite existing values (by default, only empty fields are updated)
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex space-x-3">
        <button
          onClick={handlePreview}
          disabled={loading || enriching}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Preview Changes'}
        </button>
        <button
          onClick={handleEnrich}
          disabled={loading || enriching}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {enriching ? 'Enriching...' : 'Enrich Now'}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Enrichment Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Match Info */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="text-sm text-gray-500">Source:</span>
                  <span className="ml-2 text-sm font-medium text-gray-900 capitalize">
                    {preview.source.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 mr-2">Match Confidence:</span>
                  <span className={`px-2 py-1 text-sm font-medium rounded ${getConfidenceColor(preview.matchConfidence)}`}>
                    {(preview.matchConfidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Changes */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900">Proposed Changes ({preview.changes.length})</h4>
                {preview.changes.map((change, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-900 capitalize mb-2">
                      {change.field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-gray-500">Current</span>
                        <div className="mt-1 text-sm text-gray-600 bg-red-50 px-2 py-1 rounded">
                          {change.current === null ? (
                            <span className="italic text-gray-400">empty</span>
                          ) : typeof change.current === 'object' ? (
                            JSON.stringify(change.current)
                          ) : (
                            String(change.current)
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Proposed</span>
                        <div className="mt-1 text-sm text-gray-900 bg-green-50 px-2 py-1 rounded">
                          {typeof change.proposed === 'object'
                            ? JSON.stringify(change.proposed)
                            : String(change.proposed)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnrich}
                  disabled={enriching}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {enriching ? 'Applying...' : 'Apply Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Notification */}
      {result && (
        <div className={`mt-4 p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {result.success ? (
            <>
              <div className="text-green-800 font-medium">Enrichment Successful</div>
              <div className="text-green-700 text-sm mt-1">
                Updated fields: {result.fieldsEnriched.join(', ')}
              </div>
            </>
          ) : (
            <>
              <div className="text-red-800 font-medium">Enrichment Failed</div>
              <div className="text-red-700 text-sm mt-1">
                {result.errors.join(', ')}
              </div>
            </>
          )}
          <button
            onClick={() => setResult(null)}
            className="text-sm underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

export default EnrichmentOptions;
