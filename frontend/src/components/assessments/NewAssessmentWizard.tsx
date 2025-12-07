/**
 * New Assessment Wizard
 * Multi-step wizard for creating new assessments
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateAssessment,
  useAssessmentStatus,
  type AssessmentType,
} from '../../hooks/useAssessments';

// Type configuration
const ASSESSMENT_TYPES: Array<{
  type: AssessmentType;
  label: string;
  description: string;
  icon: string;
  estimatedTime: string;
  includes: string[];
}> = [
  {
    type: 'erp',
    label: 'ERP Readiness',
    description: 'Evaluate readiness for ERP implementation',
    icon: '🏢',
    estimatedTime: '2-3 minutes',
    includes: ['Data quality analysis', 'Process readiness', 'System integration', 'Organizational readiness', 'ERP recommendations'],
  },
  {
    type: 'ai',
    label: 'AI Readiness',
    description: 'Assess capability to adopt AI/ML solutions',
    icon: '🤖',
    estimatedTime: '2-3 minutes',
    includes: ['Data foundation', 'Technical infrastructure', 'Talent assessment', 'Strategy evaluation', 'Use case suitability'],
  },
  {
    type: 'data_quality',
    label: 'Data Quality',
    description: 'Comprehensive data quality analysis',
    icon: '📊',
    estimatedTime: '1-2 minutes',
    includes: ['Completeness scoring', 'Accuracy analysis', 'Consistency checks', 'Timeliness evaluation', 'Issue identification'],
  },
  {
    type: 'process_maturity',
    label: 'Process Maturity',
    description: 'Evaluate process documentation and standardization',
    icon: '⚙️',
    estimatedTime: '1-2 minutes',
    includes: ['Documentation level', 'Standardization score', 'Automation assessment', 'Maturity roadmap', 'Gap analysis'],
  },
  {
    type: 'comprehensive',
    label: 'Comprehensive',
    description: 'Full assessment across all dimensions',
    icon: '📋',
    estimatedTime: '5-7 minutes',
    includes: ['All ERP readiness metrics', 'All AI readiness metrics', 'Data quality analysis', 'Process maturity', 'Combined recommendations'],
  },
];

type WizardStep = 'type' | 'options' | 'processing' | 'complete';

interface NewAssessmentWizardProps {
  organizationId: string;
  onComplete?: (assessmentId: string) => void;
  onCancel?: () => void;
}

export function NewAssessmentWizard({
  organizationId,
  onComplete,
  onCancel,
}: NewAssessmentWizardProps) {
  const navigate = useNavigate();

  // State
  const [step, setStep] = useState<WizardStep>('type');
  const [selectedType, setSelectedType] = useState<AssessmentType | null>(null);
  const [assessmentName, setAssessmentName] = useState('');
  const [options, setOptions] = useState({
    includeRecommendations: true,
    detailLevel: 'detailed' as 'summary' | 'detailed' | 'comprehensive',
  });
  const [createdAssessmentId, setCreatedAssessmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mutations
  const createAssessment = useCreateAssessment(organizationId);

  // Poll status while processing
  const { data: statusData } = useAssessmentStatus(
    organizationId,
    createdAssessmentId || '',
    3000
  );

  // Handle status changes
  React.useEffect(() => {
    if (statusData?.status === 'completed') {
      setStep('complete');
    } else if (statusData?.status === 'failed') {
      setError(statusData.error || 'Assessment failed');
      setStep('type');
    }
  }, [statusData]);

  // Handlers
  const handleSelectType = (type: AssessmentType) => {
    setSelectedType(type);
    const typeConfig = ASSESSMENT_TYPES.find((t) => t.type === type);
    setAssessmentName(
      `${typeConfig?.label} Assessment - ${new Date().toLocaleDateString()}`
    );
  };

  const handleNext = () => {
    if (step === 'type' && selectedType) {
      setStep('options');
    }
  };

  const handleBack = () => {
    if (step === 'options') {
      setStep('type');
    }
  };

  const handleStart = async () => {
    if (!selectedType) return;

    setError(null);
    setStep('processing');

    try {
      const result = await createAssessment.mutateAsync({
        type: selectedType,
        name: assessmentName,
        options,
      });

      setCreatedAssessmentId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start assessment');
      setStep('options');
    }
  };

  const handleViewResults = () => {
    if (createdAssessmentId) {
      if (onComplete) {
        onComplete(createdAssessmentId);
      } else {
        navigate(`/assessments/${createdAssessmentId}`);
      }
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/assessments');
    }
  };

  const selectedTypeConfig = ASSESSMENT_TYPES.find((t) => t.type === selectedType);

  // Render type selection step
  const renderTypeStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Select Assessment Type</h2>
        <p className="text-gray-600">
          Choose the type of readiness assessment you want to run.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ASSESSMENT_TYPES.map((type) => (
          <div
            key={type.type}
            onClick={() => handleSelectType(type.type)}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedType === type.type
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">{type.icon}</span>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{type.label}</h3>
                <p className="text-sm text-gray-600 mt-1">{type.description}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Estimated: {type.estimatedTime}
                </p>
              </div>
              {selectedType === type.type && (
                <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Render options step
  const renderOptionsStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Configure Assessment</h2>
        <p className="text-gray-600">
          Customize the assessment options and provide a name.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Assessment Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Assessment Name
        </label>
        <input
          type="text"
          value={assessmentName}
          onChange={(e) => setAssessmentName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter a name for this assessment"
        />
      </div>

      {/* Detail Level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Detail Level
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['summary', 'detailed', 'comprehensive'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setOptions({ ...options, detailLevel: level })}
              className={`p-3 rounded-lg border-2 text-center transition-colors ${
                options.detailLevel === level
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900 capitalize">{level}</div>
              <div className="text-xs text-gray-500 mt-1">
                {level === 'summary'
                  ? 'High-level overview'
                  : level === 'detailed'
                  ? 'Full analysis'
                  : 'Maximum depth'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Include Recommendations */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={options.includeRecommendations}
          onChange={(e) =>
            setOptions({ ...options, includeRecommendations: e.target.checked })
          }
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-gray-900">Include Recommendations</span>
          <p className="text-xs text-gray-500">
            Generate actionable recommendations based on assessment results
          </p>
        </div>
      </label>

      {/* What&apos;s Included */}
      {selectedTypeConfig && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">
            {selectedTypeConfig.label} Assessment Includes:
          </h4>
          <ul className="grid grid-cols-2 gap-2 text-sm text-gray-600">
            {selectedTypeConfig.includes.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // Render processing step
  const renderProcessingStep = () => (
    <div className="text-center py-12">
      <div className="relative">
        <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-blue-600 mx-auto"></div>
        <span className="absolute inset-0 flex items-center justify-center text-3xl">
          {selectedTypeConfig?.icon}
        </span>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mt-8">Running Assessment...</h2>
      <p className="text-gray-600 mt-2">
        Analyzing your organization&apos;s data. This may take a few minutes.
      </p>

      {statusData?.progress !== undefined && (
        <div className="mt-6 max-w-xs mx-auto">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{statusData.progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${statusData.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-8 space-y-2 text-sm text-gray-500">
        <p className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Collecting data from connected sources
        </p>
        <p className="flex items-center justify-center gap-2">
          <div className="animate-pulse w-4 h-4 bg-blue-500 rounded-full"></div>
          Running assessment algorithms
        </p>
        <p className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
          Generating recommendations
        </p>
      </div>
    </div>
  );

  // Render complete step
  const renderCompleteStep = () => (
    <div className="text-center py-12">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mt-6">Assessment Complete!</h2>
      <p className="text-gray-600 mt-2">
        Your {selectedTypeConfig?.label} assessment is ready to view.
      </p>

      {statusData?.overallScore !== undefined && statusData.overallScore !== null && (
        <div className="mt-6">
          <div className="text-5xl font-bold text-blue-600">{statusData.overallScore}%</div>
          <div className="text-gray-600">Overall Score</div>
        </div>
      )}

      <button
        onClick={handleViewResults}
        className="mt-8 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        View Results
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">New Assessment</h1>
          <p className="text-gray-600 mt-1">
            Run a readiness assessment to evaluate your organization
          </p>
        </div>

        <div className="p-6">
          {step === 'type' && renderTypeStep()}
          {step === 'options' && renderOptionsStep()}
          {step === 'processing' && renderProcessingStep()}
          {step === 'complete' && renderCompleteStep()}
        </div>

        {(step === 'type' || step === 'options') && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={step === 'type' ? handleCancel : handleBack}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              {step === 'type' ? 'Cancel' : 'Back'}
            </button>
            <div className="flex items-center gap-3">
              {step === 'type' ? (
                <button
                  onClick={handleNext}
                  disabled={!selectedType}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={!assessmentName.trim() || createAssessment.isPending}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {createAssessment.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Starting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Start Assessment
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NewAssessmentWizard;
