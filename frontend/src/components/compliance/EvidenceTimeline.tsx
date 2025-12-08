/**
 * Evidence Timeline Component
 * T195 - Display compliance evidence in timeline format
 *
 * Shows collected evidence with filtering and details
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface ComplianceEvidence {
  id: string;
  ruleId: string;
  ruleName: string;
  type: 'access_log' | 'process_execution' | 'approval_record' | 'document' | 'configuration' | 'audit_log';
  source: string;
  collectedAt: string;
  expiresAt?: string;
  data: Record<string, unknown>;
  metadata: {
    collector: string;
    version: string;
    hash?: string;
  };
  status: 'valid' | 'expired' | 'archived';
  framework?: ComplianceFramework;
}

export interface EvidenceCollection {
  id: string;
  name: string;
  description: string;
  evidenceCount: number;
  startDate: string;
  endDate: string;
  status: 'collecting' | 'complete' | 'failed';
}

interface EvidenceTimelineProps {
  organizationId: string;
  framework?: ComplianceFramework;
  ruleId?: string;
  startDate?: Date;
  endDate?: Date;
  onEvidenceSelect?: (evidence: ComplianceEvidence) => void;
}

type ViewMode = 'timeline' | 'list' | 'grouped';
type EvidenceType = 'all' | ComplianceEvidence['type'];

const EVIDENCE_TYPE_OPTIONS: { value: EvidenceType; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'access_log', label: 'Access Logs' },
  { value: 'process_execution', label: 'Process Executions' },
  { value: 'approval_record', label: 'Approval Records' },
  { value: 'document', label: 'Documents' },
  { value: 'configuration', label: 'Configurations' },
  { value: 'audit_log', label: 'Audit Logs' },
];

const EVIDENCE_TYPE_ICONS: Record<ComplianceEvidence['type'], string> = {
  access_log: '🔐',
  process_execution: '⚙️',
  approval_record: '✅',
  document: '📄',
  configuration: '🔧',
  audit_log: '📋',
};

export function EvidenceTimeline({
  organizationId,
  framework,
  ruleId,
  startDate,
  endDate,
  onEvidenceSelect,
}: EvidenceTimelineProps) {
  const [evidence, setEvidence] = useState<ComplianceEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [typeFilter, setTypeFilter] = useState<EvidenceType>('all');
  const [selectedEvidence, setSelectedEvidence] = useState<ComplianceEvidence | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: startDate?.toISOString().split('T')[0] || '',
    end: endDate?.toISOString().split('T')[0] || '',
  });

  const fetchEvidence = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId });
      if (framework) params.append('framework', framework);
      if (ruleId) params.append('ruleId', ruleId);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (dateRange.start) params.append('startDate', dateRange.start);
      if (dateRange.end) params.append('endDate', dateRange.end);

      const response = await fetch(`/api/compliance/evidence?${params}`);
      if (!response.ok) throw new Error('Failed to fetch evidence');
      const data = await response.json();
      setEvidence(data.evidence);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, framework, ruleId, typeFilter, dateRange]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  const handleCollectEvidence = async () => {
    try {
      const response = await fetch('/api/compliance/evidence/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          framework,
          ruleId,
        }),
      });

      if (!response.ok) throw new Error('Failed to start evidence collection');
      await fetchEvidence();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Collection failed');
    }
  };

  const handleArchiveEvidence = async (evidenceId: string) => {
    try {
      const response = await fetch(`/api/compliance/evidence/${evidenceId}/archive`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to archive evidence');
      await fetchEvidence();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    }
  };

  // Group evidence by date for timeline view
  const groupedByDate = evidence.reduce<Record<string, ComplianceEvidence[]>>((acc, item) => {
    const date = new Date(item.collectedAt).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  // Group evidence by type for grouped view
  const groupedByType = evidence.reduce<Record<string, ComplianceEvidence[]>>((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  // Statistics
  const stats = {
    total: evidence.length,
    byType: EVIDENCE_TYPE_OPTIONS.slice(1).map((opt) => ({
      type: opt.value,
      label: opt.label,
      count: evidence.filter((e) => e.type === opt.value).length,
    })),
    valid: evidence.filter((e) => e.status === 'valid').length,
    expired: evidence.filter((e) => e.status === 'expired').length,
  };

  if (loading) {
    return (
      <div className="evidence-timeline loading">
        <div className="spinner" />
        <p>Loading evidence...</p>
      </div>
    );
  }

  return (
    <div className="evidence-timeline">
      {/* Header */}
      <header className="evidence-header">
        <div className="stats-summary">
          <div className="stat">
            <span className="value">{stats.total}</span>
            <span className="label">Total Evidence</span>
          </div>
          <div className="stat valid">
            <span className="value">{stats.valid}</span>
            <span className="label">Valid</span>
          </div>
          <div className="stat expired">
            <span className="value">{stats.expired}</span>
            <span className="label">Expired</span>
          </div>
        </div>

        <div className="header-actions">
          <button onClick={handleCollectEvidence} className="btn btn-primary">
            Collect Evidence
          </button>
        </div>
      </header>

      {/* Filters and View Controls */}
      <div className="evidence-controls">
        <div className="filters">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as EvidenceType)}
            className="type-filter"
          >
            {EVIDENCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="date-input"
            placeholder="Start date"
          />
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="date-input"
            placeholder="End date"
          />
        </div>

        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
            title="Timeline view"
          >
            📅
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            📋
          </button>
          <button
            className={`view-btn ${viewMode === 'grouped' ? 'active' : ''}`}
            onClick={() => setViewMode('grouped')}
            title="Grouped view"
          >
            📊
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Evidence Display */}
      <div className="evidence-content">
        {evidence.length === 0 ? (
          <div className="empty-state">
            <p>No evidence found for the selected criteria.</p>
            <button onClick={handleCollectEvidence} className="btn btn-primary">
              Start Collection
            </button>
          </div>
        ) : viewMode === 'timeline' ? (
          <div className="timeline-view">
            {Object.entries(groupedByDate)
              .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
              .map(([date, items]) => (
                <div key={date} className="timeline-day">
                  <div className="timeline-date">
                    <span className="date">{date}</span>
                    <span className="count">{items.length} items</span>
                  </div>
                  <div className="timeline-items">
                    {items.map((item) => (
                      <EvidenceCard
                        key={item.id}
                        evidence={item}
                        onSelect={() => {
                          setSelectedEvidence(item);
                          onEvidenceSelect?.(item);
                        }}
                        onArchive={() => handleArchiveEvidence(item.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : viewMode === 'grouped' ? (
          <div className="grouped-view">
            {Object.entries(groupedByType).map(([type, items]) => (
              <div key={type} className="evidence-group">
                <h3 className="group-header">
                  <span className="icon">{EVIDENCE_TYPE_ICONS[type as ComplianceEvidence['type']]}</span>
                  {EVIDENCE_TYPE_OPTIONS.find((o) => o.value === type)?.label || type}
                  <span className="count">({items.length})</span>
                </h3>
                <div className="group-items">
                  {items.map((item) => (
                    <EvidenceCard
                      key={item.id}
                      evidence={item}
                      onSelect={() => {
                        setSelectedEvidence(item);
                        onEvidenceSelect?.(item);
                      }}
                      onArchive={() => handleArchiveEvidence(item.id)}
                      compact
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="list-view">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Rule</th>
                  <th>Source</th>
                  <th>Collected</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item) => (
                  <tr
                    key={item.id}
                    className={`evidence-row ${item.status}`}
                    onClick={() => {
                      setSelectedEvidence(item);
                      onEvidenceSelect?.(item);
                    }}
                  >
                    <td>
                      <span className="type-icon">
                        {EVIDENCE_TYPE_ICONS[item.type]}
                      </span>
                      {item.type.replace('_', ' ')}
                    </td>
                    <td>{item.ruleName}</td>
                    <td>{item.source}</td>
                    <td>{new Date(item.collectedAt).toLocaleString()}</td>
                    <td>
                      <span className={`status-badge ${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleArchiveEvidence(item.id)}
                        className="btn btn-small"
                        disabled={item.status === 'archived'}
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evidence Detail Modal */}
      {selectedEvidence && (
        <EvidenceDetailModal
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
          onArchive={() => {
            handleArchiveEvidence(selectedEvidence.id);
            setSelectedEvidence(null);
          }}
        />
      )}
    </div>
  );
}

// Evidence Card Component
interface EvidenceCardProps {
  evidence: ComplianceEvidence;
  onSelect: () => void;
  onArchive: () => void;
  compact?: boolean;
}

function EvidenceCard({ evidence, onSelect, onArchive, compact }: EvidenceCardProps) {
  return (
    <div
      className={`evidence-card ${evidence.status} ${compact ? 'compact' : ''}`}
      onClick={onSelect}
    >
      <div className="card-header">
        <span className="type-icon">{EVIDENCE_TYPE_ICONS[evidence.type]}</span>
        <span className="type-label">{evidence.type.replace('_', ' ')}</span>
        <span className={`status-badge ${evidence.status}`}>{evidence.status}</span>
      </div>

      <div className="card-content">
        <h4 className="rule-name">{evidence.ruleName}</h4>
        <p className="source">Source: {evidence.source}</p>
        {!compact && (
          <p className="collected">
            Collected: {new Date(evidence.collectedAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        <button onClick={onSelect} className="btn btn-small">
          View
        </button>
        {evidence.status !== 'archived' && (
          <button onClick={onArchive} className="btn btn-small btn-secondary">
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

// Evidence Detail Modal
interface EvidenceDetailModalProps {
  evidence: ComplianceEvidence;
  onClose: () => void;
  onArchive: () => void;
}

function EvidenceDetailModal({ evidence, onClose, onArchive }: EvidenceDetailModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal evidence-detail-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            <span className="type-icon">{EVIDENCE_TYPE_ICONS[evidence.type]}</span>
            Evidence Details
          </h2>
          <button onClick={onClose} className="close-btn">×</button>
        </header>

        <div className="modal-content">
          <div className="detail-section">
            <h3>General Information</h3>
            <dl>
              <dt>ID</dt>
              <dd><code>{evidence.id}</code></dd>
              <dt>Type</dt>
              <dd>{evidence.type.replace('_', ' ')}</dd>
              <dt>Rule</dt>
              <dd>{evidence.ruleName}</dd>
              <dt>Source</dt>
              <dd>{evidence.source}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`status-badge ${evidence.status}`}>
                  {evidence.status}
                </span>
              </dd>
            </dl>
          </div>

          <div className="detail-section">
            <h3>Timestamps</h3>
            <dl>
              <dt>Collected</dt>
              <dd>{new Date(evidence.collectedAt).toLocaleString()}</dd>
              {evidence.expiresAt && (
                <>
                  <dt>Expires</dt>
                  <dd>{new Date(evidence.expiresAt).toLocaleString()}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="detail-section">
            <h3>Metadata</h3>
            <dl>
              <dt>Collector</dt>
              <dd>{evidence.metadata.collector}</dd>
              <dt>Version</dt>
              <dd>{evidence.metadata.version}</dd>
              {evidence.metadata.hash && (
                <>
                  <dt>Hash</dt>
                  <dd><code>{evidence.metadata.hash}</code></dd>
                </>
              )}
            </dl>
          </div>

          <div className="detail-section">
            <h3>Evidence Data</h3>
            <pre className="data-preview">
              {JSON.stringify(evidence.data, null, 2)}
            </pre>
          </div>
        </div>

        <footer className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
          {evidence.status !== 'archived' && (
            <button onClick={onArchive} className="btn btn-primary">
              Archive Evidence
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export default EvidenceTimeline;
