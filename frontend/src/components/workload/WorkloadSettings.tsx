/**
 * Workload Settings Component
 * T237 - Configure workload management preferences and thresholds
 *
 * Allows users and managers to customize workload alerts, thresholds, and behaviors
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
interface WorkloadThresholds {
  weeklyHoursTarget: number;
  weeklyHoursMax: number;
  dailyHoursMax: number;
  afterHoursThreshold: number;
  weekendWorkThreshold: number;
  meetingLoadMax: number;
  focusTimeMin: number;
  backToBackMax: number;
}

interface BurnoutThresholds {
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  criticalRisk: number;
  trendSensitivity: number;
  warningLeadDays: number;
}

interface AlertSettings {
  enabledWarningTypes: string[];
  escalationDelayHours: number;
  autoAcknowledgeHours: number;
  managerNotificationThreshold: 'low' | 'medium' | 'high' | 'critical';
  teamAlertThreshold: number;
  digestEnabled: boolean;
  digestSchedule: 'daily' | 'weekly';
}

interface IntegrationSettings {
  calendarSync: boolean;
  calendarProvider?: 'google' | 'outlook' | 'apple';
  slackIntegration: boolean;
  slackChannel?: string;
  teamsIntegration: boolean;
  teamsChannel?: string;
  jiraIntegration: boolean;
  githubIntegration: boolean;
}

interface WorkloadSettingsData {
  id: string;
  scope: 'personal' | 'team' | 'organization';
  scopeId: string;
  workloadThresholds: WorkloadThresholds;
  burnoutThresholds: BurnoutThresholds;
  alertSettings: AlertSettings;
  integrationSettings: IntegrationSettings;
  updatedAt: string;
  updatedBy: string;
}

interface WorkloadSettingsProps {
  scope: 'personal' | 'team' | 'organization';
  scopeId: string;
  canEdit?: boolean;
  onSave?: (settings: WorkloadSettingsData) => void;
}

const WARNING_TYPES = [
  { id: 'workload_spike', label: 'Workload Spike', description: 'Sudden increase in assigned work' },
  { id: 'sustained_overload', label: 'Sustained Overload', description: 'Extended period of high workload' },
  { id: 'after_hours_pattern', label: 'After Hours Work', description: 'Regular work outside business hours' },
  { id: 'communication_surge', label: 'Communication Surge', description: 'Excessive messages and notifications' },
  { id: 'deadline_cluster', label: 'Deadline Cluster', description: 'Multiple deadlines in short timeframe' },
  { id: 'isolation_detected', label: 'Isolation', description: 'Reduced team interaction' },
  { id: 'declining_performance', label: 'Declining Performance', description: 'Drop in productivity metrics' },
  { id: 'missed_breaks', label: 'Missed Breaks', description: 'Skipped lunch or break times' },
  { id: 'response_pressure', label: 'Response Pressure', description: 'Fast response expectations' },
  { id: 'burnout_trajectory', label: 'Burnout Trajectory', description: 'Predicted burnout risk increase' },
];

export function WorkloadSettings({
  scope,
  scopeId,
  canEdit = true,
  onSave,
}: WorkloadSettingsProps) {
  const [settings, setSettings] = useState<WorkloadSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'workload' | 'burnout' | 'alerts' | 'integrations'>('workload');
  const [hasChanges, setHasChanges] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workload/settings/${scope}/${scopeId}`);
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Initialize with defaults if no settings exist
      setSettings(getDefaultSettings(scope, scopeId));
    } finally {
      setLoading(false);
    }
  }, [scope, scopeId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/workload/settings/${scope}/${scopeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      const data = await response.json();
      setSettings(data.data);
      setHasChanges(false);
      onSave?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(getDefaultSettings(scope, scopeId));
    setHasChanges(true);
  };

  const updateWorkloadThreshold = <K extends keyof WorkloadThresholds>(
    key: K,
    value: WorkloadThresholds[K]
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      workloadThresholds: { ...settings.workloadThresholds, [key]: value },
    });
    setHasChanges(true);
  };

  const updateBurnoutThreshold = <K extends keyof BurnoutThresholds>(
    key: K,
    value: BurnoutThresholds[K]
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      burnoutThresholds: { ...settings.burnoutThresholds, [key]: value },
    });
    setHasChanges(true);
  };

  const updateAlertSetting = <K extends keyof AlertSettings>(
    key: K,
    value: AlertSettings[K]
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      alertSettings: { ...settings.alertSettings, [key]: value },
    });
    setHasChanges(true);
  };

  const updateIntegrationSetting = <K extends keyof IntegrationSettings>(
    key: K,
    value: IntegrationSettings[K]
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      integrationSettings: { ...settings.integrationSettings, [key]: value },
    });
    setHasChanges(true);
  };

  const toggleWarningType = (typeId: string) => {
    if (!settings) return;
    const current = settings.alertSettings.enabledWarningTypes;
    const updated = current.includes(typeId)
      ? current.filter((t) => t !== typeId)
      : [...current, typeId];
    updateAlertSetting('enabledWarningTypes', updated);
  };

  if (loading) {
    return (
      <div className="workload-settings loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="workload-settings error">
        <p>{error || 'Failed to load settings'}</p>
        <button onClick={fetchSettings} className="btn btn-small">Retry</button>
      </div>
    );
  }

  return (
    <div className="workload-settings">
      {/* Header */}
      <div className="settings-header">
        <div className="header-info">
          <h3>Workload Settings</h3>
          <span className="scope-badge">{scope}</span>
        </div>
        <div className="header-actions">
          {hasChanges && canEdit && (
            <>
              <button className="btn btn-outline" onClick={handleReset}>
                Reset to Defaults
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="section-tabs">
        <button
          className={`tab ${activeSection === 'workload' ? 'active' : ''}`}
          onClick={() => setActiveSection('workload')}
        >
          Workload Limits
        </button>
        <button
          className={`tab ${activeSection === 'burnout' ? 'active' : ''}`}
          onClick={() => setActiveSection('burnout')}
        >
          Burnout Detection
        </button>
        <button
          className={`tab ${activeSection === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveSection('alerts')}
        >
          Alerts & Warnings
        </button>
        <button
          className={`tab ${activeSection === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveSection('integrations')}
        >
          Integrations
        </button>
      </div>

      {/* Section Content */}
      <div className="settings-content">
        {activeSection === 'workload' && (
          <WorkloadLimitsSection
            thresholds={settings.workloadThresholds}
            onChange={updateWorkloadThreshold}
            disabled={!canEdit}
          />
        )}
        {activeSection === 'burnout' && (
          <BurnoutDetectionSection
            thresholds={settings.burnoutThresholds}
            onChange={updateBurnoutThreshold}
            disabled={!canEdit}
          />
        )}
        {activeSection === 'alerts' && (
          <AlertsSection
            settings={settings.alertSettings}
            onChange={updateAlertSetting}
            onToggleWarningType={toggleWarningType}
            disabled={!canEdit}
          />
        )}
        {activeSection === 'integrations' && (
          <IntegrationsSection
            settings={settings.integrationSettings}
            onChange={updateIntegrationSetting}
            disabled={!canEdit}
          />
        )}
      </div>

      {/* Last Updated */}
      <div className="settings-footer">
        <span className="last-updated">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
          {settings.updatedBy && ` by ${settings.updatedBy}`}
        </span>
      </div>
    </div>
  );
}

// Workload Limits Section
interface WorkloadLimitsSectionProps {
  thresholds: WorkloadThresholds;
  onChange: <K extends keyof WorkloadThresholds>(key: K, value: WorkloadThresholds[K]) => void;
  disabled: boolean;
}

function WorkloadLimitsSection({ thresholds, onChange, disabled }: WorkloadLimitsSectionProps) {
  return (
    <div className="settings-section">
      <p className="section-description">
        Configure workload thresholds that trigger warnings and recommendations.
      </p>

      <div className="settings-grid">
        <SettingRow
          label="Weekly Hours Target"
          description="Target number of work hours per week"
          value={thresholds.weeklyHoursTarget}
          onChange={(v) => onChange('weeklyHoursTarget', v)}
          min={20}
          max={60}
          unit="hours"
          disabled={disabled}
        />
        <SettingRow
          label="Weekly Hours Maximum"
          description="Maximum hours before overload warning"
          value={thresholds.weeklyHoursMax}
          onChange={(v) => onChange('weeklyHoursMax', v)}
          min={30}
          max={80}
          unit="hours"
          disabled={disabled}
        />
        <SettingRow
          label="Daily Hours Maximum"
          description="Maximum hours per day"
          value={thresholds.dailyHoursMax}
          onChange={(v) => onChange('dailyHoursMax', v)}
          min={6}
          max={14}
          unit="hours"
          disabled={disabled}
        />
        <SettingRow
          label="After Hours Threshold"
          description="Hours after 6 PM before warning"
          value={thresholds.afterHoursThreshold}
          onChange={(v) => onChange('afterHoursThreshold', v)}
          min={0}
          max={10}
          unit="hours/week"
          disabled={disabled}
        />
        <SettingRow
          label="Weekend Work Threshold"
          description="Weekend hours before warning"
          value={thresholds.weekendWorkThreshold}
          onChange={(v) => onChange('weekendWorkThreshold', v)}
          min={0}
          max={20}
          unit="hours"
          disabled={disabled}
        />
        <SettingRow
          label="Meeting Load Maximum"
          description="Maximum percentage of time in meetings"
          value={thresholds.meetingLoadMax}
          onChange={(v) => onChange('meetingLoadMax', v)}
          min={20}
          max={80}
          unit="%"
          disabled={disabled}
        />
        <SettingRow
          label="Focus Time Minimum"
          description="Minimum uninterrupted work blocks per week"
          value={thresholds.focusTimeMin}
          onChange={(v) => onChange('focusTimeMin', v)}
          min={2}
          max={20}
          unit="hours"
          disabled={disabled}
        />
        <SettingRow
          label="Back-to-Back Maximum"
          description="Maximum consecutive meetings allowed"
          value={thresholds.backToBackMax}
          onChange={(v) => onChange('backToBackMax', v)}
          min={1}
          max={8}
          unit="meetings"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// Burnout Detection Section
interface BurnoutDetectionSectionProps {
  thresholds: BurnoutThresholds;
  onChange: <K extends keyof BurnoutThresholds>(key: K, value: BurnoutThresholds[K]) => void;
  disabled: boolean;
}

function BurnoutDetectionSection({ thresholds, onChange, disabled }: BurnoutDetectionSectionProps) {
  return (
    <div className="settings-section">
      <p className="section-description">
        Adjust burnout risk thresholds and early warning sensitivity.
      </p>

      <div className="risk-levels">
        <h4>Risk Level Thresholds</h4>
        <div className="risk-visualization">
          <div className="risk-bar">
            <div className="risk-segment low" style={{ width: `${thresholds.lowRisk * 100}%` }}>
              Low
            </div>
            <div
              className="risk-segment medium"
              style={{ width: `${(thresholds.mediumRisk - thresholds.lowRisk) * 100}%` }}
            >
              Medium
            </div>
            <div
              className="risk-segment high"
              style={{ width: `${(thresholds.highRisk - thresholds.mediumRisk) * 100}%` }}
            >
              High
            </div>
            <div
              className="risk-segment critical"
              style={{ width: `${(1 - thresholds.highRisk) * 100}%` }}
            >
              Critical
            </div>
          </div>
        </div>

        <div className="settings-grid">
          <SettingRow
            label="Low Risk Threshold"
            description="Score below this is considered low risk"
            value={thresholds.lowRisk * 100}
            onChange={(v) => onChange('lowRisk', v / 100)}
            min={10}
            max={40}
            unit="%"
            disabled={disabled}
          />
          <SettingRow
            label="Medium Risk Threshold"
            description="Score above this triggers medium alerts"
            value={thresholds.mediumRisk * 100}
            onChange={(v) => onChange('mediumRisk', v / 100)}
            min={30}
            max={60}
            unit="%"
            disabled={disabled}
          />
          <SettingRow
            label="High Risk Threshold"
            description="Score above this triggers high alerts"
            value={thresholds.highRisk * 100}
            onChange={(v) => onChange('highRisk', v / 100)}
            min={50}
            max={80}
            unit="%"
            disabled={disabled}
          />
          <SettingRow
            label="Critical Risk Threshold"
            description="Score above this requires immediate action"
            value={thresholds.criticalRisk * 100}
            onChange={(v) => onChange('criticalRisk', v / 100)}
            min={70}
            max={95}
            unit="%"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="settings-grid" style={{ marginTop: '2rem' }}>
        <SettingRow
          label="Trend Sensitivity"
          description="How sensitive to risk score changes (higher = more sensitive)"
          value={thresholds.trendSensitivity * 100}
          onChange={(v) => onChange('trendSensitivity', v / 100)}
          min={10}
          max={100}
          unit="%"
          disabled={disabled}
        />
        <SettingRow
          label="Warning Lead Time"
          description="Days before predicted high risk to warn"
          value={thresholds.warningLeadDays}
          onChange={(v) => onChange('warningLeadDays', v)}
          min={1}
          max={30}
          unit="days"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// Alerts Section
interface AlertsSectionProps {
  settings: AlertSettings;
  onChange: <K extends keyof AlertSettings>(key: K, value: AlertSettings[K]) => void;
  onToggleWarningType: (typeId: string) => void;
  disabled: boolean;
}

function AlertsSection({ settings, onChange, onToggleWarningType, disabled }: AlertsSectionProps) {
  return (
    <div className="settings-section">
      <p className="section-description">
        Configure which warnings are enabled and how alerts are delivered.
      </p>

      <div className="warning-types-section">
        <h4>Enabled Warning Types</h4>
        <div className="warning-types-grid">
          {WARNING_TYPES.map((type) => (
            <label key={type.id} className={`warning-type-item ${disabled ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={settings.enabledWarningTypes.includes(type.id)}
                onChange={() => onToggleWarningType(type.id)}
                disabled={disabled}
              />
              <div className="type-info">
                <span className="type-label">{type.label}</span>
                <span className="type-description">{type.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-grid" style={{ marginTop: '2rem' }}>
        <div className="setting-row">
          <div className="setting-info">
            <label>Manager Notification Threshold</label>
            <span className="setting-description">Minimum severity to notify managers</span>
          </div>
          <select
            value={settings.managerNotificationThreshold}
            onChange={(e) =>
              onChange('managerNotificationThreshold', e.target.value as AlertSettings['managerNotificationThreshold'])
            }
            disabled={disabled}
            className="setting-select"
          >
            <option value="low">Low (all alerts)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical only</option>
          </select>
        </div>

        <SettingRow
          label="Escalation Delay"
          description="Hours before unacknowledged alerts escalate"
          value={settings.escalationDelayHours}
          onChange={(v) => onChange('escalationDelayHours', v)}
          min={1}
          max={72}
          unit="hours"
          disabled={disabled}
        />

        <SettingRow
          label="Auto-Acknowledge"
          description="Hours before low-priority alerts auto-acknowledge"
          value={settings.autoAcknowledgeHours}
          onChange={(v) => onChange('autoAcknowledgeHours', v)}
          min={0}
          max={168}
          unit="hours"
          disabled={disabled}
        />

        <SettingRow
          label="Team Alert Threshold"
          description="Percentage of team at risk to trigger team alert"
          value={settings.teamAlertThreshold}
          onChange={(v) => onChange('teamAlertThreshold', v)}
          min={10}
          max={50}
          unit="%"
          disabled={disabled}
        />

        <div className="setting-row">
          <div className="setting-info">
            <label>Enable Digest</label>
            <span className="setting-description">Send summary digests instead of individual alerts</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.digestEnabled}
              onChange={(e) => onChange('digestEnabled', e.target.checked)}
              disabled={disabled}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {settings.digestEnabled && (
          <div className="setting-row">
            <div className="setting-info">
              <label>Digest Schedule</label>
              <span className="setting-description">How often to send digest summaries</span>
            </div>
            <select
              value={settings.digestSchedule}
              onChange={(e) => onChange('digestSchedule', e.target.value as AlertSettings['digestSchedule'])}
              disabled={disabled}
              className="setting-select"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// Integrations Section
interface IntegrationsSectionProps {
  settings: IntegrationSettings;
  onChange: <K extends keyof IntegrationSettings>(key: K, value: IntegrationSettings[K]) => void;
  disabled: boolean;
}

function IntegrationsSection({ settings, onChange, disabled }: IntegrationsSectionProps) {
  return (
    <div className="settings-section">
      <p className="section-description">
        Connect external services for better workload tracking and notifications.
      </p>

      <div className="integrations-grid">
        {/* Calendar */}
        <div className="integration-card">
          <div className="integration-header">
            <span className="integration-icon">📅</span>
            <span className="integration-name">Calendar</span>
          </div>
          <p className="integration-description">
            Sync calendar to analyze meeting load and find available time
          </p>
          <div className="integration-controls">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.calendarSync}
                onChange={(e) => onChange('calendarSync', e.target.checked)}
                disabled={disabled}
              />
              <span className="toggle-slider" />
            </label>
            {settings.calendarSync && (
              <select
                value={settings.calendarProvider || ''}
                onChange={(e) =>
                  onChange('calendarProvider', e.target.value as IntegrationSettings['calendarProvider'])
                }
                disabled={disabled}
                className="provider-select"
              >
                <option value="">Select provider</option>
                <option value="google">Google Calendar</option>
                <option value="outlook">Outlook</option>
                <option value="apple">Apple Calendar</option>
              </select>
            )}
          </div>
        </div>

        {/* Slack */}
        <div className="integration-card">
          <div className="integration-header">
            <span className="integration-icon">💬</span>
            <span className="integration-name">Slack</span>
          </div>
          <p className="integration-description">
            Send notifications to Slack channels
          </p>
          <div className="integration-controls">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.slackIntegration}
                onChange={(e) => onChange('slackIntegration', e.target.checked)}
                disabled={disabled}
              />
              <span className="toggle-slider" />
            </label>
            {settings.slackIntegration && (
              <input
                type="text"
                placeholder="#channel-name"
                value={settings.slackChannel || ''}
                onChange={(e) => onChange('slackChannel', e.target.value)}
                disabled={disabled}
                className="channel-input"
              />
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="integration-card">
          <div className="integration-header">
            <span className="integration-icon">👥</span>
            <span className="integration-name">Microsoft Teams</span>
          </div>
          <p className="integration-description">
            Send notifications to Teams channels
          </p>
          <div className="integration-controls">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.teamsIntegration}
                onChange={(e) => onChange('teamsIntegration', e.target.checked)}
                disabled={disabled}
              />
              <span className="toggle-slider" />
            </label>
            {settings.teamsIntegration && (
              <input
                type="text"
                placeholder="Channel name"
                value={settings.teamsChannel || ''}
                onChange={(e) => onChange('teamsChannel', e.target.value)}
                disabled={disabled}
                className="channel-input"
              />
            )}
          </div>
        </div>

        {/* Jira */}
        <div className="integration-card">
          <div className="integration-header">
            <span className="integration-icon">📋</span>
            <span className="integration-name">Jira</span>
          </div>
          <p className="integration-description">
            Track task assignments and deadlines from Jira
          </p>
          <div className="integration-controls">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.jiraIntegration}
                onChange={(e) => onChange('jiraIntegration', e.target.checked)}
                disabled={disabled}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* GitHub */}
        <div className="integration-card">
          <div className="integration-header">
            <span className="integration-icon">🐙</span>
            <span className="integration-name">GitHub</span>
          </div>
          <p className="integration-description">
            Track PR reviews and code contributions
          </p>
          <div className="integration-controls">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.githubIntegration}
                onChange={(e) => onChange('githubIntegration', e.target.checked)}
                disabled={disabled}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// Setting Row Component
interface SettingRowProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  unit: string;
  disabled: boolean;
}

function SettingRow({ label, description, value, onChange, min, max, unit, disabled }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-info">
        <label>{label}</label>
        <span className="setting-description">{description}</span>
      </div>
      <div className="setting-control">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="setting-slider"
        />
        <span className="setting-value">
          {value} {unit}
        </span>
      </div>
    </div>
  );
}

// Helper Functions
function getDefaultSettings(scope: string, scopeId: string): WorkloadSettingsData {
  return {
    id: `${scope}-${scopeId}`,
    scope: scope as 'personal' | 'team' | 'organization',
    scopeId,
    workloadThresholds: {
      weeklyHoursTarget: 40,
      weeklyHoursMax: 50,
      dailyHoursMax: 10,
      afterHoursThreshold: 5,
      weekendWorkThreshold: 4,
      meetingLoadMax: 50,
      focusTimeMin: 8,
      backToBackMax: 3,
    },
    burnoutThresholds: {
      lowRisk: 0.25,
      mediumRisk: 0.45,
      highRisk: 0.65,
      criticalRisk: 0.85,
      trendSensitivity: 0.5,
      warningLeadDays: 7,
    },
    alertSettings: {
      enabledWarningTypes: WARNING_TYPES.map((t) => t.id),
      escalationDelayHours: 24,
      autoAcknowledgeHours: 72,
      managerNotificationThreshold: 'high',
      teamAlertThreshold: 25,
      digestEnabled: true,
      digestSchedule: 'daily',
    },
    integrationSettings: {
      calendarSync: false,
      slackIntegration: false,
      teamsIntegration: false,
      jiraIntegration: false,
      githubIntegration: false,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

export default WorkloadSettings;
