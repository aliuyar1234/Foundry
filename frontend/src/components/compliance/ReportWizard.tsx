/**
 * Report Wizard Component
 * T200 - Step-by-step compliance report generator
 *
 * Wizard interface for configuring and generating reports
 */

import React, { useState, useEffect } from 'react';
import type { ComplianceFramework, ComplianceReportType } from 'shared/types/compliance';

// Types
export interface ReportConfig {
  reportType: ComplianceReportType;
  framework?: ComplianceFramework;
  title?: string;
  description?: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  sections: string[];
  includeEvidence: boolean;
  includeRecommendations: boolean;
  includeCharts: boolean;
  exportFormat: 'pdf' | 'html' | 'json' | 'csv';
  recipients?: string[];
  scheduleDelivery?: {
    enabled: boolean;
    frequency: 'once' | 'weekly' | 'monthly';
    time?: string;
  };
}

interface ReportWizardProps {
  organizationId: string;
  defaultFramework?: ComplianceFramework;
  onComplete: (reportId: string) => void;
  onCancel: () => void;
}

type WizardStep = 'type' | 'scope' | 'sections' | 'options' | 'review';

const REPORT_TYPES: Array<{
  type: ComplianceReportType;
  name: string;
  description: string;
  icon: string;
}> = [
  {
    type: 'status_report',
    name: 'Status Report',
    description: 'Current compliance status across all rules and frameworks',
    icon: '📊',
  },
  {
    type: 'audit_report',
    name: 'Audit Report',
    description: 'Comprehensive audit trail for compliance activities',
    icon: '📋',
  },
  {
    type: 'gap_analysis',
    name: 'Gap Analysis',
    description: 'Identify gaps between current state and requirements',
    icon: '🔍',
  },
  {
    type: 'pre_audit_checklist',
    name: 'Pre-Audit Checklist',
    description: 'Preparation checklist for upcoming audits',
    icon: '✅',
  },
  {
    type: 'violation_report',
    name: 'Violation Report',
    description: 'Summary of all compliance violations',
    icon: '⚠️',
  },
];

const SECTION_OPTIONS = [
  { id: 'summary', name: 'Executive Summary', required: true },
  { id: 'compliance_score', name: 'Compliance Score', required: true },
  { id: 'framework_breakdown', name: 'Framework Breakdown', required: false },
  { id: 'rule_evaluation', name: 'Rule Evaluation Results', required: false },
  { id: 'violations', name: 'Violations', required: false },
  { id: 'evidence', name: 'Evidence Collection', required: false },
  { id: 'trends', name: 'Historical Trends', required: false },
  { id: 'recommendations', name: 'Recommendations', required: false },
  { id: 'action_items', name: 'Action Items', required: false },
  { id: 'appendix', name: 'Appendix', required: false },
];

const DEFAULT_CONFIG: ReportConfig = {
  reportType: 'status_report',
  dateRange: {
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  },
  sections: ['summary', 'compliance_score', 'framework_breakdown'],
  includeEvidence: false,
  includeRecommendations: true,
  includeCharts: true,
  exportFormat: 'pdf',
};

export function ReportWizard({
  organizationId,
  defaultFramework,
  onComplete,
  onCancel,
}: ReportWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('type');
  const [config, setConfig] = useState<ReportConfig>({
    ...DEFAULT_CONFIG,
    framework: defaultFramework,
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);

  const steps: WizardStep[] = ['type', 'scope', 'sections', 'options', 'review'];

  const currentStepIndex = steps.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const updateConfig = (updates: Partial<ReportConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (!isLastStep) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  const prevStep = () => {
    if (!isFirstStep) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);

      const response = await fetch('/api/compliance/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          ...config,
          startDate: config.dateRange.startDate,
          endDate: config.dateRange.endDate,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate report');

      const data = await response.json();
      onComplete(data.report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const fetchPreview = async () => {
    try {
      const response = await fetch('/api/compliance/reports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          ...config,
          startDate: config.dateRange.startDate,
          endDate: config.dateRange.endDate,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPreviewData(data.preview);
      }
    } catch {
      // Preview is optional
    }
  };

  useEffect(() => {
    if (currentStep === 'review') {
      fetchPreview();
    }
  }, [currentStep]);

  return (
    <div className="report-wizard">
      {/* Progress Bar */}
      <div className="wizard-progress">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`progress-step ${
              index < currentStepIndex ? 'completed' :
              index === currentStepIndex ? 'active' : ''
            }`}
          >
            <div className="step-indicator">
              {index < currentStepIndex ? '✓' : index + 1}
            </div>
            <span className="step-label">
              {step.charAt(0).toUpperCase() + step.slice(1).replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Step Content */}
      <div className="wizard-content">
        {currentStep === 'type' && (
          <ReportTypeStep
            selectedType={config.reportType}
            onSelect={(type) => updateConfig({ reportType: type })}
          />
        )}

        {currentStep === 'scope' && (
          <ReportScopeStep
            config={config}
            onUpdate={updateConfig}
          />
        )}

        {currentStep === 'sections' && (
          <ReportSectionsStep
            selectedSections={config.sections}
            reportType={config.reportType}
            onUpdate={(sections) => updateConfig({ sections })}
          />
        )}

        {currentStep === 'options' && (
          <ReportOptionsStep
            config={config}
            onUpdate={updateConfig}
          />
        )}

        {currentStep === 'review' && (
          <ReportReviewStep
            config={config}
            previewData={previewData}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="wizard-navigation">
        <button
          onClick={onCancel}
          className="btn btn-link"
        >
          Cancel
        </button>

        <div className="nav-buttons">
          {!isFirstStep && (
            <button onClick={prevStep} className="btn btn-secondary">
              Back
            </button>
          )}

          {isLastStep ? (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn btn-primary"
            >
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          ) : (
            <button onClick={nextStep} className="btn btn-primary">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 1: Report Type Selection
interface ReportTypeStepProps {
  selectedType: ComplianceReportType;
  onSelect: (type: ComplianceReportType) => void;
}

function ReportTypeStep({ selectedType, onSelect }: ReportTypeStepProps) {
  return (
    <div className="wizard-step type-step">
      <h2>Select Report Type</h2>
      <p className="step-description">
        Choose the type of compliance report you want to generate.
      </p>

      <div className="report-type-grid">
        {REPORT_TYPES.map((type) => (
          <div
            key={type.type}
            className={`type-card ${selectedType === type.type ? 'selected' : ''}`}
            onClick={() => onSelect(type.type)}
          >
            <div className="type-icon">{type.icon}</div>
            <h3>{type.name}</h3>
            <p>{type.description}</p>
            <input
              type="radio"
              name="reportType"
              checked={selectedType === type.type}
              onChange={() => onSelect(type.type)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 2: Report Scope
interface ReportScopeStepProps {
  config: ReportConfig;
  onUpdate: (updates: Partial<ReportConfig>) => void;
}

function ReportScopeStep({ config, onUpdate }: ReportScopeStepProps) {
  const frameworks: ComplianceFramework[] = ['SOX', 'GDPR', 'ISO27001', 'HIPAA', 'PCI_DSS', 'SOC2', 'CUSTOM'];

  return (
    <div className="wizard-step scope-step">
      <h2>Define Report Scope</h2>
      <p className="step-description">
        Set the framework, date range, and other scope parameters.
      </p>

      <div className="form-group">
        <label htmlFor="framework">Compliance Framework</label>
        <select
          id="framework"
          value={config.framework || ''}
          onChange={(e) => onUpdate({
            framework: e.target.value ? e.target.value as ComplianceFramework : undefined,
          })}
        >
          <option value="">All Frameworks</option>
          {frameworks.map((fw) => (
            <option key={fw} value={fw}>{fw}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="title">Report Title (optional)</label>
        <input
          id="title"
          type="text"
          value={config.title || ''}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="e.g., Q4 2024 Compliance Report"
        />
      </div>

      <div className="form-group">
        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          value={config.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={3}
          placeholder="Brief description of the report's purpose..."
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="startDate">Start Date</label>
          <input
            id="startDate"
            type="date"
            value={config.dateRange.startDate}
            onChange={(e) => onUpdate({
              dateRange: { ...config.dateRange, startDate: e.target.value },
            })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="endDate">End Date</label>
          <input
            id="endDate"
            type="date"
            value={config.dateRange.endDate}
            onChange={(e) => onUpdate({
              dateRange: { ...config.dateRange, endDate: e.target.value },
            })}
          />
        </div>
      </div>

      <div className="quick-ranges">
        <span>Quick select:</span>
        {[
          { label: 'Last 7 days', days: 7 },
          { label: 'Last 30 days', days: 30 },
          { label: 'Last 90 days', days: 90 },
          { label: 'Year to date', days: -1 },
        ].map(({ label, days }) => (
          <button
            key={label}
            type="button"
            className="btn btn-small btn-link"
            onClick={() => {
              const end = new Date();
              const start = days === -1
                ? new Date(end.getFullYear(), 0, 1)
                : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
              onUpdate({
                dateRange: {
                  startDate: start.toISOString().split('T')[0],
                  endDate: end.toISOString().split('T')[0],
                },
              });
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Step 3: Report Sections
interface ReportSectionsStepProps {
  selectedSections: string[];
  reportType: ComplianceReportType;
  onUpdate: (sections: string[]) => void;
}

function ReportSectionsStep({ selectedSections, reportType, onUpdate }: ReportSectionsStepProps) {
  const handleToggle = (sectionId: string, required: boolean) => {
    if (required) return;

    const newSections = selectedSections.includes(sectionId)
      ? selectedSections.filter((s) => s !== sectionId)
      : [...selectedSections, sectionId];

    onUpdate(newSections);
  };

  const handleSelectAll = () => {
    onUpdate(SECTION_OPTIONS.map((s) => s.id));
  };

  const handleSelectRequired = () => {
    onUpdate(SECTION_OPTIONS.filter((s) => s.required).map((s) => s.id));
  };

  return (
    <div className="wizard-step sections-step">
      <h2>Select Report Sections</h2>
      <p className="step-description">
        Choose which sections to include in your {reportType.replace('_', ' ')} report.
      </p>

      <div className="section-actions">
        <button onClick={handleSelectAll} className="btn btn-small btn-link">
          Select All
        </button>
        <button onClick={handleSelectRequired} className="btn btn-small btn-link">
          Required Only
        </button>
      </div>

      <div className="sections-list">
        {SECTION_OPTIONS.map((section) => (
          <div
            key={section.id}
            className={`section-item ${selectedSections.includes(section.id) ? 'selected' : ''} ${section.required ? 'required' : ''}`}
            onClick={() => handleToggle(section.id, section.required)}
          >
            <input
              type="checkbox"
              checked={selectedSections.includes(section.id)}
              disabled={section.required}
              onChange={() => handleToggle(section.id, section.required)}
            />
            <span className="section-name">{section.name}</span>
            {section.required && <span className="required-badge">Required</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 4: Report Options
interface ReportOptionsStepProps {
  config: ReportConfig;
  onUpdate: (updates: Partial<ReportConfig>) => void;
}

function ReportOptionsStep({ config, onUpdate }: ReportOptionsStepProps) {
  return (
    <div className="wizard-step options-step">
      <h2>Configure Options</h2>
      <p className="step-description">
        Set additional options for your report.
      </p>

      <div className="options-section">
        <h3>Content Options</h3>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={config.includeEvidence}
            onChange={(e) => onUpdate({ includeEvidence: e.target.checked })}
          />
          <span className="option-label">Include Evidence</span>
          <span className="option-description">
            Attach collected evidence to support compliance findings
          </span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={config.includeRecommendations}
            onChange={(e) => onUpdate({ includeRecommendations: e.target.checked })}
          />
          <span className="option-label">Include Recommendations</span>
          <span className="option-description">
            Add actionable recommendations based on findings
          </span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={config.includeCharts}
            onChange={(e) => onUpdate({ includeCharts: e.target.checked })}
          />
          <span className="option-label">Include Charts & Visualizations</span>
          <span className="option-description">
            Add visual representations of compliance data
          </span>
        </label>
      </div>

      <div className="options-section">
        <h3>Export Format</h3>

        <div className="format-options">
          {[
            { value: 'pdf', label: 'PDF', icon: '📄' },
            { value: 'html', label: 'HTML', icon: '🌐' },
            { value: 'json', label: 'JSON', icon: '📋' },
            { value: 'csv', label: 'CSV', icon: '📊' },
          ].map((format) => (
            <label
              key={format.value}
              className={`format-option ${config.exportFormat === format.value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="exportFormat"
                value={format.value}
                checked={config.exportFormat === format.value}
                onChange={(e) => onUpdate({
                  exportFormat: e.target.value as ReportConfig['exportFormat'],
                })}
              />
              <span className="format-icon">{format.icon}</span>
              <span className="format-label">{format.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="options-section">
        <h3>Delivery Options</h3>

        <div className="form-group">
          <label htmlFor="recipients">Email Recipients (optional)</label>
          <input
            id="recipients"
            type="text"
            value={config.recipients?.join(', ') || ''}
            onChange={(e) => onUpdate({
              recipients: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })}
            placeholder="email@example.com, another@example.com"
          />
        </div>
      </div>
    </div>
  );
}

// Step 5: Review
interface ReportReviewStepProps {
  config: ReportConfig;
  previewData: Record<string, unknown> | null;
}

function ReportReviewStep({ config, previewData }: ReportReviewStepProps) {
  const reportType = REPORT_TYPES.find((t) => t.type === config.reportType);

  return (
    <div className="wizard-step review-step">
      <h2>Review & Generate</h2>
      <p className="step-description">
        Review your report configuration before generating.
      </p>

      <div className="review-summary">
        <div className="summary-section">
          <h3>Report Type</h3>
          <div className="summary-item">
            <span className="item-icon">{reportType?.icon}</span>
            <span className="item-value">{reportType?.name}</span>
          </div>
        </div>

        <div className="summary-section">
          <h3>Scope</h3>
          <dl className="summary-list">
            <dt>Framework</dt>
            <dd>{config.framework || 'All Frameworks'}</dd>
            <dt>Date Range</dt>
            <dd>{config.dateRange.startDate} to {config.dateRange.endDate}</dd>
            {config.title && (
              <>
                <dt>Title</dt>
                <dd>{config.title}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="summary-section">
          <h3>Sections ({config.sections.length})</h3>
          <ul className="section-list">
            {config.sections.map((sectionId) => {
              const section = SECTION_OPTIONS.find((s) => s.id === sectionId);
              return <li key={sectionId}>{section?.name || sectionId}</li>;
            })}
          </ul>
        </div>

        <div className="summary-section">
          <h3>Options</h3>
          <ul className="options-list">
            <li>Include Evidence: {config.includeEvidence ? 'Yes' : 'No'}</li>
            <li>Include Recommendations: {config.includeRecommendations ? 'Yes' : 'No'}</li>
            <li>Include Charts: {config.includeCharts ? 'Yes' : 'No'}</li>
            <li>Export Format: {config.exportFormat.toUpperCase()}</li>
          </ul>
        </div>

        {config.recipients && config.recipients.length > 0 && (
          <div className="summary-section">
            <h3>Recipients</h3>
            <ul className="recipients-list">
              {config.recipients.map((email) => (
                <li key={email}>{email}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {previewData && (
        <div className="preview-section">
          <h3>Preview</h3>
          <div className="preview-stats">
            <div className="stat">
              <span className="value">{(previewData.rulesCount as number) || 0}</span>
              <span className="label">Rules</span>
            </div>
            <div className="stat">
              <span className="value">{(previewData.violationsCount as number) || 0}</span>
              <span className="label">Violations</span>
            </div>
            <div className="stat">
              <span className="value">{(previewData.evidenceCount as number) || 0}</span>
              <span className="label">Evidence Items</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportWizard;
