/**
 * Violation List Component
 * T194 - Display and manage compliance violations
 *
 * Shows violations with filtering, assignment, and resolution
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface ComplianceViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  framework: ComplianceFramework;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'accepted' | 'false_positive';
  description: string;
  details: Record<string, unknown>;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  evidence: Array<{ id: string; type: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationStatistics {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  bySeverity: Record<string, number>;
  byFramework: Record<string, number>;
  overdue: number;
}

interface ViolationListProps {
  organizationId: string;
  framework?: ComplianceFramework;
  ruleId?: string;
  onViolationSelect?: (violation: ComplianceViolation) => void;
}

type StatusType = 'all' | 'open' | 'in_progress' | 'resolved' | 'accepted' | 'false_positive';
type SeverityType = 'all' | 'critical' | 'high' | 'medium' | 'low';

const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'accepted', label: 'Risk Accepted' },
  { value: 'false_positive', label: 'False Positive' },
];

const SEVERITY_OPTIONS: { value: SeverityType; label: string }[] = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function ViolationList({
  organizationId,
  framework,
  ruleId,
  onViolationSelect,
}: ViolationListProps) {
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [statistics, setStatistics] = useState<ViolationStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusType>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedViolation, setSelectedViolation] = useState<ComplianceViolation | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);

  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId });
      if (framework) params.append('framework', framework);
      if (ruleId) params.append('ruleId', ruleId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (severityFilter !== 'all') params.append('severity', severityFilter);

      const [violationsRes, statsRes] = await Promise.all([
        fetch(`/api/compliance/violations?${params}`),
        fetch(`/api/compliance/violations/statistics?${params}`),
      ]);

      if (!violationsRes.ok) throw new Error('Failed to fetch violations');

      const violationsData = await violationsRes.json();
      setViolations(violationsData.violations);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStatistics(statsData.statistics);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, framework, ruleId, statusFilter, severityFilter]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const handleUpdateStatus = async (
    violationId: string,
    status: ComplianceViolation['status'],
    notes?: string
  ) => {
    try {
      const response = await fetch(`/api/compliance/violations/${violationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      await fetchViolations();
      setShowResolveDialog(false);
      setSelectedViolation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleAssign = async (violationId: string, assigneeId: string) => {
    try {
      const response = await fetch(`/api/compliance/violations/${violationId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      });

      if (!response.ok) throw new Error('Failed to assign violation');

      await fetchViolations();
      setShowAssignDialog(false);
      setSelectedViolation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    }
  };

  const handleResolve = async (violationId: string, notes: string) => {
    try {
      const response = await fetch(`/api/compliance/violations/${violationId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes: notes }),
      });

      if (!response.ok) throw new Error('Failed to resolve violation');

      await fetchViolations();
      setShowResolveDialog(false);
      setSelectedViolation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    }
  };

  // Filter violations by search
  const filteredViolations = violations.filter((v) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      v.ruleName.toLowerCase().includes(query) ||
      v.description.toLowerCase().includes(query) ||
      v.id.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="violation-list loading">
        <div className="spinner" />
        <p>Loading violations...</p>
      </div>
    );
  }

  return (
    <div className="violation-list">
      {/* Statistics Header */}
      {statistics && (
        <div className="violation-stats">
          <div className="stat total">
            <span className="value">{statistics.total}</span>
            <span className="label">Total</span>
          </div>
          <div className="stat open">
            <span className="value">{statistics.open}</span>
            <span className="label">Open</span>
          </div>
          <div className="stat in-progress">
            <span className="value">{statistics.inProgress}</span>
            <span className="label">In Progress</span>
          </div>
          <div className="stat overdue">
            <span className="value">{statistics.overdue}</span>
            <span className="label">Overdue</span>
          </div>
          <div className="severity-breakdown">
            {Object.entries(statistics.bySeverity).map(([severity, count]) => (
              <span key={severity} className={`severity-count ${severity}`}>
                {severity}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="violation-filters">
        <input
          type="text"
          placeholder="Search violations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusType)}
          className="filter-select"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityType)}
          className="filter-select"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button onClick={fetchViolations} className="btn btn-secondary">
          Refresh
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Violations List */}
      <div className="violations-container">
        {filteredViolations.length === 0 ? (
          <div className="empty-state">
            <p>No violations found matching your criteria.</p>
          </div>
        ) : (
          <div className="violation-cards">
            {filteredViolations.map((violation) => (
              <div
                key={violation.id}
                className={`violation-card ${violation.severity} ${violation.status}`}
                onClick={() => {
                  setSelectedViolation(violation);
                  onViolationSelect?.(violation);
                }}
              >
                <div className="violation-header">
                  <span className={`severity-badge ${violation.severity}`}>
                    {violation.severity}
                  </span>
                  <span className={`status-badge ${violation.status}`}>
                    {violation.status.replace('_', ' ')}
                  </span>
                  <span className="framework-badge">{violation.framework}</span>
                </div>

                <h4 className="violation-rule">{violation.ruleName}</h4>
                <p className="violation-description">{violation.description}</p>

                <div className="violation-meta">
                  <span className="created">
                    Created: {new Date(violation.createdAt).toLocaleDateString()}
                  </span>
                  {violation.dueDate && (
                    <span
                      className={`due-date ${
                        new Date(violation.dueDate) < new Date() ? 'overdue' : ''
                      }`}
                    >
                      Due: {new Date(violation.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {violation.assigneeName && (
                    <span className="assignee">
                      Assigned to: {violation.assigneeName}
                    </span>
                  )}
                </div>

                {violation.evidence.length > 0 && (
                  <div className="evidence-count">
                    {violation.evidence.length} evidence item(s)
                  </div>
                )}

                <div className="violation-actions" onClick={(e) => e.stopPropagation()}>
                  {violation.status === 'open' && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedViolation(violation);
                          setShowAssignDialog(true);
                        }}
                        className="btn btn-small"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(violation.id, 'in_progress')}
                        className="btn btn-small btn-primary"
                      >
                        Start
                      </button>
                    </>
                  )}
                  {violation.status === 'in_progress' && (
                    <button
                      onClick={() => {
                        setSelectedViolation(violation);
                        setShowResolveDialog(true);
                      }}
                      className="btn btn-small btn-success"
                    >
                      Resolve
                    </button>
                  )}
                  <button
                    onClick={() => handleUpdateStatus(violation.id, 'false_positive')}
                    className="btn btn-small btn-link"
                  >
                    False Positive
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve Dialog */}
      {showResolveDialog && selectedViolation && (
        <ResolveDialog
          violation={selectedViolation}
          onResolve={handleResolve}
          onCancel={() => {
            setShowResolveDialog(false);
            setSelectedViolation(null);
          }}
        />
      )}

      {/* Assign Dialog */}
      {showAssignDialog && selectedViolation && (
        <AssignDialog
          violation={selectedViolation}
          organizationId={organizationId}
          onAssign={handleAssign}
          onCancel={() => {
            setShowAssignDialog(false);
            setSelectedViolation(null);
          }}
        />
      )}
    </div>
  );
}

// Resolve Dialog Component
interface ResolveDialogProps {
  violation: ComplianceViolation;
  onResolve: (violationId: string, notes: string) => void;
  onCancel: () => void;
}

function ResolveDialog({ violation, onResolve, onCancel }: ResolveDialogProps) {
  const [notes, setNotes] = useState('');

  return (
    <div className="dialog-overlay">
      <div className="dialog resolve-dialog">
        <h3>Resolve Violation</h3>
        <p className="violation-info">
          <strong>{violation.ruleName}</strong>
          <br />
          {violation.description}
        </p>

        <div className="form-group">
          <label htmlFor="resolution-notes">Resolution Notes</label>
          <textarea
            id="resolution-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe how the violation was resolved..."
            rows={4}
            required
          />
        </div>

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onResolve(violation.id, notes)}
            className="btn btn-success"
            disabled={!notes.trim()}
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}

// Assign Dialog Component
interface AssignDialogProps {
  violation: ComplianceViolation;
  organizationId: string;
  onAssign: (violationId: string, assigneeId: string) => void;
  onCancel: () => void;
}

function AssignDialog({ violation, organizationId, onAssign, onCancel }: AssignDialogProps) {
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch(`/api/organizations/${organizationId}/users`);
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [organizationId]);

  return (
    <div className="dialog-overlay">
      <div className="dialog assign-dialog">
        <h3>Assign Violation</h3>
        <p className="violation-info">
          <strong>{violation.ruleName}</strong>
        </p>

        {loading ? (
          <p>Loading users...</p>
        ) : (
          <div className="form-group">
            <label htmlFor="assignee">Assign to</label>
            <select
              id="assignee"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="">Select a user...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onAssign(violation.id, selectedUser)}
            className="btn btn-primary"
            disabled={!selectedUser}
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

export default ViolationList;
