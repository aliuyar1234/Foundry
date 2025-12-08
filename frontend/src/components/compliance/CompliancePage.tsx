/**
 * Compliance Page
 * T192 - Main compliance dashboard page
 *
 * Central hub for all compliance functionality
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
interface ComplianceSummary {
  overallScore: number;
  frameworkScores: Record<ComplianceFramework, number>;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  activeViolations: number;
  criticalViolations: number;
  pendingDeadlines: number;
  upcomingDeadlines: number;
  lastEvaluated: string;
}

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface CompliancePageProps {
  organizationId: string;
  defaultFramework?: ComplianceFramework;
  defaultTab?: string;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'violations', label: 'Violations' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'deadlines', label: 'Deadlines' },
  { id: 'reports', label: 'Reports' },
];

const FRAMEWORKS: ComplianceFramework[] = ['SOX', 'GDPR', 'ISO27001', 'HIPAA', 'PCI_DSS', 'SOC2', 'CUSTOM'];

export function CompliancePage({
  organizationId,
  defaultFramework,
  defaultTab = 'overview',
}: CompliancePageProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedFramework, setSelectedFramework] = useState<ComplianceFramework | 'all'>(
    defaultFramework || 'all'
  );
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId });
      if (selectedFramework !== 'all') {
        params.append('framework', selectedFramework);
      }

      const response = await fetch(`/api/compliance/summary?${params}`);
      if (!response.ok) throw new Error('Failed to fetch compliance summary');
      const data = await response.json();
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedFramework]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleRunEvaluation = async () => {
    try {
      const response = await fetch('/api/compliance/rules/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          framework: selectedFramework !== 'all' ? selectedFramework : undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to run evaluation');
      await fetchSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run evaluation');
    }
  };

  const tabsWithBadges = TABS.map((tab) => ({
    ...tab,
    badge:
      tab.id === 'violations' ? summary?.activeViolations :
      tab.id === 'deadlines' ? summary?.upcomingDeadlines :
      undefined,
  }));

  if (loading && !summary) {
    return (
      <div className="compliance-page">
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading compliance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="compliance-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <h1>Compliance Autopilot</h1>
          <p className="subtitle">
            Automated compliance monitoring and reporting
          </p>
        </div>

        <div className="header-actions">
          <select
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value as ComplianceFramework | 'all')}
            className="framework-select"
          >
            <option value="all">All Frameworks</option>
            {FRAMEWORKS.map((fw) => (
              <option key={fw} value={fw}>{fw}</option>
            ))}
          </select>

          <button
            onClick={handleRunEvaluation}
            className="btn btn-primary"
          >
            Run Evaluation
          </button>
        </div>
      </header>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Score Overview */}
      {summary && (
        <div className="score-overview">
          <div className="overall-score">
            <div
              className={`score-circle ${
                summary.overallScore >= 90 ? 'excellent' :
                summary.overallScore >= 70 ? 'good' :
                summary.overallScore >= 50 ? 'fair' : 'poor'
              }`}
            >
              <span className="score-value">{summary.overallScore}%</span>
              <span className="score-label">Compliance Score</span>
            </div>
          </div>

          <div className="score-breakdown">
            {Object.entries(summary.frameworkScores).map(([framework, score]) => (
              <div key={framework} className="framework-score">
                <span className="framework-name">{framework}</span>
                <div className="score-bar">
                  <div
                    className="score-fill"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="score-value">{score}%</span>
              </div>
            ))}
          </div>

          <div className="quick-stats">
            <div className="stat">
              <span className="stat-value">{summary.passedRules}/{summary.totalRules}</span>
              <span className="stat-label">Rules Passed</span>
            </div>
            <div className="stat critical">
              <span className="stat-value">{summary.criticalViolations}</span>
              <span className="stat-label">Critical Violations</span>
            </div>
            <div className="stat warning">
              <span className="stat-value">{summary.pendingDeadlines}</span>
              <span className="stat-label">Pending Deadlines</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="tab-navigation">
        {tabsWithBadges.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="badge">{tab.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <OverviewTab
            organizationId={organizationId}
            framework={selectedFramework !== 'all' ? selectedFramework : undefined}
            summary={summary}
          />
        )}
        {activeTab === 'rules' && (
          <RulesTab
            organizationId={organizationId}
            framework={selectedFramework !== 'all' ? selectedFramework : undefined}
          />
        )}
        {activeTab === 'violations' && (
          <ViolationsTab
            organizationId={organizationId}
            framework={selectedFramework !== 'all' ? selectedFramework : undefined}
          />
        )}
        {activeTab === 'evidence' && (
          <EvidenceTab
            organizationId={organizationId}
            framework={selectedFramework !== 'all' ? selectedFramework : undefined}
          />
        )}
        {activeTab === 'deadlines' && (
          <DeadlinesTab
            organizationId={organizationId}
            framework={selectedFramework !== 'all' ? selectedFramework : undefined}
          />
        )}
        {activeTab === 'reports' && (
          <ReportsTab
            organizationId={organizationId}
            framework={selectedFramework !== 'all' ? selectedFramework : undefined}
          />
        )}
      </div>

      {/* Last Evaluated */}
      {summary?.lastEvaluated && (
        <footer className="page-footer">
          <span>
            Last evaluated: {new Date(summary.lastEvaluated).toLocaleString()}
          </span>
          <button onClick={fetchSummary} className="btn btn-link">
            Refresh
          </button>
        </footer>
      )}
    </div>
  );
}

// Tab Components (placeholders - will be replaced by actual components)

interface TabProps {
  organizationId: string;
  framework?: ComplianceFramework;
  summary?: ComplianceSummary | null;
}

function OverviewTab({ organizationId, framework, summary }: TabProps) {
  return (
    <div className="overview-tab">
      <div className="dashboard-grid">
        <div className="widget recent-activity">
          <h3>Recent Activity</h3>
          <ActivityFeed organizationId={organizationId} framework={framework} />
        </div>

        <div className="widget violations-summary">
          <h3>Violation Trends</h3>
          <ViolationTrends organizationId={organizationId} framework={framework} />
        </div>

        <div className="widget upcoming-deadlines">
          <h3>Upcoming Deadlines</h3>
          <UpcomingDeadlines organizationId={organizationId} framework={framework} />
        </div>

        <div className="widget compliance-trends">
          <h3>Compliance Trends</h3>
          <ComplianceTrends organizationId={organizationId} framework={framework} />
        </div>
      </div>
    </div>
  );
}

function RulesTab({ organizationId, framework }: TabProps) {
  return (
    <div className="rules-tab">
      {/* RuleStatus and RuleEditor components will be integrated here */}
      <p>Rules management - See RuleStatus and RuleEditor components</p>
    </div>
  );
}

function ViolationsTab({ organizationId, framework }: TabProps) {
  return (
    <div className="violations-tab">
      {/* ViolationList component will be integrated here */}
      <p>Violations list - See ViolationList component</p>
    </div>
  );
}

function EvidenceTab({ organizationId, framework }: TabProps) {
  return (
    <div className="evidence-tab">
      {/* EvidenceTimeline component will be integrated here */}
      <p>Evidence timeline - See EvidenceTimeline component</p>
    </div>
  );
}

function DeadlinesTab({ organizationId, framework }: TabProps) {
  return (
    <div className="deadlines-tab">
      {/* DeadlineManager component will be integrated here */}
      <p>Deadline management - See DeadlineManager component</p>
    </div>
  );
}

function ReportsTab({ organizationId, framework }: TabProps) {
  return (
    <div className="reports-tab">
      {/* ReportWizard and ReportViewer components will be integrated here */}
      <p>Report generation - See ReportWizard and ReportViewer components</p>
    </div>
  );
}

// Widget Components

function ActivityFeed({ organizationId, framework }: { organizationId: string; framework?: ComplianceFramework }) {
  const [activities, setActivities] = useState<Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
  }>>([]);

  useEffect(() => {
    // Fetch recent activity
    const fetchActivity = async () => {
      // Mock data for now
      setActivities([
        { id: '1', type: 'rule', message: 'Rule evaluation completed', timestamp: new Date().toISOString() },
        { id: '2', type: 'violation', message: 'New violation detected', timestamp: new Date().toISOString() },
      ]);
    };
    fetchActivity();
  }, [organizationId, framework]);

  return (
    <ul className="activity-feed">
      {activities.map((activity) => (
        <li key={activity.id} className={`activity-item ${activity.type}`}>
          <span className="activity-message">{activity.message}</span>
          <span className="activity-time">
            {new Date(activity.timestamp).toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ViolationTrends({ organizationId, framework }: { organizationId: string; framework?: ComplianceFramework }) {
  return (
    <div className="violation-trends">
      <p>Violation trend chart placeholder</p>
    </div>
  );
}

function UpcomingDeadlines({ organizationId, framework }: { organizationId: string; framework?: ComplianceFramework }) {
  const [deadlines, setDeadlines] = useState<Array<{
    id: string;
    title: string;
    dueDate: string;
    status: string;
  }>>([]);

  useEffect(() => {
    const fetchDeadlines = async () => {
      try {
        const params = new URLSearchParams({ organizationId, limit: '5' });
        if (framework) params.append('framework', framework);

        const response = await fetch(`/api/compliance/deadlines?${params}`);
        if (response.ok) {
          const data = await response.json();
          setDeadlines(data.deadlines);
        }
      } catch {
        // Ignore errors
      }
    };
    fetchDeadlines();
  }, [organizationId, framework]);

  return (
    <ul className="deadlines-list">
      {deadlines.map((deadline) => (
        <li key={deadline.id} className={`deadline-item ${deadline.status}`}>
          <span className="deadline-title">{deadline.title}</span>
          <span className="deadline-date">
            {new Date(deadline.dueDate).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ComplianceTrends({ organizationId, framework }: { organizationId: string; framework?: ComplianceFramework }) {
  return (
    <div className="compliance-trends">
      <p>Compliance trend chart placeholder</p>
    </div>
  );
}

export default CompliancePage;
