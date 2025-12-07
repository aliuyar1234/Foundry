/**
 * SOP Page (T089)
 * SOP generation and management page
 */

import React, { useState, useEffect } from 'react';
import { SopGenerator, SopViewer } from '../components/sop';
import { sopApi } from '../services/intelligence.api';

interface SopDraft {
  id: string;
  title: string;
  version: string;
  status: string;
  processId: string;
  createdAt: string;
  updatedAt: string;
}

export const SopPage: React.FC = () => {
  const [sops, setSops] = useState<SopDraft[]>([]);
  const [selectedSopId, setSelectedSopId] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mock process for demo - in real app, this would come from process selection
  const mockProcess = {
    id: 'process-1',
    name: 'Employee Onboarding',
  };

  useEffect(() => {
    loadSops();
  }, []);

  const loadSops = async () => {
    try {
      setLoading(true);
      const response = await sopApi.getForProcess(mockProcess.id);
      setSops(response.data.data);
    } catch (err) {
      console.error('Failed to load SOPs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string, sopId: string) => {
    try {
      switch (action) {
        case 'submit':
          await sopApi.submit(sopId);
          break;
        case 'approve':
          await sopApi.review(sopId, 'approve');
          break;
        case 'reject':
          await sopApi.review(sopId, 'reject', 'Needs revision');
          break;
        case 'publish':
          await sopApi.publish(sopId);
          break;
      }
      await loadSops();
    } catch (err) {
      console.error('Action failed:', err);
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SOP Management</h1>
          <p className="text-gray-600 mt-2">
            Generate and manage Standard Operating Procedures
          </p>
        </div>
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Generate New SOP
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* SOP List */}
        <div className="col-span-1 space-y-4">
          <h3 className="text-lg font-medium text-gray-900">SOPs</h3>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : sops.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
              No SOPs generated yet
            </div>
          ) : (
            sops.map((sop) => (
              <div
                key={sop.id}
                onClick={() => setSelectedSopId(sop.id)}
                className={`p-4 bg-white border rounded-lg cursor-pointer transition-shadow hover:shadow-md ${
                  selectedSopId === sop.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{sop.title}</h4>
                    <p className="text-sm text-gray-500 mt-1">v{sop.version}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(sop.status)}`}>
                    {sop.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Updated: {new Date(sop.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Content Area */}
        <div className="col-span-2">
          {showGenerator && (
            <div className="mb-6">
              <SopGenerator
                processId={mockProcess.id}
                processName={mockProcess.name}
                onGenerated={(sop) => {
                  setShowGenerator(false);
                  setSelectedSopId(sop.id);
                  loadSops();
                }}
              />
            </div>
          )}

          {selectedSopId && (
            <SopViewer
              sopId={selectedSopId}
              onAction={handleAction}
            />
          )}

          {!showGenerator && !selectedSopId && (
            <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
              <p className="text-gray-500">Select an SOP to view or generate a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SopPage;
