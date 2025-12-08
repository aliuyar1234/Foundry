/**
 * Rule Editor Component
 * T197 - Create and edit compliance rules
 *
 * Form-based editor for compliance rule configuration
 */

import React, { useState, useEffect } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface RuleConfig {
  id?: string;
  name: string;
  description: string;
  framework: ComplianceFramework;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  evaluationType: 'query' | 'threshold' | 'pattern' | 'workflow' | 'custom';
  evaluationConfig: {
    query?: string;
    table?: string;
    conditions?: Array<{ field: string; operator: string; value: unknown }>;
    threshold?: { min?: number; max?: number; target?: number };
    pattern?: string;
    workflowId?: string;
    customEvaluator?: string;
    customParams?: Record<string, unknown>;
  };
  schedule: {
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'on_demand';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  notifications: {
    onFailure: boolean;
    onSuccess: boolean;
    recipients: string[];
    channels: Array<'email' | 'slack' | 'webhook'>;
  };
  remediation?: {
    autoRemediate: boolean;
    actions: Array<{ type: string; config: Record<string, unknown> }>;
  };
  metadata: {
    tags: string[];
    owner?: string;
    references: string[];
  };
}

interface RuleEditorProps {
  organizationId: string;
  rule?: RuleConfig;
  onSave: (rule: RuleConfig) => void;
  onCancel: () => void;
  frameworks?: ComplianceFramework[];
}

const FRAMEWORKS: ComplianceFramework[] = ['SOX', 'GDPR', 'ISO27001', 'HIPAA', 'PCI_DSS', 'SOC2', 'CUSTOM'];

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical', description: 'Immediate action required' },
  { value: 'high', label: 'High', description: 'Urgent attention needed' },
  { value: 'medium', label: 'Medium', description: 'Should be addressed soon' },
  { value: 'low', label: 'Low', description: 'Address when convenient' },
];

const EVALUATION_TYPES = [
  { value: 'query', label: 'Database Query', description: 'Evaluate based on database query results' },
  { value: 'threshold', label: 'Threshold Check', description: 'Check if value meets threshold' },
  { value: 'pattern', label: 'Pattern Match', description: 'Match against regex pattern' },
  { value: 'workflow', label: 'Workflow Check', description: 'Verify workflow compliance' },
  { value: 'custom', label: 'Custom Evaluator', description: 'Use custom evaluation logic' },
];

const SCHEDULE_FREQUENCIES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'on_demand', label: 'On Demand' },
];

const DEFAULT_RULE: RuleConfig = {
  name: '',
  description: '',
  framework: 'CUSTOM',
  category: '',
  severity: 'medium',
  enabled: true,
  evaluationType: 'query',
  evaluationConfig: {},
  schedule: { frequency: 'daily' },
  notifications: {
    onFailure: true,
    onSuccess: false,
    recipients: [],
    channels: ['email'],
  },
  metadata: { tags: [], references: [] },
};

export function RuleEditor({
  organizationId,
  rule,
  onSave,
  onCancel,
  frameworks = FRAMEWORKS,
}: RuleEditorProps) {
  const [formData, setFormData] = useState<RuleConfig>(rule || DEFAULT_RULE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'basic' | 'evaluation' | 'schedule' | 'notifications' | 'advanced'>('basic');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setFormData(rule);
    }
  }, [rule]);

  const updateField = <K extends keyof RuleConfig>(field: K, value: RuleConfig[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const updateNestedField = <K extends keyof RuleConfig>(
    parent: K,
    field: string,
    value: unknown
  ) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...(prev[parent] as Record<string, unknown>),
        [field]: value,
      },
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Rule name is required';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (!formData.category.trim()) {
      newErrors.category = 'Category is required';
    }

    // Evaluation-specific validation
    if (formData.evaluationType === 'query' && !formData.evaluationConfig.query) {
      newErrors.query = 'Query is required for query-based evaluation';
    }
    if (formData.evaluationType === 'custom' && !formData.evaluationConfig.customEvaluator) {
      newErrors.customEvaluator = 'Custom evaluator is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);
    try {
      const method = formData.id ? 'PATCH' : 'POST';
      const url = formData.id
        ? `/api/compliance/rules/${formData.id}`
        : '/api/compliance/rules';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, organizationId }),
      });

      if (!response.ok) throw new Error('Failed to save rule');

      const data = await response.json();
      onSave(data.rule);
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="rule-editor" onSubmit={handleSubmit}>
      <header className="editor-header">
        <h2>{formData.id ? 'Edit Rule' : 'Create New Rule'}</h2>
        <div className="header-actions">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </header>

      {/* Error Display */}
      {errors.submit && (
        <div className="error-banner">
          <span>{errors.submit}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="editor-tabs">
        {(['basic', 'evaluation', 'schedule', 'notifications', 'advanced'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="editor-content">
        {/* Basic Tab */}
        {activeTab === 'basic' && (
          <div className="tab-panel basic-panel">
            <div className="form-group">
              <label htmlFor="name">Rule Name *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Enter rule name"
                className={errors.name ? 'error' : ''}
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe what this rule checks"
                rows={3}
                className={errors.description ? 'error' : ''}
              />
              {errors.description && <span className="error-text">{errors.description}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="framework">Framework *</label>
                <select
                  id="framework"
                  value={formData.framework}
                  onChange={(e) => updateField('framework', e.target.value as ComplianceFramework)}
                >
                  {frameworks.map((fw) => (
                    <option key={fw} value={fw}>{fw}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="category">Category *</label>
                <input
                  id="category"
                  type="text"
                  value={formData.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  placeholder="e.g., Access Control, Data Protection"
                  className={errors.category ? 'error' : ''}
                />
                {errors.category && <span className="error-text">{errors.category}</span>}
              </div>
            </div>

            <div className="form-group">
              <label>Severity *</label>
              <div className="severity-options">
                {SEVERITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`severity-option ${formData.severity === opt.value ? 'selected' : ''} ${opt.value}`}
                  >
                    <input
                      type="radio"
                      name="severity"
                      value={opt.value}
                      checked={formData.severity === opt.value}
                      onChange={(e) => updateField('severity', e.target.value as RuleConfig['severity'])}
                    />
                    <span className="option-label">{opt.label}</span>
                    <span className="option-desc">{opt.description}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => updateField('enabled', e.target.checked)}
                />
                <span>Rule Enabled</span>
              </label>
            </div>
          </div>
        )}

        {/* Evaluation Tab */}
        {activeTab === 'evaluation' && (
          <div className="tab-panel evaluation-panel">
            <div className="form-group">
              <label>Evaluation Type *</label>
              <div className="evaluation-types">
                {EVALUATION_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className={`eval-type-option ${formData.evaluationType === type.value ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="evaluationType"
                      value={type.value}
                      checked={formData.evaluationType === type.value}
                      onChange={(e) => updateField('evaluationType', e.target.value as RuleConfig['evaluationType'])}
                    />
                    <span className="type-label">{type.label}</span>
                    <span className="type-desc">{type.description}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Query Configuration */}
            {formData.evaluationType === 'query' && (
              <div className="eval-config query-config">
                <div className="form-group">
                  <label htmlFor="query">SQL Query *</label>
                  <textarea
                    id="query"
                    value={formData.evaluationConfig.query || ''}
                    onChange={(e) => updateNestedField('evaluationConfig', 'query', e.target.value)}
                    placeholder="SELECT COUNT(*) FROM..."
                    rows={5}
                    className={`code-input ${errors.query ? 'error' : ''}`}
                  />
                  {errors.query && <span className="error-text">{errors.query}</span>}
                </div>
              </div>
            )}

            {/* Threshold Configuration */}
            {formData.evaluationType === 'threshold' && (
              <div className="eval-config threshold-config">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="threshold-min">Minimum</label>
                    <input
                      id="threshold-min"
                      type="number"
                      value={formData.evaluationConfig.threshold?.min ?? ''}
                      onChange={(e) => updateNestedField('evaluationConfig', 'threshold', {
                        ...formData.evaluationConfig.threshold,
                        min: e.target.value ? Number(e.target.value) : undefined,
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="threshold-max">Maximum</label>
                    <input
                      id="threshold-max"
                      type="number"
                      value={formData.evaluationConfig.threshold?.max ?? ''}
                      onChange={(e) => updateNestedField('evaluationConfig', 'threshold', {
                        ...formData.evaluationConfig.threshold,
                        max: e.target.value ? Number(e.target.value) : undefined,
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="threshold-target">Target</label>
                    <input
                      id="threshold-target"
                      type="number"
                      value={formData.evaluationConfig.threshold?.target ?? ''}
                      onChange={(e) => updateNestedField('evaluationConfig', 'threshold', {
                        ...formData.evaluationConfig.threshold,
                        target: e.target.value ? Number(e.target.value) : undefined,
                      })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Pattern Configuration */}
            {formData.evaluationType === 'pattern' && (
              <div className="eval-config pattern-config">
                <div className="form-group">
                  <label htmlFor="pattern">Regex Pattern *</label>
                  <input
                    id="pattern"
                    type="text"
                    value={formData.evaluationConfig.pattern || ''}
                    onChange={(e) => updateNestedField('evaluationConfig', 'pattern', e.target.value)}
                    placeholder="^[A-Z].*"
                    className="code-input"
                  />
                </div>
              </div>
            )}

            {/* Custom Evaluator Configuration */}
            {formData.evaluationType === 'custom' && (
              <div className="eval-config custom-config">
                <div className="form-group">
                  <label htmlFor="customEvaluator">Evaluator Name *</label>
                  <input
                    id="customEvaluator"
                    type="text"
                    value={formData.evaluationConfig.customEvaluator || ''}
                    onChange={(e) => updateNestedField('evaluationConfig', 'customEvaluator', e.target.value)}
                    placeholder="custom_evaluator_name"
                    className={errors.customEvaluator ? 'error' : ''}
                  />
                  {errors.customEvaluator && <span className="error-text">{errors.customEvaluator}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="customParams">Parameters (JSON)</label>
                  <textarea
                    id="customParams"
                    value={JSON.stringify(formData.evaluationConfig.customParams || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const params = JSON.parse(e.target.value);
                        updateNestedField('evaluationConfig', 'customParams', params);
                      } catch {
                        // Invalid JSON, keep the text
                      }
                    }}
                    rows={4}
                    className="code-input"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="tab-panel schedule-panel">
            <div className="form-group">
              <label htmlFor="frequency">Evaluation Frequency</label>
              <select
                id="frequency"
                value={formData.schedule.frequency}
                onChange={(e) => updateNestedField('schedule', 'frequency', e.target.value)}
              >
                {SCHEDULE_FREQUENCIES.map((freq) => (
                  <option key={freq.value} value={freq.value}>{freq.label}</option>
                ))}
              </select>
            </div>

            {formData.schedule.frequency === 'daily' && (
              <div className="form-group">
                <label htmlFor="time">Time</label>
                <input
                  id="time"
                  type="time"
                  value={formData.schedule.time || '00:00'}
                  onChange={(e) => updateNestedField('schedule', 'time', e.target.value)}
                />
              </div>
            )}

            {formData.schedule.frequency === 'weekly' && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="dayOfWeek">Day of Week</label>
                  <select
                    id="dayOfWeek"
                    value={formData.schedule.dayOfWeek ?? 1}
                    onChange={(e) => updateNestedField('schedule', 'dayOfWeek', Number(e.target.value))}
                  >
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="weeklyTime">Time</label>
                  <input
                    id="weeklyTime"
                    type="time"
                    value={formData.schedule.time || '00:00'}
                    onChange={(e) => updateNestedField('schedule', 'time', e.target.value)}
                  />
                </div>
              </div>
            )}

            {formData.schedule.frequency === 'monthly' && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="dayOfMonth">Day of Month</label>
                  <select
                    id="dayOfMonth"
                    value={formData.schedule.dayOfMonth ?? 1}
                    onChange={(e) => updateNestedField('schedule', 'dayOfMonth', Number(e.target.value))}
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="monthlyTime">Time</label>
                  <input
                    id="monthlyTime"
                    type="time"
                    value={formData.schedule.time || '00:00'}
                    onChange={(e) => updateNestedField('schedule', 'time', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="tab-panel notifications-panel">
            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={formData.notifications.onFailure}
                  onChange={(e) => updateNestedField('notifications', 'onFailure', e.target.checked)}
                />
                <span>Notify on Failure</span>
              </label>
            </div>

            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={formData.notifications.onSuccess}
                  onChange={(e) => updateNestedField('notifications', 'onSuccess', e.target.checked)}
                />
                <span>Notify on Success</span>
              </label>
            </div>

            <div className="form-group">
              <label>Notification Channels</label>
              <div className="checkbox-group">
                {(['email', 'slack', 'webhook'] as const).map((channel) => (
                  <label key={channel} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.notifications.channels.includes(channel)}
                      onChange={(e) => {
                        const channels = e.target.checked
                          ? [...formData.notifications.channels, channel]
                          : formData.notifications.channels.filter((c) => c !== channel);
                        updateNestedField('notifications', 'channels', channels);
                      }}
                    />
                    <span>{channel.charAt(0).toUpperCase() + channel.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="recipients">Recipients (comma-separated emails)</label>
              <input
                id="recipients"
                type="text"
                value={formData.notifications.recipients.join(', ')}
                onChange={(e) => updateNestedField(
                  'notifications',
                  'recipients',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )}
                placeholder="user@example.com, admin@example.com"
              />
            </div>
          </div>
        )}

        {/* Advanced Tab */}
        {activeTab === 'advanced' && (
          <div className="tab-panel advanced-panel">
            <div className="form-group">
              <label htmlFor="tags">Tags (comma-separated)</label>
              <input
                id="tags"
                type="text"
                value={formData.metadata.tags.join(', ')}
                onChange={(e) => updateNestedField(
                  'metadata',
                  'tags',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )}
                placeholder="security, data-protection, audit"
              />
            </div>

            <div className="form-group">
              <label htmlFor="owner">Owner</label>
              <input
                id="owner"
                type="text"
                value={formData.metadata.owner || ''}
                onChange={(e) => updateNestedField('metadata', 'owner', e.target.value)}
                placeholder="security-team@example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="references">References (comma-separated URLs)</label>
              <input
                id="references"
                type="text"
                value={formData.metadata.references.join(', ')}
                onChange={(e) => updateNestedField(
                  'metadata',
                  'references',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )}
                placeholder="https://example.com/policy"
              />
            </div>

            <div className="form-group">
              <h4>Auto-Remediation</h4>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={formData.remediation?.autoRemediate ?? false}
                  onChange={(e) => updateField('remediation', {
                    autoRemediate: e.target.checked,
                    actions: formData.remediation?.actions || [],
                  })}
                />
                <span>Enable Auto-Remediation</span>
              </label>
              <p className="help-text">
                Automatically execute remediation actions when this rule fails.
              </p>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

export default RuleEditor;
