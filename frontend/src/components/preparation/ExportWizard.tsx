/**
 * Export Wizard Component
 * Multi-step wizard for exporting data to ERP systems
 */

import React, { useState } from 'react';
import {
  useExportFormats,
  useExportData,
  useEntityStats,
  EntityType,
  EntityStatus,
  ExportFormat,
} from '../../hooks/usePreparation';

interface ExportWizardProps {
  organizationId: string;
  onClose: () => void;
}

type WizardStep = 'format' | 'entities' | 'options' | 'export';

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Persons',
  company: 'Companies',
  address: 'Addresses',
  product: 'Products',
  contact: 'Contacts',
};

const STATUS_LABELS: Record<EntityStatus, string> = {
  active: 'Active Records',
  pending_review: 'Pending Review',
  duplicate: 'Duplicates',
  merged: 'Merged Records',
  deleted: 'Deleted Records',
  golden: 'Golden Records',
};

const FORMAT_ICONS: Record<ExportFormat, React.ReactNode> = {
  sap_b1: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  odoo: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  dynamics_365: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
    </svg>
  ),
};

export function ExportWizard({ organizationId, onClose }: ExportWizardProps) {
  const [step, setStep] = useState<WizardStep>('format');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<EntityType[]>([
    'person',
    'company',
    'address',
    'product',
  ]);
  const [selectedStatuses, setSelectedStatuses] = useState<EntityStatus[]>([
    'active',
    'golden',
  ]);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: formats, isLoading: formatsLoading } = useExportFormats(organizationId);
  const { data: stats } = useEntityStats(organizationId);
  const exportData = useExportData(organizationId);

  const handleEntityTypeToggle = (type: EntityType) => {
    setSelectedEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleStatusToggle = (status: EntityStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleExport = async () => {
    if (!selectedFormat) return;

    setStep('export');

    await exportData.mutateAsync({
      format: selectedFormat,
      entityTypes: selectedEntityTypes,
      statuses: selectedStatuses,
      includeMetadata,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  };

  const handleDownload = () => {
    if (!exportData.data) return;

    const blob = new Blob([JSON.stringify(exportData.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${selectedFormat}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canProceedToEntities = selectedFormat !== null;
  const canProceedToOptions = selectedEntityTypes.length > 0;
  const canProceedToExport = selectedStatuses.length > 0;

  const selectedFormatInfo = formats?.find((f) => f.id === selectedFormat);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Export Data</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Export your entity records to an ERP-compatible format
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

            {/* Progress Steps */}
            <div className="flex items-center mt-6">
              {(['format', 'entities', 'options', 'export'] as WizardStep[]).map((s, index) => (
                <React.Fragment key={s}>
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                      step === s
                        ? 'bg-blue-600 text-white'
                        : index < ['format', 'entities', 'options', 'export'].indexOf(step)
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {index < ['format', 'entities', 'options', 'export'].indexOf(step) ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < 3 && (
                    <div
                      className={`flex-1 h-1 mx-2 ${
                        index < ['format', 'entities', 'options', 'export'].indexOf(step)
                          ? 'bg-green-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 overflow-y-auto max-h-[50vh]">
            {/* Step 1: Format Selection */}
            {step === 'format' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Select Export Format
                </h3>
                {formatsLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading formats...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {formats?.map((format) => (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={`p-4 rounded-lg border-2 text-left transition-colors ${
                          selectedFormat === format.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-gray-400">
                            {FORMAT_ICONS[format.id]}
                          </div>
                          <span className="font-medium text-gray-900">{format.name}</span>
                        </div>
                        <p className="text-sm text-gray-500">{format.description}</p>
                        <div className="mt-2 text-xs text-gray-400">
                          Format: {format.fileFormat.toUpperCase()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Entity Types */}
            {step === 'entities' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Select Entity Types to Export
                </h3>
                <div className="space-y-3">
                  {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((type) => {
                    const count = stats?.byType?.[type] || 0;
                    const supported = selectedFormatInfo?.supportedEntityTypes.includes(type);

                    return (
                      <label
                        key={type}
                        className={`flex items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedEntityTypes.includes(type)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300'
                        } ${!supported ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEntityTypes.includes(type)}
                          onChange={() => handleEntityTypeToggle(type)}
                          disabled={!supported}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="ml-3 flex-1">
                          <span className="font-medium text-gray-900">{ENTITY_TYPE_LABELS[type]}</span>
                          {!supported && (
                            <span className="ml-2 text-xs text-gray-400">(Not supported)</span>
                          )}
                        </span>
                        <span className="text-sm text-gray-500">
                          {count.toLocaleString()} records
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Options */}
            {step === 'options' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Select Record Statuses
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(Object.keys(STATUS_LABELS) as EntityStatus[])
                      .filter((s) => s !== 'deleted')
                      .map((status) => {
                        const count = stats?.byStatus?.[status] || 0;

                        return (
                          <label
                            key={status}
                            className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedStatuses.includes(status)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-blue-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedStatuses.includes(status)}
                              onChange={() => handleStatusToggle(status)}
                              className="rounded border-gray-300 text-blue-600"
                            />
                            <span className="ml-2 text-sm">
                              <span className="text-gray-900">{STATUS_LABELS[status]}</span>
                              <span className="text-gray-400 ml-1">({count})</span>
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Date Range (Optional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">To</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={(e) => setIncludeMetadata(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-gray-900">Include Metadata</span>
                      <p className="text-sm text-gray-500">
                        Export source record IDs and additional tracking information
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Step 4: Export */}
            {step === 'export' && (
              <div className="text-center py-8">
                {exportData.isPending && (
                  <div>
                    <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-600">Preparing export...</p>
                  </div>
                )}

                {exportData.isSuccess && (
                  <div>
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Export Complete!</h3>
                    <p className="text-gray-500 mb-4">
                      {exportData.data?.recordCount.toLocaleString()} records exported to{' '}
                      {selectedFormatInfo?.name} format
                    </p>
                    <button
                      onClick={handleDownload}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Download Export File
                    </button>
                  </div>
                )}

                {exportData.isError && (
                  <div>
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Export Failed</h3>
                    <p className="text-red-600 mb-4">
                      {(exportData.error as Error)?.message || 'An error occurred during export'}
                    </p>
                    <button
                      onClick={() => setStep('options')}
                      className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {step === 'format' && 'Step 1 of 4: Choose format'}
              {step === 'entities' && 'Step 2 of 4: Select entity types'}
              {step === 'options' && 'Step 3 of 4: Configure options'}
              {step === 'export' && 'Step 4 of 4: Export'}
            </div>
            <div className="flex gap-3">
              {step !== 'format' && step !== 'export' && (
                <button
                  onClick={() => {
                    const steps: WizardStep[] = ['format', 'entities', 'options', 'export'];
                    const currentIndex = steps.indexOf(step);
                    if (currentIndex > 0) setStep(steps[currentIndex - 1]);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                >
                  Back
                </button>
              )}

              {step === 'format' && (
                <button
                  onClick={() => setStep('entities')}
                  disabled={!canProceedToEntities}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              )}

              {step === 'entities' && (
                <button
                  onClick={() => setStep('options')}
                  disabled={!canProceedToOptions}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              )}

              {step === 'options' && (
                <button
                  onClick={handleExport}
                  disabled={!canProceedToExport}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Export
                </button>
              )}

              {step === 'export' && exportData.isSuccess && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportWizard;
