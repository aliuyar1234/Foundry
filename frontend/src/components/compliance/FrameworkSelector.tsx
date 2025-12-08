/**
 * Framework Selector Component
 * T198 - Select and configure compliance frameworks
 *
 * Multi-select for compliance frameworks with configuration
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface FrameworkConfig {
  framework: ComplianceFramework;
  enabled: boolean;
  priority: number;
  customSettings?: Record<string, unknown>;
  rulesCount: number;
  enabledRulesCount: number;
  lastEvaluated?: string;
  score?: number;
}

export interface FrameworkInfo {
  id: ComplianceFramework;
  name: string;
  description: string;
  icon: string;
  categories: string[];
  defaultPriority: number;
}

interface FrameworkSelectorProps {
  organizationId: string;
  selectedFrameworks?: ComplianceFramework[];
  onSelectionChange?: (frameworks: ComplianceFramework[]) => void;
  onFrameworkConfigure?: (framework: ComplianceFramework, config: FrameworkConfig) => void;
  mode?: 'single' | 'multi';
  showDetails?: boolean;
  showScores?: boolean;
}

const FRAMEWORK_INFO: Record<ComplianceFramework, FrameworkInfo> = {
  SOX: {
    id: 'SOX',
    name: 'Sarbanes-Oxley (SOX)',
    description: 'Financial reporting and internal controls compliance',
    icon: '📊',
    categories: ['Financial Controls', 'Audit Trail', 'Access Management', 'Change Control'],
    defaultPriority: 1,
  },
  GDPR: {
    id: 'GDPR',
    name: 'General Data Protection Regulation',
    description: 'EU data protection and privacy compliance',
    icon: '🔒',
    categories: ['Data Protection', 'Consent Management', 'Data Subject Rights', 'Breach Notification'],
    defaultPriority: 2,
  },
  ISO27001: {
    id: 'ISO27001',
    name: 'ISO 27001',
    description: 'Information security management system',
    icon: '🛡️',
    categories: ['Security Policies', 'Access Control', 'Cryptography', 'Operations Security'],
    defaultPriority: 3,
  },
  HIPAA: {
    id: 'HIPAA',
    name: 'HIPAA',
    description: 'Healthcare information privacy and security',
    icon: '🏥',
    categories: ['PHI Protection', 'Access Controls', 'Audit Controls', 'Transmission Security'],
    defaultPriority: 4,
  },
  PCI_DSS: {
    id: 'PCI_DSS',
    name: 'PCI DSS',
    description: 'Payment card industry data security standard',
    icon: '💳',
    categories: ['Network Security', 'Data Protection', 'Access Control', 'Monitoring'],
    defaultPriority: 5,
  },
  SOC2: {
    id: 'SOC2',
    name: 'SOC 2',
    description: 'Service organization control standards',
    icon: '✅',
    categories: ['Security', 'Availability', 'Processing Integrity', 'Confidentiality', 'Privacy'],
    defaultPriority: 6,
  },
  CUSTOM: {
    id: 'CUSTOM',
    name: 'Custom Framework',
    description: 'Organization-specific compliance rules',
    icon: '⚙️',
    categories: ['Custom Rules'],
    defaultPriority: 99,
  },
};

export function FrameworkSelector({
  organizationId,
  selectedFrameworks = [],
  onSelectionChange,
  onFrameworkConfigure,
  mode = 'multi',
  showDetails = true,
  showScores = true,
}: FrameworkSelectorProps) {
  const [frameworks, setFrameworks] = useState<FrameworkConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<ComplianceFramework>>(new Set(selectedFrameworks));
  const [configuring, setConfiguring] = useState<ComplianceFramework | null>(null);
  const [expandedFramework, setExpandedFramework] = useState<ComplianceFramework | null>(null);

  const fetchFrameworks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/compliance/frameworks?organizationId=${organizationId}`);
      if (!response.ok) throw new Error('Failed to fetch frameworks');
      const data = await response.json();

      // Merge API data with static framework info
      const configs: FrameworkConfig[] = Object.keys(FRAMEWORK_INFO).map((fw) => {
        const apiData = data.frameworks?.find((f: FrameworkConfig) => f.framework === fw);
        return {
          framework: fw as ComplianceFramework,
          enabled: apiData?.enabled ?? false,
          priority: apiData?.priority ?? FRAMEWORK_INFO[fw as ComplianceFramework].defaultPriority,
          rulesCount: apiData?.rulesCount ?? 0,
          enabledRulesCount: apiData?.enabledRulesCount ?? 0,
          lastEvaluated: apiData?.lastEvaluated,
          score: apiData?.score,
        };
      });

      setFrameworks(configs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchFrameworks();
  }, [fetchFrameworks]);

  useEffect(() => {
    setSelected(new Set(selectedFrameworks));
  }, [selectedFrameworks]);

  const handleToggle = (framework: ComplianceFramework) => {
    const newSelected = new Set(selected);

    if (mode === 'single') {
      newSelected.clear();
      if (!selected.has(framework)) {
        newSelected.add(framework);
      }
    } else {
      if (newSelected.has(framework)) {
        newSelected.delete(framework);
      } else {
        newSelected.add(framework);
      }
    }

    setSelected(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  const handleEnableFramework = async (framework: ComplianceFramework, enabled: boolean) => {
    try {
      const response = await fetch(`/api/compliance/frameworks/${framework}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, enabled }),
      });

      if (!response.ok) throw new Error('Failed to update framework');

      setFrameworks((prev) =>
        prev.map((f) => (f.framework === framework ? { ...f, enabled } : f))
      );

      if (enabled && !selected.has(framework)) {
        handleToggle(framework);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleSaveConfig = async (framework: ComplianceFramework, config: Partial<FrameworkConfig>) => {
    try {
      const response = await fetch(`/api/compliance/frameworks/${framework}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, ...config }),
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      const updated = await response.json();

      setFrameworks((prev) =>
        prev.map((f) => (f.framework === framework ? { ...f, ...updated.framework } : f))
      );

      onFrameworkConfigure?.(framework, { ...frameworks.find((f) => f.framework === framework)!, ...config });
      setConfiguring(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const getScoreClass = (score?: number): string => {
    if (score === undefined) return 'unknown';
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  };

  if (loading) {
    return (
      <div className="framework-selector loading">
        <div className="spinner" />
        <p>Loading frameworks...</p>
      </div>
    );
  }

  return (
    <div className="framework-selector">
      {/* Header */}
      <header className="selector-header">
        <h3>Compliance Frameworks</h3>
        <span className="selected-count">
          {selected.size} of {frameworks.length} selected
        </span>
      </header>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Framework List */}
      <div className="frameworks-list">
        {frameworks
          .sort((a, b) => a.priority - b.priority)
          .map((config) => {
            const info = FRAMEWORK_INFO[config.framework];
            const isSelected = selected.has(config.framework);
            const isExpanded = expandedFramework === config.framework;

            return (
              <div
                key={config.framework}
                className={`framework-item ${isSelected ? 'selected' : ''} ${config.enabled ? 'enabled' : 'disabled'}`}
              >
                <div className="framework-main" onClick={() => handleToggle(config.framework)}>
                  <div className="framework-icon">{info.icon}</div>

                  <div className="framework-info">
                    <h4 className="framework-name">{info.name}</h4>
                    {showDetails && (
                      <p className="framework-description">{info.description}</p>
                    )}
                  </div>

                  {showScores && config.score !== undefined && (
                    <div className={`framework-score ${getScoreClass(config.score)}`}>
                      <span className="score-value">{config.score}%</span>
                    </div>
                  )}

                  <div className="framework-selection">
                    {mode === 'multi' ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(config.framework)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <input
                        type="radio"
                        name="framework"
                        checked={isSelected}
                        onChange={() => handleToggle(config.framework)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </div>

                {/* Framework Stats */}
                {showDetails && (
                  <div className="framework-stats">
                    <span className="stat">
                      <strong>{config.enabledRulesCount}</strong> / {config.rulesCount} rules
                    </span>
                    {config.lastEvaluated && (
                      <span className="stat">
                        Last checked: {new Date(config.lastEvaluated).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="framework-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`btn btn-small ${config.enabled ? 'btn-success' : ''}`}
                    onClick={() => handleEnableFramework(config.framework, !config.enabled)}
                  >
                    {config.enabled ? 'Enabled' : 'Enable'}
                  </button>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => setExpandedFramework(isExpanded ? null : config.framework)}
                  >
                    {isExpanded ? 'Hide' : 'Details'}
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => setConfiguring(config.framework)}
                  >
                    Configure
                  </button>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="framework-details">
                    <h5>Categories</h5>
                    <div className="category-tags">
                      {info.categories.map((cat) => (
                        <span key={cat} className="category-tag">{cat}</span>
                      ))}
                    </div>

                    {config.customSettings && Object.keys(config.customSettings).length > 0 && (
                      <>
                        <h5>Custom Settings</h5>
                        <pre className="settings-preview">
                          {JSON.stringify(config.customSettings, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Configuration Modal */}
      {configuring && (
        <FrameworkConfigModal
          framework={configuring}
          config={frameworks.find((f) => f.framework === configuring)!}
          info={FRAMEWORK_INFO[configuring]}
          onSave={(config) => handleSaveConfig(configuring, config)}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}

// Framework Configuration Modal
interface FrameworkConfigModalProps {
  framework: ComplianceFramework;
  config: FrameworkConfig;
  info: FrameworkInfo;
  onSave: (config: Partial<FrameworkConfig>) => void;
  onClose: () => void;
}

function FrameworkConfigModal({
  framework,
  config,
  info,
  onSave,
  onClose,
}: FrameworkConfigModalProps) {
  const [priority, setPriority] = useState(config.priority);
  const [customSettings, setCustomSettings] = useState(
    JSON.stringify(config.customSettings || {}, null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const settings = customSettings.trim() ? JSON.parse(customSettings) : undefined;
      onSave({ priority, customSettings: settings });
    } catch {
      setError('Invalid JSON in custom settings');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal framework-config-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            <span className="icon">{info.icon}</span>
            Configure {info.name}
          </h2>
          <button onClick={onClose} className="close-btn">×</button>
        </header>

        <div className="modal-content">
          {error && (
            <div className="error-message">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="priority">Priority</label>
            <input
              id="priority"
              type="number"
              min="1"
              max="99"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <p className="help-text">
              Lower numbers indicate higher priority for evaluation order.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="customSettings">Custom Settings (JSON)</label>
            <textarea
              id="customSettings"
              value={customSettings}
              onChange={(e) => setCustomSettings(e.target.value)}
              rows={8}
              className="code-input"
            />
            <p className="help-text">
              Framework-specific configuration options in JSON format.
            </p>
          </div>

          <div className="info-section">
            <h4>Framework Information</h4>
            <p>{info.description}</p>
            <h5>Categories</h5>
            <div className="category-tags">
              {info.categories.map((cat) => (
                <span key={cat} className="category-tag">{cat}</span>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            Save Configuration
          </button>
        </footer>
      </div>
    </div>
  );
}

// Compact Framework Badge Component
interface FrameworkBadgeProps {
  framework: ComplianceFramework;
  score?: number;
  showIcon?: boolean;
  size?: 'small' | 'medium';
}

export function FrameworkBadge({
  framework,
  score,
  showIcon = true,
  size = 'small',
}: FrameworkBadgeProps) {
  const info = FRAMEWORK_INFO[framework];

  return (
    <span className={`framework-badge ${size}`}>
      {showIcon && <span className="badge-icon">{info.icon}</span>}
      <span className="badge-name">{framework}</span>
      {score !== undefined && (
        <span className="badge-score">{score}%</span>
      )}
    </span>
  );
}

export default FrameworkSelector;
