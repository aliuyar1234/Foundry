/**
 * Export Dialog Component
 * Dialog for exporting SOPs to various formats
 */

import React, { useState } from 'react';
import { useExportSOP, type SOP } from '../../hooks/useSOPs';

interface ExportDialogProps {
  organizationId: string;
  sop: SOP;
  isOpen: boolean;
  onClose: () => void;
}

type ExportFormat = 'pdf' | 'docx' | 'markdown';

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'pdf',
    label: 'PDF Document',
    description: 'Best for printing and sharing read-only copies',
    icon: (
      <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <text x="7" y="16" fontSize="6" fontWeight="bold" fill="currentColor">PDF</text>
      </svg>
    ),
  },
  {
    value: 'docx',
    label: 'Word Document',
    description: 'Editable in Microsoft Word and Google Docs',
    icon: (
      <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    value: 'markdown',
    label: 'Markdown',
    description: 'Plain text format for documentation systems',
    icon: (
      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <text x="7" y="16" fontSize="5" fontWeight="bold" fill="currentColor">MD</text>
      </svg>
    ),
  },
];

export function ExportDialog({ organizationId, sop, isOpen, onClose }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeVersionHistory, setIncludeVersionHistory] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportSOP = useExportSOP(organizationId);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const result = await exportSOP.mutateAsync({
        sopId: sop.id,
        format: selectedFormat,
        includeMetadata,
        includeVersionHistory,
      });

      // Handle the blob response
      const blob = result as unknown as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Set filename based on format
      const extension = selectedFormat === 'docx' ? 'docx' : selectedFormat === 'pdf' ? 'pdf' : 'md';
      const filename = `${sop.title.replace(/[^a-zA-Z0-9]/g, '_')}_v${sop.version}.${extension}`;
      link.download = filename;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Export SOP</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Export &quot;{sop.title}&quot; (v{sop.version})
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-3">
              {FORMAT_OPTIONS.map((format) => (
                <button
                  key={format.value}
                  onClick={() => setSelectedFormat(format.value)}
                  className={`p-4 rounded-lg border-2 text-center transition-colors ${
                    selectedFormat === format.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-center mb-2">{format.icon}</div>
                  <div className="font-medium text-gray-900 text-sm">{format.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{format.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Include
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-gray-900">Document Metadata</span>
                  <p className="text-xs text-gray-500">
                    ID, version, status, dates, and process information
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVersionHistory}
                  onChange={(e) => setIncludeVersionHistory(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-gray-900">Version History</span>
                  <p className="text-xs text-gray-500">
                    Table of all previous versions with change notes
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Export Preview</h4>
            <div className="flex items-center gap-3">
              <div className="w-12 h-14 bg-white rounded border border-gray-200 flex items-center justify-center">
                {FORMAT_OPTIONS.find((f) => f.value === selectedFormat)?.icon}
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  {sop.title.replace(/[^a-zA-Z0-9]/g, '_')}_v{sop.version}.
                  {selectedFormat === 'docx' ? 'docx' : selectedFormat === 'pdf' ? 'pdf' : 'md'}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedFormat === 'pdf'
                    ? 'Portable Document Format'
                    : selectedFormat === 'docx'
                    ? 'Microsoft Word Document'
                    : 'Markdown Text File'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline Export Button with Dropdown
interface ExportButtonProps {
  organizationId: string;
  sop: SOP;
  variant?: 'button' | 'icon';
}

export function ExportButton({ organizationId, sop, variant = 'button' }: ExportButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportSOP = useExportSOP(organizationId);

  const handleQuickExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setShowDropdown(false);

    try {
      const result = await exportSOP.mutateAsync({
        sopId: sop.id,
        format,
        includeMetadata: true,
        includeVersionHistory: false,
      });

      const blob = result as unknown as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const extension = format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'md';
      link.download = `${sop.title.replace(/[^a-zA-Z0-9]/g, '_')}_v${sop.version}.${extension}`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      // Error handling - could show toast
    } finally {
      setIsExporting(false);
    }
  };

  if (variant === 'icon') {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isExporting}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Export SOP"
        >
          {isExporting ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          )}
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              {FORMAT_OPTIONS.map((format) => (
                <button
                  key={format.value}
                  onClick={() => handleQuickExport(format.value)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2"
                >
                  <div className="w-5 h-5">{format.icon}</div>
                  {format.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isExporting}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {isExporting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            Exporting...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            {FORMAT_OPTIONS.map((format) => (
              <button
                key={format.value}
                onClick={() => handleQuickExport(format.value)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6">{format.icon}</div>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{format.label}</div>
                    <div className="text-xs text-gray-500">{format.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ExportDialog;
