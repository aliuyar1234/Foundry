/**
 * Generate SOP Wizard
 * Multi-step wizard for generating SOPs from discovered processes
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGenerateSOP, type SOPGenerationOptions } from '../../hooks/useSOPs';
import { useProcesses, type Process } from '../../hooks/useProcesses';

type WizardStep = 'process' | 'options' | 'review' | 'generating';

interface GenerateSOPWizardProps {
  organizationId: string;
  preselectedProcessId?: string;
  onComplete?: (jobId: string) => void;
  onCancel?: () => void;
}

export function GenerateSOPWizard({
  organizationId,
  preselectedProcessId,
  onComplete,
  onCancel,
}: GenerateSOPWizardProps) {
  const navigate = useNavigate();

  // State
  const [step, setStep] = useState<WizardStep>('process');
  const [selectedProcessId, setSelectedProcessId] = useState(preselectedProcessId || '');
  const [options, setOptions] = useState<Partial<SOPGenerationOptions>>({
    language: 'en',
    style: 'formal',
    detailLevel: 'standard',
    includeFlowchart: true,
    includeCheckboxes: true,
    includeTimelines: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Data queries
  const { data: processesData, isLoading: loadingProcesses } = useProcesses(organizationId);
  const generateSOP = useGenerateSOP(organizationId);

  // Skip to options if process is preselected
  useEffect(() => {
    if (preselectedProcessId) {
      setStep('options');
    }
  }, [preselectedProcessId]);

  // Filter processes
  const filteredProcesses = (processesData?.data || []).filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected process details
  const selectedProcess = (processesData?.data || []).find((p) => p.id === selectedProcessId);

  // Handlers
  const handleProcessSelect = (processId: string) => {
    setSelectedProcessId(processId);
  };

  const handleNextStep = () => {
    if (step === 'process' && selectedProcessId) {
      setStep('options');
    } else if (step === 'options') {
      setStep('review');
    }
  };

  const handlePrevStep = () => {
    if (step === 'options') {
      setStep('process');
    } else if (step === 'review') {
      setStep('options');
    }
  };

  const handleGenerate = async () => {
    setStep('generating');
    setGenerationError(null);

    try {
      const result = await generateSOP.mutateAsync({
        processId: selectedProcessId,
        options,
      });

      if (onComplete) {
        onComplete(result.jobId);
      } else {
        navigate(`/sops?jobId=${result.jobId}`);
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Generation failed');
      setStep('review');
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/sops');
    }
  };

  // Render step indicator
  const renderStepIndicator = () => {
    const steps = [
      { key: 'process', label: 'Select Process' },
      { key: 'options', label: 'Options' },
      { key: 'review', label: 'Review' },
    ];

    const currentIndex = steps.findIndex((s) => s.key === step);

    return (
      <div className="flex items-center justify-center mb-8">
        {steps.map((s, index) => (
          <React.Fragment key={s.key}>
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentIndex
                    ? 'bg-green-500 text-white'
                    : index === currentIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {index < currentIndex ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  index <= currentIndex ? 'text-gray-900' : 'text-gray-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-4 ${
                  index < currentIndex ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Render process selection step
  const renderProcessStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a Process</h2>
        <p className="text-gray-600">
          Choose a discovered process to generate an SOP from. The SOP will be created based on
          the process steps, performers, and metadata.
        </p>
      </div>

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search processes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {loadingProcesses ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredProcesses.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-gray-600">No processes found</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-blue-600 hover:text-blue-700 mt-2"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 max-h-96 overflow-y-auto">
          {filteredProcesses.map((process) => (
            <ProcessCard
              key={process.id}
              process={process}
              selected={selectedProcessId === process.id}
              onSelect={() => handleProcessSelect(process.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Render options step
  const renderOptionsStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Configure Generation Options</h2>
        <p className="text-gray-600">
          Customize how the SOP will be generated. These settings affect the style, detail level,
          and included elements.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
          <select
            value={options.language}
            onChange={(e) => setOptions({ ...options, language: e.target.value as 'en' | 'de' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="en">English</option>
            <option value="de">German (Deutsch)</option>
          </select>
        </div>

        {/* Style */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Writing Style</label>
          <select
            value={options.style}
            onChange={(e) =>
              setOptions({ ...options, style: e.target.value as 'formal' | 'conversational' })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="formal">Formal</option>
            <option value="conversational">Conversational</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {options.style === 'formal'
              ? 'Professional, structured language suitable for official documentation'
              : 'Friendly, approachable language easier to follow'}
          </p>
        </div>

        {/* Detail Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Detail Level</label>
          <select
            value={options.detailLevel}
            onChange={(e) =>
              setOptions({
                ...options,
                detailLevel: e.target.value as 'brief' | 'standard' | 'detailed',
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {options.detailLevel === 'brief'
              ? 'High-level overview with key steps only'
              : options.detailLevel === 'standard'
              ? 'Balanced detail for most use cases'
              : 'Comprehensive with sub-steps and edge cases'}
          </p>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target Audience (Optional)
          </label>
          <input
            type="text"
            value={options.targetAudience || ''}
            onChange={(e) => setOptions({ ...options, targetAudience: e.target.value })}
            placeholder="e.g., New employees, Technical staff"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Name (Optional)
          </label>
          <input
            type="text"
            value={options.companyName || ''}
            onChange={(e) => setOptions({ ...options, companyName: e.target.value })}
            placeholder="Your Company Name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Department (Optional)
          </label>
          <input
            type="text"
            value={options.department || ''}
            onChange={(e) => setOptions({ ...options, department: e.target.value })}
            placeholder="e.g., Operations, HR"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Include Options */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Include in SOP</label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeFlowchart}
              onChange={(e) => setOptions({ ...options, includeFlowchart: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-gray-900">Process Flowchart</span>
              <p className="text-xs text-gray-500">Visual diagram showing the process flow</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeCheckboxes}
              onChange={(e) => setOptions({ ...options, includeCheckboxes: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-gray-900">Step Checkboxes</span>
              <p className="text-xs text-gray-500">Checkable items for tracking completion</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeTimelines}
              onChange={(e) => setOptions({ ...options, includeTimelines: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-gray-900">Timeline Estimates</span>
              <p className="text-xs text-gray-500">Estimated duration for each step</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  // Render review step
  const renderReviewStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Review and Generate</h2>
        <p className="text-gray-600">
          Review your selections before generating the SOP. This process may take a few minutes.
        </p>
      </div>

      {generationError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-red-800 font-medium">Generation Failed</h4>
              <p className="text-red-600 text-sm mt-1">{generationError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Selected Process
          </h3>
          <div className="mt-2 flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">{selectedProcess?.name}</p>
              {selectedProcess?.description && (
                <p className="text-sm text-gray-600 mt-1">{selectedProcess.description}</p>
              )}
            </div>
          </div>
        </div>

        <hr className="border-gray-200" />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium text-gray-500">Language</h4>
            <p className="mt-1 text-gray-900">{options.language === 'en' ? 'English' : 'German'}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Style</h4>
            <p className="mt-1 text-gray-900 capitalize">{options.style}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Detail Level</h4>
            <p className="mt-1 text-gray-900 capitalize">{options.detailLevel}</p>
          </div>
          {options.targetAudience && (
            <div>
              <h4 className="text-sm font-medium text-gray-500">Target Audience</h4>
              <p className="mt-1 text-gray-900">{options.targetAudience}</p>
            </div>
          )}
        </div>

        <hr className="border-gray-200" />

        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Included Elements</h4>
          <div className="flex flex-wrap gap-2">
            {options.includeFlowchart && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                Flowchart
              </span>
            )}
            {options.includeCheckboxes && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                Checkboxes
              </span>
            )}
            {options.includeTimelines && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                Timelines
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-blue-800 font-medium">What happens next?</h4>
            <p className="text-blue-600 text-sm mt-1">
              The AI will analyze the process data and generate a comprehensive SOP. This typically
              takes 1-3 minutes depending on the complexity of the process. You&apos;ll be notified
              when it&apos;s ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Render generating step
  const renderGeneratingStep = () => (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
      <h2 className="text-xl font-semibold text-gray-900 mt-6">Generating SOP...</h2>
      <p className="text-gray-600 mt-2">
        The AI is analyzing the process and creating your SOP.
        <br />
        This may take a few minutes.
      </p>
      <div className="mt-8 space-y-2 text-sm text-gray-500">
        <p className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Analyzing process structure
        </p>
        <p className="flex items-center justify-center gap-2">
          <div className="animate-pulse w-4 h-4 bg-blue-500 rounded-full"></div>
          Generating documentation
        </p>
        <p className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
          Calculating confidence score
        </p>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Generate SOP</h1>
          <p className="text-gray-600 mt-1">
            Create a standard operating procedure from a discovered process
          </p>
        </div>

        <div className="p-6">
          {step !== 'generating' && renderStepIndicator()}

          {step === 'process' && renderProcessStep()}
          {step === 'options' && renderOptionsStep()}
          {step === 'review' && renderReviewStep()}
          {step === 'generating' && renderGeneratingStep()}
        </div>

        {step !== 'generating' && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={step === 'process' ? handleCancel : handlePrevStep}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              {step === 'process' ? 'Cancel' : 'Back'}
            </button>
            <div className="flex items-center gap-3">
              {step === 'review' ? (
                <button
                  onClick={handleGenerate}
                  disabled={generateSOP.isPending}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate SOP
                </button>
              ) : (
                <button
                  onClick={handleNextStep}
                  disabled={step === 'process' && !selectedProcessId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Process Card Component
interface ProcessCardProps {
  process: Process;
  selected: boolean;
  onSelect: () => void;
}

function ProcessCard({ process, selected, onSelect }: ProcessCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900">{process.name}</h3>
          {process.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{process.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {process.stepCount !== undefined && (
              <span>{process.stepCount} steps</span>
            )}
            {process.instanceCount !== undefined && (
              <span>{process.instanceCount} instances</span>
            )}
            {process.avgDuration && (
              <span>Avg: {formatDuration(process.avgDuration)}</span>
            )}
          </div>
        </div>
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
          }`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export default GenerateSOPWizard;
