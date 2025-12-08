/**
 * Workload Page Component
 * T227 - Main workload management dashboard
 *
 * Central hub for workload analysis, burnout prevention, and team management
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
  currentLoad: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  warningCount: number;
  taskCount: number;
}

export interface TeamSummary {
  totalMembers: number;
  averageLoad: number;
  overloadedCount: number;
  atRiskCount: number;
  warningsCount: number;
  balanceScore: number;
}

type Tab = 'overview' | 'team' | 'burnout' | 'distribution' | 'calendar' | 'settings';

interface WorkloadPageProps {
  organizationId: string;
  teamId?: string;
}

export function WorkloadPage({ organizationId, teamId }: WorkloadPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const fetchTeamData = useCallback(async () => {
    if (!teamId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/workload/team/${teamId}`);
      if (!response.ok) throw new Error('Failed to fetch team data');
      const data = await response.json();

      setTeamSummary(data.data.summary);
      setMembers(data.data.members || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const handleMemberSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    setActiveTab('overview');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <WorkloadOverviewTab
            teamId={teamId}
            summary={teamSummary}
            members={members}
            selectedMemberId={selectedMemberId}
            onMemberSelect={handleMemberSelect}
          />
        );
      case 'team':
        return (
          <TeamWorkloadTab
            teamId={teamId}
            members={members}
            onMemberSelect={handleMemberSelect}
          />
        );
      case 'burnout':
        return (
          <BurnoutAnalysisTab
            teamId={teamId}
            members={members}
          />
        );
      case 'distribution':
        return (
          <TaskDistributionTab teamId={teamId} />
        );
      case 'calendar':
        return (
          <CalendarAnalysisTab
            teamId={teamId}
            selectedMemberId={selectedMemberId}
          />
        );
      case 'settings':
        return (
          <WorkloadSettingsTab organizationId={organizationId} />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="workload-page loading">
        <div className="spinner" />
        <p>Loading workload data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workload-page error">
        <div className="error-message">
          <span className="error-icon">!</span>
          <p>{error}</p>
          <button onClick={fetchTeamData} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workload-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <h1>Workload Management</h1>
          <p className="subtitle">
            Monitor team health, prevent burnout, and optimize task distribution
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={fetchTeamData}>
            <span className="icon">↻</span>
            Refresh
          </button>
          <button className="btn btn-primary">
            <span className="icon">+</span>
            Run Analysis
          </button>
        </div>
      </header>

      {/* Quick Stats */}
      {teamSummary && (
        <div className="quick-stats">
          <QuickStatCard
            label="Team Members"
            value={teamSummary.totalMembers}
            icon="👥"
          />
          <QuickStatCard
            label="Average Load"
            value={`${teamSummary.averageLoad}%`}
            status={teamSummary.averageLoad > 90 ? 'critical' : teamSummary.averageLoad > 75 ? 'warning' : 'good'}
            icon="📊"
          />
          <QuickStatCard
            label="Overloaded"
            value={teamSummary.overloadedCount}
            status={teamSummary.overloadedCount > 0 ? 'warning' : 'good'}
            icon="⚠️"
          />
          <QuickStatCard
            label="At Risk"
            value={teamSummary.atRiskCount}
            status={teamSummary.atRiskCount > 0 ? 'critical' : 'good'}
            icon="🔥"
          />
          <QuickStatCard
            label="Active Warnings"
            value={teamSummary.warningsCount}
            status={teamSummary.warningsCount > 5 ? 'critical' : teamSummary.warningsCount > 0 ? 'warning' : 'good'}
            icon="🔔"
          />
          <QuickStatCard
            label="Balance Score"
            value={`${teamSummary.balanceScore}/100`}
            status={teamSummary.balanceScore < 50 ? 'critical' : teamSummary.balanceScore < 70 ? 'warning' : 'good'}
            icon="⚖️"
          />
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="tab-nav">
        {[
          { key: 'overview', label: 'Overview', icon: '📋' },
          { key: 'team', label: 'Team', icon: '👥' },
          { key: 'burnout', label: 'Burnout Risk', icon: '🔥' },
          { key: 'distribution', label: 'Distribution', icon: '📊' },
          { key: 'calendar', label: 'Calendar', icon: '📅' },
          { key: 'settings', label: 'Settings', icon: '⚙️' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key as Tab)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="tab-content">
        {renderTabContent()}
      </main>
    </div>
  );
}

// Quick Stat Card Component
interface QuickStatCardProps {
  label: string;
  value: string | number;
  status?: 'good' | 'warning' | 'critical';
  icon?: string;
}

function QuickStatCard({ label, value, status = 'good', icon }: QuickStatCardProps) {
  return (
    <div className={`quick-stat-card ${status}`}>
      {icon && <span className="stat-icon">{icon}</span>}
      <div className="stat-content">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

// Tab Components (stubs - would be separate files)
interface OverviewTabProps {
  teamId?: string;
  summary: TeamSummary | null;
  members: TeamMember[];
  selectedMemberId: string | null;
  onMemberSelect: (id: string) => void;
}

function WorkloadOverviewTab({
  teamId,
  summary,
  members,
  selectedMemberId,
  onMemberSelect,
}: OverviewTabProps) {
  return (
    <div className="overview-tab">
      <div className="overview-grid">
        {/* Team Health Card */}
        <div className="card team-health">
          <h3>Team Health Overview</h3>
          {summary && (
            <div className="health-metrics">
              <div className="metric">
                <span className="metric-label">Average Workload</span>
                <div className="metric-bar">
                  <div
                    className={`bar-fill ${summary.averageLoad > 90 ? 'critical' : summary.averageLoad > 75 ? 'warning' : 'healthy'}`}
                    style={{ width: `${Math.min(100, summary.averageLoad)}%` }}
                  />
                </div>
                <span className="metric-value">{summary.averageLoad}%</span>
              </div>
              <div className="metric">
                <span className="metric-label">Balance Score</span>
                <div className="metric-bar">
                  <div
                    className={`bar-fill ${summary.balanceScore < 50 ? 'critical' : summary.balanceScore < 70 ? 'warning' : 'healthy'}`}
                    style={{ width: `${summary.balanceScore}%` }}
                  />
                </div>
                <span className="metric-value">{summary.balanceScore}/100</span>
              </div>
            </div>
          )}
        </div>

        {/* Alerts Card */}
        <div className="card alerts">
          <h3>Active Alerts</h3>
          <div className="alert-list">
            {members.filter(m => m.riskLevel === 'critical' || m.riskLevel === 'high').map(m => (
              <div
                key={m.id}
                className={`alert-item ${m.riskLevel}`}
                onClick={() => onMemberSelect(m.id)}
              >
                <span className="alert-icon">
                  {m.riskLevel === 'critical' ? '🚨' : '⚠️'}
                </span>
                <div className="alert-content">
                  <span className="alert-title">{m.name}</span>
                  <span className="alert-detail">
                    {m.riskLevel === 'critical' ? 'Critical burnout risk' : 'High workload'}
                  </span>
                </div>
              </div>
            ))}
            {members.filter(m => m.riskLevel === 'critical' || m.riskLevel === 'high').length === 0 && (
              <p className="no-alerts">No active alerts</p>
            )}
          </div>
        </div>

        {/* Team List */}
        <div className="card team-list">
          <h3>Team Members</h3>
          <div className="member-list">
            {members.map(member => (
              <div
                key={member.id}
                className={`member-item ${member.riskLevel} ${selectedMemberId === member.id ? 'selected' : ''}`}
                onClick={() => onMemberSelect(member.id)}
              >
                <div className="member-avatar">
                  {member.avatar ? (
                    <img src={member.avatar} alt={member.name} />
                  ) : (
                    <span>{member.name.charAt(0)}</span>
                  )}
                </div>
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  <span className="member-role">{member.role || 'Team Member'}</span>
                </div>
                <div className="member-load">
                  <div className="load-bar">
                    <div
                      className={`load-fill ${member.currentLoad > 100 ? 'critical' : member.currentLoad > 80 ? 'warning' : 'healthy'}`}
                      style={{ width: `${Math.min(100, member.currentLoad)}%` }}
                    />
                  </div>
                  <span className="load-value">{member.currentLoad}%</span>
                </div>
                {member.warningCount > 0 && (
                  <span className="warning-badge">{member.warningCount}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="card recommendations">
          <h3>Recommendations</h3>
          <div className="recommendation-list">
            <div className="recommendation-item">
              <span className="rec-icon">📋</span>
              <div className="rec-content">
                <span className="rec-title">Review task distribution</span>
                <span className="rec-detail">3 team members are overloaded while 2 have spare capacity</span>
              </div>
              <button className="btn btn-small btn-outline">View</button>
            </div>
            <div className="recommendation-item">
              <span className="rec-icon">🗓️</span>
              <div className="rec-content">
                <span className="rec-title">Reduce meeting load</span>
                <span className="rec-detail">Team average is 45% of time in meetings</span>
              </div>
              <button className="btn btn-small btn-outline">Analyze</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TeamTabProps {
  teamId?: string;
  members: TeamMember[];
  onMemberSelect: (id: string) => void;
}

function TeamWorkloadTab({ teamId, members, onMemberSelect }: TeamTabProps) {
  return (
    <div className="team-tab">
      <div className="team-header">
        <h3>Team Workload Overview</h3>
        <div className="sort-controls">
          <select className="sort-select">
            <option value="load-desc">Highest Load First</option>
            <option value="load-asc">Lowest Load First</option>
            <option value="risk">Risk Level</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      <div className="team-grid">
        {members.map(member => (
          <div
            key={member.id}
            className={`member-card ${member.riskLevel}`}
            onClick={() => onMemberSelect(member.id)}
          >
            <div className="card-header">
              <div className="member-avatar large">
                {member.avatar ? (
                  <img src={member.avatar} alt={member.name} />
                ) : (
                  <span>{member.name.charAt(0)}</span>
                )}
              </div>
              <div className="member-details">
                <span className="member-name">{member.name}</span>
                <span className="member-role">{member.role || 'Team Member'}</span>
              </div>
              <span className={`risk-badge ${member.riskLevel}`}>
                {member.riskLevel}
              </span>
            </div>
            <div className="card-body">
              <div className="workload-gauge">
                <svg viewBox="0 0 100 50">
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="#e5e5e5"
                    strokeWidth="8"
                  />
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke={member.currentLoad > 100 ? '#ef4444' : member.currentLoad > 80 ? '#f59e0b' : '#22c55e'}
                    strokeWidth="8"
                    strokeDasharray={`${(member.currentLoad / 100) * 126} 126`}
                  />
                </svg>
                <div className="gauge-value">
                  <span className="value">{member.currentLoad}%</span>
                  <span className="label">Load</span>
                </div>
              </div>
              <div className="member-stats">
                <div className="stat">
                  <span className="stat-value">{member.taskCount}</span>
                  <span className="stat-label">Tasks</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{member.warningCount}</span>
                  <span className="stat-label">Warnings</span>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button className="btn btn-small btn-outline">View Details</button>
              <button className="btn btn-small btn-primary">Redistribute</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BurnoutTabProps {
  teamId?: string;
  members: TeamMember[];
}

function BurnoutAnalysisTab({ teamId, members }: BurnoutTabProps) {
  return (
    <div className="burnout-tab">
      <h3>Burnout Risk Analysis</h3>
      <p className="tab-description">
        Monitor early warning signs and take proactive action to prevent burnout
      </p>
      {/* Would include BurnoutRiskPanel, TeamBurnoutChart, etc. */}
      <div className="placeholder">
        Burnout analysis components would be rendered here
      </div>
    </div>
  );
}

interface DistributionTabProps {
  teamId?: string;
}

function TaskDistributionTab({ teamId }: DistributionTabProps) {
  return (
    <div className="distribution-tab">
      <h3>Task Distribution</h3>
      <p className="tab-description">
        Analyze and optimize how work is distributed across the team
      </p>
      {/* Would include TaskDistributionChart, RedistributionPanel, etc. */}
      <div className="placeholder">
        Task distribution components would be rendered here
      </div>
    </div>
  );
}

interface CalendarTabProps {
  teamId?: string;
  selectedMemberId: string | null;
}

function CalendarAnalysisTab({ teamId, selectedMemberId }: CalendarTabProps) {
  return (
    <div className="calendar-tab">
      <h3>Calendar Analysis</h3>
      <p className="tab-description">
        Understand meeting patterns and find time for focused work
      </p>
      {/* Would include MeetingAnalysis, AvailabilityView, etc. */}
      <div className="placeholder">
        Calendar analysis components would be rendered here
      </div>
    </div>
  );
}

interface SettingsTabProps {
  organizationId: string;
}

function WorkloadSettingsTab({ organizationId }: SettingsTabProps) {
  return (
    <div className="settings-tab">
      <h3>Workload Settings</h3>
      <p className="tab-description">
        Configure workload thresholds, notifications, and analysis preferences
      </p>
      {/* Would include threshold settings, notification preferences, etc. */}
      <div className="placeholder">
        Settings components would be rendered here
      </div>
    </div>
  );
}

export default WorkloadPage;
