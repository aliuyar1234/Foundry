/**
 * SSOT Dashboard Page
 * Main dashboard for Single Source of Truth management
 * T290 - SSOT dashboard page
 */

import React, { useState, useEffect } from 'react';
import { MasterRecordEditor } from '../../components/ssot/MasterRecordEditor';
import { ConflictResolver } from '../../components/ssot/ConflictResolver';
import { SyncStatusMonitor } from '../../components/ssot/SyncStatusMonitor';

interface SsotDashboardData {
  config: {
    mode: 'disabled' | 'shadow' | 'active' | 'primary';
    syncDirection: string;
    enabledEntityTypes: string[];
  };
  records: {
    total: number;
    byEntityType: Record<string, number>;
    byStatus: Record<string, number>;
    avgQualityScore: number;
    sourcesCount: number;
  };
  conflicts: {
    total: number;
    pending: number;
    resolved: number;
  };
  changes: {
    total: number;
    recentActivity: Array<{ date: string; count: number }>;
  };
  validation: {
    totalRules: number;
    enabledRules: number;
  };
}

interface SSOTDashboardProps {
  organizationId: string;
}

const MODE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  disabled: {
    label: 'Disabled',
    color: '#6b7280',
    description: 'SSOT functionality is not active',
  },
  shadow: {
    label: 'Shadow Mode',
    color: '#3b82f6',
    description: 'Collecting data without affecting operations',
  },
  active: {
    label: 'Active',
    color: '#22c55e',
    description: 'SSOT is actively managing records',
  },
  primary: {
    label: 'Primary',
    color: '#8b5cf6',
    description: 'SSOT is the authoritative source',
  },
};

const ENTITY_ICONS: Record<string, string> = {
  company: '\uD83C\uDFE2',
  person: '\uD83D\uDC64',
  product: '\uD83D\uDCE6',
  address: '\uD83D\uDCCD',
  contact: '\uD83D\uDCDE',
};

export const SSOTDashboard: React.FC<SSOTDashboardProps> = ({ organizationId }) => {
  const [dashboard, setDashboard] = useState<SsotDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'conflicts' | 'sync'>('overview');
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, [organizationId]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/ssot/dashboard');
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      const data = await response.json();
      setDashboard(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleModeTransition = async (targetMode: string) => {
    try {
      const response = await fetch('/api/v1/ssot/config/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Transition failed');
      }

      fetchDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    }
  };

  if (loading) {
    return (
      <div className="ssot-dashboard loading">
        <style>{styles}</style>
        <div className="spinner" />
        <p>Loading SSOT Dashboard...</p>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="ssot-dashboard error">
        <style>{styles}</style>
        <div className="error-state">
          <h3>Error Loading Dashboard</h3>
          <p>{error}</p>
          <button onClick={fetchDashboard} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  const modeInfo = MODE_LABELS[dashboard.config.mode];

  return (
    <div className="ssot-dashboard">
      <style>{styles}</style>

      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>Single Source of Truth</h1>
          <p>Manage master records and data synchronization</p>
        </div>
        <div className="header-right">
          <div className="mode-badge" style={{ backgroundColor: modeInfo.color }}>
            {modeInfo.label}
          </div>
          <button onClick={fetchDashboard} className="refresh-btn">
            Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'records' ? 'active' : ''}`}
          onClick={() => setActiveTab('records')}
        >
          Master Records
        </button>
        <button
          className={`tab ${activeTab === 'conflicts' ? 'active' : ''}`}
          onClick={() => setActiveTab('conflicts')}
        >
          Conflicts
          {dashboard.conflicts.pending > 0 && (
            <span className="badge">{dashboard.conflicts.pending}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          Sync Status
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="overview-content">
          {/* Mode Card */}
          <div className="mode-card">
            <div className="mode-info">
              <h3>SSOT Mode</h3>
              <div className="mode-status">
                <span
                  className="mode-indicator"
                  style={{ backgroundColor: modeInfo.color }}
                />
                <span className="mode-label">{modeInfo.label}</span>
              </div>
              <p className="mode-description">{modeInfo.description}</p>
            </div>
            <div className="mode-actions">
              {dashboard.config.mode === 'disabled' && (
                <button onClick={() => handleModeTransition('shadow')} className="action-btn">
                  Enable Shadow Mode
                </button>
              )}
              {dashboard.config.mode === 'shadow' && (
                <>
                  <button onClick={() => handleModeTransition('active')} className="action-btn primary">
                    Activate
                  </button>
                  <button onClick={() => handleModeTransition('disabled')} className="action-btn secondary">
                    Disable
                  </button>
                </>
              )}
              {dashboard.config.mode === 'active' && (
                <>
                  <button onClick={() => handleModeTransition('primary')} className="action-btn primary">
                    Make Primary
                  </button>
                  <button onClick={() => handleModeTransition('shadow')} className="action-btn secondary">
                    Back to Shadow
                  </button>
                </>
              )}
              {dashboard.config.mode === 'primary' && (
                <button onClick={() => handleModeTransition('active')} className="action-btn secondary">
                  Demote to Active
                </button>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon records-icon" />
              <div className="stat-value">{dashboard.records.total.toLocaleString()}</div>
              <div className="stat-label">Master Records</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon quality-icon" />
              <div className="stat-value">{dashboard.records.avgQualityScore.toFixed(0)}%</div>
              <div className="stat-label">Avg Quality Score</div>
            </div>
            <div className="stat-card warning">
              <div className="stat-icon conflict-icon" />
              <div className="stat-value">{dashboard.conflicts.pending}</div>
              <div className="stat-label">Pending Conflicts</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon sources-icon" />
              <div className="stat-value">{dashboard.records.sourcesCount}</div>
              <div className="stat-label">Connected Sources</div>
            </div>
          </div>

          {/* Entity Types */}
          <div className="entity-section">
            <h3>Records by Entity Type</h3>
            <div className="entity-grid">
              {Object.entries(dashboard.records.byEntityType).map(([type, count]) => (
                <div
                  key={type}
                  className={`entity-card ${selectedEntityType === type ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedEntityType(type);
                    setActiveTab('records');
                  }}
                >
                  <span className="entity-icon">{ENTITY_ICONS[type] || '\uD83D\uDCC4'}</span>
                  <div className="entity-info">
                    <span className="entity-name">{type}</span>
                    <span className="entity-count">{count.toLocaleString()} records</span>
                  </div>
                  <span
                    className={`status-dot ${
                      dashboard.config.enabledEntityTypes.includes(type) ? 'enabled' : 'disabled'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Activity Chart */}
          <div className="activity-section">
            <h3>Recent Activity</h3>
            <div className="activity-chart">
              {dashboard.changes.recentActivity.map((day, idx) => (
                <div key={idx} className="activity-bar-container">
                  <div
                    className="activity-bar"
                    style={{
                      height: `${Math.min(100, (day.count / Math.max(...dashboard.changes.recentActivity.map(d => d.count))) * 100)}%`,
                    }}
                    title={`${day.date}: ${day.count} changes`}
                  />
                  <span className="activity-date">
                    {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                  </span>
                </div>
              ))}
            </div>
            <div className="activity-summary">
              <span>{dashboard.changes.total.toLocaleString()} total changes tracked</span>
            </div>
          </div>

          {/* Validation Rules Summary */}
          <div className="validation-section">
            <h3>Validation Rules</h3>
            <div className="validation-stats">
              <div className="validation-stat">
                <span className="validation-value">{dashboard.validation.enabledRules}</span>
                <span className="validation-label">Active Rules</span>
              </div>
              <div className="validation-stat">
                <span className="validation-value">{dashboard.validation.totalRules - dashboard.validation.enabledRules}</span>
                <span className="validation-label">Disabled Rules</span>
              </div>
            </div>
            <button className="manage-rules-btn">Manage Rules</button>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h3>Quick Actions</h3>
            <div className="action-grid">
              <button className="quick-action" onClick={() => setActiveTab('records')}>
                <span className="action-icon">+</span>
                <span>Create Record</span>
              </button>
              <button className="quick-action" onClick={() => setActiveTab('conflicts')}>
                <span className="action-icon">!</span>
                <span>Resolve Conflicts</span>
              </button>
              <button className="quick-action" onClick={() => setActiveTab('sync')}>
                <span className="action-icon">\u21BB</span>
                <span>Start Sync</span>
              </button>
              <button className="quick-action">
                <span className="action-icon">\u2193</span>
                <span>Export Data</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Records Tab */}
      {activeTab === 'records' && (
        <MasterRecordEditor
          organizationId={organizationId}
          initialEntityType={selectedEntityType || undefined}
          onRecordChange={fetchDashboard}
        />
      )}

      {/* Conflicts Tab */}
      {activeTab === 'conflicts' && (
        <ConflictResolver
          organizationId={organizationId}
          onConflictResolved={fetchDashboard}
        />
      )}

      {/* Sync Tab */}
      {activeTab === 'sync' && (
        <SyncStatusMonitor
          organizationId={organizationId}
          onSyncComplete={fetchDashboard}
        />
      )}

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}
    </div>
  );
};

const styles = `
  .ssot-dashboard {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .ssot-dashboard.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-state {
    text-align: center;
    padding: 48px;
  }

  .retry-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .header-left h1 {
    margin: 0 0 4px;
    font-size: 28px;
    color: #111827;
  }

  .header-left p {
    margin: 0;
    color: #6b7280;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .mode-badge {
    padding: 8px 16px;
    border-radius: 20px;
    color: white;
    font-weight: 600;
    font-size: 14px;
  }

  .refresh-btn {
    background: white;
    border: 1px solid #e5e7eb;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
  }

  .tab-nav {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 12px;
  }

  .tab {
    background: none;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tab:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .tab.active {
    background: #3b82f6;
    color: white;
  }

  .tab .badge {
    background: #ef4444;
    color: white;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .tab.active .badge {
    background: white;
    color: #3b82f6;
  }

  .overview-content {
    display: grid;
    gap: 24px;
  }

  .mode-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .mode-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .mode-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .mode-label {
    font-size: 18px;
    font-weight: 600;
    color: #374151;
  }

  .mode-description {
    color: #6b7280;
    margin-top: 4px;
  }

  .mode-actions {
    display: flex;
    gap: 12px;
  }

  .action-btn {
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    border: none;
  }

  .action-btn.primary {
    background: #3b82f6;
    color: white;
  }

  .action-btn.secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    text-align: center;
  }

  .stat-card.warning {
    border: 2px solid #f97316;
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    margin: 0 auto 12px;
    background: #f3f4f6;
    border-radius: 50%;
  }

  .stat-value {
    font-size: 32px;
    font-weight: bold;
    color: #111827;
  }

  .stat-label {
    font-size: 14px;
    color: #6b7280;
    margin-top: 4px;
  }

  .entity-section, .activity-section, .validation-section {
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .entity-section h3, .activity-section h3, .validation-section h3, .quick-actions h3 {
    margin: 0 0 16px;
    font-size: 18px;
    color: #374151;
  }

  .entity-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }

  .entity-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    background: #f9fafb;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
  }

  .entity-card:hover {
    background: #f3f4f6;
  }

  .entity-card.selected {
    border-color: #3b82f6;
  }

  .entity-icon {
    font-size: 24px;
  }

  .entity-info {
    flex: 1;
  }

  .entity-name {
    display: block;
    font-weight: 600;
    color: #374151;
    text-transform: capitalize;
  }

  .entity-count {
    display: block;
    font-size: 12px;
    color: #6b7280;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.enabled {
    background: #22c55e;
  }

  .status-dot.disabled {
    background: #9ca3af;
  }

  .activity-chart {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 120px;
    padding: 16px 0;
  }

  .activity-bar-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
  }

  .activity-bar {
    width: 100%;
    background: #3b82f6;
    border-radius: 4px 4px 0 0;
    min-height: 4px;
    margin-top: auto;
  }

  .activity-date {
    font-size: 10px;
    color: #9ca3af;
    margin-top: 8px;
  }

  .activity-summary {
    text-align: center;
    color: #6b7280;
    font-size: 14px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
  }

  .validation-stats {
    display: flex;
    gap: 32px;
    margin-bottom: 16px;
  }

  .validation-stat {
    display: flex;
    flex-direction: column;
  }

  .validation-value {
    font-size: 24px;
    font-weight: bold;
    color: #111827;
  }

  .validation-label {
    font-size: 14px;
    color: #6b7280;
  }

  .manage-rules-btn {
    background: #f3f4f6;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    color: #374151;
  }

  .quick-actions {
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .quick-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    border-radius: 8px;
    background: #f9fafb;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .quick-action:hover {
    background: #f3f4f6;
  }

  .action-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #dbeafe;
    color: #3b82f6;
    border-radius: 50%;
    font-size: 20px;
    font-weight: bold;
  }

  .error-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #ef4444;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .error-toast button {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 18px;
  }

  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .entity-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .action-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .dashboard-header {
      flex-direction: column;
      gap: 16px;
      align-items: flex-start;
    }

    .mode-card {
      flex-direction: column;
      gap: 16px;
      align-items: flex-start;
    }

    .stats-grid, .entity-grid, .action-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
`;

export default SSOTDashboard;
