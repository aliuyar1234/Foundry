/**
 * Process Simulator Component (T178)
 * Interface for simulating process changes and automation
 */

import React, { useState } from 'react';
import {
  useCreateProcessSimulation,
  type ProcessChange,
} from '../../hooks/useSimulations';

interface ProcessSimulatorProps {
  organizationId: string;
  onSimulationCreated?: (simulationId: string) => void;
}

type ProcessChangeType = 'modification' | 'elimination' | 'automation' | 'merger' | 'split';

const CHANGE_TYPES: Array<{ type: ProcessChangeType; label: string; icon: string; description: string }> = [
  {
    type: 'automation',
    label: 'Automation',
    icon: '🤖',
    description: 'Automate process steps using technology',
  },
  {
    type: 'modification',
    label: 'Modification',
    icon: '✏️',
    description: 'Add, remove, or change process steps',
  },
  {
    type: 'elimination',
    label: 'Elimination',
    icon: '🗑️',
    description: 'Remove the process entirely',
  },
  {
    type: 'merger',
    label: 'Merger',
    icon: '🔗',
    description: 'Combine with another process',
  },
  {
    type: 'split',
    label: 'Split',
    icon: '✂️',
    description: 'Divide into multiple processes',
  },
];

// Mock processes for demo (would come from API in real app)
const MOCK_PROCESSES = [
  { id: 'proc-1', name: 'Invoice Processing', steps: 8, avgDuration: 45, frequency: 'daily' },
  { id: 'proc-2', name: 'Employee Onboarding', steps: 12, avgDuration: 180, frequency: 'weekly' },
  { id: 'proc-3', name: 'Purchase Approval', steps: 5, avgDuration: 30, frequency: 'daily' },
  { id: 'proc-4', name: 'Customer Support Ticket', steps: 6, avgDuration: 25, frequency: 'hourly' },
  { id: 'proc-5', name: 'Quarterly Reporting', steps: 15, avgDuration: 480, frequency: 'quarterly' },
];

export function ProcessSimulator({
  organizationId,
  onSimulationCreated,
}: ProcessSimulatorProps) {
  const [simulationName, setSimulationName] = useState('');
  const [changes, setChanges] = useState<ProcessChange[]>([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [selectedChangeType, setSelectedChangeType] = useState<ProcessChangeType>('automation');
  const [automationLevel, setAutomationLevel] = useState(50);
  const [includeMitigation, setIncludeMitigation] = useState(true);

  const createSimulation = useCreateProcessSimulation(organizationId);

  // Add change to list
  const handleAddChange = () => {
    if (!selectedProcess) return;

    const newChange: ProcessChange = {
      type: selectedChangeType,
      processId: selectedProcess,
      ...(selectedChangeType === 'automation' && { automationLevel }),
    };

    setChanges([...changes, newChange]);
    setSelectedProcess('');
    setAutomationLevel(50);
  };

  // Remove change from list
  const handleRemoveChange = (index: number) => {
    setChanges(changes.filter((_, i) => i !== index));
  };

  // Run simulation
  const handleRunSimulation = async () => {
    if (!simulationName.trim() || changes.length === 0) return;

    try {
      const result = await createSimulation.mutateAsync({
        name: simulationName,
        type: 'process',
        changes: { process: changes },
        options: {
          includeMitigation,
          includeFinancials: true,
          scenario: 'realistic',
        },
        runAsync: true,
      });

      if (onSimulationCreated) {
        onSimulationCreated(result.id);
      }
    } catch {
      // Handle error
    }
  };

  // Get process details
  const getProcessById = (id: string) => MOCK_PROCESSES.find((p) => p.id === id);

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Process Change Simulation</h2>

        {/* Simulation Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Simulation Name
          </label>
          <input
            type="text"
            value={simulationName}
            onChange={(e) => setSimulationName(e.target.value)}
            placeholder="e.g., Invoice Processing Automation"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Change Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Change Type</label>
          <div className="grid grid-cols-5 gap-3">
            {CHANGE_TYPES.map((type) => (
              <button
                key={type.type}
                onClick={() => setSelectedChangeType(type.type)}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  selectedChangeType === type.type
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <div className="text-sm font-medium text-gray-900">{type.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Add Change Form */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Configure Change</h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Process Selection */}
            <div>
              <label className="block text-sm text-gray-700 mb-1">Process</label>
              <select
                value={selectedProcess}
                onChange={(e) => setSelectedProcess(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select process...</option>
                {MOCK_PROCESSES.filter((p) => !changes.some((c) => c.processId === p.id)).map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name} ({process.steps} steps)
                  </option>
                ))}
              </select>
            </div>

            {/* Automation Level (only for automation type) */}
            {selectedChangeType === 'automation' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Automation Level ({automationLevel}%)
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="10"
                  value={automationLevel}
                  onChange={(e) => setAutomationLevel(Number(e.target.value))}
                  className="w-full mt-2"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Partial (10%)</span>
                  <span>Full (100%)</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleAddChange}
            disabled={!selectedProcess}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Add to Simulation
          </button>
        </div>

        {/* Changes List */}
        {changes.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-900 mb-3">Simulated Changes ({changes.length})</h3>
            <div className="space-y-2">
              {changes.map((change, index) => {
                const process = getProcessById(change.processId);
                const changeType = CHANGE_TYPES.find((t) => t.type === change.type);

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{changeType?.icon}</span>
                      <div>
                        <div className="font-medium text-gray-900">{process?.name}</div>
                        <div className="text-sm text-gray-500">
                          {changeType?.label}
                          {change.automationLevel && ` (${change.automationLevel}% automation)`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveChange(index)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-6 mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeMitigation}
              onChange={(e) => setIncludeMitigation(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-gray-700">Include mitigation recommendations</span>
          </label>
        </div>

        {/* Run Button */}
        <button
          onClick={handleRunSimulation}
          disabled={!simulationName.trim() || changes.length === 0 || createSimulation.isPending}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {createSimulation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Running Simulation...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run Simulation
            </>
          )}
        </button>
      </div>

      {/* Expected Outcomes Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <h4 className="font-medium">Efficiency Gains</h4>
          </div>
          <p className="text-sm text-gray-600">
            Projected time savings and throughput improvements
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="font-medium">Cost Analysis</h4>
          </div>
          <p className="text-sm text-gray-600">
            Implementation costs vs. long-term savings
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-orange-600 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="font-medium">Risk Assessment</h4>
          </div>
          <p className="text-sm text-gray-600">
            Potential risks and mitigation strategies
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProcessSimulator;
