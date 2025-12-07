/**
 * Simulation Page (T176)
 * Main page for what-if simulation and impact analysis
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulations, type SimulationType, type SimulationStatus } from '../../hooks/useSimulations';
import { PersonnelSimulator } from '../../components/simulation/PersonnelSimulator';
import { ProcessSimulator } from '../../components/simulation/ProcessSimulator';
import { ImpactVisualization } from '../../components/simulation/ImpactVisualization';

// Type configuration
const TYPE_CONFIG: Record<SimulationType, { label: string; icon: string; description: string }> = {
  personnel: {
    label: 'Personnel',
    icon: '👥',
    description: 'Simulate departures, absences, and role changes',
  },
  process: {
    label: 'Process',
    icon: '⚙️',
    description: 'Simulate process changes and automation',
  },
  organization: {
    label: 'Organization',
    icon: '🏢',
    description: 'Simulate restructuring and team changes',
  },
  combined: {
    label: 'Combined',
    icon: '🔄',
    description: 'Multi-dimensional scenario planning',
  },
};

const STATUS_CONFIG: Record<SimulationStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700' },
};

interface SimulationPageProps {
  organizationId: string;
}

export function SimulationPage({ organizationId }: SimulationPageProps) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'list' | 'personnel' | 'process' | 'organization'>('list');
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<SimulationType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SimulationStatus | 'all'>('all');

  // Query options
  const queryOptions = {
    types: typeFilter !== 'all' ? [typeFilter] : undefined,
    statuses: statusFilter !== 'all' ? [statusFilter] : undefined,
    limit: 20,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };

  const { data: simulationsData, isLoading } = useSimulations(organizationId, queryOptions);

  // Handlers
  const handleViewResults = (simulationId: string) => {
    setSelectedSimulationId(simulationId);
  };

  const handleCloseResults = () => {
    setSelectedSimulationId(null);
  };

  const handleSimulationCreated = (simulationId: string) => {
    setSelectedSimulationId(simulationId);
    setActiveTab('list');
  };

  // Get impact level color
  const getImpactColor = (level: string | null) => {
    switch (level) {
      case 'minimal':
        return 'text-green-600';
      case 'moderate':
        return 'text-blue-600';
      case 'significant':
        return 'text-yellow-600';
      case 'major':
        return 'text-orange-600';
      case 'transformational':
        return 'text-red-600';
      default:
        return 'text-gray-400';
    }
  };

  // Get score color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-blue-600';
    if (score >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">What-If Simulation</h1>
            <p className="text-gray-600 mt-1">
              Model and analyze the impact of organizational changes before implementation
            </p>
          </div>
        </div>

        {/* Simulation Type Cards */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {(Object.keys(TYPE_CONFIG) as SimulationType[]).map((type) => {
            const config = TYPE_CONFIG[type];
            const isActive = activeTab === type || (activeTab === 'list' && typeFilter === type);

            return (
              <button
                key={type}
                onClick={() => {
                  if (type === 'combined') {
                    // Combined requires starting from another type
                    setActiveTab('personnel');
                  } else if (type === 'organization') {
                    // Organization simulator - placeholder for now
                    setTypeFilter(type);
                    setActiveTab('list');
                  } else {
                    setActiveTab(type as 'personnel' | 'process');
                  }
                }}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="text-3xl mb-2">{config.icon}</div>
                <h3 className="font-medium text-gray-900">{config.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{config.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'list'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Simulation History
          </button>
          <button
            onClick={() => setActiveTab('personnel')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'personnel'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Personnel Simulator
          </button>
          <button
            onClick={() => setActiveTab('process')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'process'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Process Simulator
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as SimulationType | 'all')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">All Types</option>
                  {Object.keys(TYPE_CONFIG).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_CONFIG[type as SimulationType].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as SimulationStatus | 'all')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">All Statuses</option>
                  {Object.keys(STATUS_CONFIG).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_CONFIG[status as SimulationStatus].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && (!simulationsData?.data || simulationsData.data.length === 0) && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">No Simulations Yet</h3>
              <p className="text-gray-600 mt-1 max-w-md mx-auto">
                Start by running a personnel or process simulation to model the impact of changes.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => setActiveTab('personnel')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Personnel Simulation
                </button>
                <button
                  onClick={() => setActiveTab('process')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Process Simulation
                </button>
              </div>
            </div>
          )}

          {/* Simulation List */}
          {!isLoading && simulationsData?.data && simulationsData.data.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="divide-y divide-gray-200">
                {simulationsData.data.map((simulation) => {
                  const typeConfig = TYPE_CONFIG[simulation.type];
                  const statusConfig = STATUS_CONFIG[simulation.status];

                  return (
                    <div
                      key={simulation.id}
                      className="p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleViewResults(simulation.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{typeConfig.icon}</span>
                          <div>
                            <h3 className="font-medium text-gray-900">{simulation.name}</h3>
                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                              <span>{typeConfig.label}</span>
                              <span>|</span>
                              <span>{new Date(simulation.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {simulation.overallScore !== null && (
                            <div className="text-right">
                              <div className={`text-xl font-bold ${getScoreColor(simulation.overallScore)}`}>
                                {simulation.overallScore}
                              </div>
                              <div className={`text-xs ${getImpactColor(simulation.impactLevel)}`}>
                                {simulation.impactLevel || 'N/A'}
                              </div>
                            </div>
                          )}
                          <span className={`px-2 py-1 text-xs font-medium rounded ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      {simulation.description && (
                        <p className="text-sm text-gray-600 mt-2 ml-11">{simulation.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'personnel' && (
        <PersonnelSimulator
          organizationId={organizationId}
          onSimulationCreated={handleSimulationCreated}
        />
      )}

      {activeTab === 'process' && (
        <ProcessSimulator
          organizationId={organizationId}
          onSimulationCreated={handleSimulationCreated}
        />
      )}

      {/* Results Modal */}
      {selectedSimulationId && (
        <ImpactVisualization
          organizationId={organizationId}
          simulationId={selectedSimulationId}
          onClose={handleCloseResults}
        />
      )}
    </div>
  );
}

export default SimulationPage;
