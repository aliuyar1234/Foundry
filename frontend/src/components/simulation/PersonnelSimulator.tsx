/**
 * Personnel Simulator Component (T177)
 * Interface for simulating personnel departures and changes
 */

import React, { useState } from 'react';
import {
  useCreatePersonnelSimulation,
  type PersonnelChange,
} from '../../hooks/useSimulations';

interface PersonnelSimulatorProps {
  organizationId: string;
  onSimulationCreated?: (simulationId: string) => void;
}

type ChangeType = 'departure' | 'absence' | 'role_change' | 'team_transfer';

const CHANGE_TYPES: Array<{ type: ChangeType; label: string; description: string }> = [
  {
    type: 'departure',
    label: 'Departure',
    description: 'Employee leaving the organization',
  },
  {
    type: 'absence',
    label: 'Extended Absence',
    description: 'Temporary absence (parental leave, sabbatical, etc.)',
  },
  {
    type: 'role_change',
    label: 'Role Change',
    description: 'Employee changing roles within the organization',
  },
  {
    type: 'team_transfer',
    label: 'Team Transfer',
    description: 'Employee moving to a different team',
  },
];

// Mock people for demo (would come from API in real app)
const MOCK_PEOPLE = [
  { id: 'person-1', name: 'Anna Schmidt', role: 'Engineering Lead', team: 'Platform' },
  { id: 'person-2', name: 'Max Müller', role: 'Product Manager', team: 'Product' },
  { id: 'person-3', name: 'Lisa Weber', role: 'Data Scientist', team: 'Analytics' },
  { id: 'person-4', name: 'Thomas Fischer', role: 'Senior Developer', team: 'Platform' },
  { id: 'person-5', name: 'Sarah Koch', role: 'UX Designer', team: 'Design' },
];

export function PersonnelSimulator({
  organizationId,
  onSimulationCreated,
}: PersonnelSimulatorProps) {
  const [simulationName, setSimulationName] = useState('');
  const [changes, setChanges] = useState<PersonnelChange[]>([]);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [selectedChangeType, setSelectedChangeType] = useState<ChangeType>('departure');
  const [probability, setProbability] = useState(100);
  const [includeMitigation, setIncludeMitigation] = useState(true);

  const createSimulation = useCreatePersonnelSimulation(organizationId);

  // Add change to list
  const handleAddChange = () => {
    if (!selectedPerson) return;

    const person = MOCK_PEOPLE.find((p) => p.id === selectedPerson);
    if (!person) return;

    const newChange: PersonnelChange = {
      type: selectedChangeType,
      personId: selectedPerson,
      probability,
    };

    setChanges([...changes, newChange]);
    setSelectedPerson('');
    setProbability(100);
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
        type: 'personnel',
        changes: { personnel: changes },
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

  // Get person details
  const getPersonById = (id: string) => MOCK_PEOPLE.find((p) => p.id === id);

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Personnel Change Simulation</h2>

        {/* Simulation Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Simulation Name
          </label>
          <input
            type="text"
            value={simulationName}
            onChange={(e) => setSimulationName(e.target.value)}
            placeholder="e.g., Key Developer Departure Impact"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Add Change Form */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Add Personnel Change</h3>

          <div className="grid grid-cols-3 gap-4">
            {/* Person Selection */}
            <div>
              <label className="block text-sm text-gray-700 mb-1">Person</label>
              <select
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select person...</option>
                {MOCK_PEOPLE.filter((p) => !changes.some((c) => c.personId === p.id)).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Change Type */}
            <div>
              <label className="block text-sm text-gray-700 mb-1">Change Type</label>
              <select
                value={selectedChangeType}
                onChange={(e) => setSelectedChangeType(e.target.value as ChangeType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {CHANGE_TYPES.map((type) => (
                  <option key={type.type} value={type.type}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Probability */}
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Probability ({probability}%)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={probability}
                onChange={(e) => setProbability(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <button
            onClick={handleAddChange}
            disabled={!selectedPerson}
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
                const person = getPersonById(change.personId);
                const changeType = CHANGE_TYPES.find((t) => t.type === change.type);

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-700 font-medium">
                          {person?.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{person?.name}</div>
                        <div className="text-sm text-gray-500">
                          {changeType?.label} | {person?.role} | {change.probability}% probability
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

      {/* Info Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h4 className="font-medium">Knowledge Impact</h4>
          </div>
          <p className="text-sm text-gray-600">
            Analyze unique knowledge and skills that would be lost
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="font-medium">Financial Impact</h4>
          </div>
          <p className="text-sm text-gray-600">
            Estimate costs including productivity loss and replacement
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h4 className="font-medium">Team Impact</h4>
          </div>
          <p className="text-sm text-gray-600">
            Assess workload redistribution and team dynamics
          </p>
        </div>
      </div>
    </div>
  );
}

export default PersonnelSimulator;
