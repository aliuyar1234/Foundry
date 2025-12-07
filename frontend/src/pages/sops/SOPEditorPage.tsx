/**
 * SOP Editor Page
 * Rich text editor for viewing and editing SOPs with version history
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useSOP,
  useUpdateSOP,
  useSOPVersions,
  useRestoreSOPVersion,
  useCompareVersions,
  type SOPStatus,
  type SOPVersion,
} from '../../hooks/useSOPs';
import { SOPPreview } from '../../components/sops/SOPPreview';

// Status configuration
const STATUS_CONFIG: Record<SOPStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  review: { label: 'In Review', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  approved: { label: 'Approved', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  published: { label: 'Published', color: 'text-green-700', bgColor: 'bg-green-100' },
  archived: { label: 'Archived', color: 'text-red-700', bgColor: 'bg-red-100' },
};

type ViewMode = 'edit' | 'preview' | 'split';

interface SOPEditorPageProps {
  organizationId: string;
}

export function SOPEditorPage({ organizationId }: SOPEditorPageProps) {
  const { sopId } = useParams<{ sopId: string }>();
  const navigate = useNavigate();

  // State
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Data queries
  const { data: sop, isLoading, error } = useSOP(organizationId, sopId || '', true);
  const { data: versions } = useSOPVersions(organizationId, sopId || '');
  const updateSOP = useUpdateSOP(organizationId);
  const restoreVersion = useRestoreSOPVersion(organizationId);

  // Version comparison
  const { data: comparison } = useCompareVersions(
    organizationId,
    sopId || '',
    compareVersionId || '',
    selectedVersionId || ''
  );

  // Initialize content from SOP
  useEffect(() => {
    if (sop) {
      setContent(sop.content);
      setTitle(sop.title);
      setHasUnsavedChanges(false);
    }
  }, [sop]);

  // Track unsaved changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setHasUnsavedChanges(true);
  }, []);

  // Save changes
  const handleSave = async () => {
    if (!sopId) return;

    await updateSOP.mutateAsync({
      sopId,
      title,
      content,
      changeNotes: changeNotes || undefined,
    });

    setHasUnsavedChanges(false);
    setChangeNotes('');
  };

  // Restore version
  const handleRestoreVersion = async (versionId: string) => {
    if (!sopId) return;

    if (
      window.confirm(
        'Are you sure you want to restore this version? This will create a new version with the selected content.'
      )
    ) {
      await restoreVersion.mutateAsync({ sopId, versionId });
      setSelectedVersionId(null);
      setCompareVersionId(null);
    }
  };

  // Navigate back
  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return;
      }
    }
    navigate('/sops');
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Render error state
  if (error || !sop) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error loading SOP</h3>
        <p className="text-red-600 text-sm mt-1">{error?.message || 'SOP not found'}</p>
        <button
          onClick={handleBack}
          className="mt-4 text-blue-600 hover:text-blue-700"
        >
          Back to SOPs
        </button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[sop.status];
  const isEditable = sop.status === 'draft' || sop.status === 'review';

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

          <div className="flex-1">
            {isEditable ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-xl font-bold text-gray-900 border-0 border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 focus:ring-0 bg-transparent px-1 w-full max-w-xl"
              />
            ) : (
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            )}
          </div>

          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bgColor}`}>
            {statusConfig.label}
          </span>
          <span className="text-sm text-gray-500">v{sop.version}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'edit' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'split' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'preview' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              }`}
            >
              Preview
            </button>
          </div>

          {/* Version History Toggle */}
          <button
            onClick={() => setShowVersionHistory(!showVersionHistory)}
            className={`p-2 rounded-lg transition-colors ${
              showVersionHistory
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title="Version History"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Save Button */}
          {isEditable && (
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || updateSOP.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {updateSOP.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor / Preview Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor Panel */}
          {(viewMode === 'edit' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} flex flex-col border-r border-gray-200`}>
              <div className="flex-1 overflow-auto p-4">
                {isEditable ? (
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="w-full h-full min-h-[500px] font-mono text-sm border border-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Write your SOP content in Markdown..."
                  />
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-yellow-800 text-sm">
                      This SOP is {sop.status} and cannot be edited. Change the status to draft or review to make changes.
                    </p>
                  </div>
                )}
              </div>

              {/* Change Notes */}
              {isEditable && hasUnsavedChanges && (
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Change Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                    placeholder="Describe what you changed..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Preview Panel */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-auto p-4 bg-white`}>
              <SOPPreview content={content} title={title} />
            </div>
          )}
        </div>

        {/* Version History Panel */}
        {showVersionHistory && (
          <div className="w-80 border-l border-gray-200 bg-white overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">Version History</h3>
              <p className="text-sm text-gray-500 mt-1">
                {versions?.length || 0} versions
              </p>
            </div>

            <div className="flex-1 overflow-auto divide-y divide-gray-100">
              {versions?.map((version: SOPVersion) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  isSelected={selectedVersionId === version.id}
                  isComparing={compareVersionId === version.id}
                  onSelect={() => {
                    if (selectedVersionId === version.id) {
                      setSelectedVersionId(null);
                    } else {
                      setSelectedVersionId(version.id);
                    }
                  }}
                  onCompare={() => {
                    if (compareVersionId === version.id) {
                      setCompareVersionId(null);
                    } else {
                      setCompareVersionId(version.id);
                    }
                  }}
                  onRestore={() => handleRestoreVersion(version.id)}
                />
              ))}
            </div>

            {/* Version Comparison */}
            {comparison && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <h4 className="font-medium text-gray-900 text-sm mb-2">Comparison</h4>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">+{comparison.summary.additions}</span>
                  <span className="text-red-600">-{comparison.summary.deletions}</span>
                  <span className="text-yellow-600">~{comparison.summary.modifications}</span>
                </div>
                <div
                  className="mt-2 text-xs font-mono bg-white p-2 rounded border border-gray-200 max-h-40 overflow-auto"
                  dangerouslySetInnerHTML={{ __html: comparison.diffHtml }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unsaved Changes Indicator */}
      {hasUnsavedChanges && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg shadow-lg text-sm">
          You have unsaved changes
        </div>
      )}
    </div>
  );
}

// Version Item Component
interface VersionItemProps {
  version: SOPVersion;
  isSelected: boolean;
  isComparing: boolean;
  onSelect: () => void;
  onCompare: () => void;
  onRestore: () => void;
}

function VersionItem({
  version,
  isSelected,
  isComparing,
  onSelect,
  onCompare,
  onRestore,
}: VersionItemProps) {
  return (
    <div
      className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">v{version.version}</span>
        <span className="text-xs text-gray-500">
          {new Date(version.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{version.createdBy}</p>
      {version.changeNotes && (
        <p className="text-xs text-gray-600 mt-1 italic">{version.changeNotes}</p>
      )}

      {isSelected && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCompare();
            }}
            className={`text-xs px-2 py-1 rounded ${
              isComparing
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isComparing ? 'Comparing' : 'Compare'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            Restore
          </button>
        </div>
      )}
    </div>
  );
}

export default SOPEditorPage;
