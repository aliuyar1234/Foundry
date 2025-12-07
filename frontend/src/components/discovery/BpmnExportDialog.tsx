/**
 * BPMN Export Dialog Component
 * Dialog for exporting processes to BPMN 2.0 format
 * T279 - BPMN export dialog implementation
 */

import React, { useState } from 'react';
import { useBpmnExport, useBpmnDownload } from '../../hooks/useDiscovery';

interface BpmnExportDialogProps {
  organizationId: string;
  processId?: string;
  processName?: string;
  onClose: () => void;
}

type LayoutAlgorithm = 'horizontal' | 'vertical' | 'hierarchical';

interface ExportOptions {
  includeParticipants: boolean;
  includeDiagram: boolean;
  includeDocumentation: boolean;
  layoutAlgorithm: LayoutAlgorithm;
}

const LAYOUT_OPTIONS: { value: LayoutAlgorithm; label: string; description: string }[] = [
  {
    value: 'horizontal',
    label: 'Horizontal',
    description: 'Left-to-right flow layout',
  },
  {
    value: 'vertical',
    label: 'Vertical',
    description: 'Top-to-bottom flow layout',
  },
  {
    value: 'hierarchical',
    label: 'Hierarchical',
    description: 'Layered hierarchical layout',
  },
];

export function BpmnExportDialog({
  organizationId,
  processId,
  processName,
  onClose,
}: BpmnExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>({
    includeParticipants: true,
    includeDiagram: true,
    includeDocumentation: true,
    layoutAlgorithm: 'horizontal',
  });
  const [previewXml, setPreviewXml] = useState<string | null>(null);

  const exportMutation = useBpmnExport(organizationId);
  const downloadMutation = useBpmnDownload(organizationId);

  const handleExport = async () => {
    if (processId) {
      await downloadMutation.mutateAsync({
        processId,
        ...options,
      });
      onClose();
    } else {
      const result = await exportMutation.mutateAsync({
        processIds: undefined,
        ...options,
      });
      // Handle bulk export result
      if (result.data?.exports?.length > 0) {
        onClose();
      }
    }
  };

  const handlePreview = async () => {
    if (!processId) return;

    try {
      const response = await fetch(
        `/api/discovery/export/bpmn/${processId}?format=xml&includeParticipants=${options.includeParticipants}&includeDiagram=${options.includeDiagram}&layoutAlgorithm=${options.layoutAlgorithm}`
      );
      const xml = await response.text();
      setPreviewXml(xml);
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  const isLoading = exportMutation.isPending || downloadMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Export to BPMN 2.0</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {processId ? `Export "${processName || 'Process'}"` : 'Export all processes'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-6">
            {/* Layout Algorithm */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Diagram Layout
              </label>
              <div className="grid grid-cols-3 gap-3">
                {LAYOUT_OPTIONS.map((layout) => (
                  <button
                    key={layout.value}
                    onClick={() => setOptions({ ...options, layoutAlgorithm: layout.value })}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${
                      options.layoutAlgorithm === layout.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-sm">{layout.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{layout.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Export Options */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Export Options
              </label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.includeDiagram}
                    onChange={(e) => setOptions({ ...options, includeDiagram: e.target.checked })}
                    className="mt-0.5 rounded border-gray-300 text-blue-600"
                  />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Include Diagram</div>
                    <div className="text-xs text-gray-500">
                      Generate BPMN DI (Diagram Interchange) for visual rendering
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.includeParticipants}
                    onChange={(e) => setOptions({ ...options, includeParticipants: e.target.checked })}
                    className="mt-0.5 rounded border-gray-300 text-blue-600"
                  />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Include Participants</div>
                    <div className="text-xs text-gray-500">
                      Add swim lanes for roles/departments involved in the process
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.includeDocumentation}
                    onChange={(e) => setOptions({ ...options, includeDocumentation: e.target.checked })}
                    className="mt-0.5 rounded border-gray-300 text-blue-600"
                  />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Include Documentation</div>
                    <div className="text-xs text-gray-500">
                      Add descriptions and metadata to process elements
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* BPMN Info */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-blue-900">BPMN 2.0 Standard</h4>
                  <p className="text-xs text-blue-700 mt-1">
                    The exported file is compatible with BPMN 2.0 modeling tools like Camunda Modeler,
                    Bizagi, Signavio, and other standard-compliant editors.
                  </p>
                </div>
              </div>
            </div>

            {/* Preview Section */}
            {processId && previewXml && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  XML Preview
                </label>
                <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-auto">
                  <pre className="text-xs text-green-400 whitespace-pre-wrap">
                    {previewXml.substring(0, 2000)}
                    {previewXml.length > 2000 && '\n... (truncated)'}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Format: BPMN 2.0 XML (.bpmn)
            </div>
            <div className="flex gap-3">
              {processId && (
                <button
                  onClick={handlePreview}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                >
                  Preview XML
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {processId ? 'Download BPMN' : 'Export All'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BpmnExportDialog;
