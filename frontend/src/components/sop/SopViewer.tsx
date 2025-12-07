/**
 * SOP Viewer Component (T088)
 * Display and review SOP content
 */

import React, { useState, useEffect } from 'react';
import { sopApi } from '../../services/intelligence.api';

interface SopContent {
  purpose: string;
  scope: string;
  definitions: Array<{ term: string; definition: string }>;
  responsibilities: Array<{ role: string; responsibilities: string[] }>;
  prerequisites: string[];
  procedures: Array<{
    id: string;
    stepNumber: number;
    title: string;
    description: string;
    substeps?: Array<{ id: string; stepNumber: string; description: string }>;
    responsible?: string;
    duration?: string;
    notes?: string[];
    warnings?: string[];
  }>;
  qualityChecks: Array<{
    id: string;
    checkpoint: string;
    criteria: string;
    frequency: string;
    responsible: string;
  }>;
  exceptions: Array<{
    id: string;
    condition: string;
    action: string;
    escalation?: string;
  }>;
  references: Array<{ id: string; title: string; type: string; location?: string }>;
}

interface SopViewerProps {
  sopId: string;
  onAction?: (action: string, sopId: string) => void;
}

export const SopViewer: React.FC<SopViewerProps> = ({ sopId, onAction }) => {
  const [sop, setSop] = useState<{
    id: string;
    title: string;
    version: string;
    status: string;
    content: SopContent;
    metadata: Record<string, unknown>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('procedures');

  useEffect(() => {
    loadSop();
  }, [sopId]);

  const loadSop = async () => {
    try {
      setLoading(true);
      const response = await sopApi.getById(sopId);
      setSop(response.data.data);
    } catch (err) {
      setError('Failed to load SOP');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return 'bg-green-100 text-green-800';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING_REVIEW':
        return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !sop) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error || 'SOP not found'}
      </div>
    );
  }

  const sections = [
    { id: 'procedures', label: 'Procedures' },
    { id: 'responsibilities', label: 'Responsibilities' },
    { id: 'quality', label: 'Quality Checks' },
    { id: 'exceptions', label: 'Exceptions' },
    { id: 'references', label: 'References' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{sop.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Version {sop.version}</p>
          </div>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(sop.status)}`}>
            {sop.status.replace('_', ' ')}
          </span>
        </div>

        {/* Purpose & Scope */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700">Purpose</h4>
            <p className="text-sm text-gray-600 mt-1">{sop.content.purpose}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700">Scope</h4>
            <p className="text-sm text-gray-600 mt-1">{sop.content.scope}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {sop.status === 'DRAFT' && (
            <button
              onClick={() => onAction?.('submit', sopId)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Submit for Review
            </button>
          )}
          {sop.status === 'PENDING_REVIEW' && (
            <>
              <button
                onClick={() => onAction?.('approve', sopId)}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => onAction?.('reject', sopId)}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Reject
              </button>
            </>
          )}
          {sop.status === 'APPROVED' && (
            <button
              onClick={() => onAction?.('publish', sopId)}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${
                activeSection === section.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeSection === 'procedures' && (
          <div className="space-y-4">
            {sop.content.procedures.map((proc) => (
              <div key={proc.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-800 rounded-full font-medium">
                    {proc.stepNumber}
                  </span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{proc.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{proc.description}</p>

                    {proc.substeps && proc.substeps.length > 0 && (
                      <div className="mt-3 ml-4 space-y-2">
                        {proc.substeps.map((sub) => (
                          <div key={sub.id} className="flex gap-2 text-sm">
                            <span className="text-gray-500">{sub.stepNumber}</span>
                            <span className="text-gray-700">{sub.description}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      {proc.responsible && (
                        <span>Responsible: {proc.responsible}</span>
                      )}
                      {proc.duration && <span>Duration: {proc.duration}</span>}
                    </div>

                    {proc.warnings && proc.warnings.length > 0 && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        {proc.warnings.map((warning, i) => (
                          <p key={i} className="text-sm text-yellow-800">
                            ⚠️ {warning}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'responsibilities' && (
          <div className="space-y-4">
            {sop.content.responsibilities.map((resp, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{resp.role}</h4>
                <ul className="mt-2 space-y-1">
                  {resp.responsibilities.map((r, j) => (
                    <li key={j} className="text-sm text-gray-600 flex gap-2">
                      <span className="text-blue-500">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'quality' && (
          <div className="space-y-4">
            {sop.content.qualityChecks.map((check) => (
              <div key={check.id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{check.checkpoint}</h4>
                <p className="text-sm text-gray-600 mt-1">{check.criteria}</p>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>Frequency: {check.frequency}</span>
                  <span>Responsible: {check.responsible}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'exceptions' && (
          <div className="space-y-4">
            {sop.content.exceptions.map((exc) => (
              <div key={exc.id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">If: {exc.condition}</h4>
                <p className="text-sm text-gray-600 mt-1">Then: {exc.action}</p>
                {exc.escalation && (
                  <p className="text-sm text-yellow-700 mt-1">
                    Escalate to: {exc.escalation}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {activeSection === 'references' && (
          <div className="space-y-2">
            {sop.content.references.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
              >
                <span className="text-gray-400">📄</span>
                <div>
                  <p className="font-medium text-gray-900">{ref.title}</p>
                  <p className="text-xs text-gray-500">{ref.type}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SopViewer;
