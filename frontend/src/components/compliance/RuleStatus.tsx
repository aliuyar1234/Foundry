/**
 * Rule Status Component
 * T193 - Display compliance rule status and evaluation results
 *
 * Shows rules with their current compliance status
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  framework: ComplianceFramework;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  evaluationType: string;
  lastEvaluated?: string;
  lastResult?: 'passed' | 'failed' | 'error' | 'skipped';
  passRate: number;
  evaluationCount: number;
  nextScheduledEvaluation?: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  score: number;
  message: string;
  details: Record<string, unknown>;
  evaluatedAt: string;
  duration: number;
}

interface RuleStatusProps {
  organizationId: string;
  framework?: ComplianceFramework;
  category?: string;
  onRuleSelect?: (rule: ComplianceRule) => void;
  onRuleEdit?: (rule: ComplianceRule) => void;
}

type SortField = 'name' | 'framework' | 'severity' | 'lastResult' | 'passRate';
type SortDirection = 'asc' | 'desc';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER = { failed: 0, error: 1, skipped: 2, passed: 3 };

export function RuleStatus({
  organizationId,
  framework,
  category,
  onRuleSelect,
  onRuleEdit,
}: RuleStatusProps) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('severity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [evaluating, setEvaluating] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId });
      if (framework) params.append('framework', framework);
      if (category) params.append('category', category);

      const response = await fetch(`/api/compliance/rules?${params}`);
      if (!response.ok) throw new Error('Failed to fetch rules');
      const data = await response.json();
      setRules(data.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, framework, category]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleToggleRule = async (rule: ComplianceRule) => {
    try {
      const response = await fetch(`/api/compliance/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });

      if (!response.ok) throw new Error('Failed to toggle rule');

      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule');
    }
  };

  const handleEvaluateSelected = async () => {
    if (selectedRules.size === 0) return;

    try {
      setEvaluating(true);
      const response = await fetch('/api/compliance/rules/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          ruleIds: Array.from(selectedRules),
        }),
      });

      if (!response.ok) throw new Error('Failed to evaluate rules');

      await fetchRules();
      setSelectedRules(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedRules.size === filteredRules.length) {
      setSelectedRules(new Set());
    } else {
      setSelectedRules(new Set(filteredRules.map((r) => r.id)));
    }
  };

  const handleSelectRule = (ruleId: string) => {
    const newSelected = new Set(selectedRules);
    if (newSelected.has(ruleId)) {
      newSelected.delete(ruleId);
    } else {
      newSelected.add(ruleId);
    }
    setSelectedRules(newSelected);
  };

  // Filter and sort rules
  const filteredRules = rules
    .filter((rule) => {
      if (statusFilter !== 'all' && rule.lastResult !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          rule.name.toLowerCase().includes(query) ||
          rule.description.toLowerCase().includes(query) ||
          rule.category.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'framework':
          comparison = a.framework.localeCompare(b.framework);
          break;
        case 'severity':
          comparison = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
          break;
        case 'lastResult':
          comparison =
            STATUS_ORDER[a.lastResult || 'skipped'] -
            STATUS_ORDER[b.lastResult || 'skipped'];
          break;
        case 'passRate':
          comparison = a.passRate - b.passRate;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Statistics
  const stats = {
    total: rules.length,
    enabled: rules.filter((r) => r.enabled).length,
    passed: rules.filter((r) => r.lastResult === 'passed').length,
    failed: rules.filter((r) => r.lastResult === 'failed').length,
    error: rules.filter((r) => r.lastResult === 'error').length,
  };

  if (loading) {
    return (
      <div className="rule-status loading">
        <div className="spinner" />
        <p>Loading rules...</p>
      </div>
    );
  }

  return (
    <div className="rule-status">
      {/* Header */}
      <header className="rule-status-header">
        <div className="stats-bar">
          <div className="stat">
            <span className="value">{stats.total}</span>
            <span className="label">Total Rules</span>
          </div>
          <div className="stat enabled">
            <span className="value">{stats.enabled}</span>
            <span className="label">Enabled</span>
          </div>
          <div className="stat passed">
            <span className="value">{stats.passed}</span>
            <span className="label">Passed</span>
          </div>
          <div className="stat failed">
            <span className="value">{stats.failed}</span>
            <span className="label">Failed</span>
          </div>
        </div>

        <div className="controls">
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="error">Error</option>
            <option value="skipped">Skipped</option>
          </select>

          {selectedRules.size > 0 && (
            <button
              onClick={handleEvaluateSelected}
              disabled={evaluating}
              className="btn btn-primary"
            >
              {evaluating ? 'Evaluating...' : `Evaluate (${selectedRules.size})`}
            </button>
          )}
        </div>
      </header>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Rules Table */}
      <div className="rules-table-container">
        <table className="rules-table">
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={selectedRules.size === filteredRules.length && filteredRules.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              <th
                className={`sortable ${sortField === 'name' ? 'sorted' : ''}`}
                onClick={() => handleSort('name')}
              >
                Rule Name
                {sortField === 'name' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th
                className={`sortable ${sortField === 'framework' ? 'sorted' : ''}`}
                onClick={() => handleSort('framework')}
              >
                Framework
                {sortField === 'framework' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th
                className={`sortable ${sortField === 'severity' ? 'sorted' : ''}`}
                onClick={() => handleSort('severity')}
              >
                Severity
                {sortField === 'severity' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th
                className={`sortable ${sortField === 'lastResult' ? 'sorted' : ''}`}
                onClick={() => handleSort('lastResult')}
              >
                Status
                {sortField === 'lastResult' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th
                className={`sortable ${sortField === 'passRate' ? 'sorted' : ''}`}
                onClick={() => handleSort('passRate')}
              >
                Pass Rate
                {sortField === 'passRate' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th>Enabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map((rule) => (
              <tr
                key={rule.id}
                className={`rule-row ${selectedRules.has(rule.id) ? 'selected' : ''}`}
                onClick={() => onRuleSelect?.(rule)}
              >
                <td className="select-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedRules.has(rule.id)}
                    onChange={() => handleSelectRule(rule.id)}
                  />
                </td>
                <td className="name-col">
                  <div className="rule-name">{rule.name}</div>
                  <div className="rule-description">{rule.description}</div>
                </td>
                <td>
                  <span className="framework-badge">{rule.framework}</span>
                </td>
                <td>
                  <span className={`severity-badge ${rule.severity}`}>
                    {rule.severity}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${rule.lastResult || 'unknown'}`}>
                    {rule.lastResult || 'Not evaluated'}
                  </span>
                </td>
                <td>
                  <div className="pass-rate">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${rule.passRate}%` }}
                      />
                    </div>
                    <span className="percentage">{rule.passRate}%</span>
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggleRule(rule)}
                    />
                    <span className="slider" />
                  </label>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="action-buttons">
                    <button
                      onClick={() => onRuleEdit?.(rule)}
                      className="btn btn-icon"
                      title="Edit rule"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={async () => {
                        setEvaluating(true);
                        try {
                          await fetch('/api/compliance/rules/evaluate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              organizationId,
                              ruleIds: [rule.id],
                            }),
                          });
                          await fetchRules();
                        } finally {
                          setEvaluating(false);
                        }
                      }}
                      className="btn btn-icon"
                      title="Evaluate rule"
                      disabled={evaluating}
                    >
                      ▶️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRules.length === 0 && (
        <div className="empty-state">
          <p>No rules found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}

export default RuleStatus;
